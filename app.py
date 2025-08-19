from flask import Flask, render_template, request, jsonify
import base64
import cv2
import numpy as np
import os
from werkzeug.utils import secure_filename
from recognizer import recognize_face, load_known_faces, markAttendance
from flask_cors import CORS

# CORS(app, resources={r"/recognize": {"origins": "*"}})

# Flask setup
app = Flask(__name__)
CORS(app, resources={r"/recognize": {"origins": "*"}})
app.config['UPLOAD_FOLDER'] = 'DownloadedImages'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Home page
@app.route("/")
def index():
    return render_template("index.html")

# Face recognition endpoint
@app.route("/recognize", methods=["POST" ])
def recognize():
    try:
        data = request.get_json(force=True)
        if not data or "image" not in data:
            return jsonify({"message": "❌ No image data received."}), 400

        image_data = data["image"].split(",")[1]
        image_bytes = base64.b64decode(image_data)
        img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)

        known_encodings, known_names = load_known_faces(app.config['UPLOAD_FOLDER'])
        name = recognize_face(img, known_encodings, known_names)

        if name:
            attendance_message = markAttendance(name)   # ✅ get dynamic message
            return jsonify({"message": attendance_message})
        else:
            return jsonify({"message": "❌ Face not recognized."})

    except Exception as e:
        return jsonify({"message": f"⚠️ Server error: {str(e)}"}), 500


# Admin upload
@app.route("/admin")
def admin_upload_form():
    return render_template("upload.html")

@app.route("/upload", methods=["POST"])
def upload_image():
    if 'file' not in request.files or 'name' not in request.form:
        return "Missing name or file", 400

    file = request.files['file']
    name = request.form['name'].strip()

    if file.filename == '' or not name:
        return "Invalid input", 400

    filename = secure_filename(f"{name}.jpg")
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    return f"✅ Uploaded successfully as {filename}. <br><a href='/admin'>Back</a>"

if __name__ == '__main__':
    app.run(debug=True)