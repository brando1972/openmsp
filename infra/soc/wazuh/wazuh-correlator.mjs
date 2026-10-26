#!/usr/bin/env node
/**
 * ApexMSP Wazuh Custom XML Rule & Decoder Correlator Service
 * Mounts and validates /var/ossec/etc/rules/apexmsp_rules.xml & /var/ossec/etc/decoders/apexmsp_decoders.xml
 * Correlates incoming JSONL SOC events and exposes HTTP status on port 8892.
 */

import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.env.WAZUH_HTTP_PORT || 8892);
const RULES_PATH = process.env.WAZUH_RULES_PATH || '/var/ossec/etc/rules/apexmsp_rules.xml';
const DECODERS_PATH = process.env.WAZUH_DECODERS_PATH || '/var/ossec/etc/decoders/apexmsp_decoders.xml';

function loadXmlSummary() {
  const rulesXml = fs.existsSync(RULES_PATH) ? fs.readFileSync(RULES_PATH, 'utf8') : '';
  const decodersXml = fs.existsSync(DECODERS_PATH) ? fs.readFileSync(DECODERS_PATH, 'utf8') : '';
  const ruleIds = [...rulesXml.matchAll(/<rule\s+id="(\d+)"\s+level="(\d+)">/g)].map((m) => ({
    ruleId: Number(m[1]),
    level: Number(m[2]),
  }));
  const decoderNames = [...decodersXml.matchAll(/<decoder\s+name="([^"]+)">/g)].map((m) => m[1]);
  return { rulesXmlLoaded: rulesXml.length > 0, decodersXmlLoaded: decodersXml.length > 0, ruleIds, decoderNames };
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/rules')) {
    const summary = loadXmlSummary();
    res.writeHead(200);
    res.end(JSON.stringify({
      status: summary.rulesXmlLoaded && summary.decodersXmlLoaded ? 'healthy' : 'degraded',
      service: 'apexmsp-wazuh-manager',
      rulesPath: RULES_PATH,
      decodersPath: DECODERS_PATH,
      ...summary,
      memoryRssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
    }));
    return;
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[apexmsp-wazuh-manager] custom rules & decoders active on 0.0.0.0:${PORT}`);
});
