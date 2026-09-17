import pg from 'pg';

/**
 * Headwind MDM (hmdm) read/write client — talks directly to Headwind's Postgres.
 * ---------------------------------------------------------------------------
 * The control plane and Headwind run on the same docker host; the API container
 * is attached to Headwind's docker network, so it reaches the DB at the URL in
 * HMDM_DB_URL (postgres://hmdm:<pw>@postgresql:5432/hmdm). No Headwind admin
 * login is needed for these operations.
 *
 * Used to enrich the Android tablet cards with live telemetry (battery, RAM,
 * network) that the Headwind agent reports via the device-info plugin, and to
 * view/set a device's configuration ("profile").
 */

const { Pool } = pg;

let pool: pg.Pool | null = null;
function getPool(): pg.Pool | null {
  const url = process.env.HMDM_DB_URL;
  if (!url) return null;
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 4000, statement_timeout: 5000, idleTimeoutMillis: 30000 });
    pool.on('error', () => { /* keep process alive on idle client errors */ });
  }
  return pool;
}

export function hmdmConfigured(): boolean {
  return !!process.env.HMDM_DB_URL;
}

export interface HmdmDevice {
  id: number;
  number: string;
  description: string;
  configurationId: number | null;
  model: string;
  lastUpdate: number;
}

export interface HmdmTelemetry {
  batteryLevel: number | null;
  charging: string | null;      // 'charging' | 'discharging' | 'full' | ...
  ramTotalMb: number | null;
  ramAvailMb: number | null;
  wifi: boolean | null;
  mobiledata: boolean | null;
  gps: boolean | null;
  bluetooth: boolean | null;
  ip: string | null;
  ssid: string | null;
  wifiRssi: number | null;
  carrier: string | null;
  mobileRssi: number | null;
  ts: number | null;            // epoch ms of the reading
}

export interface HmdmConfig { id: number; name: string; kioskMode: boolean }

async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const r = await p.query(text, params);
    return r.rows as T[];
  } catch {
    return [];
  }
}

/** Find a Headwind device by its hardware serial (the relay/MDM device id). */
export async function getDeviceBySerial(serial: string): Promise<HmdmDevice | null> {
  if (!serial) return null;
  const rows = await q(
    `select id, number, coalesce(description,'') as description, configurationid, lastupdate,
            coalesce((case when info ~ '^\\s*[{]' then (info::json)->>'model' else null end),'') as model
       from devices
      where info like '%' || $1 || '%' or number = $1
      order by lastupdate desc nulls last
      limit 1`,
    [serial]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, number: r.number, description: r.description, configurationId: r.configurationid ?? null, model: r.model || '', lastUpdate: Number(r.lastupdate) || 0 };
}

/** Latest device-info telemetry for a Headwind device id. */
export async function getTelemetry(deviceId: number): Promise<HmdmTelemetry | null> {
  const recs = await q(
    `select id, ts from plugin_deviceinfo_deviceparams where deviceid = $1 order by ts desc nulls last, id desc limit 1`,
    [deviceId]
  );
  if (!recs.length) return null;
  const recId = recs[0].id;
  const ts = recs[0].ts != null ? Number(recs[0].ts) : null;
  const dev = (await q(`select * from plugin_deviceinfo_deviceparams_device where recordid = $1 limit 1`, [recId]))[0] || {};
  const wifi = (await q(`select ssid, rssi from plugin_deviceinfo_deviceparams_wifi where recordid = $1 limit 1`, [recId]))[0] || {};
  const mob = (await q(`select carrier, rssi from plugin_deviceinfo_deviceparams_mobile where recordid = $1 limit 1`, [recId]))[0] || {};
  return {
    batteryLevel: dev.batterylevel ?? null,
    charging: dev.batterycharging ?? null,
    ramTotalMb: dev.memorytotal ?? null,
    ramAvailMb: dev.memoryavailable ?? null,
    wifi: dev.wifi ?? null,
    mobiledata: dev.mobiledata ?? null,
    gps: dev.gps ?? null,
    bluetooth: dev.bluetooth ?? null,
    ip: dev.ip ?? null,
    ssid: wifi.ssid ?? null,
    wifiRssi: wifi.rssi ?? null,
    carrier: mob.carrier ?? null,
    mobileRssi: mob.rssi ?? null,
    ts
  };
}

