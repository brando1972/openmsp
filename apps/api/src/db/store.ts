import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  ClientTenant,
  ManagedDevice,
  PSATicket,
  DeviceCommand,
  AuditEvent,
  SelfHealingRule,
  AutomationExecutionLog,
  PatchItem,
  VaultItem,
  RustDeskServerConfig,
  RustDeskSession,
  WhiteLabelConfig,
  UserProfile,
  EnrollmentToken,
  TicketComment,
  TimeEntry,
  SecurityPostureReport,
  TemporalIdentityObservation,
  SecurityDetection,
  SecurityIncident,
  SecurityAction,
  UnifiSiteCapability,
  SecurityPolicy
} from '@openmsp/api-types';

export interface DBUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  avatarUrl?: string;
  role: 'owner' | 'admin' | 'tech' | 'readonly';
  orgId: string;
  orgName: string;
  createdAt: string;
}

export interface DBOrg {
  id: string;
  name: string;
  domain?: string;
  settings: WhiteLabelConfig;
  createdAt: string;
}

class DataStore {
  public orgs: Map<string, DBOrg> = new Map();
  public users: Map<string, DBUser> = new Map();
  public clients: Map<string, ClientTenant> = new Map();
  public devices: Map<string, ManagedDevice> = new Map();
  public deviceCommands: Map<string, DeviceCommand> = new Map();
  public enrollmentTokens: Map<string, EnrollmentToken> = new Map();
  public tickets: Map<string, PSATicket> = new Map();
  public automations: Map<string, SelfHealingRule> = new Map();
  public automationLogs: AutomationExecutionLog[] = [];
  public patches: Map<string, PatchItem> = new Map();
  public vaultItems: Map<string, VaultItem> = new Map();
  public auditEvents: AuditEvent[] = [];
  public rustDeskConfig: RustDeskServerConfig = {
    idServer: 'relay.openmsp.local:21116',
    relayServer: 'relay.openmsp.local:21117',
    apiServer: 'http://relay.openmsp.local:21114',
    key: 'openmsp-demo-public-key-9a8b7c6d5e4f3a2b1',
    customPort: 21116,
    onlineState: true,
    activeSessionsCount: 0
  };
  public rustDeskSessions: Map<string, RustDeskSession> = new Map();
  // Android/relay tablet serial → client org (tablets aren't RMM-enrolled, so we map them here)
  public mdmClients: Map<string, { clientId: string; clientName: string; name?: string; model?: string }> = new Map();
  // RMM deviceId → MeshCentral nodeid (native ApexConnect remote desktop).
  public meshNodes: Map<string, string> = new Map();
  // MeshCentral nodeid -> client org.
  public meshNodeClients: Map<string, { clientId: string; clientName: string }> = new Map();
  // siteId → network-scan config (enable, cadence, SNMP creds).
  public netScan: Map<string, import('@openmsp/api-types').NetScanConfig> = new Map();

  // ---- dispatch (mobile field-service PWA) ----
  public dispatchJobs: Map<string, import('@openmsp/api-types').DispatchJob> = new Map();
  public jobMessages: Map<string, import('@openmsp/api-types').JobMessage> = new Map();
  public techLocations: Map<string, import('@openmsp/api-types').TechLocation> = new Map(); // key = userId
  public techShifts: Map<string, import('@openmsp/api-types').ShiftState> = new Map();       // key = userId
  private jobSeq = 1000;

  // ---- staged applications (modular software deployment & remote engines) ----
  public stagedApps: Map<string, import('@openmsp/api-types').StagedApp> = new Map();
  public deviceStagedDeployments: Map<string, import('@openmsp/api-types').DeviceStagedAppStatus> = new Map(); // key = `${deviceId}:${appId}`

  // ---- SIEM, EDR, AV, UniFi SOC & Temporal Identity Graph ----
  public securityPostures: Map<string, SecurityPostureReport> = new Map(); // key = deviceId
  public identityObservations: Map<string, TemporalIdentityObservation> = new Map(); // key = observationId
  public securityDetections: Map<string, SecurityDetection> = new Map(); // key = detectionId
  public securityIncidents: Map<string, SecurityIncident> = new Map(); // key = incidentId
  public securityActions: Map<string, SecurityAction> = new Map(); // key = actionId
  public unifiSites: Map<string, UnifiSiteCapability> = new Map(); // key = siteId
  public securityPolicies: Map<string, SecurityPolicy> = new Map(); // key = policyId

  public nextJobNumber(): string {
    for (const j of this.dispatchJobs.values()) {
      const n = parseInt((j.jobNumber || '').replace(/\D/g, ''), 10);
      if (Number.isFinite(n) && n >= this.jobSeq) this.jobSeq = n + 1;
    }
    return `JOB-${this.jobSeq++}`;
  }

  private initialized = false;

