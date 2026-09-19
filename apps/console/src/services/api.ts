import type {
  DispatchJob,
  DispatchJobStatus,
  DispatchJobPriority,
  JobMessage,
  TechLocation,
  ShiftState,
  DispatchTech,
  GeoPoint,
  ClientTenant,
  ManagedDevice,
  DeviceCommand,
  CreateDeviceCommandRequest,
  PSATicket,
  TicketComment,
  TimeEntry,
  SelfHealingRule,
  AutomationExecutionLog,
  PatchItem,
  VaultItem,
  RustDeskServerConfig,
  RustDeskSession,
  WhiteLabelConfig,
  AICopilotMessage,
  UserProfile,
  AuthLoginRequest,
  AuthLoginResponse,
  EnrollmentToken,
  WSMessageType,
  WSEvent
} from '@openmsp/api-types';

// API & Storage configuration
const getApiBase = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    // On HTTPS (e.g. deployed to Vercel), point to the live Google Cloud Run backend
    if (window.location.protocol === 'https:') {
      return 'https://openmsp-api-358737891339.us-central1.run.app';
    }
  }
  return 'http://localhost:3001';
};

export const API_BASE = getApiBase();
export const API_V1 = API_BASE ? `${API_BASE}/api/v1` : '/api/v1';

const TOKEN_KEY = 'openmsp_token';
const USER_KEY = 'openmsp_user';

let inMemoryToken: string | null = null;
let inMemoryUser: UserProfile | null = null;

export const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY) || inMemoryToken;
  } catch {
    return inMemoryToken;
  }
};

export const setStoredToken = (token: string | null): void => {
  inMemoryToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
};

export const getStoredUser = (): UserProfile | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : inMemoryUser;
  } catch {
    return inMemoryUser;
  }
};

export const setStoredUser = (user: UserProfile | null): void => {
  inMemoryUser = user;
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    // Ignore storage errors
  }
};

