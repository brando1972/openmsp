import bcrypt from 'bcryptjs';
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
  TimeEntry
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

  private initialized = false;

  constructor() {
    this.seedDefaults();
  }

  public async seedDefaults() {
    if (this.initialized) return;
    this.initialized = true;

    const orgId = '00000000-0000-0000-0000-000000000001';
    const defaultOrg: DBOrg = {
      id: orgId,
      name: 'ApexMSP Technologies',
      domain: 'apexmsp.io',
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

    // Initial Clients
    const client1: ClientTenant = {
      id: 'c-acme-corp',
      name: 'Acme Corporation',
      domain: 'acme.com',
      contactName: 'Sarah Jenkins',
      contactEmail: 'sjenkins@acme.com',
      contactPhone: '(555) 234-5678',
      sites: ['HQ - Downtown', 'Warehouse 4'],
      activeContract: 'Premium 24/7 Managed IT',
      monthlySlaTier: 'Gold 24/7',
      totalDevices: 2,
      openTickets: 1
    };
    const client2: ClientTenant = {
      id: 'c-globex',
      name: 'Globex Health',
      domain: 'globexhealth.org',
      contactName: 'Dr. Robert Chen',
      contactEmail: 'rchen@globexhealth.org',
      contactPhone: '(555) 876-5432',
      sites: ['Main Clinic', 'Annex'],
      activeContract: 'Standard Business Hours',
      monthlySlaTier: 'Silver 8/5',
      totalDevices: 1,
      openTickets: 0
    };
    this.clients.set(client1.id, client1);
    this.clients.set(client2.id, client2);

    // Initial Enrollment Token
    const defaultToken: EnrollmentToken = {
      id: uuidv4(),
      token: 'demo-enrollment-token-2026',
      orgId,
      clientId: client1.id,
      siteId: 'HQ - Downtown',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      used: false,
      createdAt: new Date().toISOString()
    };
    this.enrollmentTokens.set(defaultToken.token, defaultToken);

    // Initial Devices
    const dev1: ManagedDevice = {
      id: 'dev-win-01',
      name: 'ACME-EXEC-PC',
      hostname: 'acme-exec-pc.local',
      clientId: client1.id,
      clientName: client1.name,
      siteName: 'HQ - Downtown',
      os: 'windows',
      osVersion: 'Windows 11 Pro 23H2',
      serialNumber: '5CD2394XZ1',
      ipAddress: '192.168.1.105',
      publicIp: '198.51.100.42',
      macAddress: '00:1A:2B:3C:4D:5E',
      health: 'healthy',
      metrics: {
        cpuUsage: 18,
        ramUsage: 48,
        diskUsage: 52,
        uptimeDays: 8.4,
        lastSeen: new Date().toISOString()
      },
      rustDeskId: '948271032',
      rustDeskOnline: true,
      mdmEnrolled: true,
      encryptionStatus: 'encrypted',
      patchCompliance: 98,
      pendingPatchesCount: 0,
      installedApps: [
        { id: '1', name: 'Microsoft 365 Apps for enterprise', version: '16.0.17328.20142', publisher: 'Microsoft', installDate: '2025-01-15' },
        { id: '2', name: 'Google Chrome', version: '122.0.6261.94', publisher: 'Google LLC', installDate: '2025-02-10' }
      ],
      services: [
        { name: 'Spooler', displayName: 'Print Spooler', status: 'running', startupType: 'auto' },
        { name: 'wuauserv', displayName: 'Windows Update', status: 'running', startupType: 'auto' }
      ],
      eventLogs: [
        { id: '1', timestamp: new Date().toISOString(), level: 'info', source: 'Service Control Manager', message: 'The Print Spooler service entered the running state.', eventId: 7036 }
      ],
      tags: ['executive', 'vip', 'finance']
    };

    const dev2: ManagedDevice = {
      id: 'dev-mac-01',
      name: 'ACME-DEV-MACBOOK',
      hostname: 'acme-dev-mac.local',
      clientId: client1.id,
      clientName: client1.name,
      siteName: 'HQ - Downtown',
      os: 'macos',
      osVersion: 'macOS Sequoia 15.3',
      serialNumber: 'C02G8391MD6R',
      ipAddress: '192.168.1.112',
      publicIp: '198.51.100.42',
      macAddress: 'F4:D4:88:5A:21:9C',
      health: 'healthy',
      metrics: {
        cpuUsage: 12,
        ramUsage: 64,
        diskUsage: 38,
        uptimeDays: 14.1,
        lastSeen: new Date().toISOString()
      },
      rustDeskId: '827192044',
      rustDeskOnline: true,
      mdmEnrolled: true,
      encryptionStatus: 'encrypted',
      patchCompliance: 100,
      pendingPatchesCount: 0,
      installedApps: [
        { id: '1', name: 'Xcode', version: '16.0', publisher: 'Apple Inc.', installDate: '2025-01-10' },
        { id: '2', name: 'Docker Desktop', version: '4.35.0', publisher: 'Docker Inc.', installDate: '2025-02-01' }
      ],
      services: [
        { name: 'com.apple.sysmond', displayName: 'System Monitor Daemon', status: 'running', startupType: 'auto' }
      ],
      eventLogs: [],
      tags: ['engineering', 'developer']
    };

    this.devices.set(dev1.id, dev1);
    this.devices.set(dev2.id, dev2);

    // Initial Ticket
    const ticket1: PSATicket = {
      id: 'tick-001',
      ticketNumber: 'TICK-1001',
      title: 'Periodic print spooler crash on accounting PC',
      description: 'The local printer becomes unreachable every morning until Print Spooler is manually restarted.',
      clientId: client1.id,
      clientName: client1.name,
      deviceId: dev1.id,
      deviceName: dev1.name,
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
      aiSuggestedFix: 'Self-healing trigger created for service_stopped: Spooler'
    };
    this.tickets.set(ticket1.id, ticket1);

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
