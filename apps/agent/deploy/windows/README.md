# Windows agent deployment

Double-click (or silent MDM push) **MSI**. End users install nothing else — the
agent is a self-contained exe with no runtime dependencies.

## What the MSI does
- Installs `openmsp-agent.exe` + `openmsp-agent-tray.exe` to `Program Files\OpenMSP`
- Enrolls silently using the baked-in `openmsp-agent.json` (server + token set at build time)
- Registers a **SYSTEM scheduled task at startup** (headless agent, auto-restart)
- Registers a **user-logon task** for the `--ui-only` system-tray icon
- On uninstall, removes both tasks and stops the processes

## Build (CI does this automatically)
The exes and a baked `openmsp-agent.json` are staged in this folder, then:
```powershell
dotnet tool install --global wix --version 5.*
wix build openmsp.wxs -o OpenMSP-Agent-0.2.0.msi
```
Sign the exes **and** the MSI with your code-signing cert (see
`.github/workflows/agent-release.yml`) so SmartScreen stays silent.

## Install
```
msiexec /i OpenMSP-Agent-0.2.0.msi        # interactive
msiexec /i OpenMSP-Agent-0.2.0.msi /qn     # silent (MDM/Intune push)
```

`install.ps1` is a script-only alternative for manual testing (takes `-Server` /
`-Token`); the MSI is the real distributable.

> A native Windows **service** (SCM, via `x/sys/windows/svc`) is a planned
> upgrade over the SYSTEM scheduled task; the task approach is robust and silent
> for now (auto-restart on failure, runs at boot before login).

## MeshCentral agent enrollment (ApexMSP remote support)

The MSI also enrolls the PC into the **ApexMSP** MeshCentral device group
(server `https://mesh.apexmsp.app`) with **zero end-user steps** — the MeshAgent
is installed **silently** (`-fullinstall`, no UI) by `mesh-enroll.ps1`, called
from `configure.ps1` (the MSI's deferred SYSTEM custom action) and from
`install.ps1`. It is **idempotent** (skips if the `Mesh Agent` service exists)
and **non-fatal** (a mesh failure never fails the ApexMSP install — it logs
`[mesh] …` and continues).

Mechanism: `mesh-enroll.ps1` installs the MeshAgent from whatever you stage under
`deploy/windows/mesh/` and runs it with `-fullinstall`. The **pre-tagged** agent
from "Add Agent" already has the server URL + ApexMSP group baked in, so no `.msh`
or ids are needed.

### Operator TODO (one time, from MeshCentral's "Add Agent" dialog)

**Recommended (pre-tagged — zero config):**

1. In MeshCentral, open the **ApexMSP** device group → **Add Agent** →
   **Operating System = Windows** → download **"Windows x86-64 (.exe)"** (this
   binary has the server + ApexMSP group embedded).
2. Save it as **`deploy/windows/mesh/MeshAgent64.exe`**, then **uncomment** the
   `MeshFiles` component and its `ComponentRef` in `openmsp.wxs` (both pre-written,
   commented) before `wix build`. It installs to `Program Files\OpenMSP\mesh\`,
   where `mesh-enroll.ps1` finds it. No `.msh`, no ids.

**Advanced (generic agent + descriptor):** stage the *generic* `MeshAgent64.exe`
plus the group `.msh` at `deploy/windows/mesh/apexmsp.msh` (or pass `MESH_MSH` =
path or base64). Optional overrides: `MESH_WIN_AGENT_URL` (default
`…/meshagents?id=4`), `MESH_SERVER_URL` (default `https://mesh.apexmsp.app`),
`MESH_GROUP` (default `ApexMSP`).

The pre-tagged agent/`.msh` carries the live MeshID/ServerID — **don't commit it
to git**. If nothing is staged, enrollment logs `MeshCentral enrollment skipped`
and the ApexMSP install proceeds normally.
