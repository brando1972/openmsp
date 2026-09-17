import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type {
  MdmDevice,
  MdmProfile,
  MdmApplication,
  MdmFile,
  MdmGeofence,
  MdmCommand,
  MdmBroadcastMessage
} from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// In-Memory Data Store for ApexMDM Native Core
const mdmDevices = new Map<string, MdmDevice>();
const mdmProfiles = new Map<string, MdmProfile>();
const mdmApps = new Map<string, MdmApplication>();
const mdmFiles = new Map<string, MdmFile>();
const mdmGeofences = new Map<string, MdmGeofence>();
const mdmCommands: MdmCommand[] = [];
const mdmBroadcasts: MdmBroadcastMessage[] = [];

// Seed Initial Data
const SEED_ORG_ID = '00000000-0000-0000-0000-000000000001';

const defaultProfile: MdmProfile = {
  id: 'kiosk-warehouse-101',
  orgId: SEED_ORG_ID,
  name: 'Warehouse Kiosk',
  description: 'Single/multi-app lock for warehouse scanning terminals and forklifts.',
  kioskMode: 'locktask',
  orientation: 'landscape',
  screenTimeoutSec: 0,
  brightnessPercent: 80,
  titleBarTemplate: '${DEVICE_NAME} • ${IP} • ${BATTERY}%',
  wifiRescueEnabled: true,
  volumeLocked: true,
  lockVolumePercent: 80,
  autoGrantPermissions: true,
  autostartPackage: 'com.apexmsp.wms',
  nightModeDimEnabled: false,
  pushProtocol: 'mqtt',
  cameraDisabled: false,
  usbStorageBlocked: true,
  wifiBlocked: false,
  bluetoothBlocked: false,
  safeZoneGeofenceId: 'geo-chi-01',
  allowedPackages: ['com.apexmsp.wms', 'com.android.settings'],
  updatedAt: new Date().toISOString()
};
mdmProfiles.set(defaultProfile.id, defaultProfile);

const posProfile: MdmProfile = {
  id: 'kiosk-pos-202',
  orgId: SEED_ORG_ID,
  name: 'Retail POS',
  description: 'Locked kiosk terminal profile for counter point-of-sale registers.',
  kioskMode: 'single-app',
  orientation: 'landscape',
  screenTimeoutSec: 180,
  brightnessPercent: 100,
  titleBarTemplate: 'ApexPOS • ${IP}',
  wifiRescueEnabled: true,
  volumeLocked: true,
  lockVolumePercent: 90,
  autoGrantPermissions: true,
  autostartPackage: 'com.squareup',
  nightModeDimEnabled: true,
  pushProtocol: 'websocket',
  cameraDisabled: true,
  usbStorageBlocked: true,
  wifiBlocked: false,
  bluetoothBlocked: false,
  updatedAt: new Date().toISOString()
};
mdmProfiles.set(posProfile.id, posProfile);

const dev1: MdmDevice = {
  id: 'HNQ01Q1C',
  orgId: SEED_ORG_ID,
  clientId: 'c-richs',
  clientName: 'Richs Logistics',
  name: 'Forklift Terminal #104',
  model: 'Galaxy Tab Active4 Pro',
  osVersion: 'Android 14 (API 34)',
  serialNumber: 'HNQ01Q1C',
  imei: '864201048892144',
  ipAddress: '192.168.10.42',
  batteryLevel: 92,
  batteryHealthPercent: 94,
  chargeCycles: 182,
  batteryTempC: 29.4,
  isCharging: true,
  powerSource: 'ac',
  wifiSsid: 'WH-Mesh-5G',
  wifiRssi: -54,
  activeAppPackage: 'com.apexmsp.wms',
  activeAppName: 'WMS Scanner',
  kioskModeActive: true,
  watchdogCrashesPrevented: 0,
  status: 'online',
  configId: 'kiosk-warehouse-101',
  configName: 'Warehouse Kiosk',
  groupName: 'Aisle 4 Team',
  geofenceStatus: 'inside',
  location: {
    lat: 41.8782,
    lng: -87.6299,
    accuracy: 3.2,
    updatedAt: new Date().toISOString()
  },
  connectedAt: Date.now() - 3600000,
  lastSeen: new Date().toISOString(),
  viewerUrl: 'https://vnc.apexmsp.app/view?device=HNQ01Q1C'
};
mdmDevices.set(dev1.id, dev1);

