"""
Attendance logging logic.

Face recognition now runs in the browser with face-api.js. The backend only
records clock events after the frontend liveness and matching flow succeeds.
"""

from datetime import datetime

from db import get_today_logs, save_attendance


def markAttendance(name: str) -> str:
    """
    Record attendance in Supabase and return a user-facing message.
    The latest status for the day controls In/Out toggling.
    """
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")

    today_logs = get_today_logs(name, date_str)

    if not today_logs or today_logs[-1]["status"] == "Out":
        status = "In"
        message = f"Welcome {name}! Checked IN at {time_str}. Have a productive day!"
    else:
        status = "Out"
        message = f"Goodbye {name}! Checked OUT at {time_str}. See you next time!"

    save_attendance(name, date_str, status, time_str)
    return message