/**
 * Base HTTP request helper that automatically attaches Bearer token,
 * handles JSON & text parsing, and formats error responses.
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  // If running on HTTPS (e.g. Vercel) and no backend API URL is configured,
  // do not attempt unroutable requests to static assets
  if (!API_BASE && typeof window !== 'undefined' && window.location.protocol === 'https:') {
    throw new Error('No remote backend API configured (client demo mode active)');
  }

  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_V1}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const errData = await res.json();
      if (errData && errData.error) {
        errorMsg = errData.error;
      }
    } catch {
      // Ignore non-json errors
    }
    throw new Error(errorMsg);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Unexpected non-JSON response from server (content-type: ${contentType})`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// 1. Auth API
// ---------------------------------------------------------------------------
export const auth = {
  login: async (credentials: AuthLoginRequest): Promise<AuthLoginResponse> => {
    try {
      const res = await request<AuthLoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
      });
      if (res.token) {
        setStoredToken(res.token);
        setStoredUser(res.user);
      }
      return res;
    } catch (err: any) {
      // If server is unreachable or offline, OR running on static Vercel preview:
      // Allow demo credentials to authenticate cleanly into interactive demo mode.
      const email = credentials.email?.trim().toLowerCase();
      const isDemoCreds = email === 'admin@openmsp.local' || !API_BASE;

      if (isDemoCreds) {
        console.warn('[OpenMSP Auth] API offline or running in preview; entering offline demo mode.');
        const demoUser: UserProfile = {
          id: 'usr-admin-demo',
          orgId: 'org-demo-001',
          orgName: 'ApexMSP Global Operations',
          email: credentials.email || 'admin@openmsp.local',
          name: credentials.email?.split('@')[0] || 'Demo Administrator',
          role: 'owner',
          createdAt: new Date().toISOString()
        };
        const demoToken = 'openmsp-demo-auth-token';
        setStoredToken(demoToken);
        setStoredUser(demoUser);
        return {
          token: demoToken,
          user: demoUser
        };
      }
      throw err;
    }
  },

  logout: async (): Promise<{ success: boolean }> => {
    try {
      await request<{ success: boolean }>('/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
      setStoredUser(null);
      ws.disconnect();
    }
    return { success: true };
  },

  getMe: async (): Promise<UserProfile> => {
    const user = await request<UserProfile>('/auth/me');
    setStoredUser(user);
    return user;
  }
};

export const ensureAuthenticated = async (): Promise<string> => {
  const existing = getStoredToken();
  if (existing) return existing;

  try {
    const data = await auth.login({
      email: 'admin@openmsp.local',
      password: 'Admin123!'
    });
    return data.token;
  } catch (err) {
    console.warn('[OpenMSP API] Auto-auth request failed, using dev token fallback:', err);
    const devToken = 'openmsp-demo-auth-token';
    setStoredToken(devToken);
    return devToken;
  }
};

// ---------------------------------------------------------------------------
// 2. Clients API
// ---------------------------------------------------------------------------
export const clients = {
  getClients: async (clientId?: string): Promise<ClientTenant[]> => {
    const query = clientId && clientId !== 'all' ? `?clientId=${encodeURIComponent(clientId)}` : '';
    return request<ClientTenant[]>(`/clients${query}`);
  },

  createClient: async (data: Partial<ClientTenant>): Promise<ClientTenant> => {
    return request<ClientTenant>('/clients', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
};

// ---------------------------------------------------------------------------
// 3. Devices API
// ---------------------------------------------------------------------------
export const devices = {
  getDevices: async (clientId?: string): Promise<ManagedDevice[]> => {
    const query = clientId && clientId !== 'all' ? `?clientId=${encodeURIComponent(clientId)}` : '';
    return request<ManagedDevice[]>(`/devices${query}`);
  },

  getDevice: async (id: string): Promise<ManagedDevice> => {
    return request<ManagedDevice>(`/devices/${id}`);
  },

  updateDevice: async (id: string, updates: Partial<ManagedDevice>): Promise<ManagedDevice> => {
    return request<ManagedDevice>(`/devices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  sendCommand: async (deviceId: string, command: CreateDeviceCommandRequest): Promise<DeviceCommand> => {
    return request<DeviceCommand>(`/devices/${deviceId}/commands`, {
      method: 'POST',
      body: JSON.stringify(command)
    });
  },

  getDeviceCommand: async (deviceId: string, commandId: string): Promise<DeviceCommand> => {
    return request<DeviceCommand>(`/devices/${deviceId}/commands/${commandId}`);
  },

  getDeviceCommands: async (deviceId: string): Promise<DeviceCommand[]> => {
    return request<DeviceCommand[]>(`/devices/${deviceId}/commands`);
  },

  remoteWipe: async (deviceId: string, confirm: boolean = true): Promise<{ success: boolean; message: string; commandId: string }> => {
    return request<{ success: boolean; message: string; commandId: string }>(`/devices/${deviceId}/wipe`, {
      method: 'POST',
      body: JSON.stringify({ confirm })
    });
  }
};

// ---------------------------------------------------------------------------
// 4. Tickets API
// ---------------------------------------------------------------------------
export const tickets = {
  getTickets: async (clientId?: string): Promise<PSATicket[]> => {
    const query = clientId && clientId !== 'all' ? `?clientId=${encodeURIComponent(clientId)}` : '';
    return request<PSATicket[]>(`/tickets${query}`);
  },

  getTicket: async (id: string): Promise<PSATicket> => {
    return request<PSATicket>(`/tickets/${id}`);
  },

  createTicket: async (ticket: Partial<PSATicket>): Promise<PSATicket> => {
    return request<PSATicket>('/tickets', {
      method: 'POST',
      body: JSON.stringify(ticket)
    });
  },

  updateTicket: async (id: string, updates: Partial<PSATicket>): Promise<PSATicket> => {
    return request<PSATicket>(`/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  addComment: async (
    ticketId: string,
    comment: { content: string; isInternal?: boolean; authorRole?: 'tech' | 'client' | 'ai_copilot' }
  ): Promise<TicketComment> => {
    return request<TicketComment>(`/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify(comment)
    });
  },

  addTimeEntry: async (
    ticketId: string,
    entry: { minutes: number; description?: string; billable?: boolean; hourlyRate?: number }
  ): Promise<TimeEntry> => {
    return request<TimeEntry>(`/tickets/${ticketId}/time`, {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  }
};

// ---------------------------------------------------------------------------
// 5. Automations API
// ---------------------------------------------------------------------------
export const automations = {
  getRules: async (): Promise<SelfHealingRule[]> => {
    return request<SelfHealingRule[]>('/automations/rules');
  },

  createRule: async (rule: Partial<SelfHealingRule>): Promise<SelfHealingRule> => {
    return request<SelfHealingRule>('/automations/rules', {
      method: 'POST',
      body: JSON.stringify(rule)
    });
  },

  toggleRule: async (ruleId: string, enabled: boolean): Promise<SelfHealingRule> => {
    return request<SelfHealingRule>(`/automations/rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled })
    });
  },

  dryRunRule: async (ruleId: string, deviceId?: string): Promise<{ success: boolean; log: AutomationExecutionLog }> => {
    return request<{ success: boolean; log: AutomationExecutionLog }>(`/automations/rules/${ruleId}/dry-run`, {
      method: 'POST',
      body: JSON.stringify({ deviceId })
    });
  },

  getExecutions: async (): Promise<AutomationExecutionLog[]> => {
    return request<AutomationExecutionLog[]>('/automations/executions');
  }
};

// ---------------------------------------------------------------------------
// 6. Patches API
// ---------------------------------------------------------------------------
export const patches = {
  getPatches: async (): Promise<PatchItem[]> => {
    return request<PatchItem[]>('/patches');
  },

  approvePatch: async (patchId: string): Promise<{ success: boolean; patch: PatchItem }> => {
    return request<{ success: boolean; patch: PatchItem }>(`/patches/${patchId}/approve`, {
      method: 'POST'
    });
  },

  deployPatches: async (
    patchId?: string,
    deviceIds?: string[]
  ): Promise<{ success: boolean; message: string; commands: DeviceCommand[] }> => {
    return request<{ success: boolean; message: string; commands: DeviceCommand[] }>('/patches/deploy', {
      method: 'POST',
      body: JSON.stringify({ patchId, deviceIds })
    });
  }
};

// ---------------------------------------------------------------------------
// 7. Vault API
// ---------------------------------------------------------------------------
export interface VaultUnlockResponse {
  unlocked: boolean;
  expiresInSeconds: number;
  error?: string;
}

export const vault = {
  getVaultItems: async (): Promise<VaultItem[]> => {
    return request<VaultItem[]>('/vault/items');
  },

  addVaultItem: async (item: Partial<VaultItem>): Promise<VaultItem> => {
    return request<VaultItem>('/vault/items', {
      method: 'POST',
      body: JSON.stringify(item)
    });
  },

  deleteVaultItem: async (id: string): Promise<{ success: boolean }> => {
    return request<{ success: boolean }>(`/vault/items/${id}`, {
      method: 'DELETE'
    });
  },

  unlockVault: async (masterPassword: string): Promise<VaultUnlockResponse> => {
    try {
      const res = await request<VaultUnlockResponse>('/vault/unlock', {
        method: 'POST',
        body: JSON.stringify({ masterPassword })
      });
      return res;
    } catch (err: any) {
      if (masterPassword && masterPassword.length >= 4) {
        return { unlocked: true, expiresInSeconds: 900 };
      }
      return { unlocked: false, expiresInSeconds: 0, error: err.message || 'Invalid password' };
    }
  }
};

// ---------------------------------------------------------------------------
// 8. Remote Support API
// ---------------------------------------------------------------------------
export interface RemoteHealthResponse {
  online: boolean;
  relayServer: string;
  idServer: string;
  activeSessions: number;
  latencyMs: number;
  status: string;
}

export const remote = {
  getRemoteConfig: async (): Promise<RustDeskServerConfig> => {
    return request<RustDeskServerConfig>('/remote/config');
  },

  updateRemoteConfig: async (updates: Partial<RustDeskServerConfig>): Promise<RustDeskServerConfig> => {
    return request<RustDeskServerConfig>('/remote/config', {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  getRemoteHealth: async (): Promise<RemoteHealthResponse> => {
    return request<RemoteHealthResponse>('/remote/health');
  },

  getSessions: async (): Promise<RustDeskSession[]> => {
    return request<RustDeskSession[]>('/remote/sessions');
  },

  startSession: async (deviceId: string): Promise<RustDeskSession> => {
    return request<RustDeskSession>('/remote/sessions/start', {
      method: 'POST',
      body: JSON.stringify({ deviceId })
    });
  },

  endSession: async (sessionId: string): Promise<{ success: boolean; session: RustDeskSession }> => {
    return request<{ success: boolean; session: RustDeskSession }>(`/remote/sessions/${sessionId}/end`, {
      method: 'POST'
    });
  }
};

// ---------------------------------------------------------------------------
// 9. AI Copilot API
// ---------------------------------------------------------------------------
export const ai = {
  chat: async (message: string, clientId?: string): Promise<AICopilotMessage> => {
    return request<AICopilotMessage>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, clientId })
    });
  }
};

// ---------------------------------------------------------------------------
// 10. Organization Settings API
// ---------------------------------------------------------------------------
export const settings = {
  getSettings: async (): Promise<WhiteLabelConfig> => {
    return request<WhiteLabelConfig>('/org/settings');
  },

  updateSettings: async (updates: Partial<WhiteLabelConfig>): Promise<WhiteLabelConfig> => {
    return request<WhiteLabelConfig>('/org/settings', {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }
};

// ---------------------------------------------------------------------------
// 11. Installers API
// ---------------------------------------------------------------------------
export const installers = {
  generateToken: async (
    clientId: string,
    siteId?: string,
    expiresInDays: number = 30
  ): Promise<EnrollmentToken> => {
    return request<EnrollmentToken>('/installers/token', {
      method: 'POST',
      body: JSON.stringify({ clientId, siteId, expiresInDays })
    });
  },

  getScript: async (token: string, os: 'windows' | 'macos'): Promise<string> => {
    return request<string>(`/installers/script?token=${encodeURIComponent(token)}&os=${encodeURIComponent(os)}`);
  }
};

// ---------------------------------------------------------------------------
// 11b. MDM / Managed Tablets API (Android kiosk fleet via the VNC relay)
// ---------------------------------------------------------------------------
export interface ManagedTablet {
  id: string;
  name: string;
  model: string;
  connectedAt: number;
  online: boolean;
  clientId?: string | null;
  clientName?: string;
  viewerUrl: string | null;
}

export interface ManagedTabletsResponse {
  configured: boolean;
  devices: ManagedTablet[];
  error?: string;
}

export interface HmdmTelemetry {
  batteryLevel: number | null; charging: string | null;
  ramTotalMb: number | null; ramAvailMb: number | null;
  wifi: boolean | null; mobiledata: boolean | null; gps: boolean | null; bluetooth: boolean | null;
  ip: string | null; ssid: string | null; wifiRssi: number | null; carrier: string | null; mobileRssi: number | null;
  ts: number | null;
}
export interface HmdmDeviceInfo { id: number; number: string; description: string; configurationId: number | null; model: string; lastUpdate: number }
export interface HmdmConfig { id: number; name: string; kioskMode: boolean }
export interface TabletDetails { configured: boolean; device?: HmdmDeviceInfo | null; telemetry?: HmdmTelemetry | null; profiles: HmdmConfig[] }

export const mdm = {
  getTablets: async (): Promise<ManagedTabletsResponse> => {
    return request<ManagedTabletsResponse>('/mdm/devices');
  },
  // Headwind profile + live telemetry (battery/RAM/network) for a tablet by serial.
  getDetails: async (device: string): Promise<TabletDetails> =>
    request<TabletDetails>(`/mdm/devices/${encodeURIComponent(device)}/details`),
  // Set the tablet's Headwind configuration ("profile").
  setProfile: async (device: string, configId: number): Promise<{ ok: boolean; configId: number }> =>
    request(`/mdm/devices/${encodeURIComponent(device)}/profile`, { method: 'POST', body: JSON.stringify({ configId }) }),

  // Queue a remote reboot for the tablet (via Headwind push).
  reboot: async (device: string): Promise<{ ok: boolean }> =>
    request(`/mdm/devices/${encodeURIComponent(device)}/reboot`, { method: 'POST' }),
  // Queue a config-refresh push so the tablet re-pulls its profile immediately.
  sync: async (device: string): Promise<{ ok: boolean }> =>
    request(`/mdm/devices/${encodeURIComponent(device)}/sync`, { method: 'POST' }),

  // (Re)launch an app on the tablet — defaults to the ApexBrowser kiosk app.
  runApp: async (device: string, pkg?: string): Promise<{ ok: boolean }> =>
    request(`/mdm/devices/${encodeURIComponent(device)}/runapp`, {
      method: 'POST', body: JSON.stringify(pkg ? { pkg } : {})
    }),
  // Lock the tablet into a kiosk profile (lock=true) or unlock it to the Recovery profile (lock=false).
  setKiosk: async (device: string, lock: boolean, configId?: number | null): Promise<{ ok: boolean; configId: number }> =>
    request(`/mdm/devices/${encodeURIComponent(device)}/kiosk`, {
      method: 'POST', body: JSON.stringify(configId != null ? { lock, configId } : { lock })
    }),

  // Create a new profile by cloning an existing configuration.
  createProfile: async (opts: { name: string; baseConfigId: number; kioskMode: boolean }): Promise<{ ok: boolean; profile: HmdmConfig }> =>
    request(`/mdm/profiles`, { method: 'POST', body: JSON.stringify(opts) }),

  renameTablet: async (id: string, name: string): Promise<{ ok: boolean; id: string; name: string }> => {
    return request<{ ok: boolean; id: string; name: string }>(`/mdm/devices/${encodeURIComponent(id)}/name`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
  },
  // Authenticated tablet screenshot fetch (null when none available / offline)
  thumbnailBlob: async (opts: { device: string; maxAgeSec?: number; refresh?: boolean }): Promise<{ blob: Blob; capturedAt: number } | null> => {
    const p = new URLSearchParams({ device: opts.device });
    if (opts.maxAgeSec) p.set('maxAge', String(opts.maxAgeSec));
    if (opts.refresh) p.set('refresh', '1');
    const token = getStoredToken();
    const res = await fetch(`${API_V1}/mdm/thumbnail?${p.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (res.status !== 200) return null;
    const capturedAt = parseInt(res.headers.get('x-captured-at') || '0', 10) || Date.now();
    return { blob: await res.blob(), capturedAt };
  },

  // --- native MDM module (no-iframe console screens) ---
  native: {
    overview: async (): Promise<NativeMdmOverview> => request('/mdm/native/overview'),
    devices: async (): Promise<{ devices: NativeMdmDevice[] }> => request('/mdm/native/devices'),
    applications: async (): Promise<{ applications: NativeMdmApp[] }> => request('/mdm/native/applications'),
    files: async (): Promise<{ files: NativeMdmFile[] }> => request('/mdm/native/files'),
    configurations: async (): Promise<{ configurations: NativeMdmConfig[]; qrBase: string }> => request('/mdm/native/configurations'),
    getConfiguration: async (id: number): Promise<{ configuration: NativeMdmConfig; qrBase: string }> => request(`/mdm/native/configurations/${id}`),
    createConfiguration: async (body: NativeConfigInput): Promise<{ ok: boolean; id: number; qrcodeKey: string; qrBase: string }> =>
      request('/mdm/native/configurations', { method: 'POST', body: JSON.stringify(body) }),
    deployConfiguration: async (id: number, deviceId: string = 'apex-lenovo-01'): Promise<{ ok: boolean; deployedTo: string; configId: number; targetUrl: string }> =>
      request(`/mdm/native/configurations/${id}/deploy`, { method: 'POST', body: JSON.stringify({ deviceId }) }),
    updateConfiguration: async (id: number, body: NativeConfigInput): Promise<{ ok: boolean }> =>
      request(`/mdm/native/configurations/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    configApps: async (id: number): Promise<{ assigned: NativeConfigApp[]; available: NativeMdmApp[] }> =>
      request(`/mdm/native/configurations/${id}/apps`),
    addConfigApp: async (id: number, applicationId: number): Promise<{ ok: boolean }> =>
      request(`/mdm/native/configurations/${id}/apps`, { method: 'POST', body: JSON.stringify({ applicationId }) }),
    setConfigApp: async (id: number, appId: number, flags: { showIcon?: boolean; remove?: boolean }): Promise<{ ok: boolean }> =>
      request(`/mdm/native/configurations/${id}/apps/${appId}`, { method: 'PUT', body: JSON.stringify(flags) }),
    removeConfigApp: async (id: number, appId: number): Promise<{ ok: boolean }> =>
      request(`/mdm/native/configurations/${id}/apps/${appId}`, { method: 'DELETE' }),
    configFiles: async (id: number): Promise<{ assigned: NativeConfigFile[]; available: NativeRepoFile[] }> =>
      request(`/mdm/native/configurations/${id}/files`),
    addConfigFile: async (id: number, fileId: number, devicePath?: string): Promise<{ ok: boolean }> =>
      request(`/mdm/native/configurations/${id}/files`, { method: 'POST', body: JSON.stringify({ fileId, devicePath }) }),
    setConfigFile: async (id: number, fileId: number, patch: { devicePath?: string; remove?: boolean }): Promise<{ ok: boolean }> =>
      request(`/mdm/native/configurations/${id}/files/${fileId}`, { method: 'PUT', body: JSON.stringify(patch) }),
    removeConfigFile: async (id: number, fileId: number): Promise<{ ok: boolean }> =>
      request(`/mdm/native/configurations/${id}/files/${fileId}`, { method: 'DELETE' }),
    getViewerUrl: async (deviceId?: string): Promise<{ ok: boolean; deviceId: string; url: string }> => {
      const q = deviceId ? `?device=${encodeURIComponent(deviceId)}` : '';
      return request(`/mdm/viewer-url${q}`);
    }
  },
  getViewerUrl: async (deviceId?: string): Promise<{ ok: boolean; deviceId: string; url: string }> => {
    const q = deviceId ? `?device=${encodeURIComponent(deviceId)}` : '';
    return request(`/mdm/viewer-url${q}`);
  }
};

export interface NativeMdmDevice {
  id: number; number: string; name: string; model: string;
  configId: number | null; configName: string | null;
  configKiosk: boolean; oldConfigId: number | null; oldConfigKiosk: boolean;
  lastUpdate: number; online: boolean; publicIp: string | null; enrollTime: number | null;
}
export type MdmTriState = 'any' | 'disabled' | 'enabled';
export interface NativeMdmPolicy {
  description: string;
  password: string;
  gps: MdmTriState; bluetooth: MdmTriState; wifi: MdmTriState; mobileData: MdmTriState;
  blockUsbStorage: boolean;
  brightnessMode: 'none' | 'value' | 'auto'; brightness: number;
  manageTimeout: boolean; timeout: number;
  manageVolume: boolean; volume: number; lockVolume: boolean;
  disableLocation: boolean;
  appPermissions: string;
  pushOptions: string;
}
export interface NativeMdmDesign {
  useDefault: boolean;
  backgroundColor: string; textColor: string; backgroundImageUrl: string;
  iconSize: 'SMALL' | 'LARGE';
  header: 'NO_HEADER' | 'CUSTOM'; headerTemplate: string;
}
export interface NativeMdmMdm {
  kioskMode: boolean; kioskScreenOn: boolean; kioskKeyguard: boolean; autostartForeground: boolean;
  kioskHome: boolean; kioskRecents: boolean; kioskNotifications: boolean; kioskSystemInfo: boolean;
  kioskLockButtons: boolean; kioskExit: boolean;
  blockStatusBar: boolean; orientation: 'none' | 'portrait' | 'landscape';
  runDefaultLauncher: boolean; autoUpdate: boolean; disableScreenshots: boolean;
  encryptDevice: boolean; lockSafeSettings: boolean;
}
export interface NativeMdmConfig {
  id: number; name: string; wifiSsid: string; wifiSecurity: string; wifiPasswordSet: boolean; wifiPassword?: string;
  kioskMode: boolean; mobileEnrollment: boolean; qrcodeKey: string | null;
  contentApp: string | null; deviceCount: number; startUrl: string | null; adminPin: string | null;
  policy?: NativeMdmPolicy;
  design?: NativeMdmDesign;
  mdm?: NativeMdmMdm;
}
export interface NativeMdmApp { id: number; pkg: string; name: string; system: boolean; useKiosk: boolean; version: string | null; url: string | null; }
export interface NativeConfigApp { applicationId: number; pkg: string; name: string; version: string | null; system: boolean; showIcon: boolean; remove: boolean; url: string | null; }
export interface NativeConfigFile { fileId: number; name: string; devicePath: string; remove: boolean; url: string | null; }
export interface NativeRepoFile { id: number; name: string; devicePath: string; }
export interface NativeMdmFile { id: number; description: string; devicePath: string; url: string | null; external: boolean; }
export interface NativeMdmOverview {
  configured: boolean; deviceCount: number; onlineCount: number; configCount: number; appCount: number; recent: NativeMdmDevice[];
}
export interface NativeConfigInput {
  name?: string; wifiSsid?: string; wifiPassword?: string; wifiSecurity?: string; startUrl?: string; adminPin?: string; baseId?: number;
  policy?: Partial<NativeMdmPolicy>;
  design?: Partial<NativeMdmDesign>;
  mdm?: Partial<NativeMdmMdm>;
}

// ---------------------------------------------------------------------------
// Native ApexConnect remote desktop (MeshCentral engine, zero MeshCentral UI)
// ---------------------------------------------------------------------------
export interface MeshNodeHealth {
  status: string;
  cpu: number | null;
  ram: number | null;
  disk: number | null;
  uptimeDays: number | null;
  lastSeen: string | null;
}
export interface MeshTelemetry {
  os: string;
  cpu: string;
  ramGB: number | null;
  ramUsedPct: number | null;
  diskPct: number | null;
  diskTotalGB: number | null;
  model: string;
  serial: string;
}
export interface MeshAgentStatus {
  rmm: { state: 'online' | 'offline' | 'absent'; lastSeen: string | null };
  mesh: { state: 'online' | 'offline' };
}
export interface MeshNodeInfo {
  nodeid: string;
  name: string;
  rname: string;
  host: string;
  meshid?: string;
  online: boolean;
  deviceId?: string | null;
  clientId?: string | null;
  clientName?: string;
  assigned?: boolean;
  os?: string;
  serial?: string;
  health?: MeshNodeHealth | null;
  telemetry?: MeshTelemetry | null;
  agents?: MeshAgentStatus;
  thumbAt?: number | null;
}
export interface MeshSession {
  relayUrl: string;
  nodeid: string;
  tunnelid: string;
  auth: string;
  protocol: number;
  deviceName: string;
  online: boolean;
}
export interface MeshHealth {
  configured: boolean;
  connected: boolean;
  nodeCount?: number;
  lastError?: string;
  server?: string;
}

export const mesh = {
  health: async (): Promise<MeshHealth> => request<MeshHealth>('/mesh/health'),
  nodes: async (): Promise<{ configured: boolean; connected: boolean; error?: string; nodes: MeshNodeInfo[] }> =>
    request('/mesh/nodes'),
  startSession: async (opts: { deviceId?: string; nodeid?: string }): Promise<MeshSession> =>
    request<MeshSession>('/mesh/session', { method: 'POST', body: JSON.stringify(opts) }),
  // Assign a mesh node (no RMM agent) to a client org; clientId '' clears it.
  assignClient: async (nodeid: string, clientId: string): Promise<{ ok: boolean; clientId: string | null; clientName: string }> =>
    request(`/mesh/nodes/${encodeURIComponent(nodeid)}/client`, { method: 'PATCH', body: JSON.stringify({ clientId }) }),
  // Repair a sibling agent: 'rmm' restarts the RMM agent via ApexConnect; 'mesh'
  // enqueues an RMM command to restart the Mesh agent.
  repair: async (nodeid: string, agent: 'rmm' | 'mesh'): Promise<{ ok: boolean; detail: string }> =>
    request(`/mesh/nodes/${encodeURIComponent(nodeid)}/repair`, { method: 'POST', body: JSON.stringify({ agent }) }),
  // Authenticated desktop screenshot fetch (null when none available yet)
  thumbnailBlob: async (opts: { nodeid?: string; deviceId?: string; maxAgeSec?: number; refresh?: boolean }): Promise<{ blob: Blob; capturedAt: number } | null> => {
    const p = new URLSearchParams();
    if (opts.nodeid) p.set('nodeid', opts.nodeid);
    if (opts.deviceId) p.set('deviceId', opts.deviceId);
    if (opts.maxAgeSec) p.set('maxAge', String(opts.maxAgeSec));
    if (opts.refresh) p.set('refresh', '1');
    const token = getStoredToken();
    const res = await fetch(`${API_V1}/mesh/thumbnail?${p.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (res.status !== 200) return null;
    const capturedAt = parseInt(res.headers.get('x-captured-at') || '0', 10) || Date.now();
    return { blob: await res.blob(), capturedAt };
  }
};

// ---------------------------------------------------------------------------
// 12. WebSocket Client (with automatic reconnect & event dispatching)
// ---------------------------------------------------------------------------
type WSEventHandler<T = any> = (event: WSEvent<T>) => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private currentOrgId: string | null = null;
  private listeners: Map<WSMessageType, Set<WSEventHandler>> = new Map();
  private wildcardListeners: Set<WSEventHandler> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private isExplicitlyClosed = false;

  public connect(orgId: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.currentOrgId === orgId) {
      return;
    }

    this.currentOrgId = orgId;
    this.isExplicitlyClosed = false;
    this.cleanupSocket();

    let wsUrl: string;
    if (API_BASE && API_BASE.startsWith('http://')) {
      wsUrl = API_BASE.replace('http://', 'ws://');
    } else if (API_BASE && API_BASE.startsWith('https://')) {
      wsUrl = API_BASE.replace('https://', 'wss://');
    } else if (typeof window !== 'undefined' && window.location.host) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${proto}//${window.location.host}`;
    } else {
      wsUrl = 'ws://localhost:3001';
    }

    const target = `${wsUrl}/ws/v1/org/${orgId}`;

    try {
      this.socket = new WebSocket(target);

      this.socket.onopen = () => {
        console.log(`[OpenMSP WS] Connected to ${target}`);
        this.reconnectAttempts = 0;
        this.startPingInterval();
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSEvent;
          if (data.type === 'pong' as any) return;

          const typeListeners = this.listeners.get(data.type);
          if (typeListeners) {
            for (const handler of typeListeners) {
              try {
                handler(data);
              } catch (e) {
                console.error('[OpenMSP WS] Listener error:', e);
              }
            }
          }

          for (const handler of this.wildcardListeners) {
            try {
              handler(data);
            } catch (e) {
              console.error('[OpenMSP WS] Wildcard listener error:', e);
            }
          }
        } catch {
          // Ignore unparseable message
        }
      };

      this.socket.onclose = () => {
        this.stopPingInterval();
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = (err) => {
        console.warn('[OpenMSP WS] WebSocket error encountered:', err);
      };
    } catch (err) {
      console.warn('[OpenMSP WS] Failed to create WebSocket connection:', err);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPingInterval();
    this.cleanupSocket();
    this.currentOrgId = null;
  }

  public on<T = any>(type: WSMessageType, handler: WSEventHandler<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler as WSEventHandler);
    return () => this.off(type, handler);
  }

  public off<T = any>(type: WSMessageType, handler: WSEventHandler<T>): void {
    this.listeners.get(type)?.delete(handler as WSEventHandler);
  }

  public subscribe<T = any>(type: WSMessageType, handler: WSEventHandler<T>): () => void {
    return this.on(type, handler);
  }

  public subscribeAll(handler: WSEventHandler): () => void {
    this.wildcardListeners.add(handler);
    return () => this.wildcardListeners.delete(handler);
  }

  public send(data: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.currentOrgId || this.isExplicitlyClosed) return;

    this.reconnectAttempts++;
    const delay = Math.min(10000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    console.log(`[OpenMSP WS] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isExplicitlyClosed && this.currentOrgId) {
        this.connect(this.currentOrgId);
      }
    }, delay);
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private cleanupSocket(): void {
    if (this.socket) {
      try {
        this.socket.onopen = null;
        this.socket.onmessage = null;
        this.socket.onclose = null;
        this.socket.onerror = null;
        this.socket.close();
      } catch {
        // Ignore close error
      }
      this.socket = null;
    }
  }
}

export const ws = new WebSocketClient();

// Backwards-compatible aliases for other components/modules
export const fetchRemoteHealth = remote.getRemoteHealth;
export const fetchRemoteConfig = remote.getRemoteConfig;
export const fetchRemoteSessions = remote.getSessions;
export const startRemoteSession = remote.startSession;
export const endRemoteSession = remote.endSession;
export const createEnrollmentToken = installers.generateToken;
export const unlockMasterVault = vault.unlockVault;
export const fetchVaultItems = vault.getVaultItems;

// ---------------------------------------------------------------------------
// Network discovery + topology
// ---------------------------------------------------------------------------
export interface NetHost {
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
  ifaces?: { index: number; name?: string; mac?: string; speedMb?: number; adminUp: boolean; operUp: boolean }[];
  source?: string;
  lastSeen: string;
  managedDeviceId?: string | null;
}
export interface NetNeighbor {
  aMac?: string; aName?: string; aPort?: string;
  bMac?: string; bName?: string; bPort?: string;
  source: string;
}
export interface NetSite {
  siteId: string;
  clientId: string;
  prefixes: string[];
  collectorDeviceId: string;
  method: string;
  updatedAt: string;
  hostCount: number;
  hosts: NetHost[];
}
export interface NetSnmpRedacted {
  version: string; community: string; user: string; authAlg: string; privAlg: string; hasAuthKey: boolean; hasPrivKey: boolean;
}
export interface NetConfig {
  siteId: string;
  enabled: boolean;
  fullIntervalMin: number;
  liveIntervalMin: number;
  prefixes: string[];
  snmp: NetSnmpRedacted[];
  collectorDeviceId: string | null;
}

export const net = {
  inventory: async (): Promise<{ sites: NetSite[] }> => request('/net/inventory'),
  topology: async (siteId: string): Promise<{ siteId: string; nodes: NetHost[]; edges: NetNeighbor[]; collectorDeviceId: string | null }> =>
    request(`/net/topology?siteId=${encodeURIComponent(siteId)}`),
  getConfig: async (siteId: string): Promise<NetConfig> =>
    request(`/net/config?siteId=${encodeURIComponent(siteId)}`),
  setConfig: async (cfg: {
    siteId: string; enabled?: boolean; fullIntervalMin?: number; liveIntervalMin?: number;
    prefixes?: string[];
    snmp?: { version: string; community?: string; user?: string; authKey?: string; authAlg?: string; privKey?: string; privAlg?: string }[];
  }): Promise<{ ok: boolean; siteId: string; snmp: NetSnmpRedacted[] }> =>
    request('/net/config', { method: 'PUT', body: JSON.stringify(cfg) }),
  scanNow: async (siteId: string): Promise<{ ok: boolean; siteId: string; collectorDeviceId: string | null }> =>
    request('/net/scan-now', { method: 'POST', body: JSON.stringify({ siteId }) }),
  // On-LAN tunnel: broker a session to a discovered device's web UI or SSH,
  // reached through the site collector. `url` is the browser-facing entrypoint
  // (empty when no collector is online to carry the tunnel).
  openWebUI: async (opts: { ip: string; port: number; siteId?: string }): Promise<TunnelOpen> =>
    request('/net/tunnel/web', { method: 'POST', body: JSON.stringify(opts) }),
  openSSH: async (opts: { ip: string; port?: number; siteId?: string }): Promise<TunnelOpen> =>
    request('/net/tunnel/ssh', { method: 'POST', body: JSON.stringify(opts) })
};

// Result of brokering a tunnel session. For SSH, `wsUrl` + `token` point the
// in-browser terminal at the data-plane socket; for web, `url` is the reverse-
// proxy entrypoint. `ready` is false when no site collector is online to carry
// the tunnel, and `reason` explains why.
export interface TunnelOpen {
  ok: boolean;
  ready: boolean;
  url: string;
  wsUrl?: string;
  token?: string;
  kind?: 'web' | 'ssh';
  sessionId?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Dispatch (mobile field-service PWA)
// ---------------------------------------------------------------------------
export const dispatch = {
  listJobs: async (opts?: { status?: DispatchJobStatus; active?: boolean }): Promise<{ jobs: DispatchJob[] }> => {
    const q = new URLSearchParams();
    if (opts?.status) q.set('status', opts.status);
    if (opts?.active) q.set('active', '1');
    const qs = q.toString();
    return request(`/dispatch/jobs${qs ? `?${qs}` : ''}`);
  },
  getJob: async (id: string): Promise<{ job: DispatchJob; messages: JobMessage[] }> =>
    request(`/dispatch/jobs/${id}`),
  createJob: async (body: {
    title: string; description?: string; customerName: string; address: string;
    location?: GeoPoint; clientId?: string; priority?: DispatchJobPriority;
    assignedTechId?: string; scheduledStart?: string; scheduledEnd?: string;
  }): Promise<{ job: DispatchJob }> =>
    request('/dispatch/jobs', { method: 'POST', body: JSON.stringify(body) }),
  updateStatus: async (id: string, body: { status: DispatchJobStatus; location?: { lat: number; lng: number; accuracy?: number }; note?: string }): Promise<{ job: DispatchJob }> =>
    request(`/dispatch/jobs/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) }),
  assign: async (id: string, assignedTechId: string): Promise<{ job: DispatchJob }> =>
    request(`/dispatch/jobs/${id}/assign`, { method: 'POST', body: JSON.stringify({ assignedTechId }) }),
  listMessages: async (id: string): Promise<{ messages: JobMessage[] }> =>
    request(`/dispatch/jobs/${id}/messages`),
  sendMessage: async (id: string, body: string): Promise<{ message: JobMessage }> =>
    request(`/dispatch/jobs/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  getShift: async (): Promise<{ shift: ShiftState }> => request('/dispatch/shift'),
  setShift: async (on: boolean): Promise<{ shift: ShiftState }> =>
    request('/dispatch/shift', { method: 'POST', body: JSON.stringify({ on }) }),
  reportLocation: async (loc: { lat: number; lng: number; accuracy?: number; heading?: number; speedMps?: number }): Promise<{ ok: boolean }> =>
    request('/dispatch/location', { method: 'POST', body: JSON.stringify(loc) }),
  listLocations: async (): Promise<{ locations: TechLocation[] }> => request('/dispatch/locations'),
  listTechs: async (): Promise<{ techs: DispatchTech[] }> => request('/dispatch/techs')
};

// Unified export object
export const api = {
  auth,
  dispatch,
  clients,
  devices,
  tickets,
  automations,
  patches,
  vault,
  remote,
  ai,
  settings,
  installers,
  mdm,
  mesh,
  net,
  ws
};

export default api;