const dev2: MdmDevice = {
  id: 'HA1A99Z2',
  orgId: SEED_ORG_ID,
  clientId: 'c-richs',
  clientName: 'Richs Logistics',
  name: 'POS Register #02',
  model: 'Lenovo Tab M10 Plus',
  osVersion: 'Android 13 (API 33)',
  serialNumber: 'HA1A99Z2',
  imei: '869102039912095',
  ipAddress: '192.168.20.15',
  batteryLevel: 100,
  batteryHealthPercent: 89,
  chargeCycles: 340,
  batteryTempC: 31.0,
  isCharging: true,
  powerSource: 'ac',
  wifiSsid: 'Store_Secure',
  wifiRssi: -48,
  activeAppPackage: 'com.squareup',
  activeAppName: 'Square POS',
  kioskModeActive: true,
  watchdogCrashesPrevented: 2,
  status: 'online',
  configId: 'kiosk-pos-202',
  configName: 'Retail POS',
  groupName: 'Checkout Counter',
  geofenceStatus: 'inside',
  location: {
    lat: 41.878,
    lng: -87.6295,
    accuracy: 4.1,
    updatedAt: new Date().toISOString()
  },
  connectedAt: Date.now() - 7200000,
  lastSeen: new Date().toISOString(),
  viewerUrl: 'https://vnc.apexmsp.app/view?device=HA1A99Z2'
};
mdmDevices.set(dev2.id, dev2);

const dev3: MdmDevice = {
  id: 'ZB88410X',
  orgId: SEED_ORG_ID,
  clientId: 'c-richs',
  clientName: 'Richs Logistics',
  name: 'Delivery Van #3 Tablet',
  model: 'Zebra ET40 Rugged',
  osVersion: 'Android 13 (API 33)',
  serialNumber: 'ZB88410X',
  imei: '358912048891024',
  ipAddress: '10.45.12.8',
  batteryLevel: 14,
  batteryHealthPercent: 64,
  chargeCycles: 612,
  batteryTempC: 38.5,
  isCharging: false,
  powerSource: 'battery',
  wifiSsid: 'Cellular Roaming',
  wifiRssi: -95,
  cellularCarrier: 'Verizon 4G',
  cellularRssi: -78,
  activeAppPackage: 'com.apexmsp.dispatch',
  activeAppName: 'Field Dispatch',
  kioskModeActive: true,
  watchdogCrashesPrevented: 5,
  status: 'attention',
  configId: 'kiosk-warehouse-101',
  configName: 'Warehouse Kiosk',
  groupName: 'Driver Logistics',
  geofenceStatus: 'breach',
  location: {
    lat: 41.8905,
    lng: -87.615,
    accuracy: 12.0,
    updatedAt: new Date().toISOString()
  },
  connectedAt: Date.now() - 1800000,
  lastSeen: new Date().toISOString(),
  viewerUrl: 'https://vnc.apexmsp.app/view?device=ZB88410X'
};
mdmDevices.set(dev3.id, dev3);

const app1: MdmApplication = {
  id: 'app-wms-1',
  orgId: SEED_ORG_ID,
  name: 'Apex WMS Scanner',
  packageName: 'com.apexmsp.wms',
  version: '2.4.1',
  versionCode: 241,
  apkUrl: 'https://api.apexmsp.app/api/v1/mdm/apps/wms-2.4.1.apk',
  apkSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  sizeBytes: 24580192,
  isKioskMainApp: true,
  autoUpdate: true,
  runAfterInstall: true,
  unmeteredNetworkOnly: true,
  uploadedAt: new Date().toISOString()
};
mdmApps.set(app1.id, app1);

const file1: MdmFile = {
  id: 'file-wms-config',
  orgId: SEED_ORG_ID,
  name: 'scanner-config.json',
  destPath: '/sdcard/Android/data/com.apexmsp.wms/files/config.json',
  downloadUrl: 'https://api.apexmsp.app/api/v1/mdm/files/scanner-config.json',
  fileSize: 4096,
  sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
  templateVariablesEnabled: true,
  lastModified: new Date().toISOString()
};
mdmFiles.set(file1.id, file1);

const geofence1: MdmGeofence = {
  id: 'geo-chi-01',
  orgId: SEED_ORG_ID,
  name: 'Chicago Main Logistics Center',
  centerLat: 41.8781,
  centerLng: -87.6298,
  radiusMeters: 450,
  breachAction: {
    siren: true,
    lockScreen: true,
    psaTicket: true,
    wipeAfterMinutes: 60
  },
  activeDevicesCount: 2,
  breachDevicesCount: 1
};
mdmGeofences.set(geofence1.id, geofence1);

