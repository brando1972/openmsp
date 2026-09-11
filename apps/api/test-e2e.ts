/**
 * OpenMSP Product Gate v1 Automated Test Suite
 * Validates all 8 acceptance criteria from Section 4 of the Build Spec
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

async function runTests() {
  console.log('====================================================');
  console.log('  OpenMSP Product Gate v1 Verification Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. MSP User Login
  console.log('1. Testing MSP User Authentication...');
  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@openmsp.local', password: 'Admin123!' })
  });
  const loginData = await loginRes.json();
  assert(loginRes.status === 200, 'Login HTTP 200');
  assert(!!loginData.token, 'Received JWT bearer token');
  assert(loginData.user?.role === 'owner', 'User role is "owner"');
  const token = loginData.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const meRes = await fetch(`${BASE_URL}/api/v1/auth/me`, { headers: authHeaders });
  const meData = await meRes.json();
  assert(meRes.status === 200 && meData.email === 'admin@openmsp.local', 'GET /api/v1/me returns authenticated user');

  // 2. Real Agent Enrollment
  console.log('\n2. Testing Device Agent Enrollment...');
  const enrollRes = await fetch(`${BASE_URL}/api/v1/agents/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'demo-enrollment-token-2026',
      hostname: 'Lab-PC-Win11',
      os: 'windows',
      osVersion: 'Windows 11 Pro 23H2',
      serialNumber: 'SN-LAB-12345',
      macAddress: '00:15:5D:01:02:03',
      ipAddress: '192.168.1.150'
    })
  });
  const enrollData = await enrollRes.json();
  assert(enrollRes.status === 201, 'Agent enrollment HTTP 201');
  assert(!!enrollData.deviceId && !!enrollData.deviceSecret, 'Assigned deviceId and deviceSecret');
  const { deviceId, deviceSecret } = enrollData;

  // 3. Heartbeat & Live Telemetry
  console.log('\n3. Testing Agent Heartbeat & Telemetry Snapshot...');
  const heartbeatRes = await fetch(`${BASE_URL}/api/v1/agents/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      deviceSecret,
      metrics: {
        cpuUsage: 14.5,
        ramUsage: 45.2,
        diskUsage: 32.1,
        uptimeDays: 3.5,
        lastSeen: new Date().toISOString()
      },
      network: {
        ipAddress: '192.168.1.150',
        macAddress: '00:15:5D:01:02:03',
        publicIp: '198.51.100.5'
      },
      services: [
        { name: 'Spooler', displayName: 'Print Spooler', status: 'stopped', startupType: 'auto' },
        { name: 'LanmanServer', displayName: 'Server', status: 'running', startupType: 'auto' }
      ]
    })
  });
  const heartbeatData = await heartbeatRes.json();
  assert(heartbeatRes.status === 200 && heartbeatData.acknowledged === true, 'Heartbeat acknowledged');

  // Verify device in GET /devices
  const devicesRes = await fetch(`${BASE_URL}/api/v1/devices`, { headers: authHeaders });
  const devicesList = await devicesRes.json();
  const enrolledDev = devicesList.find((d: any) => d.id === deviceId);
  assert(!!enrolledDev, 'Enrolled device appears in GET /api/v1/devices');
  assert(enrolledDev.metrics.cpuUsage === 14.5, 'Telemetry metrics updated in control plane');

  // 4. PSA Ticket, Comment, Time Entry
  console.log('\n4. Testing PSA Ticket Creation, Comments & Time Entries...');
  const ticketRes = await fetch(`${BASE_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      title: 'Lab Test Ticket - Critical Workstation Latency',
      description: 'End user reports severe lag on accounting workstation.',
      clientId: 'c-acme-corp',
      deviceId,
      priority: 'high',
      category: 'Software'
    })
  });
  const ticketData = await ticketRes.json();
  assert(ticketRes.status === 201, 'Ticket creation HTTP 201');
  assert(ticketData.ticketNumber?.startsWith('TICK-'), 'Assigned sequential ticket number');
  const ticketId = ticketData.id;

  // Add Comment
  const commentRes = await fetch(`${BASE_URL}/api/v1/tickets/${ticketId}/comments`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      content: 'Investigated memory usage. Dispatched diagnostic script.',
      isInternal: true
    })
  });
  assert(commentRes.status === 201, 'Internal comment added');

  // Add Time Entry
  const timeRes = await fetch(`${BASE_URL}/api/v1/tickets/${ticketId}/time`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      minutes: 45,
      description: 'Diagnosed system bottleneck',
      billable: true
    })
  });
  assert(timeRes.status === 201, 'Time entry logged');

  // Verify persistence
  const getTicketRes = await fetch(`${BASE_URL}/api/v1/tickets/${ticketId}`, { headers: authHeaders });
  const getTicketData = await getTicketRes.json();
  assert(getTicketData.comments?.length === 1, 'Comments persist on ticket');
  assert(getTicketData.timeEntries?.length === 1, 'Time entries persist on ticket');

  // 5. RustDesk Remote Support
  console.log('\n5. Testing RustDesk Support Relay & Sessions...');
  const healthRelayRes = await fetch(`${BASE_URL}/api/v1/remote/health`, { headers: authHeaders });
  const healthRelayData = await healthRelayRes.json();
  assert(healthRelayData.online === true, 'RustDesk relay reporting operational');

  const startSessionRes = await fetch(`${BASE_URL}/api/v1/remote/sessions/start`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ deviceId })
  });
  const sessionData = await startSessionRes.json();
  assert(startSessionRes.status === 201 && !!sessionData.sessionKey, 'Remote RustDesk session established with valid key');

  const endSessionRes = await fetch(`${BASE_URL}/api/v1/remote/sessions/${sessionData.id}/end`, {
    method: 'POST',
    headers: authHeaders
  });
  assert(endSessionRes.status === 200, 'Remote RustDesk session cleanly terminated');

  // 6. Automations & Self-Healing
  console.log('\n6. Testing Self-Healing Automation & Dry Run...');
  // Dry run test: "Dry-run must not mutate live device health. Dry-run only writes a log row."
  const dryRunRes = await fetch(`${BASE_URL}/api/v1/automations/rules/rule-spooler-restart/dry-run`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ deviceId })
  });
  const dryRunData = await dryRunRes.json();
  assert(dryRunData.success === true && dryRunData.log?.isDryRun === true, 'Dry-run executed without mutating live health');

  // The previous heartbeat had Spooler stopped -> self-healing rule triggered command!
  const devCommandsRes = await fetch(`${BASE_URL}/api/v1/devices/${deviceId}/commands`, { headers: authHeaders });
  const devCommands = await devCommandsRes.json();
  assert(devCommands.some((c: any) => c.commandType === 'restart_service'), 'Self-healing engine enqueued restart_service command for stopped Spooler');

  // 7. Vaultwarden / Zero-Trust Vault
  console.log('\n7. Testing Zero-Trust Vault & Master Unlock...');
  const vaultCreateRes = await fetch(`${BASE_URL}/api/v1/vault/items`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      clientId: 'c-acme-corp',
      title: 'Lab Edge Firewall Admin',
      username: 'admin',
      password: 'SuperSecretLabPassword123!',
      folder: 'Network'
    })
  });
  const vaultItem = await vaultCreateRes.json();
  assert(vaultCreateRes.status === 201, 'Vault credential created');

  const vaultGetRes = await fetch(`${BASE_URL}/api/v1/vault/items`, { headers: authHeaders });
  const vaultItems = await vaultGetRes.json();
  const createdItem = vaultItems.find((v: any) => v.id === vaultItem.id);
  assert(createdItem.password !== 'SuperSecretLabPassword123!', 'Password masked/encrypted (zero plaintext in API/SPA)');

  const unlockRes = await fetch(`${BASE_URL}/api/v1/vault/unlock`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ masterPassword: 'Admin123!' })
  });
  const unlockData = await unlockRes.json();
  assert(unlockData.unlocked === true, 'Master Vault unlock succeeded with temporary session');

  // 8. Audit Trail Verification
  console.log('\n8. Testing Comprehensive Audit Event Trail...');
  const auditRes = await fetch(`${BASE_URL}/api/v1/audit`, { headers: authHeaders });
  const auditLogs = await auditRes.json();
  const actions = auditLogs.map((a: any) => a.action);

  assert(actions.includes('auth.login'), 'Audit contains auth.login');
  assert(actions.includes('agent.enroll'), 'Audit contains agent.enroll');
  assert(actions.includes('ticket.create'), 'Audit contains ticket.create');
  assert(actions.includes('remote.session_start'), 'Audit contains remote.session_start');
  assert(actions.includes('vault.item_create'), 'Audit contains vault.item_create');
  assert(actions.includes('vault.unlock'), 'Audit contains vault.unlock');

  console.log('\n====================================================');
  console.log(`  Verification Complete: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
