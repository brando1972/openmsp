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
  | 'network-map'
  | 'mdm'
  | 'security-soc'
  | 'settings';

export type DeviceOS = 'windows' | 'macos' | 'linux' | 'network' | 'android' | 'ios';
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
  siteId?: string;
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
  agentVersion?: string;
  arch?: string;
  mdmEnrolled: boolean;
  encryptionStatus: 'encrypted' | 'decrypted' | 'pending';
  encryptionKey?: string; // Recovery key (stored restricted, not sent by default)
  patchCompliance: number; // percentage
  pendingPatchesCount: number;
  installedApps: InstalledApp[];
  services: DeviceService[];
  eventLogs: SystemEventLog[];
  tags: string[];
  loggedInUser?: string;
  domain?: string;
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
export type UserRole = 'owner' | 'admin' | 'tech' | 'readonly';

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
  | 'remote_wipe'
  | 'security_scan'
  | 'quarantine_file'
  | 'restore_file'
  | 'kill_process'
  | 'isolate_host'
  | 'unisolate_host'
  | 'deploy_canary_files';

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
  rustDeskId?: string;
  collector?: CollectorCandidacy;
  agentVersion?: string;
  arch?: string;
  securityPosture?: SecurityPostureReport;
  securityDetections?: SecurityDetectionInput[];
}

export interface AgentUpdate {
  version: string;
  url: string;
  sha256: string;
}

export interface AgentHeartbeatResponse {
  acknowledged: boolean;
  serverTime: string;
  pendingCommands: DeviceCommand[];
  // Site-collector election result + marching orders.
  collector?: boolean;
  collectorLeaseSeconds?: number;
  scanConfig?: NetScanConfig;
  update?: AgentUpdate;
}

// ---------------------------------------------------------------------------
// Network discovery (collector role) + topology
// ---------------------------------------------------------------------------
export interface CollectorCandidacy {
  platform: string;
  uptimeDays: number;
  wired: boolean;
  canRawScan: boolean;
  prefixes: string[];
  isCollector: boolean;
}

export interface SnmpCred {
  version: string; // "2c" | "3"
  community?: string;
  user?: string;
  authKey?: string;
  authAlg?: string;
  privKey?: string;
  privAlg?: string;
}

export interface NetScanConfig {
  enabled: boolean;
  prefixes?: string[];
  fullIntervalMin?: number;
  liveIntervalMin?: number;
  snmp?: SnmpCred[];
  scanNow?: boolean;
}

export interface DiscoveredInterface {
  index: number;
  name?: string;
  mac?: string;
  speedMb?: number;
  adminUp: boolean;
  operUp: boolean;
}

export interface DiscoveredHost {
  mac?: string;
  ips: string[];
  hostname?: string;
  vendor?: string;
  model?: string;
  role?: string;
  openPorts?: number[];
  services?: string[];
  latencyMs?: number;
  online: boolean;
  sysName?: string;
  sysDescr?: string;
  uptimeSec?: number;
  ifaces?: DiscoveredInterface[];
  source?: string;
  lastSeen: string;
  // set control-plane-side when a discovered host matches a managed device
  managedDeviceId?: string | null;
}

export interface DiscoveredNeighbor {
  aMac?: string;
  aName?: string;
  aPort?: string;
  bMac?: string;
  bName?: string;
  bPort?: string;
  source: string; // lldp|cdp|bridge|inferred
}

export interface NetworkScanResult {
  siteId?: string;
  prefixes: string[];
  hosts: DiscoveredHost[];
  neighbors: DiscoveredNeighbor[];
  startedAt: string;
  durationMs: string;
  method: string;
}

