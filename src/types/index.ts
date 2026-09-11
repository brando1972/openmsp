export type NavigationTab =
  | 'dashboard'
  | 'rmm'
  | 'remote-support'
  | 'psa-tickets'
  | 'vault'
  | 'ai-copilot'
  | 'patching'
  | 'automations'
  | 'settings';

export type DeviceOS = 'windows' | 'macos' | 'linux' | 'network';
export type DeviceHealth = 'healthy' | 'warning' | 'critical' | 'offline';

export interface DeviceMetric {
  cpuUsage: number; // percentage 0-100
  ramUsage: number; // percentage 0-100
  diskUsage: number; // percentage 0-100
  uptimeDays: number;
  lastSeen: string;
}

export interface InstalledApp {
  id: string;
  name: string;
  version: string;
  publisher: string;
  installDate: string;
}

export interface DeviceService {
  name: string;
  displayName: string;
  status: 'running' | 'stopped' | 'disabled';
  startupType: 'auto' | 'manual' | 'disabled';
}

export interface SystemEventLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  message: string;
  eventId: number;
}

export interface ManagedDevice {
  id: string;
  name: string;
  hostname: string;
  clientId: string;
  clientName: string;
  siteName: string;
  os: DeviceOS;
  osVersion: string;
  serialNumber: string;
  ipAddress: string;
  publicIp: string;
  macAddress: string;
  health: DeviceHealth;
  metrics: DeviceMetric;
  rustDeskId: string;
  rustDeskOnline: boolean;
  mdmEnrolled: boolean;
  encryptionStatus: 'encrypted' | 'decrypted' | 'pending';
  encryptionKey?: string; // BitLocker or FileVault recovery key
  patchCompliance: number; // percentage
  pendingPatchesCount: number;
  installedApps: InstalledApp[];
  services: DeviceService[];
  eventLogs: SystemEventLog[];
  tags: string[];
}

export interface ClientTenant {
  id: string;
  name: string;
  domain: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  sites: string[];
  activeContract: string;
  monthlySlaTier: 'Gold 24/7' | 'Silver 8/5' | 'Bronze Best Effort';
  totalDevices: number;
  openTickets: number;
}

export interface PatchItem {
  id: string;
  kbArticle: string;
  title: string;
  severity: 'critical' | 'important' | 'moderate' | 'low';
  category: 'Security' | 'Feature' | 'Driver' | 'Third-Party';
  targetOs: DeviceOS;
  releaseDate: string;
  approved: boolean;
  affectedDevicesCount: number;
  installedDevicesCount: number;
}

export interface SelfHealingRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  osTarget: DeviceOS | 'all';
  triggerType: 'high_cpu' | 'high_ram' | 'high_disk' | 'service_stopped' | 'event_error';
  triggerThreshold?: number; // e.g., 90 for CPU
  targetServiceName?: string;
  actionType: 'restart_service' | 'purge_temp_files' | 'run_script' | 'create_ticket' | 'restart_device';
  scriptContent?: string;
  lastExecuted?: string;
  executionsCount: number;
  successRate: number; // percentage
}

export interface AutomationExecutionLog {
  id: string;
  ruleId: string;
  ruleName: string;
  deviceId: string;
  deviceName: string;
  timestamp: string;
  status: 'success' | 'failed' | 'running';
  details: string;
}

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'new' | 'in_progress' | 'waiting_on_client' | 'resolved' | 'closed';

export interface TicketComment {
  id: string;
  author: string;
  authorRole: 'tech' | 'client' | 'ai_copilot';
  timestamp: string;
  content: string;
  isInternal: boolean;
}

export interface TimeEntry {
  id: string;
  technician: string;
  minutes: number;
  description: string;
  date: string;
  billable: boolean;
  hourlyRate: number;
}

export interface PSATicket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  clientId: string;
  clientName: string;
  deviceId?: string;
  deviceName?: string;
  priority: TicketPriority;
  status: TicketStatus;
  category: 'Hardware' | 'Software' | 'Network' | 'Security' | 'Access/Passwords' | 'MDM/Policy';
  assignedTech: string;
  createdAt: string;
  updatedAt: string;
  slaDueDate: string;
  slaBreached: boolean;
  comments: TicketComment[];
  timeEntries: TimeEntry[];
  aiSuggestedFix?: string;
}

export type VaultItemType = 'login' | 'secure_note' | 'card' | 'server_credential' | 'ssh_key';

export interface VaultItem {
  id: string;
  clientId: string;
  clientName: string;
  folder: string;
  type: VaultItemType;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  totpSecret?: string;
  totpCode?: string; // computed dynamic current TOTP 6-digit code
  totpRemainingSeconds?: number;
  favorite: boolean;
  strengthScore: number; // 0 - 100
  lastModified: string;
}

export interface RustDeskServerConfig {
  idServer: string;
  relayServer: string;
  apiServer: string;
  key: string;
  customPort: number;
  onlineState: boolean;
  activeSessionsCount: number;
}

export interface RustDeskSession {
  id: string;
  deviceId: string;
  deviceName: string;
  rustDeskId: string;
  clientName: string;
  connectedTech: string;
  startedAt: string;
  status: 'connecting' | 'connected' | 'ended';
  sessionKey: string;
}

export interface WhiteLabelConfig {
  companyName: string;
  logoUrl: string;
  primaryColor: string; // Hex color string e.g. '#2563eb'
  secondaryColor: string; // Hex color string e.g. '#0f172a'
  accentColor: string; // Hex color string e.g. '#10b981'
  darkMode: boolean;
  customDomain: string;
  supportEmail: string;
  portalWelcomeMessage: string;
}

export interface AICopilotMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  codeSnippet?: string;
  codeLanguage?: 'powershell' | 'bash' | 'json' | 'sql';
  actionableContext?: {
    type: 'run_remediation' | 'create_ticket' | 'deploy_patch';
    targetId: string;
  };
}
