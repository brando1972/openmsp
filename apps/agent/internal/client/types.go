package client

import "encoding/json"

// DeviceMetric holds system performance telemetry.
type DeviceMetric struct {
	CpuUsage   float64 `json:"cpuUsage"`
	RamUsage   float64 `json:"ramUsage"`
	DiskUsage  float64 `json:"diskUsage"`
	UptimeDays float64 `json:"uptimeDays"`
	LastSeen   string  `json:"lastSeen,omitempty"`
}

// InstalledApp represents an installed software package on the host.
type InstalledApp struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Publisher   string `json:"publisher"`
	InstallDate string `json:"installDate"`
}

// DeviceService represents a system service or daemon.
type DeviceService struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Status      string `json:"status"`      // "running" | "stopped" | "disabled"
	StartupType string `json:"startupType"` // "auto" | "manual" | "disabled"
}

// SystemEventLog represents an event log or system notification.
type SystemEventLog struct {
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"` // "info" | "warning" | "error" | "critical"
	Source    string `json:"source"`
	Message   string `json:"message"`
	EventID   int    `json:"eventId"`
}

// NetworkInfo contains local and public network identifiers.
type NetworkInfo struct {
	IPAddress  string `json:"ipAddress"`
	MACAddress string `json:"macAddress"`
	PublicIP   string `json:"publicIp,omitempty"`
}

// AgentEnrollRequest payload for POST /api/v1/agents/enroll.
type AgentEnrollRequest struct {
	Token        string `json:"token"`
	Hostname     string `json:"hostname"`
	OS           string `json:"os"` // "macos" | "windows" | "linux"
	OSVersion    string `json:"osVersion"`
	Arch         string `json:"arch,omitempty"`
	SerialNumber string `json:"serialNumber"`
	MACAddress   string `json:"macAddress"`
	IPAddress    string `json:"ipAddress"`
}

// AgentEnrollResponse returned from POST /api/v1/agents/enroll.
type AgentEnrollResponse struct {
	DeviceId                 string                 `json:"deviceId"`
	OrgId                    string                 `json:"orgId"`
	ClientId                 string                 `json:"clientId"`
	SiteId                   string                 `json:"siteId"`
	DeviceSecret             string                 `json:"deviceSecret"`
	HeartbeatIntervalSeconds int                    `json:"heartbeatIntervalSeconds"`
	RustDeskConfig           map[string]interface{} `json:"rustDeskConfig,omitempty"`
}

// AgentHeartbeatRequest payload for POST /api/v1/agents/heartbeat.
type AgentHeartbeatRequest struct {
	DeviceId      string           `json:"deviceId"`
	DeviceSecret  string           `json:"deviceSecret"`
	Metrics       DeviceMetric     `json:"metrics"`
	Network       NetworkInfo      `json:"network"`
	InstalledApps []InstalledApp   `json:"installedApps,omitempty"`
	Services      []DeviceService  `json:"services,omitempty"`
	EventLogs     []SystemEventLog `json:"eventLogs,omitempty"`
	RustDeskId    string           `json:"rustDeskId,omitempty"`
	// Collector candidacy — the control plane uses these to elect one collector
	// per site and hand it back the lease + scan config below.
	Collector *CollectorCandidacy `json:"collector,omitempty"`
	// Self-update: the agent reports its build so the control plane can direct an
	// update when a newer release exists for this os/arch.
	AgentVersion       string                   `json:"agentVersion,omitempty"`
	Arch               string                   `json:"arch,omitempty"`
	SecurityPosture    *SecurityPostureReport   `json:"securityPosture,omitempty"`
	SecurityDetections []SecurityDetectionInput `json:"securityDetections,omitempty"`
}

// SecuritySensorState represents the operational state of a local security sensor or AV engine.
type SecuritySensorState struct {
	Provider         string `json:"provider"` // "wazuh" | "velociraptor" | "clamav" | "yara_x" | "osquery" | "windows_defender" | "macos_xprotect" | "whids" | "kunai" | "apex_edr_reflex"
	Installed        bool   `json:"installed"`
	Running          bool   `json:"running"`
	PreventiveActive bool   `json:"preventiveActive"`
	Version          string `json:"version,omitempty"`
	SignatureVersion string `json:"signatureVersion,omitempty"`
	LastUpdated      string `json:"lastUpdated,omitempty"`
	LastScanAt       string `json:"lastScanAt,omitempty"`
	HealthMessage    string `json:"healthMessage,omitempty"`
}

