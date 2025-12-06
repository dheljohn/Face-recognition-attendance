#!/usr/bin/env python3
"""
Secure Key Setup Utility

This script helps you set up your Google Cloud credentials securely
"""

import os
import json
import sys

def setup_service_account_key():
    """Guide user through secure key setup"""
    print("🔐 Google Cloud Service Account Key Setup")
    print("=" * 50)
    
    # Check if keys directory exists
    if not os.path.exists("keys"):
        os.makedirs("keys")
        print("✅ Created keys/ directory")
    
    key_file = "keys/facerecogattendance-58cd569fdf0b.json"
    
    if os.path.exists(key_file):
        print(f"⚠️  Key file already exists: {key_file}")
        overwrite = input("Do you want to overwrite it? (y/N): ").lower().strip()
        if overwrite != 'y':
            print("❌ Setup cancelled")
            return False
    
    print("\n📋 Instructions:")
    print("1. Go to Google Cloud Console")
    print("2. Navigate to IAM & Admin → Service Accounts")
    print("3. Create a new service account (or use existing)")
    print("4. Generate a new JSON key")
    print("5. Download the JSON file")
    print("6. Copy the JSON content below")
    print("\n" + "="*50)
    
    print(f"\nPaste your JSON key content (press Ctrl+Z then Enter when done):")
    
    try:
        # Read multiline input
        lines = []
        while True:
            try:
                line = input()
                lines.append(line)
            except EOFError:
                break
        
        json_content = '\n'.join(lines)
        
        # Validate JSON
        try:
            parsed_json = json.loads(json_content)
            
            # Basic validation
            required_fields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email']
            missing_fields = [field for field in required_fields if field not in parsed_json]
            
            if missing_fields:
                print(f"❌ Missing required fields: {missing_fields}")
                return False
            
            if parsed_json.get('type') != 'service_account':
                print("❌ Invalid key type. Expected 'service_account'")
                return False
            
        except json.JSONDecodeError as e:
            print(f"❌ Invalid JSON format: {e}")
            return False
        
        # Save the key file
        with open(key_file, 'w') as f:
            f.write(json_content)
        
        print(f"✅ Key saved successfully to {key_file}")
        print("🔒 File is ignored by git - your keys are safe!")
        
        return True
        
    except KeyboardInterrupt:
        print("\n❌ Setup cancelled by user")
        return False
    except Exception as e:
        print(f"❌ Error during setup: {e}")
        return False

def setup_environment_variable():
    """Set up environment variable for Google credentials"""
    key_file = os.path.abspath("keys/facerecogattendance-58cd569fdf0b.json")
    
    if not os.path.exists(key_file):
        print("❌ Key file not found. Run setup_service_account_key() first.")
        return False
    
    print(f"\n🌍 Environment Variable Setup")
    print("=" * 40)
    print(f"Add this to your environment variables:")
    print(f"GOOGLE_APPLICATION_CREDENTIALS={key_file}")
    print("\nFor Windows:")
    print(f'set GOOGLE_APPLICATION_CREDENTIALS={key_file}')
    print("\nFor PowerShell:")
    print(f'$env:GOOGLE_APPLICATION_CREDENTIALS="{key_file}"')
    print("\nFor Linux/Mac:")
    print(f'export GOOGLE_APPLICATION_CREDENTIALS="{key_file}"')
    
    return True

def verify_setup():
    """Verify the key setup is working"""
    key_file = "keys/facerecogattendance-58cd569fdf0b.json"
    
    if not os.path.exists(key_file):
        print("❌ Key file not found")
        return False
    
    try:
        with open(key_file, 'r') as f:
            key_data = json.load(f)
        
        print("✅ Key file is valid JSON")
        print(f"📧 Service Account: {key_data.get('client_email', 'Unknown')}")
        print(f"🏗️  Project ID: {key_data.get('project_id', 'Unknown')}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error reading key file: {e}")
        return False

def main():
    """Main menu"""
    while True:
        print("\n🔐 Secure Key Setup Utility")
        print("1. Set up service account key")
        print("2. Show environment variable setup")
        print("3. Verify current setup")
        print("4. Exit")
        
        choice = input("\nSelect option (1-4): ").strip()
        
        if choice == "1":
            setup_service_account_key()
        elif choice == "2":
            setup_environment_variable()
        elif choice == "3":
            verify_setup()
        elif choice == "4":
            print("👋 Goodbye!")
            break
        else:
            print("❌ Invalid choice. Please select 1-4.")

if __name__ == "__main__":
    main()