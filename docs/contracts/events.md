# OpenMSP WebSocket Events Contract

WebSocket Endpoint: `/ws/v1/org/:orgId`

Clients (Console UI, Dashboards) connect to this WebSocket endpoint to receive real-time updates for their MSP organization.
Authentication is performed via query parameter `?token=<jwt_token>` or via the first frame:
`{"type": "auth", "token": "<jwt_token>"}`.

---

## Event Schema Format

All events emitted by the server adhere to the following JSON envelope:

```json
{
  "type": "<event_type>",
  "orgId": "<uuid>",
  "timestamp": "2026-09-11T12:00:00.000Z",
  "payload": { ... }
}
```

---

## Event Catalog

### 1. `device.heartbeat`
Emitted every time an enrolled device reports a heartbeat snapshot.

```json
{
  "type": "device.heartbeat",
  "orgId": "00000000-0000-0000-0000-000000000001",
  "timestamp": "2026-09-11T12:00:30.000Z",
  "payload": {
    "deviceId": "dev-001",
    "clientId": "client-001",
    "health": "healthy",
    "metrics": {
      "cpuUsage": 24,
      "ramUsage": 62,
      "diskUsage": 45,
      "uptimeDays": 14.2,
      "lastSeen": "2026-09-11T12:00:30.000Z"
    }
  }
}
```

---

### 2. `device.health_changed`
Emitted when a device's health transitions between `healthy`, `warning`, `critical`, or `offline`.

```json
{
  "type": "device.health_changed",
  "orgId": "00000000-0000-0000-0000-000000000001",
  "timestamp": "2026-09-11T12:01:00.000Z",
  "payload": {
    "deviceId": "dev-001",
    "previousHealth": "healthy",
    "currentHealth": "critical",
    "reason": "CPU usage exceeded 95% threshold for >5 minutes"
  }
}
```

---

### 3. `command.updated`
Emitted when a queued device command changes status (`dispatched`, `running`, `completed`, `failed`).

```json
{
  "type": "command.updated",
  "orgId": "00000000-0000-0000-0000-000000000001",
  "timestamp": "2026-09-11T12:01:15.000Z",
  "payload": {
    "commandId": "cmd-123",
    "deviceId": "dev-001",
    "commandType": "restart_service",
    "status": "completed",
    "output": "Service 'Spooler' successfully restarted."
  }
}
```

---

### 4. `ticket.updated`
Emitted when a ticket is created, updated, status changed, or a comment/time entry is added.

```json
{
  "type": "ticket.updated",
  "orgId": "00000000-0000-0000-0000-000000000001",
  "timestamp": "2026-09-11T12:02:00.000Z",
  "payload": {
    "ticketId": "tick-001",
    "ticketNumber": "TICK-1001",
    "status": "in_progress",
    "assignedTech": "Alex Rivera",
    "updatedAt": "2026-09-11T12:02:00.000Z"
  }
}
```

---

### 5. `session.started` and `session.ended`
Emitted when a technician starts or terminates a remote support RustDesk session.

```json
{
  "type": "session.started",
  "orgId": "00000000-0000-0000-0000-000000000001",
  "timestamp": "2026-09-11T12:03:00.000Z",
  "payload": {
    "sessionId": "sess-456",
    "deviceId": "dev-001",
    "deviceName": "Finance-MacBook-Pro",
    "rustDeskId": "982341209",
    "connectedTech": "Alex Rivera",
    "status": "connected",
    "startedAt": "2026-09-11T12:03:00.000Z"
  }
}
```

---

### 6. `relay.health`
Emitted periodically by the relay health monitor to reflect self-hosted RustDesk `hbbs` / `hbbr` status.

```json
{
  "type": "relay.health",
  "orgId": "00000000-0000-0000-0000-000000000001",
  "timestamp": "2026-09-11T12:05:00.000Z",
  "payload": {
    "online": true,
    "latencyMs": 18,
    "activeSessions": 2,
    "relayServer": "relay.openmsp.local"
  }
}
```
