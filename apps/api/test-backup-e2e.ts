import assert from 'node:assert/strict';

process.env.PORT = '0';
process.env.NODE_ENV = 'test';

async function runBackupE2E() {
  const { server } = await import('./src/server.js');

  await new Promise<void>((resolve) => {
    if (server.listening) {
      resolve();
    } else {
      server.once('listening', () => resolve());
    }
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3001;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[E2E] ApexVault Backup Control Plane test server listening at ${baseUrl}`);

  // 1. Verify GET /api/v1/backups/overview
  console.log('[1/9] Testing GET /api/v1/backups/overview...');
  const overviewRes = await fetch(`${baseUrl}/api/v1/backups/overview`);
  assert.equal(overviewRes.status, 200, 'Overview should return 200');
  const overview = (await overviewRes.json()) as any;
  assert.ok(overview.totalLogicalBytes > 0, 'totalLogicalBytes should be > 0');
  assert.ok(overview.totalStoredDeduplicatedBytes > 0, 'totalStoredDeduplicatedBytes should be > 0');
  assert.ok(overview.globalDedupRatio > 1.5, 'globalDedupRatio should be > 1.5');
  assert.ok(Array.isArray(overview.vaults) && overview.vaults.length >= 2, 'Should have at least 2 seeded vaults');
  assert.ok(Array.isArray(overview.policies) && overview.policies.length >= 3, 'Should have at least 3 seeded policies');
  assert.ok(Array.isArray(overview.snapshots) && overview.snapshots.length >= 6, 'Should have at least 6 seeded snapshots');
  assert.ok(Array.isArray(overview.deviceReports) && overview.deviceReports.length >= 1, 'Should have seeded deviceReports');
  assert.equal(overview.unifiNasStatus.ip, '192.168.4.161', 'UniFi NAS IP should be 192.168.4.161');
  assert.equal(overview.backblazeB2Status.applicationKeyRestricted, true, 'Backblaze B2 key should be restricted');
  console.log(`  ✓ Overview verified: ${overview.vaults.length} vaults, ${overview.policies.length} policies, ${overview.snapshots.length} snapshots, ${overview.globalDedupRatio}x dedup ratio`);

  // 2. Verify GET /api/v1/installers/kopia-manifest
  console.log('[2/9] Testing GET /api/v1/installers/kopia-manifest...');
  const manifestRes = await fetch(`${baseUrl}/api/v1/installers/kopia-manifest`);
  assert.equal(manifestRes.status, 200, 'kopia-manifest should return 200');
  const manifest = (await manifestRes.json()) as any;
  assert.equal(manifest.version, '0.18.2', 'Kopia version should be 0.18.2');
  for (const plat of ['darwin-arm64', 'darwin-amd64', 'windows-amd64', 'linux-amd64', 'linux-arm64']) {
    assert.ok(manifest.platforms[plat]?.sha256, `Missing SHA-256 for ${plat}`);
    assert.ok(manifest.platforms[plat]?.downloadUrl, `Missing downloadUrl for ${plat}`);
  }
  console.log('  ✓ Kopia v0.18.2 manifest verified for all 5 OS/arch targets');

  // 3. Trigger Phase 1 File & Object Dedup Backup
  console.log('[3/9] Testing POST /api/v1/backups/snapshots/trigger (file_object_dedup)...');
  const fileTrigRes = await fetch(`${baseUrl}/api/v1/backups/snapshots/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'dev-mac-7c8a43',
      policyId: 'pol-backup-files-dedup',
      mode: 'file_object_dedup',
      includePaths: ['/Users/dev/Documents', '/etc'],
      enableWindowsVss: false
    })
  });
  assert.equal(fileTrigRes.status, 201, 'Trigger file_object_dedup should return 201');
  const fileTrig = (await fileTrigRes.json()) as any;
  assert.equal(fileTrig.ok, true);
  assert.equal(fileTrig.snapshot.mode, 'file_object_dedup');
  assert.equal(fileTrig.command.commandType, 'backup_run');
  assert.ok(fileTrig.snapshot.dedupSavingsPct > 50, 'Dedup savings should be > 50%');
  console.log(`  ✓ File dedup snapshot created: ${fileTrig.snapshot.id} (command ${fileTrig.command.id})`);

  // 4. Trigger Phase 2 Atomic Volume Snapshot (Windows VSS)
  console.log('[4/9] Testing POST /api/v1/backups/snapshots/trigger (volume_snapshot_vss)...');
  const vssTrigRes = await fetch(`${baseUrl}/api/v1/backups/snapshots/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'dev-win-01',
      policyId: 'pol-backup-vss-snapshot',
      mode: 'volume_snapshot_vss',
      includePaths: ['C:\\Users', 'C:\\POSDatabase'],
      enableWindowsVss: true
    })
  });
  assert.equal(vssTrigRes.status, 201, 'Trigger volume_snapshot_vss should return 201');
  const vssTrig = (await vssTrigRes.json()) as any;
  assert.equal(vssTrig.snapshot.mode, 'volume_snapshot_vss');
  assert.equal(vssTrig.snapshot.vssShadowCopyUsed, true, 'vssShadowCopyUsed should be true');
  assert.ok(vssTrig.snapshot.vssShadowCopyPath?.includes('HarddiskVolumeShadowCopy'), 'Should include Windows VSS shadow copy path');
  console.log(`  ✓ VSS atomic snapshot created: ${vssTrig.snapshot.id} (${vssTrig.snapshot.vssShadowCopyPath})`);

  // 5. Verify Snapshot Cryptographic Integrity
  console.log('[5/9] Testing POST /api/v1/backups/snapshots/:id/verify...');
  const verifyRes = await fetch(`${baseUrl}/api/v1/backups/snapshots/${vssTrig.snapshot.id}/verify`, {
    method: 'POST'
  });
  assert.equal(verifyRes.status, 200, 'Verify snapshot should return 200');
  const verifyData = (await verifyRes.json()) as any;
  assert.equal(verifyData.snapshot.verificationStatus, 'verified_ok');
  assert.equal(verifyData.snapshot.status, 'verified');
  assert.equal(verifyData.command.commandType, 'backup_verify');
  console.log(`  ✓ Snapshot integrity verified: ${verifyData.snapshot.sha256RootHash}`);

  // 6. Provision Append-Only Backblaze B2 Tenant Key
  console.log('[6/9] Testing POST /api/v1/backups/vaults/vault-b2-cloud-01/provision-b2-key...');
  const b2KeyRes = await fetch(`${baseUrl}/api/v1/backups/vaults/vault-b2-cloud-01/provision-b2-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: 'c-gambinos',
      bucketName: 'apexmsp-immutable-vault-prod'
    })
  });
  assert.equal(b2KeyRes.status, 201, 'Provision B2 key should return 201');
  const b2KeyData = (await b2KeyRes.json()) as any;
  assert.equal(b2KeyData.ok, true);
  assert.equal(b2KeyData.mode, 'live_b2_api', 'Should mint real key via live Backblaze B2 API');
  assert.equal(b2KeyData.keyRecord.deleteFilesAllowed, false, 'deleteFilesAllowed must be false');
  assert.ok(!b2KeyData.b2CreateKeyPayload.capabilities.includes('deleteFiles'), 'Capabilities must NEVER include deleteFiles');
  assert.ok(b2KeyData.b2CreateKeyPayload.capabilities.includes('writeFiles'), 'Capabilities must include writeFiles');
  console.log(`  ✓ Provisioned LIVE append-only B2 key ${b2KeyData.keyRecord.applicationKeyId} (mode=${b2KeyData.mode}) with capabilities [${b2KeyData.keyRecord.capabilities.join(', ')}]`);

  // 7. Sync UniFi NAS to Backblaze B2 (3-2-1 Cloud Replication)
  console.log('[7/9] Testing POST /api/v1/backups/vaults/vault-unifi-nas-01/sync-b2...');
  const syncRes = await fetch(`${baseUrl}/api/v1/backups/vaults/vault-unifi-nas-01/sync-b2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'c-brandon-ray' })
  });
  assert.equal(syncRes.status, 200, 'Sync B2 should return 200');
  const syncData = (await syncRes.json()) as any;
  assert.equal(syncData.ok, true);
  assert.equal(syncData.job.jobType, 'sync_unifi_to_b2');
  assert.equal(syncData.job.status, 'completed');
  assert.ok(syncData.replicatedSnapshotsCount >= 8, 'All snapshots should be replicated to B2');
  console.log(`  ✓ 3-2-1 Sync UniFi NAS -> Backblaze B2 completed (${syncData.replicatedSnapshotsCount} snapshots replicated)`);

  // 8. Restore Files from Snapshot
  console.log('[8/9] Testing POST /api/v1/backups/snapshots/:id/restore...');
  const restoreRes = await fetch(`${baseUrl}/api/v1/backups/snapshots/${vssTrig.snapshot.id}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetDeviceId: 'dev-win-01',
      targetRestorePath: 'C:\\Restored_Production_Test',
      paths: ['C:\\Users\\brandon\\Documents\\Q4-Board-Financial-Model.xlsx']
    })
  });
  assert.equal(restoreRes.status, 201, 'Restore files should return 201');
  const restoreData = (await restoreRes.json()) as any;
  assert.equal(restoreData.ok, true);
  assert.equal(restoreData.command.commandType, 'backup_restore');
  assert.equal(restoreData.job.jobType, 'restore_files');
  assert.equal(restoreData.targetRestorePath, 'C:\\Restored_Production_Test');
  console.log(`  ✓ Restore command queued: ${restoreData.command.id} -> ${restoreData.targetRestorePath}`);

  // 9. Create & Advance Bare-Metal Recovery Session (WinPE / Alpine Live ISO -> Proxmox P2V)
  console.log('[9/9] Testing POST /api/v1/backups/bare-metal/sessions & /advance...');
  const bmrRes = await fetch(`${baseUrl}/api/v1/backups/bare-metal/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceDeviceId: 'dev-win-01',
      snapshotId: 'snap-win01-baremetal-001',
      targetHardwareProfile: 'proxmox_vm_p2v',
      bootloaderType: 'uefi_gpt',
      injectVirtioDrivers: true
    })
  });
  assert.equal(bmrRes.status, 201, 'Create bare-metal session should return 201');
  const bmrData = (await bmrRes.json()) as any;
  assert.equal(bmrData.ok, true);
  assert.match(bmrData.session.pairingCode, /^\d{3}-\d{3}$/, 'Pairing code should be 6 digits XXX-XXX');
  assert.equal(bmrData.session.status, 'awaiting_iso_boot');

  // Advance through all stages to completed
  const expectedStages = [
    'iso_paired',
    'partitioning_disks',
    'streaming_dedup_blocks',
    'repairing_bootloader',
    'completed'
  ];
  for (const expectedStage of expectedStages) {
    const advRes = await fetch(`${baseUrl}/api/v1/backups/bare-metal/sessions/${bmrData.session.id}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(advRes.status, 200);
    const advData = (await advRes.json()) as any;
    assert.equal(advData.session.status, expectedStage, `Expected stage ${expectedStage}`);
  }
  console.log(`  ✓ Bare-Metal Recovery Session ${bmrData.session.id} (code ${bmrData.session.pairingCode}) advanced through all 5 recovery stages to completed`);

  console.log('\n[PASS] All 9 ApexVault Backup, Deduplication, B2 Immutability & Bare-Metal Recovery E2E checks passed!');
  server.close();
  process.exit(0);
}

runBackupE2E().catch((err) => {
  console.error('[FAIL] Backup E2E test failed:', err);
  process.exit(1);
});
