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

export const INITIAL_DEVICES: ManagedDevice[] = [];

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
    password: '••••••••••••',
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
    password: '••••••••••••',
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
    password: '••••••••••••',
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
    notes: 'SSID: Vanguard-Secure-Corp\nPSK: [Escrowed Secure Key]\nVLAN ID: 40',
    favorite: false,
    strengthScore: 90,
    lastModified: '2024-02-18'
  }
];

export const INITIAL_RUSTDESK_CONFIG: RustDeskServerConfig = {
  idServer: 'relay.openmsp.local:21116',
  relayServer: 'relay.openmsp.local:21117',
  apiServer: 'http://relay.openmsp.local:21114',
  key: 'openmsp-demo-public-key-9a8b7c6d5e4f3a2b1',
  customPort: 21116,
  onlineState: true,
  activeSessionsCount: 0
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