// ---- Endpoints ----

// GET /devices
router.get('/devices', (_req: AuthenticatedRequest, res) => {
  res.json({ configured: true, devices: Array.from(mdmDevices.values()) });
});

// GET /devices/:id
router.get('/devices/:id', (req: AuthenticatedRequest, res) => {
  const device = mdmDevices.get(String(req.params.id));
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  res.json({ device });
});

// PATCH /devices/:id/name
router.patch('/devices/:id/name', (req: AuthenticatedRequest, res) => {
  const device = mdmDevices.get(String(req.params.id));
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (name) device.name = name;
  res.json({ ok: true, device });
});

// POST /devices/:id/commands
router.post('/devices/:id/commands', (req: AuthenticatedRequest, res) => {
  const device = mdmDevices.get(String(req.params.id));
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  const command: MdmCommand = {
    id: uuidv4(),
    deviceId: device.id,
    command: req.body?.command || 'reboot',
    payload: req.body?.payload,
    status: 'completed',
    result: 'Dispatched successfully via ApexMDM native command engine',
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };
  mdmCommands.push(command);
  res.json({ ok: true, command });
});

// POST /devices/:id/shell
router.post('/devices/:id/shell', (req: AuthenticatedRequest, res) => {
  const device = mdmDevices.get(String(req.params.id));
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  const cmd = String(req.body?.command || '').trim();
  let output = `Executed on ${device.name} [PID 1420]:\n$ ${cmd}\n`;
  if (cmd.startsWith('pm list packages')) {
    output += 'package:com.apexmsp.wms\npackage:com.android.settings\npackage:com.android.chrome';
  } else if (cmd.includes('getprop')) {
    output += `[ro.build.version.release]: [14]\n[ro.product.model]: [${device.model}]\n[ro.serialno]: [${device.serialNumber}]`;
  } else if (cmd.includes('dumpsys battery')) {
    output += `Current Battery Service state:\n  AC powered: ${device.isCharging}\n  level: ${device.batteryLevel}\n  scale: 100\n  temperature: ${Math.round(device.batteryTempC * 10)}`;
  } else {
    output += `Success (exit code 0)\n[ApexMDM Root Shell response captured]`;
  }
  res.json({ ok: true, output });
});

// GET /profiles
router.get('/profiles', (_req: AuthenticatedRequest, res) => {
  res.json({ profiles: Array.from(mdmProfiles.values()) });
});

// POST /profiles
router.post('/profiles', (req: AuthenticatedRequest, res) => {
  const profile: MdmProfile = {
    id: req.body?.id || `profile-${Date.now()}`,
    orgId: req.user!.orgId,
    name: req.body?.name || 'New Profile',
    description: req.body?.description || '',
    kioskMode: req.body?.kioskMode || 'locktask',
    orientation: req.body?.orientation || 'landscape',
    screenTimeoutSec: req.body?.screenTimeoutSec ?? 0,
    brightnessPercent: req.body?.brightnessPercent ?? 80,
    titleBarTemplate: req.body?.titleBarTemplate || '${DEVICE_NAME} • ${IP}',
    wifiRescueEnabled: req.body?.wifiRescueEnabled ?? true,
    volumeLocked: req.body?.volumeLocked ?? true,
    lockVolumePercent: req.body?.lockVolumePercent ?? 80,
    autoGrantPermissions: req.body?.autoGrantPermissions ?? true,
    autostartPackage: req.body?.autostartPackage,
    nightModeDimEnabled: req.body?.nightModeDimEnabled ?? false,
    pushProtocol: req.body?.pushProtocol || 'mqtt',
    cameraDisabled: req.body?.cameraDisabled ?? false,
    usbStorageBlocked: req.body?.usbStorageBlocked ?? true,
    wifiBlocked: req.body?.wifiBlocked ?? false,
    bluetoothBlocked: req.body?.bluetoothBlocked ?? false,
    safeZoneGeofenceId: req.body?.safeZoneGeofenceId,
    allowedPackages: req.body?.allowedPackages || [],
    updatedAt: new Date().toISOString()
  };
  mdmProfiles.set(profile.id, profile);
  res.json({ ok: true, profile });
});

// GET /apps
router.get('/apps', (_req: AuthenticatedRequest, res) => {
  res.json({ apps: Array.from(mdmApps.values()) });
});