export interface NetworkScanRequest {
  deviceId: string;
  deviceSecret: string;
  scan: NetworkScanResult;
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
  | 'relay.health'
  | 'dispatch.job'
  | 'dispatch.message'
  | 'dispatch.location'
  | 'dispatch.shift'
  | 'security.detection'
  | 'security.incident'
  | 'security.action'
  | 'unifi.synced';

export interface WSEvent<T = any> {
  type: WSMessageType;
  orgId: string;
  timestamp: string;
  payload: T;
}

// ---------------------------------------------------------------------------
// Dispatch (mobile field-service PWA: jobs, GPS, per-job messaging)
// ---------------------------------------------------------------------------

// Lifecycle of a dispatched job. Forward-only in normal use; a dispatcher can
// reassign or cancel at any point.
export type DispatchJobStatus =
  | 'unassigned'   // created, no tech yet
  | 'assigned'     // assigned to a tech, awaiting their acceptance
  | 'accepted'     // tech acknowledged
  | 'en_route'     // tech traveling to site
  | 'on_site'      // tech arrived / working
  | 'done'         // completed
  | 'cancelled';

export type DispatchJobPriority = 'low' | 'normal' | 'high' | 'urgent';

// A geographic point captured with the job or a status change.
export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number; // meters
  at?: string;       // ISO timestamp of the fix
}