/** All Headwind configurations ("profiles"). */
export async function listConfigs(): Promise<HmdmConfig[]> {
  const rows = await q(`select id, name, kioskmode from configurations order by name`);
  return rows.map((r) => ({ id: r.id, name: r.name, kioskMode: !!r.kioskmode }));
}

/** Assign a device to a configuration (change its "profile"). Returns true on success. */
export async function setConfig(deviceId: number, configId: number): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(`update devices set oldconfigurationid = configurationid, configurationid = $2 where id = $1`, [deviceId, configId]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Queue a remote reboot for a device. Headwind delivers this via its push
 * channel (mqtt/polling): we insert a 'reboot' push message and a pending-push
 * row so the agent picks it up on its next contact. Returns true on success.
 */
export async function reboot(deviceId: number): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `insert into pushmessages (messagetype, deviceid, payload) values ('reboot', $1, null) returning id`,
      [deviceId]
    );
    await client.query(
      `insert into pendingpushes (messageid, status, createtime) values ($1, 0, $2)`,
      [r.rows[0].id, Date.now()]
    );
    await client.query('COMMIT');
    return true;
  } catch {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return false;
  } finally {
    client.release();
  }
}

/** Queue a 'configUpdated' push so the device re-pulls its profile immediately (via MQTT). */
export async function syncDevice(deviceId: number): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `insert into pushmessages (messagetype, deviceid, payload) values ('configUpdated', $1, null) returning id`,
      [deviceId]
    );
    await client.query(
      `insert into pendingpushes (messageid, status, createtime) values ($1, 0, $2)`,
      [r.rows[0].id, Date.now()]
    );
    await client.query('COMMIT');
    return true;
  } catch {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return false;
  } finally {
    client.release();
  }
}

/**
 * Create a new configuration ("profile") by cloning an existing one. Copies the
 * base configuration row plus its child rows (applications, app parameters,
 * files), overriding name + kiosk mode on the new row. qrcodekey carries a
 * UNIQUE index so it must be nulled on the copy. Returns the new id/name.
 */
// ---------------------------------------------------------------------------
// Native MDM module — list/detail/create for the in-console (no-iframe) screens.
// ---------------------------------------------------------------------------

export interface HmdmDeviceRow {
  id: number; number: string; name: string; model: string;
  configId: number | null; configName: string | null;
  lastUpdate: number; online: boolean; publicIp: string | null; enrollTime: number | null;
}
const ONLINE_MS = 10 * 60 * 1000;

/** All enrolled devices with their configuration name (native Devices screen). */
export async function listDevices(): Promise<HmdmDeviceRow[]> {
  const rows = await q(
    `select d.id, d.number, coalesce(d.description,'') as description, d.configurationid,
            d.lastupdate, d.enrolltime, d.publicip, c.name as configname,
            coalesce(d.infojson->>'model','') as model
       from devices d
       left join configurations c on c.id = d.configurationid
      order by d.lastupdate desc nulls last`
  );
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id, number: r.number, name: r.description || r.number, model: r.model || '',
    configId: r.configurationid ?? null, configName: r.configname ?? null,
    lastUpdate: Number(r.lastupdate) || 0,
    online: !!r.lastupdate && now - Number(r.lastupdate) < ONLINE_MS,
    publicIp: r.publicip ?? null, enrollTime: r.enrolltime != null ? Number(r.enrolltime) : null
  }));
}

export type TriState = 'any' | 'disabled' | 'enabled';
export interface HmdmConfigPolicy {
  description: string;
  password: string;            // device unlock password
  gps: TriState; bluetooth: TriState; wifi: TriState; mobileData: TriState;
  blockUsbStorage: boolean;    // usbstorage column (true = blocked)
  brightnessMode: 'none' | 'value' | 'auto';
  brightness: number;          // 0-255 when brightnessMode = 'value'
  manageTimeout: boolean; timeout: number;   // screen timeout, seconds
  manageVolume: boolean; volume: number; lockVolume: boolean;
  disableLocation: boolean;
  appPermissions: string;      // '' | GRANTALL | DENYALL
  pushOptions: string;         // '' | mqtt | mqttAlarm | mqttWorker
}

