import http from 'node:http';
import net from 'node:net';

const server = http.createServer((req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: 'localhost:3000' }
  };

  const proxy = http.request(options, (targetRes) => {
    res.writeHead(targetRes.statusCode, targetRes.headers);
    targetRes.pipe(res, { end: true });
  });

  proxy.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway: ' + err.message);
  });

  req.pipe(proxy, { end: true });
});

server.on('upgrade', (req, clientSocket, head) => {
  const serverSocket = net.connect(3000, '127.0.0.1', () => {
    let rawHeaders = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (const [key, value] of Object.entries(req.headers)) {
      rawHeaders += `${key}: ${value}\r\n`;
    }
    rawHeaders += '\r\n';
    serverSocket.write(rawHeaders);
    if (head && head.length > 0) serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', () => clientSocket.destroy());
  clientSocket.on('error', () => serverSocket.destroy());
});

server.listen(5173, '0.0.0.0', () => {
  console.log('[+] Port bridge 5173 -> 3000 active');
});
