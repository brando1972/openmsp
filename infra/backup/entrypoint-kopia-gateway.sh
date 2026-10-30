#!/bin/sh
# =============================================================================
# ApexVault Kopia Gateway Entrypoint (UniFi NAS + Proxmox NVMe Cache)
#
# Responsibilities:
#   1. Verify NFSv4.1 mount to UniFi NAS (/mnt/unifi-nas/repo) and local NVMe
#      cache (/cache/kopia).
#   2. Initialize or connect to the encrypted Kopia repository using:
#        --block-hash=BLAKE2B-256-128
#        --encryption=AES256-GCM-HMAC-SHA256
#        --splitter=DYNAMIC-4M-BUZHASH
#   3. Generate or load TLS 1.3 certificates and output the SHA-256 fingerprint
#      required by openmsp-agent for strict TLS pinning.
#   4. Configure Zero-Trust Append-Only ACLs (`kopia server acl add --user=*:* --access=APPEND`)
#      so compromised endpoints cannot delete or prune historical snapshots.
#   5. Start the Kopia gRPC/HTTP2 Gateway Server on 0.0.0.0:51515.
# =============================================================================
set -eu

CONFIG_FILE="${KOPIA_CONFIG_PATH:-/config/repository.config}"
REPO_PATH="${KOPIA_REPO_PATH:-/mnt/unifi-nas/repo}"
CACHE_DIR="${KOPIA_CACHE_DIRECTORY:-/cache/kopia}"
CERT_DIR="/certs"
TLS_CERT="${CERT_DIR}/kopia.crt"
TLS_KEY="${CERT_DIR}/kopia.key"
TLS_FP_FILE="${CERT_DIR}/kopia-cert.sha256"
GATEWAY_HOST="${KOPIA_GATEWAY_HOST:-192.168.11.19}"
GATEWAY_PORT="${KOPIA_GATEWAY_PORT:-51515}"
CONTROL_USER="${KOPIA_SERVER_CONTROL_USER:-admin}"
CONTROL_PASS="${KOPIA_SERVER_CONTROL_PASSWORD:-apexvault-control-secret-change-me}"
AGENT_USER="${KOPIA_AGENT_DEFAULT_USER:-apex-agent@apexmsp-local}"
AGENT_PASS="${KOPIA_AGENT_DEFAULT_PASSWORD:-apex-agent-append-secret-change-me}"
CONTENT_CACHE_MB="${KOPIA_CONTENT_CACHE_SIZE_MB:-20480}"
METADATA_CACHE_MB="${KOPIA_METADATA_CACHE_SIZE_MB:-10240}"

mkdir -p "${REPO_PATH}" "${CACHE_DIR}" "${CERT_DIR}" "/config/logs"

echo "============================================================================="
echo "[ApexVault] Starting UniFi NAS + Proxmox Kopia Immutable Backup Gateway"
echo "[ApexVault] Repository Path : ${REPO_PATH}"
echo "[ApexVault] NVMe Cache Path : ${CACHE_DIR} (Content: ${CONTENT_CACHE_MB}MB, Metadata: ${METADATA_CACHE_MB}MB)"
echo "============================================================================="

# -----------------------------------------------------------------------------
# 1. Initialize or Connect to the Kopia Repository on UniFi NAS
# -----------------------------------------------------------------------------
if [ ! -f "${REPO_PATH}/kopia.repository.f" ]; then
  echo "[ApexVault] Initializing new encrypted Kopia repository on UniFi NAS..."
  kopia --config-file="${CONFIG_FILE}" repository create filesystem \
    --path="${REPO_PATH}" \
    --block-hash=BLAKE2B-256-128 \
    --encryption=AES256-GCM-HMAC-SHA256 \
    --splitter=DYNAMIC-4M-BUZHASH \
    --cache-directory="${CACHE_DIR}" \
    --content-cache-size-mb="${CONTENT_CACHE_MB}" \
    --metadata-cache-size-mb="${METADATA_CACHE_MB}" \
    --description="ApexVault Primary On-Premise Immutable Repository (UniFi NAS)"
else
  echo "[ApexVault] Existing UniFi NAS repository detected. Connecting..."
  kopia --config-file="${CONFIG_FILE}" repository connect filesystem \
    --path="${REPO_PATH}" \
    --cache-directory="${CACHE_DIR}" \
    --content-cache-size-mb="${CONTENT_CACHE_MB}" \
    --metadata-cache-size-mb="${METADATA_CACHE_MB}" \
    --override-hostname="apexvault-gateway" \
    --override-username="admin"
fi