export interface HmdmConfigMdm {
  kioskMode: boolean; kioskScreenOn: boolean; kioskKeyguard: boolean; autostartForeground: boolean;
  kioskHome: boolean; kioskRecents: boolean; kioskNotifications: boolean; kioskSystemInfo: boolean;
  kioskLockButtons: boolean; kioskExit: boolean;
  blockStatusBar: boolean; orientation: 'none' | 'portrait' | 'landscape';
  runDefaultLauncher: boolean; autoUpdate: boolean; disableScreenshots: boolean;
  encryptDevice: boolean; lockSafeSettings: boolean;
}

export interface HmdmConfigDesign {
  useDefault: boolean;               // usedefaultdesignsettings
  backgroundColor: string;           // hex or ''
  textColor: string;                 // hex or ''
  backgroundImageUrl: string;
  iconSize: 'SMALL' | 'LARGE';
  header: 'NO_HEADER' | 'CUSTOM';    // desktopheader
  headerTemplate: string;            // desktopheadertemplate (when header = CUSTOM)
}

export interface HmdmConfigDetail {
  id: number; name: string;
  wifiSsid: string; wifiSecurity: string; wifiPasswordSet: boolean;
  kioskMode: boolean; mobileEnrollment: boolean; qrcodeKey: string | null;
  contentApp: string | null; deviceCount: number;
  startUrl: string | null; adminPin: string | null;
  policy?: HmdmConfigPolicy;   // filled only by getConfig(id)
  design?: HmdmConfigDesign;   // filled only by getConfig(id)
  mdm?: HmdmConfigMdm;         // filled only by getConfig(id)
}

const triToBool = (t?: TriState): boolean | null => (t === 'enabled' ? true : t === 'disabled' ? false : null);
const boolToTri = (v: boolean | null): TriState => (v == null ? 'any' : v ? 'enabled' : 'disabled');

async function configSettings(configId: number): Promise<Record<string, string>> {
  const rows = await q(`select name, value from configurationapplicationsettings where extrefid = $1`, [configId]);
  const m: Record<string, string> = {};
  for (const r of rows) m[r.name] = r.value;
  return m;
}

function detailRow(r: any, settings: Record<string, string>): HmdmConfigDetail {
  return {
    id: r.id, name: r.name,
    wifiSsid: r.wifissid || '', wifiSecurity: r.wifisecuritytype || '', wifiPasswordSet: !!r.wifipwset,
    kioskMode: !!r.kioskmode, mobileEnrollment: !!r.mobileenrollment, qrcodeKey: r.qrcodekey || null,
    contentApp: r.contentapp || null, deviceCount: Number(r.devicecount) || 0,
    startUrl: settings.startUrl ?? null, adminPin: settings.adminPin ?? null
  };
}

const CONFIG_SELECT = `
  select c.id, c.name, c.wifissid, c.wifisecuritytype,
         (c.wifipassword is not null and c.wifipassword <> '') as wifipwset,
         c.kioskmode, c.mobileenrollment, c.qrcodekey,
         (select a.name from applicationversions av join applications a on a.id = av.applicationid
           where av.id = c.contentappid) as contentapp,
         (select count(*) from devices d where d.configurationid = c.id) as devicecount
    from configurations c`;

/** Configurations ("profiles") with WiFi/kiosk/QR + device counts (native list). */
export async function getConfigsDetailed(): Promise<HmdmConfigDetail[]> {
  const rows = await q(`${CONFIG_SELECT} order by c.name`);
  const out: HmdmConfigDetail[] = [];
  for (const r of rows) out.push(detailRow(r, await configSettings(r.id)));
  return out;
}

