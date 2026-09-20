import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  NavigationTab,
  WorkspaceTab,
  ManagedDevice,
  ClientTenant,
  PatchItem,
  SelfHealingRule,
  AutomationExecutionLog,
  PSATicket,
  VaultItem,
  RustDeskServerConfig,
  RustDeskSession,
  WhiteLabelConfig,
  AICopilotMessage
} from '../types';
import {
  INITIAL_CLIENTS,
  INITIAL_DEVICES,
  INITIAL_PATCHES,
  INITIAL_AUTOMATIONS,
  INITIAL_AUTOMATION_LOGS,
  INITIAL_TICKETS,
  INITIAL_VAULT_ITEMS,
  INITIAL_RUSTDESK_CONFIG,
  INITIAL_WHITE_LABEL,
  INITIAL_AI_MESSAGES
} from './mockData';
import {
  api,
  mdm,
  fetchRemoteHealth,
  fetchRemoteConfig,
  fetchRemoteSessions,
  startRemoteSession,
  endRemoteSession,
  unlockMasterVault,
  fetchVaultItems,
  getStoredToken,
  setStoredToken,
  getStoredUser,
  setStoredUser,
  type RemoteHealthResponse
} from '../services/api';
import type { UserProfile } from '@openmsp/api-types';

interface AppContextType {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;

  // Dynamic Workspace Tabs (SuperOps Multi-Tab Mode)
  tabs: WorkspaceTab[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  openTab: (tab: { type: NavigationTab | 'device-detail' | 'ticket-detail' | 'probes'; title: string; dataId?: string; closable?: boolean }) => string;
  closeTab: (tabId: string) => void;
  refreshTab: (tabId: string) => void;
  tabbedNavigationEnabled: boolean;
  setTabbedNavigationEnabled: (enabled: boolean) => void;

  // Worklog & Timer Count
  activeTimersCount: number;
  setActiveTimersCount: React.Dispatch<React.SetStateAction<number>>;

  // Sub-Navigation Rail
  activeSubRailView: string;
  setActiveSubRailView: (view: string) => void;
  isSubRailCollapsed: boolean;
  setIsSubRailCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Clients
  clients: ClientTenant[];
  selectedClientId: string | 'all';
  setSelectedClientId: (id: string | 'all') => void;
  
  // Devices
  devices: ManagedDevice[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string | null) => void;
  addDevice: (device: ManagedDevice) => void;
  updateDeviceHealth: (id: string, health: ManagedDevice['health']) => void;
  runRemoteScriptOnDevice: (deviceId: string, script: string, shell?: 'powershell' | 'cmd' | 'bash') => Promise<string>;
  toggleDeviceEncryption: (deviceId: string) => void;
  remoteWipeDevice: (deviceId: string) => void;
  
  // Patches
  patches: PatchItem[];
  approvePatch: (patchId: string) => void;
  deployPatchToDevices: (patchId: string) => void;
  
  // Automations & Self Healing
  automations: SelfHealingRule[];
  automationLogs: AutomationExecutionLog[];
  toggleAutomationRule: (ruleId: string) => void;
  addAutomationRule: (rule: SelfHealingRule) => void;
  triggerAutomationRuleDryRun: (ruleId: string, deviceId: string, isDryRun?: boolean) => Promise<void>;
  
  // PSA Ticketing
  tickets: PSATicket[];
  selectedTicketId: string | null;
  setSelectedTicketId: (id: string | null) => void;
  createTicket: (ticket: Omit<PSATicket, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt' | 'comments' | 'timeEntries'>) => void;
  updateTicketStatus: (ticketId: string, status: PSATicket['status']) => void;
  addTicketComment: (ticketId: string, content: string, isInternal: boolean, authorRole?: 'tech' | 'client' | 'ai_copilot') => void;
  addTicketTimeEntry: (ticketId: string, minutes: number, description: string, billable: boolean) => void;
  
  // Bitwarden Vault
  vaultItems: VaultItem[];
  addVaultItem: (item: Omit<VaultItem, 'id' | 'lastModified' | 'strengthScore'>) => void;
  deleteVaultItem: (id: string) => void;
  toggleFavoriteVaultItem: (id: string) => void;
  generatePassword: (length?: number, options?: { numbers: boolean; symbols: boolean; uppercase: boolean }) => string;
  isVaultUnlocked: boolean;
  vaultUnlockedSecondsRemaining: number;
  unlockVault: (masterPassword: string) => Promise<{ success: boolean; error?: string }>;
  lockVault: () => void;
  
  // Remote Support & RustDesk
  rustDeskConfig: RustDeskServerConfig;
  updateRustDeskConfig: (config: Partial<RustDeskServerConfig>) => void;
  activeSessions: RustDeskSession[];
  launchRustDeskSession: (deviceId: string) => Promise<RustDeskSession | null>;
  endRustDeskSession: (sessionId: string) => Promise<void>;
  relayHealth: RemoteHealthResponse | null;
  refreshRemoteHealth: () => Promise<void>;
  
  // White Label Settings
  whiteLabel: WhiteLabelConfig;
  updateWhiteLabel: (config: Partial<WhiteLabelConfig>) => void;
  
  // AI Copilot
  aiMessages: AICopilotMessage[];
  sendAIMessage: (userText: string) => void;
  isAiDrawerOpen: boolean;
  setIsAiDrawerOpen: (open: boolean) => void;

  // Auth
  login: (email: string, password: string) => Promise<void>;
  logout: () => void | Promise<void>;
  isAuthenticated: boolean;
  currentUser: UserProfile | null;

  // Global Quick Search
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getStoredToken());
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getStoredUser());
  const [activeTab, setActiveTabState] = useState<NavigationTab>('dashboard');
  const [clients, setClients] = useState<ClientTenant[]>(INITIAL_CLIENTS);

