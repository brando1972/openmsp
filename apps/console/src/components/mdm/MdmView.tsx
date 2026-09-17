import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useApp } from '../../data/AppContext';
import { api } from '../../services/api';
import type { NativeMdmDevice, NativeMdmConfig, NativeMdmApp, NativeMdmFile, NativeMdmOverview } from '../../services/api';
import {
  Smartphone, Monitor, Wifi, RefreshCw, Plus, X, ExternalLink, Loader2, Settings as SettingsIcon,
  AppWindow, FolderOpen, LayoutDashboard, Power, QrCode, Pencil, Search, ShieldCheck, CircleDot, Package
} from 'lucide-react';

/* ==========================================================================
   MDM Management — native, no-iframe console module over the Headwind data
   layer. Sub-view selected by the sidebar (activeSubRailView = mdm-*). A single
   "Open ApexMDM" new-tab escape hatch covers the long tail we haven't built
   natively yet; it goes away once every feature is native (Headwind stays fully
   hidden behind the console).
   ========================================================================== */

const MDM_TINT = '#d946ef';
const HMDM_ADMIN = 'https://android.apexmsp.app';

function timeAgo(ms?: number | null) {
  if (!ms) return '—';
  const d = Date.now() - ms;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

const SECTION_LABEL: Record<string, string> = {
  'mdm-summary': 'Overview', 'mdm-devices': 'Devices', 'mdm-applications': 'Applications',
  'mdm-configurations': 'Configurations', 'mdm-files': 'Files', 'mdm-settings': 'Settings'
};

export const MdmView: React.FC = () => {
  const { activeSubRailView } = useApp();
  const section = SECTION_LABEL[activeSubRailView] ? activeSubRailView : 'mdm-summary';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f4f6f8]">
      <div className="shrink-0 flex items-center gap-2 px-5 h-12 border-b border-slate-200 bg-white">
        <Smartphone className="w-4 h-4" style={{ color: MDM_TINT }} />
        <div className="text-sm font-bold text-slate-800">MDM Management</div>
        <span className="text-slate-300">/</span>
        <div className="text-sm text-slate-500">{SECTION_LABEL[section]}</div>
        <a
          href={`${HMDM_ADMIN}/#/summary`} target="_blank" rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-md px-2.5 py-1.5 bg-white"
          title="Open the full ApexMDM admin (temporary — for tasks not yet native)"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open ApexMDM
        </a>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {section === 'mdm-summary' && <Overview />}
        {section === 'mdm-devices' && <DevicesView />}
        {section === 'mdm-applications' && <AppsView />}
        {section === 'mdm-configurations' && <ConfigsView />}
        {section === 'mdm-files' && <FilesView />}
        {section === 'mdm-settings' && <SettingsPlaceholder />}
      </div>
    </div>
  );
};

// ---- shared bits ------------------------------------------------------------
const Spinner = () => <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>;

