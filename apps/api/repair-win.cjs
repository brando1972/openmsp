const { meshClient } = require('./dist/mesh/meshClient.js');

async function main() {
  await meshClient.ensureReady();
  await new Promise(r => setTimeout(r, 2000));
  const nodes = meshClient.listNodes();
  const win = nodes.find(n => n.name && n.name.includes('DESKTOP-MEIEF6N'));
  if (!win) {
    console.error('DESKTOP-MEIEF6N not found');
    process.exit(1);
  }
  console.log('Targeting:', win.nodeid);

  const ps = [
    '$dir = "C:\\ProgramData\\ApexMSP"',
    'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
    '$cfg = @{',
    '  serverUrl = "https://api.apexmsp.app"',
    '  token = "apex-brandon-ray"',
    '  deviceId = "dev-win-meief6n"',
    '  deviceSecret = "sec-dev-win-meief6n"',
    '  orgId = "00000000-0000-0000-0000-000000000001"',
    '  clientId = "c-brandon-ray"',
    '  siteId = "Primary"',
    '  heartbeatIntervalSeconds = 10',
    '} | ConvertTo-Json',
    'Set-Content -Path "$dir\\openmsp-agent.json" -Value $cfg -Encoding UTF8',
    'Stop-Service -Name "ApexMSPAgent" -Force -ErrorAction SilentlyContinue',
    'sc.exe delete ApexMSPAgent 2>$null | Out-Null',
    'Start-Sleep -Milliseconds 500',
    '& sc.exe create ApexMSPAgent binPath= "\"$dir\\openmsp-agent.exe\" --config \"$dir\\openmsp-agent.json\"" start= auto DisplayName= "ApexMSP Endpoint Agent"',
    '& sc.exe failure ApexMSPAgent reset= 86400 actions= restart/5000/restart/10000/restart/60000',
    'Start-Service -Name "ApexMSPAgent"',
    'schtasks.exe /run /tn ApexMSPTray'
  ].join('\r\n');

  await meshClient.runCommand(win.nodeid, ps, 'ps', 0);
  console.log('Dispatched complete service install & start to DESKTOP-MEIEF6N!');
  setTimeout(() => process.exit(0), 1000);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