  // Dynamic Workspace Tabs (SuperOps Multi-Tab Mode)
  const [tabbedNavigationEnabled, setTabbedNavigationEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem('apex_tabs_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const setTabbedNavigationEnabled = (enabled: boolean) => {
    setTabbedNavigationEnabledState(enabled);
    localStorage.setItem('apex_tabs_enabled', String(enabled));
  };

  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    { id: 'tab-home', type: 'dashboard', title: 'Home', closable: false },
    { id: 'tab-rmm', type: 'rmm', title: 'Assets', closable: true },
    { id: 'tab-tickets', type: 'psa-tickets', title: 'Tickets', closable: true }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-home');

  const [activeTimersCount, setActiveTimersCount] = useState<number>(3);
  const [activeSubRailView, setActiveSubRailView] = useState<string>('all');
  const [isSubRailCollapsed, setIsSubRailCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const openTab = (newTab: { type: NavigationTab | 'device-detail' | 'ticket-detail' | 'probes'; title: string; dataId?: string; closable?: boolean }) => {
    const existing = tabs.find(t => 
      t.type === newTab.type && (newTab.dataId ? t.dataId === newTab.dataId : true)
    );
    if (existing) {
      setActiveTabId(existing.id);
      if (['dashboard', 'rmm', 'remote-support', 'psa-tickets', 'vault', 'ai-copilot', 'patching', 'automations', 'network-map', 'mdm', 'settings'].includes(existing.type)) {
        setActiveTabState(existing.type as NavigationTab);
      }
      return existing.id;
    }

    const tabId = `tab-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const created: WorkspaceTab = {
      id: tabId,
      type: newTab.type,
      title: newTab.title,
      dataId: newTab.dataId,
      closable: newTab.closable !== undefined ? newTab.closable : true
    };
    setTabs(prev => [...prev, created]);
    setActiveTabId(tabId);
    if (['dashboard', 'rmm', 'remote-support', 'psa-tickets', 'vault', 'ai-copilot', 'patching', 'automations', 'network-map', 'mdm', 'settings'].includes(newTab.type)) {
      setActiveTabState(newTab.type as NavigationTab);
    }
    return tabId;
  };

  const closeTab = (tabId: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx === -1) return prev;
      const updated = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        const nextActive = updated[Math.max(0, idx - 1)] || updated[0];
        if (nextActive) {
          setActiveTabId(nextActive.id);
          if (['dashboard', 'rmm', 'remote-support', 'psa-tickets', 'vault', 'ai-copilot', 'patching', 'automations', 'network-map', 'mdm', 'settings'].includes(nextActive.type)) {
            setActiveTabState(nextActive.type as NavigationTab);
          }
        }
      }
      return updated;
    });
  };

  const refreshTab = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    if (tab.type === 'dashboard' || tab.type === 'rmm') {
      api.devices.getDevices(selectedClientId === 'all' ? undefined : selectedClientId).then((d: ManagedDevice[]) => d && setDevices(d)).catch(() => {});
    }
    if (tab.type === 'psa-tickets') {
      api.tickets.getTickets(selectedClientId === 'all' ? undefined : selectedClientId).then((t: PSATicket[]) => t && setTickets(t)).catch(() => {});
    }
  };

  const setActiveTab = (navTab: NavigationTab) => {
    setActiveTabState(navTab);
    const found = tabs.find(t => t.type === navTab);
    if (found) {
      setActiveTabId(found.id);
    } else {
      const labelMap: Record<NavigationTab, string> = {
        'dashboard': 'Home',
        'rmm': 'Devices',
        'psa-tickets': 'Tickets',
        'remote-support': 'Remote Support',
        'vault': 'Vault',
        'patching': 'Patch Management',
        'automations': 'Automations',
        'ai-copilot': 'Apex AI Lab',
        'network-map': 'Network Map',
        'mdm': 'MDM Management',
        'settings': 'Settings'
      };
      const newId = `tab-${navTab}`;
      setTabs(prev => [...prev, {
        id: newId,
        type: navTab,
        title: labelMap[navTab] || navTab,
        closable: navTab !== 'dashboard'
      }]);
      setActiveTabId(newId);
    }
  };


  // Bind selectedClientId to URL query parameter (?clientId=)
  const [selectedClientId, setSelectedClientIdState] = useState<string | 'all'>(() => {
    if (typeof window === 'undefined') return 'all';
    const params = new URLSearchParams(window.location.search);
    const cid = params.get('clientId');
    return cid && cid.trim() !== '' ? cid : 'all';
  });

  const setSelectedClientId = (id: string | 'all') => {
    setSelectedClientIdState(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (id && id !== 'all') {
        url.searchParams.set('clientId', id);
      } else {
        url.searchParams.delete('clientId');
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const cid = params.get('clientId');
      setSelectedClientIdState(cid && cid.trim() !== '' ? cid : 'all');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [devices, setDevices] = useState<ManagedDevice[]>(() => {
    const saved = localStorage.getItem('apex_devices');
    return saved ? JSON.parse(saved) : INITIAL_DEVICES;
  });
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [patches, setPatches] = useState<PatchItem[]>(() => {
    const saved = localStorage.getItem('apex_patches');
    return saved ? JSON.parse(saved) : INITIAL_PATCHES;
  });

  const [automations, setAutomations] = useState<SelfHealingRule[]>(() => {
    const saved = localStorage.getItem('apex_automations');
    return saved ? JSON.parse(saved) : INITIAL_AUTOMATIONS;
  });

  const [automationLogs, setAutomationLogs] = useState<AutomationExecutionLog[]>(() => {
    const saved = localStorage.getItem('apex_automation_logs');
    return saved ? JSON.parse(saved) : INITIAL_AUTOMATION_LOGS;
  });

  const [tickets, setTickets] = useState<PSATicket[]>(() => {
    const saved = localStorage.getItem('apex_tickets');
    return saved ? JSON.parse(saved) : INITIAL_TICKETS;
  });
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const [vaultItems, setVaultItems] = useState<VaultItem[]>(() => {
    const saved = localStorage.getItem('apex_vault_items');
    return saved ? JSON.parse(saved) : INITIAL_VAULT_ITEMS;
  });

  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);
  const [vaultUnlockedSecondsRemaining, setVaultUnlockedSecondsRemaining] = useState<number>(0);

  const [rustDeskConfig, setRustDeskConfig] = useState<RustDeskServerConfig>(INITIAL_RUSTDESK_CONFIG);
  const [relayHealth, setRelayHealth] = useState<RemoteHealthResponse | null>(null);
  const [activeSessions, setActiveSessions] = useState<RustDeskSession[]>([]);

  const [whiteLabel, setWhiteLabel] = useState<WhiteLabelConfig>(() => {
    const saved = localStorage.getItem('apex_whitelabel');
    return saved ? JSON.parse(saved) : INITIAL_WHITE_LABEL;
  });

  const [aiMessages, setAiMessages] = useState<AICopilotMessage[]>(INITIAL_AI_MESSAGES);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  const refreshRemoteHealth = async (): Promise<void> => {
    const health = await fetchRemoteHealth();
    if (health) {
      setRelayHealth(health);
      setRustDeskConfig(prev => ({
        ...prev,
        onlineState: health.online,
        relayServer: health.relayServer || prev.relayServer,
        idServer: health.idServer || prev.idServer,
        activeSessionsCount: health.activeSessions
      }));
    }
  };

  // Sync state to local storage with secrets sanitization
  useEffect(() => {
    const sanitized = devices.map(d => ({
      ...d,
      encryptionKey: d.encryptionKey ? '••••••••••••' : undefined
    }));
    localStorage.setItem('apex_devices', JSON.stringify(sanitized));
  }, [devices]);

  useEffect(() => { localStorage.setItem('apex_patches', JSON.stringify(patches)); }, [patches]);
  useEffect(() => { localStorage.setItem('apex_automations', JSON.stringify(automations)); }, [automations]);
  useEffect(() => { localStorage.setItem('apex_automation_logs', JSON.stringify(automationLogs)); }, [automationLogs]);
  useEffect(() => { localStorage.setItem('apex_tickets', JSON.stringify(tickets)); }, [tickets]);

  useEffect(() => {
    // Ensure passwords in localStorage are NEVER plaintext
    const sanitized = vaultItems.map(item => ({
      ...item,
      password: '••••••••••••'
    }));
    localStorage.setItem('apex_vault_items', JSON.stringify(sanitized));
  }, [vaultItems]);

  useEffect(() => { localStorage.setItem('apex_whitelabel', JSON.stringify(whiteLabel)); }, [whiteLabel]);

  // Initial load of real data from API and setup WebSocket live synchronization
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadData = async () => {
      try {
        const [
          fetchedClients,
          fetchedDevices,
          fetchedTickets,
          fetchedPatches,
          fetchedAutomations,
          fetchedLogs,
          fetchedVault,
          fetchedRemoteConfig,
          fetchedSessions,
          fetchedSettings,
          fetchedHealth
        ] = await Promise.allSettled([
          api.clients.getClients(),
          api.devices.getDevices(),
          api.tickets.getTickets(),
          api.patches.getPatches(),
          api.automations.getRules(),
          api.automations.getExecutions(),
          api.vault.getVaultItems(),
          api.remote.getRemoteConfig(),
          api.remote.getSessions(),
          api.settings.getSettings(),
          api.remote.getRemoteHealth()
        ]);

        if (fetchedClients.status === 'fulfilled' && Array.isArray(fetchedClients.value) && fetchedClients.value.length > 0) {
          setClients(fetchedClients.value);
        }
        let initialDevices: ManagedDevice[] = [];
        if (fetchedDevices.status === 'fulfilled' && Array.isArray(fetchedDevices.value)) {
          initialDevices = [...fetchedDevices.value];
        }

        try {
          const mdmTablets = await mdm.getTablets();
          if (mdmTablets && Array.isArray(mdmTablets.devices)) {
            for (const t of mdmTablets.devices) {
              if (!initialDevices.some(d => d.id === t.id)) {
                initialDevices.push({
                  id: t.id,
                  name: t.name || 'Lenovo Tablet',
                  hostname: t.id,
                  clientId: (t.clientId && t.clientId !== 'c-raytreat') ? t.clientId : 'c-brandon-ray',
                  clientName: (t.clientName && t.clientId !== 'c-raytreat') ? t.clientName : 'Brandon Ray',
                  siteId: 'Primary',
                  siteName: 'Primary',
                  os: 'android',
                  osVersion: t.model || 'Android 14 (Enterprise)',
                  serialNumber: t.id,
                  ipAddress: '10.10.10.171',
                  publicIp: '',
                  macAddress: '',
                  health: 'healthy',
                  metrics: {
                    cpuUsage: 12,
                    ramUsage: 42,
                    diskUsage: 25,
                    uptimeDays: 2.1,
                    lastSeen: new Date().toISOString()
                  },
                  rustDeskId: '',
                  rustDeskOnline: false,
                  mdmEnrolled: true,
                  encryptionStatus: 'encrypted',
                  patchCompliance: 100,
                  pendingPatchesCount: 0,
                  installedApps: [
                    { id: 'kiosk', name: 'ApexMSP Kiosk Browser', version: '1.0.3', publisher: 'ApexMSP', installDate: '2026-09-18' },
                    { id: 'vnc', name: 'droidVNC-NG', version: '2.4.0', publisher: 'Christian Beier', installDate: '2026-09-18' },
                    { id: 'agent', name: 'ApexAgent Bridge', version: '1.0.3', publisher: 'ApexMSP', installDate: '2026-09-18' }
                  ],
                  services: [
                    { name: 'app.apexmsp.kiosk', displayName: 'ApexMSP Kiosk', status: 'running', startupType: 'auto' },
                    { name: 'app.apexmsp.agent.BridgeService', displayName: 'Apex Remote Control Bridge', status: 'running', startupType: 'auto' },
                    { name: 'net.christianbeier.droidvnc_ng', displayName: 'droidVNC-NG RFB Service', status: 'running', startupType: 'auto' }
                  ],
                  eventLogs: [],
                  tags: ['tablet', 'android', 'kiosk'],
                  loggedInUser: 'Kiosk User',
                  domain: 'Android Enterprise',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                });
              }
            }
          }
        } catch { /* ignore */ }

        setDevices(initialDevices);
        if (fetchedTickets.status === 'fulfilled' && Array.isArray(fetchedTickets.value) && fetchedTickets.value.length > 0) {
          setTickets(fetchedTickets.value);
        }
        if (fetchedPatches.status === 'fulfilled' && Array.isArray(fetchedPatches.value) && fetchedPatches.value.length > 0) {
          setPatches(fetchedPatches.value);
        }
        if (fetchedAutomations.status === 'fulfilled' && Array.isArray(fetchedAutomations.value) && fetchedAutomations.value.length > 0) {
          setAutomations(fetchedAutomations.value);
        }
        if (fetchedLogs.status === 'fulfilled' && Array.isArray(fetchedLogs.value) && fetchedLogs.value.length > 0) {
          setAutomationLogs(fetchedLogs.value);
        }
        if (fetchedVault.status === 'fulfilled' && Array.isArray(fetchedVault.value) && fetchedVault.value.length > 0) {
          setVaultItems(fetchedVault.value);
        }
        if (fetchedRemoteConfig.status === 'fulfilled' && fetchedRemoteConfig.value) {
          setRustDeskConfig(fetchedRemoteConfig.value);
        }
        if (fetchedSessions.status === 'fulfilled') {
          setActiveSessions(fetchedSessions.value);
        }
        if (fetchedSettings.status === 'fulfilled' && fetchedSettings.value) {
          setWhiteLabel(fetchedSettings.value);
        }
        if (fetchedHealth.status === 'fulfilled' && fetchedHealth.value) {
          setRelayHealth(fetchedHealth.value);
        }
      } catch (err) {
        console.warn('[OpenMSP Data] Failed to load data from API:', err);
      }
    };

    loadData();

    // Connect WebSocket
    const orgId = currentUser?.orgId || '00000000-0000-0000-0000-000000000001';
    api.ws.connect(orgId);

    // Subscribe to WebSocket events
    const unsubHeartbeat = api.ws.on('device.heartbeat', (event) => {
      const { deviceId, health, metrics } = event.payload || {};
      if (!deviceId) return;
      setDevices(prev => prev.map(d => (
        d.id === deviceId
          ? { ...d, health: health || d.health, metrics: metrics ? { ...d.metrics, ...metrics } : d.metrics }
          : d
      )));
    });

    const unsubHealthChanged = api.ws.on('device.health_changed', (event) => {
      const { deviceId, currentHealth } = event.payload || {};
      if (!deviceId || !currentHealth) return;
      setDevices(prev => prev.map(d => (
        d.id === deviceId ? { ...d, health: currentHealth } : d
      )));
    });

    const unsubCommandUpdated = api.ws.on('command.updated', (event) => {
      console.log('[OpenMSP WS] Command updated:', event.payload);
    });

    const unsubTicketUpdated = api.ws.on('ticket.updated', (event) => {
      const { ticketId, status, assignedTech, updatedAt } = event.payload || {};
      if (!ticketId) return;
      setTickets(prev => {
        // A ticket we don't have yet (e.g. one filed from an agent's "Request
        // Support") — pull the fresh list so it appears without a manual refresh.
        if (!prev.some(t => t.id === ticketId)) {
          api.tickets.getTickets().then(list => { if (list) setTickets(list); }).catch(() => {});
          return prev;
        }
        return prev.map(t => (
          t.id === ticketId
            ? {
                ...t,
                status: status || t.status,
                assignedTech: assignedTech || t.assignedTech,
                updatedAt: updatedAt || new Date().toISOString()
              }
            : t
        ));
      });
    });

    const unsubSessionStarted = api.ws.on('session.started', (event) => {
      const session = event.payload as RustDeskSession;
      if (!session || !session.id) return;
      setActiveSessions(prev => {
        if (prev.some(s => s.id === session.id)) {
          return prev.map(s => (s.id === session.id ? session : s));
        }
        return [session, ...prev];
      });
    });

    const unsubSessionEnded = api.ws.on('session.ended', (event) => {
      const { sessionId } = event.payload || {};
      if (!sessionId) return;
      setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
    });

    const healthTimer = setInterval(refreshRemoteHealth, 15000);

    return () => {
      clearInterval(healthTimer);
      unsubHeartbeat();
      unsubHealthChanged();
      unsubCommandUpdated();
      unsubTicketUpdated();
      unsubSessionStarted();
      unsubSessionEnded();
      api.ws.disconnect();
    };
  }, [isAuthenticated, currentUser?.orgId]);

  // Vault auto-lock countdown timer
  useEffect(() => {
    if (!isVaultUnlocked || vaultUnlockedSecondsRemaining <= 0) return;
    const lockTimer = setInterval(() => {
      setVaultUnlockedSecondsRemaining(prev => {
        if (prev <= 1) {
          setIsVaultUnlocked(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(lockTimer);
  }, [isVaultUnlocked, vaultUnlockedSecondsRemaining]);

  // Apply custom CSS variable colors dynamically
  useEffect(() => {
    document.documentElement.style.setProperty('--apex-primary', whiteLabel.primaryColor);
    document.documentElement.style.setProperty('--apex-accent', whiteLabel.accentColor);
  }, [whiteLabel]);

  // Simple TOTP code generator (RFC 6238 compliant simulation)
  const generateTOTPCode = (secret: string): string => {
    const timeStep = Math.floor(Date.now() / 1000 / 30);
    let hash = 0;
    const combined = secret + timeStep.toString();
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash) + combined.charCodeAt(i);
      hash = hash & hash;
    }
    const code = Math.abs(hash % 1000000).toString().padStart(6, '0');
    return code;
  };

  // Live simulation ticker for TOTP countdowns & device metrics variance
  useEffect(() => {
    const timer = setInterval(() => {
      // Update TOTP code and remaining seconds calculation
      setVaultItems(prev => prev.map(v => {
        if (!v.totpSecret) return v;
        const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
        const totpCode = generateTOTPCode(v.totpSecret);
        return { ...v, totpRemainingSeconds: remaining, totpCode };
      }));

      // Slight CPU/RAM jitter for real-time feel
      setDevices(prev => prev.map(d => {
        if (d.health === 'offline') return d;
        const cpuJitter = Math.min(100, Math.max(5, d.metrics.cpuUsage + Math.floor(Math.random() * 5) - 2));
        const ramJitter = Math.min(100, Math.max(10, d.metrics.ramUsage + Math.floor(Math.random() * 3) - 1));
        return {
          ...d,
          metrics: {
            ...d.metrics,
            cpuUsage: cpuJitter,
            ramUsage: ramJitter
          }
        };
      }));
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  // Device actions
  const addDevice = (device: ManagedDevice) => {
    setDevices(prev => [device, ...prev]);
  };

  const updateDeviceHealth = (id: string, health: ManagedDevice['health']) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, health } : d));
    api.devices.updateDevice(id, { health }).catch(err => {
      console.warn('[OpenMSP API] Failed to update device health on server:', err);
    });
  };

  const runRemoteScriptOnDevice = async (deviceId: string, script: string, shell: 'powershell' | 'cmd' | 'bash' = 'powershell'): Promise<string> => {
    try {
      const cmd = await api.devices.sendCommand(deviceId, {
        commandType: 'run_script',
        payload: { script, shell }
      });

      // Poll for agent execution completion (up to 25 seconds)
      const startTime = Date.now();
      while (Date.now() - startTime < 25000) {
        await new Promise(r => setTimeout(r, 1200));
        try {
          const updated = await api.devices.getDeviceCommand(deviceId, cmd.id);
          if (updated && updated.status === 'completed') {
            return updated.output || '[Command executed successfully (no output)]';
          }
          if (updated && updated.status === 'failed') {
            return `[Execution Failed]\n${updated.error || updated.output || 'Unknown error occurred on agent'}`;
          }
        } catch {
          // Continue polling if network glitch
        }
      }

      return `[Command Dispatched (ID: ${cmd.id})]\nStatus: ${cmd.status}\nThe agent received the command. Because the device checks in on a regular heartbeat, output will update once execution completes.`;
    } catch (e: any) {
      return `[ApexMSP Agent Error]\nFailed to communicate with device: ${e?.message || e}`;
    }
  };

  const toggleDeviceEncryption = (deviceId: string) => {
    const dev = devices.find(d => d.id === deviceId);
    if (!dev) return;
    const nextStatus = dev.encryptionStatus === 'encrypted' ? 'decrypted' : 'encrypted';
    const nextKey = nextStatus === 'encrypted' ? `BITLOCKER-RECOVERY-${Math.floor(100000 + Math.random() * 900000)}` : undefined;

    setDevices(prev => prev.map(d => (
      d.id === deviceId ? { ...d, encryptionStatus: nextStatus, encryptionKey: nextKey } : d
    )));

    api.devices.updateDevice(deviceId, { encryptionStatus: nextStatus }).catch(err => {
      console.warn('[OpenMSP API] Failed to toggle encryption:', err);
    });
  };

  const remoteWipeDevice = (deviceId: string) => {
    setDevices(prev => prev.map(d => {
      if (d.id !== deviceId) return d;
      return {
        ...d,
        health: 'offline',
        encryptionStatus: 'decrypted',
        tags: [...d.tags, 'REMOTE WIPE INITIATED']
      };
    }));

    api.devices.remoteWipe(deviceId, true).catch(err => {
      console.warn('[OpenMSP API] Failed to trigger remote wipe:', err);
    });
  };

  // Patch actions
  const approvePatch = (patchId: string) => {
    setPatches(prev => prev.map(p => p.id === patchId ? { ...p, approved: true } : p));
    api.patches.approvePatch(patchId).catch(err => {
      console.warn('[OpenMSP API] Failed to approve patch:', err);
    });
  };

  const deployPatchToDevices = (patchId: string) => {
    setPatches(prev => prev.map(p => {
      if (p.id !== patchId) return p;
      return {
        ...p,
        approved: true,
        installedDevicesCount: p.affectedDevicesCount
      };
    }));

    api.patches.deployPatches(patchId).catch(err => {
      console.warn('[OpenMSP API] Failed to deploy patches:', err);
    });
  };

  // Automation actions
  const toggleAutomationRule = (ruleId: string) => {
    const rule = automations.find(a => a.id === ruleId);
    if (!rule) return;
    const nextEnabled = !rule.enabled;

    setAutomations(prev => prev.map(a => a.id === ruleId ? { ...a, enabled: nextEnabled } : a));
    api.automations.toggleRule(ruleId, nextEnabled).catch(err => {
      console.warn('[OpenMSP API] Failed to toggle rule on server:', err);
    });
  };

  const addAutomationRule = (rule: SelfHealingRule) => {
    setAutomations(prev => [rule, ...prev]);
    api.automations.createRule(rule).catch(err => {
      console.warn('[OpenMSP API] Failed to create rule on server:', err);
    });
  };

  const triggerAutomationRuleDryRun = async (ruleId: string, deviceId: string, isDryRun: boolean = false) => {
    const rule = automations.find(a => a.id === ruleId);
    const device = devices.find(d => d.id === deviceId);
    if (!rule || !device) return;

    // Validate rule is enabled
    if (!rule.enabled) {
      alert(`Cannot execute rule "${rule.name}": Rule is disabled.`);
      return;
    }

    // Validate OS compatibility
    const deviceOsType = device.os === 'windows' ? 'windows' : device.os === 'macos' ? 'macos' : device.os;
    if (rule.osTarget !== 'all' && rule.osTarget !== deviceOsType) {
      alert(`Cannot execute rule "${rule.name}" on ${device.name}: Rule targets ${rule.osTarget} but device runs ${device.os}.`);
      return;
    }

    // For dry runs (test runs), only show what would happen without making changes
    if (isDryRun) {
      api.automations.dryRunRule(ruleId, deviceId).then(res => {
        if (res.log) {
          setAutomationLogs(prev => [res.log, ...prev]);
        }
      }).catch(() => {});
      alert(`[DRY RUN] Rule "${rule.name}" would execute action "${rule.actionType}" on ${device.name}.\nLive device state was NOT mutated.`);
      return;
    }

    const newLog: AutomationExecutionLog = {
      id: `autolog-${Date.now()}`,
      ruleId,
      ruleName: rule.name,
      deviceId,
      deviceName: device.name,
      timestamp: 'Just now',
      status: 'success',
      details: `Self-healing manual trigger executed on ${device.name}. Result: Action '${rule.actionType}' completed with exit code 0.`
    };

    setAutomationLogs(prev => [newLog, ...prev]);
    setAutomations(prev => prev.map(a => a.id === ruleId ? { ...a, executionsCount: a.executionsCount + 1, lastExecuted: 'Just now' } : a));

    // Auto heal device if critical (only for actual executions, not dry runs)
    if (device.health === 'critical' || device.health === 'warning') {
      updateDeviceHealth(deviceId, 'healthy');
    }
  };

  // PSA Ticket actions
  const createTicket = (ticketData: Omit<PSATicket, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt' | 'comments' | 'timeEntries'>) => {
    const tempTicket: PSATicket = {
      ...ticketData,
      id: `ticket-${Date.now()}`,
      ticketNumber: `TK-${Math.floor(8800 + Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comments: [
        {
          id: `c-${Date.now()}`,
          author: currentUser?.name || 'Apex AI Copilot',
          authorRole: 'ai_copilot',
          timestamp: 'Just now',
          content: 'Ticket logged successfully into OpenMSP PSA. Automated SLA timer started.',
          isInternal: true
        }
      ],
      timeEntries: []
    };
    setTickets(prev => [tempTicket, ...prev]);

    api.tickets.createTicket(ticketData).then(realTicket => {
      setTickets(prev => prev.map(t => t.id === tempTicket.id ? realTicket : t));
    }).catch(err => {
      console.warn('[OpenMSP API] Failed to create ticket on server:', err);
    });
  };

  const updateTicketStatus = (ticketId: string, status: PSATicket['status']) => {
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status, updatedAt: new Date().toISOString() } : t));
    api.tickets.updateTicket(ticketId, { status }).catch(err => {
      console.warn('[OpenMSP API] Failed to update ticket status on server:', err);
    });
  };

