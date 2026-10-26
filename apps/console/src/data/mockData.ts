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
    id: 'tick-001',
    ticketNumber: 'TICK-1001',
    title: 'Periodic print spooler crash on accounting PC',
    description: 'The local printer becomes unreachable every morning until Print Spooler is manually restarted.',
    clientId: 'c-brandon-ray',
    clientName: 'Brandon Ray',
    deviceId: 'dev-win-01',
    deviceName: 'ACME-EXEC-PC',
    priority: 'medium',
    status: 'in_progress',
    category: 'Hardware',
    assignedTech: 'Orch (Autonomous MSP Engineer)',
    assigned_team: '🖥️ Windows & Endpoint Self-Healing Team',
    ticket_scope: 'MSP_CLIENT',
    origin_channel: 'RMM_ALERT',
    suppress_from_client_queue: false,
    autonomy_level: 'L2_STAGE_FIX',
    createdAt: '2026-04-20 06:58 AM',
    updatedAt: '2026-10-20 11:00 PM',
    slaDueDate: 'Active SLA (20h remaining)',
    slaBreached: false,
    root_cause: 'Corrupt print processor SHD/SPL files in C:\\Windows\\System32\\spool\\PRINTERS combined with legacy Type-3 HP PCL6 driver lock causing spoolsv.exe SCM Event 7031 termination on ACME-EXEC-PC.',
    remediation_action: 'Self-healing trigger created for service_stopped: Spooler -> Stop-Service Spooler -Force; Remove-Item C:\\Windows\\System32\\spool\\PRINTERS\\* -Force; Start-Service Spooler',
    aiSuggestedFix: 'Self-healing trigger created for service_stopped: Spooler -> Stop-Service Spooler -Force; Remove-Item C:\\Windows\\System32\\spool\\PRINTERS\\* -Force; Start-Service Spooler',
    orch_conversation_note: '✅ [Orch Root Cause & Remediation Complete — TICK-1001]\n• Asset: ACME-EXEC-PC (dev-win-01)\n• Root Cause: Corrupt SHD/SPL spool queue headers in C:\\Windows\\System32\\spool\\PRINTERS deadlocking spoolsv.exe on morning print jobs.\n• Remediation Executed: Purged stale spool queue files, enabled rule-spooler-restart self-healing trigger (service_stopped: Spooler), and verified spoolsv.exe healthy.\n— Signed: Orch (Autonomous MSP Engineer)',
    billable_minutes: 30,
    mirofish_verified: true,
    comments: [
      {
        id: 'c-tick-1001-1',
        author: 'Sarah Jenkins',
        authorRole: 'client',
        timestamp: '09:00 AM',
        content: 'Printer stopped responding again this morning at 9am.',
        isInternal: false
      },
      {
        id: 'c-tick-1001-2',
        author: 'Chief MSP Operator',
        authorRole: 'tech',
        timestamp: '10:30 AM',
        content: 'Configured self-healing automation rule to auto-restart the spooler if it halts.',
        isInternal: true
      }
    ],
    timeEntries: [
      {
        id: 'te-tick-1001-1',
        technician: 'Chief MSP Operator',
        minutes: 30,
        description: 'Diagnosed print queue corruption and enabled auto-restart rule',
        date: '2026-04-20',
        billable: true,
        hourlyRate: 150
      }
    ]
  },
  {
    id: 'tick-cd29af2e',
    ticketNumber: 'TICK-1002',
    title: 'TEst',
    description: 'Test',
    clientId: 'c-brandon-ray',
    clientName: 'Brandon Ray',
    deviceId: 'dev-mac-7c8a43',
    deviceName: 'Brandons-MacBook-Pro.local',
    priority: 'medium',
    status: 'new',
    category: 'Hardware',
    assignedTech: 'Orch (Autonomous MSP Engineer)',
    assigned_team: '🖥️ Windows & Endpoint Self-Healing Team',
    ticket_scope: 'MSP_CLIENT',
    origin_channel: 'CLIENT_PORTAL',
    suppress_from_client_queue: false,
    autonomy_level: 'L2_STAGE_FIX',
    createdAt: '2026-04-20 06:16 PM',
    updatedAt: '2026-10-20 11:00 PM',
    slaDueDate: 'Active SLA',
    slaBreached: false,
    root_cause: 'Operator initiated end-to-end PSA intake verification probe (TICK-1002) to validate bi-directional ticket sync between ApexMSP Console and NodalCortex Brain.',
    remediation_action: 'Self-healing trigger verified: PSA-to-Brain webhook pipeline active (200 OK); auto-linked to Brandons-MacBook-Pro.local telemetry node.',
    aiSuggestedFix: 'Self-healing trigger verified: PSA-to-Brain webhook pipeline active (200 OK); auto-linked to Brandons-MacBook-Pro.local telemetry node.',
    orch_conversation_note: '✅ [Orch Root Cause & Remediation Complete — TICK-1002]\n• Root Cause: Synthetic PSA intake verification test ticket (TICK-1002).\n• Action Taken: Confirmed FalkorDB + Qdrant bi-temporal synchronization and verified WebSocket ticket broadcast.\n— Signed: Orch (Autonomous MSP Engineer)',
    billable_minutes: 15,
    mirofish_verified: true,
    comments: [],
    timeEntries: []
  },
  {
    id: 'tick-8316df0a',
    ticketNumber: 'TICK-1003',
    title: 'Menu-bar self-test — please ignore',
    description: 'Verifying Request Support from the sharkfin menu.',
    clientId: 'c-brandon-ray',
    clientName: 'Brandon Ray',
    deviceId: 'dev-mac-7c8a43',
    deviceName: 'Brandons-MacBook-Pro.local',
    priority: 'medium',
    status: 'new',
    category: 'Software',
    assignedTech: 'Orch (Autonomous MSP Engineer)',
    assigned_team: '🖥️ Windows & Endpoint Self-Healing Team',
    ticket_scope: 'MSP_CLIENT',
    origin_channel: 'RMM_ALERT',
    suppress_from_client_queue: false,
    autonomy_level: 'L2_STAGE_FIX',
    createdAt: '2026-04-20 07:03 PM',
    updatedAt: '2026-10-20 11:00 PM',
    slaDueDate: 'Active SLA',
    slaBreached: false,
    root_cause: 'Sharkfin macOS menu-bar tray agent (ApexMSPMenuBar.swift) on Brandons-MacBook-Pro.local (dev-mac-7c8a43) triggered a Request Support self-healing health check while verifying LaunchAgent com.apexmsp.agent IPC socket.',
    remediation_action: 'Self-healing trigger created for macos_menubar_watchdog: launchctl kickstart -k gui/$(id -u)/com.apexmsp.menubar && curl -fsSL http://192.168.4.150:8080/api/edge/devices',
    aiSuggestedFix: 'Self-healing trigger created for macos_menubar_watchdog: launchctl kickstart -k gui/$(id -u)/com.apexmsp.menubar && curl -fsSL http://192.168.4.150:8080/api/edge/devices',
    orch_conversation_note: '✅ [Orch Root Cause & Remediation Complete — TICK-1003]\n• Asset: Brandons-MacBook-Pro.local (dev-mac-7c8a43 / macOS 26.2 arm64)\n• Root Cause: Sharkfin menu-bar Request Support self-test probe verified tray-to-PSA intake; LaunchAgent watchdog confirmed daemon heartbeat healthy (CPU 18%, RAM 51%, Disk 9%).\n• Remediation Executed: Registered macos_menubar_watchdog self-healing trigger on Brandons-MacBook-Pro.local and committed permanent immunity playbook to NodalCortex Brain.\n— Signed: Orch (Autonomous MSP Engineer)',
    billable_minutes: 15,
    mirofish_verified: true,
    comments: [],
    timeEntries: []
  },
  {
    id: 'tick-feb13507',
    ticketNumber: 'TICK-1004',
    title: 'Test',
    description: 'Test',
    clientId: 'c-brandon-ray',
    clientName: 'Brandon Ray',
    deviceId: 'dev-mac-7c8a43',
    deviceName: 'Brandons-MacBook-Pro.local',
    priority: 'medium',
    status: 'new',
    category: 'Software',
    assignedTech: 'Orch (Autonomous MSP Engineer)',
    assigned_team: '🖥️ Windows & Endpoint Self-Healing Team',
    ticket_scope: 'MSP_CLIENT',
    origin_channel: 'CLIENT_PORTAL',
    suppress_from_client_queue: false,
    autonomy_level: 'L2_STAGE_FIX',
    createdAt: '2026-04-20 07:45 PM',
    updatedAt: '2026-10-20 11:00 PM',
    slaDueDate: 'Active SLA',
    slaBreached: false,
    root_cause: 'Secondary RMM probe (TICK-1004) from Brandons-MacBook-Pro.local (dev-mac-7c8a43) triggered during site-collector election and LAN topology discovery.',
    remediation_action: 'Self-healing trigger verified: Site collector election pinned to Brandons-MacBook-Pro.local (isSiteCollector: true) with 60s heartbeat cadence.',
    aiSuggestedFix: 'Self-healing trigger verified: Site collector election pinned to Brandons-MacBook-Pro.local (isSiteCollector: true) with 60s heartbeat cadence.',
    orch_conversation_note: '✅ [Orch Root Cause & Remediation Complete — TICK-1004]\n• Asset: Brandons-MacBook-Pro.local (dev-mac-7c8a43)\n• Root Cause: Site collector & LAN topology test probe (TICK-1004) on Brandons-MacBook-Pro.local.\n• Action Taken: Confirmed site collector status (isSiteCollector=true) and 0 packet loss across 192.168.4.0/24.\n— Signed: Orch (Autonomous MSP Engineer)',
    billable_minutes: 15,
    mirofish_verified: true,
    comments: [],
    timeEntries: []
  },
  {
    id: 'tick-e30ae7c8',
    ticketNumber: 'TICK-1005',
    title: 'test',
    description: 'help',
    clientId: 'c-brandon-ray',
    clientName: 'Brandon Ray',
    deviceId: 'dev-mac-7c8a43',
    deviceName: 'Brandons-MacBook-Pro.local',
    priority: 'urgent',
    status: 'new',
    category: 'Software',
    assignedTech: 'Orch (Autonomous MSP Engineer)',
    assigned_team: '🖥️ Windows & Endpoint Self-Healing Team',
    ticket_scope: 'MSP_CLIENT',
    origin_channel: 'RMM_ALERT',
    suppress_from_client_queue: false,
    autonomy_level: 'L2_STAGE_FIX',
    createdAt: '2026-04-20 07:53 PM',
    updatedAt: '2026-10-20 11:00 PM',
    slaDueDate: 'Urgent SLA (1h remaining)',
    slaBreached: false,
    root_cause: 'Urgent operator assistance beacon (TICK-1005: "help") dispatched from Brandons-MacBook-Pro.local (dev-mac-7c8a43) to test priority SLA escalation and live RustDesk/Orch response.',
    remediation_action: 'Self-healing trigger executed: Priority SLA fast-track activated; Orch verified Brandons-MacBook-Pro.local online (192.168.4.122, RustDesk ID 918-224-550) and staged 1-click remote triage.',
    aiSuggestedFix: 'Self-healing trigger executed: Priority SLA fast-track activated; Orch verified Brandons-MacBook-Pro.local online (192.168.4.122, RustDesk ID 918-224-550) and staged 1-click remote triage.',
    orch_conversation_note: '✅ [Orch Root Cause & Remediation Complete — TICK-1005]\n• Asset: Brandons-MacBook-Pro.local (dev-mac-7c8a43)\n• Root Cause: Urgent operator assistance beacon (TICK-1005) verifying priority escalation & live Orch remediation loop.\n• Remediation Executed: Verified endpoint health (CPU 18%, RAM 51%, Disk 9%), confirmed RustDesk relay ready, and logged 15m rapid triage.\n— Signed: Orch (Autonomous MSP Engineer)',
    billable_minutes: 15,
    mirofish_verified: true,
    comments: [],
    timeEntries: []
  },
  {
    id: 'TKT-2026-1002',
    ticketNumber: 'TKT-2026-1002',
    title: 'Gulf Coast Logistics — 2nd Floor Warehouse Wi-Fi AP Drops',
    description: 'Zebra TC52 hand-scanners on the 2nd Floor Warehouse Zone B disconnect every 15 minutes during shift change. UniFi Controller reports DFS radar channel hops on U6-LR APs (Channel 52/100) and VLAN 40 (/24) DHCP pool at 99.2% utilization.',
    clientId: 'client-3',
    clientName: 'Gulf Coast Logistics',
    deviceId: 'dev-103',
    deviceName: 'GCL-U6LR-ZONEB',
    priority: 'high',
    status: 'in_progress',
    category: 'Network',
    assignedTech: 'Alex Rivera (Tier 2)',
    assigned_team: '🌐 Networking & Wi-Fi Engineering Team',
    ticket_scope: 'MSP_CLIENT',
    origin_channel: 'CLIENT_EMAIL',
    suppress_from_client_queue: false,
    autonomy_level: 'L2_STAGE_FIX',
    createdAt: '2026-10-20 08:15 AM',
    updatedAt: '2026-10-20 09:40 AM',
    slaDueDate: '2026-10-20 12:15 PM (1.5 hrs remaining)',
    slaBreached: false,
    aiSuggestedFix: 'Pin 2nd Floor Zone B U6-LR APs to 5GHz non-DFS channels (36, 40, 44, 48, 149-161 @ 20MHz), expand VLAN 40 scanner subnet from /24 to /23 (510 usable IPs), and enable 802.11r/k/v Fast Roaming.',
    staged_remediation: `# Staged Network Remediation Playbook (TKT-2026-1002)
1. 5GHz Non-DFS Channel Plan (20MHz width): Pin Zone B U6-LR APs to non-DFS channels 36, 40, 44, 48, 149, 153, 157, 161.
2. Expand VLAN 40 Scanner Subnet: 10.40.10.0/24 -> 10.40.10.0/23 (510 usable IPs) & set DHCP lease time to 7200s (2h).
3. Enable 802.11r Fast Roaming + 802.11k/v BSS Transition & enforce Minimum RSSI -72 dBm.`,
    comments: [
      {
        id: 'c-gcl-1',
        author: 'Warehouse Ops Desk',
        authorRole: 'client',
        timestamp: '08:15 AM',
        content: '2nd floor warehouse scanners are dropping off Wi-Fi during morning pallet scan. Need urgent RF/DHCP fix.',
        isInternal: false
      }
    ],
    timeEntries: []
  },
  {
    id: 'TKT-2026-1003',
    ticketNumber: 'TKT-2026-1003',
    title: 'Bayshore Medical Group — 3CX SIP Trunk Failover & HIPAA Recording',
    description: 'Outbound SIP trunk channels flagged legacy TLS 1.2 cipher suite negotiation and requires automatic DTMF HIPAA/PCI-DSS pause/resume markers during patient billing intake on voice-gateway.',
    clientId: 'client-2',
    clientName: 'Bayshore Medical Group',
    deviceId: 'dev-102',
    deviceName: 'BMG-3CX-GW01',
    priority: 'urgent',
    status: 'new',
    category: 'Security',
    assignedTech: 'Sarah Chen (Tier 2)',
    assigned_team: '📞 Telecom & 3CX Compliance Team',
    ticket_scope: 'MSP_CLIENT',
    origin_channel: 'RMM_ALERT',
    suppress_from_client_queue: false,
    autonomy_level: 'L2_STAGE_FIX',
    createdAt: '2026-10-20 08:45 AM',
    updatedAt: '2026-10-20 09:50 AM',
    slaDueDate: '2026-10-20 11:45 AM (1 hr remaining)',
    slaBreached: false,
    aiSuggestedFix: 'Enforce TLS 1.3 SRTP cipher suite on primary & failover SIP trunks and enable automatic DTMF HIPAA/PCI recording mask webhook in 3cx-ai-agent/compliance-app.',
    staged_remediation: `# Staged 3CX SIP & HIPAA Compliance Remediation (TKT-2026-1003)
sip_trunk_tls_min_version = "TLSv1.3"
srtp_cipher_suite = "AES_CM_128_HMAC_SHA1_80"
hipaa_pci_dtmf_auto_mask = true`,
    comments: [],
    timeEntries: []
  },
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
    ticket_scope: 'MSP_CLIENT',
    origin_channel: 'CLIENT_PORTAL',
    suppress_from_client_queue: false,
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
    ticket_scope: 'MSP_CLIENT',
    origin_channel: 'RMM_ALERT',
    suppress_from_client_queue: false,
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
    ticket_scope: 'MSP_CLIENT',
    origin_channel: 'CLIENT_PORTAL',
    suppress_from_client_queue: false,
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
  },
  {
    id: 'TKT-2026-1001',
    ticketNumber: 'TKT-2026-1001',
    title: '[Breaking Change] Supabase Data API (Oct 30): Explicit GRANT Privileges Required for public Schema',
    description: 'Action Required before October 30, 2026: Newly created tables and views in the public schema will no longer automatically receive default privileges for anon, authenticated, and service_role roles on the Supabase Data API (PostgREST). Audited across openmsp-workspace, volleyhub, tbipos, supplaichain, and 3cx-ai-agent/compliance-app.',
    clientId: 'internal-nodalcortex',
    clientName: 'NodalCortex Internal DevSecOps',
    deviceName: 'proxmox-222-cuda / Supabase Fleet',
    priority: 'high',
    status: 'in_progress',
    category: 'Security',
    assignedTech: 'Hermes DevSecOps Agent',
    assigned_team: '🧑‍💻 DevSecOps & Schema Team',
    ticket_scope: 'NODALCORTEX_DEVOPS',
    origin_channel: 'NODALCORTEX_IMMUNITY',
    suppress_from_client_queue: true,
    autonomy_level: 'L2_STAGE_FIX',
    createdAt: '2026-10-20 07:50 AM',
    updatedAt: '2026-10-20 09:55 AM',
    slaDueDate: 'Oct 30 Cutover Window',
    slaBreached: false,
    aiSuggestedFix: 'Execute idempotent GRANT USAGE / GRANT ALL PRIVILEGES + ALTER DEFAULT PRIVILEGES migration verified in MiroFish Shadow-Twin Blue/Green Sandbox (SBX-2026-1001).',
    staged_remediation: `-- Staged Idempotent Migration (RULE-SUPA-OCT30-PUBLIC-GRANTS)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;`,
    mirofish_sandbox: {
      sandbox_id: 'SBX-2026-1001',
      mode: 'BLUE_GREEN_SHADOW_TWIN',
      status: 'VERIFIED_SAFE',
      tested_repos: [
        'openmsp-workspace',
        'volleyhub',
        'tbipos',
        'supplaichain',
        '3cx-ai-agent/compliance-app'
      ],
      summary: 'MiroFish Shadow-Twin Blue/Green Sandbox verified explicit GRANT statements across all 5 repos (14/14 table permissions verified under Oct 30 Supabase rules).',
      verification_badge: '14/14 table permissions verified under Oct 30 Supabase rules',
      stages: [
        '1. Snapshot Blue',
        '2. Spin Up Shadow Green',
        '3. Baseline Failure Repro',
        '4. Apply Patch & Verify Green (.222 CUDA)',
        '5. Stage Blue/Green Cutover'
      ],
      retention_days: 3,
      blue_state: 'ACTIVE_PRODUCTION (Ready for 72h Quarantine)',
      green_state: 'SHADOW_VERIFIED_READY'
    },
    comments: [
      {
        id: 'c-sbx-1',
        author: 'Apex AI Copilot',
        authorRole: 'ai_copilot',
        timestamp: '09:55 AM',
        content: 'MiroFish Shadow-Twin Blue/Green Sandbox (SBX-2026-1001) completed dry-run migration across all 5 repositories with 0 regressions. Ready for 1-click L2 approval.',
        isInternal: true
      }
    ],
    timeEntries: []
  },
  {
    id: 'TKT-2026-1004',
    ticketNumber: 'TKT-2026-1004',
    title: '[Auto-Sweep] Edge Daemon v2.2.0 OTA Sync & Proxmox .222 CUDA Health Check',
    description: 'Automated background fleet sweep verifying Edge Daemon v2.2.0 OTA heartbeat across Mac Studio (.150), MacBook Pro, and Proxmox .222 GTX 1080 Ti CUDA worker.',
    clientId: 'internal-hermes',
    clientName: 'Hermes Autonomous Fleet Ops',
    deviceName: 'proxmox-222-gtx1080ti',
    priority: 'low',
    status: 'resolved',
    category: 'MDM/Policy',
    assignedTech: 'Hermes Orchestrator (L3)',
    assigned_team: '🖥️ Infrastructure & Proxmox GPU Team',
    ticket_scope: 'HERMES_AUTONOMOUS',
    origin_channel: 'HERMES_ORCH',
    suppress_from_client_queue: true,
    autonomy_level: 'L3_AUTO_RESOLVE',
    createdAt: '2026-10-20 06:00 AM',
    updatedAt: '2026-10-20 06:02 AM',
    slaDueDate: 'Auto-Resolved (L3)',
    slaBreached: false,
    aiSuggestedFix: 'No human action required. L3 autonomous sweep verified 0 cloud 429s and 100% edge daemon parity.',
    staged_remediation: `# Verified L3 Auto-Sweep Telemetry
proxmox_222_cuda_vram_free_mb = 4938
cloud_429_errors = 0
edge_daemon_ota_version = "v2.2.0"`,
    comments: [],
    timeEntries: []
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
