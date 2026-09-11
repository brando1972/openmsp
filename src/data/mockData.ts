import { 
  ManagedDevice,
  ClientTenant,
  PatchItem,
  SelfHealingRule,
  AutomationExecutionLog,
  PSATicket,
  VaultItem,
  RustDeskServerConfig,
  WhiteLabelConfig,
  AICopilotMessage
} from '../types';

export const INITIAL_CLIENTS: ClientTenant[] = [
  {
    id: 'client-1',
    name: 'Apex Financial Technologies',
    domain: 'apexfintech.io',
    contactName: 'Sarah Jenkins',
    contactEmail: 's.jenkins@apexfintech.io',
    contactPhone: '+1 (555) 019-2834',
    sites: ['Headquarters - NYC', 'Branch Office - Chicago'],
    activeContract: 'Enterprise Managed IT & Cyber Defense',
    monthlySlaTier: 'Gold 24/7',
    totalDevices: 42,
    openTickets: 3
  },
  {
    id: 'client-2',
    name: 'Nexus BioHealth Laboratories',
    domain: 'nexusbiohealth.com',
    contactName: 'Dr. Marcus Vance',
    contactEmail: 'mvance@nexusbiohealth.com',
    contactPhone: '+1 (555) 014-9921',
    sites: ['Research Hub - Boston', 'Lab Site B - Cambridge'],
    activeContract: 'HIPAA Complete Managed Endpoint',
    monthlySlaTier: 'Gold 24/7',
    totalDevices: 28,
    openTickets: 1
  },
  {
    id: 'client-3',
    name: 'Vanguard Logistics & Supply',
    domain: 'vanguardlogistics.net',
    contactName: 'David Miller',
    contactEmail: 'dmiller@vanguardlogistics.net',
    contactPhone: '+1 (555) 017-4480',
    sites: ['Distribution Center - Atlanta'],
    activeContract: 'Standard Infrastructure Support',
    monthlySlaTier: 'Silver 8/5',
    totalDevices: 65,
    openTickets: 4
  }
];