const StatusDot: React.FC<{ online: boolean }> = ({ online }) => (
  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${online ? 'text-emerald-600' : 'text-slate-400'}`}>
    <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} /> {online ? 'Online' : 'Offline'}
  </span>
);

// ---- Overview ---------------------------------------------------------------
const Overview: React.FC = () => {
  const [data, setData] = useState<NativeMdmOverview | null>(null);
  useEffect(() => { api.mdm.native.overview().then(setData).catch(() => setData(null)); }, []);
  if (!data) return <Spinner />;
  const stats = [
    { label: 'Enrolled devices', value: data.deviceCount, Icon: Smartphone, tint: MDM_TINT },
    { label: 'Online now', value: data.onlineCount, Icon: CircleDot, tint: '#22c55e' },
    { label: 'Configurations', value: data.configCount, Icon: SettingsIcon, tint: '#6366f1' },
    { label: 'Applications', value: data.appCount, Icon: Package, tint: '#f59e0b' }
  ];
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.tint}1f` }}><s.Icon className="w-4 h-4" style={{ color: s.tint }} /></span>
              <div className="text-3xl font-black text-slate-800 tabular-nums ml-auto">{s.value}</div>
            </div>
            <div className="text-xs text-slate-500 mt-2">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-sm font-bold text-slate-700">Recent devices</div>
        {data.recent.length === 0 ? <div className="text-center text-slate-400 text-sm py-8">No devices enrolled yet.</div> : (
          <div className="divide-y divide-slate-100">
            {data.recent.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                <Smartphone className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 truncate">{d.name}</div>
                  <div className="text-[11px] text-slate-400">{d.model || '—'} · {d.configName || 'No profile'}</div>
                </div>
                <StatusDot online={d.online} />
                <div className="text-[11px] text-slate-400 w-16 text-right">{timeAgo(d.lastUpdate)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---- Devices ----------------------------------------------------------------
const DevicesView: React.FC = () => {
  const [devices, setDevices] = useState<NativeMdmDevice[] | null>(null);
  const [configs, setConfigs] = useState<NativeMdmConfig[]>([]);
  const [open, setOpen] = useState<NativeMdmDevice | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => { api.mdm.native.devices().then((r) => setDevices(r.devices)).catch(() => setDevices([])); }, []);
  useEffect(() => { load(); api.mdm.native.configurations().then((r) => setConfigs(r.configurations)).catch(() => {}); }, [load]);

  if (!devices) return <Spinner />;
  const filtered = devices.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.model.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search devices…"
            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-fuchsia-300" />
        </div>
        <div className="text-xs text-slate-400 ml-auto">{devices.length} enrolled</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
          <div>Device</div><div>Profile</div><div>Status</div><div>Last seen</div>
        </div>
        <div className="divide-y divide-slate-100">
          {filtered.map((d) => (
            <button key={d.id} onClick={() => setOpen(d)} className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 items-center text-left hover:bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <Smartphone className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{d.name}</div>
                  <div className="text-[11px] text-slate-400 truncate">{d.model || '—'}</div>
                </div>
              </div>
              <div className="text-xs text-slate-600">{d.configName || <span className="text-slate-300">None</span>}</div>
              <StatusDot online={d.online} />
              <div className="text-[11px] text-slate-400 w-16 text-right">{timeAgo(d.lastUpdate)}</div>
            </button>
          ))}
          {filtered.length === 0 && <div className="text-center text-slate-400 text-sm py-8">No devices.</div>}
        </div>
      </div>
      {open && <DeviceDrawer device={open} configs={configs} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
};

const DeviceDrawer: React.FC<{ device: NativeMdmDevice; configs: NativeMdmConfig[]; onClose: () => void; onChanged: () => void }> = ({ device, configs, onClose, onChanged }) => {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const doReboot = async () => { setBusy('reboot'); try { await api.mdm.reboot(device.number); setMsg('Reboot queued — the tablet reboots on its next check-in.'); } catch { setMsg('Could not queue reboot.'); } finally { setBusy(''); } };
  const setProfile = async (configId: number) => { setBusy('profile'); try { await api.mdm.setProfile(device.number, configId); setMsg('Profile updated.'); onChanged(); } catch { setMsg('Could not set profile.'); } finally { setBusy(''); } };
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onMouseDown={onClose}>
      <div className="w-96 max-w-full h-full bg-white shadow-xl flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="shrink-0 flex items-center gap-2 px-4 h-12 border-b border-slate-200">
          <Smartphone className="w-4 h-4" style={{ color: MDM_TINT }} />
          <div className="text-sm font-bold truncate flex-1">{device.name}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          <div className="flex items-center gap-2"><StatusDot online={device.online} /><span className="text-slate-400 text-xs">· {timeAgo(device.lastUpdate)}</span></div>
          <Fact label="Model" value={device.model || '—'} />
          <Fact label="Serial" value={device.number} mono />
          <Fact label="Profile" value={device.configName || 'None'} />
          <Fact label="Public IP" value={device.publicIp || '—'} mono />
          <Fact label="Enrolled" value={device.enrollTime ? new Date(device.enrollTime).toLocaleDateString() : '—'} />

          <div className="pt-2">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Assign profile</div>
            <select value={device.configId ?? ''} onChange={(e) => e.target.value && setProfile(parseInt(e.target.value, 10))} disabled={busy === 'profile'}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Select…</option>
              {configs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.kioskMode ? ' · kiosk' : ''}</option>)}
            </select>
          </div>

          <button onClick={doReboot} disabled={busy === 'reboot'}
            className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-60">
            {busy === 'reboot' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />} Reboot device
          </button>
          {msg && <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{msg}</div>}
        </div>
      </div>
    </div>
  );
};

const Fact: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</span>
    <span className={`text-sm text-slate-700 text-right truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
  </div>
);

// ---- Configurations ---------------------------------------------------------
const ConfigsView: React.FC = () => {
  const [configs, setConfigs] = useState<NativeMdmConfig[] | null>(null);
  const [qrBase, setQrBase] = useState(HMDM_ADMIN);
  const [creating, setCreating] = useState(false);
  const [qrFor, setQrFor] = useState<NativeMdmConfig | null>(null);
  const [editing, setEditing] = useState<NativeMdmConfig | null>(null);

  const load = useCallback(() => { api.mdm.native.configurations().then((r) => { setConfigs(r.configurations); setQrBase(r.qrBase); }).catch(() => setConfigs([])); }, []);
  useEffect(() => { load(); }, [load]);
  if (!configs) return <Spinner />;

  return (
    <div className="p-5">
      <div className="flex items-center mb-3">
        <div className="text-sm font-bold text-slate-700">Configurations <span className="text-slate-400 font-normal">({configs.length})</span></div>
        <button onClick={() => setCreating(true)} className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-2" style={{ background: MDM_TINT }}>
          <Plus className="w-4 h-4" /> New configuration
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {configs.map((c) => (
          <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${MDM_TINT}1f` }}><SettingsIcon className="w-4 h-4" style={{ color: MDM_TINT }} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-800 truncate">{c.name}</div>
                <div className="text-[11px] text-slate-400">{c.deviceCount} device{c.deviceCount === 1 ? '' : 's'}{c.contentApp ? ` · ${c.contentApp}` : ''}</div>
              </div>
              {c.kioskMode && <span className="text-[10px] font-bold text-fuchsia-700 bg-fuchsia-50 rounded px-1.5 py-0.5">KIOSK</span>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><Wifi className="w-3 h-3" /> {c.wifiSsid || '—'}{c.wifiSsid ? ` (${c.wifiSecurity || 'open'})` : ''}</span>
              {c.startUrl && <span className="truncate max-w-[60%]">URL: {c.startUrl}</span>}
              <span className={c.mobileEnrollment ? 'text-emerald-600' : ''}>{c.mobileEnrollment ? 'Self-register on' : 'Self-register off'}</span>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setQrFor(c)} disabled={!c.qrcodeKey}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40">
                <QrCode className="w-3.5 h-3.5" /> Enrollment QR
              </button>
              <button onClick={() => setEditing(c)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            </div>
          </div>
        ))}
      </div>
      {creating && <ConfigWizard onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); load(); setQrFor(c); }} qrBase={qrBase} />}
      {editing && <ConfigWizard existing={editing} onClose={() => setEditing(null)} onCreated={() => { setEditing(null); load(); }} qrBase={qrBase} />}
      {qrFor && qrFor.qrcodeKey && <QrModal name={qrFor.name} url={`${qrBase}/rest/public/qr/${qrFor.qrcodeKey}?size=600&create=1`} wifi={qrFor.wifiSsid} onClose={() => setQrFor(null)} />}
    </div>
  );
};

