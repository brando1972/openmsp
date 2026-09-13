# OpenMSP Windows agent installer. Run elevated (the MSI/CI wraps this so the
# end user just runs a signed installer). Installs the headless agent as a
# SYSTEM scheduled task at startup, and the tray (UI-only) at user logon.
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Server https://control.example.com -Token <enroll-token>
param(
  [Parameter(Mandatory=$true)][string]$Server,
  [Parameter(Mandatory=$true)][string]$Token,
  [string]$ServerKey = ""
)
$ErrorActionPreference = "Stop"
$InstallDir = "$env:ProgramFiles\OpenMSP"
$Bin        = "$InstallDir\openmsp-agent.exe"
$TrayBin    = "$InstallDir\openmsp-agent-tray.exe"
$Config     = "$InstallDir\openmsp-agent.json"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
# CI places the signed exes next to this script; copy them in
Copy-Item "$PSScriptRoot\openmsp-agent.exe"      $Bin     -Force
Copy-Item "$PSScriptRoot\openmsp-agent-tray.exe" $TrayBin -Force

# Preconfigure + enroll once (headless)
@{ serverUrl = $Server; token = $Token } | ConvertTo-Json | Set-Content -Path $Config -Encoding utf8
$enroll = @("--config", $Config, "--run-once")
if ($ServerKey) { $enroll += @("--server-key", $ServerKey) }
& $Bin @enroll | Out-Null

# Headless agent as a SYSTEM scheduled task at startup (survives reboots)
$action  = New-ScheduledTaskAction -Execute $Bin -Argument "--config `"$Config`" --interval 30"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "OpenMSP Agent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

# Tray (UI-only) at user logon, in the interactive session
$trayAction  = New-ScheduledTaskAction -Execute $TrayBin -Argument "--tray --ui-only --config `"$Config`""
$trayTrigger = New-ScheduledTaskTrigger -AtLogOn
$trayPrincipal = New-ScheduledTaskPrincipal -GroupId "S-1-5-32-545" -RunLevel Limited  # Users
Register-ScheduledTask -TaskName "OpenMSP Tray" -Action $trayAction -Trigger $trayTrigger -Principal $trayPrincipal -Force | Out-Null

Start-ScheduledTask -TaskName "OpenMSP Agent"

# MeshCentral remote-support enrollment (ApexMSP group). Silent, idempotent,
# non-fatal, config-driven — see mesh-enroll.ps1. Skips cleanly if no .msh set.
$meshEnroll = Join-Path $PSScriptRoot "mesh-enroll.ps1"
if (Test-Path $meshEnroll) {
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $meshEnroll | Out-Null } catch { }
}

Write-Host "[+] OpenMSP agent installed (SYSTEM task + user tray)."
