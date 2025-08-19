// ...existing code...
// Lightweight non-blocking debug logging (remove when stable)
window.addEventListener('beforeunload', () => console.warn('beforeunload fired'));
window.addEventListener('unload', () => console.warn('unload fired'));
document.addEventListener('visibilitychange', () => console.warn('visibilitychange:', document.visibilityState));
window.addEventListener('error', (e) => console.error('window.error:', e.message));
window.addEventListener('unhandledrejection', (e) => console.error('unhandledrejection:', e.reason));

// Cache DOM nodes once
const video = document.getElementById('video');
const overlay = document.getElementById('overlay'); // overlay canvas for detections
const resultEl = document.getElementById('result');
const statusEl = document.getElementById('status');
const captureBtn = document.getElementById('captureBtn');

// Reusable offscreen canvas for captures
const captureCanvas = document.createElement('canvas');
let detectionLoopRunning = false;
let lastDetection = 0;
const DETECTION_INTERVAL = 150; // ms

function setStatus(text, cls = 'text-muted small') {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = cls;
}

function showResult(message, success = true) {
  if (!resultEl) return;
  const cls = success ? 'alert alert-success small' : 'alert alert-warning small';
  resultEl.innerHTML = `<div class="${cls}" role="alert">${message}</div>`;
}

async function start() {
  try {
    if (typeof faceapi === 'undefined') {
      console.error('❌ face-api.js not loaded.');
      setStatus('face-api.js not loaded', 'text-danger small');
      return;
    }

    setStatus('Loading model…');
    await faceapi.nets.tinyFaceDetector.loadFromUri('/static/models');
    setStatus('Starting camera…');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia not supported');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (!video) return;
    video.srcObject = stream;
    await video.play();

    // size overlay to video
    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
    faceapi.matchDimensions(overlay, { width: overlay.width, height: overlay.height });

    setStatus('Ready', 'text-success small');

    if (!detectionLoopRunning) {
      detectionLoopRunning = true;
      requestAnimationFrame(detectionLoop);
    }
  } catch (err) {
    console.error('Init error:', err);
    setStatus('Error starting camera/models', 'text-danger small');
    showResult(`Camera/models error: ${err?.message || err}`, false);
  }
}

async function detectionLoop(timestamp) {
  // throttle detection to DETECTION_INTERVAL ms
  if (!video || video.paused || video.ended) {
    detectionLoopRunning = false;
    return;
  }

  if (!lastDetection || (timestamp - lastDetection) >= DETECTION_INTERVAL) {
    lastDetection = timestamp;
    try {
      const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
      const resized = faceapi.resizeResults(detections, { width: overlay.width, height: overlay.height });
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      faceapi.draw.drawDetections(overlay, resized);
    } catch (err) {
      console.warn('Detection error:', err);
    }
  }

  requestAnimationFrame(detectionLoop);
}

function captureFrameToDataURL() {
  if (!video) return null;
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  captureCanvas.width = w;
  captureCanvas.height = h;
  const ctx = captureCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  return captureCanvas.toDataURL('image/jpeg', 0.9);
}

captureBtn && captureBtn.addEventListener('click', async (e) => {
  e && e.preventDefault();
  if (!captureBtn) return;
  captureBtn.disabled = true;
  const prevText = captureBtn.textContent;
  captureBtn.textContent = 'Processing…';

  try {
    const dataURL = captureFrameToDataURL();
    if (!dataURL) throw new Error('Failed to capture image');

    const resp = await fetch('/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataURL })
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => null);
      throw new Error(txt || `Server returned ${resp.status}`);
    }

    const json = await resp.json().catch(() => null);
    const message = json?.message || 'No response';
    const success = typeof message === 'string' ? message.startsWith('✅') : true;
    showResult(message, success);
  } catch (err) {
    console.error('Recognition error:', err);
    showResult(`Error: ${err?.message || err}`, false);
  } finally {
    captureBtn.disabled = false;
    captureBtn.textContent = prevText || '📸 Capture & Submit';
  }
});

// start after page load
window.addEventListener('load', start);
// ...existing