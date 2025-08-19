import face_recognition
import numpy as np
import os
import csv
from datetime import datetime, timedelta


def load_known_faces(directory):
    encodings = []
    names = []
    
    for filename in os.listdir(directory):
        if not filename.lower().endswith(('.jpg', '.png', '.jpeg')):
            continue
        path = os.path.join(directory, filename)
        image = face_recognition.load_image_file(path)
        encoding = face_recognition.face_encodings(image)
        if encoding:
            encodings.append(encoding[0])
            names.append(os.path.splitext(filename)[0])
        else:
            print(f"Failed to extract encoding for {path}") 
            
    return encodings, names

def recognize_face(img, known_encodings, known_names):
    unknown_encodings = face_recognition.face_encodings(img)
    if not unknown_encodings:
        return None
    for encoding in unknown_encodings:
        results = face_recognition.compare_faces(known_encodings, encoding)
        if True in results:
            idx = results.index(True)
            return known_names[idx]
    return None

def markAttendance(name):
    filename = "attendance.csv"
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")

    logs = []
    if os.path.exists(filename):
        with open(filename, "r") as f:
            reader = csv.reader(f)
            logs = list(reader)

    # Filter today's logs for this person
    today_logs = [row for row in logs if row and row[0] == name and row[1] == date_str]

    if today_logs:
        last_status = today_logs[-1][2]
        last_time = datetime.strptime(today_logs[-1][3], "%H:%M:%S")

        # Grace period (5 min)
        if now - last_time < timedelta(minutes=5):
            return f"ℹ️ {name}, you already clocked {last_status} at {today_logs[-1][3]}."

    # Decide IN or OUT
    if not today_logs or today_logs[-1][2] == "Out":
        status = "In"
        message = f"✅ Welcome {name}, you are checked IN at {time_str}. Have a productive day!"
    else:
        status = "Out"
        message = f"👋 Goodbye {name}, you checked OUT at {time_str}."

    # Write new log
    with open(filename, "a", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([name, date_str, status, time_str])

    return message

