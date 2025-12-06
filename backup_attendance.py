#!/usr/bin/env python3
"""
Attendance Data Backup Utility

This script helps you backup and restore attendance data when using .gitignore
"""

import os
import shutil
from datetime import datetime
import csv

def backup_attendance():
    """Create a timestamped backup of attendance data"""
    if not os.path.exists("Attendance.csv"):
        print("❌ No Attendance.csv file found to backup")
        return False
    
    # Create backups directory if it doesn't exist
    os.makedirs("backups", exist_ok=True)
    
    # Create timestamped backup filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"backups/Attendance_backup_{timestamp}.csv"
    
    try:
        shutil.copy2("Attendance.csv", backup_filename)
        print(f"✅ Backup created: {backup_filename}")
        return True
    except Exception as e:
        print(f"❌ Backup failed: {e}")
        return False

def restore_attendance(backup_file):
    """Restore attendance data from a backup file"""
    if not os.path.exists(backup_file):
        print(f"❌ Backup file not found: {backup_file}")
        return False
    
    try:
        shutil.copy2(backup_file, "Attendance.csv")
        print(f"✅ Attendance data restored from: {backup_file}")
        return True
    except Exception as e:
        print(f"❌ Restore failed: {e}")
        return False

def list_backups():
    """List all available backup files"""
    if not os.path.exists("backups"):
        print("📁 No backups directory found")
        return []
    
    backups = [f for f in os.listdir("backups") if f.startswith("Attendance_backup_")]
    if not backups:
        print("📁 No backup files found")
        return []
    
    print("📋 Available backups:")
    for i, backup in enumerate(sorted(backups), 1):
        backup_path = os.path.join("backups", backup)
        size = os.path.getsize(backup_path)
        mtime = datetime.fromtimestamp(os.path.getmtime(backup_path))
        print(f"  {i}. {backup} ({size} bytes, {mtime.strftime('%Y-%m-%d %H:%M:%S')})")
    
    return sorted(backups)

def export_summary():
    """Export a summary of attendance data"""
    if not os.path.exists("Attendance.csv"):
        print("❌ No Attendance.csv file found")
        return False
    
    try:
        with open("Attendance.csv", "r") as f:
            reader = csv.reader(f)
            rows = list(reader)
        
        if len(rows) <= 1:  # Only header or empty
            print("📊 No attendance data to summarize")
            return False
        
        # Count entries per person
        person_counts = {}
        for row in rows[1:]:  # Skip header
            if row and len(row) >= 1:
                name = row[0]
                person_counts[name] = person_counts.get(name, 0) + 1
        
        print("📊 Attendance Summary:")
        for name, count in sorted(person_counts.items()):
            print(f"  {name}: {count} entries")
        
        print(f"📈 Total entries: {sum(person_counts.values())}")
        return True
        
    except Exception as e:
        print(f"❌ Summary failed: {e}")
        return False

def main():
    """Main menu for backup utility"""
    while True:
        print("\n🎯 Attendance Backup Utility")
        print("1. Create backup")
        print("2. List backups")
        print("3. Restore from backup")
        print("4. Show attendance summary")
        print("5. Exit")
        
        choice = input("\nSelect option (1-5): ").strip()
        
        if choice == "1":
            backup_attendance()
        elif choice == "2":
            list_backups()
        elif choice == "3":
            backups = list_backups()
            if backups:
                try:
                    idx = int(input("Enter backup number to restore: ")) - 1
                    if 0 <= idx < len(backups):
                        backup_file = os.path.join("backups", backups[idx])
                        restore_attendance(backup_file)
                    else:
                        print("❌ Invalid backup number")
                except ValueError:
                    print("❌ Please enter a valid number")
        elif choice == "4":
            export_summary()
        elif choice == "5":
            print("👋 Goodbye!")
            break
        else:
            print("❌ Invalid choice. Please select 1-5.")

if __name__ == "__main__":
    main()