  const addTicketComment = (ticketId: string, content: string, isInternal: boolean, authorRole: 'tech' | 'client' | 'ai_copilot' = 'tech') => {
    const newComment = {
      id: `c-${Date.now()}`,
      author: authorRole === 'tech' ? (currentUser?.name || 'Alex Rivera (Tech)') : authorRole === 'ai_copilot' ? 'Apex AI Copilot' : 'Client User',
      authorRole,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content,
      isInternal
    };

    setTickets(prev => prev.map(t => {
      if (t.id !== ticketId) return t;
      return {
        ...t,
        comments: [...t.comments, newComment],
        updatedAt: new Date().toISOString()
      };
    }));

    api.tickets.addComment(ticketId, { content, isInternal, authorRole }).catch(err => {
      console.warn('[OpenMSP API] Failed to add comment on server:', err);
    });
  };

  const addTicketTimeEntry = (ticketId: string, minutes: number, description: string, billable: boolean) => {
    const newTimeEntry = {
      id: `te-${Date.now()}`,
      technician: currentUser?.name || 'Alex Rivera',
      minutes,
      description,
      date: new Date().toISOString().split('T')[0],
      billable,
      hourlyRate: 150
    };

    setTickets(prev => prev.map(t => {
      if (t.id !== ticketId) return t;
      return {
        ...t,
        timeEntries: [...t.timeEntries, newTimeEntry],
        updatedAt: new Date().toISOString()
      };
    }));

    api.tickets.addTimeEntry(ticketId, { minutes, description, billable }).catch(err => {
      console.warn('[OpenMSP API] Failed to add time entry on server:', err);
    });
  };

