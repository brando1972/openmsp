import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WSEvent, WSMessageType } from '@openmsp/api-types';
import { handleTunnelUpgrade } from '../net/tunnelWs.js';

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, Set<WebSocket>> = new Map();

  public init(server: Server) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const pathname = url.pathname;

      // On-LAN tunnel data plane (collector channel + browser terminals).
      if (handleTunnelUpgrade(pathname, request, socket, head)) {
        return;
      }

      // Match /ws/v1/org/:orgId
      const match = pathname.match(/^\/ws\/v1\/org\/([^/]+)/);
      if (match) {
        const orgId = match[1];
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.register(orgId, ws);
          this.wss?.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws) => {
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          }
        } catch {
          // ignore non-json messages
        }
      });
    });
  }

  private register(orgId: string, ws: WebSocket) {
    if (!this.connections.has(orgId)) {
      this.connections.set(orgId, new Set());
    }
    this.connections.get(orgId)!.add(ws);

    ws.on('close', () => {
      this.connections.get(orgId)?.delete(ws);
      if (this.connections.get(orgId)?.size === 0) {
        this.connections.delete(orgId);
      }
    });
  }

  public broadcastToOrg<T = any>(orgId: string, type: WSMessageType, payload: T) {
    const clients = this.connections.get(orgId);
    if (!clients || clients.size === 0) return;

    const event: WSEvent<T> = {
      type,
      orgId,
      timestamp: new Date().toISOString(),
      payload
    };

    const data = JSON.stringify(event);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}

export const wsManager = new WebSocketManager();