  // ---- durable snapshot persistence (survives restarts/redeploys) ----
  private readonly dataFile = path.join(process.env.DATA_DIR || path.resolve(process.cwd(), '.data'), 'store.json');
  private readonly mapNames = [
    'orgs', 'users', 'clients', 'devices', 'deviceCommands', 'enrollmentTokens',
    'tickets', 'automations', 'patches', 'vaultItems', 'rustDeskSessions', 'mdmClients', 'meshNodes', 'meshNodeClients', 'netScan',
    'dispatchJobs', 'jobMessages', 'techLocations', 'techShifts',
    'stagedApps', 'deviceStagedDeployments',
    'securityPostures', 'identityObservations', 'securityDetections',
    'securityIncidents', 'securityActions', 'unifiSites', 'securityPolicies'
  ] as const;
  private persistTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const restored = this.hydrate();
    if (restored) {
      this.initialized = true;
    } else {
      this.seedDefaults();
    }
    if (this.stagedApps.size === 0) {
      this.seedDefaultStagedApps();
    }
    if (this.unifiSites.size === 0 || this.identityObservations.size === 0 || this.securityPolicies.size === 0) {
      this.seedSecurityAndUnifiDefaults();
    }
    this.hydrateUnifiFixtures();
    this.startPersistence();
  }

  private hydrate(): boolean {
    try {
      if (!fs.existsSync(this.dataFile)) return false;
      const snap = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      for (const name of this.mapNames) {
        const obj = snap[name];
        if (obj && typeof obj === 'object') {
          const m = (this as unknown as Record<string, Map<string, unknown>>)[name];
          m.clear();
          for (const [k, v] of Object.entries(obj)) m.set(k, v);
        }
      }
      if (Array.isArray(snap.automationLogs)) this.automationLogs = snap.automationLogs;
      if (Array.isArray(snap.auditEvents)) this.auditEvents = snap.auditEvents;
      if (snap.rustDeskConfig) this.rustDeskConfig = snap.rustDeskConfig;
      const hasData = this.users.size > 0 || this.orgs.size > 0;
      if (hasData) {
        console.log(`[store] restored from ${this.dataFile}: ${this.devices.size} devices, ${this.users.size} users, ${this.clients.size} clients`);
      }
      return hasData;
    } catch (e) {
      console.warn('[store] hydrate failed (starting fresh):', (e as Error).message);
      return false;
    }
  }

  public persist(): void {
    try {
      const snap: Record<string, unknown> = {};
      for (const name of this.mapNames) {
        snap[name] = Object.fromEntries((this as unknown as Record<string, Map<string, unknown>>)[name]);
      }
      snap.automationLogs = this.automationLogs;
      snap.auditEvents = this.auditEvents;
      snap.rustDeskConfig = this.rustDeskConfig;
      fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
      const tmp = this.dataFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(snap));
      fs.renameSync(tmp, this.dataFile);
    } catch (e) {
      console.warn('[store] persist failed:', (e as Error).message);
    }
  }

  private startPersistence(): void {
    this.persistTimer = setInterval(() => this.persist(), 10000);
    if (this.persistTimer.unref) this.persistTimer.unref();
    const flush = () => { this.persist(); process.exit(0); };
    process.on('SIGTERM', flush);
    process.on('SIGINT', flush);
  }

  public async seedDefaults() {
    if (this.initialized) return;
    this.initialized = true;

    const orgId = '00000000-0000-0000-0000-000000000001';
    const defaultOrg: DBOrg = {
      id: orgId,
      name: 'Apex',
      domain: 'apexmsp.app',
      settings: {
        companyName: 'ApexMSP',
        logoUrl: '',
        primaryColor: '#2563eb',
        secondaryColor: '#0f172a',
        accentColor: '#10b981',
        darkMode: true,
        customDomain: 'portal.apexmsp.io',
        supportEmail: 'support@apexmsp.io',
        portalWelcomeMessage: 'Welcome to ApexMSP Automated Support Portal'
      },
      createdAt: new Date().toISOString()
    };
    this.orgs.set(orgId, defaultOrg);

    // Admin user: admin@openmsp.local / Admin123!
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync('Admin123!', salt);
    const adminUserId = '00000000-0000-0000-0000-000000000002';
    const adminUser: DBUser = {
      id: adminUserId,
      email: 'admin@openmsp.local',
      passwordHash,
      fullName: 'Chief MSP Operator',
      role: 'owner',
      orgId,
      orgName: defaultOrg.name,
      createdAt: new Date().toISOString()
    };
    this.users.set(adminUser.id, adminUser);

    // Client Orgs (the MSP tenant's customers)
    const client1: ClientTenant = {
      id: 'c-brandon-ray',
      name: 'Brandon Ray',
      domain: 'apexmsp.app',
      contactName: 'Brandon Ray',
      contactEmail: 'brandon@apexmsp.app',
      contactPhone: '555-0101',
      sites: ['Primary'],
      activeContract: 'Internal',
      monthlySlaTier: 'Gold 24/7',
      totalDevices: 2,
      openTickets: 1
    };
    const client2: ClientTenant = {
      id: 'c-richs',
      name: 'Richs',
      domain: 'richs.local',
      contactName: 'Rich',
      contactEmail: '',
      contactPhone: '',
      sites: ['Auburn'],
      activeContract: 'Managed',
      monthlySlaTier: 'Silver 8/5',
      totalDevices: 0,
      openTickets: 0
    };
    this.clients.set(client1.id, client1);
    this.clients.set(client2.id, client2);

    // Per-client enrollment tokens — a device lands under the token's client org
    const mkToken = (token: string, clientId: string, siteId: string): EnrollmentToken => ({
      id: uuidv4(), token, orgId, clientId, siteId,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      used: false, createdAt: new Date().toISOString()
    });
    const tokenBrandon = mkToken('apex-brandon-ray', client1.id, 'Primary');
    const tokenRichs = mkToken('apex-richs', client2.id, 'Auburn');
    const tokenDemo = mkToken('demo-enrollment-token-2026', client1.id, 'Primary');
    this.enrollmentTokens.set(tokenBrandon.token, tokenBrandon);
    this.enrollmentTokens.set(tokenRichs.token, tokenRichs);
    this.enrollmentTokens.set(tokenDemo.token, tokenDemo);

    // Android/relay tablets → client org mapping (device serial → client)
    this.mdmClients.set('apex-lenovo-01', { clientId: client1.id, clientName: client1.name, name: 'Lenovo Tab TB373FU', model: 'Lenovo Tab TB373FU' });

    // Initial Ticket
    const ticket1: PSATicket = {
      id: 'tick-001',
      ticketNumber: 'TICK-1001',
      title: 'Periodic print spooler crash on accounting PC',
      description: 'The local printer becomes unreachable every morning until Print Spooler is manually restarted.',
      clientId: client1.id,
      clientName: client1.name,
      deviceId: 'dev-win-01',
      deviceName: 'ACME-EXEC-PC',
      priority: 'medium',
      status: 'in_progress',
      category: 'Hardware',
      assignedTech: 'Chief MSP Operator',
      createdAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
      updatedAt: new Date().toISOString(),
      slaDueDate: new Date(Date.now() + 3600 * 1000 * 20).toISOString(),
      slaBreached: false,
      comments: [
        {
          id: uuidv4(),
          author: 'Sarah Jenkins',
          authorRole: 'client',
          timestamp: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
          content: 'Printer stopped responding again this morning at 9am.',
          isInternal: false
        },
        {
          id: uuidv4(),
          author: 'Chief MSP Operator',
          authorRole: 'tech',
          timestamp: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
          content: 'Configured self-healing automation rule to auto-restart the spooler if it halts.',
          isInternal: true
        }
      ],
      timeEntries: [
        {
          id: uuidv4(),
          technician: 'Chief MSP Operator',
          minutes: 30,
          description: 'Diagnosed print queue corruption and enabled auto-restart rule',
          date: new Date().toISOString().split('T')[0],
          billable: true,
          hourlyRate: 150
        }
      ],
      aiSuggestedFix: 'Self-healing trigger created for service_stopped: Spooler -> Stop-Service Spooler -Force; Remove-Item C:\\Windows\\System32\\spool\\PRINTERS\\* -Force; Start-Service Spooler'
    };
    this.tickets.set(ticket1.id, ticket1);

    const extraTickets: PSATicket[] = [
      {
        id: 'tick-cd29af2e',
        ticketNumber: 'TICK-1002',
        title: 'TEst',
        description: 'Test',
        clientId: client1.id,
        clientName: client1.name,
        deviceId: 'dev-mac-7c8a43',
        deviceName: 'Brandons-MacBook-Pro.local',
        priority: 'medium',
        status: 'new',
        category: 'Hardware',
        assignedTech: 'Orch (Autonomous MSP Engineer)',
        createdAt: '2026-04-20T18:16:33.666Z',
        updatedAt: new Date().toISOString(),
        slaDueDate: new Date(Date.now() + 3600 * 1000 * 24).toISOString(),
        slaBreached: false,
        comments: [],
        timeEntries: [],
        aiSuggestedFix: 'Self-healing trigger verified: PSA-to-Brain webhook pipeline active (200 OK); auto-linked to Brandons-MacBook-Pro.local telemetry node.'
      },
      {
        id: 'tick-8316df0a',
        ticketNumber: 'TICK-1003',
        title: 'Menu-bar self-test — please ignore',
        description: 'Verifying Request Support from the sharkfin menu.',
        clientId: client1.id,
        clientName: client1.name,
        deviceId: 'dev-mac-7c8a43',
        deviceName: 'Brandons-MacBook-Pro.local',
        priority: 'medium',
        status: 'new',
        category: 'Software',
        assignedTech: 'Orch (Autonomous MSP Engineer)',
        createdAt: '2026-04-20T19:03:09.619Z',
        updatedAt: new Date().toISOString(),
        slaDueDate: new Date(Date.now() + 3600 * 1000 * 24).toISOString(),
        slaBreached: false,
        comments: [],
        timeEntries: [],
        aiSuggestedFix: 'Self-healing trigger created for macos_menubar_watchdog: launchctl kickstart -k gui/$(id -u)/com.apexmsp.menubar && curl -fsSL http://192.168.4.150:8080/api/edge/devices'
      },
      {
        id: 'tick-feb13507',
        ticketNumber: 'TICK-1004',
        title: 'Test',
        description: 'Test',
        clientId: client1.id,
        clientName: client1.name,
        deviceId: 'dev-mac-7c8a43',
        deviceName: 'Brandons-MacBook-Pro.local',
        priority: 'medium',
        status: 'new',
        category: 'Software',
        assignedTech: 'Orch (Autonomous MSP Engineer)',
        createdAt: '2026-04-20T19:45:43.470Z',
        updatedAt: new Date().toISOString(),
        slaDueDate: new Date(Date.now() + 3600 * 1000 * 24).toISOString(),
        slaBreached: false,
        comments: [],
        timeEntries: [],
        aiSuggestedFix: 'Self-healing trigger verified: Site collector election pinned to Brandons-MacBook-Pro.local (isSiteCollector: true) with 60s heartbeat cadence.'
      },
      {
        id: 'tick-e30ae7c8',
        ticketNumber: 'TICK-1005',
        title: 'test',
        description: 'help',
        clientId: client1.id,
        clientName: client1.name,
        deviceId: 'dev-mac-7c8a43',
        deviceName: 'Brandons-MacBook-Pro.local',
        priority: 'urgent',
        status: 'new',
        category: 'Software',
        assignedTech: 'Orch (Autonomous MSP Engineer)',
        createdAt: '2026-04-20T19:53:09.007Z',
        updatedAt: new Date().toISOString(),
        slaDueDate: new Date(Date.now() + 3600 * 1000 * 4).toISOString(),
        slaBreached: false,
        comments: [],
        timeEntries: [],
        aiSuggestedFix: 'Self-healing trigger executed: Priority SLA fast-track activated; Orch verified Brandons-MacBook-Pro.local online (192.168.4.122) and staged 1-click remote triage.'
      }
    ];
    for (const et of extraTickets) {
      this.tickets.set(et.id, et);
    }

    // Initial Automations
    const rule1: SelfHealingRule = {
      id: 'rule-spooler-restart',
      name: 'Auto-Restart Stopped Print Spooler',
      description: 'Monitors Windows print spooler and restarts it immediately if stopped.',
      enabled: true,
      osTarget: 'windows',
      triggerType: 'service_stopped',
      targetServiceName: 'Spooler',
      actionType: 'restart_service',
      executionsCount: 3,
      successRate: 100,
      lastExecuted: new Date(Date.now() - 7200 * 1000).toISOString()
    };
    const rule2: SelfHealingRule = {
      id: 'rule-disk-alert',
      name: 'High Disk Space Auto-Ticket',
      description: 'Generates an urgent PSA ticket when disk space usage exceeds 90%.',
      enabled: true,
      osTarget: 'all',
      triggerType: 'high_disk',
      triggerThreshold: 90,
      actionType: 'create_ticket',
      executionsCount: 1,
      successRate: 100,
      lastExecuted: new Date(Date.now() - 86400 * 1000).toISOString()
    };
    this.automations.set(rule1.id, rule1);
    this.automations.set(rule2.id, rule2);

    // Initial Patches
    const patch1: PatchItem = {
      id: 'patch-kb5034441',
      kbArticle: 'KB5034441',
      title: 'Windows Recovery Environment update for CVE-2024-20666',
      severity: 'critical',
      category: 'Security',
      targetOs: 'windows',
      releaseDate: '2025-01-09',
      approved: true,
      affectedDevicesCount: 1,
      installedDevicesCount: 1
    };
    const patch2: PatchItem = {
      id: 'patch-macos-15-3-1',
      kbArticle: 'APPLE-SA-2025-02',
      title: 'macOS Sequoia 15.3.1 Security Fixes',
      severity: 'important',
      category: 'Security',
      targetOs: 'macos',
      releaseDate: '2025-02-14',
      approved: false,
      affectedDevicesCount: 1,
      installedDevicesCount: 0
    };
    this.patches.set(patch1.id, patch1);
    this.patches.set(patch2.id, patch2);

    // Initial Vault Items (Metadata only stored, passwords encrypted/safe)
    const vault1: VaultItem = {
      id: 'v-001',
      clientId: client1.id,
      clientName: client1.name,
      folder: 'Infrastructure',
      type: 'server_credential',
      title: 'Primary Domain Controller Admin',
      username: 'ACME\\svc_domainadmin',
      password: '• • • • • • • • • • • •',
      url: 'rdp://192.168.1.10',
      notes: 'LAPS managed account for disaster recovery.',
      totpCode: '582910',
      totpRemainingSeconds: 24,
      favorite: true,
      strengthScore: 95,
      lastModified: new Date().toISOString()
    };
    this.vaultItems.set(vault1.id, vault1);

    // Initial Audit Event
    this.auditEvents.push({
      id: uuidv4(),
      orgId,
      userId: adminUserId,
      actorName: 'System Setup',
      action: 'org.initialized',
      targetType: 'msp_org',
      targetId: orgId,
      details: { name: defaultOrg.name },
      createdAt: new Date().toISOString()
    });

    this.seedDefaultStagedApps();
    this.seedSecurityAndUnifiDefaults();
  }

  public seedDefaultStagedApps() {
    const apexConnectApp: import('@openmsp/api-types').StagedApp = {
      id: 'staged-apexconnect-remote',
      name: 'ApexConnect Remote Engine',
      description: 'Dual-channel remote desktop & background management shell (MeshAgent)',
      version: '2.0.4',
      category: 'remote_access',
      os: 'all',
      enabled: true,
      autoDeploy: true,
      detection: {
        type: 'service',
        target: 'Mesh Agent'
      },
      installScript: {
        windows: `$m = "$env:ProgramData\\ApexMSP\\meshagent64.exe"; New-Item -ItemType Directory -Force -Path "$env:ProgramData\\ApexMSP" | Out-Null; if (!(Get-Service "Mesh Agent" -ErrorAction SilentlyContinue)) { Invoke-WebRequest -Uri "https://mesh.apexmsp.app/meshagents?id=4&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib&installflags=0" -OutFile $m -UseBasicParsing; Start-Process -FilePath $m -ArgumentList "-install" -WindowStyle Hidden -Wait; Start-Sleep -Seconds 2; Start-Service "Mesh Agent" -ErrorAction SilentlyContinue }`,
        macos: `if [ ! -d /usr/local/mesh_services/meshagent ]; then TMP_DIR="/tmp/meshagent_$$\"; mkdir -p "$TMP_DIR"; if curl -fsSL "https://mesh.apexmsp.app/meshosxagent?id=29&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib" -o "$TMP_DIR/MeshAgent.zip"; then unzip -qo "$TMP_DIR/MeshAgent.zip" -d "$TMP_DIR" 2>/dev/null && [ -f "$TMP_DIR/MeshAgent.pkg" ] && installer -pkg "$TMP_DIR/MeshAgent.pkg" -target / 2>/dev/null; fi; rm -rf "$TMP_DIR"; fi`
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.stagedApps.set(apexConnectApp.id, apexConnectApp);

    const googleChromeApp: import('@openmsp/api-types').StagedApp = {
      id: 'staged-google-chrome',
      name: 'Google Chrome Enterprise',
      description: 'Enterprise secure web browser deployment',
      version: 'latest',
      category: 'productivity',
      os: 'all',
      enabled: false,
      autoDeploy: false,
      detection: {
        type: 'app_name',
        target: 'Google Chrome'
      },
      installScript: {
        windows: `winget install --id Google.Chrome -e --silent --accept-source-agreements --accept-package-agreements`,
        macos: `curl -fsSL "https://dl.google.com/chrome/mac/stable/accept_tos%3Dhttps%253A%252F%252Fwww.google.com%252Fintl%252Fen_us%252Fchrome%252Fterms%252F%26_and_accept_tos%3Dhttps%253A%252F%252Fpolicies.google.com%252Fterms/googlechrome.pkg" -o /tmp/chrome.pkg && installer -pkg /tmp/chrome.pkg -target / && rm -f /tmp/chrome.pkg`
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.stagedApps.set(googleChromeApp.id, googleChromeApp);

    const androidRemoteApp: import('@openmsp/api-types').StagedApp = {
      id: 'staged-android-remote',
      name: 'Android Unattended Remote Control (DroidVNC + MediaProjection)',
      description: 'DroidVNC-NG server pre-authorized with ProjectMedia for silent background screen viewing',
      version: '1.0.3',
      category: 'remote_access',
      os: 'android',
      enabled: true,
      autoDeploy: true,
      detection: {
        type: 'app_name',
        target: 'droidvnc'
      },
      installScript: {
        android: `adb shell appops set net.christianbeier.droidvnc_ng PROJECT_MEDIA allow && adb shell appops set net.christianbeier.droidvnc_ng SYSTEM_ALERT_WINDOW allow && adb shell appops set app.apexmsp.agent SYSTEM_ALERT_WINDOW allow`
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.stagedApps.set(androidRemoteApp.id, androidRemoteApp);
  }

  public seedSecurityAndUnifiDefaults() {
    const orgId = Array.from(this.orgs.values())[0]?.id || '00000000-0000-0000-0000-000000000001';
    const now = Date.now();
    const iso = (msOffset = 0) => new Date(now + msOffset).toISOString();

    // Ensure all MSP Clients exist
    const clientsToSeed: ClientTenant[] = [
      {
        id: 'c-gambinos',
        name: 'Gambinos',
        domain: 'gambinos.local',
        contactName: 'Gambinos Store Manager',
        contactEmail: 'ops@gambinos.com',
        contactPhone: '555-0192',
        sites: ['88f7af54-98f8-306a-a1c7-c9349722b1f6'],
        activeContract: 'Managed SOC + POS Care',
        monthlySlaTier: 'Gold 24/7',
        totalDevices: 18,
        openTickets: 1
      },
      {
        id: 'c-brandon-ray',
        name: 'Brandon Ray',
        domain: 'apexmsp.app',
        contactName: 'Brandon Ray',
        contactEmail: 'brandon@apexmsp.app',
        contactPhone: '555-0101',
        sites: ['Primary'],
        activeContract: 'Internal SOC & Fleet',
        monthlySlaTier: 'Gold 24/7',
        totalDevices: 4,
        openTickets: 1
      },
      {
        id: 'c-raytreat',
        name: 'Raytreat',
        domain: 'raytreat.com',
        contactName: 'Raytreat Operations',
        contactEmail: 'support@raytreat.com',
        contactPhone: '555-0144',
        sites: ['Raytreat-HQ'],
        activeContract: 'Managed Healthcare & Security',
        monthlySlaTier: 'Gold 24/7',
        totalDevices: 6,
        openTickets: 0
      },
      {
        id: 'c-tbi',
        name: 'TBI',
        domain: 'tbipos.com',
        contactName: 'TBI Operations',
        contactEmail: 'noc@tbipos.com',
        contactPhone: '555-0155',
        sites: ['TBI-Main'],
        activeContract: 'Managed POS & Retail Security',
        monthlySlaTier: 'Gold 24/7',
        totalDevices: 9,
        openTickets: 0
      },
      {
        id: 'c-sos-volleyball',
        name: 'SOS Volleyball',
        domain: 'sosvolleyball.com',
        contactName: 'Athletic Director',
        contactEmail: 'admin@sosvolleyball.com',
        contactPhone: '555-0177',
        sites: ['SOS-Complex'],
        activeContract: 'Managed Wi-Fi & Facility RMM',
        monthlySlaTier: 'Silver 8/5',
        totalDevices: 5,
        openTickets: 0
      },
      {
        id: 'c-municipality',
        name: 'Municipal Client (City Hall & Public Safety)',
        domain: 'cityhall.gov.local',
        contactName: 'Municipal IT Director',
        contactEmail: 'it-director@cityhall.gov.local',
        contactPhone: '555-0911',
        sites: ['muni-city-hall'],
        activeContract: 'Public Sector CJIS Managed SOC',
        monthlySlaTier: 'Gold 24/7',
        totalDevices: 14,
        openTickets: 1
      }
    ];

    for (const c of clientsToSeed) {
      if (!this.clients.has(c.id)) {
        this.clients.set(c.id, c);
      }
    }

    // Seed representative ManagedDevices if not already present so SOC & RMM link cleanly
    const gambinosSiteId = '88f7af54-98f8-306a-a1c7-c9349722b1f6';
    const seedDevices: ManagedDevice[] = [
      {
        id: 'dev-gambinos-pos-ctrl',
        name: 'GAMBINOS-KWICKPOS-C1',
        hostname: 'kwickpos-c1.gambinos.local',
        clientId: 'c-gambinos',
        clientName: 'Gambinos',
        siteId: gambinosSiteId,
        siteName: 'Gambinos Main Store',
        os: 'linux',
        osVersion: 'Ubuntu 22.04 LTS (KwickPOS Host)',
        serialNumber: 'KWICK-C1-90881',
        ipAddress: '192.168.1.101',
        publicIp: '72.14.201.88',
        macAddress: '24:5E:BE:41:10:01',
        health: 'healthy',
        metrics: { cpuUsage: 16, ramUsage: 44, diskUsage: 39, uptimeDays: 42.5, lastSeen: iso(-15000) },
        rustDeskId: '719283101',
        rustDeskOnline: true,
        agentVersion: '1.4.0',
        arch: 'amd64',
        mdmEnrolled: true,
        encryptionStatus: 'encrypted',
        patchCompliance: 100,
        pendingPatchesCount: 0,
        installedApps: [
          { id: 'kwick', name: 'KwickPOS Server & Order Engine', version: '4.12.2', publisher: 'KwickPOS', installDate: '2025-11-10' }
        ],
        services: [
          { name: 'kwickposd', displayName: 'KwickPOS Core Daemon', status: 'running', startupType: 'auto' },
          { name: 'wazuh-agent', displayName: 'Wazuh Security Sensor', status: 'running', startupType: 'auto' }
        ],
        eventLogs: [],
        tags: ['pos-controller', 'protected-asset', 'pci-zone'],
        createdAt: iso(-86400000 * 60),
        updatedAt: iso(-15000)
      },
      {
        id: 'dev-gambinos-bo-pc',
        name: 'GAMBINOS-BACKOFFICE-PC',
        hostname: 'gambinos-mgr-pc.local',
        clientId: 'c-gambinos',
        clientName: 'Gambinos',
        siteId: gambinosSiteId,
        siteName: 'Gambinos Main Store',
        os: 'windows',
        osVersion: 'Windows 11 Pro 23H2',
        serialNumber: 'DELL-GMB-7721',
        ipAddress: '192.168.1.140',
        publicIp: '72.14.201.88',
        macAddress: 'F8:B1:56:9A:44:12',
        health: 'warning',
        metrics: { cpuUsage: 34, ramUsage: 62, diskUsage: 51, uptimeDays: 11.2, lastSeen: iso(-12000) },
        rustDeskId: '719283140',
        rustDeskOnline: true,
        agentVersion: '1.4.0',
        arch: 'amd64',
        mdmEnrolled: true,
        encryptionStatus: 'encrypted',
        patchCompliance: 96,
        pendingPatchesCount: 1,
        installedApps: [
          { id: 'chrome', name: 'Google Chrome', version: '130.0.6723.70', publisher: 'Google LLC', installDate: '2026-01-14' },
          { id: 'qbo', name: 'QuickBooks Bridge', version: '24.1', publisher: 'Intuit', installDate: '2026-02-01' }
        ],
        services: [
          { name: 'WinDefend', displayName: 'Microsoft Defender Antivirus Service', status: 'running', startupType: 'auto' },
          { name: 'Velociraptor', displayName: 'Velociraptor DFIR Sensor', status: 'running', startupType: 'auto' }
        ],
        eventLogs: [],
        tags: ['backoffice', 'manager-workstation'],
        loggedInUser: 'GAMBINOS\\store_mgr',
        domain: 'WORKGROUP',
        createdAt: iso(-86400000 * 45),
        updatedAt: iso(-12000)
      },
      {
        id: 'dev-muni-cad-01',
        name: 'MUNI-DISPATCH-CAD-01',
        hostname: 'muni-dispatch-cad01.cityhall.local',
        clientId: 'c-municipality',
        clientName: 'Municipal Client (City Hall & Public Safety)',
        siteId: 'muni-city-hall',
        siteName: 'City Hall & Dispatch Center',
        os: 'windows',
        osVersion: 'Windows Server 2022 Datacenter',
        serialNumber: 'HPE-MUNI-91101',
        ipAddress: '192.168.1.105', // Intentionally overlaps RFC1918 IP with Gambinos c5 to prove tenant isolation!
        publicIp: '198.51.100.210',
        macAddress: '00:50:56:99:11:01',
        health: 'healthy',
        metrics: { cpuUsage: 22, ramUsage: 54, diskUsage: 47, uptimeDays: 89.4, lastSeen: iso(-8000) },
        rustDeskId: '911000105',
        rustDeskOnline: true,
        agentVersion: '1.4.0',
        arch: 'amd64',
        mdmEnrolled: true,
        encryptionStatus: 'encrypted',
        patchCompliance: 100,
        pendingPatchesCount: 0,
        installedApps: [],
        services: [
          { name: 'WinDefend', displayName: 'Microsoft Defender Antivirus Service', status: 'running', startupType: 'auto' }
        ],
        eventLogs: [],
        tags: ['municipal-critical', 'cjis', 'protected-asset'],
        loggedInUser: 'CITYHALL\\svc_cad',
        domain: 'CITYHALL.GOV.LOCAL',
        createdAt: iso(-86400000 * 90),
        updatedAt: iso(-8000)
      },
      {
        id: 'dev-raytreat-clin-01',
        name: 'RAYTREAT-CLINICAL-MAC01',
        hostname: 'raytreat-clin-mac01.local',
        clientId: 'c-raytreat',
        clientName: 'Raytreat',
        siteId: 'Raytreat-HQ',
        siteName: 'Raytreat HQ',
        os: 'macos',
        osVersion: 'macOS Sequoia 15.3.1',
        serialNumber: 'C02RAYTREAT01',
        ipAddress: '10.40.10.25',
        publicIp: '203.0.113.44',
        macAddress: 'A4:83:E7:33:10:25',
        health: 'healthy',
        metrics: { cpuUsage: 11, ramUsage: 49, diskUsage: 34, uptimeDays: 19.0, lastSeen: iso(-19000) },
        rustDeskId: '844010025',
        rustDeskOnline: true,
        agentVersion: '1.4.0',
        arch: 'arm64',
        mdmEnrolled: true,
        encryptionStatus: 'encrypted',
        patchCompliance: 100,
        pendingPatchesCount: 0,
        installedApps: [],
        services: [],
        eventLogs: [],
        tags: ['clinical', 'hipaa'],
        createdAt: iso(-86400000 * 30),
        updatedAt: iso(-19000)
      },
      {
        id: 'dev-tbi-pos-srv',
        name: 'TBI-POS-MASTER',
        hostname: 'tbi-pos-master.local',
        clientId: 'c-tbi',
        clientName: 'TBI',
        siteId: 'TBI-Main',
        siteName: 'TBI Main Store',
        os: 'windows',
        osVersion: 'Windows 11 IoT Enterprise LTSC',
        serialNumber: 'TBI-POS-8821',
        ipAddress: '10.50.1.10',
        publicIp: '198.51.100.88',
        macAddress: 'BC:24:11:50:01:10',
        health: 'healthy',
        metrics: { cpuUsage: 19, ramUsage: 41, diskUsage: 44, uptimeDays: 31.2, lastSeen: iso(-21000) },
        rustDeskId: '855010010',
        rustDeskOnline: true,
        agentVersion: '1.4.0',
        arch: 'amd64',
        mdmEnrolled: true,
        encryptionStatus: 'encrypted',
        patchCompliance: 100,
        pendingPatchesCount: 0,
        installedApps: [],
        services: [],
        eventLogs: [],
        tags: ['pos-controller', 'protected-asset'],
        createdAt: iso(-86400000 * 50),
        updatedAt: iso(-21000)
      }
    ];

    for (const d of seedDevices) {
      if (!this.devices.has(d.id)) {
        this.devices.set(d.id, d);
      }
    }

    // Seed SecurityPostureReports for managed devices
    const defaultSensors = (os: string): SecurityPostureReport['sensors'] => [
      {
        provider: 'apex_edr_reflex',
        installed: true,
        running: true,
        preventiveActive: true,
        version: '1.4.0',
        lastUpdated: iso(-300000),
        healthMessage: 'Canary tripwire + recovery-inhibition reflex active (<1.2% CPU)'
      },
      {
        provider: 'wazuh',
        installed: true,
        running: true,
        preventiveActive: false,
        version: '4.9.2',
        signatureVersion: 'ruleset-2026.10',
        lastUpdated: iso(-600000),
        healthMessage: 'Connected to Wazuh Manager cluster'
      },
      {
        provider: 'velociraptor',
        installed: true,
        running: true,
        preventiveActive: false,
        version: '0.73.3',
        lastUpdated: iso(-600000),
        healthMessage: 'DFIR artifact collector ready'
      },
      {
        provider: 'yara_x',
        installed: true,
        running: true,
        preventiveActive: true,
        version: '0.10.0',
        signatureVersion: 'apex-yara-2026.10.25',
        lastScanAt: iso(-3600000),
        healthMessage: 'On-write & process-spawn YARA-X rules loaded'
      },
      {
        provider: 'clamav',
        installed: true,
        running: true,
        preventiveActive: true,
        version: '1.4.1',
        signatureVersion: 'daily-27438',
        lastScanAt: iso(-7200000),
        healthMessage: 'ClamAV signature engine healthy'
      },
      {
        provider: os === 'macos' ? 'macos_xprotect' : 'windows_defender',
        installed: os !== 'linux',
        running: os !== 'linux',
        preventiveActive: os !== 'linux',
        version: os === 'macos' ? 'XProtect 5278' : '4.18.24090.11',
        signatureVersion: '1.421.682.0',
        lastUpdated: iso(-1800000),
        healthMessage: os === 'linux' ? 'N/A on Linux (ClamAV + YARA-X active)' : 'OS native kernel realtime protection verified'
      }
    ];

    for (const d of this.devices.values()) {
      if (!this.securityPostures.has(d.id)) {
        this.securityPostures.set(d.id, {
          coverageState: 'preventive_active',
          preventiveAvName: d.os === 'windows' ? 'Microsoft Defender + ClamAV/YARA-X' : d.os === 'macos' ? 'macOS XProtect + YARA-X/ClamAV' : 'ClamAV + YARA-X + Kunai',
          preventiveAvActive: true,
          realtimeProtectionEnabled: true,
          tamperProtectionEnabled: true,
          canaryFilesDeployed: true,
          canaryPaths: d.os === 'windows'
            ? ['C:\\Users\\Public\\Documents\\._apex_canary_financials.xlsx', 'C:\\Users\\Public\\._apex_canary_keys.docx']
            : ['/Users/Shared/.apex_canary_ledger.xlsx', '/var/tmp/.apex_canary_vault.pdf'],
          recoveryInhibitionGuardActive: true,
          isolated: false,
          sensors: defaultSensors(d.os),
          scannerMemoryMb: 118.4,
          supervisorCpuPct: 0.7,
          telemetryCpuPct: 1.1,
          reportedAt: iso(-15000)
        });
      }
    }

    // Seed UniFi Site Capabilities (starting with Gambinos live topology + other MSP sites)
    const gambinosCapability: UnifiSiteCapability = {
      siteId: gambinosSiteId,
      clientId: 'c-gambinos',
      clientName: 'Gambinos',
      siteName: 'Gambinos Main Store (88f7af54-98f8-306a-a1c7-c9349722b1f6)',
      consoleName: 'Gambinos-UCG-Max',
      consoleModel: 'UniFi Cloud Gateway / US-48-500W Stack',
      firmwareVersion: '4.0.20',
      networkAppVersion: '8.6.9',
      connectionMethod: 'cloud_sitemanager_proxy',
      endpointUrl: 'https://api.ui.com/v1/connector/consoles/gambinos/proxy/network/integration/v1/sites/88f7af54-98f8-306a-a1c7-c9349722b1f6',
      online: true,
      lastSyncedAt: iso(-30000),
      capabilities: {
        localIntegrationApi: true,
        legacyStatApi: true,
        syslogCefConfigured: true,
        ipfixTrafficFlowsSupported: true,
        idsIpsEnabled: true,
        zoneFirewallSupported: true,
        clientBlockWriteSupported: true,
        separateReadWriteCreds: true
      },
      counts: {
        adoptedDevices: 6,
        onlineDevices: 5,
        offlineDevices: 1,
        activeClients: 24,
        vlans: 3,
        protectedPosAssets: 13
      },
      vlans: [
        { id: 'vlan-gmb-1', name: 'Default / Store POS & Infrastructure', vlanId: 1, subnet: '192.168.1.0/24', enabled: true, purpose: 'POS + Management (Flat VLAN — segmentation recommended)' },
        { id: 'vlan-gmb-20', name: 'Guest Wi-Fi Isolated', vlanId: 20, subnet: '192.168.20.0/24', enabled: true, purpose: 'Customer Guest Wi-Fi' },
        { id: 'vlan-gmb-30', name: 'Voice / VoIP Phones', vlanId: 30, subnet: '192.168.30.0/24', enabled: true, purpose: '3CX / Store Phones' }
      ],
      coverageGaps: [
        'Port 43 on US48PoE500W has 5 MAC addresses attached via an unmanaged downstream hub/switch (auto-port-disable is safety-locked)',
        '1 adopted UniFi AP (Kitchen-UAP-AC-Pro) reported offline — verify PoE cable',
        'PAX A35 payment terminals (.156, .173, .190, .196, .227) share VLAN 1 with backoffice PC — recommend dedicated PCI VLAN 10'
      ]
    };
    this.unifiSites.set(gambinosCapability.siteId, gambinosCapability);

    const otherSites: UnifiSiteCapability[] = [
      {
        siteId: 'Primary',
        clientId: 'c-brandon-ray',
        clientName: 'Brandon Ray',
        siteName: 'Primary Lab & Operations HQ',
        consoleName: 'Apex-UDM-Pro-Max',
        consoleModel: 'UDM-Pro-Max',
        firmwareVersion: '4.1.9',
        networkAppVersion: '9.0.108',
        connectionMethod: 'local_pinned_tls',
        endpointUrl: 'https://192.168.4.1/proxy/network/integration/v1/sites/Primary',
        online: true,
        lastSyncedAt: iso(-20000),
        capabilities: {
          localIntegrationApi: true,
          legacyStatApi: true,
          syslogCefConfigured: true,
          ipfixTrafficFlowsSupported: true,
          idsIpsEnabled: true,
          zoneFirewallSupported: true,
          clientBlockWriteSupported: true,
          separateReadWriteCreds: true
        },
        counts: { adoptedDevices: 8, onlineDevices: 8, offlineDevices: 0, activeClients: 38, vlans: 4, protectedPosAssets: 3 },
        vlans: [
          { id: 'vlan-br-1', name: 'Core Infrastructure & Proxmox', vlanId: 1, subnet: '192.168.4.0/24', enabled: true, purpose: 'NodalCortex Brain .150 & Proxmox .222' },
          { id: 'vlan-br-10', name: 'SOC Lab Sandbox', vlanId: 10, subnet: '10.10.10.0/24', enabled: true, purpose: 'Isolated Detection Testing' }
        ],
        coverageGaps: []
      },
      {
        siteId: 'Raytreat-HQ',
        clientId: 'c-raytreat',
        clientName: 'Raytreat',
        siteName: 'Raytreat Clinical HQ',
        consoleName: 'Raytreat-UDM-SE',
        consoleModel: 'UDM-SE',
        firmwareVersion: '4.0.21',
        networkAppVersion: '8.6.9',
        connectionMethod: 'cloud_sitemanager_proxy',
        endpointUrl: 'https://api.ui.com/v1/connector/consoles/raytreat/proxy/network/integration/v1/sites/Raytreat-HQ',
        online: true,
        lastSyncedAt: iso(-45000),
        capabilities: {
          localIntegrationApi: true,
          legacyStatApi: true,
          syslogCefConfigured: true,
          ipfixTrafficFlowsSupported: false,
          idsIpsEnabled: true,
          zoneFirewallSupported: true,
          clientBlockWriteSupported: true,
          separateReadWriteCreds: true
        },
        counts: { adoptedDevices: 5, onlineDevices: 5, offlineDevices: 0, activeClients: 19, vlans: 3, protectedPosAssets: 2 },
        vlans: [
          { id: 'vlan-rt-10', name: 'Clinical Workstations (HIPAA)', vlanId: 10, subnet: '10.40.10.0/24', enabled: true, purpose: 'Clinical Endpoints' },
          { id: 'vlan-rt-20', name: 'Patient Kiosks & Tablets', vlanId: 20, subnet: '10.40.20.0/24', enabled: true, purpose: 'MDM Kiosk Tablets' }
        ],
        coverageGaps: ['IPFIX Flow export requires Network 9.x upgrade on UDM-SE']
      },
      {
        siteId: 'TBI-Main',
        clientId: 'c-tbi',
        clientName: 'TBI',
        siteName: 'TBI Retail & POS Operations',
        consoleName: 'TBI-UXG-Pro',
        consoleModel: 'UXG-Pro',
        firmwareVersion: '4.0.20',
        networkAppVersion: '8.6.9',
        connectionMethod: 'cloud_sitemanager_proxy',
        endpointUrl: 'https://api.ui.com/v1/connector/consoles/tbi/proxy/network/integration/v1/sites/TBI-Main',
        online: true,
        lastSyncedAt: iso(-50000),
        capabilities: {
          localIntegrationApi: true,
          legacyStatApi: true,
          syslogCefConfigured: true,
          ipfixTrafficFlowsSupported: true,
          idsIpsEnabled: true,
          zoneFirewallSupported: true,
          clientBlockWriteSupported: true,
          separateReadWriteCreds: true
        },
        counts: { adoptedDevices: 7, onlineDevices: 7, offlineDevices: 0, activeClients: 29, vlans: 3, protectedPosAssets: 6 },
        vlans: [
          { id: 'vlan-tbi-1', name: 'POS & Backoffice', vlanId: 1, subnet: '10.50.1.0/24', enabled: true, purpose: 'TBI POS Terminals' }
        ],
        coverageGaps: []
      },
      {
        siteId: 'SOS-Complex',
        clientId: 'c-sos-volleyball',
        clientName: 'SOS Volleyball',
        siteName: 'SOS Volleyball Athletic Complex',
        consoleName: 'SOS-UDM-Pro',
        consoleModel: 'UDM-Pro',
        firmwareVersion: '4.0.20',
        networkAppVersion: '8.6.9',
        connectionMethod: 'cloud_sitemanager_proxy',
        endpointUrl: 'https://api.ui.com/v1/connector/consoles/sos/proxy/network/integration/v1/sites/SOS-Complex',
        online: true,
        lastSyncedAt: iso(-55000),
        capabilities: {
          localIntegrationApi: true,
          legacyStatApi: true,
          syslogCefConfigured: true,
          ipfixTrafficFlowsSupported: false,
          idsIpsEnabled: true,
          zoneFirewallSupported: false,
          clientBlockWriteSupported: true,
          separateReadWriteCreds: true
        },
        counts: { adoptedDevices: 11, onlineDevices: 11, offlineDevices: 0, activeClients: 112, vlans: 3, protectedPosAssets: 2 },
        vlans: [
          { id: 'vlan-sos-1', name: 'Facility Ops & Concessions POS', vlanId: 1, subnet: '10.60.1.0/24', enabled: true, purpose: 'Operations' },
          { id: 'vlan-sos-50', name: 'Tournament Public High-Density Wi-Fi', vlanId: 50, subnet: '10.60.50.0/22', enabled: true, purpose: 'Spectator Wi-Fi' }
        ],
        coverageGaps: ['High-density 5GHz DFS channel monitoring active on Court APs']
      },
      {
        siteId: 'muni-city-hall',
        clientId: 'c-municipality',
        clientName: 'Municipal Client (City Hall & Public Safety)',
        siteName: 'City Hall & Public Safety Complex',
        consoleName: 'Muni-UDM-Pro-Max',
        consoleModel: 'UDM-Pro-Max',
        firmwareVersion: '4.1.9',
        networkAppVersion: '9.0.108',
        connectionMethod: 'vpn_pinned_tls',
        endpointUrl: 'https://10.254.0.1/proxy/network/integration/v1/sites/muni-city-hall',
        online: true,
        lastSyncedAt: iso(-25000),
        capabilities: {
          localIntegrationApi: true,
          legacyStatApi: true,
          syslogCefConfigured: true,
          ipfixTrafficFlowsSupported: true,
          idsIpsEnabled: true,
          zoneFirewallSupported: true,
          clientBlockWriteSupported: true,
          separateReadWriteCreds: true
        },
        counts: { adoptedDevices: 14, onlineDevices: 14, offlineDevices: 0, activeClients: 64, vlans: 5, protectedPosAssets: 8 },
        vlans: [
          { id: 'vlan-muni-1', name: 'Municipal Operations', vlanId: 1, subnet: '192.168.1.0/24', enabled: true, purpose: 'City Hall Admin (Overlapping RFC1918 tested)' },
          { id: 'vlan-muni-911', name: 'CJIS / CAD Enclave', vlanId: 911, subnet: '10.91.1.0/24', enabled: true, purpose: 'Public Safety CAD (Zero Auto-Containment)' }
        ],
        coverageGaps: []
      }
    ];

    for (const s of otherSites) {
      this.unifiSites.set(s.siteId, s);
    }

    // Seed Temporal Identity Observations for Gambinos (PAX A35s, SUNMI OrderPAD3s, KwickPOS c1-c5, US48PoE500W Port 43 shared attachment, DHCP lease reuse) + Municipal overlapping IP
    const gambinosObservations: TemporalIdentityObservation[] = [
      // 5 PAX A35 Payment Terminals (.156, .173, .190, .196, .227) — 3 of them + 2 POS printers/terminals share US48PoE500W Port 43!
      {
        id: 'obs-gmb-pax-156',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-pax-156',
        macAddress: '90:6D:78:A3:51:56',
        ipAddress: '192.168.1.156',
        hostname: 'PAX-A35-REG1',
        alias: 'PAX A35 Counter 1 (.156)',
        deviceRole: 'pos_payment_pax',
        serialNumber: 'PAXA35-00156',
        isWired: true,
        switchId: 'sw-us48poe500w-gmb',
        switchName: 'US48PoE500W',
        switchMac: '78:8A:20:48:50:01',
        switchPort: 43,
        attachmentType: 'shared_uplink_or_hub',
        portMacCount: 5,
        vlanId: 1,
        networkName: 'Default / Store POS',
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 0.99,
        evidenceSource: 'UniFi Integration API + PAX OUI + Port 43 Multi-MAC Table',
        observedFrom: iso(-86400000 * 7),
        observedTo: iso(0)
      },
      {
        id: 'obs-gmb-pax-173',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-pax-173',
        macAddress: '90:6D:78:A3:51:73',
        ipAddress: '192.168.1.173',
        hostname: 'PAX-A35-REG2',
        alias: 'PAX A35 Counter 2 (.173)',
        deviceRole: 'pos_payment_pax',
        serialNumber: 'PAXA35-00173',
        isWired: true,
        switchId: 'sw-us48poe500w-gmb',
        switchName: 'US48PoE500W',
        switchMac: '78:8A:20:48:50:01',
        switchPort: 43,
        attachmentType: 'shared_uplink_or_hub',
        portMacCount: 5,
        vlanId: 1,
        networkName: 'Default / Store POS',
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 0.99,
        evidenceSource: 'UniFi Integration API + PAX OUI + Port 43 Multi-MAC Table',
        observedFrom: iso(-86400000 * 7),
        observedTo: iso(0)
      },
      {
        id: 'obs-gmb-pax-190',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-pax-190',
        macAddress: '90:6D:78:A3:51:90',
        ipAddress: '192.168.1.190',
        hostname: 'PAX-A35-DRIVETHRU',
        alias: 'PAX A35 Drive-Thru (.190)',
        deviceRole: 'pos_payment_pax',
        serialNumber: 'PAXA35-00190',
        isWired: true,
        switchId: 'sw-us48poe500w-gmb',
        switchName: 'US48PoE500W',
        switchMac: '78:8A:20:48:50:01',
        switchPort: 43,
        attachmentType: 'shared_uplink_or_hub',
        portMacCount: 5,
        vlanId: 1,
        networkName: 'Default / Store POS',
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 0.99,
        evidenceSource: 'UniFi Integration API + PAX OUI + Port 43 Multi-MAC Table',
        observedFrom: iso(-86400000 * 7),
        observedTo: iso(0)
      },
      {
        id: 'obs-gmb-pax-196',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-pax-196',
        macAddress: '90:6D:78:A3:51:96',
        ipAddress: '192.168.1.196',
        hostname: 'PAX-A35-PICKUP',
        alias: 'PAX A35 Pickup Counter (.196)',
        deviceRole: 'pos_payment_pax',
        serialNumber: 'PAXA35-00196',
        isWired: true,
        switchId: 'sw-us48poe500w-gmb',
        switchName: 'US48PoE500W',
        switchMac: '78:8A:20:48:50:01',
        switchPort: 18,
        attachmentType: 'confirmed_direct',
        portMacCount: 1,
        vlanId: 1,
        networkName: 'Default / Store POS',
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 0.99,
        evidenceSource: 'UniFi Integration API + Direct Port 18',
        observedFrom: iso(-86400000 * 7),
        observedTo: iso(0)
      },
      {
        id: 'obs-gmb-pax-227',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-pax-227',
        macAddress: '90:6D:78:A3:52:27',
        ipAddress: '192.168.1.227',
        hostname: 'PAX-A35-BAR',
        alias: 'PAX A35 Dining/Bar (.227)',
        deviceRole: 'pos_payment_pax',
        serialNumber: 'PAXA35-00227',
        isWired: true,
        switchId: 'sw-us48poe500w-gmb',
        switchName: 'US48PoE500W',
        switchMac: '78:8A:20:48:50:01',
        switchPort: 19,
        attachmentType: 'confirmed_direct',
        portMacCount: 1,
        vlanId: 1,
        networkName: 'Default / Store POS',
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 0.99,
        evidenceSource: 'UniFi Integration API + Direct Port 19',
        observedFrom: iso(-86400000 * 7),
        observedTo: iso(0)
      },
      // KwickPOS c1 - c5 terminals (c1 and c2 also on Port 43 to complete the 5-MAC shared uplink on Port 43!)
      {
        id: 'obs-gmb-kwick-c1',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'pos_sdk_verified',
        providerClientId: 'unifi-kwick-c1',
        macAddress: '24:5E:BE:41:10:01',
        ipAddress: '192.168.1.101',
        hostname: 'c1',
        alias: 'KwickPOS c1 (Primary Controller / Counter 1)',
        deviceRole: 'pos_controller_candidate',
        serialNumber: 'KWICK-C1-90881',
        isWired: true,
        switchId: 'sw-us48poe500w-gmb',
        switchName: 'US48PoE500W',
        switchMac: '78:8A:20:48:50:01',
        switchPort: 43,
        attachmentType: 'shared_uplink_or_hub',
        portMacCount: 5,
        vlanId: 1,
        networkName: 'Default / Store POS',
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 1.0,
        evidenceSource: 'Apex Agent + UniFi Port 43 Multi-MAC Table (5 MACs)',
        observedFrom: iso(-86400000 * 14),
        observedTo: iso(0),
        managedDeviceId: 'dev-gambinos-pos-ctrl'
      },
      {
        id: 'obs-gmb-kwick-c2',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-kwick-c2',
        macAddress: '24:5E:BE:41:10:02',
        ipAddress: '192.168.1.102',
        hostname: 'c2',
        alias: 'KwickPOS c2 (Counter 2)',
        deviceRole: 'pos_terminal',
        isWired: true,
        switchId: 'sw-us48poe500w-gmb',
        switchName: 'US48PoE500W',
        switchMac: '78:8A:20:48:50:01',
        switchPort: 43,
        attachmentType: 'shared_uplink_or_hub',
        portMacCount: 5,
        vlanId: 1,
        networkName: 'Default / Store POS',
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 0.98,
        evidenceSource: 'UniFi Integration API + Port 43 Multi-MAC Table (5 MACs)',
        observedFrom: iso(-86400000 * 14),
        observedTo: iso(0)
      },
      {
        id: 'obs-gmb-kwick-c3',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-kwick-c3',
        macAddress: '24:5E:BE:41:10:03',
        ipAddress: '192.168.1.103',
        hostname: 'c3',
        alias: 'KwickPOS c3 (Drive-Thru Station)',
        deviceRole: 'pos_terminal',
        isWired: true,
        switchId: 'sw-us48poe500w-gmb',
        switchName: 'US48PoE500W',
        switchMac: '78:8A:20:48:50:01',
        switchPort: 12,
        attachmentType: 'confirmed_direct',
        portMacCount: 1,
        vlanId: 1,
        networkName: 'Default / Store POS',
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 0.98,
        evidenceSource: 'UniFi Integration API + Direct Port 12',
        observedFrom: iso(-86400000 * 14),
        observedTo: iso(0)
      },
      {
        id: 'obs-gmb-kwick-c4',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-kwick-c4',
        macAddress: '24:5E:BE:41:10:04',
        ipAddress: '192.168.1.104',
        hostname: 'c4',
        alias: 'KwickPOS c4 (Kitchen Make Line)',
        deviceRole: 'pos_terminal',
        isWired: true,
        switchId: 'sw-us48poe500w-gmb',
        switchName: 'US48PoE500W',
        switchMac: '78:8A:20:48:50:01',
        switchPort: 14,
        attachmentType: 'confirmed_direct',
        portMacCount: 1,
        vlanId: 1,
        networkName: 'Default / Store POS',
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 0.98,
        evidenceSource: 'UniFi Integration API + Direct Port 14',
        observedFrom: iso(-86400000 * 14),
        observedTo: iso(0)
      },
      {
        id: 'obs-gmb-kwick-c5',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-kwick-c5',
        macAddress: '24:5E:BE:41:10:05',
        ipAddress: '192.168.1.105',
        hostname: 'c5',
        alias: 'KwickPOS c5 (Cut Table / Dispatch)',
        deviceRole: 'pos_terminal',
        isWired: true,
        switchId: 'sw-us48poe500w-gmb',
        switchName: 'US48PoE500W',
        switchMac: '78:8A:20:48:50:01',
        switchPort: 15,
        attachmentType: 'confirmed_direct',
        portMacCount: 1,
        vlanId: 1,
        networkName: 'Default / Store POS',
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 0.98,
        evidenceSource: 'UniFi Integration API + Direct Port 15',
        observedFrom: iso(-86400000 * 14),
        observedTo: iso(0)
      },
      // SUNMI OrderPAD3 handhelds on Wi-Fi
      {
        id: 'obs-gmb-sunmi-1',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-sunmi-01',
        macAddress: '7C:D9:5C:30:01:61',
        ipAddress: '192.168.1.161',
        hostname: 'OrderPAD3-01',
        alias: 'SUNMI OrderPAD3 Handheld #1',
        deviceRole: 'pos_tablet_sunmi',
        isWired: false,
        attachmentType: 'wireless_ap',
        apId: 'ap-gmb-dining-u6pro',
        apName: 'Dining-U6-Pro',
        ssid: 'Gambinos-POS-Secure',
        vlanId: 1,
        networkName: 'Default / Store POS',
        rssi: -54,
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 0.96,
        evidenceSource: 'UniFi Wireless Client Table + SUNMI OUI',
        observedFrom: iso(-86400000 * 5),
        observedTo: iso(0)
      },
      {
        id: 'obs-gmb-sunmi-2',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-sunmi-02',
        macAddress: '7C:D9:5C:30:01:62',
        ipAddress: '192.168.1.162',
        hostname: 'OrderPAD3-02',
        alias: 'SUNMI OrderPAD3 Handheld #2',
        deviceRole: 'pos_tablet_sunmi',
        isWired: false,
        attachmentType: 'wireless_ap',
        apId: 'ap-gmb-dining-u6pro',
        apName: 'Dining-U6-Pro',
        ssid: 'Gambinos-POS-Secure',
        vlanId: 1,
        networkName: 'Default / Store POS',
        rssi: -58,
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 0.96,
        evidenceSource: 'UniFi Wireless Client Table + SUNMI OUI',
        observedFrom: iso(-86400000 * 5),
        observedTo: iso(0)
      },
      // Backoffice Manager PC (Managed Endpoint)
      {
        id: 'obs-gmb-bo-pc',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'apex_agent',
        providerClientId: 'unifi-bo-pc-140',
        macAddress: 'F8:B1:56:9A:44:12',
        ipAddress: '192.168.1.140',
        hostname: 'gambinos-mgr-pc.local',
        alias: 'GAMBINOS-BACKOFFICE-PC',
        deviceRole: 'workstation',
        serialNumber: 'DELL-GMB-7721',
        isWired: true,
        switchId: 'sw-us48poe500w-gmb',
        switchName: 'US48PoE500W',
        switchMac: '78:8A:20:48:50:01',
        switchPort: 8,
        attachmentType: 'confirmed_direct',
        portMacCount: 1,
        vlanId: 1,
        networkName: 'Default / Store POS',
        dhcpReserved: true,
        isProtectedAsset: false,
        confidence: 1.0,
        evidenceSource: 'Apex Agent Heartbeat + UniFi Switch Port 8',
        observedFrom: iso(-86400000 * 14),
        observedTo: iso(0),
        managedDeviceId: 'dev-gambinos-bo-pc'
      },
      // Temporal DHCP Lease Reuse Proof on 192.168.1.188:
      // Window 1 (T-6h to T-2h): Contractor Laptop held 192.168.1.188 and triggered an IDS alert at T-4h
      {
        id: 'obs-gmb-dhcp-old-188',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_syslog',
        providerClientId: 'unifi-dhcp-old-188',
        macAddress: 'AA:BB:CC:11:22:01',
        ipAddress: '192.168.1.188',
        hostname: 'contractor-win-laptop',
        alias: 'Transient Contractor Laptop (Historical Lease)',
        deviceRole: 'guest_client',
        isWired: false,
        attachmentType: 'wireless_ap',
        apId: 'ap-gmb-dining-u6pro',
        apName: 'Dining-U6-Pro',
        ssid: 'Gambinos-Guest',
        vlanId: 20,
        networkName: 'Guest Wi-Fi Isolated',
        rssi: -67,
        dhcpReserved: false,
        isProtectedAsset: false,
        confidence: 0.94,
        evidenceSource: 'UniFi DHCPACK / Wi-Fi Assoc Log [T-6h .. T-2h]',
        observedFrom: iso(-3600000 * 6),
        observedTo: iso(-3600000 * 2)
      },
      // Window 2 (T-2h to now): Shift Lead iPad received 192.168.1.188 after contractor left
      {
        id: 'obs-gmb-dhcp-new-188',
        orgId,
        clientId: 'c-gambinos',
        siteId: gambinosSiteId,
        provider: 'unifi_local_api',
        providerClientId: 'unifi-dhcp-new-188',
        macAddress: 'AA:BB:CC:11:22:99',
        ipAddress: '192.168.1.188',
        hostname: 'shift-lead-ipad',
        alias: 'Shift Lead Inventory iPad (Current Lease)',
        deviceRole: 'guest_client',
        isWired: false,
        attachmentType: 'wireless_ap',
        apId: 'ap-gmb-dining-u6pro',
        apName: 'Dining-U6-Pro',
        ssid: 'Gambinos-Guest',
        vlanId: 20,
        networkName: 'Guest Wi-Fi Isolated',
        rssi: -49,
        dhcpReserved: false,
        isProtectedAsset: false,
        confidence: 0.95,
        evidenceSource: 'UniFi Live Client Table + DHCP Lease [T-2h .. now]',
        observedFrom: iso(-3600000 * 2),
        observedTo: iso(0)
      },
      // Cross-Tenant Overlapping IP Proof: Municipal Client ALSO uses 192.168.1.105 and 192.168.1.156 on its own site!
      {
        id: 'obs-muni-cad-105',
        orgId,
        clientId: 'c-municipality',
        siteId: 'muni-city-hall',
        provider: 'apex_agent',
        providerClientId: 'muni-cad-105',
        macAddress: '00:50:56:99:11:01',
        ipAddress: '192.168.1.105',
        hostname: 'muni-dispatch-cad01.cityhall.local',
        alias: 'Municipal 911 CAD Server (.105)',
        deviceRole: 'server',
        serialNumber: 'HPE-MUNI-91101',
        isWired: true,
        switchId: 'sw-muni-core-01',
        switchName: 'Muni-USW-Pro-48',
        switchMac: '78:8A:20:91:10:01',
        switchPort: 1,
        attachmentType: 'confirmed_direct',
        portMacCount: 1,
        vlanId: 911,
        networkName: 'CJIS / CAD Enclave',
        dhcpReserved: true,
        isProtectedAsset: true,
        confidence: 1.0,
        evidenceSource: 'Apex Agent + Municipal Core Switch Port 1',
        observedFrom: iso(-86400000 * 30),
        observedTo: iso(0),
        managedDeviceId: 'dev-muni-cad-01'
      }
    ];

    for (const obs of gambinosObservations) {
      this.identityObservations.set(obs.id, obs);
    }

    // Seed Security Policies per client/site
    const policies: SecurityPolicy[] = [
      {
        id: 'pol-gambinos',
        orgId,
        clientId: 'c-gambinos',
        clientName: 'Gambinos',
        siteId: gambinosSiteId,
        policyVersion: 'v2026.10.2',
        mode: 'auto_contain_safe',
        edrReflexEnabled: true,
        recoveryInhibitionAutoKill: true,
        canaryTripwireEnabled: true,
        canaryPaths: ['C:\\Users\\Public\\Documents\\._apex_canary_financials.xlsx'],
        avRealtimeEnabled: true,
        avScanCadenceHours: 12,
        unifiIdsCorrelationEnabled: true,
        autoIsolateWorkstationsOnCritical: true,
        protectedAssetExclusions: {
          neverAutoIsolateRoles: ['pos_payment_pax', 'pos_controller_candidate', 'pos_terminal', 'pos_tablet_sunmi', 'pos_printer', 'server', 'gateway', 'switch', 'ap'],
          neverBlockSharedSwitchPorts: true,
          protectedMacAddresses: [
            '90:6D:78:A3:51:56',
            '90:6D:78:A3:51:73',
            '90:6D:78:A3:51:90',
            '90:6D:78:A3:51:96',
            '90:6D:78:A3:52:27',
            '24:5E:BE:41:10:01',
            '24:5E:BE:41:10:02',
            '24:5E:BE:41:10:03',
            '24:5E:BE:41:10:04',
            '24:5E:BE:41:10:05'
          ],
          protectedIpAddresses: [
            '192.168.1.156',
            '192.168.1.173',
            '192.168.1.190',
            '192.168.1.196',
            '192.168.1.227',
            '192.168.1.101',
            '192.168.1.102',
            '192.168.1.103',
            '192.168.1.104',
            '192.168.1.105'
          ],
          protectedSwitchPorts: ['sw-us48poe500w-gmb:43']
        },
        updatedAt: iso(-3600000)
      },
      {
        id: 'pol-municipality',
        orgId,
        clientId: 'c-municipality',
        clientName: 'Municipal Client (City Hall & Public Safety)',
        siteId: 'muni-city-hall',
        policyVersion: 'v2026.10.2-cjis',
        mode: 'active_detect',
        edrReflexEnabled: true,
        recoveryInhibitionAutoKill: true,
        canaryTripwireEnabled: true,
        canaryPaths: ['C:\\Users\\Public\\._apex_canary_cjis.docx'],
        avRealtimeEnabled: true,
        avScanCadenceHours: 6,
        unifiIdsCorrelationEnabled: true,
        autoIsolateWorkstationsOnCritical: false, // Municipal CJIS policy: human dual-approval required before host isolation
        protectedAssetExclusions: {
          neverAutoIsolateRoles: ['server', 'gateway', 'switch', 'ap', 'pos_controller_candidate'],
          neverBlockSharedSwitchPorts: true,
          protectedMacAddresses: ['00:50:56:99:11:01'],
          protectedIpAddresses: ['192.168.1.105'],
          protectedSwitchPorts: ['sw-muni-core-01:1']
        },
        updatedAt: iso(-7200000)
      }
    ];

    for (const p of policies) {
      this.securityPolicies.set(p.id, p);
    }

    // Seed Correlated Detections & Incidents
    const det1: SecurityDetection = {
      id: 'det-gmb-001',
      eventId: 'evt-gmb-shadow-001',
      idempotencyKey: 'idem-gmb-shadow-001',
      orgId,
      clientId: 'c-gambinos',
      clientName: 'Gambinos',
      siteId: gambinosSiteId,
      deviceId: 'dev-gambinos-bo-pc',
      deviceName: 'GAMBINOS-BACKOFFICE-PC',
      eventTime: iso(-1800000),
      ingestTime: iso(-1799180), // 820ms ingest latency
      sourceProvider: 'apex_agent',
      ruleId: 'APEX-EDR-1001',
      ruleName: 'Recovery Inhibition: Volume Shadow Copy Deletion Attempt (T1490)',
      severity: 'critical',
      confidence: 0.99,
      category: 'recovery_inhibition',
      summary: 'Blocked vssadmin.exe attempting to delete volume shadow copies spawned from suspicious invoice macro.',
      process: {
        pid: 6812,
        ppid: 4120,
        name: 'vssadmin.exe',
        exePath: 'C:\\Windows\\System32\\vssadmin.exe',
        cmdline: 'vssadmin.exe delete shadows /all /quiet',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        user: 'GAMBINOS\\store_mgr',
        signed: true,
        signer: 'Microsoft Windows'
      },
      network: {
        srcIp: '192.168.1.140',
        unifiSiteId: gambinosSiteId,
        vlanId: 1,
        switchId: 'sw-us48poe500w-gmb',
        switchPort: 8
      },
      rawEvidence: {
        mitreTechnique: 'T1490',
        reflexActionTaken: 'process_suspended_and_killed',
        parentProcess: 'powershell.exe -enc UwB0AGEAcgB0AC0AUAByAG8AYwBlAHMAcwA='
      },
      incidentId: 'inc-gmb-1001',
      evidencePointer: 's3://apex-soc-evidence/c-gambinos/det-gmb-001.json'
    };

    const det2: SecurityDetection = {
      id: 'det-gmb-002',
      eventId: 'evt-gmb-unifi-ids-002',
      idempotencyKey: 'idem-gmb-unifi-ids-002',
      orgId,
      clientId: 'c-gambinos',
      clientName: 'Gambinos',
      siteId: gambinosSiteId,
      deviceId: 'dev-gambinos-bo-pc',
      deviceName: 'GAMBINOS-BACKOFFICE-PC',
      eventTime: iso(-1795000),
      ingestTime: iso(-1794350), // 650ms ingest latency
      sourceProvider: 'unifi_ids',
      ruleId: 'UNIFI-SURICATA-2029811',
      ruleName: 'ET MALWARE Suspicious SMB Lateral Probe Toward POS Subnet',
      severity: 'high',
      confidence: 0.93,
      category: 'lateral_movement',
      summary: 'UniFi IDS detected SMBv2 connection burst from GAMBINOS-BACKOFFICE-PC (192.168.1.140) toward KwickPOS c1 (192.168.1.101:445).',
      network: {
        srcIp: '192.168.1.140',
        srcPort: 54112,
        dstIp: '192.168.1.101',
        dstPort: 445,
        proto: 'TCP',
        unifiSiteId: gambinosSiteId,
        vlanId: 1,
        switchId: 'sw-us48poe500w-gmb',
        switchPort: 8,
        blocked: true
      },
      rawEvidence: {
        cef: 'CEF:0|Ubiquiti|UniFi Network|8.6.9|2029811|ET MALWARE SMB Lateral Probe|8|src=192.168.1.140 dst=192.168.1.101 dpt=445 act=blocked'
      },
      incidentId: 'inc-gmb-1001',
      evidencePointer: 's3://apex-soc-evidence/c-gambinos/det-gmb-002.json'
    };

    // Historical detection on 192.168.1.188 at T-4h (attributed to contractor-win-laptop AA:BB:CC:11:22:01, NOT shift-lead-ipad AA:BB:CC:11:22:99)
    const det3: SecurityDetection = {
      id: 'det-gmb-003',
      eventId: 'evt-gmb-dhcp-hist-003',
      idempotencyKey: 'idem-gmb-dhcp-hist-003',
      orgId,
      clientId: 'c-gambinos',
      clientName: 'Gambinos',
      siteId: gambinosSiteId,
      deviceName: 'contractor-win-laptop (AA:BB:CC:11:22:01)',
      eventTime: iso(-3600000 * 4), // T-4h (falls inside Window 1: T-6h..T-2h)
      ingestTime: iso(-3600000 * 4 + 490),
      sourceProvider: 'unifi_syslog',
      ruleId: 'UNIFI-DNS-TI-401',
      ruleName: 'Suspicious Dynamic DNS Beacon on Guest VLAN',
      severity: 'medium',
      confidence: 0.88,
      category: 'network_ids',
      summary: 'Guest client 192.168.1.188 (bound at event_time to MAC AA:BB:CC:11:22:01 contractor-win-laptop) queried known DGA domain.',
      network: {
        srcIp: '192.168.1.188',
        dstIp: '185.199.108.153',
        dstPort: 53,
        proto: 'UDP',
        domain: 'xk99-c2-sync.duckdns.org',
        unifiSiteId: gambinosSiteId,
        unifiClientId: 'unifi-dhcp-old-188',
        vlanId: 20,
        apId: 'ap-gmb-dining-u6pro',
        ssid: 'Gambinos-Guest',
        blocked: true
      },
      rawEvidence: {
        resolvedTemporalIdentity: 'obs-gmb-dhcp-old-188',
        resolvedMacAtEventTime: 'AA:BB:CC:11:22:01',
        note: 'Temporal join prevented false attribution to current lease holder shift-lead-ipad (AA:BB:CC:11:22:99)'
      }
    };

    this.securityDetections.set(det1.id, det1);
    this.securityDetections.set(det2.id, det2);
    this.securityDetections.set(det3.id, det3);

    // Seed Security Incident correlated from det1 + det2 and linked to PSA Ticket
    const secTicketId = 'tick-sec-1002';
    if (!this.tickets.has(secTicketId)) {
      this.tickets.set(secTicketId, {
        id: secTicketId,
        ticketNumber: 'TICK-1002',
        title: '[SOC CRITICAL] Recovery Inhibition + SMB Lateral Probe on GAMBINOS-BACKOFFICE-PC',
        description: 'Correlated Endpoint EDR (vssadmin shadow delete blocked) + UniFi IDS (SMB probe toward KwickPOS c1 192.168.1.101). PAX A35 terminals and US48PoE500W Port 43 are protected by Action Broker safety lock.',
        clientId: 'c-gambinos',
        clientName: 'Gambinos',
        deviceId: 'dev-gambinos-bo-pc',
        deviceName: 'GAMBINOS-BACKOFFICE-PC',
        priority: 'urgent',
        status: 'in_progress',
        category: 'Security',
        assignedTech: 'Chief MSP Operator',
        createdAt: iso(-1799000),
        updatedAt: iso(-1794000),
        slaDueDate: iso(3600000),
        slaBreached: false,
        comments: [
          {
            id: uuidv4(),
            author: 'Apex SOC Correlation Engine',
            authorRole: 'ai_copilot',
            timestamp: iso(-1794000),
            content: 'Auto-correlated 2 detections (APEX-EDR-1001 + UNIFI-SURICATA-2029811) within 5s window. Action Broker queued host isolation for GAMBINOS-BACKOFFICE-PC while protecting KwickPOS c1-c5 and PAX A35 payment terminals.',
            isInternal: true
          }
        ],
        timeEntries: [],
        aiSuggestedFix: 'Approve Action act-gmb-isolate-bo to isolate GAMBINOS-BACKOFFICE-PC (Port 8) while leaving US48PoE500W Port 43 and KwickPOS untouched.'
      });
    }

    const inc1: SecurityIncident = {
      id: 'inc-gmb-1001',
      incidentNumber: 'INC-2026-1001',
      orgId,
      clientId: 'c-gambinos',
      clientName: 'Gambinos',
      siteId: gambinosSiteId,
      siteName: 'Gambinos Main Store',
      deviceId: 'dev-gambinos-bo-pc',
      deviceName: 'GAMBINOS-BACKOFFICE-PC',
      title: 'Ransomware Precursor: Shadow Copy Deletion Blocked + SMB Lateral Probe toward KwickPOS',
      summary: 'Endpoint reflex sensor killed vssadmin.exe shadow deletion on GAMBINOS-BACKOFFICE-PC (192.168.1.140) 5 seconds before UniFi IDS blocked an SMB lateral probe toward KwickPOS controller c1 (192.168.1.101).',
      severity: 'critical',
      category: 'recovery_inhibition',
      status: 'containment_pending',
      confidence: 0.99,
      detectionIds: ['det-gmb-001', 'det-gmb-002'],
      ticketId: secTicketId,
      copilotCaseUrl: 'https://soc.apexmsp.app/cases/INC-2026-1001',
      velociraptorHuntId: 'H.GAMBINOS.20261025.01',
      wazuhAlertIds: ['1729891001.4412', '1729891006.8819'],
      assetCriticality: 'standard',
      containmentState: 'requested',
      firstEventTime: iso(-1800000),
      lastEventTime: iso(-1795000),
      ingestLatencyMs: 735,
      createdAt: iso(-1799000),
      updatedAt: iso(-1794000)
    };
    this.securityIncidents.set(inc1.id, inc1);

    // Seed Action Broker records:
    // 1) Pending approval to isolate GAMBINOS-BACKOFFICE-PC (Workstation on dedicated Port 8)
    // 2) Blocked action demonstrating Protected Asset Lock on KwickPOS / PAX A35 shared Port 43
    const act1: SecurityAction = {
      id: 'act-gmb-isolate-bo',
      orgId,
      clientId: 'c-gambinos',
      clientName: 'Gambinos',
      siteId: gambinosSiteId,
      incidentId: 'inc-gmb-1001',
      targetDeviceId: 'dev-gambinos-bo-pc',
      targetDeviceName: 'GAMBINOS-BACKOFFICE-PC',
      targetUnifiClientMac: 'F8:B1:56:9A:44:12',
      actionType: 'isolate_host',
      reason: 'Isolate backoffice workstation after blocked vssadmin shadow copy deletion and SMB lateral probe toward KwickPOS c1',
      requestedBy: 'Apex SOC Correlation Engine',
      requestedAt: iso(-1790000),
      requiresHumanApproval: true,
      expiresAt: iso(3600000 * 4),
      policyVersion: 'v2026.10.2',
      status: 'pending_approval',
      payload: {
        deviceId: 'dev-gambinos-bo-pc',
        switchId: 'sw-us48poe500w-gmb',
        switchPort: 8,
        attachmentType: 'confirmed_direct',
        allowManagementPlaneOnly: true
      }
    };

    const act2: SecurityAction = {
      id: 'act-gmb-blocked-port43',
      orgId,
      clientId: 'c-gambinos',
      clientName: 'Gambinos',
      siteId: gambinosSiteId,
      incidentId: 'inc-gmb-1001',
      targetDeviceId: 'dev-gambinos-pos-ctrl',
      targetDeviceName: 'GAMBINOS-KWICKPOS-C1',
      targetUnifiClientMac: '24:5E:BE:41:10:01',
      actionType: 'unifi_block_client',
      reason: 'Automated containment test against SMB target 192.168.1.101 (KwickPOS c1 on US48PoE500W Port 43)',
      requestedBy: 'Automated Playbook Dry-Run',
      requestedAt: iso(-1785000),
      requiresHumanApproval: true,
      expiresAt: iso(3600000 * 2),
      policyVersion: 'v2026.10.2',
      status: 'blocked_protected_asset',
      payload: {
        switchId: 'sw-us48poe500w-gmb',
        switchPort: 43,
        portMacCount: 5,
        deviceRole: 'pos_controller_candidate'
      },
      error: 'PROTECTED ASSET SAFETY LOCK: Target 24:5E:BE:41:10:01 (KwickPOS c1) is a protected POS asset AND resides on shared switch port US48PoE500W:43 (5 MACs attached including PAX A35 payment terminals .156, .173, .190). Auto-containment is strictly prohibited.'
    };

    this.securityActions.set(act1.id, act1);
    this.securityActions.set(act2.id, act2);
  }

  /**
   * Automatically hydrates/merges live UniFi snapshot data from
   * /Users/dev/apexmsp/fixtures/unifi/gambinos-live-snapshot.json or all-sites-capability-matrix.json
   * if present on disk.
   */
  public hydrateUnifiFixtures(): { hydratedFiles: string[]; observationsMerged: number; sitesMerged: number } {
    const hydratedFiles: string[] = [];
    let observationsMerged = 0;
    let sitesMerged = 0;
    const orgId = Array.from(this.orgs.values())[0]?.id || '00000000-0000-0000-0000-000000000001';
    const fixtureDir = '/Users/dev/apexmsp/fixtures/unifi';

    try {
      const matrixPath = path.join(fixtureDir, 'all-sites-capability-matrix.json');
      if (fs.existsSync(matrixPath)) {
        const raw = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
        const sitesList = Array.isArray(raw) ? raw : Array.isArray(raw.sites) ? raw.sites : [];
        for (const s of sitesList) {
          if (s && s.siteId) {
            const existing = this.unifiSites.get(s.siteId);
            this.unifiSites.set(s.siteId, { ...(existing || {}), ...s });
            sitesMerged++;
          }
        }
        hydratedFiles.push(matrixPath);
      }

      const gambinosPath = path.join(fixtureDir, 'gambinos-live-snapshot.json');
      if (fs.existsSync(gambinosPath)) {
        const snap = JSON.parse(fs.readFileSync(gambinosPath, 'utf8'));
        const siteId = snap.siteId || '88f7af54-98f8-306a-a1c7-c9349722b1f6';

        if (snap.capability && typeof snap.capability === 'object') {
          const existing = this.unifiSites.get(siteId);
          this.unifiSites.set(siteId, { ...(existing || {}), ...snap.capability, siteId, lastSyncedAt: new Date().toISOString() });
          sitesMerged++;
        }

        const obsList = Array.isArray(snap.observations)
          ? snap.observations
          : Array.isArray(snap.clients)
            ? snap.clients
            : [];

        for (const item of obsList) {
          if (!item) continue;
          const mac = String(item.macAddress || item.mac || '').toUpperCase();
          if (!mac) continue;
          const id = item.id || `obs-live-${mac.replace(/[^A-F0-9]/g, '').toLowerCase()}`;
          const existing = this.identityObservations.get(id);
          const merged: TemporalIdentityObservation = {
            id,
            orgId: item.orgId || orgId,
            clientId: item.clientId || 'c-gambinos',
            siteId: item.siteId || siteId,
            provider: item.provider || 'unifi_cloud_sitemanager',
            providerClientId: item.providerClientId || item.id || id,
            macAddress: mac,
            ipAddress: item.ipAddress || item.ip || existing?.ipAddress,
            hostname: item.hostname || item.name || existing?.hostname,
            alias: item.alias || item.name || existing?.alias,
            deviceRole: item.deviceRole || existing?.deviceRole || 'unknown',
            serialNumber: item.serialNumber || existing?.serialNumber,
            isWired: typeof item.isWired === 'boolean' ? item.isWired : (existing?.isWired ?? true),
            switchId: item.switchId || existing?.switchId,
            switchName: item.switchName || existing?.switchName,
            switchMac: item.switchMac || existing?.switchMac,
            switchPort: typeof item.switchPort === 'number' ? item.switchPort : existing?.switchPort,
            attachmentType: item.attachmentType || existing?.attachmentType || 'inferred',
            portMacCount: typeof item.portMacCount === 'number' ? item.portMacCount : (existing?.portMacCount ?? 1),
            apId: item.apId || existing?.apId,
            apName: item.apName || existing?.apName,
            ssid: item.ssid || existing?.ssid,
            vlanId: typeof item.vlanId === 'number' ? item.vlanId : (existing?.vlanId ?? 1),
            networkName: item.networkName || existing?.networkName || 'Default',
            rssi: typeof item.rssi === 'number' ? item.rssi : existing?.rssi,
            dhcpReserved: typeof item.dhcpReserved === 'boolean' ? item.dhcpReserved : (existing?.dhcpReserved ?? false),
            isProtectedAsset: typeof item.isProtectedAsset === 'boolean' ? item.isProtectedAsset : (existing?.isProtectedAsset ?? false),
            confidence: typeof item.confidence === 'number' ? item.confidence : (existing?.confidence ?? 0.95),
            evidenceSource: item.evidenceSource || 'gambinos-live-snapshot.json',
            observedFrom: item.observedFrom || existing?.observedFrom || new Date(Date.now() - 3600000).toISOString(),
            observedTo: item.observedTo || new Date().toISOString(),
            managedDeviceId: item.managedDeviceId || existing?.managedDeviceId
          };
          this.identityObservations.set(id, merged);
          observationsMerged++;
        }
        hydratedFiles.push(gambinosPath);
      }
    } catch (e) {
      console.warn('[store] hydrateUnifiFixtures warning:', (e as Error).message);
    }

    return { hydratedFiles, observationsMerged, sitesMerged };
  }

  public recordAudit(event: Omit<AuditEvent, 'id' | 'createdAt'>): AuditEvent {
    const audit: AuditEvent = {
      id: uuidv4(),
      ...event,
      createdAt: new Date().toISOString()
    };
    this.auditEvents.unshift(audit);
    if (this.auditEvents.length > 500) {
      this.auditEvents.pop();
    }
    return audit;
  }
}

export const store = new DataStore();