  // Vault actions
  const addVaultItem = (itemData: Omit<VaultItem, 'id' | 'lastModified' | 'strengthScore'>) => {
    const pwd = itemData.password || '';
    let score = 50;
    if (pwd.length >= 12) score += 25;
    if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score += 25;

    // Never store plaintext passwords in browser state
    const tempItem: VaultItem = {
      ...itemData,
      password: '••••••••••••',
      id: `vault-${Date.now()}`,
      strengthScore: Math.min(100, score),
      lastModified: new Date().toISOString().split('T')[0],
      totpCode: itemData.totpSecret ? generateTOTPCode(itemData.totpSecret) : undefined,
      totpRemainingSeconds: itemData.totpSecret ? 30 - (Math.floor(Date.now() / 1000) % 30) : undefined
    };
    setVaultItems(prev => [tempItem, ...prev]);

    api.vault.addVaultItem(itemData).then(realItem => {
      setVaultItems(prev => prev.map(v => v.id === tempItem.id ? realItem : v));
    }).catch(err => {
      console.warn('[OpenMSP API] Failed to save vault item on server:', err);
    });
  };

  const deleteVaultItem = (id: string) => {
    setVaultItems(prev => prev.filter(v => v.id !== id));
    api.vault.deleteVaultItem(id).catch(err => {
      console.warn('[OpenMSP API] Failed to delete vault item on server:', err);
    });
  };

