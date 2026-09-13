#!/bin/bash
# Enroll this Mac into the ApexMSP MeshCentral device group (remote support).
#
# Called from the .pkg postinstall and from install.sh. It is deliberately
# IDEMPOTENT and NON-FATAL: a mesh enrollment failure (nothing bundled, no
# network, install error) must NEVER fail the ApexMSP agent install — it logs a
# clear line and exits 0.
#
# RECOMMENDED (zero config): bundle the PRE-TAGGED macOS agent that MeshCentral
# hands you in the group's "Add Agent" dialog — it already has the server URL +
# ApexMSP group baked in, so NO .msh and NO ids are needed. Drop it at:
#     deploy/macos/mesh/meshagent.pkg      (the Apple .pkg from Add Agent)   OR
#     deploy/macos/mesh/meshagent          (a pre-tagged universal binary)
#
# ADVANCED (generic agent + descriptor): if you instead bundle the *generic*
# universal binary, also supply the group ".msh" (MeshName/MeshType/MeshID/
# ServerID/MeshServer) via MESH_MSH or deploy/macos/mesh/apexmsp.msh.
#
# Config (env — all optional):
#   MESH_SERVER_URL     MeshCentral base URL. Default https://mesh.apexmsp.app
#   MESH_GROUP          device group name (informational). Default ApexMSP
#   MESH_MSH            path to the group .msh, OR base64 of its contents
#                       (only needed for the generic-agent path).
#   MESH_MAC_AGENT_URL  generic meshagent download URL (generic-agent path).
#                       Default $MESH_SERVER_URL/meshagents?id=10005
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
log() { echo "[mesh] $*"; }

MESH_SERVER_URL="${MESH_SERVER_URL:-https://mesh.apexmsp.app}"
MESH_SERVER_URL="${MESH_SERVER_URL%/}"
MESH_GROUP="${MESH_GROUP:-ApexMSP}"
MESH_MAC_AGENT_URL="${MESH_MAC_AGENT_URL:-$MESH_SERVER_URL/meshagents?id=10005}"

MESHDIR="$HERE/mesh"

# Idempotent: if the MeshAgent is already installed, do nothing.
if [ -f "/Library/LaunchDaemons/meshagent.plist" ] || [ -x "/usr/local/mesh_services/meshagent/meshagent" ]; then
  log "MeshAgent already installed — skipping enrollment."
  exit 0
fi

# ---- Path 1 (recommended): pre-tagged Apple .pkg from Add Agent ----------------
# Self-contained installer; enrolls into the embedded group with no .msh.
PKG="$(ls "$MESHDIR"/*.pkg 2>/dev/null | head -n1 || true)"
if [ -n "${PKG:-}" ] && [ -f "$PKG" ]; then
  log "Installing pre-tagged MeshAgent pkg: $(basename "$PKG") (group: $MESH_GROUP)"
  if /usr/sbin/installer -pkg "$PKG" -target / >/dev/null 2>&1; then
    log "MeshAgent installed and enrolled into '$MESH_GROUP'."
  else
    log "MeshAgent pkg install returned non-zero — continuing (ApexMSP agent unaffected)."
  fi
  exit 0
fi

WORK="$(mktemp -d /tmp/apexmsp-mesh.XXXXXX)" || { log "mktemp failed — skipping."; exit 0; }
trap 'rm -rf "$WORK"' EXIT

# ---- Resolve the optional group .msh (only used with a generic binary) ---------
MSH=""
BUNDLED_MSH="$MESHDIR/apexmsp.msh"
if [ -n "${MESH_MSH:-}" ] && [ -f "$MESH_MSH" ]; then
  MSH="$WORK/meshagent.msh"; cp "$MESH_MSH" "$MSH"
elif [ -n "${MESH_MSH:-}" ]; then
  MSH="$WORK/meshagent.msh"
  printf '%s' "$MESH_MSH" | /usr/bin/base64 -D > "$MSH" 2>/dev/null || MSH=""
elif [ -f "$BUNDLED_MSH" ]; then
  MSH="$WORK/meshagent.msh"; cp "$BUNDLED_MSH" "$MSH"
fi

# ---- Path 2: pre-tagged raw binary bundled at mesh/meshagent -------------------
# ---- Path 3: generic binary (bundled or downloaded) + .msh --------------------
AGENT="$WORK/meshagent"
BUNDLED_AGENT="$MESHDIR/meshagent"
if [ -f "$BUNDLED_AGENT" ]; then
  cp "$BUNDLED_AGENT" "$AGENT"
elif [ -n "$MSH" ]; then
  # Only worth downloading the generic agent if we have a .msh to bind it.
  log "Downloading generic MeshAgent from $MESH_MAC_AGENT_URL"
  /usr/bin/curl -fsSL "$MESH_MAC_AGENT_URL" -o "$AGENT" 2>/dev/null || {
    log "MeshAgent download failed (network restricted?) — skipping enrollment."; exit 0; }
else
  log "MeshCentral enrollment skipped: nothing bundled (add deploy/macos/mesh/meshagent.pkg"
  log "from the group 'Add Agent' dialog, or a generic binary + apexmsp.msh). See README.md."
  exit 0
fi

if [ ! -s "$AGENT" ]; then log "MeshAgent binary is empty — skipping."; exit 0; fi
chmod +x "$AGENT" 2>/dev/null || true

# If we have a .msh, place it beside the binary so a generic agent binds the group.
# A pre-tagged binary ignores this and uses its embedded config.
[ -n "$MSH" ] && cp "$MSH" "$WORK/meshagent.msh"

log "Installing MeshAgent (group: $MESH_GROUP, server: $MESH_SERVER_URL)"
if ( cd "$WORK" && ./meshagent -install ) >/dev/null 2>&1; then
  log "MeshAgent installed and enrolled into '$MESH_GROUP'."
else
  log "MeshAgent install returned non-zero — continuing (ApexMSP agent unaffected)."
fi

exit 0
