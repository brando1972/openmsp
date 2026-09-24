import fs from 'fs';
import path from 'path';

export interface PersistentMdmDevice {
  id: number;
  number: string;
  name: string;
  model: string;
  configId: number;
  configName: string;
  configKiosk: boolean;
  oldConfigId: number | null;
  oldConfigKiosk: boolean;
  lastUpdate: number | null;
  online: boolean;
  publicIp: string;
  enrollTime: number | null;
  battery: number | null;
  screenWidth: number | null;
  screenHeight: number | null;
  targetUrl: string;
  pendingCommand?: string | null;
}

export interface MdmPersistentState {
  targetTabletUrl: string | null;
  devices: PersistentMdmDevice[];
}

const DATA_FILE = path.join(process.env.DATA_DIR || path.resolve(process.cwd(), '.data'), 'mdm-devices.json');

const defaultState: MdmPersistentState = {
  targetTabletUrl: 'https://apexmsp.app',
  devices: [
    {
      id: 1,
      number: 'apex-lenovo-01',
      name: 'Lenovo Tab TB373FU',
      model: 'Lenovo Tab TB373FU (Android 14)',
      configId: 4,
      configName: 'ApexMDM Full Browser & Recovery',
      configKiosk: false,
      oldConfigId: 1,
      oldConfigKiosk: true,
      lastUpdate: Date.now(),
      online: true,
      publicIp: '192.168.4.200',
      enrollTime: Date.now() - 86400000,
      battery: 85,
      screenWidth: 1386,
      screenHeight: 866,
      targetUrl: 'https://apexmsp.app'
    }
  ]
};

let cachedState: MdmPersistentState | null = null;

export function loadMdmState(): MdmPersistentState {
  if (cachedState) return cachedState;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (parsed && Array.isArray(parsed.devices)) {
        cachedState = parsed;
        return cachedState!;
      }
    }
  } catch (e) {
    console.warn('[mdmStore] failed to load mdm-devices.json:', (e as Error).message);
  }

  cachedState = { ...defaultState, devices: defaultState.devices.map(d => ({ ...d })) };
  saveMdmState(cachedState);
  return cachedState;
}

export function saveMdmState(state?: MdmPersistentState) {
  try {
    const toSave = state || cachedState || defaultState;
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(toSave, null, 2));
  } catch (e) {
    console.warn('[mdmStore] failed to persist mdm-devices.json:', (e as Error).message);
  }
}

// Tablet considered online if seen within 2 hours or currently connected
const TABLET_ONLINE_WINDOW_MS = 2 * 60 * 60 * 1000;

export function getMdmDevices(): PersistentMdmDevice[] {
  const state = loadMdmState();
  const now = Date.now();
  return state.devices.map(d => ({
    ...d,
    online: d.lastUpdate ? (now - d.lastUpdate < TABLET_ONLINE_WINDOW_MS) : true
  }));
}

export function getMdmDevice(serial: string): PersistentMdmDevice | undefined {
  const state = loadMdmState();
  const d = state.devices.find(x => x.number === serial || String(x.id) === serial);
  if (!d) return undefined;
  const now = Date.now();
  return {
    ...d,
    online: d.lastUpdate ? (now - d.lastUpdate < TABLET_ONLINE_WINDOW_MS) : true
  };
}

export function updateMdmDevice(serial: string, patch: Partial<PersistentMdmDevice>): PersistentMdmDevice {
  const state = loadMdmState();
  let d = state.devices.find(x => x.number === serial || String(x.id) === serial);
  if (!d) {
    d = {
      id: state.devices.length + 1,
      number: serial,
      name: patch.name || serial,
      model: patch.model || 'Android Tablet',
      configId: patch.configId || 1,
      configName: patch.configName || 'Raytreat Clinic Kiosk',
      configKiosk: patch.configKiosk ?? true,
      oldConfigId: null,
      oldConfigKiosk: false,
      lastUpdate: Date.now(),
      online: true,
      publicIp: patch.publicIp || '10.10.10.171',
      enrollTime: Date.now(),
      battery: patch.battery || null,
      screenWidth: patch.screenWidth || null,
      screenHeight: patch.screenHeight || null,
      targetUrl: patch.targetUrl || 'https://raytreat.com'
    };
    state.devices.push(d);
  } else {
    Object.assign(d, patch);
  }
  saveMdmState(state);
  return d;
}

export function getTargetTabletUrl(): string | null {
  const state = loadMdmState();
  return state.targetTabletUrl;
}

export function setTargetTabletUrl(url: string | null) {
  const state = loadMdmState();
  state.targetTabletUrl = url;
  if (url) {
    for (const d of state.devices) {
      d.targetUrl = url;
    }
  }
  saveMdmState(state);
}

export function recordTabletHeartbeat(body: any, ip?: string): { status: string; timestamp: number; targetUrl: string | null; command?: string | null } {
  const state = loadMdmState();
  const serial = String(body.deviceId || 'apex-lenovo-01');
  const now = Date.now();

  let d = state.devices.find(x => x.number === serial || String(x.id) === serial);
  if (!d) {
    d = {
      id: state.devices.length + 1,
      number: serial,
      name: String(body.name || 'Raytreat Lenovo Kiosk'),
      model: String(body.model || 'Lenovo Tablet (Android Enterprise)'),
      configId: 4,
      configName: 'ApexMDM Full Browser & Recovery',
      configKiosk: false,
      oldConfigId: 1,
      oldConfigKiosk: true,
      lastUpdate: now,
      online: true,
      publicIp: ip || '10.10.10.171',
      enrollTime: now,
      battery: body.battery ?? 18,
      screenWidth: body.screenWidth || null,
      screenHeight: body.screenHeight || null,
      targetUrl: state.targetTabletUrl || 'https://facebook.com/sosvball'
    };
    state.devices.push(d);
  } else {
    d.lastUpdate = now;
    d.online = true;
    if (body.name) d.name = String(body.name);
    if (body.model) d.model = String(body.model);
    if (body.battery !== undefined) d.battery = Number(body.battery);
    if (body.screenWidth) d.screenWidth = Number(body.screenWidth);
    if (body.screenHeight) d.screenHeight = Number(body.screenHeight);
    if (ip) d.publicIp = ip;
  }

  const cmd = d.pendingCommand || null;
  d.pendingCommand = null;

  saveMdmState(state);

  const activeUrl = state.targetTabletUrl || d.targetUrl || 'https://raytreat.com';
  return {
    status: 'ok',
    timestamp: now,
    targetUrl: activeUrl,
    command: cmd
  };
}

export interface QueuedTabletCommand {
  id: string;
  type: string;
  payload?: any;
  createdAt: number;
}

const pendingCommands = new Map<string, QueuedTabletCommand[]>();

export function queueTabletCommand(serial: string, type: string, payload?: any): QueuedTabletCommand {
  const list = pendingCommands.get(serial) || [];
  const cmd: QueuedTabletCommand = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type,
    payload,
    createdAt: Date.now()
  };
  list.push(cmd);
  pendingCommands.set(serial, list);
  return cmd;
}

export function drainTabletCommands(serial: string): QueuedTabletCommand[] {
  const specific = pendingCommands.get(serial) || [];
  pendingCommands.delete(serial);
  const wildcard = pendingCommands.get('*') || [];
  pendingCommands.delete('*');
  const seen = new Set<string>();
  const combined: QueuedTabletCommand[] = [];
  for (const c of [...specific, ...wildcard]) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      combined.push(c);
    }
  }
  return combined;
}
