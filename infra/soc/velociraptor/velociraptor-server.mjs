#!/usr/bin/env node
/**
 * ApexMSP Velociraptor DFIR Config & Artifact Collection Broker Endpoint
 * Exposes /health and /artifacts on port 8893 for Action Broker integration.
 */

import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.env.VELOCIRAPTOR_PORT || 8893);
const CONFIG_PATH = process.env.VELOCIRAPTOR_CONFIG || '/etc/velociraptor/velociraptor.server.yaml';

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/artifacts')) {
    const cfgLoaded = fs.existsSync(CONFIG_PATH);
    res.writeHead(200);
    res.end(JSON.stringify({
      status: cfgLoaded ? 'healthy' : 'degraded',
      service: 'apexmsp-velociraptor',
      configPath: CONFIG_PATH,
      supportedArtifacts: [
        'Generic.Client.Info',
        'Windows.KapeFiles.Targets',
        'Windows.Detection.VSSAdmin',
        'Linux.Sys.Pslist',
        'MacOS.System.Packages',
      ],
      memoryRssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
    }));
    return;
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[apexmsp-velociraptor] DFIR artifact broker active on 0.0.0.0:${PORT}`);
});
