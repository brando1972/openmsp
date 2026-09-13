#!/bin/bash
# Removes the OpenMSP macOS agent. Usage: sudo ./uninstall.sh
set -euo pipefail
DAEMON_PLIST="/Library/LaunchDaemons/com.openmsp.agent.plist"
TRAY_PLIST="/Library/LaunchAgents/com.openmsp.agent.tray.plist"
INSTALL_DIR="/usr/local/openmsp"

if [[ $EUID -ne 0 ]]; then echo "Must run as root (use sudo)."; exit 1; fi

# Unload and remove the headless daemon
launchctl bootout system "$DAEMON_PLIST" 2>/dev/null || true
rm -f "$DAEMON_PLIST"

# Unload and remove the tray LaunchAgent for all logged-in users
for uid in $(dscl . -list /Users UniqueID | awk '$2 >= 500 {print $2}'); do
  launchctl bootout "gui/$uid" "$TRAY_PLIST" 2>/dev/null || true
done
rm -f "$TRAY_PLIST"

rm -rf "$INSTALL_DIR"
echo "[+] OpenMSP agent removed."
