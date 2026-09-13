/**
 * OpenMSP / ApexMSP Shared API Types & Contracts
 * Source of truth for API, Device Agent, and Console UI
 */

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

export type DeviceOS = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'network';
export type DeviceHealth = 'healthy' | 'warning' | 'critical' | 'offline';

// How a device is managed. Computers run the Go agent; Android via Google's
// Android Management API; iOS via Apple MDM. One device list, many channels.
export type ManagementChannel = 'agent' | 'amapi' | 'apple-mdm';

export interface Battery {
  percent: number;
  charging: boolean;
  cycleCount?: number;
  condition?: string; // e.g. "Normal", "Service Recommended"
}

export interface SecurityPosture {
  diskEncryption: 'on' | 'off' | 'unknown'; // FileVault / BitLocker
  firewallOn: boolean;
  sipEnabled?: boolean; // macOS System Integrity Protection
  gatekeeper?: boolean; // macOS Gatekeeper
  model?: string;
  pendingUpdates?: number; // -1 = unknown / not collected this cycle
}

export interface DeviceMetric {
  cpuUsage: number; // percentage 0-100
  ramUsage: number; // percentage 0-100
  diskUsage: number; // percentage 0-100
  uptimeDays: number;
  battery?: Battery;
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
  siteId?: string;
  siteName: string;
  os: DeviceOS;
  osVersion: string;
  arch?: string;
  platform?: DeviceOS; // normalized platform (mirrors os; explicit for cross-channel devices)
  managementChannel?: ManagementChannel; // 'agent' | 'amapi' | 'apple-mdm'
  agentVersion?: string;
  serialNumber: string;
  ipAddress: string;
  publicIp: string;
  macAddress: string;
  health: DeviceHealth;
  metrics: DeviceMetric;
  security?: SecurityPosture;
  meshNodeId?: string;        // MeshCentral node id (for remote support)
  remoteOnline?: boolean;     // remote agent reachable
  rustDeskId: string;         // @deprecated (RustDesk decommissioned)
  rustDeskOnline: boolean;    // @deprecated
  mdmEnrolled: boolean;
  encryptionStatus: 'encrypted' | 'decrypted' | 'pending';
  encryptionKey?: string; // Recovery key (stored restricted, not sent by default)
  patchCompliance: number; // percentage
  pendingPatchesCount: number;
  installedApps: InstalledApp[];
  services: DeviceService[];
  eventLogs: SystemEventLog[];
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Site {
  id: string;
  clientId: string;
  name: string;
  address?: string;
  createdAt?: string;
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
  createdAt?: string;
}

export type PatchSeverity = 'critical' | 'important' | 'moderate' | 'low';
export type PatchCategory = 'Security' | 'Feature' | 'Driver' | 'Third-Party';

export interface PatchItem {
  id: string;
  kbArticle: string;
  title: string;
  severity: PatchSeverity;
  category: PatchCategory;
  targetOs: DeviceOS;
  releaseDate: string;
  approved: boolean;
  affectedDevicesCount: number;
  installedDevicesCount: number;
}

export interface DevicePatch {
  id: string;
  deviceId: string;
  patchId: string;
  status: 'pending' | 'installed' | 'failed';
  installedAt?: string;
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
  isDryRun?: boolean;
}

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'new' | 'in_progress' | 'waiting_on_client' | 'resolved' | 'closed';
export type TicketCategory = 'Hardware' | 'Software' | 'Network' | 'Security' | 'Access/Passwords' | 'MDM/Policy';

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
  category: TicketCategory;
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
  password?: string; // Metadata only in SPA; decrypted only via explicit unlock
  url?: string;
  notes?: string;
  totpSecret?: string;
  totpCode?: string; // computed dynamic current TOTP 6-digit code
  totpRemainingSeconds?: number;
  favorite: boolean;
  strengthScore: number; // 0 - 100
  lastModified: string;
}

// ---------------------------------------------------------------------------
// Remote support (MeshCentral). Provider-neutral so the console/UI doesn't care
// which engine is behind it. (RustDesk types below are deprecated/decommissioned.)
// ---------------------------------------------------------------------------
export type RemoteProvider = 'meshcentral';

