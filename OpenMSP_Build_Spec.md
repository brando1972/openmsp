# OpenMSP / ApexMSP — Full Product Build Specification

**Repository:** [brando1972/openmsp](https://github.com/brando1972/openmsp)  
**Console live (UI only):** https://openmsp.vercel.app  
**Document version:** 1.0  
**Date:** 2026-09-11  
**Audience:** Parallel implementation agents and human reviewers

---

## 1. Current state (what GitHub actually is)

The GitHub codebase is a **Vite + React front-end prototype**, not a product.

| Layer | Reality today |
|---|---|
| UI | ApexMSP PSA/RMM console (dashboard, RMM, automations, patching, RustDesk, tickets, vault, AI copilot, settings) |
| Data | In-memory React state seeded from `src/data/mockData.ts` |
| Persistence | None. Refresh resets everything |
| Auth | None |
| API | None. Vercel hosts a static SPA (`vercel.json` rewrites to `index.html`) |
| Device agent | Placeholder curl/pkg scripts; no binary |
| RustDesk | Fake hostnames (`rustdesk-relay.apexmsp.io`) and invented session keys |
| Vault | Passwords and recovery keys in browser state (not Bitwarden) |
| AI copilot | Canned strings, not a model with tools |
| Supabase SQL in repo | Leftover **LawnCrew** tenancy (`dispatcher` / `crew`). Do not reuse as the MSP schema |
| `package.json` name | Still `greenscape-landscaping-app` |
| LawnCrew | Separate repo `brando1972/lawncrew`. Do not modify it for this build |

**Keep the screens.** Replace `mockData` / `AppContext` with a real control plane, a device agent, and a real RustDesk relay.

---

## 2. Locked decisions (all agents must follow)

Do not reinvent these per workstream or the work will not merge.

| Decision | Choice |
|---|---|
| Console | Keep the current Vite/React app as the MSP console |
| Persistence | **New** Postgres schema. Do **not** reuse LawnCrew migrations |
| API | Versioned REST + WebSocket: `/api/v1`, `/ws/v1`. Only UI data source |
| Auth | MSP users: `owner`, `admin`, `tech`, `readonly`. Client-portal role comes later |
| Tenancy | `msp_org` → `client` → `site` → `device` on every business row |
| Secrets | Do **not** store vault passwords or BitLocker/FileVault keys in the SPA |
| Remote access | Self-hosted RustDesk (`hbbs` + `hbbr`), not fake session keys |
| Agents | Signed installers; enroll with a one-time token; heartbeat every 30–60s |
| Dangerous actions | Remote wipe, script run, encryption toggle require confirm + `audit_events` |
| LawnCrew | Untouched |

---

## 3. Target repository layout

```
openmsp/
  apps/
    console/                 # existing React UI (move current src here)
    api/                     # control plane
    agent/                   # device agent (Windows / macOS, Linux next)
  packages/
    api-types/               # shared TypeScript types generated from OpenAPI
  infra/
    rustdesk/                # compose for hbbs / hbbr
    postgres/                # migrations
    vaultwarden/             # optional compose
  docs/
    contracts/
      openapi.yaml
      events.md              # WebSocket event list
  OpenMSP_Build_Spec.md      # this document (or docs/ copy)
```

Until Agent 0 completes the split, other agents wait on `packages/api-types` and `docs/contracts/openapi.yaml`.

---

## 4. Product gate: v1 “real application”

Stop adding feature chrome until all of this is true in a lab:

1. MSP user logs in.
2. A Windows PC and a Mac enroll with a real agent.
3. Both appear with live heartbeat (`lastSeen` updates).
4. Open a ticket, comment, and time entry — they survive refresh.
5. Tech clicks Connect and sees the desktop via **your** RustDesk servers.
6. One automation restarts a stopped service for real.
7. A vault item lives in Vaultwarden/Bitwarden, not `mockData.ts`.
8. Audit log shows who did steps 5–7.

That is a product lab. It is not ConnectWise. Billing, client portal, full MDM, and multi-region HA come **after** this gate.

---

## 5. Shared contract (Agent 0 — blocking)

**Owner:** Platform / contracts agent  
**Duration:** ~1–2 days, then others start  
**Branch:** `feat/platform-contracts`

### 5.1 Owns

- Repo split (move UI to `apps/console`)
- OpenAPI 3 spec
- Postgres migrations for core tables
- Auth skeleton (login, JWT or session, `GET /me`)
- Empty/stub API that returns the right JSON shapes (501 only where not yet implemented)
- CI: typecheck, lint, apply migrations on PR

### 5.2 Core tables

| Table | Purpose |
|---|---|
| `msp_orgs` | Tenant (the MSP company) |
| `users` | Login identities |
| `org_members` | User ↔ org + role |
| `clients` | MSP’s customers |
| `sites` | Locations under a client |
| `devices` | Managed endpoints |
| `device_heartbeats` | Telemetry snapshots |
| `device_commands` | Queued agent jobs + results |
| `tickets` | PSA tickets |
| `ticket_comments` | Internal vs client-visible |
| `time_entries` | Billable/non-billable minutes |
| `enrollment_tokens` | One-time agent enroll |
| `audit_events` | Who did what, when |
| `msp_orgs.settings` | White-label JSON |

Later streams add: `self_healing_rules`, `automation_executions`, `patches`, `device_patches`. Prefer adding via migration PRs that update OpenAPI, not silent JSON.

### 5.3 Minimum API surface

```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/me

GET    /api/v1/clients
POST   /api/v1/clients
GET    /api/v1/clients/:id

GET    /api/v1/devices
GET    /api/v1/devices/:id
PATCH  /api/v1/devices/:id

POST   /api/v1/devices/:id/commands
GET    /api/v1/devices/:id/commands

POST   /api/v1/agents/enroll
POST   /api/v1/agents/heartbeat

GET    /api/v1/tickets
POST   /api/v1/tickets
GET    /api/v1/tickets/:id
PATCH  /api/v1/tickets/:id
POST   /api/v1/tickets/:id/comments
POST   /api/v1/tickets/:id/time

GET    /api/v1/audit

WS     /ws/v1/org/:orgId
```

**Query convention:** `?clientId=` filters lists. `clientId=all` or omit = org-wide (role-checked).

### 5.4 WebSocket events (minimum)

Document in `docs/contracts/events.md`:

- `device.heartbeat`
- `device.health_changed`
- `command.updated`
- `ticket.updated`
- `session.started` / `session.ended`
- `relay.health`

### 5.5 UI types to preserve (map to API, do not fork)

Existing console types in `src/types/index.ts` (or `apps/console` after the move):

- `ManagedDevice`, `DeviceMetric`, `InstalledApp`, `DeviceService`, `SystemEventLog`
- `ClientTenant`
- `PatchItem`, `SelfHealingRule`, `AutomationExecutionLog`
- `PSATicket`, `TicketComment`, `TimeEntry`
- `VaultItem` (metadata only in the SPA after vault stream)
- `RustDeskServerConfig`, `RustDeskSession`
- `WhiteLabelConfig`, `AICopilotMessage`

`packages/api-types` is the source of truth. Console imports from there.

### 5.6 Done when

- OpenAPI checked in
- Migrations apply on a clean Postgres
- Login returns a token
- Console can be pointed at the API with a stub client
- README explains local `api` + `console` + Postgres