export async function getConfig(id: number): Promise<HmdmConfigDetail | null> {
  const rows = await q(`${CONFIG_SELECT} where c.id = $1`, [id]);
  if (!rows.length) return null;
  const detail = detailRow(rows[0], await configSettings(id));
  const pr = await q(
    `select description, password, gps, bluetooth, wifi, mobiledata, usbstorage,
            autobrightness, brightness, managetimeout, timeout, managevolume, volume, lockvolume,
            disablelocation, apppermissions, pushoptions,
            usedefaultdesignsettings, backgroundcolor, textcolor, backgroundimageurl,
            iconsize, desktopheader, desktopheadertemplate,
            kioskmode, kioskscreenon, kioskkeyguard, autostartforeground, kioskhome, kioskrecents,
            kiosknotifications, kiosksysteminfo, kiosklockbuttons, kioskexit, blockstatusbar,
            orientation, rundefaultlauncher, autoupdate, disablescreenshots, encryptdevice, locksafesettings
       from configurations where id = $1`, [id]
  );
  if (pr.length) {
    const r = pr[0];
    detail.mdm = {
      kioskMode: r.kioskmode === true, kioskScreenOn: r.kioskscreenon === true,
      kioskKeyguard: r.kioskkeyguard === true, autostartForeground: r.autostartforeground === true,
      kioskHome: r.kioskhome === true, kioskRecents: r.kioskrecents === true,
      kioskNotifications: r.kiosknotifications === true, kioskSystemInfo: r.kiosksysteminfo === true,
      kioskLockButtons: r.kiosklockbuttons === true, kioskExit: r.kioskexit === true,
      blockStatusBar: r.blockstatusbar === true,
      orientation: r.orientation === 1 ? 'portrait' : r.orientation === 2 ? 'landscape' : 'none',
      runDefaultLauncher: r.rundefaultlauncher === true, autoUpdate: r.autoupdate === true,
      disableScreenshots: r.disablescreenshots === true, encryptDevice: r.encryptdevice === true,
      lockSafeSettings: r.locksafesettings === true
    };
    detail.design = {
      useDefault: r.usedefaultdesignsettings !== false,
      backgroundColor: r.backgroundcolor || '',
      textColor: r.textcolor || '',
      backgroundImageUrl: r.backgroundimageurl || '',
      iconSize: r.iconsize === 'LARGE' ? 'LARGE' : 'SMALL',
      header: r.desktopheader === 'CUSTOM' ? 'CUSTOM' : 'NO_HEADER',
      headerTemplate: r.desktopheadertemplate || ''
    };
    detail.policy = {
      description: r.description || '',
      password: r.password || '',
      gps: boolToTri(r.gps), bluetooth: boolToTri(r.bluetooth), wifi: boolToTri(r.wifi), mobileData: boolToTri(r.mobiledata),
      blockUsbStorage: r.usbstorage === true,
      brightnessMode: r.autobrightness === true ? 'auto' : r.autobrightness === false ? 'value' : 'none',
      brightness: r.brightness != null ? Number(r.brightness) : 180,
      manageTimeout: !!r.managetimeout, timeout: r.timeout != null ? Number(r.timeout) : 60,
      manageVolume: !!r.managevolume, volume: r.volume != null ? Number(r.volume) : 0, lockVolume: !!r.lockvolume,
      disableLocation: !!r.disablelocation,
      appPermissions: r.apppermissions || '',
      pushOptions: r.pushoptions || ''
    };
  }
  return detail;
}

/** Upsert a kiosk-app managed setting (startUrl / adminPin) on a configuration. */
async function upsertSetting(client: pg.PoolClient, configId: number, appId: number | null, key: string, value: string) {
  const upd = await client.query(
    `update configurationapplicationsettings set value = $3, type = 'STRING', lastupdate = $4
       where extrefid = $1 and name = $2`,
    [configId, key, value, Date.now()]
  );
  if (upd.rowCount === 0 && appId != null) {
    await client.query(
      `insert into configurationapplicationsettings (applicationid, name, type, value, extrefid, lastupdate)
       values ($1, $2, 'STRING', $3, $4, $5)`,
      [appId, key, value, configId, Date.now()]
    );
  }
}

export interface CreateConfigInput {
  name: string; wifiSsid?: string; wifiPassword?: string; wifiSecurity?: string;
  startUrl?: string; adminPin?: string; baseId?: number;
}

/**
 * Create a new configuration by cloning the proven kiosk template (default id 4,
 * which carries the launcher+kiosk apps, boot flags and app settings wired
 * correctly), then applying WiFi + start-URL + admin-PIN and minting a fresh QR
 * key + self-registration. Returns the new id + qrcodeKey. This keeps us clear
 * of Headwind's provisioning landmines (main app = launcher, etc.).
 */
