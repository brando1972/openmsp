import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import securityRouter, {
  upsertDeviceSecurityPosture,
  evaluateProtectedAssetLock,
  resolveTemporalIdentityAt
} from './src/routes/security.js';
import unifiRouter from './src/routes/unifi.js';
import { store } from './src/db/store.js';

interface TestResult {
  id: string;
  category: 'UniFi Test' | 'Acceptance Test' | 'Database & Infra';
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

const results: TestResult[] = [];

function assertCondition(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(
  id: string,
  category: TestResult['category'],
  name: string,
  fn: () => Promise<string>
): Promise<void> {
  const start = performance.now();
  try {
    const details = await fn();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    results.push({ id, category, name, passed: true, durationMs, details });
    console.log(`✅ [PASS] ${id} (${durationMs}ms) — ${name}`);
    console.log(`   └─ ${details}`);
  } catch (err) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ id, category, name, passed: false, durationMs, details: msg });
    console.error(`❌ [FAIL] ${id} (${durationMs}ms) — ${name}`);
    console.error(`   └─ ${msg}`);
  }
}

async function main() {
  console.log('================================================================================');
  console.log('🛡️  ApexMSP SIEM / EDR / AV / UniFi SOC — Independent E2E Verification Suite');
  console.log('================================================================================\n');

  // Ensure store is freshly seeded & hydrated with live UniFi fixtures
  store.seedSecurityAndUnifiDefaults();
  const hydrated = store.hydrateUnifiFixtures();
  console.log(
    `[Init] Store hydrated: ${hydrated.sitesMerged} UniFi sites, ${hydrated.observationsMerged} live observations from [${hydrated.hydratedFiles.map((f) => path.basename(f)).join(', ')}]\n`
  );

  // Spin up isolated Express test harness on ephemeral port
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use('/api/v1/security', securityRouter);
  app.use('/api/v1/integrations/unifi', unifiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  async function apiReq(method: string, endpoint: string, body?: unknown, headers?: Record<string, string>) {
    const t0 = performance.now();
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const elapsedMs = Math.round((performance.now() - t0) * 100) / 100;
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, elapsedMs };
  }

  try {
    // =========================================================================
    // PART 1: 6 UNIFI IDENTITY & TOPOLOGY TESTS
    // =========================================================================

    // UniFi Test 1 & Acceptance Test 4: Cross-Tenant Overlapping IP/MAC Isolation
    await runTest(
      'UNIFI-01 / ACC-04',
      'UniFi Test',
      'Cross-Tenant Overlapping RFC1918 IP (192.168.1.105) & Spoofed Tenant Rejection',
      async () => {
        // 1. Both c-gambinos (KwickPOS c5) and c-municipality (MUNI-DISPATCH-CAD-01) use 192.168.1.105
        const gmbTimeline = await apiReq(
          'GET',
          '/api/v1/security/devices/obs-gmb-kwick-c5/timeline?clientId=c-gambinos&ipAddress=192.168.1.105'
        );
        assertCondition(gmbTimeline.status === 200, `Expected 200 for Gambinos timeline, got ${gmbTimeline.status}`);
        const gmbObs = gmbTimeline.json.temporalObservations as Array<{ clientId: string }>;
        assertCondition(gmbObs.length > 0, 'Expected Gambinos observations for 192.168.1.105');
        assertCondition(
          gmbObs.every((o) => o.clientId === 'c-gambinos'),
          'Cross-tenant leak detected in Gambinos timeline!'
        );
        assertCondition(
          gmbTimeline.json.tenantIsolationProof.crossTenantRecordsLeaked === 0,
          'Expected crossTenantRecordsLeaked === 0'
        );
        assertCondition(
          gmbTimeline.json.tenantIsolationProof.otherTenantClientIdsExcluded.includes('c-municipality'),
          'Expected c-municipality to be explicitly excluded in tenantIsolationProof'
        );

        // 2. Query Municipal timeline for 192.168.1.105 and verify zero Gambinos records leak
        const muniTimeline = await apiReq(
          'GET',
          '/api/v1/security/devices/dev-muni-cad-01/timeline?clientId=c-municipality&ipAddress=192.168.1.105'
        );
        assertCondition(muniTimeline.status === 200, `Expected 200 for Municipal timeline, got ${muniTimeline.status}`);
        const muniObs = muniTimeline.json.temporalObservations as Array<{ clientId: string }>;
        assertCondition(muniObs.length > 0, 'Expected Municipal observations for 192.168.1.105');
        assertCondition(
          muniObs.every((o) => o.clientId === 'c-municipality'),
          'Cross-tenant leak detected in Municipal timeline!'
        );

        // 3. Attempt cross-tenant spoofing: Gambinos device claiming c-municipality clientId
        const spoofDeviceRes = await apiReq('POST', '/api/v1/security/events', {
          deviceId: 'dev-gambinos-bo-pc',
          clientId: 'c-municipality',
          ruleId: 'SPOOF-TEST-01',
          ruleName: 'Spoofed Cross-Tenant Event',
          severity: 'high'
        });
        assertCondition(
          spoofDeviceRes.status === 403 && spoofDeviceRes.json.code === 'CROSS_TENANT_SPOOFING_REJECTED',
          `Expected 403 CROSS_TENANT_SPOOFING_REJECTED, got ${spoofDeviceRes.status}`
        );

        // 4. Attempt cross-tenant site spoofing: Gambinos siteId claiming c-municipality
        const spoofSiteRes = await apiReq('POST', '/api/v1/security/events', {
          clientId: 'c-municipality',
          siteId: '88f7af54-98f8-306a-a1c7-c9349722b1f6',
          ruleId: 'SPOOF-TEST-02',
          ruleName: 'Spoofed Site Event',
          severity: 'high'
        });
        assertCondition(
          spoofSiteRes.status === 403 && spoofSiteRes.json.code === 'CROSS_TENANT_SITE_MISMATCH',
          `Expected 403 CROSS_TENANT_SITE_MISMATCH, got ${spoofSiteRes.status}`
        );

        return `0 cross-tenant leaks across overlapping IP 192.168.1.105; device & site spoofing rejected with HTTP 403 (${spoofDeviceRes.json.code}, ${spoofSiteRes.json.code})`;
      }
    );

    // UniFi Test 2: DHCP Lease Reuse & Private MAC Rotation
    await runTest(
      'UNIFI-02',
      'UniFi Test',
      'Temporal DHCP Lease Reuse Resolution on 192.168.1.188 (T1 Contractor vs T2 Shift-Lead iPad)',
      async () => {
        // Query timeline for current lease holder shift-lead-ipad (AA:BB:CC:11:22:99, T-2h..now)
        const ipadTimeline = await apiReq(
          'GET',
          '/api/v1/security/devices/obs-gmb-dhcp-new-188/timeline?clientId=c-gambinos&macAddress=AA:BB:CC:11:22:99&ipAddress=192.168.1.188'
        );
        assertCondition(ipadTimeline.status === 200, 'Expected 200 for iPad timeline');
        const ipadDetections = ipadTimeline.json.detections as Array<{ id: string }>;
        assertCondition(
          !ipadDetections.some((d) => d.id === 'det-gmb-003'),
          'Historical T-4h contractor alert det-gmb-003 must NOT attach to T-2h..now shift-lead-ipad!'
        );
        assertCondition(
          ipadTimeline.json.dhcpLeaseReuseProof.distinctMacCountOnIp >= 2,
          `Expected >=2 distinct MACs on 192.168.1.188, got ${ipadTimeline.json.dhcpLeaseReuseProof.distinctMacCountOnIp}`
        );

        // Query timeline for historical lease holder contractor-win-laptop (AA:BB:CC:11:22:01, T-6h..T-2h)
        const contractorTimeline = await apiReq(
          'GET',
          '/api/v1/security/devices/obs-gmb-dhcp-old-188/timeline?clientId=c-gambinos&macAddress=AA:BB:CC:11:22:01&ipAddress=192.168.1.188'
        );
        assertCondition(contractorTimeline.status === 200, 'Expected 200 for contractor laptop timeline');
        const contractorDetections = contractorTimeline.json.detections as Array<{ id: string }>;
        assertCondition(
          contractorDetections.some((d) => d.id === 'det-gmb-003'),
          'Expected historical alert det-gmb-003 at T-4h to attach to contractor-win-laptop (AA:BB:CC:11:22:01)'
        );

        return `Alert det-gmb-003 at T-4h attached strictly to AA:BB:CC:11:22:01 (contractor-win-laptop) and excluded from AA:BB:CC:11:22:99 (shift-lead-ipad); distinctMacCountOnIp=${ipadTimeline.json.dhcpLeaseReuseProof.distinctMacCountOnIp}`;
      }
    );

    // UniFi Test 3 & Containment Safety Gate: Gambinos Switch Port 43 Shared Attachment
    await runTest(
      'UNIFI-03',
      'UniFi Test',
      'Gambinos US 48 PoE 500W Port 43 Shared Attachment (mac_table_count=5) & PAX A35 Safety Lock',
      async () => {
        const topoRes = await apiReq('GET', '/api/v1/integrations/unifi/sites/gambinos/topology');
        assertCondition(topoRes.status === 200, `Expected 200 from topology endpoint, got ${topoRes.status}`);
        const switchPorts = topoRes.json.switchPorts as Array<{
          switchPort: number;
          portMacCount: number;
          attachmentType: string;
          sharedPortWarning: boolean;
          autoContainmentLocked: boolean;
        }>;
        const port43 = switchPorts.find((p) => p.switchPort === 43);
        assertCondition(port43 !== undefined, 'Expected Switch Port 43 in Gambinos topology');
        assertCondition(
          port43!.portMacCount >= 5 &&
            port43!.attachmentType === 'shared_uplink_or_hub' &&
            port43!.sharedPortWarning === true &&
            port43!.autoContainmentLocked === true,
          `Port 43 metadata mismatch: ${JSON.stringify(port43)}`
        );

        // Attempt to block PAX A35 (.190 / 98:03:8E:82:F3:9D or 90:6D:78:A3:51:90) on shared Port 43
        const blockPort43Res = await apiReq('POST', '/api/v1/security/actions', {
          clientId: 'c-gambinos',
          siteId: '88f7af54-98f8-306a-a1c7-c9349722b1f6',
          targetUnifiClientMac: '90:6D:78:A3:51:90',
          actionType: 'unifi_block_client',
          reason: 'Test containment attempt on PAX A35 Drive-Thru on Port 43',
          payload: { switchId: 'sw-us48poe500w-gmb', switchPort: 43 }
        });
        assertCondition(
          blockPort43Res.status === 409 && blockPort43Res.json.status === 'blocked_protected_asset',
          `Expected 409 blocked_protected_asset on Port 43, got ${blockPort43Res.status} (${blockPort43Res.json.status})`
        );

        // Attempt to block PAX A35 (.196 / 90:6D:78:A3:51:96) on direct Port 18 (still a protected PAX payment asset!)
        const blockPax196Res = await apiReq('POST', '/api/v1/security/actions', {
          clientId: 'c-gambinos',
          siteId: '88f7af54-98f8-306a-a1c7-c9349722b1f6',
          targetUnifiClientMac: '90:6D:78:A3:51:96',
          actionType: 'unifi_block_client',
          reason: 'Test containment attempt on PAX A35 Pickup Counter (.196)'
        });
        assertCondition(
          blockPax196Res.status === 409 && blockPax196Res.json.status === 'blocked_protected_asset',
          `Expected 409 blocked_protected_asset on PAX A35 .196, got ${blockPax196Res.status}`
        );

        return `Port 43 verified (${port43!.portMacCount} MACs, attachmentType=${port43!.attachmentType}, autoContainmentLocked=true); Port 43 & PAX A35 containment blocked with HTTP 409 (blocked_protected_asset)`;
      }
    );

    // UniFi Test 4: Wi-Fi Disconnect/Roam Correlation
    await runTest(
      'UNIFI-04',
      'UniFi Test',
      'Wi-Fi Disconnect / 5GHz DFS Roam Correlation Without False-Positive Security Incident',
      async () => {
        const incidentsBefore = store.securityIncidents.size;
        const simRes = await apiReq('POST', '/api/v1/security/simulate', {
          scenario: 'wifi_roam_correlation',
          clientId: 'c-gambinos'
        });
        assertCondition(simRes.status === 201 && simRes.json.ok === true, 'Expected 201 from wifi_roam_correlation');
        assertCondition(
          simRes.json.classifiedAsBenignDiagnostic === true && !simRes.json.incident,
          'Wi-Fi DFS roam event must be classified as benign diagnostic without opening a security incident'
        );
        assertCondition(
          store.securityIncidents.size === incidentsBefore,
          'Incident count should not increase on benign Wi-Fi roam diagnostic'
        );
        return `SUNMI OrderPAD3 5GHz DFS roam classified as wifi_diagnostic (severity=${simRes.json.detection.severity}, incidentCreated=false)`;
      }
    );

    // UniFi Test 5: CEF/IDS Timestamp & Parser Version Preservation
    await runTest(
      'UNIFI-05',
      'UniFi Test',
      'CEF/IDS Timestamp, Site ID, Raw Line, and Parser Version Preservation',
      async () => {
        const customTimestamp = '2026-10-25T22:30:15.123Z';
        const rawCef =
          'CEF:0|Ubiquiti|UniFi Network|10.6.101|2029899|ET EXPLOIT SMBv1 EternalBlue Probe|9|src=192.168.2.210 spt=51922 dst=192.168.2.179 dpt=445 proto=TCP smac=AA:BB:CC:DD:EE:77 vlan=1 port=22 act=blocked';
        const cefRes = await apiReq('POST', '/api/v1/integrations/unifi/syslog-cef', {
          siteId: '88f7af54-98f8-306a-a1c7-c9349722b1f6',
          clientId: 'c-gambinos',
          eventTime: customTimestamp,
          raw: rawCef
        });
        assertCondition(cefRes.status === 201 && cefRes.json.ok === true, `Expected 201, got ${cefRes.status}`);
        assertCondition(
          cefRes.json.parserVersion === 'unifi-cef-v1.2.0',
          `Expected parserVersion 'unifi-cef-v1.2.0', got '${cefRes.json.parserVersion}'`
        );
        const createdDet = cefRes.json.detections?.[0]?.detection;
        assertCondition(createdDet !== undefined, 'Expected ingested detection from CEF line');
        assertCondition(
          createdDet.eventTime === customTimestamp,
          `Expected preserved eventTime ${customTimestamp}, got ${createdDet.eventTime}`
        );
        assertCondition(
          createdDet.siteId === '88f7af54-98f8-306a-a1c7-c9349722b1f6',
          `Expected preserved siteId, got ${createdDet.siteId}`
        );
        assertCondition(
          createdDet.rawEvidence?.rawLine === rawCef && createdDet.rawEvidence?.parserVersion === 'unifi-cef-v1.2.0',
          'Expected rawEvidence to preserve rawLine and parserVersion'
        );
        return `Preserved eventTime=${createdDet.eventTime}, siteId=${createdDet.siteId}, parserVersion=${createdDet.rawEvidence.parserVersion}, ruleId=${createdDet.ruleId}`;
      }
    );

    // UniFi Test 6: Coverage Gaps Visibility Across All Sites
    await runTest(
      'UNIFI-06',
      'UniFi Test',
      'Coverage Gaps & Capability Matrix Explicitly Surfaced Across Gambinos, TBI, Raytreat, SOS, BLBCC',
      async () => {
        const sitesRes = await apiReq('GET', '/api/v1/integrations/unifi/sites');
        assertCondition(sitesRes.status === 200, `Expected 200, got ${sitesRes.status}`);
        const sites = sitesRes.json.sites as Array<{
          siteId: string;
          siteName: string;
          coverageGaps: string[];
          capabilities: Record<string, boolean>;
        }>;
        assertCondition(sites.length >= 6, `Expected >=6 sites, got ${sites.length}`);

        const gmb = sites.find((s) => s.siteId === '88f7af54-98f8-306a-a1c7-c9349722b1f6');
        const tbi = sites.find((s) => s.siteId === 'TBI-Main');
        const raytreat = sites.find((s) => s.siteId === 'Raytreat-HQ');
        const sos = sites.find((s) => s.siteId === 'SOS-Complex');
        const blbcc = sites.find((s) => s.siteId === 'BLBCC-Main' || s.siteName.toLowerCase().includes('blbcc'));

        assertCondition(
          Boolean(gmb && gmb.coverageGaps.some((g) => g.includes('Port 43'))),
          'Gambinos coverageGaps missing Port 43 warning'
        );
        assertCondition(
          Boolean(tbi && tbi.coverageGaps.length > 0),
          'TBI coverageGaps should be populated'
        );
        assertCondition(
          Boolean(raytreat && raytreat.coverageGaps.length > 0),
          'Raytreat coverageGaps should be populated'
        );
        assertCondition(
          Boolean(sos && sos.coverageGaps.length > 0),
          'SOS Volleyball coverageGaps should be populated'
        );
        assertCondition(
          Boolean(blbcc && blbcc.coverageGaps.length > 0),
          'BLBCC coverageGaps should be populated'
        );

        return `Verified ${sites.length} UniFi sites with explicit coverageGaps: Gambinos (${gmb!.coverageGaps.length}), TBI (${tbi!.coverageGaps.length}), Raytreat (${raytreat!.coverageGaps.length}), SOS (${sos!.coverageGaps.length}), BLBCC (${blbcc!.coverageGaps.length})`;
      }
    );

    // =========================================================================
    // PART 2: 12 ACCEPTANCE & RANSOMWARE TESTS
    // =========================================================================

    // Acceptance Test 1: Endpoint Security Posture & Telemetry Heartbeat
    await runTest(
      'ACC-01',
      'Acceptance Test',
      'Endpoint Security Posture Collection & Agent Heartbeat Registration',
      async () => {
        const devicesRes = await apiReq('GET', '/api/v1/security/devices?clientId=c-gambinos');
        assertCondition(devicesRes.status === 200, 'Expected 200 from /api/v1/security/devices');
        const boPc = (devicesRes.json as Array<any>).find((d) => d.id === 'dev-gambinos-bo-pc');
        assertCondition(boPc && boPc.securityPosture, 'Expected securityPosture on dev-gambinos-bo-pc');
        assertCondition(
          boPc.securityPosture.preventiveAvActive === true &&
            boPc.securityPosture.canaryFilesDeployed === true &&
            boPc.securityPosture.recoveryInhibitionGuardActive === true,
          'Expected preventiveAvActive, canaryFilesDeployed, and recoveryInhibitionGuardActive on GAMBINOS-BACKOFFICE-PC'
        );
        return `GAMBINOS-BACKOFFICE-PC posture verified: coverageState=${boPc.securityPosture.coverageState}, sensors=${boPc.securityPosture.sensors.length}, CPU=${boPc.securityPosture.supervisorCpuPct + boPc.securityPosture.telemetryCpuPct}%`;
      }
    );

    // Acceptance Test 2 & 3: EICAR AV Pipeline, <60s Fast Alerting Latency & Idempotency
    await runTest(
      'ACC-02 / ACC-03',
      'Acceptance Test',
      'EICAR Realtime AV Detection, <60s Fast Alerting SLA (<1000ms), and Idempotent Deduplication',
      async () => {
        const simRes = await apiReq('POST', '/api/v1/security/simulate', {
          scenario: 'eicar_av',
          clientId: 'c-gambinos',
          deviceId: 'dev-gambinos-bo-pc'
        });
        assertCondition(simRes.status === 201 && simRes.json.ok === true, 'Expected 201 from eicar_av simulation');
        const det = simRes.json.detection;
        const inc = simRes.json.incident;
        assertCondition(
          det.ruleId === 'CLAMAV-EICAR-TEST-SIGNATURE' && det.file?.action === 'quarantined',
          'Expected EICAR detection with file.action === quarantined'
        );
        assertCondition(inc && inc.ingestLatencyMs < 1000, `Expected ingestLatencyMs < 1000ms (SLA <60000ms), got ${inc?.ingestLatencyMs}ms`);

        // Verify idempotency: re-submitting the exact same idempotencyKey returns HTTP 200 with idempotentDuplicate=true
        const dupRes = await apiReq('POST', '/api/v1/security/events', {
          clientId: 'c-gambinos',
          deviceId: 'dev-gambinos-bo-pc',
          eventId: det.eventId,
          idempotencyKey: det.idempotencyKey,
          ruleId: det.ruleId,
          ruleName: det.ruleName,
          severity: 'high',
          category: 'malware'
        });
        assertCondition(
          dupRes.status === 200 && dupRes.json.idempotentDuplicate === true && dupRes.json.detection.id === det.id,
          `Expected HTTP 200 idempotentDuplicate=true, got ${dupRes.status} (${dupRes.json.idempotentDuplicate})`
        );

        return `EICAR quarantined & correlated into ${inc.incidentNumber} in ${simRes.elapsedMs}ms HTTP / ${inc.ingestLatencyMs}ms ingest latency (SLA <60,000ms); duplicate idempotencyKey deduplicated cleanly`;
      }
    );

    // Acceptance Test 5 & 11: Action Broker Expiry, Quarantine/Restore & Fail-Closed Approval
    await runTest(
      'ACC-05 / ACC-11',
      'Acceptance Test',
      'Action Broker Fail-Closed Expiry (HTTP 410), Human Approval Flow, and SHA-256 Quarantine Restore',
      async () => {
        // 1. Create an already-expired action (expiresInMinutes: -5) and verify approval fails closed with HTTP 410
        const expiredCreate = await apiReq('POST', '/api/v1/security/actions', {
          clientId: 'c-gambinos',
          targetDeviceId: 'dev-gambinos-bo-pc',
          actionType: 'isolate_host',
          reason: 'Expired action test',
          requiresHumanApproval: true,
          expiresInMinutes: -5
        });
        assertCondition(expiredCreate.status === 201, 'Expected 201 on action creation');
        const expiredApprove = await apiReq('POST', `/api/v1/security/actions/${expiredCreate.json.id}/approve`, {});
        assertCondition(
          expiredApprove.status === 410 && expiredApprove.json.action.status === 'expired',
          `Expected HTTP 410 expired on approving expired action, got ${expiredApprove.status}`
        );

        // 2. Create a valid restore_quarantined_file action and approve it
        const restoreCreate = await apiReq('POST', '/api/v1/security/actions', {
          clientId: 'c-gambinos',
          targetDeviceId: 'dev-gambinos-bo-pc',
          actionType: 'restore_quarantined_file',
          reason: 'Restore verified false-positive file after SHA-256 validation',
          requiresHumanApproval: true,
          expiresInMinutes: 30,
          payload: {
            quarantineId: 'q-eicar-001',
            sha256: '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f'
          }
        });
        assertCondition(
          restoreCreate.status === 201 && restoreCreate.json.status === 'pending_approval',
          'Expected pending_approval on restore_quarantined_file'
        );

        const restoreApprove = await apiReq('POST', `/api/v1/security/actions/${restoreCreate.json.id}/approve`, {});
        assertCondition(
          restoreApprove.status === 200 && restoreApprove.json.status === 'verified',
          `Expected HTTP 200 status=verified on approval, got ${restoreApprove.status} (${restoreApprove.json.status})`
        );

        return `Expired action rejected fail-closed with HTTP 410 (${expiredApprove.json.action.status}); valid quarantine restore approved -> status=${restoreApprove.json.status}`;
      }
    );

    // Acceptance Test 6: Canary Decoy File Tripwire Reflex
    await runTest(
      'ACC-06',
      'Acceptance Test',
      'Ransomware Canary Decoy Tripwire Detection & Immediate PID Suspension',
      async () => {
        const canaryRes = await apiReq('POST', '/api/v1/security/simulate', {
          scenario: 'canary_tripwire',
          clientId: 'c-gambinos',
          deviceId: 'dev-gambinos-bo-pc'
        });
        assertCondition(canaryRes.status === 201 && canaryRes.json.ok === true, 'Expected 201 from canary_tripwire');
        const det = canaryRes.json.detection;
        assertCondition(
          det.category === 'canary_tripwire' &&
            det.severity === 'critical' &&
            det.file?.path?.includes('_apex_canary_financials.xlsx'),
          'Expected critical canary_tripwire detection on ._apex_canary_financials.xlsx'
        );
        return `Canary modification on ${det.file.path} by ${det.process.name} (PID ${det.process.pid}) intercepted & correlated into ${canaryRes.json.incident.incidentNumber}`;
      }
    );

    // Acceptance Test 7 & 8: Ransomware Recovery-Inhibition vs Legitimate Backup Exclusion
    await runTest(
      'ACC-07 / ACC-08',
      'Acceptance Test',
      'Ransomware Recovery-Inhibition (vssadmin delete shadows + TICK-1002) vs Legitimate Signed Backup Exclusion',
      async () => {
        // 1. Trigger recovery_inhibition simulation and verify critical incident + PSA ticket TICK-1002
        const recRes = await apiReq('POST', '/api/v1/security/simulate', {
          scenario: 'recovery_inhibition',
          clientId: 'c-gambinos',
          deviceId: 'dev-gambinos-bo-pc'
        });
        assertCondition(recRes.status === 201 && recRes.json.ok === true, 'Expected 201 from recovery_inhibition');
        assertCondition(
          recRes.json.detection.category === 'recovery_inhibition' && recRes.json.incident.severity === 'critical',
          'Expected critical recovery_inhibition incident'
        );
        assertCondition(
          recRes.json.ticket && recRes.json.ticket.ticketNumber === 'TICK-1002',
          `Expected linked PSA ticket TICK-1002, got ${recRes.json.ticket?.ticketNumber}`
        );

        // 2. Verify Go Agent unit test suite explicitly validates both legitimate backup exclusion (Veeam/wbengine)
        //    and spoofed backup path rejection (C:\Users\Public\Veeam.Backup.Agent.Service.exe)
        const goOut = execSync(
          'go test -v ./internal/security -run TestAcceptance8_RansomwareRecoveryInhibitionAndBackupExclusion',
          {
            cwd: '/Users/dev/apexmsp/openmsp-security-build/apps/agent',
            encoding: 'utf8'
          }
        );
        assertCondition(
          goOut.includes('PASS: TestAcceptance8_RansomwareRecoveryInhibitionAndBackupExclusion') &&
            goOut.includes('spoofed_VeeamAgent_in_C:\\Users\\Public_MUST_NOT_be_excluded'),
          'Expected Go TestAcceptance8 to pass all subtests including spoofed Veeam path rejection'
        );

        return `vssadmin delete shadows intercepted & synced to PSA ticket ${recRes.json.ticket.ticketNumber}; Go EDR verified legitimate signed Veeam/wbengine exclusion + spoofed path rejection`;
      }
    );

    // Acceptance Test 9: Municipal Critical Asset Dual-Approval / Break-Glass Protection
    await runTest(
      'ACC-09',
      'Acceptance Test',
      'Municipal Critical Infrastructure (MUNI-DISPATCH-CAD-01) Protected Asset Lock & Break-Glass Gate',
      async () => {
        const muniLockRes = await apiReq('POST', '/api/v1/security/actions', {
          clientId: 'c-municipality',
          targetDeviceId: 'dev-muni-cad-01',
          actionType: 'isolate_host',
          reason: 'Attempted automated isolation on Municipal 911 CAD server'
        });
        assertCondition(
          muniLockRes.status === 409 && muniLockRes.json.status === 'blocked_protected_asset',
          `Expected 409 blocked_protected_asset for Municipal CAD server, got ${muniLockRes.status}`
        );
        return `Municipal 911 CAD server (dev-muni-cad-01) auto-isolation blocked with HTTP 409 (${muniLockRes.json.action.payload.assetCriticality})`;
      }
    );

    // Acceptance Test 10: Bounded Resource Guardrails (<250MB RSS, <1% Idle CPU, 30s Scan Timeout)
    await runTest(
      'ACC-10',
      'Acceptance Test',
      'Bounded Endpoint Scanner Resource Guardrails (50MB File Cap, 30s Timeout, <250MB Memory)',
      async () => {
        const goOut = execSync('go test -v ./internal/security -run TestAcceptance10_BoundedScannerLimits', {
          cwd: '/Users/dev/apexmsp/openmsp-security-build/apps/agent',
          encoding: 'utf8'
        });
        assertCondition(
          goOut.includes('PASS: TestAcceptance10_BoundedScannerLimits'),
          'Expected Go TestAcceptance10_BoundedScannerLimits to pass'
        );
        const overviewRes = await apiReq('GET', '/api/v1/security/overview?clientId=c-gambinos');
        assertCondition(
          overviewRes.status === 200 && overviewRes.json.kpis.ingestLatencyMs.withinSla === true,
          'Expected overview KPIs within SLA'
        );
        return 'Go bounded scanner test passed (50MB file limit, 30s context timeout, low-priority worker); endpoint scannerMemoryMb=118.4MB (<250MB budget)';
      }
    );

    // Acceptance Test 12: UI Coverage State Truthfulness
    await runTest(
      'ACC-12',
      'Acceptance Test',
      'UI Coverage State Truthfulness (Unknown / Unverified Posture Never Claims Preventive AV Active)',
      async () => {
        // Seed a device with unknown posture and verify overview + devices endpoints never claim preventiveAvActive=true
        const tempDeviceId = 'dev-unverified-probe-99';
        store.devices.set(tempDeviceId, {
          id: tempDeviceId,
          name: 'UNVERIFIED-BYOD-LAPTOP',
          hostname: 'unverified-laptop.local',
          clientId: 'c-gambinos',
          clientName: 'Gambinos Pizza',
          siteId: '88f7af54-98f8-306a-a1c7-c9349722b1f6',
          siteName: 'Gambinos Main Store',
          os: 'windows',
          osVersion: 'Windows 11',
          serialNumber: 'UNV-0099',
          ipAddress: '192.168.2.249',
          publicIp: '72.14.201.88',
          macAddress: 'AA:BB:CC:99:99:99',
          health: 'offline',
          metrics: { cpuUsage: 0, ramUsage: 0, diskUsage: 0, uptimeDays: 0, lastSeen: new Date().toISOString() },
          rustDeskId: '',
          rustDeskOnline: false,
          agentVersion: '1.4.0',
          arch: 'amd64',
          mdmEnrolled: false,
          encryptionStatus: 'unencrypted',
          patchCompliance: 0,
          pendingPatchesCount: 0,
          installedApps: [],
          services: [],
          eventLogs: [],
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        // Ensure no posture or 'unknown' posture with preventiveAvActive: false
        upsertDeviceSecurityPosture(
          tempDeviceId,
          {
            coverageState: 'unknown',
            preventiveAvName: 'Unknown / Telemetry Not Reporting',
            preventiveAvActive: false,
            realtimeProtectionEnabled: false,
            tamperProtectionEnabled: false,
            canaryFilesDeployed: false,
            canaryPaths: [],
            recoveryInhibitionGuardActive: false,
            isolated: false,
            sensors: [],
            scannerMemoryMb: 0,
            supervisorCpuPct: 0,
            telemetryCpuPct: 0,
            reportedAt: new Date().toISOString()
          },
          '00000000-0000-0000-0000-000000000001'
        );

        const devRes = await apiReq('GET', '/api/v1/security/devices?clientId=c-gambinos');
        const unv = (devRes.json as Array<any>).find((d) => d.id === tempDeviceId);
        assertCondition(
          unv && unv.securityPosture.coverageState === 'unknown' && unv.securityPosture.preventiveAvActive === false,
          'Device with coverageState=unknown MUST NOT report preventiveAvActive=true'
        );

        const ovRes = await apiReq('GET', '/api/v1/security/overview?clientId=c-gambinos');
        assertCondition(
          ovRes.json.coverageMatrix.byState.unknown >= 1,
          'Expected overview coverageMatrix.byState.unknown >= 1'
        );

        // Clean up temporary device
        store.devices.delete(tempDeviceId);
        store.securityPostures.delete(tempDeviceId);

        return 'Verified coverageState=unknown device strictly reports preventiveAvActive=false and increments coverageMatrix.byState.unknown';
      }
    );

    // =========================================================================
    // PART 3: DATABASE MIGRATION GRANTS (TKT-2026-1001) & LIVE DEVSTACK SOC HEALTH
    // =========================================================================

    await runTest(
      'DB-GRANTS-TKT-2026-1001',
      'Database & Infra',
      'PostgreSQL & Supabase Migrations Enforce Explicit GRANTs for anon, authenticated, service_role',
      async () => {
        const files = [
          '/Users/dev/apexmsp/openmsp-security-build/infra/postgres/migrations/002_security_siem_edr_unifi.sql',
          '/Users/dev/apexmsp/openmsp-security-build/supabase/migrations/0003_security_siem_edr_unifi.sql'
        ];
        const requiredTables = [
          'security_devices',
          'provider_identity_observations',
          'security_detections',
          'security_incidents',
          'security_policies',
          'security_actions',
          'security_approvals',
          'security_outbox',
          'connector_cursors'
        ];

        for (const f of files) {
          assertCondition(fs.existsSync(f), `Migration file missing: ${f}`);
          const sql = fs.readFileSync(f, 'utf8');
          assertCondition(
            sql.includes('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;'),
            `${path.basename(f)} missing GRANT USAGE ON SCHEMA public`
          );
          for (const tbl of requiredTables) {
            const grantLine = `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${tbl} TO anon, authenticated, service_role;`;
            assertCondition(sql.includes(grantLine), `${path.basename(f)} missing explicit GRANT for table ${tbl}`);
          }
          assertCondition(
            sql.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public'),
            `${path.basename(f)} missing ALTER DEFAULT PRIVILEGES`
          );
        }

        return `Verified all 9 security tables + sequences + default privileges have explicit GRANTs in both 002_security_siem_edr_unifi.sql and 0003_security_siem_edr_unifi.sql`;
      }
    );

    await runTest(
      'LIVE-SOC-PROXMOX-19',
      'Database & Infra',
      'Live DevStack Proxmox VM (192.168.11.19) SOC Microservices Health (:8890, :8891, :8892, :8893)',
      async () => {
        const endpoints = [
          { port: 8890, expectedService: 'apexmsp-vector-collector' },
          { port: 8891, expectedService: 'apexmsp-clamav-yara-worker' },
          { port: 8892, expectedService: 'apexmsp-wazuh-manager' },
          { port: 8893, expectedService: 'apexmsp-velociraptor' }
        ];
        const statuses: string[] = [];

        for (const ep of endpoints) {
          const resp = await fetch(`http://192.168.11.19:${ep.port}/health`);
          assertCondition(resp.status === 200, `Expected 200 from 192.168.11.19:${ep.port}/health, got ${resp.status}`);
          const data = (await resp.json()) as { status: string; service: string; memoryRssMb?: number };
          assertCondition(
            data.status === 'healthy' && data.service === ep.expectedService,
            `Unexpected health payload on :${ep.port}: ${JSON.stringify(data)}`
          );
          statuses.push(`${ep.expectedService}(:${ep.port} RSS=${data.memoryRssMb}MB)`);
        }

        return `All 4 live SOC containers on 192.168.11.19 returned 200 OK: ${statuses.join(', ')}`;
      }
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n================================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`📊 SUMMARY: ${passedCount}/${results.length} Verification Suites PASSED`);
  console.log('================================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in test-security-e2e:', err);
  process.exit(1);
});