export const INITIAL_DEVICES: ManagedDevice[] = [
  {
    id: 'dev-101',
    name: 'NYC-DC-SRV01',
    hostname: 'NYC-DC-SRV01.apex.local',
    clientId: 'client-1',
    clientName: 'Apex Financial Technologies',
    siteName: 'Headquarters - NYC',
    os: 'windows',
    osVersion: 'Windows Server 2022 Standard (Build 20348)',
    serialNumber: 'VMw-994821-X',
    ipAddress: '192.168.10.15',
    publicIp: '64.233.160.1',
    macAddress: '00:15:5D:01:A4:B2',
    health: 'healthy',
    metrics: {
      cpuUsage: 24,
      ramUsage: 68,
      diskUsage: 52,
      uptimeDays: 142,
      lastSeen: 'Just now'
    },
    rustDeskId: '829104712',
    rustDeskOnline: true,
    mdmEnrolled: true,
    encryptionStatus: 'encrypted',
    encryptionKey: '481920-104829-192048-819204-583019-948201',
    patchCompliance: 98,
    pendingPatchesCount: 1,
    installedApps: [
      { id: 'app-1', name: 'CrowdStrike Falcon Sensor', version: '7.12.1802', publisher: 'CrowdStrike', installDate: '2024-01-15' },
      { id: 'app-2', name: 'ApexMSP RMM Agent', version: '4.2.1', publisher: 'ApexMSP', installDate: '2024-02-01' },
      { id: 'app-3', name: 'RustDesk Remote Server Agent', version: '1.3.1', publisher: 'RustDesk', installDate: '2024-02-01' }
    ],
    services: [
      { name: 'NTDS', displayName: 'Active Directory Domain Services', status: 'running', startupType: 'auto' },
      { name: 'DNS', displayName: 'DNS Server', status: 'running', startupType: 'auto' },
      { name: 'RustDeskService', displayName: 'RustDesk Remote Desktop Service', status: 'running', startupType: 'auto' }
    ],
    eventLogs: [
      { id: 'log-1', timestamp: '10:14 AM', level: 'info', source: 'Security-Auditing', message: 'User logon succeeded for AD\\s.jenkins', eventId: 4624 },
      { id: 'log-2', timestamp: '08:00 AM', level: 'info', source: 'ApexRMM', message: 'Health telemetry report dispatched successfully', eventId: 100 }
    ],
    tags: ['Domain Controller', 'Core Infrastructure', 'Production']
  },
  {
    id: 'dev-102',
    name: 'BOS-MAC-DEV04',
    hostname: 'BOS-MAC-DEV04.local',
    clientId: 'client-2',
    clientName: 'Nexus BioHealth Laboratories',
    siteName: 'Research Hub - Boston',
    os: 'macos',
    osVersion: 'macOS Sonoma 14.5 (Build 23F79)',
    serialNumber: 'C02GX921MD6T',
    ipAddress: '10.0.20.88',
    publicIp: '198.51.100.42',
    macAddress: 'A4:83:E7:91:20:C4',
    health: 'warning',
    metrics: {
      cpuUsage: 91,
      ramUsage: 89,
      diskUsage: 94,
      uptimeDays: 32,
      lastSeen: '1 min ago'
    },
    rustDeskId: '918237401',
    rustDeskOnline: true,
    mdmEnrolled: true,
    encryptionStatus: 'encrypted',
    encryptionKey: 'FileVault2-98402-A8D19-FF82-0192',
    patchCompliance: 82,
    pendingPatchesCount: 4,
    installedApps: [
      { id: 'app-10', name: 'Xcode', version: '15.3', publisher: 'Apple Inc.', installDate: '2023-11-10' },
      { id: 'app-11', name: 'Docker Desktop', version: '4.28.0', publisher: 'Docker', installDate: '2024-03-12' },
      { id: 'app-12', name: 'ApexMSP Mac Daemon', version: '4.2.1', publisher: 'ApexMSP', installDate: '2024-01-20' }
    ],
    services: [
      { name: 'com.apple.FileVault', displayName: 'FileVault Encryption Engine', status: 'running', startupType: 'auto' },
      { name: 'com.rustdesk.rustdesk', displayName: 'RustDesk Client Daemon', status: 'running', startupType: 'auto' }
    ],
    eventLogs: [
      { id: 'log-10', timestamp: '10:30 AM', level: 'warning', source: 'kernel', message: 'Disk space critical: less than 5% free on /System/Volumes/Data', eventId: 501 },
      { id: 'log-11', timestamp: '10:28 AM', level: 'warning', source: 'activitymonitor', message: 'High CPU pressure detected (PID 1842 - Docker Desktop)', eventId: 302 }
    ],
    tags: ['Developer Workstation', 'High Memory', 'macOS MDM']
  },
  {
    id: 'dev-103',
    name: 'ATL-W11-EXEC01',
    hostname: 'ATL-W11-EXEC01.vanguard.com',
    clientId: 'client-3',
    clientName: 'Vanguard Logistics & Supply',
    siteName: 'Distribution Center - Atlanta',
    os: 'windows',
    osVersion: 'Windows 11 Pro 23H2 (Build 22631.3593)',
    serialNumber: '5CG2491XLP',
    ipAddress: '172.16.50.112',
    publicIp: '203.0.113.19',
    macAddress: '3C:7C:3F:82:11:D9',
    health: 'critical',
    metrics: {
      cpuUsage: 98,
      ramUsage: 96,
      diskUsage: 78,
      uptimeDays: 8,
      lastSeen: 'Just now'
    },
    rustDeskId: '772910481',
    rustDeskOnline: true,
    mdmEnrolled: true,
    encryptionStatus: 'encrypted',
    encryptionKey: '109284-820194-019284-910284-819204-019284',
    patchCompliance: 65,
    pendingPatchesCount: 8,
    installedApps: [
      { id: 'app-20', name: 'Microsoft 365 Apps', version: '16.0.17328', publisher: 'Microsoft', installDate: '2023-09-01' },
      { id: 'app-21', name: 'ApexMSP RMM Agent', version: '4.1.9', publisher: 'ApexMSP', installDate: '2023-09-01' }
    ],
    services: [
      { name: 'Spooler', displayName: 'Print Spooler', status: 'stopped', startupType: 'auto' },
      { name: 'WinDefend', displayName: 'Microsoft Defender Antivirus', status: 'running', startupType: 'auto' }
    ],
    eventLogs: [
      { id: 'log-20', timestamp: '10:45 AM', level: 'error', source: 'Service Control Manager', message: 'The Print Spooler service terminated unexpectedly.', eventId: 7031 },
      { id: 'log-21', timestamp: '10:40 AM', level: 'error', source: 'Resource-Policy', message: 'CPU resource utilization surpassed 95% threshold for 15 mins', eventId: 9002 }
    ],
    tags: ['Executive', 'VIP Client', 'Spooler Fault']
  },
  {
    id: 'dev-104',
    name: 'NYC-FW-PUD01',
    hostname: 'pfsense-nyc.apex.local',
    clientId: 'client-1',
    clientName: 'Apex Financial Technologies',
    siteName: 'Headquarters - NYC',
    os: 'network',
    osVersion: 'pfSense Enterprise CE 2.7.2',
    serialNumber: 'NET-PFS-8812',
    ipAddress: '192.168.10.1',
    publicIp: '64.233.160.1',
    macAddress: '00:08:A2:09:FF:11',
    health: 'healthy',
    metrics: {
      cpuUsage: 12,
      ramUsage: 31,
      diskUsage: 18,
      uptimeDays: 210,
      lastSeen: 'Just now'
    },
    rustDeskId: 'N/A',
    rustDeskOnline: false,
    mdmEnrolled: false,
    encryptionStatus: 'decrypted',
    patchCompliance: 100,
    pendingPatchesCount: 0,
    installedApps: [],
    services: [
      { name: 'unbound', displayName: 'Unbound DNS Resolver', status: 'running', startupType: 'auto' },
      { name: 'openvpn', displayName: 'OpenVPN Server Daemon', status: 'running', startupType: 'auto' }
    ],
    eventLogs: [
      { id: 'log-30', timestamp: '09:12 AM', level: 'info', source: 'SNMP', message: 'Interface igb0 link speed set to 1000Mbps Full-Duplex', eventId: 1001 }
    ],
    tags: ['SNMP Managed', 'Firewall', 'Core Gateway']
  }
];

