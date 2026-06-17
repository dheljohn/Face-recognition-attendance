// presence_state_machine.js
// Port of the Python PresenceStateMachine — same states, same logic.

const ScannerState = Object.freeze({
  IDLE: "IDLE",
  APPROACH: "APPROACH",
  LIVENESS: "LIVENESS",
  CONFIRMING: "CONFIRMING",
  CLOCKED: "CLOCKED",
});

function computeEAR(landmarks) {
  // face-api returns 68-point landmarks
  // left eye:  points 36-41
  // right eye: points 42-47
  const pts = landmarks.positions;

  function eyeEAR(p1, p2, p3, p4, p5, p6) {
    const A = dist(pts[p2], pts[p6]);
    const B = dist(pts[p3], pts[p5]);
    const C = dist(pts[p1], pts[p4]);
    return (A + B) / (2.0 * C);
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  const leftEAR = eyeEAR(36, 37, 38, 39, 40, 41);
  const rightEAR = eyeEAR(42, 43, 44, 45, 46, 47);
  return (leftEAR + rightEAR) / 2;
}
class PresenceStateMachine {
  static STABLE_DURATION = 1.5; // was 0.5 — accounts for slow Flask response time
  static CONFIRM_DURATION = 3.0; // was 2.0 — give more time to accumulate frames
  static COOLDOWN_DURATION = 3.0; // seconds in CLOCKED before returning to IDLE
  static CONFIDENCE_THRESHOLD = 0.55; //was 0.60

  static LIVENESS_TIMEOUT = 5.0; // seconds to blink before reset
  static EAR_THRESHOLD = 0.25; // eye aspect ratio below this = closed
  static BLINK_FRAMES = 2; // consecutive closed frames = blink

  constructor(faceId) {
    this.faceId = faceId;
    this.name = null; // set once a recognized name is seen
    this.state = ScannerState.IDLE;
    this._enteredAt = null; // timestamp (ms) of last state transition
    this._confidenceAccum = []; // confidence samples collected this state

    this._eyeClosedFrames = 0;
    this._blinkDetected = false;
  }

  // ------------------------------------------------------------------
  // Public — called every frame by TrackerPool
  // ------------------------------------------------------------------

  /**
   * Feed one frame result into the machine.
   * @param {string|null} name          - recognized name this frame
   * @param {number|null} confidence    - 1 - distance, or null
   * @returns {string|null}             - clocked name if event fires, else null
   */
  tickLiveness(landmarks) {
    if (this.state !== ScannerState.LIVENESS) return;

    // Timeout check
    if (this._elapsedSeconds() >= PresenceStateMachine.LIVENESS_TIMEOUT) {
      this._transition(ScannerState.IDLE);
      this.name = null;
      this._eyeClosedFrames = 0;
      this._blinkDetected = false;
      return;
    }

    if (!landmarks) return;

    const ear = computeEAR(landmarks);

    if (ear < PresenceStateMachine.EAR_THRESHOLD) {
      this._eyeClosedFrames++;
    } else {
      if (this._eyeClosedFrames >= PresenceStateMachine.BLINK_FRAMES) {
        this._blinkDetected = true;
      }
      this._eyeClosedFrames = 0;
    }

    if (this._blinkDetected) {
      this._eyeClosedFrames = 0;
      this._blinkDetected = false;
      this._transition(ScannerState.CONFIRMING);
    }
  }
  update(name, confidence, landmarks) {
    // landmarks is new param
    switch (this.state) {
      case ScannerState.IDLE:
        this._handleIdle(name, confidence);
        break;
      case ScannerState.APPROACH:
        this._handleApproach(name, confidence);
        break;
      case ScannerState.LIVENESS:
        return this._handleLiveness(name, confidence, landmarks);
      case ScannerState.CONFIRMING:
        return this._handleConfirming(name, confidence);
      case ScannerState.CLOCKED:
        this._handleClocked();
        break;
    }
    return null;
  }

  _handleApproach(name, confidence) {
    if (!name || confidence < PresenceStateMachine.CONFIDENCE_THRESHOLD) {
      this.name = null;
      this._confidenceAccum = [];
      this._transition(ScannerState.IDLE);
      return;
    }
    this._confidenceAccum.push(confidence);
  }

  _handleLiveness(name, confidence, landmarks) {
    if (!name || confidence < PresenceStateMachine.CONFIDENCE_THRESHOLD) {
      this._transition(ScannerState.IDLE);
      this.name = null;
      this._eyeClosedFrames = 0;
      this._blinkDetected = false;
      return null;
    }
    // blink detection handled by tickLiveness() called every frame
    return null;
  }

  // wantsLivenessCheck replaces wantsConfirmingLock for APPROACH→LIVENESS
  get wantsLivenessCheck() {
    if (this.state !== ScannerState.APPROACH || !this._enteredAt) return false;
    return this._elapsedSeconds() >= PresenceStateMachine.STABLE_DURATION;
  }

  /** True when this machine has been stable long enough to want the lock. */
  // get wantsConfirmingLock() {
  //   if (this.state !== ScannerState.APPROACH || !this._enteredAt) return false;
  //   return this._elapsedSeconds() >= PresenceStateMachine.STABLE_DURATION;
  // }

  get confirmProgress() {
    if (this.state !== ScannerState.CONFIRMING || !this._enteredAt) return 0;
    return Math.min(
      this._elapsedSeconds() / PresenceStateMachine.CONFIRM_DURATION,
      1.0,
    );
  }

  avgConfidence() {
    if (!this._confidenceAccum.length) return 0;
    return (
      this._confidenceAccum.reduce((a, b) => a + b, 0) /
      this._confidenceAccum.length
    );
  }

  // ------------------------------------------------------------------
  // State handlers
  // ------------------------------------------------------------------

  _handleIdle(name, confidence) {
    if (name && confidence >= PresenceStateMachine.CONFIDENCE_THRESHOLD) {
      this.name = name;
      this._confidenceAccum = [confidence];
      this._transition(ScannerState.APPROACH);
    }
  }

  _handleConfirming(name, confidence) {
    if (!name || confidence < PresenceStateMachine.CONFIDENCE_THRESHOLD) {
      // regressed — drop back to APPROACH, release lock implicitly
      this._confidenceAccum = [];
      this._transition(ScannerState.APPROACH);
      return null;
    }

    this._confidenceAccum.push(confidence);

    if (this._elapsedSeconds() >= PresenceStateMachine.CONFIRM_DURATION) {
      const clocked = this.name;
      this._transition(ScannerState.CLOCKED);
      return clocked;
    }

    return null;
  }

  _handleClocked() {
    if (this._elapsedSeconds() >= PresenceStateMachine.COOLDOWN_DURATION) {
      this.name = null;
      this._confidenceAccum = [];
      this._transition(ScannerState.IDLE);
    }
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  _transition(newState) {
    this.state = newState;
    this._enteredAt = performance.now();
    this._confidenceAccum = [];
  }

  _elapsedSeconds() {
    if (!this._enteredAt) return 0;
    return (performance.now() - this._enteredAt) / 1000;
  }
}
