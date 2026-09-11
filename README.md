# OpenMSP / ApexMSP

Next-generation multi-tenant PSA & RMM platform for modern Managed Service Providers.

---

## 1. Architecture & Repository Layout

```
openmsp/
├── apps/
│   ├── console/             # Vite + React PSA/RMM console UI
│   ├── api/                 # Node.js + TypeScript REST & WebSocket control plane (/api/v1, /ws/v1)
│   └── agent/               # Cross-platform Go device agent (macOS, Windows, Linux)
├── packages/
│   └── api-types/           # Shared TypeScript contracts and types from OpenAPI
├── infra/
│   ├── postgres/migrations/ # Clean PostgreSQL core MSP multi-tenant schema
│   ├── rustdesk/            # Docker compose for self-hosted hbbs & hbbr relay
│   └── vaultwarden/         # Docker compose for Zero-Trust credential vault
└── docs/
    ├── contracts/
    │   ├── openapi.yaml     # OpenAPI 3.0 REST specification
    │   └── events.md        # WebSocket real-time event catalog
    └── OpenMSP_Build_Spec.md# Full 12-stream engineering build specification
```

---

## 2. Quickstart

### Prerequisites
- Node.js >= 20.x
- pnpm >= 9.x
- Go >= 1.22 (for building the device agent)

### Install Dependencies
```bash
pnpm install
```

### Build All Workspaces
```bash
pnpm --recursive run build
```

---

## 3. Running Locally

### Start Control Plane API
```bash
cd apps/api
pnpm run start
# Listens on http://localhost:3001
# WebSocket endpoint: ws://localhost:3001/ws/v1/org/:orgId
```

### Start Console UI
```bash
cd apps/console
pnpm run dev
# Starts Vite development server with proxy to API
```

**Default Admin Credentials:**
- Email: `admin@openmsp.local`
- Password: `Admin123!`

---

## 4. Running the Device Agent

Compile the self-contained native agent binary:
```bash
cd apps/agent
go build -o bin/openmsp-agent cmd/agent/main.go
```

Enroll and report real telemetry in a single shot:
```bash
./bin/openmsp-agent --server http://localhost:3001 --token demo-enrollment-token-2026 --run-once
```

Run as a continuous background daemon:
```bash
./bin/openmsp-agent --server http://localhost:3001 --token demo-enrollment-token-2026 --interval 30
```

---

## 5. Verification Suite

Run the full end-to-end Product Gate v1 test suite:
```bash
cd apps/api
npx tsx test-e2e.ts
```

Verifies all 8 acceptance criteria:
1. MSP user authentication and JWT session.
2. Device agent enrollment with hardware and OS discovery.
3. Telemetry snapshots and real-time WebSocket heartbeats.
4. PSA ticket creation, comments, time tracking, and SLA calculation.
5. RustDesk support relay health and session key management.
6. Self-healing automation rules engine (stopped service detection & command dispatch).
7. Zero-trust vault integration with master password gate.
8. Immutable audit event trail.
