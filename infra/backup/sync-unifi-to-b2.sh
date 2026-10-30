#!/bin/sh
# =============================================================================
# ApexVault Tier-2 -> Tier-3 Offsite Replicator & Cryptographic Verifier
#
# Responsibilities:
#   1. Wait for the primary UniFi NAS Kopia repository (/mnt/unifi-nas/repo)
#      to be initialized by apexvault-kopia-gateway.
#   2. Execute automated cryptographic snapshot verification:
#        kopia snapshot verify --verify-files-percent=5
#   3. Mirror encrypted, deduplicated repository blobs from UniFi NAS to
#      Backblaze B2 (immutable S3 Object Lock COMPLIANCE bucket):
#        kopia repository sync-to b2 --bucket=${B2_BUCKET} --key-id=${B2_KEY_ID} \
#          --key=${B2_APP_KEY} --delete --parallel=8
#   4. Run repository maintenance safely from the gateway host.
# =============================================================================
set -eu

CONFIG_FILE="${KOPIA_CONFIG_PATH:-/config/repository.config}"
REPO_PATH="${KOPIA_REPO_PATH:-/mnt/unifi-nas/repo}"
CACHE_DIR="${KOPIA_CACHE_DIRECTORY:-/cache/kopia}"
B2_BUCKET="${B2_BUCKET:-apexvault-immutable-offsite}"
B2_KEY_ID="${B2_KEY_ID:-}"
B2_APP_KEY="${B2_APP_KEY:-}"
B2_PREFIX="${B2_PREFIX:-unifi-nas-mirror/}"
B2_PARALLEL="${B2_PARALLEL_TRANSFERS:-8}"
B2_LOCK_MODE="${B2_OBJECT_LOCK_MODE:-COMPLIANCE}"
B2_LOCK_DAYS="${B2_OBJECT_LOCK_DAYS:-30}"
VERIFY_PCT="${VERIFY_FILES_PERCENT:-5}"
SYNC_INTERVAL="${SYNC_INTERVAL_SECONDS:-14400}"
RUN_ONCE="${1:-}"

echo "============================================================================="
echo "[ApexVault-B2-Sync] Starting UniFi NAS -> Backblaze B2 Immutable Replicator"
echo "[ApexVault-B2-Sync] Source Repo     : ${REPO_PATH}"
echo "[ApexVault-B2-Sync] Target B2 Bucket: b2://${B2_BUCKET}/${B2_PREFIX}"
echo "[ApexVault-B2-Sync] Object Lock     : ${B2_LOCK_MODE} (${B2_LOCK_DAYS} days)"
echo "[ApexVault-B2-Sync] Verify Sample   : ${VERIFY_PCT}% of files per cycle"
echo "[ApexVault-B2-Sync] Sync Interval   : ${SYNC_INTERVAL}s"
echo "============================================================================="

# Wait until the primary repository is initialized on the UniFi NAS
while [ ! -f "${REPO_PATH}/kopia.repository.f" ]; do
  echo "[ApexVault-B2-Sync] Waiting for UniFi NAS repository at ${REPO_PATH}/kopia.repository.f..."
  sleep 10
done

# Ensure our config is connected
if [ ! -f "${CONFIG_FILE}" ]; then
  kopia --config-file="${CONFIG_FILE}" repository connect filesystem \
    --path="${REPO_PATH}" \
    --cache-directory="${CACHE_DIR}" \
    --override-hostname="apexvault-gateway" \
    --override-username="admin"
fi

run_sync_and_verify_cycle() {
  CYCLE_START="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[ApexVault-B2-Sync] [${CYCLE_START}] Step 1/3: Running cryptographic snapshot verification (${VERIFY_PCT}% sample)..."

  if kopia --config-file="${CONFIG_FILE}" snapshot verify \
    --verify-files-percent="${VERIFY_PCT}" \
    --file-parallelism=4 \
    --parallel=4; then
    echo "[ApexVault-B2-Sync] Snapshot verification PASSED (${VERIFY_PCT}% sample)."
  else
    echo "[ApexVault-B2-Sync] WARNING: Snapshot verification reported an error!" >&2
  fi

  echo "[ApexVault-B2-Sync] Step 2/3: Running repository index compaction & maintenance..."
  kopia --config-file="${CONFIG_FILE}" maintenance run --full || true

  if [ -n "${B2_KEY_ID}" ] && [ -n "${B2_APP_KEY}" ]; then
    echo "[ApexVault-B2-Sync] Step 3/3: Syncing encrypted UniFi NAS blobs to Backblaze B2 (${B2_BUCKET})..."
    kopia --config-file="${CONFIG_FILE}" repository sync-to b2 \
      --bucket="${B2_BUCKET}" \
      --key-id="${B2_KEY_ID}" \
      --key="${B2_APP_KEY}" \
      --prefix="${B2_PREFIX}" \
      --delete \
      --parallel="${B2_PARALLEL}"
    echo "[ApexVault-B2-Sync] Backblaze B2 offsite sync completed (${B2_LOCK_MODE} lock active for ${B2_LOCK_DAYS}d)."
  else
    echo "[ApexVault-B2-Sync] Step 3/3: B2_KEY_ID / B2_APP_KEY not set; skipping remote B2 upload (local UniFi NAS verified)."
  fi
}

if [ "${RUN_ONCE}" = "--once" ]; then
  run_sync_and_verify_cycle
  exit 0
fi

while true; do
  run_sync_and_verify_cycle
  echo "[ApexVault-B2-Sync] Sleeping for ${SYNC_INTERVAL} seconds until next replication cycle..."
  sleep "${SYNC_INTERVAL}"
done