export async function createConfig(input: CreateConfigInput): Promise<{ id: number; qrcodeKey: string } | null> {
  const p = getPool();
  if (!p) return null;
  const base = input.baseId ?? 4;
  const cloned = await cloneConfig(base, input.name, true);
  if (!cloned) return null;
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `update configurations
          set wifissid = $2, wifipassword = $3, wifisecuritytype = $4,
              mobileenrollment = true,
              qrcodekey = md5(random()::text || clock_timestamp()::text || $1::text)
        where id = $1
      returning qrcodekey`,
      [cloned.id, input.wifiSsid || null, input.wifiPassword || null, input.wifiSecurity || 'WPA']
    );
    const appRow = await client.query(
      `select applicationid from configurationapplicationsettings where extrefid = $1 order by id limit 1`,
      [cloned.id]
    );
    const appId: number | null = appRow.rows[0]?.applicationid ?? null;
    if (input.startUrl) await upsertSetting(client, cloned.id, appId, 'startUrl', input.startUrl);
    if (input.adminPin) await upsertSetting(client, cloned.id, appId, 'adminPin', input.adminPin);
    await client.query('COMMIT');
    return { id: cloned.id, qrcodeKey: r.rows[0].qrcodekey };
  } catch {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return null;
  } finally {
    client.release();
  }
}

export interface UpdateConfigInput {
  wifiSsid?: string; wifiPassword?: string; wifiSecurity?: string; startUrl?: string; adminPin?: string;
  policy?: Partial<HmdmConfigPolicy>;
  design?: Partial<HmdmConfigDesign>;
  mdm?: Partial<HmdmConfigMdm>;
}
export async function updateConfig(id: number, input: UpdateConfigInput): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    if (input.wifiSsid !== undefined || input.wifiSecurity !== undefined || input.wifiPassword !== undefined) {
      await client.query(
        `update configurations set
           wifissid = coalesce($2, wifissid),
           wifisecuritytype = coalesce($3, wifisecuritytype),
           wifipassword = case when $4::text is not null and $4 <> '' then $4 else wifipassword end
         where id = $1`,
        [id, input.wifiSsid ?? null, input.wifiSecurity ?? null, input.wifiPassword ?? null]
      );
    }
    const pol = input.policy;
    if (pol) {
      const autobrightness = pol.brightnessMode === undefined ? undefined
        : pol.brightnessMode === 'auto' ? true : pol.brightnessMode === 'value' ? false : null;
      await client.query(
        `update configurations set
           description    = coalesce($2, description),
           password       = coalesce($3, password),
           gps            = $4,  bluetooth = $5, wifi = $6, mobiledata = $7,
           usbstorage     = $8,
           autobrightness = $9,  brightness = coalesce($10, brightness),
           managetimeout  = coalesce($11, managetimeout), timeout = coalesce($12, timeout),
           managevolume   = coalesce($13, managevolume), volume = coalesce($14, volume),
           lockvolume     = coalesce($15, lockvolume),
           disablelocation= coalesce($16, disablelocation),
           apppermissions = coalesce($17, apppermissions),
           pushoptions    = coalesce($18, pushoptions)
         where id = $1`,
        [
          id,
          pol.description ?? null,
          pol.password ?? null,
          triToBool(pol.gps), triToBool(pol.bluetooth), triToBool(pol.wifi), triToBool(pol.mobileData),
          pol.blockUsbStorage === undefined ? null : (pol.blockUsbStorage ? true : null),
          autobrightness,
          pol.brightnessMode === 'value' ? (pol.brightness ?? null) : null,
          pol.manageTimeout ?? null, pol.manageTimeout ? (pol.timeout ?? null) : null,
          pol.manageVolume ?? null, pol.manageVolume ? (pol.volume ?? null) : null,
          pol.lockVolume ?? null,
          pol.disableLocation ?? null,
          pol.appPermissions ?? null,
          pol.pushOptions ?? null
        ]
      );
    }
    const des = input.design;
    if (des) {
      const header = des.header === 'CUSTOM' ? 'CUSTOM' : des.header === 'NO_HEADER' ? 'NO_HEADER' : undefined;
      await client.query(
        `update configurations set
           usedefaultdesignsettings = coalesce($2, usedefaultdesignsettings),
           backgroundcolor      = coalesce($3, backgroundcolor),
           textcolor            = coalesce($4, textcolor),
           backgroundimageurl   = coalesce($5, backgroundimageurl),
           iconsize             = coalesce($6, iconsize),
           desktopheader        = coalesce($7, desktopheader),
           desktopheadertemplate= coalesce($8, desktopheadertemplate)
         where id = $1`,
        [
          id,
          des.useDefault ?? null,
          des.backgroundColor ?? null,
          des.textColor ?? null,
          des.backgroundImageUrl ?? null,
          des.iconSize === 'LARGE' || des.iconSize === 'SMALL' ? des.iconSize : null,
          header,
          des.headerTemplate ?? null
        ]
      );
    }
    const m = input.mdm;
    if (m) {
      const orient = m.orientation === 'portrait' ? 1 : m.orientation === 'landscape' ? 2 : m.orientation === 'none' ? 0 : undefined;
      await client.query(
        `update configurations set
           kioskmode          = coalesce($2, kioskmode),
           kioskscreenon      = coalesce($3, kioskscreenon),
           kioskkeyguard      = coalesce($4, kioskkeyguard),
           autostartforeground= coalesce($5, autostartforeground),
           kioskhome          = coalesce($6, kioskhome),
           kioskrecents       = coalesce($7, kioskrecents),
           kiosknotifications = coalesce($8, kiosknotifications),
           kiosksysteminfo    = coalesce($9, kiosksysteminfo),
           kiosklockbuttons   = coalesce($10, kiosklockbuttons),
           kioskexit          = coalesce($11, kioskexit),
           blockstatusbar     = coalesce($12, blockstatusbar),
           orientation        = coalesce($13, orientation),
           rundefaultlauncher = coalesce($14, rundefaultlauncher),
           autoupdate         = coalesce($15, autoupdate),
           disablescreenshots = coalesce($16, disablescreenshots),
           encryptdevice      = coalesce($17, encryptdevice),
           locksafesettings   = coalesce($18, locksafesettings)
         where id = $1`,
        [
          id,
          m.kioskMode ?? null, m.kioskScreenOn ?? null, m.kioskKeyguard ?? null, m.autostartForeground ?? null,
          m.kioskHome ?? null, m.kioskRecents ?? null, m.kioskNotifications ?? null, m.kioskSystemInfo ?? null,
          m.kioskLockButtons ?? null, m.kioskExit ?? null, m.blockStatusBar ?? null,
          orient ?? null,
          m.runDefaultLauncher ?? null, m.autoUpdate ?? null, m.disableScreenshots ?? null,
          m.encryptDevice ?? null, m.lockSafeSettings ?? null
        ]
      );
    }
    const appRow = await client.query(
      `select applicationid from configurationapplicationsettings where extrefid = $1 order by id limit 1`, [id]
    );
    const appId: number | null = appRow.rows[0]?.applicationid ?? null;
    if (input.startUrl !== undefined) await upsertSetting(client, id, appId, 'startUrl', input.startUrl);
    if (input.adminPin !== undefined) await upsertSetting(client, id, appId, 'adminPin', input.adminPin);
    await client.query('COMMIT');
    return true;
  } catch {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return false;
  } finally {
    client.release();
  }
}

