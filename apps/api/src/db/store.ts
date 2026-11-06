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
  SecurityPolicy,
  BackupStorageVault,
  BackupPolicy,
  BackupSnapshot,
  BackupJob,
  BareMetalRecoverySession,
  BackupAgentReport,
  TaxRate,
  CatalogItem,
  BillingDocument,
  BillingPayment,
  Contract,
  CreditApplication,
  BillingSettings,
  CheckmkMonitoredHost,
  CheckmkServiceCheck,
  CheckmkActiveCheckConfig,
  CheckmkThresholdRule,
  CheckmkDowntime
} from '@openmsp/api-types';

export function defaultBillingSettings(companyName = 'ApexMSP'): BillingSettings {
  return {
    companyName,
    currency: 'USD',
    prefixes: { invoice: 'INV-', quote: 'QT-', salesOrder: 'SO-', creditNote: 'CN-', payment: 'PMT-', contract: 'CTR-' },
    nextNumbers: { invoice: 1001, quote: 1001, salesOrder: 1001, creditNote: 1001, payment: 1001, contract: 1001 },
    defaultPaymentTerms: 'net_30',
    quoteValidityDays: 30,
    defaultInvoiceNotes: 'Thank you for your business!',
    defaultQuoteNotes: 'We look forward to working with you.',
    amountVarianceThresholdPct: 25
  };
}

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

export interface TrustedOperatorMachine {
  id: string;
  name: string;
  operatorId: string;
  operatorEmail: string;
  operatorName: string;
  publicKeySpkiB64: string;
  fingerprintSha256: string;
  platform: string;
  userAgent: string;
  lastIp: string;
  status: 'active' | 'revoked';
  enrolledAt: string;
  lastHandshakeAt: string | null;
  handshakeCount: number;
}

export interface MachineHandshakeConfig {
  enforceStrictLock: boolean;
  enrollmentPin: string;
  updatedAt: string;
  updatedBy?: string;
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
  // Trusted operator machines for cryptographic remote session handshake (ECDSA P-256 + ECDH P-256)
  public trustedMachines: Map<string, TrustedOperatorMachine> = new Map();
  public machineHandshakeConfig: MachineHandshakeConfig = {
    enforceStrictLock: false,
    enrollmentPin: 'APEX-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    updatedAt: new Date().toISOString()
  };
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

  // ---- ApexVault Backup, Deduplication, Snapshots & Bare-Metal Recovery ----
  public backupVaults: Map<string, BackupStorageVault> = new Map();
  public backupPolicies: Map<string, BackupPolicy> = new Map();
  public backupSnapshots: Map<string, BackupSnapshot> = new Map();
  public backupJobs: Map<string, BackupJob> = new Map();
  public bareMetalSessions: Map<string, BareMetalRecoverySession> = new Map();
  public deviceBackupReports: Map<string, BackupAgentReport> = new Map();

  // ---- Client Management & Billing ----
  public taxRates: Map<string, TaxRate> = new Map();
  public catalogItems: Map<string, CatalogItem> = new Map();
  public billingDocuments: Map<string, BillingDocument> = new Map();
  public billingPayments: Map<string, BillingPayment> = new Map();
  public contracts: Map<string, Contract> = new Map();
  public creditApplications: Map<string, CreditApplication> = new Map();
  public billingSettings: BillingSettings = defaultBillingSettings();

  // ---- Checkmk Infrastructure & Service Monitoring ----
  public monitoredHosts: Map<string, CheckmkMonitoredHost> = new Map();
  public serviceChecks: Map<string, CheckmkServiceCheck> = new Map();
  public activeChecks: Map<string, CheckmkActiveCheckConfig> = new Map();
  public thresholdRules: Map<string, CheckmkThresholdRule> = new Map();
  public downtimes: Map<string, CheckmkDowntime> = new Map();
  private backupJobSeq = 1001;

