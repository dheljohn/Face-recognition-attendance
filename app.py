import base64
import io
import os

import cv2
import numpy as np
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from PIL import Image

from db import (
    delete_face,
    face_name_exists,
    get_all_faces,
    get_face_encodings,
    save_face,
    get_attendance_summary,
)
from recognizer import markAttendance, recognize_face

load_dotenv()

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)

CORS(app, resources={
    r"/recognize": {"origins": "*"},
    r"/clock":     {"origins": "*"},
})
# ---------------------------------------------------------------------------
# In-memory encoding cache
# Loaded once at startup, invalidated when a new face is uploaded or deleted.
# ---------------------------------------------------------------------------
_cache: dict = {"encodings": [], "names": [], "loaded": False}


def get_known_faces() -> tuple[list, list]:
    if not _cache["loaded"]:
        _reload_cache()
    return _cache["encodings"], _cache["names"]


def _reload_cache() -> None:
    encodings, names = get_face_encodings()
    _cache["encodings"] = encodings
    _cache["names"] = names
    _cache["loaded"] = True
    app.logger.info(f"[Cache] Loaded {len(names)} known face(s): {names}")


def _invalidate_cache() -> None:
    _cache["loaded"] = False


# Pre-load at startup
with app.app_context():
    _reload_cache()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/recognize", methods=["POST"])
def recognize():
    try:
        data = request.get_json(force=True)
        if not data or "image" not in data:
            app.logger.warning("[Recognize] No image in request")
            return jsonify({"name": None, "confidence": None}), 400

        image_data = data["image"].split(",")[1]
        image_bytes = base64.b64decode(image_data)
        img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)

        if img is None:
            app.logger.warning("[Recognize] Could not decode image")
            return jsonify({"name": None, "confidence": None}), 400

        known_encodings, known_names = get_known_faces()

        if not known_names:
            app.logger.warning("[Recognize] No registered faces in cache")
            return jsonify({"name": None, "confidence": None})

        app.logger.info(f"[Recognize] Running against {len(known_names)} known face(s)")
        name, confidence = recognize_face(img, known_encodings, known_names)
        app.logger.info(f"[Recognize] Result → name={name} confidence={confidence}")

        return jsonify({"name": name, "confidence": confidence})

    except Exception as e:
        app.logger.error(f"Recognition error: {e}")
        return jsonify({"name": None, "confidence": None}), 500

@app.route("/clock", methods=["POST"])
def clock():
    try:
        data = request.get_json(force=True)
        if not data or "name" not in data:
            return jsonify({"message": "❌ No name received."}), 400

        name = data["name"]
        message = markAttendance(name)
        return jsonify({"message": message})

    except Exception as e:
        app.logger.error(f"Clock error: {e}")
        return jsonify({"message": f"⚠️ Server error: {str(e)}"}), 500

@app.route("/admin")
def admin():
    faces = get_all_faces()
    return render_template("admin.html", faces=faces)


@app.route("/upload", methods=["POST"])
def upload_image():
    if "file" not in request.files or "name" not in request.form:
        return jsonify({"success": False, "message": "Missing name or file."}), 400

    file = request.files["file"]
    name = request.form["name"].strip()

    if not name or file.filename == "":
        return jsonify({"success": False, "message": "Invalid name or empty file."}), 400

    # Sanitize name
    safe_name = "".join(
        c for c in name if c.isalnum() or c in (" ", "-", "_")
    ).strip()
    if not safe_name:
        return jsonify({"success": False, "message": "Name contains invalid characters."}), 400

    # Check for duplicate
    if face_name_exists(safe_name):
        return jsonify({
            "success": False,
            "message": f"⚠️ '{safe_name}' is already registered. Delete the existing entry first."
        }), 409

    try:
        import face_recognition as fr

        # Open and convert to RGB using Pillow
        pil_img = Image.open(file.stream).convert("RGB")
        img_array = np.ascontiguousarray(np.array(pil_img))

        # Verify a face is detectable
        face_locs = fr.face_locations(img_array)
        if not face_locs:
            return jsonify({
                "success": False,
                "message": "⚠️ No face detected. Please use a clear, front-facing photo."
            }), 400

        # Compute the face encoding
        encodings = fr.face_encodings(img_array, face_locs)
        if not encodings:
            return jsonify({
                "success": False,
                "message": "⚠️ Could not encode face. Please try a clearer photo."
            }), 400

        encoding_list = encodings[0].tolist()  # numpy → plain list for JSON storage

        # Resize to thumbnail and encode as base64 for the admin UI
        pil_img.thumbnail((160, 160))
        buffer = io.BytesIO()
        pil_img.save(buffer, format="JPEG", quality=85)
        photo_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

        # Save to Supabase
        save_face(safe_name, encoding_list, photo_b64)

    except Exception as e:
        app.logger.error(f"Upload error: {e}")
        return jsonify({"success": False, "message": f"Failed to process image: {str(e)}"}), 500

    # Invalidate cache so next recognition picks up the new face
    _invalidate_cache()

    # Fetch the newly saved row to return to the frontend
    from db import get_all_faces
    all_faces = get_all_faces()
    new_face = next((f for f in all_faces if f["name"] == safe_name), None)

    return jsonify({
        "success": True,
        "message": f"✅ {safe_name} registered successfully!",
        "face": new_face,
    })


@app.route("/faces/<face_id>", methods=["DELETE"])
def delete_face_route(face_id):
    try:
        deleted = delete_face(face_id)
        if deleted:
            _invalidate_cache()
            return jsonify({"success": True, "message": "Face deleted successfully."})
        else:
            return jsonify({"success": False, "message": "Face not found."}), 404
    except Exception as e:
        app.logger.error(f"Delete error: {e}")
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/attendance")
def attendance():
    logs = get_attendance_summary()
    return render_template("attendance.html", logs=logs)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(debug=debug_mode)
