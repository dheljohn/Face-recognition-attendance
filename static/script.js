// script.js - camera loop wired into TrackerPool + PresenceStateMachine

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const guideBox = document.getElementById("guide-box");

const pool = new TrackerPool();

let detectionLoopRunning = false;
let latestLandmarks = null;
let faceMatcher = null;
let knownFaceCount = 0;
let lastMatchAt = 0;

const MATCH_INTERVAL = 300;

function setStatus(text, cls = "text-muted small") {
  if (!statusEl) return;
  const statusText = statusEl.querySelector(".status-text");
  const statusIndicator = statusEl.querySelector(".status-indicator");

  if (statusText) {
    statusText.textContent = text;
  } else {
    statusEl.textContent = text;
  }

  statusEl.className = cls;

  if (statusIndicator) {
    statusIndicator.className = "status-indicator";
    if (text.includes("Ready")) {
      statusIndicator.style.background = "#4bf542";
      statusIndicator.classList.add("pulse");
    } else if (text.includes("Error")) {
      statusIndicator.style.background = "#d40f3d";
    } else {
      statusIndicator.style.background = "#ffc107";
      statusIndicator.classList.add("pulse");
    }
  }
}

function showResult(message, success = true) {
  if (!resultEl) return;
  const cls = success
    ? "alert alert-success small fade-in"
    : "alert alert-warning small fade-in";
  const icon = success ? "OK" : "!";
  resultEl.innerHTML = `<div class="${cls}" role="alert">
    <strong>${icon}</strong> ${message}
  </div>`;

  if (success) {
    setTimeout(() => {
      if (resultEl.innerHTML.includes(message)) resultEl.innerHTML = "";
    }, 5000);
  }
}

function updateGuide(detections) {
  if (overlay) {
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (detections?.length) {
      const rawDetections = detections.map((d) => d.detection);
      const resized = faceapi.resizeResults(rawDetections, {
        width: overlay.width,
        height: overlay.height,
      });
      faceapi.draw.drawDetections(overlay, resized);
    }
  }

  if (!guideBox) return;
  const machines = pool.snapshot();

  if (!machines.length) {
    guideBox.style.display = "none";
    return;
  }

  const m = machines[0];

  switch (m.state) {
    case ScannerState.IDLE:
      guideBox.style.display = "none";
      break;
    case ScannerState.APPROACH:
      guideBox.style.display = "block";
      guideBox.style.background = "rgba(255, 193, 7, 0.85)";
      guideBox.style.color = "#000";
      guideBox.textContent = "Hold still...";
      break;
    case ScannerState.CONFIRMING: {
      const filled = Math.round(m.confirmProgress * 5);
      const dots = "●".repeat(filled) + "○".repeat(5 - filled);
      guideBox.style.display = "block";
      guideBox.style.background = "rgba(40, 167, 69, 0.85)";
      guideBox.style.color = "#fff";
      guideBox.textContent = `Scanning... ${dots}`;
      break;
    }
    case ScannerState.LIVENESS:
      guideBox.style.display = "block";
      guideBox.style.background = "rgba(111, 66, 193, 0.85)";
      guideBox.style.color = "#fff";
      guideBox.textContent = "Please blink...";
      break;
    case ScannerState.CLOCKED:
      guideBox.style.display = "block";
      guideBox.style.background = "rgba(13, 110, 253, 0.85)";
      guideBox.style.color = "#fff";
      guideBox.textContent = "Clocked!";
      break;
  }
}

async function loadKnownFaces() {
  const resp = await fetch("/known-faces");
  if (!resp.ok) throw new Error("Could not load registered faces.");

  const faces = await resp.json();
  const labeledDescriptors = faces
    .filter((face) => Array.isArray(face.encoding) && face.encoding.length === 128)
    .map(
      (face) =>
        new faceapi.LabeledFaceDescriptors(face.name, [
          new Float32Array(face.encoding),
        ]),
    );

  knownFaceCount = labeledDescriptors.length;
  faceMatcher = knownFaceCount
    ? new faceapi.FaceMatcher(labeledDescriptors, PresenceStateMachine.CONFIDENCE_THRESHOLD)
    : null;
}

function matchDetection(detection) {
  if (!faceMatcher || !detection?.descriptor) {
    return { name: null, confidence: null };
  }

  const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
  if (bestMatch.label === "unknown") {
    return { name: null, confidence: null };
  }

  return {
    name: bestMatch.label,
    confidence: Number((1 - bestMatch.distance).toFixed(4)),
  };
}

async function clockEvent(name) {
  try {
    const resp = await fetch("/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    const { message } = await resp.json();
    showResult(message, resp.ok);
  } catch (err) {
    console.error("[Clock] fetch error:", err);
    showResult("Clock event failed - check connection.", false);
  }
}

async function detectionLoop(timestamp) {
  if (!video || video.paused || video.ended) {
    detectionLoopRunning = false;
    return;
  }

  let detections = [];

  try {
    detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();

    latestLandmarks = detections.length ? detections[0].landmarks : null;
  } catch (err) {
    console.warn("[Detection] face-api error:", err);
    latestLandmarks = null;
  }

  pool.updateLiveness(latestLandmarks);
  updateGuide(detections);

  if (timestamp - lastMatchAt >= MATCH_INTERVAL) {
    lastMatchAt = timestamp;

    if (detections.length > 0) {
      const { name, confidence } = matchDetection(detections[0]);
      const clocked = pool.update(name, confidence, latestLandmarks);
      if (clocked) await clockEvent(clocked);
    } else {
      pool.update(null, null, null);
    }
  }

  requestAnimationFrame(detectionLoop);
}

async function start() {
  try {
    if (typeof faceapi === "undefined") {
      setStatus("face-api.js not loaded", "text-danger small");
      return;
    }

    setStatus("Loading models...");
    await faceapi.nets.tinyFaceDetector.loadFromUri("/static/models");
    await faceapi.nets.faceLandmark68Net.loadFromUri("/static/models");
    await faceapi.nets.faceRecognitionNet.loadFromUri("/static/models");

    setStatus("Loading registered faces...");
    await loadKnownFaces();

    setStatus("Starting camera...");
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia not supported");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();

    await new Promise((resolve) => {
      if (video.videoWidth) return resolve();
      video.addEventListener("loadedmetadata", resolve, { once: true });
    });

    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
    faceapi.matchDimensions(overlay, {
      width: overlay.width,
      height: overlay.height,
    });

    const readyText = knownFaceCount
      ? `Ready (${knownFaceCount} registered)`
      : "Ready (no registered faces)";
    setStatus(readyText, "text-success small");

    if (!detectionLoopRunning) {
      detectionLoopRunning = true;
      requestAnimationFrame(detectionLoop);
    }
  } catch (err) {
    console.error("Init error:", err);
    setStatus("Error starting camera/models", "text-danger small");
    showResult(`Camera/models error: ${err?.message || err}`, false);
  }
}

window.addEventListener("load", start);
