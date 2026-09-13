#!/bin/bash
# Installs the OpenMSP status-bar (menu-bar) agent as a per-user LaunchAgent.
# Runs in your GUI session (no sudo). Build the binary first:  make build-macos-tray
# Usage:
#   ./install-tray.sh --server https://control.example.com --token <enroll-token>
set -euo pipefail

SERVER=""
TOKEN=""
SERVER_KEY=""
APPDIR="$HOME/Library/Application Support/OpenMSP"
AGENTS="$HOME/Library/LaunchAgents"
PLIST_SRC="$(dirname "$0")/com.openmsp.agent.tray.plist"
PLIST_DST="$AGENTS/com.openmsp.agent.tray.plist"
BIN_SRC="$(cd "$(dirname "$0")/../.." && pwd)/bin/openmsp-agent-tray-darwin-arm64"
CONFIG="$APPDIR/openmsp-agent.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server) SERVER="$2"; shift 2;;
    --token) TOKEN="$2"; shift 2;;
    --server-key) SERVER_KEY="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ -z "$SERVER" || -z "$TOKEN" ]]; then echo "Both --server and --token are required."; exit 1; fi
if [[ ! -f "$BIN_SRC" ]]; then echo "Binary not found at $BIN_SRC (run: make build-macos-tray)"; exit 1; fi

echo "[*] Installing to $APPDIR"
mkdir -p "$APPDIR" "$AGENTS" "$HOME/Library/Logs"
cp "$BIN_SRC" "$APPDIR/openmsp-agent-tray"
chmod +x "$APPDIR/openmsp-agent-tray"
# Ad-hoc sign so Gatekeeper/AMFI will run it
codesign --force -s - "$APPDIR/openmsp-agent-tray" 2>/dev/null || true

echo "[*] Enrolling device..."
ENROLL_ARGS=(--server "$SERVER" --token "$TOKEN" --config "$CONFIG" --run-once)
if [[ -n "$SERVER_KEY" ]]; then ENROLL_ARGS+=(--server-key "$SERVER_KEY"); fi
"$APPDIR/openmsp-agent-tray" "${ENROLL_ARGS[@]}"
chmod 600 "$CONFIG"

echo "[*] Installing LaunchAgent"
sed "s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DST"

# Load into the current GUI session
launchctl bootout "gui/$(id -u)/com.openmsp.agent.tray" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/com.openmsp.agent.tray"

echo "[+] OpenMSP tray agent installed. Look for the 'A' icon in your menu bar."
echo "    Logs: ~/Library/Logs/openmsp-agent-tray.log"
echo "    Remove with: launchctl bootout gui/$(id -u)/com.openmsp.agent.tray && rm \"$PLIST_DST\""