const ConfigWizard: React.FC<{ existing?: NativeMdmConfig; onClose: () => void; onCreated: (c: NativeMdmConfig) => void; qrBase: string }> = ({ existing, onClose, onCreated, qrBase }) => {
  const [name, setName] = useState(existing?.name || '');
  const [wifiSsid, setWifiSsid] = useState(existing?.wifiSsid || '');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiSecurity, setWifiSecurity] = useState(existing?.wifiSecurity || 'WPA');
  const [startUrl, setStartUrl] = useState(existing?.startUrl || '');
  const [adminPin, setAdminPin] = useState(existing?.adminPin || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = !!existing;

  const submit = async () => {
    if (!isEdit && !name.trim()) { setErr('A name is required.'); return; }
    setBusy(true); setErr('');
    try {
      if (isEdit) {
        await api.mdm.native.updateConfiguration(existing!.id, { wifiSsid, wifiPassword: wifiPassword || undefined, wifiSecurity, startUrl, adminPin });
        onCreated({ ...existing!, wifiSsid, wifiSecurity, startUrl, adminPin });
      } else {
        const r = await api.mdm.native.createConfiguration({ name: name.trim(), wifiSsid, wifiPassword, wifiSecurity, startUrl, adminPin });
        onCreated({ id: r.id, name: name.trim(), wifiSsid, wifiSecurity, wifiPasswordSet: !!wifiPassword, kioskMode: true, mobileEnrollment: true, qrcodeKey: r.qrcodeKey, contentApp: null, deviceCount: 0, startUrl, adminPin });
      }
    } catch { setErr('Could not save the configuration.'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[92%] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 sticky top-0 bg-white">
          <div className="font-bold text-slate-800">{isEdit ? `Edit ${existing!.name}` : 'New configuration'}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {!isEdit && (
            <Field label="Profile name">
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Rich's Auburn Kiosk"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-fuchsia-300" />
            </Field>
          )}
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide pt-1">WiFi</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="SSID">
              <input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} placeholder="Network name"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-fuchsia-300" />
            </Field>
            <Field label="Security">
              <select value={wifiSecurity} onChange={(e) => setWifiSecurity(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm">
                {['WPA', 'WEP', 'NONE'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label={isEdit ? 'WiFi password (leave blank to keep)' : 'WiFi password'}>
            <input type="password" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} autoComplete="new-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-fuchsia-300" />
          </Field>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide pt-1">Kiosk browser</div>
          <Field label="Start URL">
            <input value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="https://…" inputMode="url"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-fuchsia-300" />
          </Field>
          <Field label="Admin exit PIN">
            <input value={adminPin} onChange={(e) => setAdminPin(e.target.value)} inputMode="numeric" placeholder="e.g. 1024"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-fuchsia-300" />
          </Field>
          {!isEdit && <p className="text-[11px] text-slate-400">Cloned from the ApexMSP Kiosk template (launcher + kiosk browser + boot-to-app), with self-registration on. A fresh enrollment QR is generated.</p>}
          {err && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>}
          <button onClick={submit} disabled={busy}
            className="w-full text-white font-bold rounded-lg py-3 flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: MDM_TINT }}>
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : isEdit ? 'Save changes' : 'Create & generate QR'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <div className="text-[11px] font-semibold text-slate-500 mb-1">{label}</div>
    {children}
  </label>
);

const QrModal: React.FC<{ name: string; url: string; wifi: string; onClose: () => void }> = ({ name, url, wifi, onClose }) => (
  <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" onMouseDown={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5 text-center" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-slate-800 text-sm truncate">{name}</div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>
      <img src={url} alt="Enrollment QR" className="w-full rounded-lg border border-slate-200" />
      <p className="text-[11px] text-slate-500 mt-2">Factory-reset the tablet → tap the welcome screen 6× → scan. Joins WiFi{wifi ? ` (${wifi})` : ''} and enrolls into this profile.</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold mt-3 text-fuchsia-700"><ExternalLink className="w-3.5 h-3.5" /> Open full size</a>
    </div>
  </div>
);

// ---- Applications -----------------------------------------------------------
const AppsView: React.FC = () => {
  const [apps, setApps] = useState<NativeMdmApp[] | null>(null);
  useEffect(() => { api.mdm.native.applications().then((r) => setApps(r.applications)).catch(() => setApps([])); }, []);
  if (!apps) return <Spinner />;
  return (
    <div className="p-5">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-sm font-bold text-slate-700">Applications <span className="text-slate-400 font-normal">({apps.length})</span></div>
        <div className="divide-y divide-slate-100">
          {apps.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><AppWindow className="w-4 h-4 text-slate-500" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate">{a.name}</div>
                <div className="text-[11px] text-slate-400 font-mono truncate">{a.pkg}{a.version ? ` · v${a.version}` : ''}</div>
              </div>
              {a.useKiosk && <span className="text-[10px] font-bold text-fuchsia-700 bg-fuchsia-50 rounded px-1.5 py-0.5">KIOSK</span>}
              {a.system && <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">system</span>}
            </div>
          ))}
          {apps.length === 0 && <div className="text-center text-slate-400 text-sm py-8">No applications.</div>}
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-3">Uploading a new APK still happens in ApexMDM for now — native upload is a follow-up.</p>
    </div>
  );
};

// ---- Files ------------------------------------------------------------------
const FilesView: React.FC = () => {
  const [files, setFiles] = useState<NativeMdmFile[] | null>(null);
  useEffect(() => { api.mdm.native.files().then((r) => setFiles(r.files)).catch(() => setFiles([])); }, []);
  if (!files) return <Spinner />;
  return (
    <div className="p-5">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-sm font-bold text-slate-700">Files <span className="text-slate-400 font-normal">({files.length})</span></div>
        <div className="divide-y divide-slate-100">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              <FolderOpen className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate">{f.description || f.devicePath || `File ${f.id}`}</div>
                <div className="text-[11px] text-slate-400 font-mono truncate">{f.devicePath}</div>
              </div>
              {f.external && <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">external</span>}
            </div>
          ))}
          {files.length === 0 && <div className="text-center text-slate-400 text-sm py-8">No files.</div>}
        </div>
      </div>
    </div>
  );
};

// ---- Settings (native placeholder until built) ------------------------------
const SettingsPlaceholder: React.FC = () => (
  <div className="p-5">
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-lg mx-auto mt-8">
      <span className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: `${MDM_TINT}1f` }}><SettingsIcon className="w-6 h-6" style={{ color: MDM_TINT }} /></span>
      <div className="text-sm font-bold text-slate-800">Global MDM settings</div>
      <p className="text-xs text-slate-500 mt-1 mb-4">Self-registration, push, and plugin settings are managed in ApexMDM for now. Native settings screens are on the roadmap.</p>
      <a href={`${HMDM_ADMIN}/#/settings/common`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-white rounded-lg px-3 py-2" style={{ background: MDM_TINT }}>
        <ExternalLink className="w-3.5 h-3.5" /> Open settings in ApexMDM
      </a>
    </div>
  </div>
);

export default MdmView;