export interface HmdmApp { id: number; pkg: string; name: string; system: boolean; useKiosk: boolean; version: string | null; url: string | null; }
export async function listApplications(): Promise<HmdmApp[]> {
  const rows = await q(
    `select a.id, a.pkg, coalesce(a.name,'') as name, coalesce(a.system,false) as system,
            coalesce(a.usekiosk,false) as usekiosk, av.version, av.url
       from applications a
       left join applicationversions av on av.id = a.latestversion
      order by a.system nulls first, a.name`
  );
  return rows.map((r) => ({ id: r.id, pkg: r.pkg, name: r.name || r.pkg, system: !!r.system, useKiosk: !!r.usekiosk, version: r.version ?? null, url: r.url ?? null }));
}

export interface HmdmFile { id: number; description: string; devicePath: string; url: string | null; external: boolean; }
export async function listFiles(): Promise<HmdmFile[]> {
  const rows = await q(
    `select id, coalesce(description,'') as description, coalesce(devicepath,'') as devicepath,
            external, externalurl, filepath
       from uploadedfiles order by uploadtime desc nulls last, id desc`
  );
  return rows.map((r) => ({ id: r.id, description: r.description, devicePath: r.devicepath, url: r.external ? (r.externalurl || null) : (r.filepath || null), external: !!r.external }));
}

