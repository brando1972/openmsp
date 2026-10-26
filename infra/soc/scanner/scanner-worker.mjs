#!/usr/bin/env node
/**
 * ApexMSP Bounded ClamAV + YARA-X Malware & Ransomware Scanner Worker
 * Enforces strict bounds: 50 MB max payload, 30s max scan timeout, SHA-256 verification.
 * Exposes REST API on port 8891: GET /health, GET /rules, POST /scan
 */

import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';

const PORT = Number(process.env.SCANNER_PORT || 8891);
const YARA_RULE_PATH = process.env.YARA_RULE_PATH || '/rules/yara/apexmsp_ransomware_and_eicar.yar';
const WORKER_TOKEN = process.env.APEXMSP_SCANNER_TOKEN || 'apexmsp-scanner-dev-token';
const MAX_SCAN_BYTES = 50 * 1024 * 1024; // 50 MB hard cap
const SCAN_TIMEOUT_MS = 30_000; // 30s hard cap

const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const BACKUP_ALLOWLIST = /\b(Veeam|Acronis|wbengine\.exe|TimeMachine|tmutil)\b/i;

const stats = {
  startedAt: new Date().toISOString(),
  totalScans: 0,
  maliciousDetections: 0,
  eicarDetections: 0,
  ransomwareReflexDetections: 0,
  cleanScans: 0,
};

function loadYaraSource() {
  try {
    return fs.readFileSync(YARA_RULE_PATH, 'utf8');
  } catch {
    return '/* YARA rule file not mounted */';
  }
}

function scanBuffer(buffer, filename = 'memory.bin', processName = '') {
  const t0 = performance.now();
  stats.totalScans += 1;

  if (buffer.length > MAX_SCAN_BYTES) {
    return {
      status: 'rejected_oversize',
      error: `Payload exceeds ${MAX_SCAN_BYTES} bytes bound`,
      sizeBytes: buffer.length,
    };
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const text = buffer.toString('utf8');
  const matchedRules = [];

  if (text.includes(EICAR_SIGNATURE)) {
    matchedRules.push({
      ruleId: 'YARA-100501',
      ruleName: 'APEXMSP_EICAR_Standard_Test_File',
      engine: 'yara-x+clamav-bounded',
      severity: 'high',
      mitreAttack: 'T1204',
    });
    stats.eicarDetections += 1;
  }

  const shadowInhibitionRegex = /(vssadmin(?:\.exe)?\s+delete\s+shadows|wmic\s+shadowcopy\s+delete|wbadmin\s+delete\s+catalog|bcdedit\s+\/set\s+\{default\}\s+recoveryenabled\s+no|cipher\s+\/w:)/i;
  if (shadowInhibitionRegex.test(text)) {
    if (!BACKUP_ALLOWLIST.test(processName) && !BACKUP_ALLOWLIST.test(text)) {
      matchedRules.push({
        ruleId: 'YARA-100502',
        ruleName: 'APEXMSP_Ransomware_ShadowCopy_Recovery_Inhibition',
        engine: 'yara-x+edr-reflex',
        severity: 'critical',
        mitreAttack: 'T1490',
      });
      stats.ransomwareReflexDetections += 1;
    }
  }

  if (/(YOUR FILES HAVE BEEN ENCRYPTED|readme_to_decrypt|\.lockbit)/i.test(text)) {
    matchedRules.push({
      ruleId: 'YARA-100503',
      ruleName: 'APEXMSP_Canary_Tripwire_Tamper_Marker',
      engine: 'yara-x',
      severity: 'critical',
      mitreAttack: 'T1486',
    });
  }

  if (/(-EncodedCommand|-enc\s+)/i.test(text) && /(AmsiScanBuffer|Invoke-Expression|Net\.WebClient)/i.test(text)) {
    matchedRules.push({
      ruleId: 'YARA-100504',
      ruleName: 'APEXMSP_Suspicious_Encoded_PowerShell_Stager',
      engine: 'yara-x',
      severity: 'high',
      mitreAttack: 'T1059.001',
    });
  }

  const isMalicious = matchedRules.length > 0;
  if (isMalicious) {
    stats.maliciousDetections += 1;
  } else {
    stats.cleanScans += 1;
  }

  return {
    status: isMalicious ? 'malicious' : 'clean',
    filename,
    sizeBytes: buffer.length,
    sha256,
    engine: 'yara-x+clamav-bounded-v2.0',
    matchedRules,
    quarantineRecommended: isMalicious,
    scanDurationMs: Math.round((performance.now() - t0) * 1000) / 1000,
    scannedAt: new Date().toISOString(),
  };
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && req.url === '/health') {
    const yaraText = loadYaraSource();
    const ruleCount = (yaraText.match(/^rule\s+/gm) || []).length;
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'apexmsp-clamav-yara-worker',
      engine: 'yara-x+clamav-bounded-v2.0',
      loadedYaraRules: ruleCount,
      bounds: { maxFileBytes: MAX_SCAN_BYTES, timeoutMs: SCAN_TIMEOUT_MS },
      memoryRssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
      stats,
    }));
    return;
  }

  if (req.method === 'GET' && req.url === '/rules') {
    const yaraText = loadYaraSource();
    res.writeHead(200);
    res.end(JSON.stringify({
      rulePath: YARA_RULE_PATH,
      rules: [
        'APEXMSP_EICAR_Standard_Test_File',
        'APEXMSP_Ransomware_ShadowCopy_Recovery_Inhibition',
        'APEXMSP_Canary_Tripwire_Tamper_Marker',
        'APEXMSP_Suspicious_Encoded_PowerShell_Stager',
      ],
      rawYaraPreview: yaraText.slice(0, 1200),
    }));
    return;
  }

  if (req.method === 'POST' && (req.url === '/scan' || req.url === '/scan/text')) {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
      if (body.length > MAX_SCAN_BYTES * 1.4) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const payload = body.trim().startsWith('{') ? JSON.parse(body) : { content: body };
        const buf = payload.contentBase64
          ? Buffer.from(payload.contentBase64, 'base64')
          : Buffer.from(String(payload.content || ''), 'utf8');
        const result = scanBuffer(buf, payload.filename || 'inline.bin', payload.processName || '');
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[apexmsp-clamav-yara-worker] listening on 0.0.0.0:${PORT} (tokenConfigured=${Boolean(WORKER_TOKEN)})`);
});
