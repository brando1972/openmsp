#!/bin/bash
# Removes the OpenMSP macOS agent. Usage: sudo ./uninstall.sh
set -euo pipefail
PLIST_DST="/Library/LaunchDaemons/com.openmsp.agent.plist"
INSTALL_DIR="/usr/local/openmsp"

if [[ $EUID -ne 0 ]]; then echo "Must run as root (use sudo)."; exit 1; fi

launchctl bootout system "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"
rm -rf "$INSTALL_DIR"
echo "[+] OpenMSP agent removed."