export async function cloneConfig(baseId: number, name: string, kioskMode: boolean): Promise<{ id: number; name: string } | null> {
  const p = getPool();
  if (!p) return null;
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    // Column list for configurations minus the identity/unique columns we override.
    const colRows = await client.query(
      `select column_name from information_schema.columns
        where table_name = 'configurations'
          and column_name not in ('id','name','kioskmode','qrcodekey')
        order by ordinal_position`
    );
    const cols = colRows.rows.map((r: any) => `"${r.column_name}"`);
    const colList = cols.join(', ');
    const newRow = await client.query(
      `insert into configurations (name, kioskmode, qrcodekey${cols.length ? ', ' + colList : ''})
       select $2, $3, md5(random()::text || clock_timestamp()::text)${cols.length ? ', ' + colList : ''}
         from configurations where id = $1
       returning id, name`,
      [baseId, name, kioskMode]
    );
    if (!newRow.rows.length) { await client.query('ROLLBACK'); return null; }
    const newId = newRow.rows[0].id;
    // Headwind seeds many rows with explicit ids, leaving the id sequences behind
    // max(id); a clone that omits id then collides. Resync each table's sequence first.
    const resyncSeq = async (tbl: string) => {
      await client.query(
        `select setval(pg_get_serial_sequence('${tbl}', 'id'), (select coalesce(max(id), 1) from ${tbl}))`
      );
    };
    // Clone child tables that reference configurationid (skip the id PK column).
    for (const child of ['configurationapplications', 'configurationapplicationparameters', 'configurationfiles']) {
      const cc = await client.query(
        `select column_name from information_schema.columns
          where table_name = $1 and column_name not in ('id','configurationid')
          order by ordinal_position`,
        [child]
      );
      const ccols = cc.rows.map((r: any) => `"${r.column_name}"`);
      if (!ccols.length) continue;
      const ccList = ccols.join(', ');
      await resyncSeq(child);
      await client.query(
        `insert into ${child} (configurationid, ${ccList})
         select $2, ${ccList} from ${child} where configurationid = $1`,
        [baseId, newId]
      );
    }
    // configurationapplicationsettings links to the config via extrefid (not configurationid),
    // so it isn't caught by the loop above. It holds the kiosk app's startUrl / adminPin and the
    // relay agent's relayBase / agentToken, so clone it too — otherwise a new profile has no
    // settings row (startUrl can't be saved, and remote-in details are missing).
    {
      const sc = await client.query(
        `select column_name from information_schema.columns
          where table_name = 'configurationapplicationsettings' and column_name not in ('id','extrefid')
          order by ordinal_position`
      );
      const scols = sc.rows.map((r: any) => `"${r.column_name}"`);
      if (scols.length) {
        const scList = scols.join(', ');
        await resyncSeq('configurationapplicationsettings');
        await client.query(
          `insert into configurationapplicationsettings (extrefid, ${scList})
           select $2, ${scList} from configurationapplicationsettings where extrefid = $1`,
          [baseId, newId]
        );
      }
    }
    await client.query('COMMIT');
    return { id: newId, name: newRow.rows[0].name };
  } catch {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return null;
  } finally {
    client.release();
  }
}

// ---- Per-configuration application assignment (native Applications tab) -----
export interface HmdmConfigApp {
  applicationId: number; pkg: string; name: string; version: string | null;
  system: boolean; showIcon: boolean; remove: boolean; url: string | null;
}

/** Apps assigned to a configuration, custom (uploaded) apps first, then system packages. */
export async function getConfigApps(configId: number): Promise<HmdmConfigApp[]> {
  const rows = await q(
    `select a.id as applicationid, a.pkg, coalesce(a.name,'') as name,
            coalesce(a.system,false) as system,
            coalesce(ca.showicon,false) as showicon, coalesce(ca.remove,false) as remove,
            av.version, av.url
       from configurationapplications ca
       join applications a on a.id = ca.applicationid
       left join applicationversions av on av.id = coalesce(ca.applicationversionid, a.latestversion)
      where ca.configurationid = $1
      order by coalesce(a.system,false), a.name`,
    [configId]
  );
  return rows.map((r) => ({
    applicationId: r.applicationid, pkg: r.pkg, name: r.name || r.pkg,
    system: !!r.system, showIcon: !!r.showicon, remove: !!r.remove,
    version: r.version ?? null, url: r.url ?? null
  }));
}

/** Repository apps not yet assigned to a configuration (for the "add app" picker). */
export async function getAvailableApps(configId: number): Promise<HmdmApp[]> {
  const rows = await q(
    `select a.id, a.pkg, coalesce(a.name,'') as name, coalesce(a.system,false) as system,
            coalesce(a.usekiosk,false) as usekiosk, av.version, av.url
       from applications a
       left join applicationversions av on av.id = a.latestversion
      where a.id not in (select applicationid from configurationapplications where configurationid = $1)
      order by a.system nulls first, a.name`,
    [configId]
  );
  return rows.map((r) => ({ id: r.id, pkg: r.pkg, name: r.name || r.pkg, system: !!r.system, useKiosk: !!r.usekiosk, version: r.version ?? null, url: r.url ?? null }));
}

