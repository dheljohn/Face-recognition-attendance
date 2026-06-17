import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

from db import (
    delete_face,
    face_name_exists,
    get_all_faces,
    get_attendance_summary,
    save_face,
)
from recognizer import markAttendance

load_dotenv()

app = Flask(__name__)

CORS(app, resources={
    r"/known-faces": {"origins": "*"},
    r"/clock": {"origins": "*"},
})


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/known-faces")
def known_faces():
    faces = get_all_faces()
    return jsonify([
        {
            "id": face["id"],
            "name": face["name"],
            "encoding": face["encoding"],
        }
        for face in faces
    ])


@app.route("/recognize", methods=["POST"])
def recognize():
    return jsonify({
        "name": None,
        "confidence": None,
        "message": "Recognition now runs in the browser with face-api.js.",
    }), 410


@app.route("/clock", methods=["POST"])
def clock():
    try:
        data = request.get_json(force=True)
        if not data or "name" not in data:
            return jsonify({"message": "No name received."}), 400

        name = data["name"]
        message = markAttendance(name)
        return jsonify({"message": message})

    except Exception as e:
        app.logger.error(f"Clock error: {e}")
        return jsonify({"message": f"Server error: {str(e)}"}), 500


@app.route("/admin")
def admin():
    faces = get_all_faces()
    return render_template("admin.html", faces=faces)


@app.route("/upload", methods=["POST"])
def upload_image():
    data = request.get_json(force=True, silent=True) or {}
    name = data.get("name", "").strip()
    encoding = data.get("encoding")
    photo_b64 = data.get("photo_b64", "")

    if not name or not isinstance(encoding, list):
        return jsonify({"success": False, "message": "Missing name or face descriptor."}), 400

    if len(encoding) != 128:
        return jsonify({"success": False, "message": "Invalid face descriptor."}), 400

    safe_name = "".join(
        c for c in name if c.isalnum() or c in (" ", "-", "_")
    ).strip()
    if not safe_name:
        return jsonify({"success": False, "message": "Name contains invalid characters."}), 400

    if face_name_exists(safe_name):
        return jsonify({
            "success": False,
            "message": f"'{safe_name}' is already registered. Delete the existing entry first.",
        }), 409

    try:
        new_face = save_face(safe_name, encoding, photo_b64)
    except Exception as e:
        app.logger.error(f"Upload error: {e}")
        return jsonify({"success": False, "message": f"Failed to save face: {str(e)}"}), 500

    return jsonify({
        "success": True,
        "message": f"{safe_name} registered successfully!",
        "face": new_face,
    })


@app.route("/faces/<face_id>", methods=["DELETE"])
def delete_face_route(face_id):
    try:
        deleted = delete_face(face_id)
        if deleted:
            return jsonify({"success": True, "message": "Face deleted successfully."})
        return jsonify({"success": False, "message": "Face not found."}), 404
    except Exception as e:
        app.logger.error(f"Delete error: {e}")
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/attendance")
def attendance():
    logs = get_attendance_summary()
    return render_template("attendance.html", logs=logs)


if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(debug=debug_mode)
