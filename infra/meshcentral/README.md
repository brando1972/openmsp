# MeshCentral — OpenMSP remote support backend

MeshCentral is the remote-desktop engine (replaces the decommissioned RustDesk).
It runs headless on a VM; the OpenMSP console owns the UI and embeds MeshCentral's
desktop viewer.

## Stand it up (on the VM that hosted RustDesk)

```bash
cd infra/meshcentral
mkdir -p data/meshcentral
cp config.json.example data/meshcentral/config.json
# edit data/meshcentral/config.json: set settings.cert to the VM's DNS name,
# keep AllowFraming + AllowLoginToken true
docker compose up -d
```

Open `https://<vm-dns>/` and create the **admin** account (first account is owner).
Create a device group named **OpenMSP** (matches MESH_GROUP).

Firewall: open **443** (and **80** for Let's Encrypt), optionally **4433** (Intel AMT).
Point a DNS A record at the VM so MeshCentral can get a TLS cert automatically.

## Enroll endpoints

MeshCentral generates a per-group **agent installer** (Add Device → download).
This installer gets bundled/dropped by the OpenMSP agent so endpoints join the
OpenMSP group automatically (the endpoint-provisioning step — next task).

## Give the OpenMSP API access (login token)

On the MeshCentral server, create a login token for the API to embed sessions:

```bash
# inside the meshcentral container (or wherever meshcentral runs)
node meshcentral --logintoken admin
```

Then set these env vars on the **Cloud Run API**:

```
MESH_SERVER_URL=https://<vm-dns>
MESH_GROUP=OpenMSP
MESH_LOGIN_TOKEN=<token from the command above>
MESH_LOGIN_USER=admin
```

```bash
gcloud run services update openmsp-api \
  --set-env-vars="MESH_SERVER_URL=https://<vm-dns>,MESH_GROUP=OpenMSP,MESH_LOGIN_TOKEN=<token>,MESH_LOGIN_USER=admin" \
  --project=openmsp-backend --region=us-central1 --quiet
```

The API's `/api/v1/remote/*` endpoints then report health, and
`/remote/sessions/start` returns an `embedUrl` the console iframes.

> `AllowFraming: true` in config.json is what lets the OpenMSP console embed the
> viewer — without it the iframe is blocked.
