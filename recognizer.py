
"""
recognizer.py — Face recognition and attendance logic
"""

import numpy as np
from datetime import datetime, timedelta

from db import get_today_logs, save_attendance


def recognize_face(img, known_encodings: list, known_names: list) -> tuple[str, float] | tuple[None, None]:
    """
    Return (name, confidence) of the best matching face, or (None, None).
    confidence = 1 - distance, range 0.0 - 1.0, higher is better.
    """
    import face_recognition

    if not known_encodings:
        return None, None

    rgb_img = np.ascontiguousarray(img[:, :, ::-1])
    unknown_encodings = face_recognition.face_encodings(rgb_img)

    if not unknown_encodings:
        return None, None

    np_known = [np.array(e) for e in known_encodings]

    for encoding in unknown_encodings:
        distances = face_recognition.face_distance(np_known, encoding)
        best_idx = int(np.argmin(distances))
        best_dist = float(distances[best_idx])

        if best_dist < 0.5:
            return known_names[best_idx], round(1 - best_dist, 4)

    return None, None


def markAttendance(name: str) -> str:
    """
    Record attendance in Supabase and return a user-facing message.
    Handles In/Out toggling — grace period removed, state machine handles it.
    """
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")

    today_logs = get_today_logs(name, date_str)

    if not today_logs or today_logs[-1]["status"] == "Out":
        status = "In"
        message = f"✅ Welcome {name}! Checked IN at {time_str}. Have a productive day!"
    else:
        status = "Out"
        message = f"👋 Goodbye {name}! Checked OUT at {time_str}. See you next time!"

    save_attendance(name, date_str, status, time_str)
    return message