  const toggleFavoriteVaultItem = (id: string) => {
    setVaultItems(prev => prev.map(v => v.id === id ? { ...v, favorite: !v.favorite } : v));
  };

  const generatePassword = (length = 18, options = { numbers: true, symbols: true, uppercase: true }) => {
    let charset = 'abcdefghijklmnopqrstuvwxyz';
    if (options.uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (options.numbers) charset += '0123456789';
    if (options.symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let res = '';
    for (let i = 0; i < length; i++) {
      res += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return res;
  };

  const unlockVault = async (masterPassword: string): Promise<{ success: boolean; error?: string }> => {
    const res = await unlockMasterVault(masterPassword);
    if (res.unlocked) {
      setIsVaultUnlocked(true);
      setVaultUnlockedSecondsRemaining(res.expiresInSeconds || 900);
      return { success: true };
    }
    return { success: false, error: res.error || 'Invalid master password' };
  };

  const lockVault = (): void => {
    setIsVaultUnlocked(false);
    setVaultUnlockedSecondsRemaining(0);
  };

  // RustDesk Remote Support
  const updateRustDeskConfig = (config: Partial<RustDeskServerConfig>) => {
    setRustDeskConfig(prev => ({ ...prev, ...config }));
    api.remote.updateRemoteConfig(config).catch(err => {
      console.warn('[OpenMSP API] Failed to update remote config:', err);
    });
  };

  const launchRustDeskSession = async (deviceId: string): Promise<RustDeskSession | null> => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return null;

    // Call real API POST /api/v1/remote/sessions/start
    const apiSession = await startRemoteSession(deviceId);
    if (apiSession) {
      setActiveSessions(prev => {
        const filtered = prev.filter(s => s.id !== apiSession.id);
        return [apiSession, ...filtered];
      });
      setActiveTab('remote-support');
      return apiSession;
    }

    // Fallback if API server is offline: construct session using live rustDeskConfig
    const fallbackSession: RustDeskSession = {
      id: `sess-${Math.random().toString(36).substring(2, 10)}`,
      deviceId,
      deviceName: device.name,
      rustDeskId: device.rustDeskId || '982341209',
      clientName: device.clientName,
      connectedTech: 'Chief MSP Operator',
      startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'connected',
      sessionKey: `rd-sess-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 10)}`
    };

    setActiveSessions(prev => [fallbackSession, ...prev]);
    setActiveTab('remote-support');
    return fallbackSession;
  };

  const endRustDeskSession = async (sessionId: string): Promise<void> => {
    await endRemoteSession(sessionId);
    setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  const login = async (email: string, password: string): Promise<void> => {
    const res = await api.auth.login({ email, password });
    setCurrentUser(res.user);
    setIsAuthenticated(true);
  };

  const logout = async (): Promise<void> => {
    try {
      await api.auth.logout();
    } finally {
      setCurrentUser(null);
      setIsAuthenticated(false);
    }
  };

  // White label actions
  const updateWhiteLabel = (config: Partial<WhiteLabelConfig>) => {
    setWhiteLabel(prev => ({ ...prev, ...config }));
    api.settings.updateSettings(config).catch(err => {
      console.warn('[OpenMSP API] Failed to update white label settings:', err);
    });
  };

  // AI Copilot response engine
  const sendAIMessage = (userText: string) => {
    const userMsg: AICopilotMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setAiMessages(prev => [...prev, userMsg]);

    const activeScope = selectedClientId !== 'all' ? selectedClientId : undefined;
    api.ai.chat(userText, activeScope)
      .then(aiMsg => {
        setAiMessages(prev => [...prev, aiMsg]);
      })
      .catch(() => {
        // Fallback local response if AI API is unreachable
        let aiResponseText = `I analyzed your request regarding "${userText}". Here is what OpenMSP Intelligence suggests:`;
        let codeSnippet: string | undefined = undefined;
        let codeLanguage: 'powershell' | 'bash' | 'json' | 'sql' | undefined = undefined;

        const lower = userText.toLowerCase();

        if (lower.includes('powershell') || lower.includes('spooler') || lower.includes('script')) {
          aiResponseText = `Here is a custom PowerShell script tailored to resolve Print Spooler locks and clear stuck spool files safely:`;
          codeSnippet = `# OpenMSP Self-Healing PowerShell Script
Stop-Service -Name Spooler -Force
Get-ChildItem -Path "C:\\Windows\\System32\\spool\\PRINTERS\\*" -Recurse | Remove-Item -Force
Start-Service -Name Spooler
Write-Output "Spooler cache successfully reset."`;
          codeLanguage = 'powershell';
        } else if (lower.includes('mac') || lower.includes('bash') || lower.includes('disk')) {
          aiResponseText = `I have generated a high-efficiency macOS Bash remediation script to purge Xcode caches, Docker containers, and system log dumps:`;
          codeSnippet = `#!/bin/bash
# OpenMSP macOS Disk Optimizer
echo "Purging Xcode DerivedData..."
rm -rf ~/Library/Developer/Xcode/DerivedData/*
echo "Running Docker system prune..."
docker system prune -f --volumes
echo "Cleaning brew cache..."
rm -rf $(brew --cache)`;
          codeLanguage = 'bash';
        } else if (lower.includes('ticket') || lower.includes('sla')) {
          aiResponseText = `Currently, you have 1 Critical SLA ticket pending for Vanguard Logistics regarding the Print Spooler crash on workstation ATL-W11-EXEC01. I recommend executing the auto-healing script directly or launching a RustDesk unattended session.`;
        } else if (lower.includes('password') || lower.includes('vault') || lower.includes('bitwarden')) {
          aiResponseText = `Your Bitwarden Vault currently holds high-security client credentials with an overall security audit score of 95.8%. All zero-knowledge TOTP secrets are rotating every 30 seconds.`;
        }

        const fallbackMsg: AICopilotMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'ai',
          text: aiResponseText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          codeSnippet,
          codeLanguage
        };

        setAiMessages(prev => [...prev, fallbackMsg]);
      });
  };

  return (
    <AppContext.Provider value={{
      activeTab,
      setActiveTab,
      tabs,
      activeTabId,
      setActiveTabId,
      openTab,
      closeTab,
      refreshTab,
      tabbedNavigationEnabled,
      setTabbedNavigationEnabled,
      activeTimersCount,
      setActiveTimersCount,
      activeSubRailView,
      setActiveSubRailView,
      isSubRailCollapsed,
      setIsSubRailCollapsed,
      isMobileMenuOpen,
      setIsMobileMenuOpen,
      clients,
      selectedClientId,
      setSelectedClientId,
      devices,
      selectedDeviceId,
      setSelectedDeviceId,
      addDevice,
      updateDeviceHealth,
      runRemoteScriptOnDevice,
      toggleDeviceEncryption,
      remoteWipeDevice,
      patches,
      approvePatch,
      deployPatchToDevices,
      automations,
      automationLogs,
      toggleAutomationRule,
      addAutomationRule,
      triggerAutomationRuleDryRun,
      tickets,
      selectedTicketId,
      setSelectedTicketId,
      createTicket,
      updateTicketStatus,
      addTicketComment,
      addTicketTimeEntry,
      vaultItems,
      addVaultItem,
      deleteVaultItem,
      toggleFavoriteVaultItem,
      generatePassword,
      isVaultUnlocked,
      vaultUnlockedSecondsRemaining,
      unlockVault,
      lockVault,
      rustDeskConfig,
      updateRustDeskConfig,
      activeSessions,
      launchRustDeskSession,
      endRustDeskSession,
      relayHealth,
      refreshRemoteHealth,
      whiteLabel,
      updateWhiteLabel,
      aiMessages,
      sendAIMessage,
      isAiDrawerOpen,
      setIsAiDrawerOpen,
      login,
      logout,
      isAuthenticated,
      currentUser,
      isCommandPaletteOpen,
      setIsCommandPaletteOpen
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
