#!/usr/bin/env node
/**
 * ApexMSP Vector / CEF / Syslog / IPFIX High-Speed Telemetry Collector
 * Listens on:
 *  - UDP 5514 & TCP 5514: UniFi OS CEF & RFC3164/RFC5424 Syslog
 *  - UDP 2055 & UDP 4739: NetFlow v9 / IPFIX Flow Telemetry
 *  - HTTP 8890: Health, Metrics, Recent Events, and Direct CEF/JSON Ingestion
 */

import dgram from 'node:dgram';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SYSLOG_PORT = Number(process.env.SYSLOG_PORT || 5514);
const NETFLOW_PORT = Number(process.env.NETFLOW_PORT || 2055);
const IPFIX_PORT = Number(process.env.IPFIX_PORT || 4739);
const HTTP_PORT = Number(process.env.HTTP_PORT || 8890);
const APEXMSP_API_URL = process.env.APEXMSP_API_URL || 'http://192.168.4.150:4000';
const APEXMSP_SOC_INGEST_TOKEN = process.env.APEXMSP_SOC_INGEST_TOKEN || 'apexmsp-soc-dev-token';
const DATA_DIR = process.env.DATA_DIR || '/data/events';
const PARSER_VERSION = '2026.10.25-cef-ipfix-v2.0';

fs.mkdirSync(DATA_DIR, { recursive: true });
const JSONL_PATH = path.join(DATA_DIR, 'soc-events.jsonl');

const metrics = {
  startedAt: new Date().toISOString(),
  syslogUdpCount: 0,
  syslogTcpCount: 0,
  cefParsedCount: 0,
  ipfixFlowPackets: 0,
  forwardedToApiCount: 0,
  forwardErrors: 0,
};

const recentEvents = [];
const MAX_RECENT = 100;

const SITE_IP_MAP = {
  '192.168.2.': { orgId: 'org-apexmsp', clientId: 'c-gambinos', siteId: '88f7af54-98f8-306a-a1c7-c9349722b1f6', siteName: 'Gambinos' },
  '192.168.88.': { orgId: 'org-apexmsp', clientId: 'c-gambinos', siteId: '88f7af54-98f8-306a-a1c7-c9349722b1f6', siteName: 'Gambinos (KWIKPOS)' },
  '192.168.11.': { orgId: 'org-apexmsp', clientId: 'c-tbi', siteId: 'site-tbi-main', siteName: 'The Broken iPhone (TBI)' },
  '192.168.4.': { orgId: 'org-apexmsp', clientId: 'c-raytreat', siteId: 'site-raytreat-hq', siteName: 'Raytreat' },
  '172.25.0.': { orgId: 'org-apexmsp', clientId: 'c-sos', siteId: 'site-sos-volleyball', siteName: 'SOS Volleyball' },
};

function resolveSiteContext(sourceIp, payloadSiteId) {
  if (payloadSiteId) {
    return { orgId: 'org-apexmsp', clientId: 'c-gambinos', siteId: payloadSiteId, siteName: 'Explicit Site' };
  }
  for (const [prefix, ctx] of Object.entries(SITE_IP_MAP)) {
    if (sourceIp && sourceIp.startsWith(prefix)) return ctx;
  }
  return {
    orgId: 'org-apexmsp',
    clientId: 'c-gambinos',
    siteId: '88f7af54-98f8-306a-a1c7-c9349722b1f6',
    siteName: 'Default UniFi Collector Site',
  };
}

function parseCefExtension(extStr = '') {
  const fields = {};
  const regex = /(\w+)=((?:\\=|[^=])+?)(?=\s+\w+=|$)/g;
  let match;
  while ((match = regex.exec(extStr)) !== null) {
    fields[match[1]] = match[2].trim();
  }
  return fields;
}

export function normalizeEvent(rawMessage, sourceIp = '127.0.0.1', transport = 'udp/5514', explicitSiteId = null) {
  const rawPayload = String(rawMessage || '').trim();
  const ingestedAt = new Date().toISOString();
  const cefIndex = rawPayload.indexOf('CEF:0|');

  let eventFormat = 'syslog';
  let vendor = 'Ubiquiti';
  let product = 'UniFi Network';
  let deviceVersion = 'unknown';
  let signatureId = 'SYSLOG-GENERIC';
  let eventName = 'UniFi Syslog Event';
  let severityNum = 3;
  let extensions = {};
  let eventTimestamp = ingestedAt;

  // Extract leading RFC5424/ISO timestamp if present before CEF
  const isoMatch = rawPayload.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/);
  if (isoMatch) {
    eventTimestamp = isoMatch[1];
  }

  if (cefIndex !== -1) {
    eventFormat = 'cef';
    metrics.cefParsedCount += 1;
    const cefBody = rawPayload.slice(cefIndex);
    const parts = cefBody.split('|');
    vendor = parts[1] || 'Ubiquiti';
    product = parts[2] || 'UniFi Network';
    deviceVersion = parts[3] || 'unknown';
    signatureId = parts[4] || 'CEF-000';
    eventName = parts[5] || 'UniFi CEF Alert';
    severityNum = Number(parts[6] || 5);
    extensions = parseCefExtension(parts.slice(7).join('|'));
    if (extensions.rt && !isoMatch) {
      const parsedRt = new Date(Number(extensions.rt) || extensions.rt);
      if (!Number.isNaN(parsedRt.getTime())) {
        eventTimestamp = parsedRt.toISOString();
      }
    }
  }

  const candidateIp = extensions.src || extensions.dvc || sourceIp;
  const siteCtx = resolveSiteContext(candidateIp, explicitSiteId || extensions.UNIFIsiteId);

  const severity =
    severityNum >= 8 ? 'critical' :
    severityNum >= 6 ? 'high' :
    severityNum >= 4 ? 'medium' : 'low';

  const record = {
    id: `evt-${crypto.randomUUID()}`,
    orgId: siteCtx.orgId,
    clientId: siteCtx.clientId,
    siteId: siteCtx.siteId,
    siteName: siteCtx.siteName,
    transport,
    eventFormat,
    parserVersion: PARSER_VERSION,
    eventTimestamp,
    ingestedAt,
    vendor,
    product,
    deviceVersion,
    signatureId,
    eventName,
    severity,
    severityScore: severityNum,
    srcIp: extensions.src || sourceIp,
    dstIp: extensions.dst || null,
    srcMac: extensions.smac || extensions.UNIFImac || null,
    switchPort: extensions.UNIFIswitchPort ? Number(extensions.UNIFIswitchPort) : null,
    vlanId: extensions.UNIFIvlan ? Number(extensions.UNIFIvlan) : null,
    extensions,
    rawPayload,
  };

  recentEvents.unshift(record);
  if (recentEvents.length > MAX_RECENT) recentEvents.pop();

  try {
    fs.appendFileSync(JSONL_PATH, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    console.error('[collector] failed writing JSONL:', err.message);
  }

  forwardToApexMspApi(record).catch(() => {});
  return record;
}

