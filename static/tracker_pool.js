// tracker_pool.js
// Manages one PresenceStateMachine per tracked face.
// Owns the liveness/confirming mutex so only one face clocks at a time.

class TrackerPool {
  constructor() {
    this._machines = new Map();
    this._confirmingLock = null;
    this._nextId = 0;
  }

  /**
   * Feed one browser-side match result into the pool.
   * @param {string|null} name        - browser-matched name
   * @param {number|null} confidence  - browser match confidence
   * @param {object|null} landmarks   - face-api.js landmarks for liveness
   * @returns {string|null}           - clocked name if event fires, else null
   */
  update(name, confidence, landmarks = null) {
    this._reconcile(name);
    this._auditLock();
    this._tryGrantLock();
    return this._tickAll(name, confidence, landmarks);
  }

  updateLiveness(landmarks) {
    for (const [, machine] of this._machines) {
      if (machine.state === ScannerState.LIVENESS) {
        machine.tickLiveness(landmarks);
        if (machine.state === ScannerState.CONFIRMING) {
          console.log(`[Pool] Liveness passed for ${machine.name}`);
        }
      }
    }
  }

  _reconcile(name) {
    const activeName = name || null;

    for (const [faceId, machine] of this._machines) {
      if (machine.state === ScannerState.CLOCKED) continue;
      if (machine.name !== activeName) {
        this._retire(faceId);
      }
    }

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
      console.log(`[Pool] Lock released - ${faceId} left frame`);
    }
    console.log(`[Pool] Retired ${faceId}`);
    this._machines.delete(faceId);
  }

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

  _tryGrantLock() {
    if (this._confirmingLock) return;

    for (const [faceId, machine] of this._machines) {
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
    }
  }

  _tickAll(name, confidence, landmarks) {
    for (const [, machine] of this._machines) {
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

  snapshot() {
    return [...this._machines.values()].map((m) => ({
      faceId: m.faceId,
      name: m.name,
      state: m.state,
      confidence: m.avgConfidence().toFixed(2),
      confirmProgress: m.confirmProgress,
    }));
  }
}
