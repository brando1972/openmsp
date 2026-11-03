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
    id: 'c-gambinos',
    name: 'Gambinos',
    domain: 'gambinos.local',
    contactName: 'Gambinos Store Operations',
    contactEmail: 'ops@gambinos.com',
    contactPhone: '555-0192',
    sites: ['88f7af54-98f8-306a-a1c7-c9349722b1f6'],
    activeContract: 'Managed SOC + POS & UniFi Care',
    monthlySlaTier: 'Gold 24/7',
    totalDevices: 76,
    openTickets: 1
  },
  {
    id: 'c-tbi',
    name: 'TBI',
    domain: 'tbipos.com',
    contactName: 'TBI Operations',
    contactEmail: 'noc@tbipos.com',
    contactPhone: '555-0155',
    sites: ['TBI-Main'],
    activeContract: 'Managed POS & Network Security',
    monthlySlaTier: 'Gold 24/7',
    totalDevices: 57,
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
    activeContract: 'Managed Endpoint & UniFi Security',
    monthlySlaTier: 'Gold 24/7',
    totalDevices: 60,
    openTickets: 0
  },
  {
    id: 'c-sos-volleyball',
    name: 'SOS Volleyball',
    domain: 'sosvolleyball.com',
    contactName: 'SOS Facility Director',
    contactEmail: 'ops@sosvolleyball.com',
    contactPhone: '555-0166',
    sites: ['SOS-Complex'],
    activeContract: 'Managed Facility Wi-Fi & Security',
    monthlySlaTier: 'Silver 8/5',
    totalDevices: 79,
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
    activeContract: 'Internal DevStack & SOC',
    monthlySlaTier: 'Gold 24/7',
    totalDevices: 12,
    openTickets: 1
  }
];

export const INITIAL_DEVICES: ManagedDevice[] = [];

export const INITIAL_PATCHES: PatchItem[] = [];

export const INITIAL_AUTOMATIONS: SelfHealingRule[] = [];

export const INITIAL_AUTOMATION_LOGS: AutomationExecutionLog[] = [];

export const INITIAL_TICKETS: PSATicket[] = [];

export const INITIAL_VAULT_ITEMS: VaultItem[] = [];

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
