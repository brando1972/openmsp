#!/usr/bin/env bash
# Build + install the ApexMSP menu-bar app on this Mac (needs Xcode/CLT swiftc).
# Compiles the Swift source into an .app bundle, ad-hoc signs it, and installs a
# LaunchAgent so it starts at login and now.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Applications/ApexMSP.app"
LABEL="app.apexmsp.menubar"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "== compiling =="
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O "$HERE/ApexMSPMenuBar.swift" -o "$APP/Contents/MacOS/ApexMSP" -framework Cocoa

cat > "$APP/Contents/Info.plist" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>ApexMSP</string>
  <key>CFBundleDisplayName</key><string>ApexMSP</string>
  <key>CFBundleIdentifier</key><string>app.apexmsp.menubar</string>
  <key>CFBundleExecutable</key><string>ApexMSP</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
</dict></plist>
PLISTEOF

echo "== signing (ad-hoc) =="
codesign --force --deep -s - "$APP"

echo "== launch agent =="
cat > "$PLIST" <<AGENTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$APP/Contents/MacOS/ApexMSP</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
</dict></plist>
AGENTEOF

UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
sleep 1
launchctl bootstrap "gui/$UID_NUM" "$PLIST" 2>/dev/null || launchctl load "$PLIST"
echo "== installed. The sharkfin should appear in the menu bar. =="