export const INITIAL_PATCHES: PatchItem[] = [
  {
    id: 'patch-1',
    kbArticle: 'KB5036893',
    title: '2024-04 Cumulative Update for Windows 11 Version 23H2 for x64-based Systems',
    severity: 'critical',
    category: 'Security',
    targetOs: 'windows',
    releaseDate: '2024-04-09',
    approved: true,
    affectedDevicesCount: 14,
    installedDevicesCount: 11
  },
  {
    id: 'patch-2',
    kbArticle: 'KB5037000',
    title: 'Security Update for Windows Server 2022 Remote Desktop Services Vulnerability',
    severity: 'critical',
    category: 'Security',
    targetOs: 'windows',
    releaseDate: '2024-04-16',
    approved: true,
    affectedDevicesCount: 6,
    installedDevicesCount: 5
  },
  {
    id: 'patch-3',
    kbArticle: 'macOS-14.5.1',
    title: 'macOS Sonoma 14.5.1 WebKit & Kernel Security Remediation Update',
    severity: 'important',
    category: 'Security',
    targetOs: 'macos',
    releaseDate: '2024-05-13',
    approved: false,
    affectedDevicesCount: 9,
    installedDevicesCount: 2
  },
  {
    id: 'patch-4',
    kbArticle: 'THIRD-CHROME-125',
    title: 'Google Chrome Enterprise Enterprise Silent Patch (v125.0.6422.112)',
    severity: 'moderate',
    category: 'Third-Party',
    targetOs: 'windows',
    releaseDate: '2024-05-20',
    approved: true,
    affectedDevicesCount: 35,
    installedDevicesCount: 29
  }
];

export const INITIAL_AUTOMATIONS: SelfHealingRule[] = [
  {
    id: 'rule-1',
    name: 'Print Spooler Automatic Recovery',
    description: 'Detects if the Windows Print Spooler service stops unexpectedly and immediately restarts it.',
    enabled: true,
    osTarget: 'windows',
    triggerType: 'service_stopped',
    targetServiceName: 'Spooler',
    actionType: 'restart_service',
    executionsCount: 42,
    successRate: 98,
    lastExecuted: '15 mins ago'
  },
  {
    id: 'rule-2',
    name: 'macOS Temp & Cache Auto-Purge',
    description: 'Triggers when Mac system disk usage exceeds 90% and purges user caches, Xcode logs, and temp files.',
    enabled: true,
    osTarget: 'macos',
    triggerType: 'high_disk',
    triggerThreshold: 90,
    actionType: 'purge_temp_files',
    scriptContent: 'sudo rm -rf ~/Library/Caches/* /tmp/* /private/var/tmp/*',
    executionsCount: 19,
    successRate: 100,
    lastExecuted: '1 hour ago'
  },
  {
    id: 'rule-3',
    name: 'High CPU Rogue Process Auto-Remediation',
    description: 'Identifies non-system processes using > 90% CPU for over 10 minutes and logs an alert + auto-throttles.',
    enabled: true,
    osTarget: 'all',
    triggerType: 'high_cpu',
    triggerThreshold: 90,
    actionType: 'run_script',
    scriptContent: '# ApexMSP Auto-Throttle Script\nGet-Process | Where-Object {$_.CPU -gt 500} | Stop-Process -Force',
    executionsCount: 8,
    successRate: 88,
    lastExecuted: 'Yesterday'
  }
];