// SecurityPostureReport summarizes host preventive AV, EDR sensor health, and canary status.
type SecurityPostureReport struct {
	CoverageState                 string                `json:"coverageState"` // "unknown" | "installed" | "healthy" | "collecting" | "preventive_active" | "containment_requested" | "containment_verified" | "degraded"
	PreventiveAvName              string                `json:"preventiveAvName"`
	PreventiveAvActive            bool                  `json:"preventiveAvActive"`
	RealtimeProtectionEnabled     bool                  `json:"realtimeProtectionEnabled"`
	TamperProtectionEnabled       bool                  `json:"tamperProtectionEnabled"`
	CanaryFilesDeployed           bool                  `json:"canaryFilesDeployed"`
	CanaryPaths                   []string              `json:"canaryPaths,omitempty"`
	RecoveryInhibitionGuardActive bool                  `json:"recoveryInhibitionGuardActive"`
	Isolated                      bool                  `json:"isolated"`
	Sensors                       []SecuritySensorState `json:"sensors"`
	ScannerMemoryMb               float64               `json:"scannerMemoryMb,omitempty"`
	SupervisorCpuPct              float64               `json:"supervisorCpuPct,omitempty"`
	TelemetryCpuPct               float64               `json:"telemetryCpuPct,omitempty"`
	ReportedAt                    string                `json:"reportedAt"`
}

// SecurityProcessContext describes a process involved in a security detection.
type SecurityProcessContext struct {
	PID     int    `json:"pid,omitempty"`
	PPID    int    `json:"ppid,omitempty"`
	Name    string `json:"name,omitempty"`
	ExePath string `json:"exePath,omitempty"`
	Cmdline string `json:"cmdline,omitempty"`
	SHA256  string `json:"sha256,omitempty"`
	User    string `json:"user,omitempty"`
	Signed  *bool  `json:"signed,omitempty"`
	Signer  string `json:"signer,omitempty"`
}

// SecurityFileContext describes a file artifact involved in a security detection.
type SecurityFileContext struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256,omitempty"`
	Action string `json:"action,omitempty"` // "created" | "modified" | "renamed" | "deleted" | "quarantined"
}

// SecurityNetworkContext describes network telemetry associated with a security detection.
type SecurityNetworkContext struct {
	SrcIP         string `json:"srcIp,omitempty"`
	SrcPort       int    `json:"srcPort,omitempty"`
	DstIP         string `json:"dstIp,omitempty"`
	DstPort       int    `json:"dstPort,omitempty"`
	Proto         string `json:"proto,omitempty"`
	Domain        string `json:"domain,omitempty"`
	ASN           string `json:"asn,omitempty"`
	Country       string `json:"country,omitempty"`
	UniFiSiteID   string `json:"unifiSiteId,omitempty"`
	UniFiClientID string `json:"unifiClientId,omitempty"`
	VLANID        int    `json:"vlanId,omitempty"`
	SwitchID      string `json:"switchId,omitempty"`
	SwitchPort    int    `json:"switchPort,omitempty"`
	APID          string `json:"apId,omitempty"`
	SSID          string `json:"ssid,omitempty"`
	Blocked       *bool  `json:"blocked,omitempty"`
}

// SecurityDetectionInput represents an endpoint detection event reported to the control plane.
type SecurityDetectionInput struct {
	EventID            string                  `json:"eventId"`
	IdempotencyKey     string                  `json:"idempotencyKey"`
	EventTime          string                  `json:"eventTime"`
	SourceProvider     string                  `json:"sourceProvider"` // "apex_agent" | "wazuh" | "velociraptor" | "clamav" | "yara_x" | "osquery" | "unifi_ids" | "unifi_syslog" | "unifi_flow"
	RuleID             string                  `json:"ruleId"`
	RuleName           string                  `json:"ruleName"`
	Severity           string                  `json:"severity"`   // "info" | "low" | "medium" | "high" | "critical"
	Confidence         float64                 `json:"confidence"` // 0.0 - 1.0
	Category           string                  `json:"category"`   // "malware" | "ransomware" | "recovery_inhibition" | "persistence" | "canary_tripwire" | "lateral_movement" | "network_ids" | "unifi_anomaly" | "wifi_diagnostic" | "av_tamper" | "policy_violation"
	Summary            string                  `json:"summary"`
	Process            *SecurityProcessContext `json:"process,omitempty"`
	File               *SecurityFileContext    `json:"file,omitempty"`
	Network            *SecurityNetworkContext `json:"network,omitempty"`
	RawEvidence        map[string]interface{}  `json:"rawEvidence,omitempty"`
	IsBenignSimulation bool                    `json:"isBenignSimulation,omitempty"`
}