export interface RemoteConfig {
  provider: RemoteProvider;
  serverUrl: string;      // MeshCentral base URL, e.g. https://mesh.openmsp.io
  deviceGroup: string;    // MeshCentral device group these endpoints join
  online: boolean;
  activeSessionsCount?: number;
}

export interface RemoteSession {
  id: string;
  deviceId: string;
  deviceName: string;
  meshNodeId?: string;    // MeshCentral node id for the device
  clientName: string;
  connectedTech: string;
  startedAt: string;
  status: 'connecting' | 'connected' | 'ended';
  embedUrl: string;       // URL the console iframes to show the live desktop
}

/** @deprecated RustDesk was decommissioned in favor of MeshCentral. */
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
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
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

// ---------------------------------------------------------------------------
// Auth & Identity
// ---------------------------------------------------------------------------
export type UserRole = 'superadmin' | 'owner' | 'admin' | 'tech' | 'readonly';

// A tenant is an MSP org reachable at <slug>.apexmsp.app. The global admin
// (superadmin) manages tenants from admin.apexmsp.app.
export interface Tenant {
  id: string;      // org id
  slug: string;    // subdomain, e.g. 'dev' -> dev.apexmsp.app
  name: string;
  domain?: string;
  createdAt: string;
  deviceCount?: number;
  userCount?: number;
  clientCount?: number;
}

export interface CreateTenantRequest {
  slug: string;
  name: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  orgId: string;
  orgName: string;
  createdAt: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthLoginResponse {
  token: string;
  user: UserProfile;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
export type DeviceCommandType =
  | 'run_script'
  | 'restart_service'
  | 'collect_inventory'
  | 'install_approved_patches'
  | 'remote_wipe';

export type DeviceCommandStatus = 'pending' | 'dispatched' | 'running' | 'completed' | 'failed';

export interface DeviceCommand {
  id: string;
  deviceId: string;
  orgId: string;
  commandType: DeviceCommandType;
  payload: Record<string, any>;
  status: DeviceCommandStatus;
  output?: string;
  error?: string;
  createdAt: string;
  dispatchedAt?: string;
  completedAt?: string;
}

export interface CreateDeviceCommandRequest {
  commandType: DeviceCommandType;
  payload: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Device Agent Enrollment & Heartbeats
// ---------------------------------------------------------------------------
export interface EnrollmentToken {
  id: string;
  token: string;
  orgId: string;
  clientId: string;
  siteId?: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface AgentEnrollRequest {
  token: string;
  hostname: string;
  os: DeviceOS;
  osVersion: string;
  arch?: string;
  serialNumber: string;
  macAddress: string;
  ipAddress: string;
}

export interface AgentEnrollResponse {
  deviceId: string;
  orgId: string;
  clientId: string;
  siteId?: string;
  deviceSecret: string;
  heartbeatIntervalSeconds: number;
  rustDeskConfig?: RustDeskServerConfig;
}

export interface AgentHeartbeatRequest {
  deviceId: string;
  deviceSecret: string;
  metrics: DeviceMetric;
  network: {
    ipAddress: string;
    macAddress: string;
    publicIp?: string;
  };
  installedApps?: InstalledApp[];
  services?: DeviceService[];
  eventLogs?: SystemEventLog[];
  security?: SecurityPosture;
  agentVersion?: string;
  arch?: string;
  rustDeskId?: string;
}

export interface AgentHeartbeatResponse {
  acknowledged: boolean;
  serverTime: string;
  pendingCommands: DeviceCommand[];
  latestAgentVersion?: string; // agent auto-updates when this is newer than its own
}

export interface AgentUpdateInfo {
  version: string;
  url: string;    // where to download the platform binary
  sha256: string; // hex checksum of the binary
}

// ---------------------------------------------------------------------------
// Audit Events
// ---------------------------------------------------------------------------
export interface AuditEvent {
  id: string;
  orgId: string;
  userId?: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// WebSocket Events
// ---------------------------------------------------------------------------
export type WSMessageType =
  | 'device.heartbeat'
  | 'device.health_changed'
  | 'command.updated'
  | 'ticket.updated'
  | 'session.started'
  | 'session.ended'
  | 'relay.health';

export interface WSEvent<T = any> {
  type: WSMessageType;
  orgId: string;
  timestamp: string;
  payload: T;
}
