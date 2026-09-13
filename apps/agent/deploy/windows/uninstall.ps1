# Run by the MSI (deferred, as SYSTEM) before files are removed. Stops and
# removes the scheduled tasks. Best-effort — never blocks uninstall.
$ErrorActionPreference = "SilentlyContinue"
foreach ($t in @("OpenMSP Agent", "OpenMSP Tray")) {
  Stop-ScheduledTask -TaskName $t
  Unregister-ScheduledTask -TaskName $t -Confirm:$false
}
# Stop any running agent processes
Get-Process openmsp-agent, openmsp-agent-tray -ErrorAction SilentlyContinue | Stop-Process -Force
