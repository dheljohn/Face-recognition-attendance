# FaceMark — Face Recognition Attendance System

A web-based attendance system using face recognition. Built with Flask, face_recognition, and face-api.js. Face data and attendance logs are stored in Supabase — no local file storage needed.

---

## Features

- Live webcam feed with real-time face detection overlay
- Automatic In/Out toggling with a 5-minute grace period
- Face registration with instant detection validation
- Admin panel to manage registered faces (upload + delete)
- Attendance log viewer
- All data stored in Supabase (Postgres)
- Deployable to Render.com free tier

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, Flask |
| Face Recognition | face_recognition (dlib) |
| Browser Detection | face-api.js |
| Database | Supabase (Postgres) |
| Deployment | Render.com |

---

## Local Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/Face-recognition-attendance.git
cd Face-recognition-attendance
```

### 2. Create a virtual environment

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
source .venv/bin/activate   # Mac/Linux
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

> **Note:** `face_recognition` requires `dlib`. On Windows you may need CMake and Visual C++ Build Tools first, or install a pre-built dlib wheel.

### 4. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run:

```sql
CREATE TABLE registered_faces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    encoding    JSONB NOT NULL,
    photo_b64   TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE attendance_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    date        DATE NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('In', 'Out')),
    time        TIME NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE registered_faces ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
```

3. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **service_role** secret key

### 5. Configure environment variables

```bash
copy .env.example .env     # Windows
cp .env.example .env       # Mac/Linux
```

Fill in your `.env`:

```env
FLASK_DEBUG=true
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 6. Run the app

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000)

---

## Pages

| Route | Description |
|---|---|
| `/` | Live camera — capture and submit for recognition |
| `/admin` | Register new faces, view and delete existing ones |
| `/attendance` | View full attendance log |

---

## How It Works

### Registration (`/admin`)
1. Enter a name and upload a clear front-facing photo
2. The server checks a face is detectable before saving
3. The face encoding (128-float vector) and a thumbnail are stored in Supabase
4. The face is immediately available for recognition

### Recognition (`/`)
1. Browser streams webcam via face-api.js (draws bounding boxes)
2. Click **Capture & Submit** — frame is sent to the Flask server
3. Server compares the frame against all stored encodings
4. On match, attendance is logged (In/Out toggled, 5-min grace period)

---

## Project Structure

```
app.py                  Flask application + routes
recognizer.py           Face recognition logic
db.py                   Supabase database layer
drive_utils.py          Google Drive integration (optional)
templates/
  index.html            Camera page
  admin.html            Face management UI
  attendance.html       Attendance log viewer
static/
  script.js             Camera + recognition JS
  styles.css            Main styles
  admin.css             Admin page styles
  models/               face-api.js model weights
requirements.txt        Python dependencies
render.yaml             Render.com deploy config
.env.example            Environment variable template
```

---

## Deploying to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → **New Web Service** → connect your repo
3. Render will auto-detect `render.yaml`
4. Add environment variables in the Render dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FLASK_DEBUG` → `false`
5. Deploy

> No persistent disk needed — all data lives in Supabase.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `FLASK_DEBUG` | `false` | Enable Flask debug mode (dev only) |
| `SUPABASE_URL` | — | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service role secret key |
| `GOOGLE_APPLICATION_CREDENTIALS` | `keys/service_account.json` | Google Drive key (optional) |

---

## Security Notes

- The `service_role` key has full database access — never expose it in frontend code or commit it to git
- Row Level Security (RLS) is enabled on both tables — direct client access is blocked
- `.env` is gitignored — use `.env.example` as a template
