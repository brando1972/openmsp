#!/usr/bin/env bash
#
# Cut an ApexMSP agent release.
# ---------------------------------------------------------------------------
# Cross-compiles the agent for every platform and publishes a manifest so that
# every enrolled agent self-updates on its next heartbeat (checksum-verified).
# Cutting a release is a file drop — no API redeploy needed.
#
# Run it ON docker-1 (it uses the golang Docker image, so nothing needs Go
# installed):
#
#   # from the Mac (or wherever you have `ssh docker-1`):
#   ssh docker-1 'bash -s' < scripts/release-agent.sh
#
# To release a new version:
#   1. bump  apps/agent/internal/version/version.go  (Version = "1.2.0")
#   2. commit + push, redeploy the API (which refreshes /root/openmsp-api/build)
#   3. run this script
#   Agents pick it up within one heartbeat (~30s) and re-exec into the new build.
#
# Env overrides: SRC (agent source dir), OUT (builds dir served by the API),
# GOIMAGE (golang image tag).
set -euo pipefail

SRC=${SRC:-/root/openmsp-api/build/apps/agent}
OUT=${OUT:-/root/openmsp-api/builds}
GOIMAGE=${GOIMAGE:-golang:1.25}

if [ ! -f "$SRC/internal/version/version.go" ]; then
  echo "agent source not found at $SRC (refresh it: redeploy the API, which runs 'git archive main')." >&2
  exit 1
fi

VERSION=$(grep -oE 'Version = "[0-9]+\.[0-9]+\.[0-9]+"' "$SRC/internal/version/version.go" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
if [ -z "$VERSION" ]; then echo "could not read Version from version.go" >&2; exit 1; fi
mkdir -p "$OUT"

TARGETS=("darwin/arm64" "darwin/amd64" "linux/amd64" "linux/arm64" "windows/amd64")

echo "Building ApexMSP agent v$VERSION for: ${TARGETS[*]}"
json="{\"version\":\"$VERSION\",\"artifacts\":{"
first=1
for t in "${TARGETS[@]}"; do
  goos=${t%/*}; goarch=${t#*/}
  ext=""; [ "$goos" = "windows" ] && ext=".exe"
  file="apexagent-$VERSION-$goos-$goarch$ext"
  echo "  -> $file"
  docker run --rm \
    -v "$SRC":/src -v "$OUT":/out -w /src \
    -e GOOS="$goos" -e GOARCH="$goarch" -e GOTOOLCHAIN=auto -e CGO_ENABLED=0 \
    "$GOIMAGE" go build -trimpath -ldflags "-s -w" -o "/out/$file" ./cmd/agent
  sha=$(sha256sum "$OUT/$file" | awk '{print $1}')
  [ $first -eq 0 ] && json+=","
  json+="\"$goos/$goarch\":{\"file\":\"$file\",\"sha256\":\"$sha\"}"
  first=0
done
json+="}}"

printf '%s\n' "$json" > "$OUT/manifest.json"
echo "Published manifest:"
cat "$OUT/manifest.json"
echo
echo "Done. Enrolled agents below v$VERSION will update on their next heartbeat."
echo "Fresh installs: download from https://api.apexmsp.app/api/v1/agents/download/<os>/<arch>"
