face-api.js models live here.

Required for the current browser-side recognition flow:

- tiny_face_detector_model-weights_manifest.json
- tiny_face_detector_model-shard1
- face_landmark_68_model-weights_manifest.json
- face_landmark_68_model-shard1
- face_recognition_model-weights_manifest.json
- face_recognition_model-shard1
- face_recognition_model-shard2

The face recognition files are required for `.withFaceDescriptor()` and
`faceapi.FaceMatcher`. Without them, registration and live matching will fail
while loading models.
