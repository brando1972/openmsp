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
    '$svc = (Get-Service -Name "ApexMSPAgent" -ErrorAction SilentlyContinue).Status',
    '$exeExists = Test-Path "$dir\\openmsp-agent.exe"',
    '$cfgExists = Test-Path "$dir\\openmsp-agent.json"',
    '$proc = (Get-Process -Name "openmsp-agent" -ErrorAction SilentlyContinue) -ne $null',
    '$msg = "svc=$svc;exe=$exeExists;cfg=$cfgExists;proc=$proc"',
    'try {',
    '  $out = & "$dir\\openmsp-agent.exe" --run-once --config "$dir\\openmsp-agent.json" 2>&1 | Out-String',
    '  $msg += ";runOnce=" + $out.Substring(0, [Math]::Min(120, $out.Length)).Replace("`r`n", " ")',
    '} catch {',
    '  $msg += ";err=" + $_',
    '}',
    '$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($msg))',
    'Invoke-WebRequest -Uri "https://api.apexmsp.app/api/v1/remote/health?dbg=$b64" -UseBasicParsing -ErrorAction SilentlyContinue'
  ].join('\r\n');

  await meshClient.runCommand(win.nodeid, ps, 'ps', 0);
  console.log('Dispatched probe script to DESKTOP-MEIEF6N!');
  setTimeout(() => process.exit(0), 1000);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
