import os
import io
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# Constants
SERVICE_ACCOUNT_FILE = 'keys/facerecogattendance-58cd569fdf0b.json'  # Your downloaded file
# SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
SCOPES = ['https://www.googleapis.com/auth/drive']

DOWNLOAD_PATH = 'Attendance'  # Local path to save images

# Auth setup
credentials = service_account.Credentials.from_service_account_file(
    SERVICE_ACCOUNT_FILE, scopes=SCOPES)
drive_service = build('drive', 'v3', credentials=credentials)

def download_images_from_folder(folder_id):
    if not os.path.exists(DOWNLOAD_PATH):
        os.makedirs(DOWNLOAD_PATH)

    query = f"'{folder_id}' in parents and mimeType contains 'image/' and trashed = false"
    results = drive_service.files().list(q=query, fields="files(id, name)").execute()
    items = results.get('files', [])

    print(f"Found {len(items)} image(s) in Google Drive.")

    for item in items:
        request = drive_service.files().get_media(fileId=item['id'])
        file_path = os.path.join(DOWNLOAD_PATH, item['name'])
        with open(file_path, 'wb') as f:
            downloader = MediaIoBaseDownload(f, request)
            done = False
            while not done:
                status, done = downloader.next_chunk()
        print(f"Downloaded: {item['name']}")
