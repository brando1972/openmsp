import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  NavigationTab,
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

interface AppContextType {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  
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
  runRemoteScriptOnDevice: (deviceId: string, script: string) => Promise<string>;
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
  triggerAutomationRuleDryRun: (ruleId: string, deviceId: string) => Promise<void>;
  
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
  
  // Remote Support & RustDesk
  rustDeskConfig: RustDeskServerConfig;
  updateRustDeskConfig: (config: Partial<RustDeskServerConfig>) => void;
  activeSessions: RustDeskSession[];
  launchRustDeskSession: (deviceId: string) => void;
  endRustDeskSession: (sessionId: string) => void;
  
  // White Label Settings
  whiteLabel: WhiteLabelConfig;
  updateWhiteLabel: (config: Partial<WhiteLabelConfig>) => void;
  
  // AI Copilot
  aiMessages: AICopilotMessage[];
  sendAIMessage: (userText: string) => void;
  isAiDrawerOpen: boolean;
  setIsAiDrawerOpen: (open: boolean) => void;

  // Global Quick Search
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [clients] = useState<ClientTenant[]>(INITIAL_CLIENTS);
  const [selectedClientId, setSelectedClientId] = useState<string | 'all'>('all');

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

  const [rustDeskConfig, setRustDeskConfig] = useState<RustDeskServerConfig>(INITIAL_RUSTDESK_CONFIG);
  const [activeSessions, setActiveSessions] = useState<RustDeskSession[]>([
    {
      id: 'sess-1',
      deviceId: 'dev-101',
      deviceName: 'NYC-DC-SRV01',
      rustDeskId: '829104712',
      clientName: 'Apex Financial Technologies',
      connectedTech: 'Alex Rivera',
      startedAt: '10:00 AM',
      status: 'connected',
      sessionKey: 'RUSTDESK-SESS-9921'
    }
  ]);

  const [whiteLabel, setWhiteLabel] = useState<WhiteLabelConfig>(() => {
    const saved = localStorage.getItem('apex_whitelabel');
    return saved ? JSON.parse(saved) : INITIAL_WHITE_LABEL;
  });

  const [aiMessages, setAiMessages] = useState<AICopilotMessage[]>(INITIAL_AI_MESSAGES);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // Sync state to local storage
  useEffect(() => { localStorage.setItem('apex_devices', JSON.stringify(devices)); }, [devices]);
  useEffect(() => { localStorage.setItem('apex_patches', JSON.stringify(patches)); }, [patches]);
  useEffect(() => { localStorage.setItem('apex_automations', JSON.stringify(automations)); }, [automations]);
  useEffect(() => { localStorage.setItem('apex_automation_logs', JSON.stringify(automationLogs)); }, [automationLogs]);
  useEffect(() => { localStorage.setItem('apex_tickets', JSON.stringify(tickets)); }, [tickets]);
  useEffect(() => { localStorage.setItem('apex_vault_items', JSON.stringify(vaultItems)); }, [vaultItems]);
  useEffect(() => { localStorage.setItem('apex_whitelabel', JSON.stringify(whiteLabel)); }, [whiteLabel]);

  // Apply custom CSS variable colors dynamically
  useEffect(() => {
    document.documentElement.style.setProperty('--apex-primary', whiteLabel.primaryColor);
    document.documentElement.style.setProperty('--apex-accent', whiteLabel.accentColor);
  }, [whiteLabel]);

  // Live simulation ticker for TOTP countdowns & device metrics variance
  useEffect(() => {
    const timer = setInterval(() => {
      // Update TOTP seconds calculation
      setVaultItems(prev => prev.map(v => {
        if (!v.totpSecret) return v;
        const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
        return { ...v, totpRemainingSeconds: remaining };
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
  };

  const runRemoteScriptOnDevice = async (deviceId: string, script: string): Promise<string> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`[ApexMSP Remote PowerShell Agent - Executed Successfully on ${deviceId}]\nPS C:\\> Output: Task processed. Code 0.\nParameters: ${script.slice(0, 40)}...`);
      }, 800);
    });
  };

  const toggleDeviceEncryption = (deviceId: string) => {
    setDevices(prev => prev.map(d => {
      if (d.id !== deviceId) return d;
      const nextStatus = d.encryptionStatus === 'encrypted' ? 'decrypted' : 'encrypted';
      return {
        ...d,
        encryptionStatus: nextStatus,
        encryptionKey: nextStatus === 'encrypted' ? `BITLOCKER-RECOVERY-${Math.floor(100000 + Math.random() * 900000)}` : undefined
      };
    }));
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
  };

  // Patch actions
  const approvePatch = (patchId: string) => {
    setPatches(prev => prev.map(p => p.id === patchId ? { ...p, approved: !p.approved } : p));
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
  };

  // Automation actions
  const toggleAutomationRule = (ruleId: string) => {
    setAutomations(prev => prev.map(a => a.id === ruleId ? { ...a, enabled: !a.enabled } : a));
  };

  const addAutomationRule = (rule: SelfHealingRule) => {
    setAutomations(prev => [rule, ...prev]);
  };

  const triggerAutomationRuleDryRun = async (ruleId: string, deviceId: string) => {
    const rule = automations.find(a => a.id === ruleId);
    const device = devices.find(d => d.id === deviceId);
    if (!rule || !device) return;

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

    // Auto heal device if critical
    if (device.health === 'critical' || device.health === 'warning') {
      updateDeviceHealth(deviceId, 'healthy');
    }
  };