// AgentUpdate is the control plane's self-update directive (newer build available).
type AgentUpdate struct {
	Version string `json:"version"`
	URL     string `json:"url"`
	SHA256  string `json:"sha256"`
}

// CollectorCandidacy is the agent's pitch to be (or remain) the site collector.
type CollectorCandidacy struct {
	Platform   string  `json:"platform"`   // "macos" | "windows" | "linux"
	UptimeDays float64 `json:"uptimeDays"` // longer = steadier candidate
	Wired      bool    `json:"wired"`      // wired preferred over wireless
	CanRawScan bool    `json:"canRawScan"` // privileged raw sockets available
	Prefixes   []string `json:"prefixes"`  // CIDRs this host can reach
	IsCollector bool   `json:"isCollector"` // currently holds the role (helps sticky election)
}

// ScanConfig is the collector's marching orders, returned in the heartbeat.
type ScanConfig struct {
	Enabled         bool       `json:"enabled"`
	Prefixes        []string   `json:"prefixes,omitempty"`        // empty ⇒ auto-detect
	FullIntervalMin int        `json:"fullIntervalMin,omitempty"` // default 30
	LiveIntervalMin int        `json:"liveIntervalMin,omitempty"` // default 5
	SNMP            []SNMPCred `json:"snmp,omitempty"`
	ScanNow         bool       `json:"scanNow,omitempty"` // one-shot on-demand trigger
}

// SNMPCred mirrors netscan.SNMPCred (kept here so the client stays leaf-level).
type SNMPCred struct {
	Version   string `json:"version"`
	Community string `json:"community,omitempty"`
	User      string `json:"user,omitempty"`
	AuthKey   string `json:"authKey,omitempty"`
	AuthAlg   string `json:"authAlg,omitempty"`
	PrivKey   string `json:"privKey,omitempty"`
	PrivAlg   string `json:"privAlg,omitempty"`
}

// DeviceCommand represents an operational command dispatched to the agent.
type DeviceCommand struct {
	ID          string                 `json:"id"`
	DeviceId    string                 `json:"deviceId"`
	OrgId       string                 `json:"orgId"`
	CommandType string                 `json:"commandType"`
	Payload     map[string]interface{} `json:"payload"`
	Status      string                 `json:"status"`
	Output      string                 `json:"output,omitempty"`
	Error       string                 `json:"error,omitempty"`
	CreatedAt   string                 `json:"createdAt"`
}

// AgentHeartbeatResponse returned from POST /api/v1/agents/heartbeat.
type AgentHeartbeatResponse struct {
	Acknowledged    bool            `json:"acknowledged"`
	ServerTime      string          `json:"serverTime"`
	PendingCommands []DeviceCommand `json:"pendingCommands"`
	// Collector election result.
	Collector             bool        `json:"collector"`
	CollectorLeaseSeconds int         `json:"collectorLeaseSeconds,omitempty"`
	ScanConfig            *ScanConfig `json:"scanConfig,omitempty"`
	// Self-update directive (present only when a newer build is available).
	Update *AgentUpdate `json:"update,omitempty"`
}

// NetworkScanRequest payload for POST /api/v1/agents/network-scan. Scan is the
// netscan.Result, carried as raw JSON so the client package stays dependency-free.
type NetworkScanRequest struct {
	DeviceId     string          `json:"deviceId"`
	DeviceSecret string          `json:"deviceSecret"`
	Scan         json.RawMessage `json:"scan"`
}

// CommandResultRequest payload for POST /api/v1/agents/command-result.
type CommandResultRequest struct {
	CommandID string `json:"commandId"`
	Status    string `json:"status"` // "completed" | "failed"
	Output    string `json:"output,omitempty"`
	Error     string `json:"error,omitempty"`
}
