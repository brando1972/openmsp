# Run by the MSI (deferred, as SYSTEM) after files are laid down. Enrolls using
# the baked-in openmsp-agent.json and registers the startup + tray tasks.
# No arguments — server/token are baked into the config at build time.
$ErrorActionPreference = "Stop"
$dir    = $PSScriptRoot
$bin    = Join-Path $dir "openmsp-agent.exe"
$tray   = Join-Path $dir "openmsp-agent-tray.exe"
$config = Join-Path $dir "openmsp-agent.json"

# Silent one-shot enrollment (reads serverUrl + token from the baked config)
& $bin --config $config --run-once | Out-Null

# Headless agent: SYSTEM scheduled task at startup, auto-restart on failure
$action    = New-ScheduledTaskAction -Execute $bin -Argument "--config `"$config`" --interval 30"
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "OpenMSP Agent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

# Tray (UI-only) at each user logon, in the interactive session
$trayAction    = New-ScheduledTaskAction -Execute $tray -Argument "--tray --ui-only --config `"$config`""
$trayTrigger   = New-ScheduledTaskTrigger -AtLogOn
$trayPrincipal = New-ScheduledTaskPrincipal -GroupId "S-1-5-32-545" -RunLevel Limited  # BUILTIN\Users
Register-ScheduledTask -TaskName "OpenMSP Tray" -Action $trayAction -Trigger $trayTrigger -Principal $trayPrincipal -Force | Out-Null

Start-ScheduledTask -TaskName "OpenMSP Agent"

# MeshCentral remote-support enrollment (bundled .msh -> ApexMSP group). Silent,
# idempotent, and non-fatal: never let a mesh failure fail the ApexMSP install.
$meshEnroll = Join-Path $dir "mesh-enroll.ps1"
if (Test-Path $meshEnroll) {
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $meshEnroll | Out-Null } catch { }
}