  // PSA Ticket actions
  const createTicket = (ticketData: Omit<PSATicket, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt' | 'comments' | 'timeEntries'>) => {
    const newTicket: PSATicket = {
      ...ticketData,
      id: `ticket-${Date.now()}`,
      ticketNumber: `TK-${Math.floor(8800 + Math.random() * 1000)}`,
      createdAt: new Date().toLocaleString(),
      updatedAt: new Date().toLocaleString(),
      comments: [
        {
          id: `c-${Date.now()}`,
          author: 'Apex AI Copilot',
          authorRole: 'ai_copilot',
          timestamp: 'Just now',
          content: 'Ticket logged successfully into ApexMSP PSA. Automated SLA timer started. AI telemetry analysis in progress.',
          isInternal: true
        }
      ],
      timeEntries: []
    };
    setTickets(prev => [newTicket, ...prev]);
  };

  const updateTicketStatus = (ticketId: string, status: PSATicket['status']) => {
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status, updatedAt: new Date().toLocaleString() } : t));
  };

  const addTicketComment = (ticketId: string, content: string, isInternal: boolean, authorRole: 'tech' | 'client' | 'ai_copilot' = 'tech') => {
    const newComment = {
      id: `c-${Date.now()}`,
      author: authorRole === 'tech' ? 'Alex Rivera (Tech)' : authorRole === 'ai_copilot' ? 'Apex AI Copilot' : 'Client User',
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
        updatedAt: new Date().toLocaleString()
      };
    }));
  };

  const addTicketTimeEntry = (ticketId: string, minutes: number, description: string, billable: boolean) => {
    const newTimeEntry = {
      id: `te-${Date.now()}`,
      technician: 'Alex Rivera',
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
        updatedAt: new Date().toLocaleString()
      };
    }));
  };

  // Vault actions
  const addVaultItem = (itemData: Omit<VaultItem, 'id' | 'lastModified' | 'strengthScore'>) => {
    const pwd = itemData.password || '';
    let score = 50;
    if (pwd.length >= 12) score += 25;
    if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score += 25;

    const newItem: VaultItem = {
      ...itemData,
      id: `vault-${Date.now()}`,
      strengthScore: Math.min(100, score),
      lastModified: new Date().toISOString().split('T')[0]
    };
    setVaultItems(prev => [newItem, ...prev]);
  };

  const deleteVaultItem = (id: string) => {
    setVaultItems(prev => prev.filter(v => v.id !== id));
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

  // RustDesk Remote Support
  const updateRustDeskConfig = (config: Partial<RustDeskServerConfig>) => {
    setRustDeskConfig(prev => ({ ...prev, ...config }));
  };

  const launchRustDeskSession = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;

    const newSession: RustDeskSession = {
      id: `sess-${Date.now()}`,
      deviceId,
      deviceName: device.name,
      rustDeskId: device.rustDeskId,
      clientName: device.clientName,
      connectedTech: 'Alex Rivera',
      startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'connected',
      sessionKey: `RUSTDESK-KEY-${Math.floor(1000 + Math.random() * 9000)}`
    };

    setActiveSessions(prev => [newSession, ...prev]);
    setActiveTab('remote-support');
  };

  const endRustDeskSession = (sessionId: string) => {
    setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  // White label actions
  const updateWhiteLabel = (config: Partial<WhiteLabelConfig>) => {
    setWhiteLabel(prev => ({ ...prev, ...config }));
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

    setTimeout(() => {
      let aiResponseText = `I analyzed your request regarding "${userText}". Here is what Apex MSP Intelligence suggests:`;
      let codeSnippet: string | undefined = undefined;
      let codeLanguage: 'powershell' | 'bash' | 'json' | 'sql' | undefined = undefined;

      const lower = userText.toLowerCase();

      if (lower.includes('powershell') || lower.includes('spooler') || lower.includes('script')) {
        aiResponseText = `Here is a custom PowerShell script tailored to resolve Print Spooler locks and clear stuck spool files safely:`;
        codeSnippet = `# ApexMSP Self-Healing PowerShell Script
Stop-Service -Name Spooler -Force
Get-ChildItem -Path "C:\\Windows\\System32\\spool\\PRINTERS\\*" -Recurse | Remove-Item -Force
Start-Service -Name Spooler
Write-Output "Spooler cache successfully reset."`;
        codeLanguage = 'powershell';
      } else if (lower.includes('mac') || lower.includes('bash') || lower.includes('disk')) {
        aiResponseText = `I have generated a high-efficiency macOS Bash remediation script to purge Xcode caches, Docker containers, and system log dumps:`;
        codeSnippet = `#!/bin/bash
# ApexMSP macOS Disk Optimizer
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
        aiResponseText = `Your Bitwarden Vault currently holds 4 high-security client credentials with an overall security audit score of 95.8%. All zero-knowledge TOTP secrets are rotating every 30 seconds.`;
      }

      const aiMsg: AICopilotMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'ai',
        text: aiResponseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        codeSnippet,
        codeLanguage
      };

      setAiMessages(prev => [...prev, aiMsg]);
    }, 600);
  };

  return (
    <AppContext.Provider value={{
      activeTab,
      setActiveTab,
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
      rustDeskConfig,
      updateRustDeskConfig,
      activeSessions,
      launchRustDeskSession,
      endRustDeskSession,
      whiteLabel,
      updateWhiteLabel,
      aiMessages,
      sendAIMessage,
      isAiDrawerOpen,
      setIsAiDrawerOpen,
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
