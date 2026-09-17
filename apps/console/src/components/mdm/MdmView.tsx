import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useApp } from '../../data/AppContext';
import { api } from '../../services/api';
import type { NativeMdmDevice, NativeMdmConfig, NativeMdmApp, NativeMdmFile, NativeMdmOverview, NativeMdmPolicy, MdmTriState, NativeConfigApp } from '../../services/api';
import {
  Smartphone, Monitor, Wifi, RefreshCw, Plus, X, ExternalLink, Loader2, Settings as SettingsIcon,
  AppWindow, FolderOpen, LayoutDashboard, Power, QrCode, Pencil, Search, ShieldCheck, CircleDot, Package, ChevronRight, Clock
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
  const { setActiveSubRailView } = useApp();
  const [data, setData] = useState<NativeMdmOverview | null>(null);
  useEffect(() => { api.mdm.native.overview().then(setData).catch(() => setData(null)); }, []);
  if (!data) return <Spinner />;
  const stats = [
    { label: 'Enrolled devices', value: data.deviceCount, Icon: Smartphone, tint: MDM_TINT, to: 'mdm-devices' },
    { label: 'Online now', value: data.onlineCount, Icon: CircleDot, tint: '#22c55e', to: 'mdm-devices' },
    { label: 'Configurations', value: data.configCount, Icon: SettingsIcon, tint: '#6366f1', to: 'mdm-configurations' },
    { label: 'Applications', value: data.appCount, Icon: Package, tint: '#f59e0b', to: 'mdm-applications' }
  ];
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <button key={s.label} onClick={() => setActiveSubRailView(s.to)}
            className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-slate-300 hover:shadow-sm transition group">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.tint}1f` }}><s.Icon className="w-4 h-4" style={{ color: s.tint }} /></span>
              <div className="text-3xl font-black text-slate-800 tabular-nums ml-auto">{s.value}</div>
            </div>
            <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">{s.label}<ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-slate-400" /></div>
          </button>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-sm font-bold text-slate-700 flex items-center">
          Recent devices
          <button onClick={() => setActiveSubRailView('mdm-devices')} className="ml-auto text-xs font-semibold text-fuchsia-700 hover:text-fuchsia-800">View all</button>
        </div>
        {data.recent.length === 0 ? <div className="text-center text-slate-400 text-sm py-8">No devices enrolled yet.</div> : (
          <div className="divide-y divide-slate-100">
            {data.recent.map((d) => (
              <button key={d.id} onClick={() => setActiveSubRailView('mdm-devices')} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                <Smartphone className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 truncate">{d.name}</div>
                  <div className="text-[11px] text-slate-400">{d.model || '—'} · {d.configName || 'No profile'}</div>
                </div>
                <StatusDot online={d.online} />
                <div className="text-[11px] text-slate-400 w-16 text-right">{timeAgo(d.lastUpdate)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---- Devices ----------------------------------------------------------------
const StatusPill: React.FC<{ online: boolean }> = ({ online }) => (
  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
    {online ? 'online' : 'offline'}
  </span>
);

// One manageable device card — mirrors the Remote Support layout: header, facts, inline controls.
const DeviceCard: React.FC<{
  device: NativeMdmDevice;
  configs: NativeMdmConfig[];
  onOpen: () => void;
  onChanged: () => void;
  notify: (t: string) => void;
}> = ({ device, configs, onOpen, onChanged, notify }) => {
  const [busy, setBusy] = useState<'' | 'profile' | 'reboot'>('');

  const setProfile = async (configId: number) => {
    setBusy('profile');
    try { await api.mdm.setProfile(device.number, configId); notify(`Profile queued for ${device.name} — applies on next check-in.`); onChanged(); }
    catch { notify(`Couldn't set the profile for ${device.name}.`); }
    finally { setBusy(''); }
  };
  const doReboot = async () => {
    setBusy('reboot');
    try { await api.mdm.reboot(device.number); notify(`Reboot queued for ${device.name} — restarts on next check-in.`); }
    catch { notify(`Couldn't queue a reboot for ${device.name}.`); }
    finally { setBusy(''); }
  };

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Header band */}
      <button onClick={onOpen} className="flex items-start gap-2.5 px-3.5 pt-3.5 pb-3 text-left hover:bg-slate-50/60 transition">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${MDM_TINT}1f` }}>
          <Smartphone className="w-4 h-4" style={{ color: MDM_TINT }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-900 text-sm truncate leading-tight">{device.name}</div>
          <div className="text-[11px] text-slate-500 truncate leading-tight">{device.model || 'Android device'}</div>
        </div>
        <StatusPill online={device.online} />
      </button>

      {/* Facts */}
      <div className="px-3.5 flex flex-col gap-1 text-[11px] text-slate-500 leading-snug">
        <div className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{device.configName || <span className="text-slate-300">No profile assigned</span>}</span></div>
        <div className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-slate-400 shrink-0" /><span>Last seen {timeAgo(device.lastUpdate)}</span></div>
        {device.publicIp && <div className="flex items-center gap-1.5"><Wifi className="w-3 h-3 text-slate-400 shrink-0" /><span className="font-mono truncate">{device.publicIp}</span></div>}
      </div>

      {/* Inline management */}
      <div className="px-3.5 py-3 mt-2 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <SettingsIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={device.configId ?? ''}
            disabled={busy === 'profile'}
            onChange={(e) => e.target.value && setProfile(parseInt(e.target.value, 10))}
            className="flex-1 text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 cursor-pointer outline-none focus:border-fuchsia-400"
            title="Assign profile"
          >
            {device.configId == null && <option value="">Set profile…</option>}
            {configs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.kioskMode ? ' · kiosk' : ''}</option>)}
          </select>
          {busy === 'profile' && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={doReboot} disabled={busy === 'reboot'}
            className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition disabled:opacity-50">
            {busy === 'reboot' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />} Reboot
          </button>
          <button onClick={onOpen}
            className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold rounded-lg px-2 py-1.5 text-white transition" style={{ background: MDM_TINT }}>
            Details
          </button>
        </div>
      </div>
    </div>
  );
};

const DevicesView: React.FC = () => {
  const [devices, setDevices] = useState<NativeMdmDevice[] | null>(null);
  const [configs, setConfigs] = useState<NativeMdmConfig[]>([]);
  const [open, setOpen] = useState<NativeMdmDevice | null>(null);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(() => { api.mdm.native.devices().then((r) => setDevices(r.devices)).catch(() => setDevices([])); }, []);
  useEffect(() => { load(); api.mdm.native.configurations().then((r) => setConfigs(r.configurations)).catch(() => {}); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }, [toast]);

  if (!devices) return <Spinner />;
  const filtered = devices.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.model.toLowerCase().includes(q.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search devices…"
            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-fuchsia-300" />
        </div>
        <button onClick={load} title="Refresh" className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white hover:bg-slate-50">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
        <div className="text-xs text-slate-400 ml-1">{devices.length} enrolled</div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center text-slate-400 text-sm py-16">
          <Smartphone className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <div className="font-semibold text-slate-600">No devices enrolled</div>
          <div className="text-xs mt-1">Enroll a tablet from Configurations to see it here.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((d) => (
            <DeviceCard key={d.id} device={d} configs={configs} onOpen={() => setOpen(d)} onChanged={load} notify={setToast} />
          ))}
        </div>
      )}

      {open && <DeviceDrawer device={open} configs={configs} onClose={() => setOpen(null)} onChanged={load} />}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[120] max-w-sm px-4 py-3 rounded-xl shadow-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" style={{ color: MDM_TINT }} /><span>{toast}</span>
        </div>
      )}
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

const DEFAULT_POLICY: NativeMdmPolicy = {
  description: '', password: '', gps: 'any', bluetooth: 'any', wifi: 'any', mobileData: 'any',
  blockUsbStorage: false, brightnessMode: 'none', brightness: 180,
  manageTimeout: false, timeout: 60, manageVolume: false, volume: 0, lockVolume: false,
  disableLocation: false, appPermissions: '', pushOptions: ''
};

// Tri-state radio row (Any / Disabled / Enabled) — mirrors Headwind's Common settings.
const TriRow: React.FC<{ label: string; value: MdmTriState; onChange: (v: MdmTriState) => void }> = ({ label, value, onChange }) => (
  <div className="flex items-center gap-3 py-1.5">
    <div className="w-32 shrink-0 text-sm font-semibold text-slate-600">{label}</div>
    <div className="flex gap-1.5">
      {(['any', 'disabled', 'enabled'] as MdmTriState[]).map((v) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition ${value === v ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          style={value === v ? { background: MDM_TINT } : undefined}>
          {v}
        </button>
      ))}
    </div>
  </div>
);

// Checkbox row with an optional inline value input.
const ToggleRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }> = ({ label, checked, onChange, children }) => (
  <div className="flex items-center gap-3 py-1.5">
    <label className="flex items-center gap-2 w-32 shrink-0 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-fuchsia-600" />
      <span className="text-sm font-semibold text-slate-600">{label}</span>
    </label>
    {checked && children}
  </div>
);

const ConfigWizard: React.FC<{ existing?: NativeMdmConfig; onClose: () => void; onCreated: (c: NativeMdmConfig) => void; qrBase: string }> = ({ existing, onClose, onCreated }) => {
  const isEdit = !!existing;
  const [tab, setTab] = useState<'general' | 'policy' | 'apps'>('general');
  const [name, setName] = useState(existing?.name || '');
  const [wifiSsid, setWifiSsid] = useState(existing?.wifiSsid || '');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiSecurity, setWifiSecurity] = useState(existing?.wifiSecurity || 'WPA');
  const [startUrl, setStartUrl] = useState(existing?.startUrl || '');
  const [adminPin, setAdminPin] = useState(existing?.adminPin || '');
  const [policy, setPolicy] = useState<NativeMdmPolicy>(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Seed the policy from the config being edited, or from the kiosk template (id 4) for new configs.
  useEffect(() => {
    let alive = true;
    const seedId = existing?.id ?? 4;
    api.mdm.native.getConfiguration(seedId).then((r) => {
      if (!alive) return;
      if (r.configuration.policy) setPolicy({ ...DEFAULT_POLICY, ...r.configuration.policy });
      if (isEdit) {
        setStartUrl(r.configuration.startUrl || '');
        setAdminPin(r.configuration.adminPin || '');
        setWifiSsid(r.configuration.wifiSsid || '');
        setWifiSecurity(r.configuration.wifiSecurity || 'WPA');
      }
    }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [existing?.id, isEdit]);

  const patch = (p: Partial<NativeMdmPolicy>) => setPolicy((prev) => ({ ...prev, ...p }));

  const submit = async () => {
    if (!isEdit && !name.trim()) { setErr('A name is required.'); setTab('general'); return; }
    setBusy(true); setErr('');
    try {
      const genPatch = { wifiSsid, wifiPassword: wifiPassword || undefined, wifiSecurity, startUrl, adminPin, policy };
      if (isEdit) {
        await api.mdm.native.updateConfiguration(existing!.id, genPatch);
        onCreated({ ...existing!, wifiSsid, wifiSecurity, startUrl, adminPin, policy });
      } else {
        const r = await api.mdm.native.createConfiguration({ name: name.trim(), wifiSsid, wifiPassword, wifiSecurity, startUrl, adminPin });
        // Apply the device policy to the freshly-cloned config, then surface the QR.
        await api.mdm.native.updateConfiguration(r.id, { policy }).catch(() => {});
        onCreated({ id: r.id, name: name.trim(), wifiSsid, wifiSecurity, wifiPasswordSet: !!wifiPassword, kioskMode: true, mobileEnrollment: true, qrcodeKey: r.qrcodeKey, contentApp: null, deviceCount: 0, startUrl, adminPin, policy });
      }
    } catch { setErr('Could not save the configuration.'); setBusy(false); }
  };

  const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-fuchsia-300';
  const smallInput = 'w-24 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-fuchsia-300';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[92%] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="font-bold text-slate-800">{isEdit ? `Edit ${existing!.name}` : 'New configuration'}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        {/* Tab strip */}
        <div className="flex gap-1 px-4 pt-3 border-b border-slate-100">
          {([['general', 'General & Kiosk'], ['policy', 'Device policy'], ['apps', 'Applications']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3.5 py-2 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition ${tab === id ? 'text-slate-900 border-fuchsia-500' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {tab === 'general' && (
            <div className="space-y-3">
              {!isEdit && (
                <Field label="Profile name">
                  <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Rich's Auburn Kiosk" className={inputCls} />
                </Field>
              )}
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide pt-1">WiFi</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="SSID"><input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} placeholder="Network name" className={inputCls} /></Field>
                <Field label="Security">
                  <select value={wifiSecurity} onChange={(e) => setWifiSecurity(e.target.value)} className={inputCls}>
                    {['WPA', 'WEP', 'NONE'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label={isEdit ? 'WiFi password (leave blank to keep)' : 'WiFi password'}>
                <input type="password" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} autoComplete="new-password" className={inputCls} />
              </Field>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide pt-1">Kiosk browser</div>
              <Field label="Start URL"><input value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="https://…" inputMode="url" className={inputCls} /></Field>
              <Field label="Admin exit PIN"><input value={adminPin} onChange={(e) => setAdminPin(e.target.value)} inputMode="numeric" placeholder="e.g. 1024" className={inputCls} /></Field>
              {!isEdit && <p className="text-[11px] text-slate-400">Cloned from the ApexMSP Kiosk template (launcher + kiosk browser + boot-to-app), with self-registration on. A fresh enrollment QR is generated.</p>}
            </div>
          )}

          {tab === 'policy' && (
            loading ? <Spinner /> : (
              <div className="space-y-1">
                <Field label="Description">
                  <input value={policy.description} onChange={(e) => patch({ description: e.target.value })} placeholder="What this profile is for" className={inputCls} />
                </Field>
                <Field label="Device unlock password">
                  <input value={policy.password} onChange={(e) => patch({ password: e.target.value })} placeholder="e.g. 1024" className={inputCls} />
                </Field>

                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide pt-3 pb-1">Radios</div>
                <TriRow label="GPS" value={policy.gps} onChange={(v) => patch({ gps: v })} />
                <TriRow label="Bluetooth" value={policy.bluetooth} onChange={(v) => patch({ bluetooth: v })} />
                <TriRow label="Wi-Fi" value={policy.wifi} onChange={(v) => patch({ wifi: v })} />
                <TriRow label="Mobile data" value={policy.mobileData} onChange={(v) => patch({ mobileData: v })} />

                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide pt-3 pb-1">Display &amp; sound</div>
                <div className="flex items-center gap-3 py-1.5">
                  <div className="w-32 shrink-0 text-sm font-semibold text-slate-600">Brightness</div>
                  <div className="flex gap-1.5 items-center">
                    {(['none', 'value', 'auto'] as const).map((v) => (
                      <button key={v} type="button" onClick={() => patch({ brightnessMode: v })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition ${policy.brightnessMode === v ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                        style={policy.brightnessMode === v ? { background: MDM_TINT } : undefined}>{v}</button>
                    ))}
                    {policy.brightnessMode === 'value' && (
                      <input type="number" min={0} max={255} value={policy.brightness} onChange={(e) => patch({ brightness: parseInt(e.target.value || '0', 10) })} className={smallInput + ' ml-1'} />
                    )}
                  </div>
                </div>
                <ToggleRow label="Screen timeout" checked={policy.manageTimeout} onChange={(v) => patch({ manageTimeout: v })}>
                  <div className="flex items-center gap-1.5 text-sm text-slate-500"><input type="number" min={0} value={policy.timeout} onChange={(e) => patch({ timeout: parseInt(e.target.value || '0', 10) })} className={smallInput} /> seconds</div>
                </ToggleRow>
                <ToggleRow label="Manage volume" checked={policy.manageVolume} onChange={(v) => patch({ manageVolume: v })}>
                  <div className="flex items-center gap-1.5 text-sm text-slate-500"><input type="number" min={0} max={100} value={policy.volume} onChange={(e) => patch({ volume: parseInt(e.target.value || '0', 10) })} className={smallInput} /> %</div>
                </ToggleRow>
                <ToggleRow label="Lock volume" checked={policy.lockVolume} onChange={(v) => patch({ lockVolume: v })} />

                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide pt-3 pb-1">Security &amp; management</div>
                <ToggleRow label="Block USB storage" checked={policy.blockUsbStorage} onChange={(v) => patch({ blockUsbStorage: v })} />
                <ToggleRow label="Disable location" checked={policy.disableLocation} onChange={(v) => patch({ disableLocation: v })} />
                <div className="flex items-center gap-3 py-1.5">
                  <div className="w-32 shrink-0 text-sm font-semibold text-slate-600">App permissions</div>
                  <select value={policy.appPermissions} onChange={(e) => patch({ appPermissions: e.target.value })} className={inputCls + ' max-w-xs'}>
                    <option value="">Default (ask)</option>
                    <option value="GRANTALL">Grant all</option>
                    <option value="DENYALL">Deny all</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 py-1.5">
                  <div className="w-32 shrink-0 text-sm font-semibold text-slate-600">Push channel</div>
                  <select value={policy.pushOptions} onChange={(e) => patch({ pushOptions: e.target.value })} className={inputCls + ' max-w-xs'}>
                    <option value="">Default</option>
                    <option value="mqtt">MQTT (persistent)</option>
                    <option value="mqttAlarm">MQTT + wake alarm</option>
                    <option value="mqttWorker">MQTT worker</option>
                  </select>
                </div>
              </div>
            )
          )}

          {tab === 'apps' && (
            isEdit ? <AppsPanel configId={existing!.id} />
              : <div className="text-center text-slate-400 text-sm py-12">
                  <AppWindow className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <div className="font-semibold text-slate-600">Create the profile first</div>
                  <div className="text-xs mt-1">New profiles inherit the kiosk template's apps. Save, then reopen to manage them here.</div>
                </div>
          )}
        </div>

        {tab !== 'apps' && (
          <div className="px-5 py-3.5 border-t border-slate-100">
            {err && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2">{err}</div>}
            <button onClick={submit} disabled={busy}
              className="w-full text-white font-bold rounded-lg py-3 flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: MDM_TINT }}>
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : isEdit ? 'Save changes' : 'Create & generate QR'}
            </button>
          </div>
        )}
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

// Per-configuration application assignment (native Applications tab).
const AppsPanel: React.FC<{ configId: number }> = ({ configId }) => {
  const [assigned, setAssigned] = useState<NativeConfigApp[] | null>(null);
  const [available, setAvailable] = useState<NativeMdmApp[]>([]);
  const [showSystem, setShowSystem] = useState(false);
  const [addId, setAddId] = useState('');

  const load = useCallback(() => {
    api.mdm.native.configApps(configId).then((r) => { setAssigned(r.assigned); setAvailable(r.available); }).catch(() => setAssigned([]));
  }, [configId]);
  useEffect(() => { load(); }, [load]);

  if (!assigned) return <Spinner />;
  const custom = assigned.filter((a) => !a.system);
  const system = assigned.filter((a) => a.system);
  const customAvail = available.filter((a) => !a.system);
  const systemAvail = available.filter((a) => a.system);

  const toggle = async (a: NativeConfigApp, field: 'showIcon' | 'remove') => {
    const next = !a[field];
    setAssigned((prev) => prev!.map((x) => x.applicationId === a.applicationId ? { ...x, [field]: next } : x));
    await api.mdm.native.setConfigApp(configId, a.applicationId, { [field]: next }).catch(() => load());
  };
  const unassign = async (a: NativeConfigApp) => {
    setAssigned((prev) => prev!.filter((x) => x.applicationId !== a.applicationId));
    await api.mdm.native.removeConfigApp(configId, a.applicationId).catch(() => {});
    load();
  };
  const add = async () => {
    const id = parseInt(addId, 10);
    if (!Number.isFinite(id)) return;
    setAddId('');
    await api.mdm.native.addConfigApp(configId, id).catch(() => {});
    load();
  };

  const Row: React.FC<{ a: NativeConfigApp }> = ({ a }) => (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-0">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.system ? 'bg-slate-100' : ''}`} style={a.system ? undefined : { background: `${MDM_TINT}1f` }}>
        <AppWindow className={`w-4 h-4 ${a.system ? 'text-slate-400' : ''}`} style={a.system ? undefined : { color: MDM_TINT }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-800 truncate">{a.name}</div>
        <div className="text-[11px] text-slate-400 font-mono truncate">{a.pkg}{a.version && a.version !== '0' ? ` · v${a.version}` : ''}</div>
      </div>
      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 cursor-pointer shrink-0" title="Show launcher icon">
        <input type="checkbox" checked={a.showIcon} onChange={() => toggle(a, 'showIcon')} className="w-3.5 h-3.5 accent-fuchsia-600" /> Icon
      </label>
      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 cursor-pointer shrink-0" title="Uninstall from device">
        <input type="checkbox" checked={a.remove} onChange={() => toggle(a, 'remove')} className="w-3.5 h-3.5 accent-rose-500" /> Remove
      </label>
      <button onClick={() => unassign(a)} title="Unassign from profile" className="text-slate-300 hover:text-rose-500 shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Add app */}
      <div className="flex items-center gap-2">
        <select value={addId} onChange={(e) => setAddId(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">Add an application…</option>
          {customAvail.length > 0 && <optgroup label="Custom apps">{customAvail.map((a) => <option key={a.id} value={a.id}>{a.name}{a.version ? ` · v${a.version}` : ''}</option>)}</optgroup>}
          {systemAvail.length > 0 && <optgroup label="System packages">{systemAvail.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
        </select>
        <button onClick={add} disabled={!addId} className="flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-2 disabled:opacity-50" style={{ background: MDM_TINT }}>
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Custom apps */}
      <div>
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Managed apps <span className="text-slate-300">({custom.length})</span></div>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {custom.length ? custom.map((a) => <Row key={a.applicationId} a={a} />)
            : <div className="text-center text-slate-400 text-sm py-6">No custom apps assigned. Add one above.</div>}
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">“Icon” shows the app on the launcher · “Remove” uninstalls it from the device on next check-in.</p>
      </div>

      {/* System apps (collapsed) */}
      <div>
        <button onClick={() => setShowSystem((s) => !s)} className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1 hover:text-slate-600">
          System packages <span className="text-slate-300">({system.length})</span>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showSystem ? 'rotate-90' : ''}`} />
        </button>
        {showSystem && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mt-1.5 max-h-72 overflow-y-auto">
            {system.map((a) => <Row key={a.applicationId} a={a} />)}
          </div>
        )}
      </div>
    </div>
  );
};

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
