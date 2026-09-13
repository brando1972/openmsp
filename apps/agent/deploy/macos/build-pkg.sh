#!/bin/bash
# Build a SIGNED, NOTARIZED macOS installer .pkg for the OpenMSP agent.
# End users just double-click the resulting .pkg — nothing else to install.
#
# The daemon (headless, root) does the enrollment + heartbeats; the tray
# LaunchAgent runs in --ui-only mode so the Mac enrolls exactly once.
#
# Required env (vendor-side, one-time — never the end user's concern):
#   DEVELOPER_ID_APP       "Developer ID Application: Your Co (TEAMID)"
#   DEVELOPER_ID_INSTALLER "Developer ID Installer: Your Co (TEAMID)"
#   NOTARY_PROFILE         notarytool keychain profile name
#   SERVER                 control-plane base URL baked into the build
#   ENROLL_TOKEN           enrollment token baked into the build
# Optional: VERSION (default 0.2.0)
set -euo pipefail

VERSION="${VERSION:-0.2.0}"
HERE="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$(cd "$HERE/../.." && pwd)"
BUILD="$AGENT_DIR/build/pkg"
ROOT="$BUILD/root"                       # payload staged here
SCRIPTS="$BUILD/scripts"
IDENT="/usr/local/openmsp"

: "${DEVELOPER_ID_APP:?set DEVELOPER_ID_APP}"
: "${DEVELOPER_ID_INSTALLER:?set DEVELOPER_ID_INSTALLER}"
: "${NOTARY_PROFILE:?set NOTARY_PROFILE}"
: "${SERVER:?set SERVER}"
: "${ENROLL_TOKEN:?set ENROLL_TOKEN}"

rm -rf "$BUILD"; mkdir -p "$ROOT$IDENT" "$SCRIPTS" \
  "$ROOT/Library/LaunchDaemons" "$ROOT/Library/LaunchAgents"

echo "[*] Building universal daemon + tray binaries…"
( cd "$AGENT_DIR" && make build-macos VERSION="$VERSION" build-macos-tray VERSION="$VERSION" )
cp "$AGENT_DIR/bin/openmsp-agent-darwin"      "$ROOT$IDENT/openmsp-agent"
cp "$AGENT_DIR/bin/openmsp-agent-tray-darwin" "$ROOT$IDENT/openmsp-agent-tray"

echo "[*] Signing binaries (hardened runtime)…"
codesign --force --options runtime --timestamp --sign "$DEVELOPER_ID_APP" "$ROOT$IDENT/openmsp-agent"
codesign --force --options runtime --timestamp --sign "$DEVELOPER_ID_APP" "$ROOT$IDENT/openmsp-agent-tray"

# Preconfigure server + token so the postinstall can enroll silently
cat > "$ROOT$IDENT/openmsp-agent.json" <<JSON
{
  "serverUrl": "$SERVER",
  "token": "$ENROLL_TOKEN"
}
JSON
chmod 600 "$ROOT$IDENT/openmsp-agent.json"

cp "$HERE/com.openmsp.agent.plist"      "$ROOT/Library/LaunchDaemons/com.openmsp.agent.plist"
cp "$HERE/com.openmsp.agent.tray.plist" "$ROOT/Library/LaunchAgents/com.openmsp.agent.tray.plist"
# LaunchAgent template uses __HOME__ / user Application Support; for the pkg the
# tray runs the installed binary in ui-only mode from /usr/local/openmsp.
/usr/bin/sed -i '' "s|__HOME__/Library/Application Support/OpenMSP/openmsp-agent-tray|$IDENT/openmsp-agent-tray|g; s|__HOME__/Library/Application Support/OpenMSP/openmsp-agent.json|$IDENT/openmsp-agent.json|g; s|__HOME__/Library/Logs|/tmp|g" "$ROOT/Library/LaunchAgents/com.openmsp.agent.tray.plist"
# Add --ui-only to the tray LaunchAgent args
/usr/bin/plutil -insert ProgramArguments.1 -string "--ui-only" "$ROOT/Library/LaunchAgents/com.openmsp.agent.tray.plist" 2>/dev/null || true

# Bundle the MeshCentral enrollment helper + the group agent into the payload so
# the postinstall can enroll into the ApexMSP mesh group with zero user steps.
# RECOMMENDED: drop the PRE-TAGGED macOS agent from the group's "Add Agent" dialog
# at deploy/macos/mesh/meshagent.pkg (no .msh/ids needed). Everything under
# deploy/macos/mesh/ is copied into the payload. If nothing is bundled, enrollment
# is skipped cleanly at install (see scripts/mesh-enroll.sh).
install -m 0755 "$HERE/scripts/mesh-enroll.sh" "$ROOT$IDENT/mesh-enroll.sh"
if [ -d "$HERE/mesh" ] && [ -n "$(ls -A "$HERE/mesh" 2>/dev/null)" ]; then
  mkdir -p "$ROOT$IDENT/mesh"
  # .pkg / raw binary → 0755 (executable); .msh and everything else → 0644.
  for f in "$HERE"/mesh/*; do
    [ -f "$f" ] || continue
    case "$f" in
      *.pkg|*/meshagent) install -m 0755 "$f" "$ROOT$IDENT/mesh/$(basename "$f")" ;;
      *)                 install -m 0644 "$f" "$ROOT$IDENT/mesh/$(basename "$f")" ;;
    esac
  done
else
  echo "[!] No deploy/macos/mesh/ agent bundled — MeshCentral enrollment will be skipped at install."
fi

cp "$HERE/scripts/postinstall" "$SCRIPTS/postinstall"
chmod +x "$SCRIPTS/postinstall"

echo "[*] pkgbuild…"
COMPONENT="$BUILD/openmsp-agent-component.pkg"
pkgbuild --root "$ROOT" --scripts "$SCRIPTS" \
  --identifier com.openmsp.agent --version "$VERSION" \
  --install-location / "$COMPONENT"

echo "[*] productbuild + sign installer…"
FINAL="$AGENT_DIR/bin/OpenMSP-Agent-$VERSION.pkg"
productbuild --package "$COMPONENT" --sign "$DEVELOPER_ID_INSTALLER" "$FINAL"

echo "[*] Notarize + staple…"
xcrun notarytool submit "$FINAL" --keychain-profile "$NOTARY_PROFILE" --wait
xcrun stapler staple "$FINAL"

echo "[+] Built signed, notarized installer: $FINAL"
