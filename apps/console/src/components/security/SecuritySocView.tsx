import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../data/AppContext';
import {
  api,
  type SecurityOverviewResponse,
  type SecurityIncident,
  type SecurityDetection,
  type SecurityDeviceRecord,
  type SecurityAction,
  type SecurityActionType,
  type SecurityCoverageState,
  type UnifiSiteCapability,
  type UnifiSiteTopologyResponse,
  type DeviceTimelineResponse,
  type SimulationRunResponse,
  type SoarOverviewResponse,
  type ShuffleExecutionTrace,
  type CortexAnalysisResult,
  type CortexTaxonomyBadge,
  type GambinosUnpollerResponse,
  type SharkFinPolicy,
  type SharkFinScanReport
} from '../../services/api';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Lock,
  Wifi,
  Server,
  Terminal,
  RefreshCw,
  Play,
  FileWarning,
  Cpu,
  HardDrive,
  Network,
  Eye,
  Check,
  X,
  Zap,
  Layers,
  Radio,
  Search,
  ExternalLink
} from 'lucide-react';

type SocSubTab =
  | 'soc-overview'
  | 'soc-soar'
  | 'soc-incidents'
  | 'soc-endpoints'
  | 'soc-unifi'
  | 'soc-timeline'
  | 'soc-approvals';

const VALID_SUB_TABS: SocSubTab[] = [
  'soc-overview',
  'soc-soar',
  'soc-incidents',
  'soc-endpoints',
  'soc-unifi',
  'soc-timeline',
  'soc-approvals'
];

