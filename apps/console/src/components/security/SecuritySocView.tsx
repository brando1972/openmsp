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
  Clock,
  Lock,
  Wifi,
  Server,
  Terminal,
  RefreshCw,
  Play,
  Cpu,
  Check,
  X,
  Zap,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

type SocSubTab =
  | 'soc-overview'
  | 'soc-incidents'
  | 'soc-endpoints'
  | 'soc-unifi'
  | 'soc-approvals'
  | 'soc-soar'
  | 'soc-timeline';

const VALID_SUB_TABS: SocSubTab[] = [
  'soc-overview',
  'soc-incidents',
  'soc-endpoints',
  'soc-unifi',
  'soc-approvals',
  'soc-soar',
  'soc-timeline'
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
  const [selectedTimelineDeviceId, setSelectedTimelineDeviceId] = useState<string>('dev-win-7d2840');
  const [timelineData, setTimelineData] = useState<DeviceTimelineResponse | null>(null);

  // Clean UI Collapsible / Sub-View State
  const [showSimDrawer, setShowSimDrawer] = useState<boolean>(false);
  const [showRawDetections, setShowRawDetections] = useState<boolean>(false);
  const [showSensorInventory, setShowSensorInventory] = useState<boolean>(false);
  const [unifiSubView, setUnifiSubView] = useState<'ports' | 'vlans' | 'grafana'>('ports');

  // Simulation & Notification banner state
  const [runningSim, setRunningSim] = useState<string | null>(null);
  const [lastSimResult, setLastSimResult] = useState<SimulationRunResponse | null>(null);
  const [syncingUnifi, setSyncingUnifi] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // New Action Request state
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

  // Gambinos UnPoller + Prometheus + Grafana state
  const [gambinosUnpoller, setGambinosUnpoller] = useState<GambinosUnpollerResponse | null>(null);
  const [activeUnpollerDashboardId, setActiveUnpollerDashboardId] = useState<string>('unifi-sites');

  // Shark Fin Client Live Toggles & Incident Seed Filter state
  const [selectedSharkFinDeviceId, setSelectedSharkFinDeviceId] = useState<string>('dev-win-7d2840');
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
    }, 5000);
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

      const activeSite =
        sitesRes.sites.find(s => s.siteId === selectedSiteId)?.siteId ||
        sitesRes.sites[0]?.siteId ||
        '88f7af54-98f8-306a-a1c7-c9349722b1f6';

      const activeTimelineDevice =
        devRes.devices.find(d => d.deviceId === selectedTimelineDeviceId)?.deviceId ||
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
        `${res.title} (${res.ingestLatencyMs}ms)`
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
      showToast('warn', res.action.error || 'Blocked by Protected POS Safety Lock');
    } else {
      showToast('success', `Queued ${actionType.replace(/_/g, ' ')} on ${targetDeviceName}`);
    }
    await loadAllSocData();
  };

  const handleApproveAction = async (actionId: string) => {
    const res = await api.security.approveAction(actionId, 'Brandon Ray');
    if (res.action.status === 'verified' || res.action.status === 'approved') {
      showToast('success', `Approved ${res.action.actionType.replace(/_/g, ' ')} on ${res.action.targetDeviceName}`);
    } else {
      showToast('warn', res.action.error || `Status: ${res.action.status}`);
    }
    await loadAllSocData();
  };

  const handleRejectAction = async (actionId: string) => {
    await api.security.rejectAction(actionId, 'Rejected by SOC Operator');
    showToast('warn', 'Action rejected');
    await loadAllSocData();
  };

  const handleIncidentStatusChange = async (incidentId: string, status: SecurityIncident['status']) => {
    await api.security.updateIncident(incidentId, { status });
    showToast('success', `Incident marked ${status.replace(/_/g, ' ')}`);
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
        updatedBy: 'ApexMSP SOC Policy'
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
        `Locked by Admin: Local user on ${dev.hostname} cannot change "${label}" while Admin Lock is active.`
      );
      return;
    }

    const opKey = `${dev.deviceId}:${moduleKey}`;
    setUpdatingPolicyKey(opKey);
    try {
      await api.security.updateDevicePolicy(dev.deviceId, {
        [moduleKey]: nextValue,
        updatedBy: isSimulatedTrayClick
          ? `Shark Fin Client (${dev.hostname})`
          : 'Brandon Ray (SOC Console)'
      });
      showToast(
        nextValue ? 'success' : 'warn',
        `${dev.hostname}: ${label} ${nextValue ? 'Enabled' : 'Disabled'}`
      );
      await loadAllSocData();
    } catch (err: any) {
      showToast('error', `Failed to update policy: ${err?.message || 'Unknown error'}`);
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
        ? `Shark Fin Client (${dev.hostname})`
        : 'Brandon Ray (SOC Console)'
    });
    showToast('success', `Scan schedule on ${dev.hostname} set to ${freq}`);
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
        `${res.report.scanTitle} on ${dev.hostname}: ${res.report.status} (${res.report.filesScannedCount.toLocaleString()} items in ${res.report.durationMs}ms)`
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
        `Playbook "${res.trace.playbookName}" completed in ${res.trace.totalDurationMs}ms`
      );
      await loadAllSocData();
    } catch (err: any) {
      showToast('error', `Playbook error: ${err?.message || 'Execution failed'}`);
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
        `Analyzed "${dVal}" → ${res.overallVerdict.toUpperCase()}`
      );
      await loadAllSocData();
    } catch (err: any) {
      showToast('error', `Analyzer error: ${err?.message || 'Analysis failed'}`);
    } finally {
      setRunningCortex(false);
    }
  };

  const renderCortexBadge = (badge: CortexTaxonomyBadge, idx: number) => {
    const colorMap: Record<CortexTaxonomyBadge['level'], string> = {
      malicious: 'bg-rose-100 text-rose-800 border-rose-200',
      suspicious: 'bg-amber-100 text-amber-800 border-amber-200',
      safe: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      info: 'bg-sky-100 text-sky-800 border-sky-200'
    };
    return (
      <span
        key={`${badge.namespace}-${badge.predicate}-${idx}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold border ${colorMap[badge.level]}`}
      >
        {badge.namespace}:{badge.predicate}=&quot;{badge.value}&quot;
      </span>
    );
  };

  // Clean, human-readable Protection Badge (Unknown never shown as protected)
  const renderCoverageBadge = (state: SecurityCoverageState) => {
    switch (state) {
      case 'preventive_active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Protected
          </span>
        );
      case 'containment_verified':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Lock className="w-3.5 h-3.5 text-purple-600" />
            Isolated
          </span>
        );
      case 'containment_requested':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Isolation Pending
          </span>
        );
      case 'collecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Activity className="w-3.5 h-3.5 text-sky-600" />
            Telemetry Only (AV Off)
          </span>
        );
      case 'healthy':
      case 'installed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            Agent Online
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-800 border border-orange-200">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
            Degraded
          </span>
        );
      case 'unknown':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldOff className="w-3.5 h-3.5 text-rose-600" />
            Unprotected
          </span>
        );
    }
  };

  const renderCriticalityBadge = (crit: SecurityIncident['assetCriticality']) => {
    switch (crit) {
      case 'pos_controller':
      case 'pos_payment':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">
            Protected POS
          </span>
        );
      case 'municipal_critical':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            Critical Asset
          </span>
        );
      default:
        return null;
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
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[sev] || map.info}`}>
        {sev}
      </span>
    );
  };

  const SharkFinLogo: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
    const boxCls = size === 'sm' ? 'w-9 h-9 rounded-xl' : 'w-11 h-11 rounded-xl';
    const svgCls = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7';
    return (
      <div className={`${boxCls} bg-gradient-to-br from-teal-400 via-emerald-600 to-slate-900 p-0.5 shadow shrink-0`}>
        <div className="w-full h-full rounded-[10px] bg-slate-950/90 flex items-center justify-center">
          <svg viewBox="0 0 36 36" className={svgCls} fill="none">
            <path
              d="M18 2.5L5.5 7.5V17.2C5.5 25.1 10.8 31.8 18 33.8C25.2 31.8 30.5 25.1 30.5 17.2V7.5L18 2.5Z"
              fill="#0d9488"
              stroke="#34d399"
              strokeWidth="1.8"
            />
            <path
              d="M10.5 23.5C12.2 17.5 15.8 11.4 22.8 9.2C21.2 14.5 21.8 19.2 24.5 23.5H10.5Z"
              fill="#ffffff"
            />
            <path
              d="M9.5 26.5H26.5"
              stroke="#5eead4"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
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

  // Group Playbooks / Approvals / Timeline into the 5th main navigation tab
  const isAutomationOrApprovalsTab =
    currentSubTab === 'soc-approvals' ||
    currentSubTab === 'soc-soar' ||
    currentSubTab === 'soc-timeline';

  const managedEndpoints = secDevices.filter(d => d.posture.coverageState !== 'unknown');
  const activeSharkFinDev =
    secDevices.find(d => d.deviceId === selectedSharkFinDeviceId) ||
    managedEndpoints[0] ||
    secDevices[0];

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-50">
      {/* ===================================================================== */}
      {/* Clean, Streamlined Top SOC Header & 5 Intuitive Tabs                  */}
      {/* ===================================================================== */}
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3">
          <div className="flex items-center gap-3">
            <SharkFinLogo size="sm" />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-bold text-slate-900">
                  Security Operations Center
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {dataSource === 'live_api' ? 'Live' : 'Snapshot'}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-100 text-slate-600">
                  Agent v2.0.4-soc
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Endpoint Protection, SIEM Alerts, UniFi Network Security &amp; Response Approvals
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search devices, alerts, IPs..."
                className="bg-slate-100 border border-slate-200 focus:bg-white focus:border-emerald-500 text-xs text-slate-900 placeholder-slate-400 rounded-lg pl-8 pr-3 py-1.5 outline-none w-52 transition"
              />
            </div>

            <button
              onClick={() => setEndUserPortalMode(prev => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
                endUserPortalMode
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              {endUserPortalMode ? '← Back to SOC Console' : '🦈 End-User Tray View'}
            </button>

            <button
              onClick={() => loadAllSocData()}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Toast Banner */}
        {toastMessage && (
          <div
            className={`mb-3 px-4 py-2 rounded-lg text-xs font-medium flex items-center justify-between border ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : toastMessage.type === 'warn'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>{toastMessage.text}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 5 Clean Navigation Tabs */}
        {!endUserPortalMode && (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {[
              { id: 'soc-overview', label: 'Overview', Icon: Shield, active: currentSubTab === 'soc-overview' },
              {
                id: 'soc-incidents',
                label: 'Threats & Incidents',
                badge: kpis.openIncidents,
                badgeTone: kpis.criticalIncidents > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700',
                Icon: ShieldAlert,
                active: currentSubTab === 'soc-incidents'
              },
              {
                id: 'soc-endpoints',
                label: 'Endpoints & Shark Fin',
                badge: secDevices.length,
                badgeTone: 'bg-emerald-50 text-emerald-700',
                Icon: Cpu,
                active: currentSubTab === 'soc-endpoints'
              },
              {
                id: 'soc-unifi',
                label: 'Network & UniFi',
                badge: `${unifiSites.length} Sites`,
                badgeTone: 'bg-indigo-50 text-indigo-700',
                Icon: Wifi,
                active: currentSubTab === 'soc-unifi'
              },
              {
                id: 'soc-approvals',
                label: 'Playbooks & Approvals',
                badge: kpis.pendingApprovals > 0 ? kpis.pendingApprovals : undefined,
                badgeTone: 'bg-amber-100 text-amber-800',
                Icon: Zap,
                active: isAutomationOrApprovalsTab
              }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as SocSubTab)}
                className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
                  tab.active
                    ? 'text-emerald-700 border-emerald-600 bg-emerald-50/40'
                    : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <tab.Icon className={`w-4 h-4 ${tab.active ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab.badgeTone}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* Main Content Area                                                     */}
      {/* ===================================================================== */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* ================================================================= */}
          {/* END-USER SHARK FIN PORTAL VIEW (/sharkfin)                        */}
          {/* ================================================================= */}
          {endUserPortalMode && activeSharkFinDev && (() => {
            const pol = getDeviceSharkFinPolicy(activeSharkFinDev);
            const scanReport = latestScanReports[activeSharkFinDev.deviceId] || pol.lastScanReport;

            return (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div className="flex items-center gap-3.5">
                    <SharkFinLogo />
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900">
                          ApexMSP Shark Fin Protection — {activeSharkFinDev.hostname}
                        </h2>
                        {renderCoverageBadge(activeSharkFinDev.posture.coverageState)}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Agent v2.0.4-soc · {activeSharkFinDev.clientName} · IP {activeSharkFinDev.ipAddress}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-500">Device:</label>
                    <select
                      value={activeSharkFinDev.deviceId}
                      onChange={e => setSelectedSharkFinDeviceId(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      {managedEndpoints.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.hostname} ({d.clientName})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quick Scan Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    {
                      scanType: 'quick_av_yara' as const,
                      label: 'Quick Malware Scan',
                      sub: 'Memory & startup processes (~1s)',
                      tone: 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    },
                    {
                      scanType: 'full_clamav_yara' as const,
                      label: 'Full Deep Scan',
                      sub: 'ClamAV + YARA-X file scan',
                      tone: 'bg-slate-900 hover:bg-slate-800 text-white'
                    },
                    {
                      scanType: 'canary_verify_reseed' as const,
                      label: 'Verify Ransomware Canaries',
                      sub: 'Check SHA-256 decoy files',
                      tone: 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-200'
                    },
                    {
                      scanType: 'velociraptor_dfir_audit' as const,
                      label: 'Audit Running Processes',
                      sub: 'Velociraptor persistence check',
                      tone: 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-200'
                    }
                  ].map(btn => {
                    const isScanning = runningScanKey === `${activeSharkFinDev.deviceId}:${btn.scanType}`;
                    return (
                      <button
                        key={btn.scanType}
                        disabled={runningScanKey !== null}
                        onClick={() => handleRunDeviceScan(activeSharkFinDev, btn.scanType, 'end_user_sharkfin')}
                        className={`p-3.5 rounded-xl text-left transition cursor-pointer disabled:opacity-50 ${btn.tone}`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span>{btn.label}</span>
                          {isScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        </div>
                        <div className="text-[11px] opacity-80 mt-1">{btn.sub}</div>
                      </button>
                    );
                  })}
                </div>

                {scanReport && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-emerald-900">{scanReport.scanTitle}:</span>{' '}
                      <span className="text-emerald-800">{scanReport.summary}</span>
                    </div>
                    <span className="font-mono text-[11px] text-emerald-700 font-semibold">
                      {scanReport.filesScannedCount.toLocaleString()} files · {scanReport.durationMs}ms
                    </span>
                  </div>
                )}

                {/* 6 Simple Protection Switches */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Protection Features
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { key: 'preventiveAvEnabled' as const, label: 'Real-Time Antivirus', desc: 'OS Antivirus & malware blocking' },
                      { key: 'endpointEdrEnabled' as const, label: 'Endpoint Detection (EDR)', desc: 'Process & network threat monitoring' },
                      { key: 'ransomwareProtectionEnabled' as const, label: 'Ransomware Shadow Guard', desc: 'Blocks backup & shadow-copy deletion' },
                      { key: 'canaryTripwireEnabled' as const, label: 'Canary Decoy Files', desc: 'Detects unauthorized file encryption' },
                      { key: 'yaraClamScannerEnabled' as const, label: 'YARA-X & ClamAV Scanner', desc: 'Signature & heuristic file scanning' },
                      { key: 'scheduledScanEnabled' as const, label: 'Scheduled Scans', desc: `Automatic ${pol.scanFrequency || 'daily'} background scan` }
                    ].map(mod => {
                      const isOn = Boolean(pol[mod.key] ?? true);
                      return (
                        <div
                          key={mod.key}
                          className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-900">{mod.label}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{mod.desc}</div>
                          </div>
                          <button
                            onClick={() => handleToggleSharkFinModule(activeSharkFinDev, mod.key, !isOn, mod.label, true)}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                              isOn
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {isOn ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ================================================================= */}
          {/* TAB 1: CLEAN OVERVIEW DASHBOARD (soc-overview)                    */}
          {/* ================================================================= */}
          {!endUserPortalMode && currentSubTab === 'soc-overview' && (
            <>
              {/* 4 Clean Summary KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={() => setSubTab('soc-incidents')}
                  className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 p-5 text-left shadow-sm transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Active Threats</span>
                    <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2.5">
                    <span className="text-3xl font-bold text-slate-900">{kpis.openIncidents}</span>
                    {kpis.criticalIncidents > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700">
                        {kpis.criticalIncidents} critical
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Click to review incidents →</div>
                </button>

                <button
                  onClick={() => setSubTab('soc-endpoints')}
                  className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 p-5 text-left shadow-sm transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Protected Endpoints</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2.5">
                    <span className="text-3xl font-bold text-slate-900">
                      {kpis.preventiveAvActiveCount}/{kpis.totalMonitoredEndpoints}
                    </span>
                    {kpis.unknownCoverageCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800">
                        {kpis.unknownCoverageCount} unprotected
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Manage Shark Fin &amp; scans →</div>
                </button>

                <button
                  onClick={() => setSubTab('soc-unifi')}
                  className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 p-5 text-left shadow-sm transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">UniFi Network Sites</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Wifi className="w-4 h-4 text-indigo-600" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2.5">
                    <span className="text-3xl font-bold text-slate-900">{kpis.connectedUnifiConsoles}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                      All Online
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Gambinos, TBI, Raytreat, SOS →</div>
                </button>

                <button
                  onClick={() => setSubTab('soc-approvals')}
                  className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 p-5 text-left shadow-sm transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Pending Approvals</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-amber-600" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2.5">
                    <span className="text-3xl font-bold text-slate-900">{kpis.pendingApprovals}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-fuchsia-50 text-fuchsia-700">
                      {kpis.protectedCriticalAssets} POS Protected
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Review containment queue →</div>
                </button>
              </div>

              {/* Main 2-Column Workspace: Left = Needs Attention, Right = Fleet & Network Status */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column (7 cols): Needs Attention (Active Incidents & Pending Approvals) */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Active Incidents Card */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">Active Security Incidents</h2>
                        <p className="text-xs text-slate-500">Prioritized alerts across endpoints and UniFi networks</p>
                      </div>
                      <button
                        onClick={() => setSubTab('soc-incidents')}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                      >
                        View All ({incidents.length}) →
                      </button>
                    </div>

                    <div className="space-y-3">
                      {incidents.slice(0, 4).map(inc => (
                        <div
                          key={inc.id}
                          className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 transition"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {renderSeverityBadge(inc.severity)}
                              <span className="text-xs font-bold text-slate-900">{inc.title}</span>
                            </div>
                            {renderCriticalityBadge(inc.assetCriticality)}
                          </div>
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{inc.summary}</p>
                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span>
                              Client: <strong className="text-slate-700">{inc.clientName}</strong> · Host:{' '}
                              <strong className="text-slate-700">{inc.deviceName || 'Network'}</strong>
                            </span>
                            <button
                              onClick={() => setSubTab('soc-incidents')}
                              className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                            >
                              Investigate →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pending Approvals Card */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">Response Actions &amp; Safety Locks</h2>
                        <p className="text-xs text-slate-500">Human approval required before isolating hosts or blocking ports</p>
                      </div>
                      <button
                        onClick={() => setSubTab('soc-approvals')}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                      >
                        All Actions ({actions.length}) →
                      </button>
                    </div>

                    <div className="space-y-3">
                      {actions.slice(0, 3).map(act => (
                        <div
                          key={act.id}
                          className={`p-3.5 rounded-xl border ${
                            act.status === 'blocked_protected_asset'
                              ? 'bg-rose-50/50 border-rose-200'
                              : act.status === 'pending_approval'
                              ? 'bg-amber-50/50 border-amber-200'
                              : 'bg-slate-50/50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {act.actionType.replace(/_/g, ' ').toUpperCase()} — {act.targetDeviceName}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                act.status === 'blocked_protected_asset'
                                  ? 'bg-rose-100 text-rose-800'
                                  : act.status === 'pending_approval'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {act.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">{act.reason}</p>
                          {act.error && (
                            <div className="mt-2 text-[11px] font-medium text-rose-700 bg-rose-100/70 px-2.5 py-1 rounded">
                              {act.error}
                            </div>
                          )}
                          {act.status === 'pending_approval' && (
                            <div className="mt-2.5 flex items-center gap-2">
                              <button
                                onClick={() => handleApproveAction(act.id)}
                                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" /> Approve
                              </button>
                              <button
                                onClick={() => handleRejectAction(act.id)}
                                className="px-3 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column (5 cols): Endpoint Coverage, UniFi Sites & Collapsible Lab Drawer */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Clean Endpoint Coverage Card */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-bold text-slate-900">Endpoint Protection Summary</h2>
                      <button
                        onClick={() => setSubTab('soc-endpoints')}
                        className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Manage Endpoints →
                      </button>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex mb-4">
                      <div
                        className="bg-emerald-500 h-full"
                        style={{
                          width: `${Math.max(
                            5,
                            Math.round((kpis.preventiveAvActiveCount / Math.max(1, kpis.totalMonitoredEndpoints)) * 100)
                          )}%`
                        }}
                      />
                      {kpis.unknownCoverageCount > 0 && (
                        <div
                          className="bg-rose-500 h-full"
                          style={{
                            width: `${Math.round(
                              (kpis.unknownCoverageCount / Math.max(1, kpis.totalMonitoredEndpoints)) * 100
                            )}%`
                          }}
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 text-center">
                      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                        <div className="text-xl font-bold text-emerald-800">{kpis.preventiveAvActiveCount}</div>
                        <div className="text-[11px] font-medium text-emerald-700">Protected</div>
                      </div>
                      <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200">
                        <div className="text-xl font-bold text-sky-800">{kpis.canaryProtectedCount}</div>
                        <div className="text-[11px] font-medium text-sky-700">Canaries Armed</div>
                      </div>
                      <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                        <div className="text-xl font-bold text-rose-800">{kpis.unknownCoverageCount}</div>
                        <div className="text-[11px] font-medium text-rose-700">Unprotected</div>
                      </div>
                    </div>
                  </div>

                  {/* Connected UniFi Sites Compact List */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-bold text-slate-900">Connected UniFi Networks</h2>
                      <button
                        onClick={() => setSubTab('soc-unifi')}
                        className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Open Topology →
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {unifiSites.map(site => (
                        <div
                          key={site.siteId}
                          onClick={() => {
                            setSelectedSiteId(site.siteId);
                            setSubTab('soc-unifi');
                          }}
                          className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 flex items-center justify-between cursor-pointer transition"
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-900">{site.clientName}</div>
                            <div className="text-[11px] text-slate-500">
                              {site.consoleName} · {site.counts.onlineDevices}/{site.counts.adoptedDevices} devices ·{' '}
                              {site.counts.activeClients} clients
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Online
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Collapsible Security Test / Simulation Drawer (Collapsed by default!) */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <button
                      onClick={() => setShowSimDrawer(prev => !prev)}
                      className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-800">Security Test &amp; Verification Suite</div>
                        <div className="text-[11px] text-slate-500">
                          Run safe EICAR, Ransomware Canary, or Gambinos Port 43 guard tests
                        </div>
                      </div>
                      {showSimDrawer ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {showSimDrawer && (
                      <div className="px-5 pb-4 pt-2 border-t border-slate-100 space-y-2">
                        {[
                          { id: 'eicar_av_test', label: 'Run EICAR Antivirus Quarantine Test' },
                          { id: 'ransomware_vssadmin', label: 'Run Ransomware Shadow-Copy Guard Test' },
                          { id: 'canary_tripwire', label: 'Run Canary Decoy File Tripwire Test' },
                          { id: 'gambinos_port43_guard', label: 'Test Gambinos Port 43 Shared POS Lock' },
                          { id: 'overlap_ip_isolation', label: 'Test Multi-Tenant Overlapping IP Isolation' }
                        ].map(sim => (
                          <button
                            key={sim.id}
                            disabled={runningSim !== null}
                            onClick={() => handleRunSimulation(sim.id)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800 flex items-center justify-between transition cursor-pointer disabled:opacity-50"
                          >
                            <span>{sim.label}</span>
                            <Play className={`w-3.5 h-3.5 text-emerald-600 ${runningSim === sim.id ? 'animate-ping' : ''}`} />
                          </button>
                        ))}

                        {lastSimResult && (
                          <div className="mt-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                            <div className="font-bold">✓ {lastSimResult.title}</div>
                            <div className="mt-0.5 text-[11px] text-emerald-800">{lastSimResult.summary}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ================================================================= */}
          {/* TAB 2: THREATS & INCIDENTS (soc-incidents)                        */}
          {/* ================================================================= */}
          {!endUserPortalMode && currentSubTab === 'soc-incidents' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Security Incidents</h2>
                    <p className="text-xs text-slate-500">
                      Correlated alerts across Endpoint EDR, Antivirus, Canary files, and UniFi networks
                    </p>
                  </div>

                  <button
                    onClick={() => setHideSeededLabIncidents(prev => !prev)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      hideSeededLabIncidents
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {hideSeededLabIncidents ? 'Showing Live Findings Only' : 'Hide Lab Test Incidents'}
                  </button>
                </div>

                <div className="space-y-3">
                  {incidents
                    .filter(inc => !hideSeededLabIncidents || !isSeededLabIncident(inc))
                    .filter(
                      inc =>
                        !searchQuery ||
                        inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        inc.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (inc.deviceName || '').toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map(inc => {
                      const isSeeded = isSeededLabIncident(inc);
                      return (
                        <div
                          key={inc.id}
                          className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white transition"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {renderSeverityBadge(inc.severity)}
                              <span className="text-xs font-mono font-bold text-slate-500">{inc.incidentNumber}</span>
                              <h3 className="text-sm font-bold text-slate-900">{inc.title}</h3>
                              {renderCriticalityBadge(inc.assetCriticality)}
                              {isSeeded && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                  Lab Simulation
                                </span>
                              )}
                            </div>

                            <select
                              value={inc.status}
                              onChange={e => handleIncidentStatusChange(inc.id, e.target.value as any)}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700"
                            >
                              <option value="open">Open</option>
                              <option value="investigating">Investigating</option>
                              <option value="contained">Contained</option>
                              <option value="resolved">Resolved</option>
                            </select>
                          </div>

                          <p className="text-xs text-slate-600 mt-1.5">{inc.summary}</p>

                          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-3 text-slate-500">
                              <span>
                                Client: <strong className="text-slate-800">{inc.clientName}</strong>
                              </span>
                              <span>
                                Device: <strong className="text-slate-800">{inc.deviceName || 'Network'}</strong>
                              </span>
                              {inc.ticketId && <span>Ticket: {inc.ticketId}</span>}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  handleRequestAction(
                                    inc.deviceId || 'dev-gambinos-c1',
                                    inc.deviceName || 'Target Host',
                                    inc.clientId,
                                    inc.clientName,
                                    'isolate_host',
                                    `Isolate host for ${inc.incidentNumber}: ${inc.title}`,
                                    inc.id
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Lock className="w-3 h-3" /> Isolate Host
                              </button>
                              <button
                                onClick={() =>
                                  handleRequestAction(
                                    inc.deviceId || 'dev-gambinos-c1',
                                    inc.deviceName || 'Target Host',
                                    inc.clientId,
                                    inc.clientName,
                                    'velociraptor_collect_artifact',
                                    `Collect forensic triage for ${inc.incidentNumber}`,
                                    inc.id
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Terminal className="w-3 h-3" /> Collect Triage
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Collapsible Raw Detections Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowRawDetections(prev => !prev)}
                  className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 cursor-pointer"
                >
                  <span className="text-xs font-bold text-slate-700">
                    Raw Detection Telemetry Log ({events.length} events)
                  </span>
                  {showRawDetections ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {showRawDetections && (
                  <div className="overflow-x-auto border-t border-slate-100">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                          <th className="py-2.5 px-4">Time</th>
                          <th className="py-2.5 px-4">Rule</th>
                          <th className="py-2.5 px-4">Device / Client</th>
                          <th className="py-2.5 px-4">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {events.map(ev => (
                          <tr key={ev.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                              {new Date(ev.ingestTime || ev.sourceTimestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                {renderSeverityBadge(ev.severity)}
                                <span>{ev.ruleName}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-slate-900">{ev.deviceName || 'Network'}</div>
                              <div className="text-[11px] text-slate-500">{ev.clientName}</div>
                            </td>
                            <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                              {ev.process?.cmdline || ev.summary}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: ENDPOINTS & SHARK FIN (Master-Detail Split View)           */}
          {/* ================================================================= */}
          {!endUserPortalMode && currentSubTab === 'soc-endpoints' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (5 cols): Clean, Compact Selectable Endpoint List */}
              <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Monitored Endpoints ({secDevices.length})</h2>
                    <p className="text-xs text-slate-500">Select a computer to configure protection &amp; run scans</p>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
                  {secDevices
                    .filter(
                      d =>
                        !searchQuery ||
                        d.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        d.ipAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        d.clientName.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map(dev => {
                      const selected = activeSharkFinDev?.deviceId === dev.deviceId;
                      return (
                        <button
                          key={dev.deviceId}
                          onClick={() => setSelectedSharkFinDeviceId(dev.deviceId)}
                          className={`w-full p-3.5 text-left flex items-center justify-between gap-3 transition cursor-pointer ${
                            selected ? 'bg-emerald-50/70 border-l-4 border-emerald-600' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 truncate">{dev.hostname}</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] uppercase">
                                {dev.os}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              {dev.clientName} · <span className="font-mono">{dev.ipAddress}</span>
                            </div>
                          </div>
                          <div className="shrink-0">{renderCoverageBadge(dev.posture.coverageState)}</div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Right Column (7 cols): Selected Endpoint Shark Fin Controls & Scans */}
              {activeSharkFinDev && (() => {
                const p = activeSharkFinDev.posture;
                const pol = getDeviceSharkFinPolicy(activeSharkFinDev);
                const scanRep = latestScanReports[activeSharkFinDev.deviceId] || pol.lastScanReport;

                return (
                  <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
                    {/* Selected Device Header */}
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3.5">
                        <SharkFinLogo />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-bold text-slate-900">{activeSharkFinDev.hostname}</h2>
                            {renderCoverageBadge(p.coverageState)}
                            {renderCriticalityBadge(activeSharkFinDev.assetCriticality)}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Client: <strong className="text-slate-700">{activeSharkFinDev.clientName}</strong> · IP:{' '}
                            <code className="font-mono text-slate-700">{activeSharkFinDev.ipAddress}</code> · Agent{' '}
                            <strong className="text-emerald-700">v2.0.4-soc</strong>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            handleToggleSharkFinModule(
                              activeSharkFinDev,
                              'policyLockedByAdmin',
                              !pol.policyLockedByAdmin,
                              'Admin Tray Lock',
                              false
                            )
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
                            pol.policyLockedByAdmin
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                          {pol.policyLockedByAdmin ? 'Tray Locked by Admin' : 'Lock Local Tray'}
                        </button>

                        <button
                          onClick={() => {
                            setSelectedTimelineDeviceId(activeSharkFinDev.deviceId);
                            setSubTab('soc-timeline');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Clock className="w-3.5 h-3.5" /> Timeline
                        </button>
                      </div>
                    </div>

                    {/* 6 Clean Shark Fin Feature Toggles */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Shark Fin Protection Modules
                        </h3>
                        <span className="text-[11px] text-slate-400">
                          {p.preventiveAvName || 'OS Antivirus'} · CPU {p.supervisorCpuPct ?? 0.4}%
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { key: 'preventiveAvEnabled' as const, label: 'Real-Time Antivirus (AV)', sub: p.preventiveAvName || 'Defender / XProtect' },
                          { key: 'endpointEdrEnabled' as const, label: 'Endpoint Detection (EDR)', sub: 'Process & command-line monitor' },
                          { key: 'ransomwareProtectionEnabled' as const, label: 'Ransomware VSS Guard', sub: 'Blocks shadow-copy deletion' },
                          { key: 'canaryTripwireEnabled' as const, label: 'Canary Decoy Tripwires', sub: '3 SHA-256 tripwire files armed' },
                          { key: 'yaraClamScannerEnabled' as const, label: 'YARA-X & ClamAV Scanner', sub: 'Real-time & on-demand scanner' },
                          { key: 'scheduledScanEnabled' as const, label: 'Scheduled Scans', sub: `Runs ${(pol.scanFrequency || 'daily')}` }
                        ].map(mod => {
                          const enabled = Boolean(pol[mod.key] ?? true);
                          const busy = updatingPolicyKey === `${activeSharkFinDev.deviceId}:${mod.key}`;
                          return (
                            <div
                              key={mod.key}
                              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3"
                            >
                              <div>
                                <div className="text-xs font-bold text-slate-900">{mod.label}</div>
                                <div className="text-[11px] text-slate-500">{mod.sub}</div>
                              </div>
                              <button
                                disabled={busy || p.coverageState === 'unknown'}
                                onClick={() =>
                                  handleToggleSharkFinModule(activeSharkFinDev, mod.key, !enabled, mod.label, false)
                                }
                                className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer disabled:opacity-40 ${
                                  enabled && p.coverageState !== 'unknown'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {enabled && p.coverageState !== 'unknown' ? 'ON' : 'OFF'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 4 One-Click Scan Actions */}
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                        Run On-Demand Scan or Check
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {[
                          { scanType: 'quick_av_yara' as const, label: 'Run Quick AV + YARA-X Scan', primary: true },
                          { scanType: 'full_clamav_yara' as const, label: 'Run Full ClamAV Deep Scan', primary: false },
                          { scanType: 'canary_verify_reseed' as const, label: 'Verify Canary Decoy Files', primary: false },
                          { scanType: 'velociraptor_dfir_audit' as const, label: 'Run Process & Startup Check', primary: false }
                        ].map(btn => {
                          const isScanning = runningScanKey === `${activeSharkFinDev.deviceId}:${btn.scanType}`;
                          return (
                            <button
                              key={btn.scanType}
                              disabled={runningScanKey !== null}
                              onClick={() => handleRunDeviceScan(activeSharkFinDev, btn.scanType, 'soc_admin')}
                              className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer disabled:opacity-50 ${
                                btn.primary
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                              }`}
                            >
                              <span>{btn.label}</span>
                              {isScanning ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {scanRep && (
                        <div className="mt-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                          <div className="flex items-center justify-between font-bold text-emerald-900">
                            <span>{scanRep.scanTitle}</span>
                            <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-emerald-200 text-emerald-900">
                              {scanRep.status}
                            </span>
                          </div>
                          <p className="text-emerald-800 mt-1">{scanRep.summary}</p>
                        </div>
                      )}
                    </div>

                    {/* Collapsible Installed Sensors & Versions */}
                    <div className="border-t border-slate-100 pt-3">
                      <button
                        onClick={() => setShowSensorInventory(prev => !prev)}
                        className="w-full flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        <span>Installed Clients &amp; Sensor Versions (Agent v2.0.4-soc)</span>
                        {showSensorInventory ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>

                      {showSensorInventory && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {[
                            { name: 'ApexMSP Core Agent', ver: 'v2.0.4-soc' },
                            { name: 'ApexConnect Remote (MeshAgent)', ver: 'v1.1.24' },
                            { name: p.preventiveAvName || 'OS Preventive AV', ver: activeSharkFinDev.os === 'macos' ? 'v2185' : 'v4.18.24090' },
                            { name: 'Go EDR & VSS Guard', ver: 'v2.0.4' },
                            { name: 'YARA-X & ClamAV', ver: 'v0.10.0 / v1.4.1' },
                            { name: 'Wazuh & Velociraptor', ver: 'v4.9.2 / v0.73.1' }
                          ].map(s => (
                            <div
                              key={s.name}
                              className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
                            >
                              <span className="font-medium text-slate-700">{s.name}</span>
                              <span className="font-mono text-[11px] font-semibold text-emerald-700">{s.ver}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: NETWORK & UNIFI (soc-unifi)                                */}
          {/* ================================================================= */}
          {!endUserPortalMode && currentSubTab === 'soc-unifi' && (
            <div className="space-y-6">
              {/* 4-Card Site Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {unifiSites.map(site => {
                  const selected = site.siteId === (siteTopology?.site.siteId || selectedSiteId);
                  return (
                    <div
                      key={site.siteId}
                      onClick={() => setSelectedSiteId(site.siteId)}
                      className={`rounded-xl border p-4 transition cursor-pointer ${
                        selected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                          : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold">{site.clientName}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">
                          Online
                        </span>
                      </div>
                      <div className={`text-xs mt-0.5 ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                        {site.consoleName} · FW {site.firmwareVersion}
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span>{site.counts.onlineDevices}/{site.counts.adoptedDevices} Devices</span>
                        <span>{site.counts.activeClients} Clients</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Site Workspace */}
              {siteTopology && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {siteTopology.site.clientName} — {siteTopology.site.consoleName}
                      </h2>
                      <p className="text-xs text-slate-500">
                        Last synced {new Date(siteTopology.site.lastSyncedAt).toLocaleTimeString()} · Read-Only API Connected
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* 3 Clean Sub-View Pills */}
                      <div className="bg-slate-100 p-1 rounded-lg flex items-center gap-1">
                        {[
                          { id: 'ports' as const, label: 'Switches & Ports' },
                          { id: 'vlans' as const, label: 'VLANs & Wireless' },
                          { id: 'grafana' as const, label: 'Live Grafana Charts' }
                        ].map(v => (
                          <button
                            key={v.id}
                            onClick={() => setUnifiSubView(v.id)}
                            className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                              unifiSubView === v.id
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>

                      <button
                        disabled={syncingUnifi}
                        onClick={() => handleSyncUnifiSite(siteTopology.site.siteId)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncingUnifi ? 'animate-spin' : ''}`} />
                        Sync
                      </button>
                    </div>
                  </div>

                  {/* SUB-VIEW 1: Switches & Ports */}
                  {unifiSubView === 'ports' && (
                    <div className="space-y-4">
                      {siteTopology.switches.map(sw => (
                        <div key={sw.id} className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 font-bold text-slate-900">
                              <Server className="w-4 h-4 text-slate-500" />
                              <span>{sw.name}</span>
                              <span className="font-mono font-normal text-slate-500">({sw.ip})</span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                sw.online ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {sw.online ? 'Online' : 'Offline'}
                            </span>
                          </div>

                          {sw.ports.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase text-slate-400">
                                    <th className="py-2.5 px-4">Port</th>
                                    <th className="py-2.5 px-4">Type</th>
                                    <th className="py-2.5 px-4">VLAN</th>
                                    <th className="py-2.5 px-4">Connected Devices</th>
                                    <th className="py-2.5 px-4">Safety Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {sw.ports.map(port => {
                                    const isShared = port.portIdx === 43 || port.macCount > 1;
                                    return (
                                      <tr key={port.portIdx} className={isShared ? 'bg-rose-50/40' : 'hover:bg-slate-50'}>
                                        <td className="py-3 px-4 font-bold text-slate-900">Port {port.portIdx}</td>
                                        <td className="py-3 px-4">
                                          {isShared ? (
                                            <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-semibold">
                                              Shared Hub ({port.macCount} devices)
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                                              Direct (1 device)
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-3 px-4 text-slate-600">{port.vlanName}</td>
                                        <td className="py-3 px-4">
                                          <div className="flex flex-wrap gap-1.5">
                                            {port.connectedClients.map((c, idx) => (
                                              <span
                                                key={idx}
                                                className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-medium text-slate-800"
                                              >
                                                {c.hostname} ({c.ip || c.mac})
                                              </span>
                                            ))}
                                          </div>
                                        </td>
                                        <td className="py-3 px-4">
                                          {port.safetyLockActive ? (
                                            <span className="inline-flex items-center gap-1 text-rose-700 font-semibold text-[11px]">
                                              <Lock className="w-3.5 h-3.5" /> Auto-Shutdown Blocked (POS Protected)
                                            </span>
                                          ) : (
                                            <span className="text-slate-400 text-[11px]">Standard</span>
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
                  )}

                  {/* SUB-VIEW 2: VLANs & Wireless */}
                  {unifiSubView === 'vlans' && (
                    <div className="space-y-5">
                      <div>
                        <h3 className="text-xs font-bold uppercase text-slate-400 mb-3">Networks &amp; VLANs</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {siteTopology.site.vlans.map(v => (
                            <div key={v.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-900">
                                  VLAN {v.vlanId} — {v.name}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    v.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {v.enabled ? 'Active' : 'Staged'}
                                </span>
                              </div>
                              <div className="text-xs font-mono text-slate-600 mt-1">{v.subnet}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {siteTopology.wirelessDiscrepancies.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold uppercase text-slate-400 mb-3">
                            Verified Wireless POS Terminals (SUNMI OrderPAD3)
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {siteTopology.wirelessDiscrepancies.map((w, idx) => (
                              <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                                <div>
                                  <div className="text-xs font-bold text-slate-900">{w.canonicalRole}</div>
                                  <div className="text-[11px] text-slate-500 font-mono">
                                    IP {w.ip} · SN {w.serial} · {w.apName}
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                                  Verified POS
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB-VIEW 3: Live Grafana Charts (Gambinos UnPoller) */}
                  {unifiSubView === 'grafana' && gambinosUnpoller && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {gambinosUnpoller.dashboards.map(dash => (
                            <button
                              key={dash.id}
                              onClick={() => setActiveUnpollerDashboardId(dash.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                dash.id === activeUnpollerDashboardId
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                            >
                              {dash.shortLabel}
                            </button>
                          ))}
                        </div>

                        {(() => {
                          const activeDash =
                            gambinosUnpoller.dashboards.find(d => d.id === activeUnpollerDashboardId) ||
                            gambinosUnpoller.dashboards[0];
                          return (
                            <a
                              href={activeDash.fullUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
                            >
                              Open Full Grafana <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          );
                        })()}
                      </div>

                      {(() => {
                        const activeDash =
                          gambinosUnpoller.dashboards.find(d => d.id === activeUnpollerDashboardId) ||
                          gambinosUnpoller.dashboards[0];
                        return (
                          <div className="w-full h-[520px] rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
                            <iframe
                              key={activeDash.id}
                              src={activeDash.embedUrl}
                              title={activeDash.title}
                              className="w-full h-full border-0"
                              loading="lazy"
                            />
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 5: PLAYBOOKS, APPROVALS & TIMELINE                            */}
          {/* ================================================================= */}
          {!endUserPortalMode && isAutomationOrApprovalsTab && (
            <div className="space-y-6">
              {/* Sub-Navigation Pills for Approvals / SOAR Playbooks / Device Timeline */}
              <div className="flex items-center justify-between flex-wrap gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-1.5">
                  {[
                    { id: 'soc-approvals' as const, label: `Action Approvals (${actions.length})` },
                    { id: 'soc-soar' as const, label: 'SOAR Playbooks & IOC Lookup' },
                    { id: 'soc-timeline' as const, label: 'Device Event Timeline' }
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSubTab(p.id)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        currentSubTab === p.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {soarOverview && (
                  <div className="flex items-center gap-2">
                    <a
                      href={soarOverview.engines.shuffle.endpointUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1"
                    >
                      Shuffle UI <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href={soarOverview.engines.thehive.endpointUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1"
                    >
                      TheHive / Cortex <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* SUB-SECTION A: Action Approvals (soc-approvals) */}
              {currentSubTab === 'soc-approvals' && (
                <div className="space-y-6">
                  {/* Request New Action Bar */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 mb-3">Request Response Action</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <select
                        value={newActionTargetId}
                        onChange={e => setNewActionTargetId(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold"
                      >
                        {secDevices.map(d => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.hostname} ({d.ipAddress})
                          </option>
                        ))}
                      </select>

                      <select
                        value={newActionType}
                        onChange={e => setNewActionType(e.target.value as SecurityActionType)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold"
                      >
                        <option value="isolate_host">Isolate Host</option>
                        <option value="kill_process">Kill Process</option>
                        <option value="quarantine_file">Quarantine File</option>
                        <option value="unifi_block_client">Block UniFi Client</option>
                        <option value="velociraptor_collect_artifact">Collect Forensic Triage</option>
                      </select>

                      <input
                        type="text"
                        value={newActionReason}
                        onChange={e => setNewActionReason(e.target.value)}
                        placeholder="Reason or ticket #..."
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                      />

                      <button
                        onClick={() => {
                          const dev = secDevices.find(d => d.deviceId === newActionTargetId) || secDevices[0];
                          if (!dev) return;
                          handleRequestAction(
                            dev.deviceId,
                            dev.hostname,
                            dev.clientId,
                            dev.clientName,
                            newActionType,
                            newActionReason.trim() || `Manual ${newActionType} requested`
                          );
                          setNewActionReason('');
                        }}
                        className="py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                      >
                        Submit Action
                      </button>
                    </div>
                  </div>

                  {/* Approvals List */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">Approval Queue</h3>
                    {actions.map(act => (
                      <div
                        key={act.id}
                        className={`p-4 rounded-xl border ${
                          act.status === 'blocked_protected_asset'
                            ? 'bg-rose-50/50 border-rose-200'
                            : act.status === 'pending_approval'
                            ? 'bg-amber-50/50 border-amber-200'
                            : 'bg-slate-50/50 border-slate-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-bold uppercase text-slate-900">
                              {act.actionType.replace(/_/g, ' ')} — {act.targetDeviceName}
                            </span>
                            <span className="text-xs text-slate-500 ml-2">({act.clientName})</span>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                              act.status === 'blocked_protected_asset'
                                ? 'bg-rose-100 text-rose-800'
                                : act.status === 'pending_approval'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {act.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{act.reason}</p>
                        {act.error && (
                          <div className="mt-2 p-2.5 rounded-lg bg-rose-100/70 text-xs font-medium text-rose-800">
                            {act.error}
                          </div>
                        )}
                        {act.status === 'pending_approval' && (
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              onClick={() => handleApproveAction(act.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" /> Approve &amp; Execute
                            </button>
                            <button
                              onClick={() => handleRejectAction(act.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUB-SECTION B: SOAR Playbooks & IOC Lookup (soc-soar) */}
              {currentSubTab === 'soc-soar' && soarOverview && (
                <div className="space-y-6">
                  {/* Playbooks + Live Trace */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
                      <h3 className="text-sm font-bold text-slate-900">Automated SOAR Playbooks (Shuffle Go)</h3>
                      {soarOverview.playbooks.map(pb => {
                        const isRunning = runningPlaybookId === pb.id;
                        return (
                          <div key={pb.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-bold text-slate-900">{pb.name}</div>
                              <p className="text-[11px] text-slate-500 mt-0.5">{pb.description}</p>
                            </div>
                            <button
                              disabled={isRunning}
                              onClick={() => handleExecuteSoarPlaybook(pb.id)}
                              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                            >
                              {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                              Run
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-900 mb-3">Latest Playbook Execution</h3>
                      {activePlaybookTrace ? (
                        <div className="space-y-2.5">
                          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                            <div className="font-bold text-slate-900">{activePlaybookTrace.playbookName}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Duration: {activePlaybookTrace.totalDurationMs}ms · Status:{' '}
                              <strong className="uppercase">{activePlaybookTrace.status.replace(/_/g, ' ')}</strong>
                            </div>
                          </div>
                          {activePlaybookTrace.nodeTraces.map((step, idx) => (
                            <div key={step.id} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/40 text-xs">
                              <div className="flex items-center justify-between font-semibold text-slate-800">
                                <span>
                                  {idx + 1}. {step.name}
                                </span>
                                <span className="font-mono text-[11px] text-emerald-700">{step.latencyMs}ms</span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{step.outputSummary}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Select a playbook to run.</p>
                      )}
                    </div>
                  </div>

                  {/* Clean Cortex IOC Lookup */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-slate-900">Observable / IOC Lookup (Cortex)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                      <select
                        value={cortexDataType}
                        onChange={e => setCortexDataType(e.target.value as any)}
                        className="md:col-span-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                      >
                        <option value="ip">IP Address</option>
                        <option value="cmdline">Command Line</option>
                        <option value="mac">MAC Address</option>
                        <option value="hash">SHA256 / MD5 Hash</option>
                        <option value="domain">Domain</option>
                      </select>
                      <input
                        type="text"
                        value={cortexDataInput}
                        onChange={e => setCortexDataInput(e.target.value)}
                        placeholder="Enter IP, hash, MAC, or command..."
                        className="md:col-span-7 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono"
                      />
                      <button
                        disabled={runningCortex}
                        onClick={() => handleRunCortexAnalysis()}
                        className="md:col-span-2 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {runningCortex ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        Analyze
                      </button>
                    </div>

                    {cortexResult && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {cortexResult.taxonomies.map((badge, bIdx) => renderCortexBadge(badge, bIdx))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {cortexResult.analyzerReports.map(rep => (
                            <div key={rep.analyzerId} className="p-3 rounded-lg bg-white border border-slate-200 text-xs">
                              <div className="font-bold text-slate-900">{rep.analyzerName}</div>
                              <p className="text-[11px] text-slate-600 mt-1">{rep.summary}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB-SECTION C: Device Event Timeline (soc-timeline) */}
              {currentSubTab === 'soc-timeline' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Device Event Timeline</h3>
                      <p className="text-xs text-slate-500">Chronological endpoint process, AV, and network events</p>
                    </div>
                    <select
                      value={selectedTimelineDeviceId}
                      onChange={e => setSelectedTimelineDeviceId(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900"
                    >
                      {secDevices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.hostname} ({d.ipAddress} — {d.clientName})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    {(timelineData?.timeline || []).map(item => (
                      <div key={item.id} className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {renderSeverityBadge(item.severity)}
                            <span className="text-xs font-bold text-slate-900">{item.title}</span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-500">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{item.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecuritySocView;
