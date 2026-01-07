⚠️ **Disclaimer:** This project is built for learning and portfolio demonstration only. It is not intended for production use or mass users. Security, data handling, and architecture are simplified.

# Face Recognition Attendance System

A face recognition–based attendance system built using Python and browser-based face detection (face-api.js).

## Features

* 📸 Real-time face detection and recognition
* 📑 Automatic attendance logging to CSV
* 🧠 Pre-trained face recognition models (face-api.js)
* 🖥️ Simple web-based interface
* 📦 Offline-ready face models

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/dheljohn/Face-recognition-attendance.git
cd Face-recognition-attendance
```

### 2. Create Virtual Environment (Recommended)

```bash
python -m venv venv
source venv/bin/activate     # macOS/Linux
.\venv\Scripts\activate      # Windows
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the Application

```bash
python app.py
```

### 5. Open in Browser

Visit:

```
http://localhost:5000
```

## Project Structure

```
.
├── static/                     # Static files and assets
├── templates/                  # HTML templates
├── face-api.js-0.22.2/         # Face API library
├── face-api.js-models-master/  # Face detection models
├── app.py                      # Main server file
├── add.py                      # Add new faces/users
├── recognizer.py               # Recognition logic
├── Attendance.csv              # Attendance output file
└── drive_utils.py              # Utility scripts
```

## How It Works

1. Webcam captures face input via browser
2. face-api.js detects and encodes faces
3. Python backend matches faces with stored data
4. Attendance is logged to a CSV file

## Security Notes

* No authentication or access control is implemented
* Attendance data is stored in plain CSV format
* Not suitable for real-world or production use

## Contributing

1. Fork the repository
2. Create a new feature branch
3. Commit your changes
4. Push to your fork
5. Open a Pull Request

## License

This project is licensed under the **MIT License**.