export interface DispatchJob {
  id: string;
  orgId: string;
  jobNumber: string;
  title: string;
  description: string;
  clientId?: string;
  clientName?: string;
  customerName: string;
  address: string;
  location?: GeoPoint;          // geocoded / pinned destination
  priority: DispatchJobPriority;
  status: DispatchJobStatus;
  assignedTechId?: string;
  assignedTechName?: string;
  scheduledStart?: string;      // ISO
  scheduledEnd?: string;        // ISO
  // Status-change breadcrumbs (each captures where/when the tech was).
  events: DispatchJobEvent[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  unreadForTech?: number;       // convenience counters (per requester)
  unreadForDispatch?: number;
}

export interface DispatchJobEvent {
  status: DispatchJobStatus;
  at: string;
  byId: string;
  byName: string;
  location?: GeoPoint;
  note?: string;
}

export interface JobMessage {
  id: string;
  jobId: string;
  orgId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  body: string;
  at: string;
}

// A tech's most recent known position (dispatcher live map). Kept server-side;
// only exposed to dispatchers (owner/admin).
export interface TechLocation {
  userId: string;
  userName: string;
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
  speedMps?: number;
  onShift: boolean;
  updatedAt: string;
}

export interface ShiftState {
  userId: string;
  userName: string;
  onShift: boolean;
  since?: string;
}

// ---- request/response payloads ----
export interface CreateJobRequest {
  title: string;
  description?: string;
  customerName: string;
  address: string;
  location?: GeoPoint;
  clientId?: string;
  priority?: DispatchJobPriority;
  assignedTechId?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface UpdateJobStatusRequest {
  status: DispatchJobStatus;
  location?: GeoPoint;
  note?: string;
}

export interface AssignJobRequest {
  assignedTechId: string;
}

export interface LocationReport {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
  speedMps?: number;
}

export interface DispatchTech {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  onShift: boolean;
  location?: TechLocation;
  openJobs: number;
}

// ---------------------------------------------------------------------------
// Staged Applications & Software Deployment
// ---------------------------------------------------------------------------
export type StagedAppCategory = 'remote_access' | 'security' | 'utility' | 'productivity';
export type StagedAppOs = 'windows' | 'macos' | 'linux' | 'android' | 'all';

export interface StagedApp {
  id: string;
  name: string;
  description: string;
  version: string;
  category: StagedAppCategory;
  os: StagedAppOs;
  enabled: boolean;
  autoDeploy: boolean;
  detection: {
    type: 'service' | 'file' | 'app_name' | 'command';
    target: string;
  };
  installScript: {
    windows?: string;
    macos?: string;
    linux?: string;
    android?: string;
  };
  uninstallScript?: {
    windows?: string;
    macos?: string;
    linux?: string;
    android?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DeviceStagedAppStatus {
  appId: string;
  appName: string;
  category: StagedAppCategory;
  status: 'not_installed' | 'queued' | 'installing' | 'installed' | 'failed';
  lastChecked: string;
  lastInstalled?: string;
  error?: string;
  commandId?: string;
}

// ---------------------------------------------------------------------------
// SIEM, EDR, AV, UniFi SOC & Temporal Identity Contracts (v1)
// ---------------------------------------------------------------------------

export type SecuritySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type SecurityCategory =
  | 'malware'
  | 'ransomware'
  | 'recovery_inhibition'
  | 'persistence'
  | 'canary_tripwire'
  | 'lateral_movement'
  | 'network_ids'
  | 'unifi_anomaly'
  | 'wifi_diagnostic'
  | 'av_tamper'
  | 'policy_violation';

export type SecurityCoverageState =
  | 'unknown'
  | 'installed'
  | 'healthy'
  | 'collecting'
  | 'preventive_active'
  | 'containment_requested'
  | 'containment_verified'
  | 'degraded';

export interface SecuritySensorState {
  provider: 'wazuh' | 'velociraptor' | 'clamav' | 'yara_x' | 'osquery' | 'windows_defender' | 'macos_xprotect' | 'whids' | 'kunai' | 'apex_edr_reflex';
  installed: boolean;
  running: boolean;
  preventiveActive: boolean;
  version?: string;
  signatureVersion?: string;
  lastUpdated?: string;
  lastScanAt?: string;
  healthMessage?: string;
}

export interface SecurityPostureReport {
  coverageState: SecurityCoverageState;
  preventiveAvName: string;
  preventiveAvActive: boolean;
  realtimeProtectionEnabled: boolean;
  tamperProtectionEnabled: boolean;
  canaryFilesDeployed: boolean;
  canaryPaths?: string[];
  recoveryInhibitionGuardActive: boolean;
  isolated: boolean;
  sensors: SecuritySensorState[];
  scannerMemoryMb?: number;
  supervisorCpuPct?: number;
  telemetryCpuPct?: number;
  reportedAt: string;
}

export interface SecurityProcessContext {
  pid?: number;
  ppid?: number;
  name?: string;
  exePath?: string;
  cmdline?: string;
  sha256?: string;
  user?: string;
  signed?: boolean;
  signer?: string;
}

export interface SecurityNetworkContext {
  srcIp?: string;
  srcPort?: number;
  dstIp?: string;
  dstPort?: number;
  proto?: string;
  domain?: string;
  asn?: string;
  country?: string;
  unifiSiteId?: string;
  unifiClientId?: string;
  vlanId?: number;
  switchId?: string;
  switchPort?: number;
  apId?: string;
  ssid?: string;
  blocked?: boolean;
}

export interface SecurityDetectionInput {
  eventId: string;
  idempotencyKey: string;
  eventTime: string;
  sourceProvider: 'apex_agent' | 'wazuh' | 'velociraptor' | 'clamav' | 'yara_x' | 'osquery' | 'unifi_ids' | 'unifi_syslog' | 'unifi_flow';
  ruleId: string;
  ruleName: string;
  severity: SecuritySeverity;
  confidence: number; // 0.0 - 1.0
  category: SecurityCategory;
  summary: string;
  process?: SecurityProcessContext;
  file?: {
    path: string;
    sha256?: string;
    action?: 'created' | 'modified' | 'renamed' | 'deleted' | 'quarantined';
  };
  network?: SecurityNetworkContext;
  rawEvidence?: Record<string, any>;
  isBenignSimulation?: boolean;
}

export interface SecurityDetection extends SecurityDetectionInput {
  id: string;
  orgId: string;
  clientId: string;
  clientName: string;
  siteId?: string;
  deviceId?: string;
  deviceName?: string;
  ingestTime: string;
  incidentId?: string;
  evidencePointer?: string;
}

export type SecurityIncidentStatus = 'open' | 'investigating' | 'containment_pending' | 'contained' | 'resolved' | 'false_positive';

export interface SecurityIncident {
  id: string;
  incidentNumber: string;
  orgId: string;
  clientId: string;
  clientName: string;
  siteId?: string;
  siteName?: string;
  deviceId?: string;
  deviceName?: string;
  title: string;
  summary: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  status: SecurityIncidentStatus;
  confidence: number;
  detectionIds: string[];
  ticketId?: string;
  copilotCaseUrl?: string;
  velociraptorHuntId?: string;
  wazuhAlertIds?: string[];
  assetCriticality: 'standard' | 'pos_payment' | 'pos_controller' | 'infrastructure' | 'municipal_critical' | 'protected_never_auto_isolate';
  containmentState: 'none' | 'requested' | 'approved' | 'executing' | 'verified' | 'failed' | 'manual_required';
  firstEventTime: string;
  lastEventTime: string;
  ingestLatencyMs?: number;
  createdAt: string;
  updatedAt: string;
}

export type SecurityActionType =
  | 'kill_process'
  | 'quarantine_file'
  | 'restore_quarantined_file'
  | 'isolate_host'
  | 'unisolate_host'
  | 'unifi_block_client'
  | 'unifi_unblock_client'
  | 'velociraptor_collect_artifact'
  | 'run_yara_scan'
  | 'run_clamav_scan';

export type SecurityActionStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'verified'
  | 'failed'
  | 'expired'
  | 'blocked_protected_asset';

export interface SecurityAction {
  id: string;
  orgId: string;
  clientId: string;
  clientName: string;
  siteId?: string;
  incidentId?: string;
  targetDeviceId?: string;
  targetDeviceName?: string;
  targetUnifiClientMac?: string;
  actionType: SecurityActionType;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  requiresHumanApproval: boolean;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  expiresAt: string;
  policyVersion: string;
  status: SecurityActionStatus;
  payload: Record<string, any>;
  actualResult?: string;
  error?: string;
  completedAt?: string;
}

export interface TemporalIdentityObservation {
  id: string;
  orgId: string;
  clientId: string;
  siteId: string;
  provider: 'unifi_local_api' | 'unifi_cloud_sitemanager' | 'unifi_syslog' | 'apex_agent' | 'pos_sdk_verified';
  providerClientId: string;
  macAddress: string;
  ipAddress?: string;
  hostname?: string;
  alias?: string;
  deviceRole?: 'pos_terminal' | 'pos_payment_pax' | 'pos_tablet_sunmi' | 'pos_printer' | 'pos_controller_candidate' | 'workstation' | 'server' | 'ap' | 'switch' | 'gateway' | 'camera' | 'guest_client' | 'unknown';
  serialNumber?: string;
  isWired: boolean;
  switchId?: string;
  switchName?: string;
  switchMac?: string;
  switchPort?: number;
  attachmentType: 'confirmed_direct' | 'shared_uplink_or_hub' | 'wireless_ap' | 'inferred';
  portMacCount?: number;
  apId?: string;
  apName?: string;
  ssid?: string;
  vlanId?: number;
  networkName?: string;
  rssi?: number;
  dhcpReserved?: boolean;
  isProtectedAsset: boolean;
  confidence: number; // 0.0 - 1.0
  evidenceSource: string;
  observedFrom: string;
  observedTo: string;
  managedDeviceId?: string;
}

export interface UnifiSiteCapability {
  siteId: string;
  clientId: string;
  clientName: string;
  siteName: string;
  consoleName: string;
  consoleModel: string;
  firmwareVersion: string;
  networkAppVersion: string;
  connectionMethod: 'cloud_sitemanager_proxy' | 'local_pinned_tls' | 'vpn_pinned_tls';
  endpointUrl: string;
  online: boolean;
  lastSyncedAt: string;
  capabilities: {
    localIntegrationApi: boolean;
    legacyStatApi: boolean;
    syslogCefConfigured: boolean;
    ipfixTrafficFlowsSupported: boolean;
    idsIpsEnabled: boolean;
    zoneFirewallSupported: boolean;
    clientBlockWriteSupported: boolean;
    separateReadWriteCreds: boolean;
  };
  counts: {
    adoptedDevices: number;
    onlineDevices: number;
    offlineDevices: number;
    activeClients: number;
    vlans: number;
    protectedPosAssets: number;
  };
  vlans: Array<{
    id: string;
    name: string;
    vlanId: number;
    subnet: string;
    enabled: boolean;
    purpose?: string;
  }>;
  coverageGaps: string[];
}

export interface SecurityPolicy {
  id: string;
  orgId: string;
  clientId: string;
  clientName: string;
  siteId?: string;
  policyVersion: string;
  mode: 'learning' | 'active_detect' | 'auto_contain_safe';
  edrReflexEnabled: boolean;
  recoveryInhibitionAutoKill: boolean;
  canaryTripwireEnabled: boolean;
  canaryPaths: string[];
  avRealtimeEnabled: boolean;
  avScanCadenceHours: number;
  unifiIdsCorrelationEnabled: boolean;
  autoIsolateWorkstationsOnCritical: boolean;
  protectedAssetExclusions: {
    neverAutoIsolateRoles: string[];
    neverBlockSharedSwitchPorts: boolean;
    protectedMacAddresses: string[];
    protectedIpAddresses: string[];
    protectedSwitchPorts: string[];
  };
  updatedAt: string;
}