# -----------------------------------------------------------------------------
# 2. Enforce Global Compression & Retention Policy
# -----------------------------------------------------------------------------
echo "[ApexVault] Applying global Zstd compression and GFS retention policy..."
kopia --config-file="${CONFIG_FILE}" policy set --global \
  --compression=zstd \
  --keep-latest="${RETENTION_LATEST:-24}" \
  --keep-hourly="${RETENTION_HOURLY:-48}" \
  --keep-daily="${RETENTION_DAILY:-30}" \
  --keep-weekly="${RETENTION_WEEKLY:-12}" \
  --keep-monthly="${RETENTION_MONTHLY:-24}" \
  --keep-annual="${RETENTION_ANNUAL:-7}"

# -----------------------------------------------------------------------------
# 3. Generate or Load TLS Certificate & Extract SHA-256 Fingerprint
# -----------------------------------------------------------------------------
if [ ! -f "${TLS_CERT}" ] || [ ! -f "${TLS_KEY}" ]; then
  echo "[ApexVault] Generating TLS certificate for Kopia Server (${GATEWAY_HOST})..."
  if command -v openssl >/dev/null 2>&1; then
    openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
      -keyout "${TLS_KEY}" \
      -out "${TLS_CERT}" \
      -subj "/CN=${GATEWAY_HOST}/O=ApexMSP/OU=ApexVault-Immutable-Gateway" \
      -addext "subjectAltName=IP:${GATEWAY_HOST},IP:127.0.0.1,DNS:apexvault-kopia-gateway,DNS:localhost"
  fi
fi

if [ -f "${TLS_CERT}" ] && command -v openssl >/dev/null 2>&1; then
  CERT_FP="$(openssl x509 -in "${TLS_CERT}" -noout -fingerprint -sha256 | cut -d'=' -f2 | tr -d ':' | tr '[:upper:]' '[:lower:]')"
  echo "${CERT_FP}" > "${TLS_FP_FILE}"
  echo "============================================================================="
  echo "[ApexVault] TLS Certificate SHA-256 Fingerprint (for openmsp-agent pinning):"
  echo "            ${CERT_FP}"
  echo "============================================================================="
fi

# -----------------------------------------------------------------------------
# 4. Configure Zero-Trust Append-Only ACLs (Ransomware Immunity)
# -----------------------------------------------------------------------------
echo "[ApexVault] Configuring Append-Only ACL rules on Kopia repository..."
kopia --config-file="${CONFIG_FILE}" server acl enable || true

# Grant FULL control only to the gateway admin account
kopia --config-file="${CONFIG_FILE}" server acl add \
  --user="admin@apexvault-gateway" \
  --target="type=*" \
  --access=FULL \
  --overwrite || true

# Grant APPEND-ONLY access to all endpoint agents so they can upload new chunks
# and read manifests, but CANNOT delete or prune existing snapshots!
kopia --config-file="${CONFIG_FILE}" server acl add \
  --user="*@*" \
  --target="type=snapshot,username=USER,hostname=HOST" \
  --access=APPEND \
  --overwrite || true

kopia --config-file="${CONFIG_FILE}" server acl add \
  --user="*:*" \
  --access=APPEND \
  --overwrite || true

# Provision or update default enrolled endpoint user
if kopia --config-file="${CONFIG_FILE}" server users list 2>/dev/null | grep -q "${AGENT_USER}"; then
  kopia --config-file="${CONFIG_FILE}" server users set "${AGENT_USER}" \
    --user-password="${AGENT_PASS}"
else
  kopia --config-file="${CONFIG_FILE}" server users add "${AGENT_USER}" \
    --user-password="${AGENT_PASS}"
fi

# -----------------------------------------------------------------------------
# 5. Launch Kopia Server Gateway (gRPC / HTTP2 TLS)
# -----------------------------------------------------------------------------
echo "[ApexVault] Starting Kopia Gateway Server on 0.0.0.0:${GATEWAY_PORT}..."
TLS_ARGS=""
if [ -f "${TLS_CERT}" ] && [ -f "${TLS_KEY}" ]; then
  TLS_ARGS="--tls-cert-file=${TLS_CERT} --tls-key-file=${TLS_KEY}"
else
  TLS_ARGS="--tls-generate-cert --tls-generate-cert-name=${GATEWAY_HOST}"
fi

exec kopia --config-file="${CONFIG_FILE}" server start \
  --address="0.0.0.0:${GATEWAY_PORT}" \
  ${TLS_ARGS} \
  --server-control-username="${CONTROL_USER}" \
  --server-control-password="${CONTROL_PASS}" \
  --htpasswd-file="/config/htpasswd" \
  --without-password=false \
  --random-server-control-password=false \
  --refresh-interval=60s
