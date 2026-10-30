# ApexVault 3-2-1 Backup Gateway — UniFi NAS (UNAS Pro) + Proxmox + Backblaze B2

This directory contains the production deployment stack and bare-metal recovery tooling for **ApexVault**, the OpenMSP / ApexMSP integrated 3-2-1 backup, content-defined deduplication, volume snapshot, and bare-metal disaster recovery subsystem.

---

## Architecture Overview

```text
+-------------------------------------------------------------------------+
| TIER 1: Managed Endpoints (openmsp-agent + Kopia CLI 0.18.2)            |
|  - Windows VSS Shadow Copy / macOS APFS / Linux LVM Snapshot            |
|  - Dynamic 4MB Buzhash Content-Defined Chunking (Deduplication)         |
|  - Zstandard Compression + Client-Side AES-256-GCM-HMAC-SHA256          |
|  - Captures GPT/MBR Partition Layouts (sfdisk) + EFI System Partition   |
+------------------------------------+------------------------------------+
                                     | gRPC / HTTP2 TLS 1.3 (:51515)
                                     | SHA-256 Certificate Fingerprint Pinned
                                     v
+-------------------------------------------------------------------------+
| TIER 2: Proxmox Kopia Gateway + UniFi NAS (UNAS Pro)                    |
|  - Host: Proxmox Node (192.168.11.19) -> container `apexvault-kopia-gateway` |
|  - Local Proxmox NVMe Cache (`/cache/kopia`) for sub-ms index lookups   |
|  - NFSv4.1 1MB rsize/wsize mount to UniFi NAS (`192.168.11.50`)         |
|  - Zero-Trust Append-Only ACLs (`--access=APPEND`):                     |
|    Compromised endpoints can upload chunks & restore, but CANNOT delete |
|    or prune existing snapshots (Ransomware Immunity).                   |
+------------------------------------+------------------------------------+
                                     | Encrypted Repository Sync (`sync-to b2`)
                                     | + 5% Cryptographic Block Verification
                                     v
+-------------------------------------------------------------------------+
| TIER 3: Offsite Cloud Vault (Backblaze B2 + S3 Object Lock)             |
|  - Container: `apexvault-b2-replicator`                                 |
|  - Per-Tenant Restricted B2 Application Keys                            |
|  - S3 Object Lock in COMPLIANCE Mode (30-90 Day WORM Immutability)      |
+-------------------------------------------------------------------------+
```

---

## Files in `infra/backup/`

| File | Purpose |
|---|---|
| `docker-compose.backup.yml` | Production Docker Compose stack defining `apexvault-kopia-gateway`, `apexvault-b2-replicator`, the `unifi_nas_backup_repo` NFSv4.1 volume, and `kopia_nvme_cache`. |
| `entrypoint-kopia-gateway.sh` | Initializes the encrypted Kopia repository (`BLAKE2B-256-128`, `AES256-GCM-HMAC-SHA256`, `DYNAMIC-4M-BUZHASH`), prints the TLS SHA-256 certificate fingerprint, enforces Append-Only ACLs, and starts the Kopia Server on `:51515`. |
| `sync-unifi-to-b2.sh` | Runs scheduled `kopia snapshot verify --verify-files-percent=5`, repository maintenance, and `kopia repository sync-to b2` offsite replication to Backblaze B2 with Object Lock. |
| `build-recovery-iso.sh` | Builds the bootable **ApexMSP Bare-Metal Recovery Live ISO** (Alpine Linux + `openmsp-agent`, `kopia`, `sfdisk`, `parted`, `efibootmgr`, `ntfs-3g`, `qemu-img`, VirtIO P2V drivers) with 6-digit pairing code support. |

---

## 1. Preparing the UniFi NAS (UNAS Pro)

1. Open **UniFi Drive** on your UNAS Pro (`https://192.168.11.50`).
2. Create a shared drive named **`ApexVault-Backups`** on your RAID array.
3. Enable **NFS Service (NFS v4.1)** and add an access rule granting Read/Write (`rw,no_root_squash,sync`) ausschließlich to the Proxmox Kopia Gateway IP (`192.168.11.19/32`).
   - Do **not** expose the NFS share directly to client workstation VLANs; all endpoints communicate only with the Kopia Gateway on TCP `:51515` so Append-Only ACLs cannot be bypassed.
4. Note the export path (typically `/volume1/.srv/.unifi-drive/ApexVault-Backups/.data`).

---

## 2. Deploying the Proxmox Kopia Gateway + B2 Replicator

```bash
cd infra/backup

# Configure environment variables (or export in .env)
export UNIFI_NAS_IP="192.168.11.50"
export UNIFI_NAS_NFS_EXPORT="/volume1/.srv/.unifi-drive/ApexVault-Backups/.data"
export KOPIA_GATEWAY_HOST="192.168.11.19"
export KOPIA_REPOSITORY_PASSWORD="<strong-master-encryption-key>"
export KOPIA_SERVER_CONTROL_PASSWORD="<strong-admin-control-password>"
export B2_BUCKET="apexvault-immutable-offsite"
export B2_KEY_ID="<b2-application-key-id>"
export B2_APP_KEY="<b2-application-key>"

# Launch the stack
docker compose -f docker-compose.backup.yml up -d

# Retrieve the TLS SHA-256 certificate fingerprint for openmsp-agent pinning
docker compose -f docker-compose.backup.yml logs apexvault-kopia-gateway | grep -A 2 "SHA-256 Fingerprint"
```

---

## 3. Building the Bare-Metal Recovery Live ISO

```bash
# Validate staging rootfs, GRUB UEFI/BIOS config, and init scripts:
./build-recovery-iso.sh --dry-run --pairing-code=849204

# Build full hybrid bootable ISO via Docker (Alpine + xorriso + grub-mkrescue):
./build-recovery-iso.sh --pairing-code=849204 --api-url=https://msp.example.com
```
