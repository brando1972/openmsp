# Enroll this Windows PC into the ApexMSP MeshCentral device group (remote
# support). Called from configure.ps1 (MSI, deferred as SYSTEM) and install.ps1.
#
# IDEMPOTENT, NON-FATAL, silent by design: a mesh enrollment failure (nothing
# bundled, no network, install error) must NEVER fail the ApexMSP agent install.
#
# RECOMMENDED (zero config): bundle the PRE-TAGGED Windows agent MeshCentral hands
# you in the group's "Add Agent" dialog (Windows x86-64 .exe) — it already has the
# server URL + ApexMSP group baked in, so NO .msh and NO ids are needed. Drop it at:
#     deploy\windows\mesh\MeshAgent64.exe
#
# ADVANCED (generic agent + descriptor): if you bundle the *generic* MeshAgent
# exe instead, also supply the group ".msh" via MESH_MSH or
# deploy\windows\mesh\apexmsp.msh (placed beside the exe before -fullinstall).
#
# Config (env — all optional):
#   MESH_SERVER_URL     MeshCentral base URL. Default https://mesh.apexmsp.app
#   MESH_GROUP          device group name (informational). Default ApexMSP
#   MESH_MSH            path to the group .msh, OR base64 (generic-agent path only)
#   MESH_WIN_AGENT_URL  generic meshagent download URL (generic-agent path).
#                       Default $MESH_SERVER_URL/meshagents?id=4
$ErrorActionPreference = "Continue"
$dir = $PSScriptRoot
function Log($m) { Write-Host "[mesh] $m" }

$server   = if ($env:MESH_SERVER_URL) { $env:MESH_SERVER_URL.TrimEnd('/') } else { "https://mesh.apexmsp.app" }
$group    = if ($env:MESH_GROUP) { $env:MESH_GROUP } else { "ApexMSP" }
$agentUrl = if ($env:MESH_WIN_AGENT_URL) { $env:MESH_WIN_AGENT_URL } else { "$server/meshagents?id=4" }
$meshDir  = Join-Path $dir "mesh"

try {
  # Idempotent: if the Mesh Agent service already exists, do nothing.
  if (Get-Service -Name "Mesh Agent" -ErrorAction SilentlyContinue) {
    Log "MeshAgent already installed — skipping enrollment."
    return
  }

  $work = Join-Path $env:TEMP ("apexmsp-mesh-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  $agent = Join-Path $work "meshagent.exe"

  # Obtain the meshagent exe: prefer a bundled (ideally pre-tagged) copy. Accept
  # ANY *.exe under mesh\ so the file downloaded from "Add Agent" works as-is
  # (e.g. meshagent64-ApexMSP.exe) with no rename required.
  $bundledAgent = Get-ChildItem -Path $meshDir -Filter *.exe -File -ErrorAction SilentlyContinue |
                  Select-Object -First 1 -ExpandProperty FullName
  $haveBundled = [bool]$bundledAgent

  # Resolve the optional group .msh (only needed for a GENERIC agent).
  $msh = Join-Path $work "meshagent.msh"
  $bundledMsh = Join-Path $meshDir "apexmsp.msh"
  $haveMsh = $false
  if ($env:MESH_MSH -and (Test-Path $env:MESH_MSH)) {
    Copy-Item $env:MESH_MSH $msh -Force; $haveMsh = $true
  } elseif ($env:MESH_MSH) {
    try { [IO.File]::WriteAllBytes($msh, [Convert]::FromBase64String($env:MESH_MSH)); $haveMsh = $true } catch { }
  } elseif (Test-Path $bundledMsh) {
    Copy-Item $bundledMsh $msh -Force; $haveMsh = $true
  }

  if ($haveBundled) {
    Copy-Item $bundledAgent $agent -Force
  } elseif ($haveMsh) {
    # Only worth downloading the generic agent if we have a .msh to bind it.
    Log "Downloading generic MeshAgent from $agentUrl"
    try {
      $old = $ProgressPreference; $ProgressPreference = "SilentlyContinue"
      Invoke-WebRequest -Uri $agentUrl -OutFile $agent -UseBasicParsing
      $ProgressPreference = $old
    } catch {
      Log "MeshAgent download failed (network restricted?) — skipping enrollment."
      return
    }
  } else {
    Log "MeshCentral enrollment skipped: nothing bundled (add deploy\mesh\MeshAgent64.exe"
    Log "from the group 'Add Agent' dialog, or a generic exe + apexmsp.msh). See README.md."
    return
  }

  if (-not (Test-Path $agent) -or (Get-Item $agent).Length -eq 0) {
    Log "MeshAgent binary is empty — skipping enrollment."
    return
  }

  # A pre-tagged exe ignores the .msh and uses its embedded config; a generic exe
  # reads the adjacent meshagent.msh. Silent -fullinstall, no UI.
  Log "Installing MeshAgent (group: $group, server: $server)"
  $p = Start-Process -FilePath $agent -ArgumentList "-fullinstall" -WorkingDirectory $work -Wait -PassThru -WindowStyle Hidden
  if ($p.ExitCode -eq 0) {
    Log "MeshAgent installed and enrolled into '$group'."
  } else {
    Log "MeshAgent install exit code $($p.ExitCode) — continuing (ApexMSP agent unaffected)."
  }
} catch {
  Log "MeshCentral enrollment error: $($_.Exception.Message) — continuing."
} finally {
  if ($work -and (Test-Path $work)) { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
}
