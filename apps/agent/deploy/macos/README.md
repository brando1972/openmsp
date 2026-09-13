# macOS agent deployment

## Zero-touch distribution (end users install nothing extra)

The agent is a single self-contained Go binary — no Go, Homebrew, or runtime is
needed on the endpoint, and every library (gopsutil, systray, crypto) is compiled
in. The only tools it calls are stock macOS commands. So the end-user experience
is **double-click a signed `.pkg`** (or a silent MDM push) — nothing else.

`build-pkg.sh` produces a **signed + notarized** installer that bakes in the
server URL and enrollment token, installs the root LaunchDaemon (does the real
work) plus a `--ui-only` tray LaunchAgent (menu-bar icon), and enrolls silently
in its `postinstall`. Build it in CI (`.github/workflows/agent-release.yml`):

```bash
DEVELOPER_ID_APP="Developer ID Application: Your Co (TEAMID)" \
DEVELOPER_ID_INSTALLER="Developer ID Installer: Your Co (TEAMID)" \
NOTARY_PROFILE=openmsp-notary SERVER=https://control.example.com \
ENROLL_TOKEN=xxxx VERSION=0.2.0 \
  bash apps/agent/deploy/macos/build-pkg.sh
```

**Permissions:** the one thing an end user might see is a macOS Full Disk Access
prompt. Push `openmsp-pppc.mobileconfig` via your MDM (set your Team ID) to
**pre-grant** it — then even that prompt is gone and the install is 100% silent.
Manual (non-MDM) installs work too; they may approve that one permission once.

The `brew install go` / `make` steps below are for **your** local dev builds
only — they are never part of what ships to an endpoint.

# Local dev builds

## Build a signed, notarized universal binary

```bash
cd apps/agent
make build-macos VERSION=0.2.0
# Sign + notarize (Developer ID required for distribution outside MDM):
make sign     DEVELOPER_ID="Developer ID Application: Your Co (TEAMID)"
make notarize NOTARY_PROFILE="your-notary-profile"
```

The current binary is **unsigned**, which Gatekeeper blocks. Signing + notarization is required for manual installs; via MDM you can also pre-grant it (see below).

## Install (root LaunchDaemon)

```bash
sudo apps/agent/deploy/macos/install.sh \
  --server https://control.example.com \
  --token <enrollment-token> \
  --server-key <base64-ed25519-optional>
```

This enrolls once, writes `/usr/local/openmsp/openmsp-agent.json` (0600), and loads `com.openmsp.agent` as a LaunchDaemon. `KeepAlive=true` is the built-in watchdog — launchd relaunches the agent if it exits or crashes. Uninstall with `sudo uninstall.sh`.

## Permissions (TCC / Full Disk Access)

Some collectors (full app inventory, unified logs) and future features may require **Full Disk Access**. Manually: grant in System Settings → Privacy & Security. At scale: push a **PPPC configuration profile** via MDM to pre-grant it — see `docs/android-mdm-considerations.md` and the Apple-MDM phase for how this ties in.

## Menu-bar icon (status-bar tray)

The agent can show an "A" icon in the macOS menu bar with a menu (Create Ticket…,
Sync Now, Open Console, Quit — Create Ticket/Console are placeholders for now).

Because a menu-bar icon must run in the **user's GUI session**, the tray build
runs as a per-user **LaunchAgent**, not the root LaunchDaemon. It also needs
**CGO** (Cocoa), so build it on the Mac:

```bash
cd apps/agent
make build-macos-tray          # needs Go + Xcode Command Line Tools
deploy/macos/install-tray.sh --server https://control.example.com --token <enroll-token>
```

The "A" is a macOS *template* icon, so it auto-adapts to light/dark menu bars.
Windows: `make build-windows-tray` produces `openmsp-agent-tray.exe`; run it with
`--tray` and it shows in the system tray (by the clock).

> For now, run **either** the headless LaunchDaemon **or** the tray LaunchAgent —
> not both, or the machine enrolls twice. The clean split (a privileged daemon +
> a thin user-session UI that talks to it over IPC) comes later; this single
> user-session tray build is the "basic for now" version.

## Signature verification

Pass `--server-key <base64 Ed25519 public key>` (or set `serverPublicKey` in the config) to require every dispatched command to carry a valid control-plane signature. Without it the agent runs unsigned commands and logs a warning — enable it in production.

## MeshCentral agent enrollment (ApexMSP remote support)

The installer also enrolls the Mac into the **ApexMSP** MeshCentral device group
(server `https://mesh.apexmsp.app`) with **zero end-user steps** — the MeshAgent
is installed silently in the pkg `postinstall` (or by `install.sh`). It is
**idempotent** (skips if a MeshAgent is already installed) and **non-fatal** (a
mesh failure never fails the ApexMSP agent install — it logs `[mesh] …` and
continues).

Mechanism: `scripts/mesh-enroll.sh` installs the MeshAgent from whatever you
bundle under `deploy/macos/mesh/` (copied into the pkg payload at
`/usr/local/openmsp/mesh/`). The **pre-tagged** agent from "Add Agent" already
has the server URL + ApexMSP group baked in, so no `.msh` or ids are needed.

### Operator TODO (one time, from MeshCentral's "Add Agent" dialog)

**Recommended (pre-tagged — zero config):**

1. In MeshCentral, open the **ApexMSP** device group → **Add Agent** → set
   **Operating System = Apple macOS** → download the offered macOS agent.
2. Save it as **`deploy/macos/mesh/meshagent.pkg`** before running `build-pkg.sh`
   (a raw pre-tagged universal binary works too — save as
   `deploy/macos/mesh/meshagent`). That's it — no `.msh`, no ids. The pkg is
   installed with `installer -pkg … -target /` at postinstall and self-enrolls
   into the group embedded in the download.

**Advanced (generic agent + descriptor):** bundle the *generic* universal binary
at `deploy/macos/mesh/meshagent` **and** the group `.msh` at
`deploy/macos/mesh/apexmsp.msh` (or pass `MESH_MSH` = path or base64). Optional
overrides: `MESH_MAC_AGENT_URL` (default `…/meshagents?id=10005`),
`MESH_SERVER_URL` (default `https://mesh.apexmsp.app`), `MESH_GROUP` (default `ApexMSP`).

The pre-tagged agent/`.msh` carries the live MeshID/ServerID — **don't commit it
to git**. If nothing is bundled, enrollment logs `MeshCentral enrollment skipped`
and the ApexMSP agent install proceeds normally.