export const INITIAL_AUTOMATION_LOGS: AutomationExecutionLog[] = [
  {
    id: 'autolog-1',
    ruleId: 'rule-1',
    ruleName: 'Print Spooler Automatic Recovery',
    deviceId: 'dev-103',
    deviceName: 'ATL-W11-EXEC01',
    timestamp: '10:45 AM Today',
    status: 'failed',
    details: 'Spooler service attempt 1 failed: Service dependency stopped or locked by process PID 4912'
  },
  {
    id: 'autolog-2',
    ruleId: 'rule-2',
    ruleName: 'macOS Temp & Cache Auto-Purge',
    deviceId: 'dev-102',
    deviceName: 'BOS-MAC-DEV04',
    timestamp: '09:30 AM Today',
    status: 'success',
    details: 'Freed 18.4 GB of temporary Xcode derived data and user cache files successfully'
  }
];

export const INITIAL_TICKETS: PSATicket[] = [
  {
    id: 'ticket-1001',
    ticketNumber: 'TK-8801',
    title: 'Print Spooler Crashing repeatedly on Executive Workstation',
    description: 'User reports inability to print PDF contracts to network HP LaserJet. Print spooler stops every time a job is queued.',
    clientId: 'client-3',
    clientName: 'Vanguard Logistics & Supply',
    deviceId: 'dev-103',
    deviceName: 'ATL-W11-EXEC01',
    priority: 'urgent',
    status: 'in_progress',
    category: 'Hardware',
    assignedTech: 'Alex Rivera (Tier 2)',
    createdAt: '2024-05-24 08:30 AM',
    updatedAt: '2024-05-24 10:15 AM',
    slaDueDate: '2024-05-24 12:30 PM (2 hrs remaining)',
    slaBreached: false,
    aiSuggestedFix: 'Self-healing automation rule #1 failed because corrupt driver file hp_prn32.dll is locked. Recommended: Execute PowerShell script to clear C:\\Windows\\System32\\spool\\PRINTERS and reinstall driver v4.2.',
    comments: [
      {
        id: 'c-1',
        author: 'David Miller',
        authorRole: 'client',
        timestamp: '08:30 AM',
        content: 'I need to print the quarter contracts before 1 PM board meeting. Please help!',
        isInternal: false
      },
      {
        id: 'c-2',
        author: 'Apex AI Copilot',
        authorRole: 'ai_copilot',
        timestamp: '08:32 AM',
        content: 'Diagnostic complete: Self-healing detected spooler crash. System Event Log #7031 recorded. Generated remediation PowerShell script for technician approval.',
        isInternal: true
      }
    ],
    timeEntries: [
      {
        id: 'te-1',
        technician: 'Alex Rivera',
        minutes: 25,
        description: 'Analyzed spooler crash logs and tested remote PowerShell clearance script.',
        date: '2024-05-24',
        billable: true,
        hourlyRate: 150
      }
    ]
  },
  {
    id: 'ticket-1002',
    ticketNumber: 'TK-8802',
    title: 'Disk Storage Exhaustion on Developer MacBook Pro',
    description: 'MacBook Pro disk space dropped below 5%. Docker Desktop containers and Xcode caches consuming over 120GB.',
    clientId: 'client-2',
    clientName: 'Nexus BioHealth Laboratories',
    deviceId: 'dev-102',
    deviceName: 'BOS-MAC-DEV04',
    priority: 'high',
    status: 'new',
    category: 'Software',
    assignedTech: 'Sarah Chen (Tier 1)',
    createdAt: '2024-05-24 09:10 AM',
    updatedAt: '2024-05-24 09:10 AM',
    slaDueDate: '2024-05-24 01:10 PM',
    slaBreached: false,
    aiSuggestedFix: 'Run automated bash disk cleanup via MDM: `docker system prune -a --volumes -f` and clean `~/Library/Developer/Xcode/DerivedData`.',
    comments: [],
    timeEntries: []
  },
  {
    id: 'ticket-1003',
    ticketNumber: 'TK-8800',
    title: 'New Onboarding Request: Senior Analyst Workstation & Bitwarden Vault Setup',
    description: 'Set up new Windows 11 laptop, escrow BitLocker key to ApexMSP MDM, assign Bitwarden team vault access.',
    clientId: 'client-1',
    clientName: 'Apex Financial Technologies',
    priority: 'medium',
    status: 'resolved',
    category: 'Access/Passwords',
    assignedTech: 'Alex Rivera (Tier 2)',
    createdAt: '2024-05-23 02:00 PM',
    updatedAt: '2024-05-24 08:00 AM',
    slaDueDate: '2024-05-24 02:00 PM',
    slaBreached: false,
    comments: [
      {
        id: 'c-10',
        author: 'Alex Rivera',
        authorRole: 'tech',
        timestamp: '08:00 AM',
        content: 'Completed deployment script via Apex MSP Agent. BitLocker escrowed and Bitwarden user provisioned.',
        isInternal: false
      }
    ],
    timeEntries: [
      {
        id: 'te-2',
        technician: 'Alex Rivera',
        minutes: 45,
        description: 'Provisioned user laptop via MDM script bundle and configured zero-trust credentials.',
        date: '2024-05-23',
        billable: true,
        hourlyRate: 150
      }
    ]
  }
];