async function forwardToApexMspApi(record) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${APEXMSP_API_URL}/api/v1/integrations/unifi/syslog-cef`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${APEXMSP_SOC_INGEST_TOKEN}`,
      },
      body: JSON.stringify({
        orgId: record.orgId,
        clientId: record.clientId,
        siteId: record.siteId,
        rawCef: record.rawPayload,
        eventTimestamp: record.eventTimestamp,
        parserVersion: record.parserVersion,
        sourceIp: record.srcIp,
      }),
      signal: controller.signal,
    });
    if (res.ok) {
      metrics.forwardedToApiCount += 1;
    } else {
      metrics.forwardErrors += 1;
    }
  } catch {
    metrics.forwardErrors += 1;
  } finally {
    clearTimeout(timer);
  }
}

// 1. UDP 5514 Syslog/CEF Server
const udpSyslog = dgram.createSocket('udp4');
udpSyslog.on('message', (msg, rinfo) => {
  metrics.syslogUdpCount += 1;
  normalizeEvent(msg.toString('utf8'), rinfo.address, `udp/${SYSLOG_PORT}`);
});
udpSyslog.bind(SYSLOG_PORT, '0.0.0.0');

// 2. TCP 5514 Syslog/CEF Server
const tcpSyslog = net.createServer((socket) => {
  let buf = '';
  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) {
        metrics.syslogTcpCount += 1;
        normalizeEvent(line, socket.remoteAddress?.replace('::ffff:', '') || '127.0.0.1', `tcp/${SYSLOG_PORT}`);
      }
    }
  });
});
tcpSyslog.listen(SYSLOG_PORT, '0.0.0.0');

// 3. UDP 2055 & 4739 NetFlow / IPFIX Listeners
function bindFlowSocket(port, label) {
  const sock = dgram.createSocket('udp4');
  sock.on('message', (msg, rinfo) => {
    metrics.ipfixFlowPackets += 1;
    const version = msg.length >= 2 ? msg.readUInt16BE(0) : 0;
    const count = msg.length >= 4 ? msg.readUInt16BE(2) : 0;
    normalizeEvent(
      `CEF:0|Ubiquiti|UniFi Flow|1.0|IPFIX-${version}|${label} Flow Packet (records=${count}, bytes=${msg.length})|3|src=${rinfo.address}`,
      rinfo.address,
      `udp/${port}`
    );
  });
  sock.bind(port, '0.0.0.0');
}
bindFlowSocket(NETFLOW_PORT, 'NetFlow-v9');
bindFlowSocket(IPFIX_PORT, 'IPFIX-v10');

// 4. HTTP 8890 Control & Ingestion API
const httpServer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'apexmsp-vector-collector',
      parserVersion: PARSER_VERSION,
      ports: { syslogUdpTcp: SYSLOG_PORT, netflowUdp: NETFLOW_PORT, ipfixUdp: IPFIX_PORT, http: HTTP_PORT },
      memoryRssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
      metrics,
    }));
    return;
  }
  if (req.method === 'GET' && req.url === '/events/recent') {
    res.writeHead(200);
    res.end(JSON.stringify({ count: recentEvents.length, events: recentEvents.slice(0, 25) }));
    return;
  }
  if (req.method === 'POST' && req.url === '/ingest/cef') {
    let body = '';
    req.on('data', (c) => { body += c.toString('utf8'); });
    req.on('end', () => {
      try {
        const parsed = body.trim().startsWith('{') ? JSON.parse(body) : { rawCef: body };
        const rec = normalizeEvent(
          parsed.rawCef || parsed.message || body,
          parsed.sourceIp || req.socket.remoteAddress?.replace('::ffff:', '') || '127.0.0.1',
          'http/8890',
          parsed.siteId || null
        );
        res.writeHead(201);
        res.end(JSON.stringify({ status: 'ingested', event: rec }));
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

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[apexmsp-vector-collector] listening on UDP/TCP ${SYSLOG_PORT}, IPFIX ${NETFLOW_PORT}/${IPFIX_PORT}, HTTP ${HTTP_PORT}`);
});