  public nextBackupJobNumber(): string {
    for (const j of this.backupJobs.values()) {
      const n = parseInt((j.jobNumber || '').replace(/\D/g, ''), 10);
      if (Number.isFinite(n) && n >= this.backupJobSeq) this.backupJobSeq = n + 1;
    }
    return `BKP-${this.backupJobSeq++}`;
  }

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
    'tickets', 'automations', 'patches', 'vaultItems', 'rustDeskSessions', 'mdmClients', 'meshNodes', 'meshNodeClients', 'trustedMachines', 'netScan',
    'dispatchJobs', 'jobMessages', 'techLocations', 'techShifts',
    'stagedApps', 'deviceStagedDeployments',
    'securityPostures', 'identityObservations', 'securityDetections',
    'securityIncidents', 'securityActions', 'unifiSites', 'securityPolicies',
    'backupVaults', 'backupPolicies', 'backupSnapshots', 'backupJobs', 'bareMetalSessions', 'deviceBackupReports',
    'taxRates', 'catalogItems', 'billingDocuments', 'billingPayments', 'contracts', 'creditApplications',
    'monitoredHosts', 'serviceChecks', 'activeChecks', 'thresholdRules', 'downtimes'
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
    if (this.securityPolicies.size === 0) {
      this.seedSecurityAndUnifiDefaults();
    }
    if (this.backupVaults.size === 0) {
      this.seedBackupDefaults();
    }
    this.reconcileLiveBackupVaults();
    this.reconcileSupabaseOperators();
    this.purgeSeededData();
    this.seedBillingDefaults();
    this.startPersistence();
  }

  /** Billing settings, a placeholder tax rate and a starter catalog (runs even after hydrate; never seeds documents). */
  public seedBillingDefaults(): void {
    const orgName = Array.from(this.orgs.values())[0]?.settings?.companyName || 'ApexMSP';
    const defaults = defaultBillingSettings(orgName);
    const cur = this.billingSettings || defaults;
    this.billingSettings = {
      ...defaults,
      ...cur,
      companyName: cur.companyName || orgName,
      prefixes: { ...defaults.prefixes, ...(cur.prefixes || {}) },
      nextNumbers: { ...defaults.nextNumbers, ...(cur.nextNumbers || {}) }
    };
    if (this.taxRates.size === 0) {
      const id = 'tax-default';
      this.taxRates.set(id, { id, name: 'Sales Tax', ratePct: 8.25, isDefault: true, active: true });
    }
    if (this.catalogItems.size === 0) {
      const now = new Date().toISOString();
      const items: Array<Omit<CatalogItem, 'id' | 'createdAt' | 'updatedAt' | 'active'>> = [
        { sku: 'MS-WKS', name: 'Managed Workstation', description: 'RMM, patching, AV/EDR and helpdesk per workstation', type: 'per_device', unit: 'device', unitPrice: 45, cost: 12, taxable: false },
        { sku: 'MS-SRV', name: 'Managed Server', description: 'Proactive monitoring, patching and backup oversight per server', type: 'per_device', unit: 'device', unitPrice: 150, cost: 40, taxable: false },
        { sku: 'M365-BP', name: 'Microsoft 365 Business', description: 'Microsoft 365 Business license, per user / month', type: 'per_user', unit: 'user', unitPrice: 22, cost: 18, taxable: true },
        { sku: 'LAB-REM', name: 'Remote Labor', description: 'Remote technical support, per hour', type: 'labor', unit: 'hr', unitPrice: 125, taxable: false },
        { sku: 'LAB-ONS', name: 'Onsite Labor', description: 'Onsite technical support, per hour', type: 'labor', unit: 'hr', unitPrice: 150, taxable: false },
        { sku: 'BKP-DEV', name: 'Backup', description: 'Cloud backup per protected device / month', type: 'per_device', unit: 'device', unitPrice: 15, cost: 5, taxable: false },
        { sku: 'FW-MGMT', name: 'Firewall Management', description: 'Firewall monitoring, updates and rule management / month', type: 'service', unit: 'mo', unitPrice: 99, taxable: false },
        { sku: 'HW-UNIFI-U7', name: 'UniFi U7 Pro Access Point', description: 'Ubiquiti UniFi U7 Pro WiFi 7 access point (hardware)', type: 'product', unit: 'ea', unitPrice: 229, cost: 189, taxable: true }
      ];
      for (const it of items) {
        const id = `item-${uuidv4().substring(0, 8)}`;
        this.catalogItems.set(id, { ...it, id, active: true, createdAt: now, updatedAt: now });
      }
    }
  }

  private reconcileSupabaseOperators(): void {
    const orgId = '00000000-0000-0000-0000-000000000001';
    const orgName = 'ApexMSP';
    const operators: Array<{ id: string; email: string; fullName: string; role: DBUser['role'] }> = [
      {
        id: 'b62c2ec1-fef6-41bf-b96b-79fd975fad35',
        email: 'brandon@apexmsp.com',
        fullName: 'Brandon Ray',
        role: 'owner'
      },
      {
        id: 'c5358efb-7c21-464b-ac14-ba3270a65eec',
        email: 'brandon@southerntechsupport.com',
        fullName: 'Brandon Ray',
        role: 'owner'
      },
      {
        id: '57f71c5a-7475-4661-8c58-f62bedd5e046',
        email: 'brandon@apexmsp.app',
        fullName: 'Brandon Ray',
        role: 'owner'
      }
    ];
    for (const op of operators) {
      if (!this.users.has(op.id)) {
        const salt = bcrypt.genSaltSync(10);
        this.users.set(op.id, {
          id: op.id,
          email: op.email,
          passwordHash: bcrypt.hashSync('ApexMSP!2026#Secure', salt),
          fullName: op.fullName,
          role: op.role,
          orgId,
          orgName,
          createdAt: new Date().toISOString()
        });
      }
    }
  }

  private reconcileLiveBackupVaults(): void {
    const unifi = this.backupVaults.get('vault-unifi-nas-01');
    if (unifi) {
      unifi.unifiNasIp = '192.168.4.161';
      unifi.description = 'High-speed local LAN 10GbE NFSv4.1 content-addressable deduplicated vault hosted on UniFi UNAS Pro (192.168.4.161) via Proxmox Kopia Repository Server with zero-trust append-only client tokens.';
      this.backupVaults.set(unifi.id, unifi);
    }
    const b2 = this.backupVaults.get('vault-b2-cloud-01');
    if (b2) {
      b2.name = 'Backblaze B2 — Immutable 3-2-1 Offsite Archive (US-East-005)';
      b2.description = 'Live Backblaze B2 (APEXBckUp • Vaultwarden 580ad0cc) S3-compatible WORM Object Lock COMPLIANCE archive (bucketId: 5c5ee571eeb788efa61c0c1c) with restricted write-only tenant application keys.';
      b2.endpointUrl = 'https://s3.us-east-005.backblazeb2.com';
      b2.region = 'us-east-005';
      b2.b2BucketName = 'apexmsp-immutable-vault-prod';
      b2.b2KeyId = '005ce51e78f6ccc0000000002';
      this.backupVaults.set(b2.id, b2);
    }
    if (!this.vaultItems.has('v-b2-apexbckup')) {
      this.vaultItems.set('v-b2-apexbckup', {
        id: 'v-b2-apexbckup',
        clientId: 'c-brandon-ray',
        clientName: 'Brandon Ray',
        folder: 'Cloud Backup & Disaster Recovery',
        type: 'server_credential',
        title: 'BackBlaze B2 — APEXBckUp Master Application Key',
        username: '005ce51e78f6ccc0000000002',
        password: '••••••••••••',
        url: 'https://s3.us-east-005.backblazeb2.com',
        notes: 'Synced from Vaultwarden (vault.devguru.app item 580ad0cc-a06c-46b3-a720-63a78719f644). Bucket: apexmsp-immutable-vault-prod (5c5ee571eeb788efa61c0c1c) with S3 Object Lock enabled.',
        favorite: true,
        strengthScore: 98,
        lastModified: new Date().toISOString()
      });
    }
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
      if (snap.billingSettings && typeof snap.billingSettings === 'object') this.billingSettings = snap.billingSettings;
      if (snap.machineHandshakeConfig) this.machineHandshakeConfig = snap.machineHandshakeConfig;
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
      snap.billingSettings = this.billingSettings;
      snap.machineHandshakeConfig = this.machineHandshakeConfig;
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
      totalDevices: 0,
      openTickets: 0
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
      executionsCount: 0,
      successRate: 100
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
      executionsCount: 0,
      successRate: 100
    };
    this.automations.set(rule1.id, rule1);
    this.automations.set(rule2.id, rule2);

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
    this.seedBackupDefaults();
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
        macos: `SW_MAJOR=$(sw_vers -productVersion 2>/dev/null | cut -d. -f1); if [ "\${SW_MAJOR:-10}" -ge 11 ] && [ ! -d /usr/local/mesh_services/meshagent ]; then MESH_ID=29; [ "$(uname -m)" = "x86_64" ] && MESH_ID=16; TMP_DIR="/tmp/meshagent_$$"; mkdir -p "$TMP_DIR"; if curl -fsSL "https://mesh.apexmsp.app/meshosxagent?id=\${MESH_ID}&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib" -o "$TMP_DIR/MeshAgent.zip"; then unzip -qo "$TMP_DIR/MeshAgent.zip" -d "$TMP_DIR" 2>/dev/null && [ -f "$TMP_DIR/MeshAgent.pkg" ] && installer -pkg "$TMP_DIR/MeshAgent.pkg" -target / 2>/dev/null; fi; rm -rf "$TMP_DIR"; fi`
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
    const gambinosSiteId = '88f7af54-98f8-306a-a1c7-c9349722b1f6';

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
        totalDevices: 0,
        openTickets: 0
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
        totalDevices: 0,
        openTickets: 0
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
        totalDevices: 0,
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
        totalDevices: 0,
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
        totalDevices: 0,
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
        totalDevices: 0,
        openTickets: 0
      }
    ];

    for (const c of clientsToSeed) {
      if (!this.clients.has(c.id)) {
        this.clients.set(c.id, c);
      }
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
        autoIsolateWorkstationsOnCritical: false,
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
  }

  public hydrateUnifiFixtures(): { hydratedFiles: string[]; observationsMerged: number; sitesMerged: number } {
    return { hydratedFiles: [], observationsMerged: 0, sitesMerged: 0 };
  }

  public seedBackupDefaults() {
    const orgId = Array.from(this.orgs.values())[0]?.id || '00000000-0000-0000-0000-000000000001';
    const now = Date.now();
    const iso = (msOffset = 0) => new Date(now + msOffset).toISOString();
    const TB = 1024 ** 4;

    const vaultUnifi: BackupStorageVault = {
      id: 'vault-unifi-nas-01',
      orgId,
      name: 'UniFi UNAS Pro — Primary 10GbE Vault (Proxmox Kopia Gateway)',
      description: 'High-speed local LAN 10GbE NFSv4.1 content-addressable deduplicated vault hosted on UniFi UNAS Pro (192.168.4.161) via Proxmox Kopia Repository Server with zero-trust append-only client tokens.',
      backendType: 'unifi_nas_kopia',
      endpointUrl: 'https://backup-gw.apexmsp.app:51515',
      region: 'LAN-10GbE-Primary',
      unifiNasIp: '192.168.4.161',
      unifiNfsExport: '/volume1/.srv/.unifi-drive/ApexVault-Backups/.data',
      immutableObjectLock: true,
      immutableLockMode: 'COMPLIANCE',
      immutableRetentionDays: 30,
      appendOnlyEnforced: true,
      encryptionAlgorithm: 'AES256-GCM-HMAC-SHA256',
      chunkSplitter: 'DYNAMIC-4M-BUZHASH',
      compressionAlgorithm: 'zstd',
      capacityBytes: Math.round(32 * TB),
      logicalProtectedBytes: 0,
      storedDeduplicatedBytes: 0,
      dedupRatio: 1,
      online: true,
      connectedAgentsCount: 0,
      totalSnapshotsCount: 0,
      createdAt: iso(-86400000 * 60),
      updatedAt: iso(0)
    };

    const vaultB2: BackupStorageVault = {
      id: 'vault-b2-cloud-01',
      orgId,
      name: 'Backblaze B2 — Immutable 3-2-1 Offsite Archive (US-East-005)',
      description: 'Live Backblaze B2 (APEXBckUp • Vaultwarden 580ad0cc) S3-compatible WORM Object Lock COMPLIANCE archive (bucketId: 5c5ee571eeb788efa61c0c1c) with restricted write-only tenant application keys.',
      backendType: 'backblaze_b2',
      endpointUrl: 'https://s3.us-east-005.backblazeb2.com',
      region: 'us-east-005',
      b2BucketName: 'apexmsp-immutable-vault-prod',
      b2KeyId: '005ce51e78f6ccc0000000002',
      b2ApplicationKeyRestricted: true,
      immutableObjectLock: true,
      immutableLockMode: 'COMPLIANCE',
      immutableRetentionDays: 30,
      appendOnlyEnforced: true,
      encryptionAlgorithm: 'AES256-GCM-HMAC-SHA256',
      chunkSplitter: 'DYNAMIC-4M-BUZHASH',
      compressionAlgorithm: 'zstd',
      capacityBytes: Math.round(100 * TB),
      logicalProtectedBytes: 0,
      storedDeduplicatedBytes: 0,
      dedupRatio: 1,
      online: true,
      connectedAgentsCount: 0,
      totalSnapshotsCount: 0,
      createdAt: iso(-86400000 * 60),
      updatedAt: iso(0)
    };

    this.backupVaults.set(vaultUnifi.id, vaultUnifi);
    this.backupVaults.set(vaultB2.id, vaultB2);

    const policies: BackupPolicy[] = [
      {
        id: 'pol-backup-files-dedup',
        orgId,
        clientId: 'c-brandon-ray',
        clientName: 'Brandon Ray',
        siteId: 'Primary',
        name: 'Workstation File & Object Dedup (Hourly -> UniFi NAS + B2)',
        enabled: true,
        mode: 'file_object_dedup',
        targetOs: 'all',
        scheduleCron: '0 * * * *',
        scheduleLabel: 'Every Hour on the Hour',
        primaryVaultId: 'vault-unifi-nas-01',
        replicateToCloudVaultId: 'vault-b2-cloud-01',
        includePaths: [
          'C:\\Users',
          'C:\\QuickBooksData',
          '/Users',
          '/etc',
          '/var/lib/kwickpos'
        ],
        excludePatterns: [
          '**/node_modules/**',
          '**/.git/objects/**',
          '**/AppData/Local/Temp/**',
          '**/Caches/**',
          '*.tmp',
          'pagefile.sys',
          'hiberfil.sys'
        ],
        enableWindowsVss: false,
        enableApfsSnapshot: false,
        enableLvmSnapshot: false,
        capturePartitionTable: false,
        captureEfiBootloader: false,
        compressionAlgorithm: 'zstd',
        bandwidthLimitMbps: 500,
        retention: {
          latest: 48,
          hourly: 24,
          daily: 30,
          weekly: 12,
          monthly: 24,
          annual: 7
        },
        immutableLockDays: 30,
        autoVerifyWeekly: true,
        assignedDeviceIds: [],
        updatedAt: iso(-3600000 * 6)
      },
      {
        id: 'pol-backup-vss-snapshot',
        orgId,
        clientId: 'c-gambinos',
        clientName: 'Gambinos',
        siteId: '88f7af54-98f8-306a-a1c7-c9349722b1f6',
        name: 'Executive & POS Atomic Volume Snapshot (VSS / APFS)',
        enabled: true,
        mode: 'volume_snapshot_vss',
        targetOs: 'all',
        scheduleCron: '0 */4 * * *',
        scheduleLabel: 'Every 4 Hours (Atomic VSS/APFS Freeze)',
        primaryVaultId: 'vault-unifi-nas-01',
        replicateToCloudVaultId: 'vault-b2-cloud-01',
        includePaths: [
          'C:\\Users',
          'C:\\ProgramData\\ApexMSP',
          'C:\\POSDatabase',
          '/Users',
          '/opt/kwickpos',
          '/var/lib/mysql'
        ],
        excludePatterns: [
          '**/Temp/**',
          '**/Caches/**',
          '*.swap'
        ],
        enableWindowsVss: true,
        enableApfsSnapshot: true,
        enableLvmSnapshot: true,
        capturePartitionTable: true,
        captureEfiBootloader: false,
        compressionAlgorithm: 'zstd',
        bandwidthLimitMbps: 1000,
        retention: {
          latest: 24,
          hourly: 12,
          daily: 30,
          weekly: 12,
          monthly: 12,
          annual: 5
        },
        immutableLockDays: 30,
        autoVerifyWeekly: true,
        assignedDeviceIds: [],
        updatedAt: iso(-3600000 * 4)
      },
      {
        id: 'pol-backup-baremetal',
        orgId,
        clientId: 'c-municipality',
        clientName: 'Municipal Client (City Hall & Public Safety)',
        siteId: 'muni-city-hall',
        name: 'Critical Server & Executive Bare-Metal Image (VHDX + EFI/GPT)',
        enabled: true,
        mode: 'bare_metal_image',
        targetOs: 'windows',
        scheduleCron: '0 2 * * *',
        scheduleLabel: 'Nightly at 02:00 AM + Pre-Patch Trigger',
        primaryVaultId: 'vault-unifi-nas-01',
        replicateToCloudVaultId: 'vault-b2-cloud-01',
        includePaths: [
          '\\\\?\\Volume{EFI-SYSTEM}',
          'C:\\',
          'D:\\CAD_Database'
        ],
        excludePatterns: [
          'pagefile.sys',
          'hiberfil.sys',
          'swapfile.sys'
        ],
        enableWindowsVss: true,
        enableApfsSnapshot: true,
        enableLvmSnapshot: true,
        capturePartitionTable: true,
        captureEfiBootloader: true,
        compressionAlgorithm: 'zstd',
        bandwidthLimitMbps: 2500,
        retention: {
          latest: 14,
          hourly: 0,
          daily: 14,
          weekly: 8,
          monthly: 12,
          annual: 7
        },
        immutableLockDays: 30,
        autoVerifyWeekly: true,
        assignedDeviceIds: [],
        updatedAt: iso(-3600000 * 2)
      }
    ];

    for (const p of policies) {
      this.backupPolicies.set(p.id, p);
    }

    // Ensure Vaultwarden BackBlaze B2 reference item is present in OpenMSP Vault
    this.vaultItems.set('v-b2-apexbckup', {
      id: 'v-b2-apexbckup',
      clientId: 'c-brandon-ray',
      clientName: 'Brandon Ray',
      folder: 'Cloud Backup & Disaster Recovery',
      type: 'server_credential',
      title: 'BackBlaze B2 — APEXBckUp Master Application Key',
      username: '005ce51e78f6ccc0000000002',
      password: '••••••••••••',
      url: 'https://s3.us-east-005.backblazeb2.com',
      notes: 'Synced from Vaultwarden (vault.devguru.app item 580ad0cc-a06c-46b3-a720-63a78719f644). Bucket: apexmsp-immutable-vault-prod (5c5ee571eeb788efa61c0c1c) with S3 Object Lock enabled.',
      favorite: true,
      strengthScore: 98,
      lastModified: iso(0)
    });
  }

  public purgeSeededData(): void {
    const seededDevices = [
      'dev-gambinos-pos-ctrl',
      'dev-gambinos-bo-pc',
      'dev-muni-cad-01',
      'dev-raytreat-clin-01',
      'dev-tbi-pos-srv',
      'dev-win-01'
    ];
    for (const id of seededDevices) {
      this.devices.delete(id);
      this.securityPostures.delete(id);
      this.deviceBackupReports.delete(id);
    }

    // Remove any securityPostures generated by old defaultSensors seed loop
    for (const [devId, posture] of this.securityPostures.entries()) {
      const hasSeededWazuh = Array.isArray(posture?.sensors) && posture.sensors.some(
        (s) => s.provider === 'wazuh' && s.version === '4.9.2' && s.signatureVersion === 'ruleset-2026.10'
      );
      if (hasSeededWazuh || !this.devices.has(devId)) {
        this.securityPostures.delete(devId);
        const dev = this.devices.get(devId);
        if (dev && (dev as any).securityPosture) {
          const dHasSeeded = Array.isArray((dev as any).securityPosture?.sensors) && (dev as any).securityPosture.sensors.some(
            (s: any) => s.provider === 'wazuh' && s.version === '4.9.2' && s.signatureVersion === 'ruleset-2026.10'
          );
          if (dHasSeeded) {
            delete (dev as any).securityPosture;
            this.devices.set(devId, dev);
          }
        }
      }
    }

    const seededTickets = [
      'tick-001',
      'tick-sec-1002',
      'tick-cd29af2e',
      'tick-8316df0a',
      'tick-feb13507',
      'tick-e30ae7c8'
    ];
    for (const id of seededTickets) {
      this.tickets.delete(id);
    }

    for (const id of ['patch-kb5034441', 'patch-macos-15-3-1']) {
      this.patches.delete(id);
    }

    this.vaultItems.delete('v-001');

    const seededDetections = new Set([
      'det-gmb-001',
      'det-gmb-002',
      'det-gmb-003',
      'det-5bf5e96f',
      'det-17d9d8f0',
      'det-5c88286f',
      'det-9ce84f3b'
    ]);
    for (const id of Array.from(this.securityDetections.keys())) {
      if (seededDetections.has(id) || id.startsWith('det-gmb-') || id.startsWith('det-sim-')) {
        this.securityDetections.delete(id);
      }
    }

    for (const id of Array.from(this.securityIncidents.keys())) {
      if (id === 'inc-gmb-1001' || id.startsWith('inc-gmb-') || id.startsWith('inc-sim-')) {
        this.securityIncidents.delete(id);
      }
    }

    for (const id of Array.from(this.securityActions.keys())) {
      if (
        id === 'act-gmb-isolate-bo' ||
        id === 'act-gmb-blocked-port43' ||
        id.startsWith('act-gmb-') ||
        id.startsWith('act-sim-')
      ) {
        this.securityActions.delete(id);
      }
    }

    for (const id of Array.from(this.identityObservations.keys())) {
      if (
        id.startsWith('obs-gmb-') ||
        id.startsWith('obs-muni-') ||
        id.startsWith('obs-live-') ||
        id.startsWith('obs-sim-')
      ) {
        this.identityObservations.delete(id);
      }
    }

    const seededUnifiSites = [
      '88f7af54-98f8-306a-a1c7-c9349722b1f6',
      'Primary',
      'Raytreat-HQ',
      'TBI-Main',
      'SOS-Complex',
      'muni-city-hall'
    ];
    for (const siteId of seededUnifiSites) {
      this.unifiSites.delete(siteId);
    }

    const seededSnapshots = new Set([
      'snap-win01-baremetal-001',
      'snap-mac01-apfs-002',
      'snap-gambinos-pos-003',
      'snap-gambinos-bopc-004',
      'snap-muni-cad-005',
      'snap-tbi-pos-006'
    ]);
    for (const id of seededSnapshots) {
      this.backupSnapshots.delete(id);
    }

    for (const id of ['job-bkp-1001', 'job-bkp-1002', 'job-bkp-1003']) {
      this.backupJobs.delete(id);
    }

    this.bareMetalSessions.delete('bmr-session-001');

    for (const [devId, report] of this.deviceBackupReports.entries()) {
      if (!this.devices.has(devId) || (report.lastSnapshotId && seededSnapshots.has(report.lastSnapshotId))) {
        this.deviceBackupReports.delete(devId);
      }
    }

    for (const [polId, pol] of this.backupPolicies.entries()) {
      if (Array.isArray(pol.assignedDeviceIds)) {
        pol.assignedDeviceIds = pol.assignedDeviceIds.filter((id) => this.devices.has(id) && !seededDevices.includes(id));
        this.backupPolicies.set(polId, pol);
      }
    }

    // Recompute backupVaults metrics from real remaining snapshots and agent reports
    const allSnaps = Array.from(this.backupSnapshots.values());
    const logicalSum = allSnaps.reduce((acc, s) => acc + (s.logicalBytes || 0), 0);
    const dedupSum = allSnaps.reduce((acc, s) => acc + (s.storedDeduplicatedBytes || 0), 0);
    const connectedCount = Array.from(this.deviceBackupReports.values()).filter((r) => r.repositoryConnected).length;
    for (const [vId, v] of this.backupVaults.entries()) {
      const vaultSnaps = v.backendType === 'backblaze_b2'
        ? allSnaps.filter((s) => s.replicatedToB2 || s.vaultId === v.id)
        : allSnaps.filter((s) => s.vaultId === v.id);
      v.totalSnapshotsCount = vaultSnaps.length;
      v.logicalProtectedBytes = vaultSnaps.length > 0 ? logicalSum : 0;
      v.storedDeduplicatedBytes = vaultSnaps.length > 0 ? dedupSum : 0;
      v.dedupRatio = v.storedDeduplicatedBytes > 0 ? Number((v.logicalProtectedBytes / v.storedDeduplicatedBytes).toFixed(2)) : 1;
      v.connectedAgentsCount = connectedCount;
      if (vaultSnaps.length === 0) {
        delete v.lastSyncToCloudAt;
        delete v.lastVerifiedAt;
      }
      this.backupVaults.set(vId, v);
    }

    // Reset seeded automation counters if no real logs exist
    if (this.automationLogs.length === 0) {
      for (const [rId, rule] of this.automations.entries()) {
        if ((rId === 'rule-spooler-restart' && rule.executionsCount === 3) || (rId === 'rule-disk-alert' && rule.executionsCount === 1)) {
          rule.executionsCount = 0;
          delete rule.lastExecuted;
          this.automations.set(rId, rule);
        }
      }
    }

    // Recompute client device and open ticket counts from real remaining records
    for (const [cId, client] of this.clients.entries()) {
      const devCount = Array.from(this.devices.values()).filter((d) => d.clientId === cId).length;
      const openTickCount = Array.from(this.tickets.values()).filter(
        (t) => t.clientId === cId && t.status !== 'resolved' && t.status !== 'closed'
      ).length;
      client.totalDevices = devCount;
      client.openTickets = openTickCount;
      this.clients.set(cId, client);
    }

    this.persist();
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
