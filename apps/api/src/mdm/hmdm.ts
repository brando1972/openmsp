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

/**
 * Create a new configuration ("profile") by cloning an existing one. Copies the
 * base configuration row plus its child rows (applications, app parameters,
 * files), overriding name + kiosk mode on the new row. qrcodekey carries a
 * UNIQUE index so it must be nulled on the copy. Returns the new id/name.
 */
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
       select $2, $3, null${cols.length ? ', ' + colList : ''}
         from configurations where id = $1
       returning id, name`,
      [baseId, name, kioskMode]
    );
    if (!newRow.rows.length) { await client.query('ROLLBACK'); return null; }
    const newId = newRow.rows[0].id;
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
      await client.query(
        `insert into ${child} (configurationid, ${ccList})
         select $2, ${ccList} from ${child} where configurationid = $1`,
        [baseId, newId]
      );
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
