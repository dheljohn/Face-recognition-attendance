import os
import io

# Constants — key file path configurable via environment variable
SERVICE_ACCOUNT_FILE = os.environ.get(
    "GOOGLE_APPLICATION_CREDENTIALS",
    "keys/facerecogattendance-58cd569fdf0b.json"
)
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
DOWNLOAD_PATH = os.environ.get("KNOWN_FACES_DIR", "known_faces")


def _get_drive_service():
    """Lazy-load Google Drive credentials — only fails if actually called."""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        raise FileNotFoundError(
            f"Service account key not found: {SERVICE_ACCOUNT_FILE}\n"
            "Run python setup_keys.py to set up your credentials."
        )

    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    return build('drive', 'v3', credentials=credentials)


def download_images_from_folder(folder_id):
    """Download all images from a Google Drive folder into DOWNLOAD_PATH."""
    from googleapiclient.http import MediaIoBaseDownload

    drive_service = _get_drive_service()

    os.makedirs(DOWNLOAD_PATH, exist_ok=True)

    query = (
        f"'{folder_id}' in parents "
        f"and mimeType contains 'image/' "
        f"and trashed = false"
    )
    results = drive_service.files().list(
        q=query, fields="files(id, name)"
    ).execute()
    items = results.get('files', [])

    print(f"[Drive] Found {len(items)} image(s) in folder.")

    for item in items:
        request = drive_service.files().get_media(fileId=item['id'])
        file_path = os.path.join(DOWNLOAD_PATH, item['name'])
        with open(file_path, 'wb') as f:
            downloader = MediaIoBaseDownload(f, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
        print(f"[Drive] Downloaded: {item['name']}")

    return len(items)
