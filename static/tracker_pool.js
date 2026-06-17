// tracker_pool.js
// Manages one PresenceStateMachine per tracked face.
// Owns the CONFIRMING mutex — only one face confirms at a time.

class TrackerPool {
  constructor() {
    this._machines = new Map(); // faceId → PresenceStateMachine
    this._confirmingLock = null; // faceId holding the mutex, or null
    this._nextId = 0;
  }

  // ------------------------------------------------------------------
  // Main entry point — call once per frame with /recognize response
  // ------------------------------------------------------------------

  /**
   * Feed one frame's recognition result into the pool.
   * @param {string|null} name        - recognized name from /recognize
   * @param {number|null} confidence  - confidence from /recognize
   * @returns {string|null}           - clocked name if event fires, else null
   */
  update(name, confidence) {
    this._reconcile(name);
    this._auditLock();
    this._tryGrantLock();
    return this._tickAll(name, confidence);
  }

  updateLiveness(landmarks) {
    for (const [faceId, machine] of this._machines) {
      if (machine.state === ScannerState.LIVENESS) {
        machine.tickLiveness(landmarks);
        // check if blink caused transition to CONFIRMING
        if (machine.state === ScannerState.CONFIRMING) {
          console.log(`[Pool] Liveness passed for ${machine.name}`);
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Machine lifecycle
  // ------------------------------------------------------------------

  /**
   * Spawn a machine for a newly seen name.
   * Retire machines whose person is no longer in frame.
   * Note: we only track one face at a time from /recognize for now
   * since Flask returns one best match per frame.
   */
  _reconcile(name) {
    const activeName = name || null;

    // Retire machines not in frame — skip CLOCKED ones (still cooling down)
    for (const [faceId, machine] of this._machines) {
      if (machine.state === ScannerState.CLOCKED) continue;
      if (machine.name !== activeName) {
        this._retire(faceId);
      }
    }

    // Spawn a machine for a newly seen name
    if (activeName) {
      const alreadyTracked = [...this._machines.values()].some(
        (m) => m.name === activeName,
      );

      if (!alreadyTracked) {
        this._spawn(activeName);
      }
    }
  }

  _spawn(name) {
    const faceId = `face_${this._nextId++}`;
    const machine = new PresenceStateMachine(faceId);
    machine.name = name;
    this._machines.set(faceId, machine);
    console.log(`[Pool] Spawned ${faceId} for ${name}`);
    return faceId;
  }

  _retire(faceId) {
    if (this._confirmingLock === faceId) {
      this._confirmingLock = null;
      console.log(`[Pool] Lock released — ${faceId} left frame`);
    }
    console.log(`[Pool] Retired ${faceId}`);
    this._machines.delete(faceId);
  }

  // ------------------------------------------------------------------
  // Mutex management
  // ------------------------------------------------------------------

  /** Release lock if holder regressed out of CONFIRMING. */
  _auditLock() {
    if (!this._confirmingLock) return;
    const holder = this._machines.get(this._confirmingLock);
    if (
      !holder ||
      ![ScannerState.LIVENESS, ScannerState.CONFIRMING].includes(holder.state)
    ) {
      console.log(`[Pool] Lock auto-released from ${this._confirmingLock}`);
      this._confirmingLock = null;
    }
  }

  /** Grant CONFIRMING lock to the first eligible machine. */
  _tryGrantLock() {
    if (this._confirmingLock) return;

    for (const [faceId, machine] of this._machines) {
      // APPROACH → LIVENESS
      if (
        machine.wantsLivenessCheck &&
        machine.state === ScannerState.APPROACH
      ) {
        this._confirmingLock = faceId;
        machine._transition(ScannerState.LIVENESS);
        machine._eyeClosedFrames = 0;
        machine._blinkDetected = false;
        console.log(`[Pool] Liveness started for ${machine.name}`);
        break;
      }
      // LIVENESS → CONFIRMING (handled inside machine, lock stays)
    }
  }

  // ------------------------------------------------------------------
  // Tick
  // ------------------------------------------------------------------

  _tickAll(name, confidence, landmarks) {
    for (const [faceId, machine] of this._machines) {
      const frameMatch = machine.name === name;
      const clocked = machine.update(
        frameMatch ? name : null,
        frameMatch ? confidence : null,
        frameMatch ? landmarks : null,
      );
      if (clocked) return clocked;
    }
    return null;
  }

  update(name, confidence, landmarks = null) {
    this._reconcile(name);
    this._auditLock();
    this._tryGrantLock();
    return this._tickAll(name, confidence, landmarks);
  }

  // ------------------------------------------------------------------
  // Debug — current state of all machines
  // ------------------------------------------------------------------

  snapshot() {
    return [...this._machines.values()].map((m) => ({
      faceId: m.faceId,
      name: m.name,
      state: m.state,
      confidence: m.avgConfidence().toFixed(2),
      confirmProgress: m.confirmProgress, // 0.0 → 1.0
    }));
  }
}