export const INITIAL_VAULT_ITEMS: VaultItem[] = [
  {
    id: 'vault-1',
    clientId: 'client-1',
    clientName: 'Apex Financial Technologies',
    folder: 'Domain Controllers & Core',
    type: 'login',
    title: 'NYC Active Directory Enterprise Admin',
    username: 'APEX\\ent_admin',
    password: 'vK9!m$8#Qz2Lp@xW941',
    url: 'https://nyc-dc-srv01.apex.local:9392',
    notes: 'Primary domain admin account for NYC headquarters forest.',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    totpCode: '391 042',
    totpRemainingSeconds: 22,
    favorite: true,
    strengthScore: 98,
    lastModified: '2024-05-10'
  },
  {
    id: 'vault-2',
    clientId: 'client-1',
    clientName: 'Apex Financial Technologies',
    folder: 'Firewalls & Switches',
    type: 'login',
    title: 'pfSense Gateway Core Administrator',
    username: 'admin',
    password: 'pF#8812!ApexSecure99',
    url: 'https://192.168.10.1:443',
    notes: 'pfSense firewall root credentials.',
    favorite: true,
    strengthScore: 95,
    lastModified: '2024-04-12'
  },
  {
    id: 'vault-3',
    clientId: 'client-2',
    clientName: 'Nexus BioHealth Laboratories',
    folder: 'HIPAA Storage Servers',
    type: 'server_credential',
    title: 'AWS S3 HIPAA Backup Vault Access Key',
    username: 'AKIAIOSFODNN7EXAMPLE',
    password: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    url: 'https://aws.amazon.com',
    notes: 'Encrypted bucket root key for lab data backups.',
    favorite: false,
    strengthScore: 100,
    lastModified: '2024-03-01'
  },
  {
    id: 'vault-4',
    clientId: 'client-3',
    clientName: 'Vanguard Logistics & Supply',
    folder: 'Wi-Fi & Network',
    type: 'secure_note',
    title: 'Warehouse Wi-Fi WPA3 Enterprise Pre-Shared Key',
    notes: 'SSID: Vanguard-Secure-Corp\nPSK: VanguardLogistics2024!!Wi-Fi\nVLAN ID: 40',
    favorite: false,
    strengthScore: 90,
    lastModified: '2024-02-18'
  }
];

export const INITIAL_RUSTDESK_CONFIG: RustDeskServerConfig = {
  idServer: 'rustdesk-relay.apexmsp.io',
  relayServer: 'rustdesk-relay.apexmsp.io',
  apiServer: 'https://rustdesk-api.apexmsp.io',
  key: 'pubkey_apex_rustdesk_4819203810928340192381',
  customPort: 21116,
  onlineState: true,
  activeSessionsCount: 2
};

export const INITIAL_WHITE_LABEL: WhiteLabelConfig = {
  companyName: 'ApexMSP Global Cloud Management',
  logoUrl: '',
  primaryColor: '#0284c7', // Sky blue
  secondaryColor: '#0f172a', // Slate dark
  accentColor: '#10b981', // Emerald
  darkMode: true,
  customDomain: 'portal.apexmsp.io',
  supportEmail: 'support@apexmsp.io',
  portalWelcomeMessage: 'Welcome to ApexMSP Executive Infrastructure & Remote Support Portal.'
};

export const INITIAL_AI_MESSAGES: AICopilotMessage[] = [
  {
    id: 'msg-1',
    sender: 'ai',
    text: 'Hello Alex! I am **Apex AI Copilot**. I monitor your 135 managed devices, active tickets, patch matrix, and Bitwarden credential vault in real time.\n\n*How can I assist you right now?*',
    timestamp: 'Just now'
  }
];