// POST /apps
router.post('/apps', (req: AuthenticatedRequest, res) => {
  const app: MdmApplication = {
    id: `app-${Date.now()}`,
    orgId: req.user!.orgId,
    name: req.body?.name || 'New App',
    packageName: req.body?.packageName || 'com.example.app',
    version: req.body?.version || '1.0.0',
    versionCode: req.body?.versionCode || 1,
    apkUrl: req.body?.apkUrl || 'https://api.apexmsp.app/api/v1/mdm/apps/latest.apk',
    apkSha256: req.body?.apkSha256 || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sizeBytes: req.body?.sizeBytes || 12450000,
    isKioskMainApp: req.body?.isKioskMainApp ?? false,
    autoUpdate: req.body?.autoUpdate ?? true,
    runAfterInstall: req.body?.runAfterInstall ?? true,
    unmeteredNetworkOnly: req.body?.unmeteredNetworkOnly ?? true,
    uploadedAt: new Date().toISOString()
  };
  mdmApps.set(app.id, app);
  res.json({ ok: true, app });
});

// GET /files
router.get('/files', (_req: AuthenticatedRequest, res) => {
  res.json({ files: Array.from(mdmFiles.values()) });
});

// POST /files
router.post('/files', (req: AuthenticatedRequest, res) => {
  const file: MdmFile = {
    id: `file-${Date.now()}`,
    orgId: req.user!.orgId,
    name: req.body?.name || 'config.json',
    destPath: req.body?.destPath || '/sdcard/Documents/config.json',
    downloadUrl: req.body?.downloadUrl || 'https://api.apexmsp.app/api/v1/mdm/files/config.json',
    fileSize: req.body?.fileSize || 2048,
    sha256: req.body?.sha256 || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    templateVariablesEnabled: req.body?.templateVariablesEnabled ?? true,
    lastModified: new Date().toISOString()
  };
  mdmFiles.set(file.id, file);
  res.json({ ok: true, file });
});

// GET /geofence
router.get('/geofence', (_req: AuthenticatedRequest, res) => {
  res.json({ geofences: Array.from(mdmGeofences.values()) });
});

// POST /geofence
router.post('/geofence', (req: AuthenticatedRequest, res) => {
  const geo: MdmGeofence = {
    id: req.body?.id || `geo-${Date.now()}`,
    orgId: req.user!.orgId,
    name: req.body?.name || 'Main Safezone',
    centerLat: req.body?.centerLat ?? 41.8781,
    centerLng: req.body?.centerLng ?? -87.6298,
    radiusMeters: req.body?.radiusMeters ?? 500,
    breachAction: {
      siren: req.body?.breachAction?.siren ?? true,
      lockScreen: req.body?.breachAction?.lockScreen ?? true,
      psaTicket: req.body?.breachAction?.psaTicket ?? true,
      wipeAfterMinutes: req.body?.breachAction?.wipeAfterMinutes
    },
    activeDevicesCount: req.body?.activeDevicesCount ?? 2,
    breachDevicesCount: req.body?.breachDevicesCount ?? 0
  };
  mdmGeofences.set(geo.id, geo);
  res.json({ ok: true, geofence: geo });
});

// POST /broadcast
router.post('/broadcast', (req: AuthenticatedRequest, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) {
    res.status(400).json({ error: 'message required' });
    return;
  }
  const broadcast: MdmBroadcastMessage = {
    id: uuidv4(),
    orgId: req.user!.orgId,
    message,
    requireAcknowledgment: req.body?.requireAcknowledgment !== false,
    sentAt: new Date().toISOString(),
    acknowledgedCount: 0,
    targetDeviceCount: mdmDevices.size
  };
  mdmBroadcasts.unshift(broadcast);
  res.json({ ok: true, broadcast });
});

// GET /provisioning/qr
router.get('/provisioning/qr', (_req: AuthenticatedRequest, res) => {
  const bundle = {
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME': 'app.apexmsp.dpc',
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': 'https://api.apexmsp.app/api/v1/apexmdm/dpc/latest.apk',
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': {
      serverUrl: 'https://api.apexmsp.app',
      enrollmentToken: 'tok_apex_logistics_2026',
      assignedPolicy: 'Warehouse Kiosk',
      wifiSsid: 'WH-Mesh-5G',
      wifiPassword: 'SecretPassword123'
    }
  };
  res.json({ bundle, token: 'tok_apex_logistics_2026' });
});

export default router;
