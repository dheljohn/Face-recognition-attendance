// script.js — camera loop wired into TrackerPool + PresenceStateMachine

// ------------------------------------------------------------------
// Debug listeners
// ------------------------------------------------------------------
window.addEventListener("beforeunload", () =>
  console.warn("beforeunload fired"),
);
window.addEventListener("unload", () => console.warn("unload fired"));
document.addEventListener("visibilitychange", () =>
  console.warn("visibilitychange:", document.visibilityState),
);
window.addEventListener("error", (e) =>
  console.error("window.error:", e.message),
);
window.addEventListener("unhandledrejection", (e) =>
  console.error("unhandledrejection:", e.reason),
);

// ------------------------------------------------------------------
// DOM
// ------------------------------------------------------------------
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const guideBox = document.getElementById("guide-box");

// Capture button removed — recognition is now automatic.
// If the button still exists in index.html, it will be ignored.

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------
const captureCanvas = document.createElement("canvas");
const pool = new TrackerPool();

let detectionLoopRunning = false;
let lastFrameSentAt = 0;
const FRAME_INTERVAL = 150; // ms — matches original DETECTION_INTERVAL

// Rolling message display
let lastMessage = null;
let messageShownAt = null;
const MESSAGE_DURATION = 4000; // ms

// Recognition request gate — prevent overlapping fetches
let recognizing = false;
let latestLandmarks = null;

// Run flask recognition on its own timer, independent of face-api loop
const RECOGNIZE_INTERVAL = 1500; // matches actual Flask response time
let lastRecognizeSentAt = 0;

// ------------------------------------------------------------------
// UI helpers
// ------------------------------------------------------------------
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
  const icon = success ? "✅" : "⚠️";
  resultEl.innerHTML = `<div class="${cls}" role="alert">
    <strong>${icon}</strong> ${message}
  </div>`;

  lastMessage = message;
  messageShownAt = performance.now();

  if (success) {
    setTimeout(() => {
      if (resultEl.innerHTML.includes(message)) resultEl.innerHTML = "";
    }, 5000);
  }
}

// ------------------------------------------------------------------
// State overlay — drawn on canvas each frame
// ------------------------------------------------------------------
const STATE_COLORS = {
  [ScannerState.IDLE]: "#aaaaaa",
  [ScannerState.APPROACH]: "#ffc107",
  [ScannerState.CONFIRMING]: "#28a745",
  [ScannerState.CLOCKED]: "#0d6efd",
};

// ------------------------------------------------------------------
// Overlay — bounding boxes always, guide text per state
// ------------------------------------------------------------------
function updateGuide(detections) {
  // --- bounding boxes ---
  if (overlay) {
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (detections?.length) {
      // extract raw detections from landmark results
      const rawDetections = detections.map((d) => d.detection);
      const resized = faceapi.resizeResults(rawDetections, {
        width: overlay.width,
        height: overlay.height,
      });
      faceapi.draw.drawDetections(overlay, resized);
    }
  }
  // --- floating guide box ---
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
      guideBox.textContent = "🔍 Hold still…";
      break;

    case ScannerState.CONFIRMING: {
      const filled = Math.round(m.confirmProgress * 5);
      const dots = "●".repeat(filled) + "○".repeat(5 - filled);
      guideBox.style.display = "block";
      guideBox.style.background = "rgba(40, 167, 69, 0.85)";
      guideBox.style.color = "#fff";
      guideBox.textContent = `✅ Scanning… ${dots}`;
      break;
    }

    case ScannerState.LIVENESS:
      guideBox.style.display = "block";
      guideBox.style.background = "rgba(111, 66, 193, 0.85)";
      guideBox.style.color = "#fff";
      guideBox.textContent = "👁️ Please blink…";
      break;

    case ScannerState.CLOCKED:
      guideBox.style.display = "block";
      guideBox.style.background = "rgba(13, 110, 253, 0.85)";
      guideBox.style.color = "#fff";
      guideBox.textContent = "✓ Clocked!";
      break;
  }
}

// ------------------------------------------------------------------
// Recognition — POST frame to /recognize, feed result to pool
// ------------------------------------------------------------------
function captureDataURL() {
  if (!video) return null;
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  captureCanvas.width = w;
  captureCanvas.height = h;
  captureCanvas.getContext("2d").drawImage(video, 0, 0, w, h);
  return captureCanvas.toDataURL("image/jpeg", 0.9);
}

async function sendFrame() {
  if (recognizing) return;
  recognizing = true;

  try {
    const dataURL = captureDataURL();
    if (!dataURL) return;

    const resp = await fetch("/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataURL }),
    });

    if (!resp.ok) return;

    const { name, confidence } = await resp.json();
    console.log("[sendFrame] name:", name, "confidence:", confidence);

    const clocked = pool.update(name, confidence, latestLandmarks); // ← uses module-level var
    console.log("[sendFrame] clocked:", clocked, "| pool:", pool.snapshot());

    if (clocked) await clockEvent(clocked);
  } catch (err) {
    console.warn("[Recognition] fetch error:", err);
  } finally {
    recognizing = false;
  }
}

async function clockEvent(name) {
  try {
    const resp = await fetch("/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    const { message } = await resp.json();
    const success = typeof message === "string" && message.startsWith("✅");
    showResult(message, success);
  } catch (err) {
    console.error("[Clock] fetch error:", err);
    showResult("Clock event failed — check connection.", false);
  }
}

// ------------------------------------------------------------------
// Detection loop
// ------------------------------------------------------------------
async function detectionLoop(timestamp) {
  if (!video || video.paused || video.ended) {
    detectionLoopRunning = false;
    return;
  }

  let detections = [];

  try {
    detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();

    latestLandmarks = detections.length ? detections[0].landmarks : null;
  } catch (err) {
    console.warn("[Detection] face-api error:", err);
    latestLandmarks = null;
  }

  // Always draw — boxes + guide text every frame
  // drawOverlay(detections);
  pool.updateLiveness(latestLandmarks);
  updateGuide(detections);

  // Only hit Flask on the slower interval
  if (timestamp - lastRecognizeSentAt >= RECOGNIZE_INTERVAL) {
    lastRecognizeSentAt = timestamp;

    if (detections.length > 0) {
      sendFrame();
    } else {
      pool.update(null, null, null);
    }
  }

  requestAnimationFrame(detectionLoop);
}

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
async function start() {
  try {
    if (typeof faceapi === "undefined") {
      setStatus("face-api.js not loaded", "text-danger small");
      return;
    }

    setStatus("Loading model…");
    await faceapi.nets.tinyFaceDetector.loadFromUri("/static/models");
    await faceapi.nets.faceLandmark68Net.loadFromUri("/static/models");
    setStatus("Starting camera…");

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

    setStatus("Ready", "text-success small");

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
