"""
db.py — Supabase database layer

All face storage and attendance logging goes through here.
The rest of the app never touches the filesystem for face data.
"""

import json
import os

from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Client — initialized once, reused across requests
# ---------------------------------------------------------------------------

def _get_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env"
        )
    return create_client(url, key)


_client: Client | None = None

def get_db() -> Client:
    global _client
    if _client is None:
        _client = _get_client()
    return _client


# ---------------------------------------------------------------------------
# Registered Faces
# ---------------------------------------------------------------------------

def get_all_faces() -> list[dict]:
    """
    Return all registered faces.
    Each row: { id, name, encoding (list[float]), photo_b64, created_at }
    """
    result = get_db().table("registered_faces") \
        .select("id, name, encoding, photo_b64, created_at") \
        .order("created_at", desc=False) \
        .execute()
    return result.data or []


def get_face_encodings() -> tuple[list, list]:
    """
    Return (encodings, names) ready for face_recognition.
    Encodings are plain Python lists (128 floats each).
    """
    rows = get_all_faces()
    encodings = [row["encoding"] for row in rows]
    names = [row["name"] for row in rows]
    return encodings, names


def save_face(name: str, encoding: list[float], photo_b64: str) -> dict:
    """
    Insert a new registered face.
    Returns the inserted row.
    """
    result = get_db().table("registered_faces").insert({
        "name": name,
        "encoding": encoding,          # stored as JSONB array
        "photo_b64": photo_b64,
    }).execute()
    return result.data[0] if result.data else {}


def delete_face(face_id: str) -> bool:
    """
    Delete a registered face by its UUID.
    Returns True if a row was deleted.
    """
    result = get_db().table("registered_faces") \
        .delete() \
        .eq("id", face_id) \
        .execute()
    return bool(result.data)


def face_name_exists(name: str) -> bool:
    """Check if a face with this name is already registered."""
    result = get_db().table("registered_faces") \
        .select("id") \
        .eq("name", name) \
        .limit(1) \
        .execute()
    return bool(result.data)


# ---------------------------------------------------------------------------
# Attendance Logs
# ---------------------------------------------------------------------------

def get_today_logs(name: str, date_str: str) -> list[dict]:
    """
    Return all attendance rows for a given person on a given date.
    date_str format: 'YYYY-MM-DD'
    """
    result = get_db().table("attendance_logs") \
        .select("id, name, date, status, time") \
        .eq("name", name) \
        .eq("date", date_str) \
        .order("time", desc=False) \
        .execute()
    return result.data or []


def save_attendance(name: str, date_str: str, status: str, time_str: str) -> dict:
    """
    Insert a new attendance log entry.
    date_str: 'YYYY-MM-DD', time_str: 'HH:MM:SS'
    """
    result = get_db().table("attendance_logs").insert({
        "name": name,
        "date": date_str,
        "status": status,
        "time": time_str,
    }).execute()
    return result.data[0] if result.data else {}


def get_attendance_summary() -> list[dict]:
    """Return all attendance logs ordered by date and time (for admin view)."""
    result = get_db().table("attendance_logs") \
        .select("name, date, status, time") \
        .order("date", desc=True) \
        .order("time", desc=True) \
        .execute()
    return result.data or []