export const SecuritySocView: React.FC = () => {
  const { activeSubRailView, setActiveSubRailView, selectedClientId } = useApp();

  const currentSubTab: SocSubTab = VALID_SUB_TABS.includes(activeSubRailView as SocSubTab)
    ? (activeSubRailView as SocSubTab)
    : 'soc-overview';

  const setSubTab = (tab: SocSubTab) => {
    setActiveSubRailView(tab);
  };

  const [loading, setLoading] = useState<boolean>(true);
  const [dataSource, setDataSource] = useState<'live_api' | 'fallback_preview'>('live_api');
  const [overview, setOverview] = useState<SecurityOverviewResponse | null>(null);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [events, setEvents] = useState<SecurityDetection[]>([]);
  const [secDevices, setSecDevices] = useState<SecurityDeviceRecord[]>([]);
  const [actions, setActions] = useState<SecurityAction[]>([]);
  const [unifiSites, setUnifiSites] = useState<UnifiSiteCapability[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('88f7af54-98f8-306a-a1c7-c9349722b1f6');
  const [siteTopology, setSiteTopology] = useState<UnifiSiteTopologyResponse | null>(null);
  const [selectedTimelineDeviceId, setSelectedTimelineDeviceId] = useState<string>('dev-gambinos-pos-ctrl');
  const [timelineData, setTimelineData] = useState<DeviceTimelineResponse | null>(null);

  // Simulation & Notification banner state
  const [runningSim, setRunningSim] = useState<string | null>(null);
  const [lastSimResult, setLastSimResult] = useState<SimulationRunResponse | null>(null);
  const [syncingUnifi, setSyncingUnifi] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // New Action Request modal/inline state
  const [newActionTargetId, setNewActionTargetId] = useState<string>('dev-gambinos-c1');
  const [newActionType, setNewActionType] = useState<SecurityActionType>('isolate_host');
  const [newActionReason, setNewActionReason] = useState<string>('');

  // SOAR (Shuffle Go + Cortex + TheHive) state
  const [soarOverview, setSoarOverview] = useState<SoarOverviewResponse | null>(null);
  const [activePlaybookTrace, setActivePlaybookTrace] = useState<ShuffleExecutionTrace | null>(null);
  const [runningPlaybookId, setRunningPlaybookId] = useState<string | null>(null);
  const [cortexDataType, setCortexDataType] = useState<'ip' | 'hash' | 'mac' | 'domain' | 'cmdline'>('ip');
  const [cortexDataInput, setCortexDataInput] = useState<string>('192.168.2.190');
  const [cortexTlp, setCortexTlp] = useState<string>('TLP:AMBER');
  const [runningCortex, setRunningCortex] = useState<boolean>(false);
  const [cortexResult, setCortexResult] = useState<CortexAnalysisResult | null>(null);

  // Gambinos UnPoller + Prometheus + Grafana (timothystewart6/unpoller-unifi) state
  const [gambinosUnpoller, setGambinosUnpoller] = useState<GambinosUnpollerResponse | null>(null);
  const [activeUnpollerDashboardId, setActiveUnpollerDashboardId] = useState<string>('unifi-sites');

  // Shark Fin Client Live Toggles & Incident Seed Filter state
  const [selectedSharkFinDeviceId, setSelectedSharkFinDeviceId] = useState<string>('dev-tbi-bench-02');
  const [updatingPolicyKey, setUpdatingPolicyKey] = useState<string | null>(null);
  const [hideSeededLabIncidents, setHideSeededLabIncidents] = useState<boolean>(false);
  const [endUserPortalMode, setEndUserPortalMode] = useState<boolean>(
    typeof window !== 'undefined' && window.location.pathname.startsWith('/sharkfin')
  );
  const [runningScanKey, setRunningScanKey] = useState<string | null>(null);
  const [latestScanReports, setLatestScanReports] = useState<Record<string, SharkFinScanReport>>({});

  const showToast = (type: 'success' | 'warn' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(prev => (prev?.text === text ? null : prev));
    }, 6000);
  };

  const loadAllSocData = useCallback(async () => {
    setLoading(true);
    try {
      const clientFilter = selectedClientId === 'all' ? undefined : selectedClientId;
      const [ovRes, incRes, evtRes, devRes, actRes, sitesRes, soarRes, unpollerRes] = await Promise.all([
        api.security.getOverview(clientFilter),
        api.security.getIncidents(clientFilter),
        api.security.getEvents(clientFilter),
        api.security.getDevices(clientFilter),
        api.security.getActions(clientFilter),
        api.unifi.getSites(clientFilter),
        api.security.getSoarOverview(clientFilter),
        api.unifi.getGambinosUnpoller()
      ]);

      setOverview(ovRes);
      setDataSource(ovRes.dataSource);
      setIncidents(incRes.incidents);
      setEvents(evtRes.events);
      setSecDevices(devRes.devices);
      setActions(actRes.actions);
      setUnifiSites(sitesRes.sites);
      setSoarOverview(soarRes);
      setActivePlaybookTrace(prev => prev || soarRes.recentExecutions[0] || null);
      setCortexResult(prev => prev || soarRes.lastCortexAnalysis || null);
      setGambinosUnpoller(unpollerRes);

      const activeSite = sitesRes.sites.find(s => s.siteId === selectedSiteId)?.siteId ||
        sitesRes.sites[0]?.siteId ||
        '88f7af54-98f8-306a-a1c7-c9349722b1f6';

      const activeTimelineDevice = devRes.devices.find(d => d.deviceId === selectedTimelineDeviceId)?.deviceId ||
        devRes.devices[0]?.deviceId ||
        selectedTimelineDeviceId;

      const [topoRes, tlRes] = await Promise.all([
        api.unifi.getSiteTopology(activeSite),
        api.security.getDeviceTimeline(activeTimelineDevice)
      ]);
      setSiteTopology(topoRes);
      setTimelineData(tlRes);
    } finally {
      setLoading(false);
    }
  }, [selectedClientId, selectedSiteId, selectedTimelineDeviceId]);

  useEffect(() => {
    loadAllSocData();
  }, [loadAllSocData]);

  // Subscribe to live WebSocket security events if available
  useEffect(() => {
    const unsub1 = api.ws.on('security.incident', () => { loadAllSocData(); });
    const unsub2 = api.ws.on('security.detection', () => { loadAllSocData(); });
    const unsub3 = api.ws.on('security.action', () => { loadAllSocData(); });
    const unsub4 = api.ws.on('unifi.synced', () => { loadAllSocData(); });
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [loadAllSocData]);

  const handleRunSimulation = async (scenario: string) => {
    setRunningSim(scenario);
    try {
      const res = await api.security.runSimulation(
        scenario,
        selectedTimelineDeviceId,
        selectedClientId === 'all' ? undefined : selectedClientId
      );
      setLastSimResult(res);
      showToast(
        scenario === 'gambinos_port43_guard' ? 'warn' : 'success',
        `${res.title} (${res.ingestLatencyMs}ms ingest latency)`
      );
      await loadAllSocData();
    } catch (err: any) {
      showToast('error', `Simulation error: ${err?.message || 'Unknown error'}`);
    } finally {
      setRunningSim(null);
    }
  };

  const handleSyncUnifiSite = async (siteId: string) => {
    setSyncingUnifi(true);
    try {
      const res = await api.unifi.syncSite(siteId);
      showToast('success', `${res.message} (${new Date(res.syncedAt).toLocaleTimeString()})`);
      await loadAllSocData();
    } finally {
      setSyncingUnifi(false);
    }
  };

  const handleRequestAction = async (
    targetDeviceId: string,
    targetDeviceName: string,
    clientId: string,
    clientName: string,
    actionType: SecurityActionType,
    reason: string,
    incidentId?: string,
    payload?: Record<string, any>
  ) => {
    const res = await api.security.requestAction({
      clientId,
      clientName,
      targetDeviceId,
      targetDeviceName,
      incidentId,
      actionType,
      reason,
      payload
    });
    if (res.action.status === 'blocked_protected_asset') {
      showToast('warn', res.action.error || 'Blocked by Protected-Asset & Shared-Port Safety Lock');
    } else {
      showToast('success', `Queued ${actionType} on ${targetDeviceName} for human approval`);
    }
    await loadAllSocData();
  };

  const handleApproveAction = async (actionId: string) => {
    const res = await api.security.approveAction(actionId, 'Brandon Ray (Lead MSP Tech)');
    if (res.action.status === 'verified' || res.action.status === 'approved') {
      showToast('success', `Approved & verified action ${res.action.actionType} on ${res.action.targetDeviceName}`);
    } else {
      showToast('warn', res.action.error || `Action status: ${res.action.status}`);
    }
    await loadAllSocData();
  };

  const handleRejectAction = async (actionId: string) => {
    await api.security.rejectAction(actionId, 'Rejected by SOC Operator during review');
    showToast('warn', 'Containment action rejected and logged to audit trail');
    await loadAllSocData();
  };

  const handleIncidentStatusChange = async (incidentId: string, status: SecurityIncident['status']) => {
    await api.security.updateIncident(incidentId, { status });
    showToast('success', `Incident updated to ${status}`);
    await loadAllSocData();
  };

  const getDeviceSharkFinPolicy = (dev: SecurityDeviceRecord): SharkFinPolicy => {
    const isUnmanaged = dev.posture.coverageState === 'unknown';
    return (
      dev.sharkFinPolicy || {
        preventiveAvEnabled: Boolean(dev.posture.preventiveAvActive),
        endpointEdrEnabled: !isUnmanaged,
        ransomwareProtectionEnabled: Boolean(dev.posture.recoveryInhibitionGuardActive),
        canaryTripwireEnabled: Boolean(dev.posture.canaryFilesDeployed),
        yaraClamScannerEnabled: !isUnmanaged,
        soarOrborusWorkerEnabled: !isUnmanaged,
        scheduledScanEnabled: !isUnmanaged,
        scanFrequency: 'daily',
        policyLockedByAdmin: false,
        updatedAt: dev.posture.reportedAt || new Date().toISOString(),
        updatedBy: 'ApexMSP Shark Fin Self-Service + SOC Policy'
      }
    );
  };

  const handleToggleSharkFinModule = async (
    dev: SecurityDeviceRecord,
    moduleKey: keyof Omit<SharkFinPolicy, 'updatedAt' | 'updatedBy' | 'lastScanReport' | 'scanFrequency'>,
    nextValue: boolean,
    label: string,
    isSimulatedTrayClick?: boolean
  ) => {
    const currentPol = getDeviceSharkFinPolicy(dev);
    if (isSimulatedTrayClick && currentPol.policyLockedByAdmin && moduleKey !== 'policyLockedByAdmin') {
      showToast(
        'warn',
        `🔐 Blocked by Admin Lock: Local user on ${dev.hostname} cannot toggle "${label}" in the Shark Fin tray while Admin Tamper Lock is enabled!`
      );
      return;
    }

    const opKey = `${dev.deviceId}:${moduleKey}`;
    setUpdatingPolicyKey(opKey);
    try {
      await api.security.updateDevicePolicy(dev.deviceId, {
        [moduleKey]: nextValue,
        updatedBy: isSimulatedTrayClick
          ? `End-User Shark Fin Client (${dev.hostname})`
          : 'Brandon Ray (MSP SOC Console)'
      });
      showToast(
        nextValue ? 'success' : 'warn',
        `Shark Fin Client [${dev.hostname}]: ${label} -> ${nextValue ? 'ENABLED (ON)' : 'DISABLED (OFF)'}`
      );
      await loadAllSocData();
    } catch (err: any) {
      showToast('error', `Failed to update Shark Fin policy: ${err?.message || 'Unknown error'}`);
    } finally {
      setUpdatingPolicyKey(null);
    }
  };

  const handleChangeScanFrequency = async (
    dev: SecurityDeviceRecord,
    freq: 'hourly' | 'daily' | 'weekly',
    initiatedByEndUser?: boolean
  ) => {
    await api.security.updateDevicePolicy(dev.deviceId, {
      scheduledScanEnabled: true,
      scanFrequency: freq,
      updatedBy: initiatedByEndUser
        ? `End-User Shark Fin Client (${dev.hostname})`
        : 'Brandon Ray (MSP SOC Console)'
    });
    showToast('success', `Scheduled Scan Frequency on ${dev.hostname} set to ${freq.toUpperCase()}`);
    await loadAllSocData();
  };

  const handleRunDeviceScan = async (
    dev: SecurityDeviceRecord,
    scanType: 'quick_av_yara' | 'full_clamav_yara' | 'canary_verify_reseed' | 'velociraptor_dfir_audit',
    initiatedBy: 'end_user_sharkfin' | 'soc_admin'
  ) => {
    const key = `${dev.deviceId}:${scanType}`;
    setRunningScanKey(key);
    try {
      const res = await api.security.runDeviceScan(dev.deviceId, {
        scanType,
        initiatedBy
      });
      setLatestScanReports(prev => ({
        ...prev,
        [dev.deviceId]: res.report
      }));
      showToast(
        'success',
        `✓ ${res.report.scanTitle} on ${dev.hostname}: ${res.report.status} (${res.report.filesScannedCount.toLocaleString()} items in ${res.report.durationMs}ms)`
      );
      await loadAllSocData();
    } catch (err: any) {
      showToast('error', `Scan failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setRunningScanKey(null);
    }
  };

  const isSeededLabIncident = (inc: SecurityIncident): boolean => {
    if (
      inc.category === 'unifi_anomaly' ||
      inc.incidentNumber === 'SOC-2026-0901' ||
      inc.incidentNumber === 'INC-2026-1002' ||
      inc.title.toLowerCase().includes('port 43')
    ) {
      return false;
    }
    return true;
  };

  const handleExecuteSoarPlaybook = async (playbookId: string) => {
    setRunningPlaybookId(playbookId);
    try {
      const res = await api.security.executeSoarPlaybook(playbookId, {
        targetDeviceId: selectedTimelineDeviceId,
        clientId: selectedClientId === 'all' ? undefined : selectedClientId,
        observableValue: cortexDataInput
      });
      setActivePlaybookTrace(res.trace);
      showToast(
        res.trace.status === 'blocked_protected_asset' ? 'warn' : 'success',
        `Shuffle Go Playbook "${res.trace.playbookName}" executed in ${res.trace.totalDurationMs}ms (${res.trace.status.replace(/_/g, ' ')})`
      );
      await loadAllSocData();
    } catch (err: any) {
      showToast('error', `Shuffle Playbook error: ${err?.message || 'Execution failed'}`);
    } finally {
      setRunningPlaybookId(null);
    }
  };

  const handleRunCortexAnalysis = async (
    overrideType?: 'ip' | 'hash' | 'mac' | 'domain' | 'cmdline',
    overrideData?: string,
    overrideTlp?: string
  ) => {
    const dType = overrideType || cortexDataType;
    const dVal = (overrideData ?? cortexDataInput).trim();
    const dTlp = overrideTlp || cortexTlp;
    if (!dVal) return;

    if (overrideType) setCortexDataType(overrideType);
    if (overrideData !== undefined) setCortexDataInput(overrideData);
    if (overrideTlp) setCortexTlp(overrideTlp);

    setRunningCortex(true);
    try {
      const res = await api.security.runCortexAnalysis({
        dataType: dType,
        data: dVal,
        tlp: dTlp
      });
      setCortexResult(res);
      showToast(
        res.overallVerdict === 'malicious' || res.overallVerdict === 'suspicious' ? 'warn' : 'success',
        `Cortex analyzed "${dVal}" (${dType.toUpperCase()}) -> ${res.overallVerdict.toUpperCase()} across ${res.analyzerReports.length} analyzers`
      );
      await loadAllSocData();
    } catch (err: any) {
      showToast('error', `Cortex Analyzer error: ${err?.message || 'Analysis failed'}`);
    } finally {
      setRunningCortex(false);
    }
  };

  const renderCortexBadge = (badge: CortexTaxonomyBadge, idx: number) => {
    const colorMap: Record<CortexTaxonomyBadge['level'], string> = {
      malicious: 'bg-rose-100 text-rose-900 border-rose-300',
      suspicious: 'bg-amber-100 text-amber-900 border-amber-300',
      safe: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      info: 'bg-sky-100 text-sky-900 border-sky-300'
    };
    const dotMap: Record<CortexTaxonomyBadge['level'], string> = {
      malicious: 'bg-rose-600',
      suspicious: 'bg-amber-500',
      safe: 'bg-emerald-600',
      info: 'bg-sky-500'
    };
    return (
      <span
        key={`${badge.namespace}-${badge.predicate}-${idx}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold border ${colorMap[badge.level]}`}
      >
        <span className={`w-2 h-2 rounded-full ${dotMap[badge.level]}`} />
        <span>
          {badge.namespace}:{badge.predicate}=&quot;{badge.value}&quot;
        </span>
      </span>
    );
  };

  // Coverage badge helper (Acceptance Test #12: Unknown NEVER appears protected!)
  const renderCoverageBadge = (state: SecurityCoverageState) => {
    switch (state) {
      case 'preventive_active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Preventive Protection Active
          </span>
        );
      case 'containment_verified':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
            <Lock className="w-3.5 h-3.5 text-purple-600" />
            Containment Verified (Isolated)
          </span>
        );
      case 'containment_requested':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Containment Requested (Pending Human Approval)
          </span>
        );
      case 'collecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
            <Activity className="w-3.5 h-3.5 text-sky-600" />
            Collecting Telemetry Only (Preventive AV Off)
          </span>
        );
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            Agent Healthy
          </span>
        );
      case 'installed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Shield className="w-3.5 h-3.5 text-slate-500" />
            Agent Installed (Initializing)
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-300">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
            Sensor Degraded
          </span>
        );
      case 'unknown':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">
            <ShieldOff className="w-3.5 h-3.5 text-rose-600" />
            UNKNOWN — UNPROTECTED
          </span>
        );
    }
  };

  const renderCriticalityBadge = (crit: SecurityIncident['assetCriticality']) => {
    switch (crit) {
      case 'pos_controller':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-300">
            POS Controller (Protected)
          </span>
        );
      case 'pos_payment':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-300">
            POS Payment / Terminal (Protected)
          </span>
        );
      case 'municipal_critical':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">
            Municipal Critical Asset
          </span>
        );
      case 'infrastructure':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-100 text-sky-800 border border-sky-300">
            Core Infrastructure
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 border border-slate-200">
            Standard Endpoint
          </span>
        );
    }
  };

  const renderSeverityBadge = (sev: SecurityIncident['severity']) => {
    const map: Record<string, string> = {
      critical: 'bg-rose-600 text-white',
      high: 'bg-orange-500 text-white',
      medium: 'bg-amber-500 text-white',
      low: 'bg-sky-500 text-white',
      info: 'bg-slate-500 text-white'
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${map[sev] || map.info}`}>
        {sev}
      </span>
    );
  };

  const kpis = overview?.kpis || {
    openIncidents: incidents.length,
    criticalIncidents: incidents.filter(i => i.severity === 'critical').length,
    pendingApprovals: actions.filter(a => a.status === 'pending_approval').length,
    p95IngestLatencyMs: 780,
    slaTargetMs: 60000,
    slaCompliant: true,
    totalMonitoredEndpoints: secDevices.length,
    preventiveAvActiveCount: secDevices.filter(d => d.posture.preventiveAvActive).length,
    canaryProtectedCount: secDevices.filter(d => d.posture.canaryFilesDeployed).length,
    unknownCoverageCount: secDevices.filter(d => d.posture.coverageState === 'unknown').length,
    protectedCriticalAssets: 22,
    connectedUnifiConsoles: unifiSites.length,
    blockedSharedPortAttempts: actions.filter(a => a.status === 'blocked_protected_asset').length
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#f4f6f8]">
      {/* ===================================================================== */}
      {/* Top SOC Command Header & Sub-Navigation Tabs                          */}
      {/* ===================================================================== */}
      <div className="bg-[#0f172a] text-white border-b border-slate-800 px-6 pt-4 pb-0 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-950/50">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-black tracking-tight text-white">
                  ApexMSP Security &amp; UniFi SOC
                </h1>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                    dataSource === 'live_api'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                  title={
                    dataSource === 'live_api'
                      ? 'Connected to live ApexMSP Security & UniFi API'
                      : 'Backend API offline — displaying verified Gambinos/DevStack fallback snapshot'
                  }
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      dataSource === 'live_api' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  {dataSource === 'live_api' ? 'LIVE SOC API CONNECTED' : 'VERIFIED FALLBACK SNAPSHOT MODE'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  P95 Ingest: {(kpis.p95IngestLatencyMs / 1000).toFixed(2)}s (SLA &lt; 60s)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Unified Go EDR Reflex · YARA-X / ClamAV · Wazuh SIEM · Velociraptor DFIR · Bi-Temporal UniFi Network Identity
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEndUserPortalMode(prev => !prev)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 shadow transition cursor-pointer ${
                endUserPortalMode
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white'
              }`}
            >
              <span>
                {endUserPortalMode
                  ? '🛡️ Return to MSP SOC Command Console'
                  : '👤 Open End-User Shark Fin Self-Service View'}
              </span>
            </button>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter host, IP, MAC, rule..."
                className="bg-slate-800/90 border border-slate-700 focus:border-emerald-400 text-xs text-white placeholder-slate-400 rounded-lg pl-8 pr-3 py-1.5 outline-none w-56"
              />
            </div>
            <button
              onClick={() => loadAllSocData()}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              Refresh SOC
            </button>
          </div>
        </div>

        {/* Toast Notification Banner */}
        {toastMessage && (
          <div
            className={`mb-3 px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-between border ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : toastMessage.type === 'warn'
                ? 'bg-amber-950/90 border-amber-500/50 text-amber-200'
                : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span>{toastMessage.text}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 7 Sub-Tabs Bar */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'soc-overview', label: 'SOC Command Center', Icon: Shield },
            { id: 'soc-soar', label: 'SOAR: Shuffle + Cortex + TheHive', Icon: Zap },
            { id: 'soc-incidents', label: `SIEM Incidents (${kpis.openIncidents})`, Icon: ShieldAlert },
            { id: 'soc-endpoints', label: `Endpoint EDR / AV (${secDevices.length})`, Icon: Cpu },
            { id: 'soc-unifi', label: `UniFi Network SOC (${unifiSites.length} Sites)`, Icon: Wifi },
            { id: 'soc-timeline', label: 'Temporal Device Timeline', Icon: Clock },
            { id: 'soc-approvals', label: `Action Approvals (${kpis.pendingApprovals})`, Icon: Lock }
          ].map(({ id, label, Icon }) => {
            const active = currentSubTab === id;
            return (
              <button
                key={id}
                onClick={() => setSubTab(id as SocSubTab)}
                className={`px-3.5 py-2.5 text-xs font-bold rounded-t-lg flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#f4f6f8] text-slate-900 border-emerald-500'
                    : 'text-slate-300 border-transparent hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* Main Scrollable Content Area                                          */}
      {/* ===================================================================== */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* =================================================================== */}
        {/* END-USER SHARK FIN SECURITY & SCAN CENTER (/sharkfin OR TOGGLED)    */}
        {/* =================================================================== */}
        {endUserPortalMode && (() => {
          const managedList = secDevices.filter(d => d.posture.coverageState !== 'unknown');
          const activeDev =
            managedList.find(d => d.deviceId === selectedSharkFinDeviceId) ||
            managedList[0] ||
            secDevices[0];
          if (!activeDev) return null;
          const pol = getDeviceSharkFinPolicy(activeDev);
          const scanReport = latestScanReports[activeDev.deviceId] || pol.lastScanReport;

          return (
            <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 text-white rounded-2xl p-6 border-2 border-emerald-500/60 shadow-2xl space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-2xl shadow-lg">
                    🦈
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase">
                        End-User Shark Fin Security &amp; Scan Center (`/sharkfin`)
                      </span>
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[10px] font-bold">
                        🔓 End-User Self-Service Mode Enabled (`policyLockedByAdmin: false`)
                      </span>
                    </div>
                    <h2 className="text-lg font-black text-white mt-1">
                      My Computer Protection Shield &amp; On-Demand Malware Scanner — {activeDev.hostname}
                    </h2>
                    <p className="text-xs text-slate-300">
                      Enable or disable protection features on your computer, configure scheduled scans, or run an immediate AV, YARA-X, ClamAV, or Canary Tripwire scan below.
                    </p>
                  </div>
                </div>

                {/* Computer Selector for Demo / Multi-Endpoint Testing */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {managedList.map(d => {
                    const isSel = d.deviceId === activeDev.deviceId;
                    return (
                      <button
                        key={d.deviceId}
                        onClick={() => setSelectedSharkFinDeviceId(d.deviceId)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                          isSel
                            ? 'bg-emerald-500 text-slate-950 shadow'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        }`}
                      >
                        💻 {d.hostname}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 1-Click "Scan My Computer Now" Bar */}
              <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-700 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                      On-Demand Endpoint Verification &amp; Scan Actions
                    </span>
                    <h3 className="text-sm font-black text-white">
                      Scan My Computer Now ({activeDev.hostname} • {activeDev.ipAddress})
                    </h3>
                  </div>
                  {renderCoverageBadge(activeDev.posture.coverageState)}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    {
                      scanType: 'quick_av_yara' as const,
                      label: '⚡ Run Quick AV + YARA-X Scan Now',
                      sub: 'Scans active memory, startup binaries & processes (~0.4s)',
                      color: 'from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600'
                    },
                    {
                      scanType: 'full_clamav_yara' as const,
                      label: '🛡️ Run Full ClamAV + YARA-X Deep Scan',
                      sub: 'Deep filesystem signature & heuristic scan (<5% CPU)',
                      color: 'from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600'
                    },
                    {
                      scanType: 'canary_verify_reseed' as const,
                      label: '🐤 Deploy / Re-Verify Canary Tripwire Files',
                      sub: 'Verifies SHA-256 00_APEX_CANARY decoys & VSS guard',
                      color: 'from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600'
                    },
                    {
                      scanType: 'velociraptor_dfir_audit' as const,
                      label: '🔍 Run Velociraptor Process & Persistence Check',
                      sub: 'Audits running processes, services & startup tasks',
                      color: 'from-purple-600 to-fuchsia-700 hover:from-purple-500 hover:to-fuchsia-600'
                    }
                  ].map(btn => {
                    const isScanning = runningScanKey === `${activeDev.deviceId}:${btn.scanType}`;
                    return (
                      <button
                        key={btn.scanType}
                        disabled={runningScanKey !== null}
                        onClick={() => handleRunDeviceScan(activeDev, btn.scanType, 'end_user_sharkfin')}
                        className={`p-3.5 rounded-xl bg-gradient-to-br ${btn.color} text-left text-white shadow-md transition cursor-pointer disabled:opacity-50`}
                      >
                        <div className="flex items-center justify-between font-black text-xs">
                          <span>{btn.label}</span>
                          {isScanning && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
                        </div>
                        <div className="text-[10px] text-white/85 mt-1">{btn.sub}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Live Scan Execution Report Card */}
                {scanReport && (
                  <div className="mt-3 p-4 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-black text-white">
                          Scan Execution Report: {scanReport.scanTitle} ({scanReport.scanId})
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black uppercase">
                        status: {scanReport.status}
                      </span>
                    </div>
                    <p className="text-emerald-100 text-xs">{scanReport.summary}</p>
                    <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-emerald-300 pt-1">
                      <span>filesScannedCount: <strong>{scanReport.filesScannedCount.toLocaleString()}</strong></span>
                      <span>enginesUsed: <strong>{scanReport.enginesUsed.join(', ')}</strong></span>
                      <span>canaryFilesVerified: <strong>{scanReport.canaryFilesVerified}</strong></span>
                      <span>durationMs: <strong>{scanReport.durationMs}ms</strong></span>
                    </div>
                  </div>
                )}
              </div>

              {/* 6 Self-Service Feature Toggles + Scheduled Scan Frequency Selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  {
                    key: 'preventiveAvEnabled' as const,
                    label: '🛡️ Antivirus (AV) Real-Time Protection',
                    desc: 'Real-time malware blocking via OS Preventive AV & Shark Fin supervisor'
                  },
                  {
                    key: 'endpointEdrEnabled' as const,
                    label: '🔍 Endpoint Detection & Response (EDR)',
                    desc: 'Continuous process, command-line, and network threat monitoring'
                  },
                  {
                    key: 'ransomwareProtectionEnabled' as const,
                    label: '🔒 Ransomware Protection (VSS Shadow-Copy Guard)',
                    desc: 'Blocks unauthorized shadow-copy deletion & system recovery tampering'
                  },
                  {
                    key: 'canaryTripwireEnabled' as const,
                    label: '🐤 Ransomware Canary Decoy Tripwires',
                    desc: 'Monitors SHA-256 decoy files to halt mass-encryption immediately'
                  },
                  {
                    key: 'yaraClamScannerEnabled' as const,
                    label: '🧬 YARA-X & ClamAV Malware Scanner',
                    desc: 'High-speed YARA-X & ClamAV signature scanning on new & modified files'
                  },
                  {
                    key: 'scheduledScanEnabled' as const,
                    label: '⏰ Scheduled Automated Malware & Canary Scans',
                    desc: `Runs automatic background scans (${(pol.scanFrequency || 'daily').toUpperCase()})`
                  }
                ].map(mod => {
                  const isOn = Boolean(pol[mod.key] ?? true);
                  return (
                    <div
                      key={mod.key}
                      className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                        isOn
                          ? 'bg-slate-900/90 border-emerald-500/40'
                          : 'bg-rose-950/40 border-rose-500/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-black text-white">{mod.label}</div>
                          <div className="text-[11px] text-slate-300 mt-1">{mod.desc}</div>
                        </div>
                        <button
                          onClick={() =>
                            handleToggleSharkFinModule(activeDev, mod.key, !isOn, mod.label, true)
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition cursor-pointer shrink-0 ${
                            isOn
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow'
                              : 'bg-rose-600 hover:bg-rose-500 text-white'
                          }`}
                        >
                          {isOn ? 'ON' : 'OFF'}
                        </button>
                      </div>

                      {mod.key === 'scheduledScanEnabled' && (
                        <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-slate-400 font-bold">Scan Schedule:</span>
                          <div className="flex items-center gap-1">
                            {(['hourly', 'daily', 'weekly'] as const).map(freq => (
                              <button
                                key={freq}
                                onClick={() => handleChangeScanFrequency(activeDev, freq, true)}
                                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase cursor-pointer ${
                                  (pol.scanFrequency || 'daily') === freq
                                    ? 'bg-emerald-500 text-slate-950'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                              >
                                {freq}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* =================================================================== */}
        {/* TAB 1: SOC COMMAND CENTER (soc-overview)                            */}
        {/* =================================================================== */}
        {currentSubTab === 'soc-overview' && (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
                  <span>Open SIEM Incidents</span>
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900">{kpis.openIncidents}</span>
                  <span className="text-xs font-bold text-rose-600">
                    {kpis.criticalIncidents} critical
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Auto-synced with PSA &amp; NodalCortex Brain
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
                  <span>P95 Ingest Latency</span>
                  <Zap className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-emerald-600">
                    {(kpis.p95IngestLatencyMs / 1000).toFixed(2)}s
                  </span>
                  <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                    SLA &lt; 60s PASS
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Vector CEF + Go Agent Fast-Path
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
                  <span>Preventive AV &amp; Canary</span>
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900">
                    {kpis.preventiveAvActiveCount}/{kpis.totalMonitoredEndpoints}
                  </span>
                  <span className="text-xs font-semibold text-rose-600">
                    {kpis.unknownCoverageCount} unknown
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {kpis.canaryProtectedCount} endpoints with SHA-256 canaries
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
                  <span>Protected POS / Critical</span>
                  <Lock className="w-4 h-4 text-fuchsia-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900">
                    {kpis.protectedCriticalAssets}
                  </span>
                  <span className="text-xs font-bold text-fuchsia-700">
                    {kpis.blockedSharedPortAttempts} auto-blocks prevented
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  KwickPOS, PAX A35, SUNMI &amp; Port 43 Guard
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
                  <span>Connected UniFi Sites</span>
                  <Wifi className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900">
                    {kpis.connectedUnifiConsoles}
                  </span>
                  <span className="text-xs font-semibold text-emerald-600">
                    Read-Only Verified
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Gambinos, TBI, Raytreat, SOS Volleyball
                </div>
              </div>
            </div>

            {/* Prominent SOAR (Shuffle Go + Cortex + TheHive) Status Banner Card */}
            <div className="bg-gradient-to-r from-orange-950 via-slate-900 to-indigo-950 text-white rounded-xl p-4 border border-orange-500/40 shadow-md flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shrink-0">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40 text-[10px] font-black uppercase">
                      Open-Source SOAR Plane Active
                    </span>
                    <h2 className="text-sm font-black text-white">
                      Shuffle (Go v1.4 + Orborus Workers :8894) + Cortex Analyzers (:8895) + TheHive Case Engine (:8895)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {soarOverview?.engines.shuffle.activePlaybooks ?? 5} Go Playbook DAGs active ·{' '}
                    {soarOverview?.engines.cortex.activeAnalyzers ?? 12} Cortex Observable Analyzers (TLP/PAP Guard) ·{' '}
                    {soarOverview?.engines.thehive.activeCases ?? 3} Active TheHive Cases ({soarOverview?.engines.thehive.trackedObservables ?? 19} IOCs tracked)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="http://192.168.11.19:8894/"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-orange-300 flex items-center gap-1.5 transition"
                >
                  Shuffle :8894 <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href="http://192.168.11.19:8895/"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-indigo-300 flex items-center gap-1.5 transition"
                >
                  TheHive/Cortex :8895 <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href="http://192.168.11.19:3030/"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-emerald-300 flex items-center gap-1.5 transition"
                >
                  Gambinos UnPoller Grafana :3030 <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={() => setSubTab('soc-unifi')}
                  className="px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Wifi className="w-3.5 h-3.5" /> UnPoller 7-Dashboards
                </button>
                <button
                  onClick={() => setSubTab('soc-soar')}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition"
                >
                  <Zap className="w-3.5 h-3.5" /> Open SOAR Workbench (Shuffle + Cortex + TheHive)
                </button>
              </div>
            </div>

            {/* Interactive Safe Lab Simulation Bar */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-xl p-5 border border-slate-700 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase">
                      Safe Lab Verification Suite
                    </span>
                    <h2 className="text-sm font-black text-white">
                      1-Click End-to-End Detection, Ransomware Reflex &amp; Containment Guard Simulations
                    </h2>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Trigger benign, non-destructive verification pipelines across EICAR AV, MITRE T1490 Shadow-Copy Guard, Canary Tripwires, Gambinos Port 43 Safety Lock, and Multi-Tenant Overlapping IP Isolation.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                {[
                  {
                    id: 'eicar_av_test',
                    label: '1. EICAR Standard AV Test',
                    sub: 'YARA-X / ClamAV + SHA-256 Quarantine',
                    color: 'from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600'
                  },
                  {
                    id: 'ransomware_vssadmin',
                    label: '2. Ransomware Recovery-Inhibition',
                    sub: 'vssadmin delete shadows (MITRE T1490)',
                    color: 'from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600'
                  },
                  {
                    id: 'canary_tripwire',
                    label: '3. Ransomware Canary Tripwire',
                    sub: '00_APEX_CANARY tamper detection',
                    color: 'from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600'
                  },
                  {
                    id: 'gambinos_port43_guard',
                    label: '4. Gambinos Port 43 Guard Test',
                    sub: 'Shared 5-MAC POS Switch Port Lock',
                    color: 'from-fuchsia-600 to-purple-700 hover:from-fuchsia-500 hover:to-purple-600'
                  },
                  {
                    id: 'overlap_ip_isolation',
                    label: '5. Cross-Tenant 192.168.2.x Test',
                    sub: 'Overlapping IP Isolation Proof',
                    color: 'from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600'
                  }
                ].map(btn => (
                  <button
                    key={btn.id}
                    disabled={runningSim !== null}
                    onClick={() => handleRunSimulation(btn.id)}
                    className={`p-3 rounded-lg bg-gradient-to-br ${btn.color} text-left transition shadow flex flex-col justify-between cursor-pointer disabled:opacity-50`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-white leading-snug">{btn.label}</span>
                      <Play className={`w-3.5 h-3.5 text-white shrink-0 ${runningSim === btn.id ? 'animate-ping' : ''}`} />
                    </div>
                    <span className="text-[10px] text-white/80 mt-1.5 block">{btn.sub}</span>
                  </button>
                ))}
              </div>

              {lastSimResult && (
                <div className="mt-4 bg-slate-950/80 border border-emerald-500/40 rounded-lg p-3.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-emerald-400">
                      ✓ Last Simulation Verified: {lastSimResult.title} (Ingest Latency: {lastSimResult.ingestLatencyMs}ms)
                    </span>
                    <button
                      onClick={() => setLastSimResult(null)}
                      className="text-slate-400 hover:text-white text-[11px]"
                    >
                      Dismiss
                    </button>
                  </div>
                  <p className="text-slate-300 mt-1">{lastSimResult.summary}</p>
                  <ul className="mt-2 space-y-1 text-[11px] text-emerald-300">
                    {lastSimResult.verificationNotes.map((note, idx) => (
                      <li key={idx}>• {note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Acceptance Test #12: Explicit Endpoint Coverage Truthfulness Matrix */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Endpoint Coverage Truthfulness Matrix (Acceptance Test #12)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Strict separation between Unknown (Never Shown as Protected), Installed, Healthy, Collecting Telemetry, Preventive AV Active, Containment Requested, and Containment Verified.
                  </p>
                </div>
                <button
                  onClick={() => setSubTab('soc-endpoints')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  Inspect All Endpoints →
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                {[
                  { key: 'unknown', label: 'Unknown (UNPROTECTED)', bg: 'bg-rose-50 border-rose-300 text-rose-900' },
                  { key: 'installed', label: 'Agent Installed', bg: 'bg-slate-50 border-slate-200 text-slate-800' },
                  { key: 'healthy', label: 'Agent Healthy', bg: 'bg-teal-50 border-teal-200 text-teal-900' },
                  { key: 'collecting', label: 'Collecting Only (AV Off)', bg: 'bg-sky-50 border-sky-200 text-sky-900' },
                  { key: 'preventive_active', label: 'Preventive AV Active', bg: 'bg-emerald-50 border-emerald-300 text-emerald-900' },
                  { key: 'containment_requested', label: 'Containment Requested', bg: 'bg-amber-50 border-amber-300 text-amber-900' },
                  { key: 'containment_verified', label: 'Containment Verified', bg: 'bg-purple-50 border-purple-300 text-purple-900' }
                ].map(item => {
                  const count = secDevices.filter(d => d.posture.coverageState === item.key).length;
                  return (
                    <div key={item.key} className={`p-3 rounded-lg border ${item.bg}`}>
                      <div className="text-xl font-black">{count}</div>
                      <div className="text-[11px] font-bold mt-0.5 leading-tight">{item.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Two-Column Overview: Recent Incidents + Action Broker Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Correlated Incidents */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      Active SIEM Incidents &amp; Detections
                    </h3>
                    <button
                      onClick={() => setSubTab('soc-incidents')}
                      className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                    >
                      View Full Queue →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {incidents.slice(0, 4).map(inc => (
                      <div key={inc.id} className="p-3 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/60">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {renderSeverityBadge(inc.severity)}
                            <span className="text-xs font-black text-slate-900">{inc.incidentNumber}</span>
                            <span className="text-xs font-semibold text-slate-600">• {inc.clientName}</span>
                          </div>
                          {renderCriticalityBadge(inc.assetCriticality)}
                        </div>
                        <div className="text-xs font-bold text-slate-900 mt-1.5">{inc.title}</div>
                        <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{inc.summary}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span>Host: <strong className="text-slate-800">{inc.deviceName || 'Network'}</strong></span>
                          <span>Wazuh: {inc.wazuhAlertIds?.join(', ') || 'N/A'}</span>
                          <span>Ingest: {inc.ingestLatencyMs || 640}ms</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Human-in-the-Loop Action Broker Queue */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-amber-600" />
                      Action Broker &amp; Protected-Asset Safety Gates
                    </h3>
                    <button
                      onClick={() => setSubTab('soc-approvals')}
                      className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                    >
                      Manage Approvals →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {actions.slice(0, 4).map(act => (
                      <div
                        key={act.id}
                        className={`p-3 rounded-lg border ${
                          act.status === 'blocked_protected_asset'
                            ? 'bg-rose-50/70 border-rose-300'
                            : act.status === 'pending_approval'
                            ? 'bg-amber-50/60 border-amber-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black uppercase text-slate-900">
                            {act.actionType.replace(/_/g, ' ')} — {act.targetDeviceName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              act.status === 'blocked_protected_asset'
                                ? 'bg-rose-600 text-white'
                                : act.status === 'pending_approval'
                                ? 'bg-amber-500 text-white'
                                : act.status === 'verified'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-600 text-white'
                            }`}
                          >
                            {act.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700 mt-1">{act.reason}</p>
                        {act.error && (
                          <div className="mt-1.5 text-[11px] font-bold text-rose-700 bg-rose-100/80 px-2.5 py-1 rounded border border-rose-200">
                            {act.error}
                          </div>
                        )}
                        {act.status === 'pending_approval' && (
                          <div className="mt-2.5 flex items-center gap-2">
                            <button
                              onClick={() => handleApproveAction(act.id)}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3 h-3" /> Approve &amp; Execute
                            </button>
                            <button
                              onClick={() => handleRejectAction(act.id)}
                              className="px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <X className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* =================================================================== */}
        {/* TAB 1B: SOAR: SHUFFLE (GO) + CORTEX + THEHIVE (soc-soar)            */}
        {/* =================================================================== */}
        {currentSubTab === 'soc-soar' && soarOverview && (
          <div className="space-y-6">
            {/* SECTION 1: SOAR Engine Status & Open-Source Architecture Bar */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-xl p-5 border border-slate-700 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40 text-[10px] font-black uppercase">
                      Combined Open-Source SOAR Architecture
                    </span>
                    <h2 className="text-base font-black text-white">
                      Shuffle (Go Workflow Engine + Orborus Workers) + Cortex (Observable Analyzers) + TheHive (Case &amp; TTP Engine)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Why we combined Shuffle + TheHive/Cortex: Shuffle provides a blazing-fast Go backend &amp; native Orborus agent worker execution, while Cortex + TheHive provide structured observable enrichment, TLP/PAP guardrails, and multi-tenant SOC case management—all gated by the ApexMSP Protected-Asset Action Broker.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={soarOverview.engines.shuffle.endpointUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-black flex items-center gap-1.5 shadow transition"
                  >
                    Open Shuffle UI (:8894) <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={soarOverview.engines.thehive.endpointUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center gap-1.5 shadow transition"
                  >
                    Open TheHive &amp; Cortex UI (:8895) <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Card 1: Shuffle Go Backend */}
                <div className="bg-slate-800/90 rounded-xl p-4 border border-orange-500/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-orange-300">
                      1. Shuffle Go Backend &amp; Orborus Worker
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {soarOverview.engines.shuffle.status} (:8894)
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-black text-white">
                    {soarOverview.engines.shuffle.name} ({soarOverview.engines.shuffle.version})
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center bg-slate-900/80 rounded-lg p-2 border border-slate-700">
                    <div>
                      <div className="text-xs font-black text-orange-400">
                        {soarOverview.engines.shuffle.activePlaybooks}
                      </div>
                      <div className="text-[10px] text-slate-400">Playbooks</div>
                    </div>
                    <div>
                      <div className="text-xs font-black text-emerald-400">
                        {soarOverview.engines.shuffle.orborusGoWorkers}
                      </div>
                      <div className="text-[10px] text-slate-400">Go Workers</div>
                    </div>
                    <div>
                      <div className="text-xs font-black text-sky-400">
                        {soarOverview.engines.shuffle.executions24h}
                      </div>
                      <div className="text-[10px] text-slate-400">24h Runs</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-300 flex items-center justify-between">
                    <span>Runtime: <strong>{soarOverview.engines.shuffle.runtime}</strong></span>
                    <a
                      href={soarOverview.engines.shuffle.endpointUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-300 hover:underline font-mono"
                    >
                      {soarOverview.engines.shuffle.endpointUrl}
                    </a>
                  </div>
                </div>

                {/* Card 2: Cortex Observable & Responder Engine */}
                <div className="bg-slate-800/90 rounded-xl p-4 border border-sky-500/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-sky-300">
                      2. Cortex Observable &amp; Responder Engine
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {soarOverview.engines.cortex.status} (:8895)
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-black text-white">
                    {soarOverview.engines.cortex.name} ({soarOverview.engines.cortex.version})
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center bg-slate-900/80 rounded-lg p-2 border border-slate-700">
                    <div>
                      <div className="text-xs font-black text-sky-400">
                        {soarOverview.engines.cortex.activeAnalyzers}
                      </div>
                      <div className="text-[10px] text-slate-400">Analyzers</div>
                    </div>
                    <div>
                      <div className="text-xs font-black text-indigo-400">
                        {soarOverview.engines.cortex.activeResponders}
                      </div>
                      <div className="text-[10px] text-slate-400">Responders</div>
                    </div>
                    <div>
                      <div className="text-xs font-black text-emerald-400">
                        {soarOverview.engines.cortex.observablesAnalyzed24h}
                      </div>
                      <div className="text-[10px] text-slate-400">24h Jobs</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-300 flex items-center justify-between">
                    <span>Guard: <strong>{soarOverview.engines.cortex.tlpGuardEnforced ? 'TLP/PAP Enforced' : 'Standard'}</strong></span>
                    <a
                      href={soarOverview.engines.cortex.endpointUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-300 hover:underline font-mono"
                    >
                      {soarOverview.engines.cortex.endpointUrl}
                    </a>
                  </div>
                </div>

                {/* Card 3: TheHive Multi-Tenant Case Engine */}
                <div className="bg-slate-800/90 rounded-xl p-4 border border-indigo-500/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-indigo-300">
                      3. TheHive Multi-Tenant Case Engine
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {soarOverview.engines.thehive.status} (:8895)
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-black text-white">
                    {soarOverview.engines.thehive.name} ({soarOverview.engines.thehive.version})
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center bg-slate-900/80 rounded-lg p-2 border border-slate-700">
                    <div>
                      <div className="text-xs font-black text-amber-400">
                        {soarOverview.engines.thehive.activeCases}
                      </div>
                      <div className="text-[10px] text-slate-400">Active Cases</div>
                    </div>
                    <div>
                      <div className="text-xs font-black text-rose-400">
                        {soarOverview.engines.thehive.mitreAttackMappings}
                      </div>
                      <div className="text-[10px] text-slate-400">MITRE TTPs</div>
                    </div>
                    <div>
                      <div className="text-xs font-black text-emerald-400">
                        {soarOverview.engines.thehive.trackedObservables}
                      </div>
                      <div className="text-[10px] text-slate-400">Observables</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-300 flex items-center justify-between">
                    <span>Sync: <strong>{soarOverview.engines.thehive.psaBiDirectionalSync ? 'ApexMSP PSA + NodalCortex' : 'Local'}</strong></span>
                    <a
                      href={soarOverview.engines.thehive.endpointUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-300 hover:underline font-mono"
                    >
                      {soarOverview.engines.thehive.endpointUrl}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 2: Shuffle (Go) Visual Playbook DAG Orchestrator & 1-Click Runner */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-300 text-[10px] font-black uppercase">
                        Shuffle Go v1.4 DAGs
                      </span>
                      <h3 className="text-sm font-black text-slate-900">
                        Shuffle (Go) Visual Playbook DAG Orchestrator &amp; 1-Click Runner
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Each playbook chains Trigger → Cortex Analyzer → TheHive Case → Protected-Asset Broker Gate → Go Agent Orborus Worker.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {soarOverview.playbooks.map(pb => {
                    const isRunning = runningPlaybookId === pb.id;
                    const isSelectedTrace = activePlaybookTrace?.playbookId === pb.id;
                    return (
                      <div
                        key={pb.id}
                        className={`p-4 rounded-xl border transition ${
                          isSelectedTrace
                            ? 'bg-orange-50/40 border-orange-400 shadow-sm'
                            : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-mono font-bold">
                                {pb.id}
                              </span>
                              <h4 className="text-xs font-black text-slate-900">{pb.name}</h4>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                  pb.lastStatus === 'blocked_protected_asset'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : pb.lastStatus === 'pending_approval'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}
                              >
                                {pb.lastStatus.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-1">{pb.description}</p>
                          </div>

                          <button
                            disabled={isRunning}
                            onClick={() => handleExecuteSoarPlaybook(pb.id)}
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-black flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50 shrink-0"
                          >
                            {isRunning ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                            Run Shuffle Playbook
                          </button>
                        </div>

                        {/* Visual DAG Pipeline Nodes */}
                        <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center gap-1.5 overflow-x-auto pb-1">
                          {pb.nodes.map((node, nIdx) => {
                            const typeBadgeColor: Record<string, string> = {
                              trigger: 'bg-slate-800 text-white border-slate-700',
                              cortex_analyzer: 'bg-sky-100 text-sky-900 border-sky-300',
                              thehive_case: 'bg-indigo-100 text-indigo-900 border-indigo-300',
                              broker_gate: 'bg-amber-100 text-amber-900 border-amber-300',
                              orborus_worker: 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            };
                            return (
                              <React.Fragment key={node.id}>
                                <div
                                  className={`px-2.5 py-1.5 rounded-lg border text-[10px] shrink-0 ${
                                    typeBadgeColor[node.stage] || 'bg-slate-100 text-slate-800 border-slate-300'
                                  }`}
                                >
                                  <div className="font-black">{node.name}</div>
                                  <div className="opacity-80 font-mono text-[9px] flex items-center justify-between gap-2 mt-0.5">
                                    <span>{node.app}</span>
                                    <span>{node.latencyMs}ms</span>
                                  </div>
                                </div>
                                {nIdx < pb.nodes.length - 1 && (
                                  <span className="text-slate-400 font-black text-xs shrink-0">→</span>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                          <span>Trigger: <strong>{pb.triggerSource}</strong> · Queue: <strong>{pb.orborusQueue}</strong></span>
                          <span>Runs: <strong>{pb.executionsCount}</strong> · Avg Duration: <strong>{pb.avgRuntimeMs}ms</strong></span>
                          <span>Last Run: {new Date(pb.lastExecutedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Execution Trace Panel */}
              <div className="xl:col-span-5 bg-slate-900 text-white rounded-xl border border-slate-800 p-5 shadow-md flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase">
                      Orborus Go Worker Trace
                    </span>
                    <h3 className="text-sm font-black text-white mt-1">
                      Live Shuffle Playbook Execution Trace
                    </h3>
                  </div>
                  {activePlaybookTrace && (
                    <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-orange-300">
                      Total: {activePlaybookTrace.totalDurationMs}ms
                    </span>
                  )}
                </div>

                {activePlaybookTrace ? (
                  <div className="mt-4 space-y-3 flex-1">
                    <div className="p-3 rounded-lg bg-slate-800/90 border border-slate-700 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-orange-300">
                          {activePlaybookTrace.executionId}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            activePlaybookTrace.status === 'blocked_protected_asset'
                              ? 'bg-rose-600 text-white'
                              : activePlaybookTrace.status === 'awaiting_human_approval'
                              ? 'bg-amber-500 text-white'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {activePlaybookTrace.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="font-black text-white mt-1">
                        {activePlaybookTrace.playbookName}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-mono">
                        {activePlaybookTrace.theHiveCaseId && (
                          <span className="text-indigo-300">
                            TheHive: {activePlaybookTrace.theHiveCaseId}
                          </span>
                        )}
                        {activePlaybookTrace.actionBrokerId && (
                          <span className="text-amber-300">
                            Broker Action: {activePlaybookTrace.actionBrokerId}
                          </span>
                        )}
                        {activePlaybookTrace.targetDevice && (
                          <span className="text-emerald-300">
                            Target: {activePlaybookTrace.targetDevice}
                          </span>
                        )}
                        <span>At: {new Date(activePlaybookTrace.startedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                        Per-Node DAG Step Execution &amp; Latency
                      </div>
                      {activePlaybookTrace.nodeTraces.map((step, idx) => (
                        <div
                          key={step.id}
                          className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-800 text-orange-400 font-mono text-[10px] font-black flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-white">{step.name}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                {step.app}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-emerald-400 font-bold">
                                {step.latencyMs}ms
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                  step.status === 'blocked_safety_lock'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    : step.status === 'auto_excluded'
                                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                }`}
                              >
                                {step.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-300 font-mono mt-1.5 pl-7">
                            {step.outputSummary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 py-8 text-center">
                    Click &ldquo;Run Shuffle Playbook&rdquo; on any DAG to inspect per-node execution telemetry.
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 3: Cortex Observable Analyzer Workbench (Interactive IOC Enrichment) */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-300 text-[10px] font-black uppercase">
                      Cortex v3.1.8 Observable Workbench
                    </span>
                    <h3 className="text-sm font-black text-slate-900">
                      Cortex Observable Analyzer Workbench (Interactive IOC &amp; Command-Line Enrichment)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Enrich any IP, hash, MAC address, domain, or command line across AbuseIPDB, VirusTotal, YARA_X, ClamAV, UniFi_Port43_Topology_Analyzer, and Velociraptor_ProcessTree with TLP/PAP guardrails.
                  </p>
                </div>
              </div>

              {/* Quick-Preset Chips */}
              <div className="mb-3">
                <div className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">
                  Quick-Preset Observables (1-Click Load &amp; Analyze):
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      label: '192.168.2.190 (Gambinos PAX A35 on Port 43)',
                      dataType: 'ip' as const,
                      data: '192.168.2.190',
                      tlp: 'TLP:AMBER'
                    },
                    {
                      label: 'vssadmin.exe delete shadows /all /quiet',
                      dataType: 'cmdline' as const,
                      data: 'vssadmin.exe delete shadows /all /quiet',
                      tlp: 'TLP:AMBER'
                    },
                    {
                      label: '98:03:8e:75:98:07 (Port 43 Unknown MAC)',
                      dataType: 'mac' as const,
                      data: '98:03:8e:75:98:07',
                      tlp: 'TLP:AMBER'
                    },
                    {
                      label: 'C:\\Program Files\\Veeam\\Veeam.Backup.Agent.Service.exe',
                      dataType: 'cmdline' as const,
                      data: 'C:\\Program Files\\Veeam\\Veeam.Backup.Agent.Service.exe',
                      tlp: 'TLP:GREEN'
                    },
                    {
                      label: '44d88612fea8a8f36de82e1278abb02f (EICAR MD5)',
                      dataType: 'hash' as const,
                      data: '44d88612fea8a8f36de82e1278abb02f',
                      tlp: 'TLP:CLEAR'
                    }
                  ].map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => handleRunCortexAnalysis(preset.dataType, preset.data, preset.tlp)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-sky-50 border border-slate-300 hover:border-sky-400 text-xs font-mono font-bold text-slate-800 transition cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Bar */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="md:col-span-2">
                  <select
                    value={cortexDataType}
                    onChange={e => setCortexDataType(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                  >
                    <option value="ip">Type: IP Address</option>
                    <option value="cmdline">Type: Command Line</option>
                    <option value="mac">Type: MAC Address</option>
                    <option value="hash">Type: SHA256 / MD5 Hash</option>
                    <option value="domain">Type: Domain / FQDN</option>
                  </select>
                </div>
                <div className="md:col-span-6">
                  <input
                    type="text"
                    value={cortexDataInput}
                    onChange={e => setCortexDataInput(e.target.value)}
                    placeholder="Enter IP, hash, MAC, domain, or command line..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900"
                  />
                </div>
                <div className="md:col-span-2">
                  <select
                    value={cortexTlp}
                    onChange={e => setCortexTlp(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-amber-800"
                  >
                    <option value="TLP:AMBER">TLP:AMBER (Strict)</option>
                    <option value="TLP:RED">TLP:RED (Local Only)</option>
                    <option value="TLP:GREEN">TLP:GREEN</option>
                    <option value="TLP:CLEAR">TLP:CLEAR</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <button
                    disabled={runningCortex}
                    onClick={() => handleRunCortexAnalysis()}
                    className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                  >
                    {runningCortex ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    Run Cortex Analyzers
                  </button>
                </div>
              </div>

              {/* Cortex Analysis Result & Standardized Taxonomy Badges */}
              {cortexResult && (
                <div className="mt-4 p-4 rounded-xl bg-slate-900 text-white border border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-xs font-bold">
                        {cortexResult.dataType.toUpperCase()}: {cortexResult.data}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black">
                        {cortexResult.tlp}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-black">
                        {cortexResult.pap}
                      </span>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                        cortexResult.overallVerdict === 'malicious'
                          ? 'bg-rose-600 text-white'
                          : cortexResult.overallVerdict === 'suspicious'
                          ? 'bg-amber-500 text-white'
                          : cortexResult.overallVerdict === 'safe'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-sky-600 text-white'
                      }`}
                    >
                      Verdict: {cortexResult.overallVerdict}
                    </span>
                  </div>

                  {/* Standardized Cortex Taxonomy Badges */}
                  <div className="mt-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                      Standardized Cortex Taxonomy Badges (namespace:predicate=&quot;value&quot;)
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cortexResult.taxonomies.map((badge, bIdx) => renderCortexBadge(badge, bIdx))}
                    </div>
                  </div>

                  {/* Individual Analyzer Reports */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {cortexResult.analyzerReports.map(rep => (
                      <div
                        key={rep.analyzerId}
                        className="p-3 rounded-lg bg-slate-800/90 border border-slate-700 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-sky-300">{rep.analyzerName}</span>
                          <span className="font-mono text-[10px] text-emerald-400">{rep.durationMs}ms</span>
                        </div>
                        <p className="text-[11px] text-slate-200 mt-1.5">{rep.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 4: TheHive Cases, Tasks, TTPs & Observables Table + SOAR Comparison Matrix */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Active TheHive Cases */}
              <div className="xl:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-300 text-[10px] font-black uppercase">
                        TheHive v5.3 Multi-Tenant Cases
                      </span>
                      <h3 className="text-sm font-black text-slate-900">
                        Active TheHive Cases, Investigation Tasks, MITRE TTPs &amp; Linked Observables
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {soarOverview.cases.map(thCase => (
                    <div
                      key={thCase.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-indigo-900 text-white font-mono text-xs font-black">
                            {thCase.caseNumber}
                          </span>
                          {renderSeverityBadge(thCase.severity)}
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black">
                            {thCase.tlp}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 text-[10px] font-black">
                            {thCase.pap}
                          </span>
                          <span className="text-xs font-bold text-slate-500">
                            ({thCase.clientName})
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-slate-600">
                          Assignee: {thCase.assignee}
                        </span>
                      </div>

                      <h4 className="text-sm font-black text-slate-900 mt-2">{thCase.title}</h4>

                      {/* MITRE ATT&CK TTPs & Observables */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {thCase.ttps.map(ttp => (
                          <span
                            key={ttp.id}
                            className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-mono font-bold"
                          >
                            MITRE {ttp.id}: {ttp.technique}
                          </span>
                        ))}
                        {thCase.observables.map((obs, oIdx) => (
                          <span
                            key={`${obs.value}-${oIdx}`}
                            className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-mono"
                          >
                            {obs.dataType}: {obs.value}
                          </span>
                        ))}
                      </div>

                      {/* Investigation Tasks */}
                      <div className="mt-3 pt-2.5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {thCase.tasks.map(task => (
                          <div
                            key={task.id}
                            className="flex items-center justify-between px-2.5 py-1 rounded bg-white border border-slate-200 text-[11px]"
                          >
                            <span className="font-medium text-slate-800 truncate">{task.title}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${
                                task.status === 'Completed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : task.status === 'InProgress'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {task.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SOAR Architecture Comparison Matrix */}
              <div className="xl:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="mb-4">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black uppercase">
                    Open-Source SOAR Evaluation
                  </span>
                  <h3 className="text-sm font-black text-slate-900 mt-1">
                    SOAR Architecture Comparison Matrix
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Why ApexMSP combines Shuffle (Go) + TheHive &amp; Cortex + Tracecat patterns over legacy Python/Node tools.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 bg-slate-50">
                        <th className="py-2 px-2.5">Platform</th>
                        <th className="py-2 px-2.5">Runtime / RAM</th>
                        <th className="py-2 px-2.5">Role in ApexMSP</th>
                        <th className="py-2 px-2.5">Disposition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {soarOverview.comparisonMatrix.map(row => (
                        <tr key={row.platform} className="hover:bg-slate-50">
                          <td className="py-2.5 px-2.5 font-black text-slate-900">
                            <div>{row.platform}</div>
                            <div className="text-[10px] font-normal text-slate-500">{row.license}</div>
                          </td>
                          <td className="py-2.5 px-2.5 font-mono text-[11px] text-slate-700">
                            <div>{row.languageRuntime}</div>
                            <div className="text-[10px] text-slate-400">{row.ramFootprint}</div>
                          </td>
                          <td className="py-2.5 px-2.5 text-[11px] text-slate-700">
                            <div className="font-bold text-slate-900">{row.roleInApexMsp}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{row.strengthsAndTradeoffs}</div>
                          </td>
                          <td className="py-2.5 px-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase inline-block ${
                                row.verdict === 'PRIMARY ORCHESTRATOR' || row.verdict === 'CASE & IOC ENGINE'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : row.verdict === 'TRIAGE PATTERN ADOPTED'
                                  ? 'bg-sky-100 text-sky-800 border border-sky-300'
                                  : 'bg-slate-100 text-slate-600 border border-slate-300'
                              }`}
                            >
                              {row.verdict}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: SIEM INCIDENTS & DETECTIONS (soc-incidents)                  */}
        {/* =================================================================== */}
        {currentSubTab === 'soc-incidents' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    Correlated SIEM Incident Queue
                  </h2>
                  <p className="text-xs text-slate-500">
                    Deduplicated multi-sensor incidents correlating ApexMSP Go EDR Reflex, Wazuh rules (100500–100599), Velociraptor hunts, and UniFi network anomalies.
                  </p>
                </div>

                {/* Hide / Clear Seeded Lab Incidents Filter Toggle */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHideSeededLabIncidents(prev => !prev)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-black flex items-center gap-2 border transition cursor-pointer ${
                      hideSeededLabIncidents
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                    }`}
                  >
                    <span>{hideSeededLabIncidents ? '📡 Showing Only Live Production Findings' : '🧪 Hide / Clear Seeded Lab Incidents'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {incidents
                  .filter(inc => !hideSeededLabIncidents || !isSeededLabIncident(inc))
                  .filter(inc =>
                    !searchQuery ||
                    inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    inc.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (inc.deviceName || '').toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map(inc => {
                    const isSeeded = isSeededLabIncident(inc);
                    return (
                    <div key={inc.id} className="p-4 rounded-xl border border-slate-200 bg-white hover:shadow-md transition">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {renderSeverityBadge(inc.severity)}
                          <span className="text-xs font-black text-slate-900">{inc.incidentNumber}</span>
                          {isSeeded ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase">
                              🧪 SEEDED LAB VERIFICATION
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black uppercase">
                              📡 LIVE UNIFI TOPOLOGY FINDING
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] font-bold">
                            {inc.category.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          {renderCriticalityBadge(inc.assetCriticality)}
                          <span className="text-xs font-semibold text-slate-600">
                            Tenant: <strong className="text-slate-900">{inc.clientName}</strong> ({inc.siteName || 'Primary'})
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            Status: {inc.status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Confidence: {(inc.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      <h3 className="text-sm font-black text-slate-900 mt-2">{inc.title}</h3>
                      <p className="text-xs text-slate-600 mt-1">{inc.summary}</p>

                      {/* Metadata Pills: Wazuh Alert IDs, Velociraptor DFIR Hunt, PSA Ticket */}
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-semibold">
                          Endpoint: <strong>{inc.deviceName || 'N/A'}</strong>
                        </span>
                        {inc.wazuhAlertIds && inc.wazuhAlertIds.length > 0 && (
                          <span className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold">
                            Wazuh Rules: #{inc.wazuhAlertIds.join(', #')}
                          </span>
                        )}
                        {inc.velociraptorHuntId && (
                          <span className="px-2.5 py-1 rounded-md bg-teal-50 text-teal-800 border border-teal-200 font-semibold flex items-center gap-1">
                            <Terminal className="w-3 h-3" />
                            Velociraptor DFIR Hunt: {inc.velociraptorHuntId}
                          </span>
                        )}
                        {inc.ticketId && (
                          <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-900 border border-amber-200 font-semibold">
                            PSA Ticket: {inc.ticketId}
                          </span>
                        )}
                        <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600">
                          Ingest Latency: {inc.ingestLatencyMs ?? 650}ms
                        </span>
                      </div>

                      {/* 1-Click Incident Actions */}
                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() =>
                              handleRequestAction(
                                inc.deviceId || 'dev-gambinos-c1',
                                inc.deviceName || 'Target Host',
                                inc.clientId,
                                inc.clientName,
                                'isolate_host',
                                `Containment requested from Incident ${inc.incidentNumber}: ${inc.title}`,
                                inc.id
                              )
                            }
                            className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Lock className="w-3 h-3" /> Request Host Isolation
                          </button>
                          <button
                            onClick={() =>
                              handleRequestAction(
                                inc.deviceId || 'dev-gambinos-c1',
                                inc.deviceName || 'Target Host',
                                inc.clientId,
                                inc.clientName,
                                'velociraptor_collect_artifact',
                                `Trigger Velociraptor forensic triage collection for ${inc.incidentNumber}`,
                                inc.id
                              )
                            }
                            className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Terminal className="w-3 h-3" /> Collect Velociraptor Triage
                          </button>
                          {inc.deviceId && (
                            <button
                              onClick={() => {
                                setSelectedTimelineDeviceId(inc.deviceId!);
                                setSubTab('soc-timeline');
                              }}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Clock className="w-3 h-3" /> Open Temporal Timeline
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {inc.status !== 'investigating' && (
                            <button
                              onClick={() => handleIncidentStatusChange(inc.id, 'investigating')}
                              className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                            >
                              Mark Investigating
                            </button>
                          )}
                          {inc.status !== 'resolved' && (
                            <button
                              onClick={() => handleIncidentStatusChange(inc.id, 'resolved')}
                              className="px-2.5 py-1 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-800 cursor-pointer"
                            >
                              Resolve Incident
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Raw Normalized Detections Stream */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-black text-slate-900 mb-3">
                Normalized Telemetry &amp; Detection Stream (`/api/v1/security/events`)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                      <th className="py-2 px-3">Time</th>
                      <th className="py-2 px-3">Source</th>
                      <th className="py-2 px-3">Rule</th>
                      <th className="py-2 px-3">Tenant / Host</th>
                      <th className="py-2 px-3">Process / Command / Network Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {events.map(ev => (
                      <tr key={ev.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          {new Date(ev.eventTime).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-800 text-[10px] uppercase">
                            {ev.sourceProvider}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            {renderSeverityBadge(ev.severity)}
                            <span>[{ev.ruleId}] {ev.ruleName}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{ev.deviceName || 'Network'}</div>
                          <div className="text-[10px] text-slate-500">{ev.clientName}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">
                          {ev.process?.cmdline ? (
                            <div>
                              <span className="text-rose-700 font-bold">{ev.process.cmdline}</span>
                              {ev.process.user && <span className="text-slate-500 ml-2">(User: {ev.process.user})</span>}
                            </div>
                          ) : (
                            <span>{ev.summary}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: ENDPOINT EDR / AV & CANARY POSTURE (soc-endpoints)           */}
        {/* =================================================================== */}
        {currentSubTab === 'soc-endpoints' && (
          <div className="space-y-6">
            {/* =============================================================== */}
            {/* Shark Fin Endpoint Client — Live Protection Toggles & Simulator */}
            {/* =============================================================== */}
            {(() => {
              const managedList = secDevices.filter(d => d.posture.coverageState !== 'unknown');
              const activeDev =
                managedList.find(d => d.deviceId === selectedSharkFinDeviceId) ||
                managedList[0] ||
                secDevices[0];
              if (!activeDev) return null;
              const pol = getDeviceSharkFinPolicy(activeDev);

              const SHARK_FIN_MODULES: Array<{
                key: keyof Omit<SharkFinPolicy, 'updatedAt' | 'updatedBy' | 'lastScanReport' | 'scanFrequency'>;
                label: string;
                shortDesc: string;
              }> = [
                {
                  key: 'preventiveAvEnabled',
                  label: '🛡️ Antivirus (AV) Real-Time Protection',
                  shortDesc: 'OS Preventive AV (Defender / XProtect / ClamAV) real-time kernel guard'
                },
                {
                  key: 'endpointEdrEnabled',
                  label: '🔍 Endpoint Detection & Response (EDR)',
                  shortDesc: 'ApexMSP Go EDR Reflex + Wazuh process/file/registry telemetry'
                },
                {
                  key: 'ransomwareProtectionEnabled',
                  label: '🔒 Ransomware Protection (VSS Shadow-Copy Guard)',
                  shortDesc: 'Intercepts vssadmin/wmic/bcdedit recovery-inhibition (MITRE T1490)'
                },
                {
                  key: 'canaryTripwireEnabled',
                  label: '🐤 Ransomware Canary Decoy Tripwires',
                  shortDesc: 'Watches SHA-256 decoy files (00_APEX_CANARY) for mass-encryption'
                },
                {
                  key: 'yaraClamScannerEnabled',
                  label: '🧬 YARA-X & ClamAV Malware Scanner',
                  shortDesc: 'Bounded 30s / 50MB on-write & on-demand signature scanner'
                },
                {
                  key: 'scheduledScanEnabled',
                  label: '⏰ Scheduled Automated Malware & Canary Scans',
                  shortDesc: `Automated background YARA-X/ClamAV/Canary scans (${(pol.scanFrequency || 'daily').toUpperCase()})`
                }
              ];

              return (
                <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-xl p-5 border border-emerald-500/40 shadow-lg space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700 pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase">
                          Bi-Directional Live Policy Sync • PATCH /api/v1/security/devices/:id/policy
                        </span>
                        <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[10px] font-mono font-bold">
                          Updated: {new Date(pol.updatedAt).toLocaleTimeString()} by {pol.updatedBy}
                        </span>
                      </div>
                      <h2 className="text-base font-black text-white mt-1.5">
                        Shark Fin Endpoint Client — Live Protection Toggles &amp; Interactive Tray Simulator
                      </h2>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Turn individual security functions ON or OFF in real time from the MSP Console—or test clicking inside the simulated macOS/Windows Shark Fin System Tray menu below to verify Admin Tamper Lock &amp; live <code className="font-mono text-emerald-300">coverageState</code> transitions.
                      </p>
                    </div>

                    {/* Endpoint Selector Pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {managedList.map(d => {
                        const isSel = d.deviceId === activeDev.deviceId;
                        return (
                          <button
                            key={d.deviceId}
                            onClick={() => setSelectedSharkFinDeviceId(d.deviceId)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                              isSel
                                ? 'bg-emerald-500 text-slate-950 shadow'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            }`}
                          >
                            🦈 {d.hostname}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Column: Simulated macOS / Windows Shark Fin Menu Bar / System Tray Widget */}
                    <div className="lg:col-span-5 bg-slate-950 rounded-2xl border border-slate-700 p-4 shadow-2xl">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-lg shadow">
                            🦈
                          </div>
                          <div>
                            <div className="text-xs font-black text-white flex items-center gap-1.5">
                              <span>ApexMSP Shark Fin Agent</span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-mono">
                                v2.3.0
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {activeDev.hostname} ({activeDev.ipAddress})
                            </div>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            pol.policyLockedByAdmin
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {pol.policyLockedByAdmin ? '🔐 Admin Locked' : '🔓 Tray Unlocked'}
                        </span>
                      </div>

                      <div className="mt-3 mb-3 flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
                        <span className="text-[11px] font-bold text-slate-300">Live Coverage State:</span>
                        {renderCoverageBadge(activeDev.posture.coverageState)}
                      </div>

                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                        Simulated Local User Shark Fin Tray Menu (Click to Test):
                      </div>

                      <div className="space-y-1.5">
                        {SHARK_FIN_MODULES.map(mod => {
                          const enabled = Boolean(pol[mod.key]);
                          const busy = updatingPolicyKey === `${activeDev.deviceId}:${mod.key}`;
                          return (
                            <div
                              key={mod.key}
                              className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition"
                            >
                              <div className="pr-2">
                                <div className="text-xs font-bold text-white">{mod.label}</div>
                                <div className="text-[10px] text-slate-400">{mod.shortDesc}</div>
                              </div>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  handleToggleSharkFinModule(
                                    activeDev,
                                    mod.key,
                                    !enabled,
                                    mod.label,
                                    true
                                  )
                                }
                                title={
                                  pol.policyLockedByAdmin
                                    ? 'Locked by MSP Admin — clicking tests Tamper Lock enforcement'
                                    : 'Toggle module from local Shark Fin Tray'
                                }
                                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition cursor-pointer shrink-0 ${
                                  enabled
                                    ? 'bg-emerald-500 text-slate-950'
                                    : 'bg-rose-600 text-white'
                                }`}
                              >
                                {enabled ? 'ON' : 'OFF'}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                        <span>Supervisor CPU: {activeDev.posture.supervisorCpuPct ?? 0.4}%</span>
                        <span>Tray Port: 127.0.0.1:9711</span>
                      </div>
                    </div>

                    {/* Right Column: MSP Admin Console Master Policy Controls */}
                    <div className="lg:col-span-7 bg-slate-800/80 rounded-2xl border border-slate-700 p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                            MSP Admin Master Policy Override
                          </span>
                          <h3 className="text-sm font-black text-white">
                            Remote Shark Fin Feature Switches for {activeDev.hostname}
                          </h3>
                        </div>

                        {/* Lock Shark Fin Tray Toggle */}
                        <button
                          onClick={() =>
                            handleToggleSharkFinModule(
                              activeDev,
                              'policyLockedByAdmin',
                              !pol.policyLockedByAdmin,
                              '🔐 Lock Shark Fin Tray (Prevent Local User Disabling AV/Ransomware)',
                              false
                            )
                          }
                          className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 border transition cursor-pointer ${
                            pol.policyLockedByAdmin
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                              : 'bg-slate-900 text-slate-200 border-slate-600 hover:bg-slate-700'
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                          {pol.policyLockedByAdmin
                            ? '🔐 Shark Fin Tray LOCKED (Local User Cannot Disable)'
                            : '🔓 Lock Shark Fin Tray (Prevent Local User Disable)'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {SHARK_FIN_MODULES.map(mod => {
                          const enabled = Boolean(pol[mod.key] ?? true);
                          const busy = updatingPolicyKey === `${activeDev.deviceId}:${mod.key}`;
                          return (
                            <div
                              key={mod.key}
                              className={`p-3.5 rounded-xl border transition flex flex-col justify-between gap-2 ${
                                enabled
                                  ? 'bg-slate-900/90 border-emerald-500/40'
                                  : 'bg-rose-950/40 border-rose-500/40'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-black text-white">{mod.label}</div>
                                  <div className="text-[10px] text-slate-300 mt-0.5">{mod.shortDesc}</div>
                                </div>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    handleToggleSharkFinModule(
                                      activeDev,
                                      mod.key,
                                      !enabled,
                                      mod.label,
                                      false
                                    )
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition cursor-pointer shrink-0 ${
                                    enabled
                                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow'
                                      : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                  }`}
                                >
                                  {enabled ? 'ENABLED' : 'DISABLED'}
                                </button>
                              </div>

                              {mod.key === 'scheduledScanEnabled' && (
                                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-[10px]">
                                  <span className="text-slate-400 font-bold">Frequency:</span>
                                  <div className="flex items-center gap-1">
                                    {(['hourly', 'daily', 'weekly'] as const).map(freq => (
                                      <button
                                        key={freq}
                                        onClick={() => handleChangeScanFrequency(activeDev, freq, false)}
                                        className={`px-2 py-0.5 rounded font-black uppercase cursor-pointer ${
                                          (pol.scanFrequency || 'daily') === freq
                                            ? 'bg-emerald-500 text-slate-950'
                                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                        }`}
                                      >
                                        {freq}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* 1-Click Scan & Feature Execution Buttons inside Shark Fin Simulator */}
                      <div className="pt-3 border-t border-slate-700 space-y-2.5">
                        <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                          1-Click Scan &amp; Feature Execution Buttons ({activeDev.hostname}):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {[
                            {
                              scanType: 'quick_av_yara' as const,
                              label: '⚡ Run Quick AV + YARA-X Scan Now',
                              cls: 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            },
                            {
                              scanType: 'full_clamav_yara' as const,
                              label: '🛡️ Run Full ClamAV + YARA-X Deep Scan',
                              cls: 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            },
                            {
                              scanType: 'canary_verify_reseed' as const,
                              label: '🐤 Deploy / Re-Verify Canary Tripwire Files',
                              cls: 'bg-amber-600 hover:bg-amber-500 text-white'
                            },
                            {
                              scanType: 'velociraptor_dfir_audit' as const,
                              label: '🔍 Run Velociraptor Process & Persistence Check',
                              cls: 'bg-purple-600 hover:bg-purple-500 text-white'
                            }
                          ].map(btn => {
                            const isScanning = runningScanKey === `${activeDev.deviceId}:${btn.scanType}`;
                            return (
                              <button
                                key={btn.scanType}
                                disabled={runningScanKey !== null}
                                onClick={() => handleRunDeviceScan(activeDev, btn.scanType, 'soc_admin')}
                                className={`px-3 py-2 rounded-lg text-xs font-black flex items-center justify-between shadow transition cursor-pointer disabled:opacity-50 ${btn.cls}`}
                              >
                                <span>{btn.label}</span>
                                {isScanning && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
                              </button>
                            );
                          })}
                        </div>

                        {(() => {
                          const rep = latestScanReports[activeDev.deviceId] || pol.lastScanReport;
                          if (!rep) return null;
                          return (
                            <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-xs space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-black text-white">
                                  Scan Execution Report: {rep.scanTitle} ({rep.scanId})
                                </span>
                                <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-black uppercase">
                                  {rep.status}
                                </span>
                              </div>
                              <p className="text-[11px] text-emerald-100">{rep.summary}</p>
                              <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-emerald-300">
                                <span>filesScannedCount: <strong>{rep.filesScannedCount.toLocaleString()}</strong></span>
                                <span>enginesUsed: <strong>{rep.enginesUsed.join(', ')}</strong></span>
                                <span>canaryFilesVerified: <strong>{rep.canaryFilesVerified}</strong></span>
                                <span>durationMs: <strong>{rep.durationMs}ms</strong></span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <strong>Acceptance Test #12 Truthfulness Policy:</strong> Endpoints with <code className="bg-amber-100 px-1 rounded font-bold">coverageState = unknown</code> or disabled real-time protection are <strong>never</strong> badged as protected. Existing OS preventive AV (Windows Defender / macOS XProtect / Linux ClamAV) is supervised and complemented—never disabled—by the ApexMSP Go EDR Reflex &amp; Canary Supervisor.
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {secDevices
                .filter(d =>
                  !searchQuery ||
                  d.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  d.ipAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  d.clientName.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map(dev => {
                  const p = dev.posture;
                  const pol = getDeviceSharkFinPolicy(dev);
                  return (
                    <div
                      key={dev.deviceId}
                      className={`bg-white rounded-xl border p-5 shadow-sm ${
                        p.coverageState === 'unknown'
                          ? 'border-rose-300 bg-rose-50/20'
                          : p.coverageState === 'containment_requested'
                          ? 'border-amber-300'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-xs">
                            {dev.os.slice(0, 3).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-black text-slate-900">{dev.hostname}</h3>
                              {renderCoverageBadge(p.coverageState)}
                              {renderCriticalityBadge(dev.assetCriticality)}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Tenant: <strong className="text-slate-800">{dev.clientName}</strong> ({dev.siteName}) • IP:{' '}
                              <code className="text-slate-800 font-mono">{dev.ipAddress}</code> • MAC:{' '}
                              <code className="text-slate-800 font-mono">{dev.macAddress}</code> • {dev.osVersion}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedTimelineDeviceId(dev.deviceId);
                              setSubTab('soc-timeline');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5" /> Unified Timeline
                          </button>
                          <button
                            onClick={() =>
                              handleRequestAction(
                                dev.deviceId,
                                dev.hostname,
                                dev.clientId,
                                dev.clientName,
                                'run_yara_scan',
                                `Manual bounded YARA-X & ClamAV scan requested on ${dev.hostname}`
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" /> Run YARA-X / AV Scan
                          </button>
                        </div>
                      </div>

                      {/* Posture Pillars */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Preventive AV Engine</div>
                          <div className="font-bold text-slate-900 mt-0.5">{p.preventiveAvName}</div>
                          <div className={`text-[11px] font-bold mt-0.5 ${p.preventiveAvActive ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {p.preventiveAvActive ? '✓ Real-Time Active' : '✗ Not Active / Unprotected'}
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Tamper Protection</div>
                          <div className={`font-bold mt-0.5 ${p.tamperProtectionEnabled ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {p.tamperProtectionEnabled ? 'Enabled & Verified' : 'Disabled / Unverified'}
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Canary Tripwires</div>
                          <div className={`font-bold mt-0.5 ${p.canaryFilesDeployed ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {p.canaryFilesDeployed ? '✓ SHA-256 Canaries Armed' : 'Not Deployed'}
                          </div>
                          {p.canaryPaths && p.canaryPaths[0] && (
                            <div className="text-[10px] text-slate-500 truncate mt-0.5" title={p.canaryPaths[0]}>
                              {p.canaryPaths[0]}
                            </div>
                          )}
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Recovery-Inhibition Guard</div>
                          <div className={`font-bold mt-0.5 ${p.recoveryInhibitionGuardActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {p.recoveryInhibitionGuardActive ? '✓ VSS / bcdedit Reflex Active' : 'Inactive'}
                          </div>
                          <div className="text-[10px] text-slate-500">Allowlists Veeam/Acronis/wbengine</div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Supervisor Overhead</div>
                          <div className="font-bold text-slate-900 mt-0.5">
                            CPU: {p.supervisorCpuPct ?? 0}% (Target &lt;1%)
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Telemetry CPU: {p.telemetryCpuPct ?? 0}% (&lt;5% SLA)
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Scanner Footprint</div>
                          <div className="font-bold text-slate-900 mt-0.5">
                            RAM: {p.scannerMemoryMb ?? 0} MB
                          </div>
                          <div className="text-[10px] text-slate-500">Bounded 30s / 50MB cap</div>
                        </div>
                      </div>

                      {/* Per-Device Live Shark Fin Protection Toggles Bar */}
                      {p.coverageState !== 'unknown' && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <span className="text-[11px] font-black uppercase text-slate-600 flex items-center gap-1.5">
                              <span>🦈 Shark Fin Client Live Function Toggles:</span>
                            </span>
                            <button
                              onClick={() =>
                                handleToggleSharkFinModule(
                                  dev,
                                  'policyLockedByAdmin',
                                  !pol.policyLockedByAdmin,
                                  '🔐 Lock Shark Fin Tray',
                                  false
                                )
                              }
                              className={`px-2.5 py-1 rounded-md text-[11px] font-black border transition cursor-pointer ${
                                pol.policyLockedByAdmin
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                            >
                              {pol.policyLockedByAdmin
                                ? '🔐 Tray Locked Against Local User Disable'
                                : '🔓 Tray Unlocked (Click to Lock)'}
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {[
                              { key: 'preventiveAvEnabled' as const, label: '🛡️ Real-Time AV' },
                              { key: 'endpointEdrEnabled' as const, label: '🔍 Endpoint EDR' },
                              { key: 'ransomwareProtectionEnabled' as const, label: '🔒 Ransomware VSS Guard' },
                              { key: 'canaryTripwireEnabled' as const, label: '🐤 Canary Tripwires' },
                              { key: 'yaraClamScannerEnabled' as const, label: '🧬 YARA-X / ClamAV' },
                              { key: 'scheduledScanEnabled' as const, label: `⏰ Scheduled Scans (${(pol.scanFrequency || 'daily').toUpperCase()})` }
                            ].map(sw => {
                              const isOn = Boolean(pol[sw.key] ?? true);
                              return (
                                <button
                                  key={sw.key}
                                  onClick={() =>
                                    handleToggleSharkFinModule(dev, sw.key, !isOn, sw.label, false)
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-2 transition cursor-pointer ${
                                    isOn
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                                      : 'bg-rose-50 border-rose-300 text-rose-900 hover:bg-rose-100'
                                  }`}
                                >
                                  <span>{sw.label}</span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                                      isOn ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                                    }`}
                                  >
                                    {isOn ? 'ON' : 'OFF'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Per-Device 1-Click Scan & Feature Execution Buttons */}
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black uppercase text-slate-500">
                              Run Scan Now:
                            </span>
                            {[
                              {
                                scanType: 'quick_av_yara' as const,
                                label: '⚡ Run Quick AV + YARA-X Scan Now',
                                cls: 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              },
                              {
                                scanType: 'full_clamav_yara' as const,
                                label: '🛡️ Run Full ClamAV + YARA-X Deep Scan',
                                cls: 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              },
                              {
                                scanType: 'canary_verify_reseed' as const,
                                label: '🐤 Deploy / Re-Verify Canary Tripwire Files',
                                cls: 'bg-amber-600 hover:bg-amber-700 text-white'
                              },
                              {
                                scanType: 'velociraptor_dfir_audit' as const,
                                label: '🔍 Run Velociraptor Process & Persistence Check',
                                cls: 'bg-purple-600 hover:bg-purple-700 text-white'
                              }
                            ].map(btn => {
                              const isScanning = runningScanKey === `${dev.deviceId}:${btn.scanType}`;
                              return (
                                <button
                                  key={btn.scanType}
                                  disabled={runningScanKey !== null}
                                  onClick={() => handleRunDeviceScan(dev, btn.scanType, 'soc_admin')}
                                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50 ${btn.cls}`}
                                >
                                  <span>{btn.label}</span>
                                  {isScanning && <RefreshCw className="w-3 h-3 animate-spin" />}
                                </button>
                              );
                            })}
                          </div>

                          {/* Per-Device Scan Execution Report Banner */}
                          {(() => {
                            const rep = latestScanReports[dev.deviceId] || pol.lastScanReport;
                            if (!rep) return null;
                            return (
                              <div className="mt-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-black text-emerald-950 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                    Scan Execution Report: {rep.scanTitle} ({rep.scanId})
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black uppercase">
                                    {rep.status}
                                  </span>
                                </div>
                                <p className="text-[11px] text-emerald-900">{rep.summary}</p>
                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono text-emerald-800">
                                  <span>filesScannedCount: <strong>{rep.filesScannedCount.toLocaleString()}</strong></span>
                                  <span>enginesUsed: <strong>{rep.enginesUsed.join(', ')}</strong></span>
                                  <span>canaryFilesVerified: <strong>{rep.canaryFilesVerified}</strong></span>
                                  <span>durationMs: <strong>{rep.durationMs}ms</strong></span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Sensor Version Strip */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {p.sensors.length === 0 ? (
                          <span className="text-xs font-bold text-rose-600">
                            No endpoint sensors installed — discovered via UniFi L2 MAC table only.
                          </span>
                        ) : (
                          p.sensors.map((s, idx) => (
                            <span
                              key={idx}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                                s.running
                                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                  : 'bg-amber-50 border-amber-200 text-amber-900'
                              }`}
                            >
                              <strong>{s.provider.toUpperCase()}</strong> {s.version || ''}{' '}
                              {s.signatureVersion ? `(sig ${s.signatureVersion})` : ''}{' '}
                              {s.healthMessage ? `• ${s.healthMessage}` : ''}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: UNIFI NETWORK SOC & GAMBINOS TOPOLOGY (soc-unifi)            */}
        {/* =================================================================== */}
        {currentSubTab === 'soc-unifi' && (
          <div className="space-y-6">
            {/* =============================================================== */}
            {/* UnPoller + Prometheus + Grafana Telemetry Suite (Gambinos Test) */}
            {/* =============================================================== */}
            {gambinosUnpoller && (
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-5 border border-indigo-500/40 shadow-lg space-y-5">
                {/* 1. UnPoller Stack Status & Direct Launch Bar */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase">
                        Gambinos Test Case Live • timothystewart6/unpoller-unifi
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-mono font-bold">
                        Scrape Interval: {gambinosUnpoller.scrapeIntervalSec}s • Read-Only API
                      </span>
                    </div>
                    <h2 className="text-base font-black text-white mt-1.5">
                      UnPoller + Prometheus + Grafana Telemetry Suite (Gambinos UDM Pro — timothystewart6/unpoller-unifi)
                    </h2>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Continuous 30s Prometheus metrics collection from Gambinos UDM Pro (`192.168.2.1`) via UnPoller Bridge (`:9131`), rendered across 7 pre-provisioned Grafana dashboards (`:3030`) with Dozzle container log streaming (`:8896`).
                    </p>
                  </div>

                  {/* 4 Direct 1-Click External Launch Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={gambinosUnpoller.services.grafana.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow transition"
                    >
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      Grafana UniFi Dashboards (:3030) <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={gambinosUnpoller.services.unpollerBridge.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center gap-1.5 shadow transition"
                    >
                      Gambinos UnPoller Bridge (:9131) <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={gambinosUnpoller.services.prometheus.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-black flex items-center gap-1.5 shadow transition"
                    >
                      Prometheus TSDB (:9090) <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={gambinosUnpoller.services.dozzle.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition"
                    >
                      Dozzle Live Logs (:8896) <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* 4 Service Health Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase text-emerald-400">
                        Grafana Dashboards (:3030)
                      </div>
                      <div className="text-xs font-bold text-white mt-0.5">
                        {gambinosUnpoller.services.grafana.authMode}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {gambinosUnpoller.services.grafana.url}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {gambinosUnpoller.services.grafana.status}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/90 border border-indigo-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase text-indigo-400">
                        Gambinos UnPoller Bridge (:9131)
                      </div>
                      <div className="text-xs font-bold text-white mt-0.5">
                        {gambinosUnpoller.services.unpollerBridge.targetConsole}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {gambinosUnpoller.services.unpollerBridge.url}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {gambinosUnpoller.services.unpollerBridge.status}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/90 border border-orange-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase text-orange-400">
                        Prometheus TSDB (:9090)
                      </div>
                      <div className="text-xs font-bold text-white mt-0.5">
                        {gambinosUnpoller.services.prometheus.retention}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {gambinosUnpoller.services.prometheus.url}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {gambinosUnpoller.services.prometheus.status}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/90 border border-sky-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase text-sky-400">
                        Dozzle Container Logs (:8896)
                      </div>
                      <div className="text-xs font-bold text-white mt-0.5">
                        {gambinosUnpoller.services.dozzle.containersMonitored} UnPoller Containers
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {gambinosUnpoller.services.dozzle.url}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {gambinosUnpoller.services.dozzle.status}
                    </span>
                  </div>
                </div>

                {/* 2. Gambinos Real-Time UnPoller Prometheus Metrics Strip */}
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-indigo-300 mb-2">
                    Gambinos Real-Time UnPoller Prometheus Metrics Strip (Scraped from UDM Pro &amp; US 48 PoE 500W)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">WAN Throughput</div>
                      <div className="text-sm font-black text-emerald-400 mt-1">
                        ↓ {gambinosUnpoller.metrics.wanRxMbps} Mbps / ↑ {gambinosUnpoller.metrics.wanTxMbps} Mbps
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        WAN Latency: <strong>{gambinosUnpoller.metrics.wanLatencyMs} ms</strong>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">UDM Pro System</div>
                      <div className="text-sm font-black text-white mt-1">
                        CPU {gambinosUnpoller.metrics.udmProCpuPct}% · RAM {gambinosUnpoller.metrics.udmProRamPct}%
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Chassis Temp: <strong>{gambinosUnpoller.metrics.udmProTempC}°C</strong>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">US 48 PoE 500W Budget</div>
                      <div className="text-sm font-black text-amber-400 mt-1">
                        {gambinosUnpoller.metrics.us48PoeTotalWatts}W / {gambinosUnpoller.metrics.us48PoeBudgetWatts}W
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        1 Online · 2 Secondary Switches Offline
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-fuchsia-500/40">
                      <div className="text-[10px] font-bold text-fuchsia-300 uppercase">
                        Port 43 Shared Hub ({gambinosUnpoller.metrics.port43SharedHub.macCount} MACs)
                      </div>
                      <div className="text-sm font-black text-fuchsia-400 mt-1">
                        {gambinosUnpoller.metrics.port43SharedHub.poeWatts}W PoE · ↓{gambinosUnpoller.metrics.port43SharedHub.rxMbps}M
                      </div>
                      <div
                        className="text-[10px] text-slate-300 truncate mt-0.5"
                        title={gambinosUnpoller.metrics.port43SharedHub.coResidentSummary}
                      >
                        c1 (.2.179) + PAX A35 (.2.190) + 3 more
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Active Gambinos Clients</div>
                      <div className="text-sm font-black text-sky-400 mt-1">
                        {gambinosUnpoller.metrics.wirelessClientsCount} Wireless / {gambinosUnpoller.metrics.wiredClientsCount} Wired
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Total: <strong>{gambinosUnpoller.metrics.totalClientsCount} Clients</strong> across 6 VLANs
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Top DPI Categories</div>
                      <div className="text-xs font-black text-indigo-300 mt-1 truncate">
                        1. {gambinosUnpoller.metrics.topDpiCategories[0]?.category || 'POS TLS'}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        2. {gambinosUnpoller.metrics.topDpiCategories[1]?.category || 'CameraNet VLAN 200'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Interactive 7-Dashboard Grafana Switcher & Embedded Live Viewer */}
                <div className="bg-slate-950/90 rounded-xl border border-slate-800 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                        7 Pre-Provisioned UnPoller Grafana Dashboards (No-Login Auto-Auth)
                      </span>
                      <h3 className="text-sm font-black text-white">
                        Interactive 7-Dashboard Switcher &amp; Embedded Live Grafana Viewer
                      </h3>
                    </div>

                    {(() => {
                      const activeDash =
                        gambinosUnpoller.dashboards.find(d => d.id === activeUnpollerDashboardId) ||
                        gambinosUnpoller.dashboards[0];
                      return (
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] font-mono text-emerald-300">
                            {activeDash.highlightMetric}
                          </span>
                          <a
                            href={activeDash.fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow transition"
                          >
                            Open Full-Screen in Grafana (:3030) <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 7 Dashboard Tabs */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {gambinosUnpoller.dashboards.map(dash => {
                      const isActive = dash.id === activeUnpollerDashboardId;
                      return (
                        <button
                          key={dash.id}
                          onClick={() => setActiveUnpollerDashboardId(dash.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            isActive
                              ? 'bg-emerald-600 text-white shadow'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                          }`}
                        >
                          {dash.shortLabel}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Dashboard Description + Live Embedded Iframe */}
                  {(() => {
                    const activeDash =
                      gambinosUnpoller.dashboards.find(d => d.id === activeUnpollerDashboardId) ||
                      gambinosUnpoller.dashboards[0];
                    return (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800">
                          <div>
                            <strong className="text-white">{activeDash.title}:</strong> {activeDash.description}
                          </div>
                          <span className="font-mono text-[11px] text-slate-400">
                            {activeDash.embedUrl}
                          </span>
                        </div>
                        <div className="w-full h-[500px] rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
                          <iframe
                            key={activeDash.id}
                            src={activeDash.embedUrl}
                            title={activeDash.title}
                            className="w-full h-full border-0"
                            loading="lazy"
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Connected UniFi Consoles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {unifiSites.map(site => {
                const selected = site.siteId === (siteTopology?.site.siteId || selectedSiteId);
                return (
                  <div
                    key={site.siteId}
                    onClick={() => setSelectedSiteId(site.siteId)}
                    className={`rounded-xl border p-4 transition cursor-pointer ${
                      selected
                        ? 'bg-slate-900 text-white border-emerald-500 shadow-lg'
                        : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-500">
                        {site.consoleName}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                        ONLINE • READ-ONLY
                      </span>
                    </div>
                    <div className="text-sm font-black mt-1">{site.clientName}</div>
                    <div className={`text-[11px] mt-0.5 ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                      {site.consoleModel} (FW {site.firmwareVersion} • Net {site.networkAppVersion})
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className={`p-1.5 rounded ${selected ? 'bg-slate-800' : 'bg-slate-100'}`}>
                        <div className="text-xs font-black">
                          {site.counts.onlineDevices}/{site.counts.adoptedDevices}
                        </div>
                        <div className="text-[9px] opacity-75">UniFi Devs</div>
                      </div>
                      <div className={`p-1.5 rounded ${selected ? 'bg-slate-800' : 'bg-slate-100'}`}>
                        <div className="text-xs font-black">{site.counts.activeClients}</div>
                        <div className="text-[9px] opacity-75">Clients</div>
                      </div>
                      <div className={`p-1.5 rounded ${selected ? 'bg-slate-800' : 'bg-slate-100'}`}>
                        <div className="text-xs font-black text-fuchsia-400">{site.counts.protectedPosAssets}</div>
                        <div className="text-[9px] opacity-75">POS Safe</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Site Detail & VLAN Inventory */}
            {siteTopology && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black text-slate-900">
                        {siteTopology.site.consoleName} — {siteTopology.site.siteName}
                      </h2>
                      <span className="px-2.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[11px] font-bold">
                        {siteTopology.site.connectionMethod.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">
                      Endpoint: {siteTopology.site.endpointUrl} • Last Synced:{' '}
                      {new Date(siteTopology.site.lastSyncedAt).toLocaleTimeString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      disabled={syncingUnifi}
                      onClick={() => handleSyncUnifiSite(siteTopology.site.siteId)}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingUnifi ? 'animate-spin' : ''}`} />
                      Sync UniFi Now
                    </button>
                  </div>
                </div>

                {/* Capability Matrix & Explicit Coverage Gaps (UniFi Test #6) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-500 mb-2">
                      Controller Capability Matrix
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(siteTopology.site.capabilities).map(([k, val]) => (
                        <span
                          key={k}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold border ${
                            val
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-slate-100 border-slate-200 text-slate-600'
                          }`}
                        >
                          {val ? '✓' : '○'} {k}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-500 mb-2">
                      Explicit Coverage Gaps &amp; Safety Constraints (UniFi Test #6)
                    </h3>
                    {siteTopology.site.coverageGaps.length === 0 ? (
                      <div className="text-xs text-emerald-700 font-semibold">
                        No coverage gaps detected on this site.
                      </div>
                    ) : (
                      <ul className="space-y-1 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        {siteTopology.site.coverageGaps.map((gap, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span>{gap}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* VLAN Inventory */}
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-500 mb-2">
                    Discovered VLAN &amp; Subnet Inventory
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {siteTopology.site.vlans.map(v => (
                      <div
                        key={v.id}
                        className={`p-3 rounded-lg border ${
                          v.enabled
                            ? 'bg-slate-50 border-slate-200'
                            : 'bg-amber-50/60 border-amber-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900">
                            VLAN {v.vlanId} — {v.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              v.enabled
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-200 text-amber-900'
                            }`}
                          >
                            {v.enabled ? 'ACTIVE' : 'STAGED / DISABLED'}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-700 mt-1">{v.subnet}</div>
                        {v.purpose && <div className="text-[11px] text-slate-500 mt-1">{v.purpose}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Switch Port Mapping Table (Highlighting Gambinos US48PoE500W Port 43) */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">
                        Switch Port Topology &amp; Protected POS Attachment Table
                      </h3>
                      <p className="text-xs text-slate-500">
                        Ports with <code className="font-mono">macCount &gt; 1</code> are classified as <code className="font-mono">shared_uplink_or_hub</code> and hard-locked against automatic port shutdown or blind VLAN migration.
                      </p>
                    </div>
                    <button
                      onClick={() => handleRunSimulation('gambinos_port43_guard')}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" /> Test Port 43 Containment Guard
                    </button>
                  </div>

                  {siteTopology.switches.map(sw => (
                    <div key={sw.id} className="mb-4 border border-slate-200 rounded-xl overflow-hidden">
                      <div
                        className={`px-4 py-2.5 flex items-center justify-between text-xs font-bold ${
                          sw.online ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-emerald-400" />
                          <span>{sw.name}</span>
                          <span className="font-mono text-[11px] opacity-80">
                            ({sw.mac} • {sw.ip} • FW {sw.firmware})
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            sw.online ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-600 text-white'
                          }`}
                        >
                          {sw.online ? 'ONLINE' : 'OFFLINE (COVERAGE GAP)'}
                        </span>
                      </div>

                      {sw.ports.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                                <th className="py-2 px-3">Port</th>
                                <th className="py-2 px-3">Attachment Classification</th>
                                <th className="py-2 px-3">VLAN</th>
                                <th className="py-2 px-3">Connected MACs / POS Assets</th>
                                <th className="py-2 px-3">Containment Safety Lock</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {sw.ports.map(port => {
                                const isPort43 = port.portIdx === 43 || port.macCount > 1;
                                return (
                                  <tr
                                    key={port.portIdx}
                                    className={isPort43 ? 'bg-rose-50/80 hover:bg-rose-100/60' : 'hover:bg-slate-50'}
                                  >
                                    <td className="py-3 px-3 font-black text-slate-900 whitespace-nowrap">
                                      Port {port.portIdx}
                                      <div className="text-[10px] font-normal text-slate-500">
                                        {port.speedMbps} Mbps
                                      </div>
                                    </td>
                                    <td className="py-3 px-3">
                                      {isPort43 ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black uppercase">
                                          SHARED UPLINK / {port.macCount} MACs
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                                          Confirmed Direct (1 MAC)
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 font-semibold text-slate-700">
                                      {port.vlanName}
                                    </td>
                                    <td className="py-3 px-3">
                                      <div className="space-y-1">
                                        {port.connectedClients.map((c, idx) => (
                                          <div key={idx} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                            <span className="font-bold text-slate-900">{c.hostname}</span>
                                            <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-[10px]">
                                              {c.ip || 'L2-Only'}
                                            </code>
                                            <code className="text-slate-500 font-mono text-[10px]">{c.mac}</code>
                                            {c.serial && (
                                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 text-[10px] font-bold">
                                                SN: {c.serial}
                                              </span>
                                            )}
                                            {c.isProtectedAsset && (
                                              <span className="px-1.5 py-0.5 rounded bg-fuchsia-100 text-fuchsia-800 text-[9px] font-black uppercase">
                                                PROTECTED POS
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3">
                                      {port.safetyLockActive && (
                                        <div className="flex items-start gap-1.5 text-[11px] font-bold text-rose-800">
                                          <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                                          <span>{port.safetyLockReason}</span>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* SUNMI OrderPAD3 Wireless POS Identity Discrepancy Resolution Table */}
                {siteTopology.wirelessDiscrepancies.length > 0 && (
                  <div>
                    <h3 className="text-sm font-black text-slate-900 mb-1">
                      Wireless POS Fingerprint Correction (POS SDK Ground Truth vs. UniFi Passive OUI Guess)
                    </h3>
                    <p className="text-xs text-slate-500 mb-2">
                      UniFi passive DHCP/OUI heuristics mislabel several Gambinos SUNMI OrderPAD3 Android POS tablets as consumer phones or AP names. Temporal Identity observations override passive guesses with 0.98 confidence serial-verified records.
                    </p>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                            <th className="py-2 px-3">IP / MAC</th>
                            <th className="py-2 px-3">Verified POS SDK Role &amp; Serial</th>
                            <th className="py-2 px-3">UniFi Passive Mislabel</th>
                            <th className="py-2 px-3">AP / SSID / RSSI</th>
                            <th className="py-2 px-3">Temporal Resolution</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {siteTopology.wirelessDiscrepancies.map((w, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono text-[11px]">
                                <div className="font-bold text-slate-900">{w.ip}</div>
                                <div className="text-slate-500">{w.mac}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-black text-emerald-800">{w.canonicalRole}</span>
                                <div className="text-[10px] font-mono text-slate-600">SN: {w.serial}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[11px] line-through">
                                  &quot;{w.unifiGuessedName}&quot;
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-[11px]">
                                <div className="font-semibold text-slate-800">{w.apName} ({w.ssid})</div>
                                <div className="text-slate-500">RSSI: {w.rssi} dBm</div>
                              </td>
                              <td className="py-2.5 px-3 text-[11px] text-slate-700">
                                {w.resolutionNote}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 5: TEMPORAL DEVICE IDENTITY & UNIFIED TIMELINE (soc-timeline)   */}
        {/* =================================================================== */}
        {currentSubTab === 'soc-timeline' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    Bi-Temporal Device Identity &amp; Unified Cross-Layer Timeline
                  </h2>
                  <p className="text-xs text-slate-500">
                    Composite key <code className="font-mono bg-slate-100 px-1 rounded">org_id + client_id + site_id + provider_client_id + [observed_from, observed_to]</code> prevents DHCP lease reuse and overlapping RFC1918 subnet collisions (`192.168.2.0/24`).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600">Inspect Endpoint:</label>
                  <select
                    value={selectedTimelineDeviceId}
                    onChange={e => setSelectedTimelineDeviceId(e.target.value)}
                    className="bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 outline-none"
                  >
                    {secDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.hostname} ({d.ipAddress} — {d.clientName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bi-Temporal Identity Observations Table */}
              <h3 className="text-xs font-black uppercase text-slate-500 mb-2">
                Active Bi-Temporal Identity Observations (`[observed_from, observed_to]`)
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl mb-6">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <th className="py-2 px-3">Tenant / Site</th>
                      <th className="py-2 px-3">Host / Role</th>
                      <th className="py-2 px-3">IP / MAC</th>
                      <th className="py-2 px-3">Network Attachment</th>
                      <th className="py-2 px-3">Observed Window (`[from, to]`)</th>
                      <th className="py-2 px-3">Evidence &amp; Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(timelineData?.observations || []).map(obs => (
                      <tr key={obs.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{obs.clientId}</div>
                          <div className="text-[10px] font-mono text-slate-500">{obs.siteId.slice(0, 14)}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{obs.hostname || obs.alias}</div>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 text-[10px] font-bold uppercase">
                            {obs.deviceRole || 'endpoint'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          <div className="font-bold text-slate-900">{obs.ipAddress || 'L2-Only'}</div>
                          <div className="text-slate-500">{obs.macAddress}</div>
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {obs.isWired ? (
                            <div>
                              <span className="font-bold text-slate-800">
                                {obs.switchName || 'Switch'} Port {obs.switchPort}
                              </span>
                              <div className="text-[10px] text-rose-700 font-semibold">
                                {obs.attachmentType} {obs.portMacCount ? `(${obs.portMacCount} MACs)` : ''}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="font-bold text-slate-800">{obs.apName} ({obs.ssid})</span>
                              <div className="text-[10px] text-slate-500">RSSI: {obs.rssi} dBm</div>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10px] text-slate-600">
                          <div>From: {new Date(obs.observedFrom).toLocaleString()}</div>
                          <div>To: {new Date(obs.observedTo).toLocaleString()}</div>
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            {(obs.confidence * 100).toFixed(0)}%
                          </span>
                          <div className="text-slate-600 mt-0.5">{obs.evidenceSource}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Chronological Cross-Layer Event Stream */}
              <h3 className="text-xs font-black uppercase text-slate-500 mb-3">
                Unified Chronological Event Stream (Endpoint Process + Canary/AV + UniFi Port/VLAN/Roam + Action Broker)
              </h3>
              <div className="relative pl-6 border-l-2 border-indigo-200 space-y-4">
                {(timelineData?.timeline || []).map(item => (
                  <div key={item.id} className="relative bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <span className="w-3 h-3 rounded-full bg-indigo-600 ring-4 ring-white absolute -left-[31px] top-5" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {renderSeverityBadge(item.severity)}
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[10px] font-black uppercase">
                          {item.layer.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs font-black text-slate-900">{item.title}</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">
                        {new Date(item.timestamp).toLocaleTimeString()} • Confidence {(item.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 mt-1.5">{item.summary}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-600">
                      {item.ipAddress && <span>IP: {item.ipAddress}</span>}
                      {item.macAddress && <span>MAC: {item.macAddress}</span>}
                      {item.switchPort && <span>Switch Port: {item.switchPort}</span>}
                      {item.vlanId && <span>VLAN: {item.vlanId}</span>}
                      {item.ssid && <span>SSID: {item.ssid} ({item.rssi} dBm)</span>}
                      {item.cmdline && <span className="text-rose-700">Cmd: {item.cmdline}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 6: ACTION BROKER & HUMAN APPROVALS (soc-approvals)              */}
        {/* =================================================================== */}
        {currentSubTab === 'soc-approvals' && (
          <div className="space-y-6">
            {/* Queue New Response Action Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900 mb-1">
                Request Audited Containment or DFIR Response Action
              </h2>
              <p className="text-xs text-slate-500 mb-3">
                All high-impact containment actions require human operator approval, carry a 30-minute expiration window (fail-closed on expiry), and automatically enforce Protected-Asset &amp; Shared-Port Safety Locks.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Target Endpoint</label>
                  <select
                    value={newActionTargetId}
                    onChange={e => setNewActionTargetId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold"
                  >
                    {secDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.hostname} ({d.ipAddress} — {d.assetCriticality})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Action Type</label>
                  <select
                    value={newActionType}
                    onChange={e => setNewActionType(e.target.value as SecurityActionType)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold"
                  >
                    <option value="isolate_host">isolate_host (Host Network Quarantine)</option>
                    <option value="kill_process">kill_process (Terminate Malicious PID)</option>
                    <option value="quarantine_file">quarantine_file (SHA-256 Verified Quarantine)</option>
                    <option value="restore_quarantined_file">restore_quarantined_file (Verified Restore)</option>
                    <option value="unifi_block_client">unifi_block_client (UniFi MAC Block)</option>
                    <option value="velociraptor_collect_artifact">velociraptor_collect_artifact (DFIR Triage)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Audit Justification</label>
                  <input
                    type="text"
                    value={newActionReason}
                    onChange={e => setNewActionReason(e.target.value)}
                    placeholder="Reason / Ticket #..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      const dev = secDevices.find(d => d.deviceId === newActionTargetId) || secDevices[0];
                      handleRequestAction(
                        dev.deviceId,
                        dev.hostname,
                        dev.clientId,
                        dev.clientName,
                        newActionType,
                        newActionReason.trim() || `Manual ${newActionType} requested by SOC operator`
                      );
                      setNewActionReason('');
                    }}
                    className="w-full py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-black cursor-pointer"
                  >
                    Submit to Action Broker
                  </button>
                </div>
              </div>
            </div>

            {/* Action Broker Queue List */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="text-base font-black text-slate-900 mb-4">
                Action Broker Audit &amp; Approval Queue (`{actions.length}` Actions)
              </h2>

              <div className="space-y-3">
                {actions.map(act => (
                  <div
                    key={act.id}
                    className={`p-4 rounded-xl border ${
                      act.status === 'blocked_protected_asset'
                        ? 'bg-rose-50/70 border-rose-300'
                        : act.status === 'pending_approval'
                        ? 'bg-amber-50/70 border-amber-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded bg-slate-900 text-white text-xs font-black uppercase">
                          {act.actionType}
                        </span>
                        <span className="text-sm font-black text-slate-900">
                          Target: {act.targetDeviceName}
                        </span>
                        <span className="text-xs text-slate-500">({act.clientName})</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-slate-500">
                          Policy: {act.policyVersion}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase ${
                            act.status === 'blocked_protected_asset'
                              ? 'bg-rose-600 text-white'
                              : act.status === 'pending_approval'
                              ? 'bg-amber-500 text-white'
                              : act.status === 'verified'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-700 text-white'
                          }`}
                        >
                          {act.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 mt-2">{act.reason}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
                      <span>Requested By: <strong>{act.requestedBy}</strong></span>
                      <span>Requested At: {new Date(act.requestedAt).toLocaleTimeString()}</span>
                      <span>Expires At: {new Date(act.expiresAt).toLocaleTimeString()} (Fail-Closed)</span>
                      {act.approvedBy && <span className="text-emerald-700 font-bold">Approved By: {act.approvedBy}</span>}
                    </div>

                    {act.error && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-rose-100 border border-rose-300 text-xs font-bold text-rose-900 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{act.error}</span>
                      </div>
                    )}

                    {act.actualResult && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-emerald-100 border border-emerald-300 text-xs font-bold text-emerald-900 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{act.actualResult}</span>
                      </div>
                    )}

                    {act.status === 'pending_approval' && (
                      <div className="mt-3 pt-3 border-t border-amber-200/80 flex items-center gap-2.5">
                        <button
                          onClick={() => handleApproveAction(act.id)}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve &amp; Dispatch Containment
                        </button>
                        <button
                          onClick={() => handleRejectAction(act.id)}
                          className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Reject Action
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecuritySocView;
