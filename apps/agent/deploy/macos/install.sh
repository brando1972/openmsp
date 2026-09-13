#!/bin/bash
# OpenMSP macOS agent installer. Installs the agent as a root LaunchDaemon.
# Usage: sudo ./install.sh --server https://control.example.com --token <enroll-token> [--server-key <base64-ed25519>]
set -euo pipefail

SERVER=""
TOKEN=""
SERVER_KEY=""
INSTALL_DIR="/usr/local/openmsp"
BIN_SRC="$(cd "$(dirname "$0")/../.." && pwd)/bin/openmsp-agent-darwin"
PLIST_SRC="$(dirname "$0")/com.openmsp.agent.plist"
PLIST_DST="/Library/LaunchDaemons/com.openmsp.agent.plist"
CONFIG="${INSTALL_DIR}/openmsp-agent.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server) SERVER="$2"; shift 2;;
    --token) TOKEN="$2"; shift 2;;
    --server-key) SERVER_KEY="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ $EUID -ne 0 ]]; then echo "Must run as root (use sudo)."; exit 1; fi
if [[ -z "$SERVER" || -z "$TOKEN" ]]; then echo "Both --server and --token are required."; exit 1; fi
if [[ ! -f "$BIN_SRC" ]]; then echo "Binary not found at $BIN_SRC (run: make build-macos)"; exit 1; fi

echo "[*] Installing to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
install -m 0755 "$BIN_SRC" "${INSTALL_DIR}/openmsp-agent"

echo "[*] Enrolling device..."
ENROLL_ARGS=(--server "$SERVER" --token "$TOKEN" --config "$CONFIG" --run-once)
if [[ -n "$SERVER_KEY" ]]; then ENROLL_ARGS+=(--server-key "$SERVER_KEY"); fi
"${INSTALL_DIR}/openmsp-agent" "${ENROLL_ARGS[@]}"
chmod 600 "$CONFIG"

echo "[*] Installing LaunchDaemon"
cp "$PLIST_SRC" "$PLIST_DST"
chown root:wheel "$PLIST_DST"
chmod 644 "$PLIST_DST"

# Load (bootstrap) the daemon
launchctl bootout system "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap system "$PLIST_DST"
launchctl enable system/com.openmsp.agent

# MeshCentral remote-support enrollment (ApexMSP group). Non-fatal, idempotent,
# config-driven — see scripts/mesh-enroll.sh. Skips cleanly if no .msh is set.
MESH_ENROLL="$(dirname "$0")/scripts/mesh-enroll.sh"
if [[ -x "$MESH_ENROLL" ]]; then
  "$MESH_ENROLL" || true
fi

echo "[+] OpenMSP agent installed and running. Logs: /var/log/openmsp-agent.log"
