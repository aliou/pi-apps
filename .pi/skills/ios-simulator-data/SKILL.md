---
name: ios-simulator-data
description: Accessing iOS Simulator data including Files app storage and SQLite/GRDB databases. Use when debugging simulator data, adding test files, or inspecting database contents.
---

# iOS Simulator Data Access

## Finding the Booted Simulator

```bash
# List booted simulators
xcrun simctl list devices booted

# Get detailed app info for booted simulator
xcrun simctl listapps booted
```

## Adding Files to the Files App

The Files app's "On My iPhone" storage is located in the **File Provider Storage** directory.

### Step 1: Get the File Provider Storage Path

```bash
xcrun simctl listapps booted | grep -A2 "FileProvider.LocalStorage"
```

This returns something like:
```
"group.com.apple.FileProvider.LocalStorage" = "file:///Users/username/Library/Developer/CoreSimulator/Devices/DEVICE-UUID/data/Containers/Shared/AppGroup/APPGROUP-UUID/";
```

### Step 2: Copy Files

Remove `file://` prefix and append `File Provider Storage/`:

```bash
# Extract path and copy file
FILES_PATH=$(xcrun simctl listapps booted | grep "FileProvider.LocalStorage" | awk -F'"' '{print $4}' | sed 's|file://||')
cp myfile.json "${FILES_PATH}File Provider Storage/"
```

### One-liner for Known Simulator

If you know the simulator UUID:

```bash
SIMULATOR_ID="YOUR-SIMULATOR-UUID"
# Find the AppGroup UUID first, then:
cp myfile.json "/Users/$(whoami)/Library/Developer/CoreSimulator/Devices/$SIMULATOR_ID/data/Containers/Shared/AppGroup/APPGROUP-UUID/File Provider Storage/"
```

### Alternative: Drag and Drop

1. **ZIP method**: Zip the file, drag onto simulator, Files app opens to decompress
2. **Share menu**: Right-click file in Finder → Share → Simulator

## Accessing GRDB/SQLite Databases

### Finding the Database

App databases are stored in the app's container:

```bash
SIMULATOR_ID="YOUR-SIMULATOR-UUID"
find ~/Library/Developer/CoreSimulator/Devices/$SIMULATOR_ID -name "*.sqlite" 2>/dev/null | grep -v "httpstorages"
```

Or search by database name:

```bash
find ~/Library/Developer/CoreSimulator/Devices/$SIMULATOR_ID -name "myapp.sqlite" 2>/dev/null
```

Typical path pattern:
```
~/Library/Developer/CoreSimulator/Devices/DEVICE-UUID/data/Containers/Data/Application/APP-UUID/Library/Application Support/myapp.sqlite
```

### Querying the Database

```bash
DB_PATH="/path/to/myapp.sqlite"

# List tables
sqlite3 "$DB_PATH" ".tables"

# View schema
sqlite3 "$DB_PATH" ".schema tableName"

# Query data
sqlite3 "$DB_PATH" "SELECT * FROM tableName;"

# Query with headers
sqlite3 -header -column "$DB_PATH" "SELECT * FROM tableName;"
```

### Common GRDB Operations

```bash
# Check migrations
sqlite3 "$DB_PATH" "SELECT * FROM grdb_migrations;"

# Clear a table
sqlite3 "$DB_PATH" "DELETE FROM tableName;"

# Clear all app data (be careful!)
sqlite3 "$DB_PATH" "
DELETE FROM table1;
DELETE FROM table2;
DELETE FROM table3;
"
```

### WAL Mode Notes

GRDB uses WAL (Write-Ahead Logging) by default. You may see these files:
- `myapp.sqlite` - Main database
- `myapp.sqlite-wal` - Write-ahead log
- `myapp.sqlite-shm` - Shared memory file

To ensure all data is visible when querying externally:

```bash
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);"
```

## Simulator Directory Structure

```
~/Library/Developer/CoreSimulator/Devices/
└── DEVICE-UUID/
    └── data/
        ├── Containers/
        │   ├── Data/
        │   │   └── Application/
        │   │       └── APP-UUID/
        │   │           ├── Documents/
        │   │           ├── Library/
        │   │           │   ├── Application Support/  ← Databases here
        │   │           │   ├── Caches/
        │   │           │   └── Preferences/
        │   │           └── tmp/
        │   └── Shared/
        │       └── AppGroup/
        │           └── APPGROUP-UUID/
        │               └── File Provider Storage/  ← Files app storage
        ├── Documents/  ← NOT used by Files app
        ├── Downloads/  ← NOT used by Files app
        └── Library/
```

## Useful Commands

```bash
# Boot a simulator
xcrun simctl boot "iPhone 17"

# Open simulator app
open -a Simulator

# Install app on booted simulator
xcrun simctl install booted /path/to/App.app

# Uninstall app
xcrun simctl uninstall booted com.example.myapp

# Open URL in simulator
xcrun simctl openurl booted "myapp://some/path"

# Add media (photos/videos)
xcrun simctl addmedia booted /path/to/image.jpg

# Erase simulator (reset to factory)
xcrun simctl erase DEVICE-UUID

# Get app container path
xcrun simctl get_app_container booted com.example.myapp data
```

## Troubleshooting

### Files Not Appearing in Files App

1. Verify the File Provider Storage path is correct for the **booted** simulator
2. The AppGroup UUID changes when simulator is erased
3. Restart the Files app on the simulator after copying

### Database Locked Errors

If you get "database is locked" when querying:
1. Close the app in the simulator
2. Or use `sqlite3` with `.timeout 5000` command

### Finding the Right Simulator

Multiple simulators may exist. Find the correct one:

```bash
# List all simulators with their UUIDs
for dir in ~/Library/Developer/CoreSimulator/Devices/*/; do
    if [ -f "$dir/device.plist" ]; then
        name=$(defaults read "${dir}device.plist" name 2>/dev/null)
        udid=$(basename "$dir")
        echo "$udid: $name"
    fi
done | grep -i "iphone"
```