/** Assign an app to a configuration (idempotent). Uses the app's latest version, action=install. */
export async function addConfigApp(configId: number, applicationId: number): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(
      `insert into configurationapplications (configurationid, applicationid, applicationversionid, action, showicon, remove)
       select $1, $2, a.latestversion, 1, false, false from applications a where a.id = $2
       on conflict do nothing`,
      [configId, applicationId]
    );
    return true;
  } catch { return false; }
}

export async function removeConfigApp(configId: number, applicationId: number): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(`delete from configurationapplications where configurationid = $1 and applicationid = $2`, [configId, applicationId]);
    return true;
  } catch { return false; }
}

/** Toggle per-app flags (showIcon / remove) for an assigned app. */
export async function setConfigApp(configId: number, applicationId: number, flags: { showIcon?: boolean; remove?: boolean }): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(
      `update configurationapplications set
         showicon = coalesce($3, showicon),
         remove   = coalesce($4, remove)
       where configurationid = $1 and applicationid = $2`,
      [configId, applicationId, flags.showIcon ?? null, flags.remove ?? null]
    );
    return true;
  } catch { return false; }
}

// ---- Per-configuration file push (native Files tab) ------------------------
export interface HmdmConfigFile { fileId: number; name: string; devicePath: string; remove: boolean; url: string | null; }

/** Files pushed to devices by a configuration. */
export async function getConfigFiles(configId: number): Promise<HmdmConfigFile[]> {
  const rows = await q(
    `select cf.fileid,
            coalesce(nullif(cf.description,''), uf.description, uf.filepath, '') as name,
            coalesce(cf.devicepath,'') as devicepath, coalesce(cf.remove,false) as remove,
            coalesce(cf.externalurl, uf.externalurl, cf.filepath, uf.filepath) as url
       from configurationfiles cf
       left join uploadedfiles uf on uf.id = cf.fileid
      where cf.configurationid = $1
      order by name`,
    [configId]
  );
  return rows.map((r) => ({ fileId: r.fileid, name: r.name || `file ${r.fileid}`, devicePath: r.devicepath, remove: !!r.remove, url: r.url ?? null }));
}

/** Repository files not yet assigned to a configuration. */
export async function getAvailableFiles(configId: number): Promise<{ id: number; name: string; devicePath: string }[]> {
  const rows = await q(
    `select uf.id, coalesce(nullif(uf.description,''), uf.filepath, '') as name, coalesce(uf.devicepath,'') as devicepath
       from uploadedfiles uf
      where uf.id not in (select fileid from configurationfiles where configurationid = $1 and fileid is not null)
      order by name`,
    [configId]
  );
  return rows.map((r) => ({ id: r.id, name: r.name || `file ${r.id}`, devicePath: r.devicepath }));
}

/** Assign a repository file to a configuration; copies its metadata, optional devicePath override. */
export async function addConfigFile(configId: number, fileId: number, devicePath?: string): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(
      `insert into configurationfiles (configurationid, fileid, description, devicepath, filepath, externalurl, checksum, remove, replacevariables, lastupdate)
       select $1, uf.id, uf.description,
              coalesce(nullif($3,''), uf.devicepath), uf.filepath, uf.externalurl, null, false,
              coalesce(uf.replacevariables,false), $4
         from uploadedfiles uf where uf.id = $2`,
      [configId, fileId, devicePath ?? '', Date.now()]
    );
    return true;
  } catch { return false; }
}

export async function removeConfigFile(configId: number, fileId: number): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(`delete from configurationfiles where configurationid = $1 and fileid = $2`, [configId, fileId]);
    return true;
  } catch { return false; }
}

/** Update an assigned file's device path / remove flag. */
export async function setConfigFile(configId: number, fileId: number, patch: { devicePath?: string; remove?: boolean }): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(
      `update configurationfiles set
         devicepath = coalesce($3, devicepath),
         remove     = coalesce($4, remove),
         lastupdate = $5
       where configurationid = $1 and fileid = $2`,
      [configId, fileId, patch.devicePath ?? null, patch.remove ?? null, Date.now()]
    );
    return true;
  } catch { return false; }
}
