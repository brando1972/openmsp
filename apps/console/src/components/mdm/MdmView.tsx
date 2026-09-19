import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useApp } from '../../data/AppContext';
import { api } from '../../services/api';
import type { NativeMdmDevice, NativeMdmConfig, NativeMdmApp, NativeMdmFile, NativeMdmOverview, NativeMdmPolicy, NativeMdmDesign, NativeMdmMdm, MdmTriState, NativeConfigApp, NativeConfigFile, NativeRepoFile } from '../../services/api';
import {
  Smartphone, Monitor, Wifi, RefreshCw, Plus, X, ExternalLink, Loader2, Settings as SettingsIcon,
  AppWindow, FolderOpen, LayoutDashboard, Power, QrCode, Pencil, Search, ShieldCheck, CircleDot, Package, ChevronRight, Clock,
  Lock, Unlock, MonitorPlay, Zap, Check, Copy, Radio
} from 'lucide-react';

/* ==========================================================================
   ApexMDM — Enterprise Fleet & Config Deploy
   Ground-up native MDM engine, no-iframe console module over the Headwind & native
   data layer. Sub-view selected by the sidebar (activeSubRailView = mdm-*).
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
  'mdm-configurations': 'Config Deploy & Profiles',
  'mdm-devices': 'Managed Tablets & Devices',
  'mdm-summary': 'Fleet Overview',
  'mdm-applications': 'Applications',
  'mdm-files': 'Files & Payloads',
  'mdm-settings': 'Global Policies'
};

export const launchRemoteControl = async (deviceId: string = 'apex-lenovo-01') => {
  const win = window.open('about:blank', '_blank');
  try {
    const res = await api.mdm.getViewerUrl(deviceId);
    if (win) {
      win.location.href = res.url;
    }
  } catch {
    if (win) win.close();
    alert('Failed to launch remote control session.');
  }
};

export const MdmView: React.FC = () => {
  const { activeSubRailView } = useApp();
  const section = SECTION_LABEL[activeSubRailView] ? activeSubRailView : 'mdm-configurations';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f4f6f8]">
      <div className="shrink-0 flex items-center gap-2 px-5 h-12 border-b border-slate-200 bg-white shadow-xs">
        <Smartphone className="w-4 h-4" style={{ color: MDM_TINT }} />
        <div className="text-sm font-bold text-slate-800">ApexMDM • Enterprise Fleet & Config Deploy</div>
        <span className="text-slate-300">/</span>
        <div className="text-sm font-medium text-slate-600">{SECTION_LABEL[section]}</div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => launchRemoteControl()}
            className="flex items-center gap-1.5 text-xs font-semibold text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 border border-fuchsia-200 rounded-md px-2.5 py-1.5 transition cursor-pointer"
            title="Launch live VNC remote control session"
          >
            <MonitorPlay className="w-3.5 h-3.5" /> Remote Control
          </button>
          <a
            href={`${HMDM_ADMIN}/#/summary`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-md px-2.5 py-1.5 bg-white transition"
            title="Open legacy Headwind MDM portal"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Legacy Portal
          </a>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {section === 'mdm-configurations' && <ConfigsView />}
        {section === 'mdm-devices' && <DevicesView />}
        {section === 'mdm-summary' && <Overview />}
        {section === 'mdm-applications' && <AppsView />}
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
  const [busy, setBusy] = useState<'' | 'profile' | 'reboot' | 'sync' | 'kiosk' | 'relaunch'>('');

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
  const doSync = async () => {
    setBusy('sync');
    try { await api.mdm.sync(device.number); notify(`Sync sent to ${device.name} — it pulls the latest profile in a few seconds.`); }
    catch { notify(`Couldn't sync ${device.name}.`); }
    finally { setBusy(''); }
  };
  const doKiosk = async (lock: boolean) => {
    setBusy('kiosk');
    try {
      await api.mdm.setKiosk(device.number, lock, lock ? device.oldConfigId : undefined);
      notify(lock
        ? `Locking ${device.name} into kiosk — it re-locks on its next check-in.`
        : `Unlocking ${device.name} to the Recovery profile — it exits kiosk on its next check-in.`);
      onChanged();
    } catch { notify(`Couldn't ${lock ? 'lock' : 'unlock'} ${device.name}. Assign a kiosk profile first if none exists.`); }
    finally { setBusy(''); }
  };
  const doRelaunch = async () => {
    setBusy('relaunch');
    try { await api.mdm.runApp(device.number); notify(`Relaunching ApexBrowser on ${device.name}.`); }
    catch { notify(`Couldn't relaunch ApexBrowser on ${device.name}.`); }
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
          {device.configKiosk ? (
            <button onClick={() => doKiosk(false)} disabled={busy === 'kiosk'} title="Unlock the tablet out of kiosk to the Recovery profile"
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-amber-200 rounded-lg px-2 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 transition disabled:opacity-50">
              {busy === 'kiosk' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />} Unlock
            </button>
          ) : (
            <button onClick={() => doKiosk(true)} disabled={busy === 'kiosk'} title="Lock the tablet back into its kiosk profile"
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-emerald-200 rounded-lg px-2 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50">
              {busy === 'kiosk' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Lock
            </button>
          )}
          <button onClick={doRelaunch} disabled={busy === 'relaunch'} title="Relaunch the ApexBrowser kiosk app on the tablet"
            className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 hover:bg-fuchsia-50 hover:text-fuchsia-700 hover:border-fuchsia-200 transition disabled:opacity-50">
            {busy === 'relaunch' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MonitorPlay className="w-3.5 h-3.5" />} ApexBrowser
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={doSync} disabled={busy === 'sync'} title="Push the latest profile to the tablet now"
            className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 hover:bg-fuchsia-50 hover:text-fuchsia-700 hover:border-fuchsia-200 transition disabled:opacity-50">
            {busy === 'sync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sync
          </button>
          <button onClick={doReboot} disabled={busy === 'reboot'}
            className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition disabled:opacity-50">
            {busy === 'reboot' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />} Reboot
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => launchRemoteControl(device.number)} title="Launch live VNC remote control session for this tablet"
            className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-fuchsia-200 rounded-lg px-2 py-1.5 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 transition cursor-pointer">
            <MonitorPlay className="w-3.5 h-3.5" /> Remote Control
          </button>
          <button onClick={onOpen}
            className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold rounded-lg px-2 py-1.5 text-white transition cursor-pointer" style={{ background: MDM_TINT }}>
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
  const doSync = async () => { setBusy('sync'); try { await api.mdm.sync(device.number); setMsg('Sync sent — the tablet pulls the latest profile in a few seconds.'); } catch { setMsg('Could not sync.'); } finally { setBusy(''); } };
  const setProfile = async (configId: number) => { setBusy('profile'); try { await api.mdm.setProfile(device.number, configId); setMsg('Profile updated.'); onChanged(); } catch { setMsg('Could not set profile.'); } finally { setBusy(''); } };
  const doKiosk = async (lock: boolean) => { setBusy('kiosk'); try { await api.mdm.setKiosk(device.number, lock, lock ? device.oldConfigId : undefined); setMsg(lock ? 'Locking into kiosk — re-locks on next check-in.' : 'Unlocking to Recovery — exits kiosk on next check-in.'); onChanged(); } catch { setMsg(`Could not ${lock ? 'lock' : 'unlock'}. Assign a kiosk profile first if none exists.`); } finally { setBusy(''); } };
  const doRelaunch = async () => { setBusy('relaunch'); try { await api.mdm.runApp(device.number); setMsg('Relaunching ApexBrowser on the tablet.'); } catch { setMsg('Could not relaunch ApexBrowser.'); } finally { setBusy(''); } };
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

          <button onClick={() => launchRemoteControl(device.number)}
            className="w-full flex items-center justify-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-semibold rounded-lg py-2.5 text-sm shadow-sm transition cursor-pointer">
            <MonitorPlay className="w-4 h-4" /> Launch Remote Control
          </button>

          <button onClick={doSync} disabled={busy === 'sync'}
            className="w-full flex items-center justify-center gap-2 text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-60" style={{ background: MDM_TINT }}>
            {busy === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync profile now
          </button>

          <div className="flex gap-2">
            {device.configKiosk ? (
              <button onClick={() => doKiosk(false)} disabled={busy === 'kiosk'}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 font-semibold rounded-lg py-2.5 text-sm disabled:opacity-60">
                {busy === 'kiosk' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />} Unlock kiosk
              </button>
            ) : (
              <button onClick={() => doKiosk(true)} disabled={busy === 'kiosk'}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-semibold rounded-lg py-2.5 text-sm disabled:opacity-60">
                {busy === 'kiosk' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Lock kiosk
              </button>
            )}
            <button onClick={doRelaunch} disabled={busy === 'relaunch'}
              className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-fuchsia-50 hover:text-fuchsia-700 hover:border-fuchsia-200 font-semibold rounded-lg py-2.5 text-sm disabled:opacity-60">
              {busy === 'relaunch' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MonitorPlay className="w-4 h-4" />} ApexBrowser
            </button>
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
  const [deploying, setDeploying] = useState<number | null>(null);
  const [deployStatus, setDeployStatus] = useState<{ id: number; message: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    api.mdm.native.configurations()
      .then((r) => { setConfigs(r.configurations); setQrBase(r.qrBase); })
      .catch(() => setConfigs([]));
  }, []);

  useEffect(() => { load(); }, [load]);
  if (!configs) return <Spinner />;

  return (
    <div className="p-5 space-y-4">
      {/* Top Banner: Native Engine Active & Target Fleet */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-2xl p-4 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-fuchsia-600/20 border border-fuchsia-500/30 flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 text-fuchsia-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">ApexMDM Native Engine</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 tracking-wide uppercase">Engine Ready</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">Zero Headwind</span>
            </div>
            <div className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Target Device: <strong className="text-white">apex-lenovo-01</strong> <span className="text-amber-400 font-semibold">(Offline • Awaiting Setup)</span></span>
              <span>•</span>
              <span>DPC: <code className="text-fuchsia-300">app.apexmsp.kiosk</code> (Signed)</span>
              <span>•</span>
              <span>Agent: <code className="text-emerald-300">vnc.apexmsp.app</code></span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 self-stretch md:self-auto shrink-0">
          <button
            onClick={() => launchRemoteControl('apex-lenovo-01')}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 px-3 py-2 rounded-lg shadow-sm transition cursor-pointer"
            title="Launch live VNC remote control session"
          >
            <MonitorPlay className="w-3.5 h-3.5" /> Launch Remote View
          </button>
          <button
            onClick={load}
            className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition cursor-pointer"
            title="Refresh configurations"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Deployment Status Alert */}
      {deployStatus && (
        <div className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-medium ${
          deployStatus.ok
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            {deployStatus.ok ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <X className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{deployStatus.message}</span>
          </div>
          <button onClick={() => setDeployStatus(null)} className="text-slate-400 hover:text-slate-600 ml-3 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Configurations List Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="text-base font-bold text-slate-800">Configurations & Profiles</div>
          <div className="text-xs text-slate-500">Deploy kiosks, launcher lockdowns, and custom start URLs directly to managed devices.</div>
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 text-xs font-semibold text-white rounded-lg px-3 py-2 shadow-xs cursor-pointer hover:opacity-95 transition" style={{ background: MDM_TINT }}>
          <Plus className="w-4 h-4" /> New configuration
        </button>
      </div>

      {/* Configuration Cards Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {configs.map((c) => {
          const isCurrentDeploying = deploying === c.id;
          return (
            <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${MDM_TINT}15` }}>
                      <SettingsIcon className="w-5 h-5" style={{ color: MDM_TINT }} />
                    </span>
                    <div>
                      <div className="text-sm font-bold text-slate-900 leading-tight">{c.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {c.deviceCount} managed device{c.deviceCount === 1 ? '' : 's'}{c.contentApp ? ` · App: ${c.contentApp}` : ''}
                      </div>
                    </div>
                  </div>
                  {c.kioskMode ? (
                    <span className="text-[10px] font-black uppercase tracking-wide text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-md px-2 py-0.5">KIOSK LOCKDOWN</span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-0.5">BROWSER / RECOVERY</span>
                  )}
                </div>

                <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Start URL:</span>
                    <span className="font-mono text-[11px] text-slate-700 font-semibold truncate max-w-[240px]" title={c.startUrl || 'None'}>
                      {c.startUrl || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Network / Wi-Fi:</span>
                    <span className="text-slate-600 font-medium flex items-center gap-1">
                      <Wifi className="w-3 h-3 text-slate-400" />
                      {c.wifiSsid || 'Device Default'}{c.wifiSecurity ? ` (${c.wifiSecurity})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQrFor(c)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 transition cursor-pointer"
                    title="View Android Enterprise Zero-Touch QR Code"
                  >
                    <QrCode className="w-3.5 h-3.5 text-slate-500" /> Enrollment QR
                  </button>
                  <button
                    onClick={() => setEditing(c)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 transition cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-500" /> Edit
                  </button>
                </div>

                {/* Direct 1-Tap Push to Tablet */}
                <button
                  onClick={async () => {
                    setDeploying(c.id);
                    setDeployStatus(null);
                    try {
                      const res = await api.mdm.native.deployConfiguration(c.id, 'apex-lenovo-01');
                      setDeployStatus({
                        id: c.id,
                        message: `⚡ Pushed "${c.name}" to ${res.deployedTo}! Active URL: ${res.targetUrl}`,
                        ok: true
                      });
                    } catch (err: any) {
                      setDeployStatus({
                        id: c.id,
                        message: `Failed to deploy: ${err.message || 'Check connection'}`,
                        ok: false
                      });
                    } finally {
                      setDeploying(null);
                    }
                  }}
                  disabled={isCurrentDeploying}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] rounded-lg px-3.5 py-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
                  title="Push configuration and launch immediately on apex-lenovo-01"
                >
                  {isCurrentDeploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 fill-current" />}
                  Deploy to Tablet
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {creating && <ConfigWizard onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); load(); setQrFor(c); }} qrBase={qrBase} />}
      {editing && <ConfigWizard existing={editing} onClose={() => setEditing(null)} onCreated={() => { setEditing(null); load(); }} qrBase={qrBase} />}
      {qrFor && <QrModal config={qrFor} qrBase={qrBase} onClose={() => setQrFor(null)} />}
    </div>
  );
};

const DEFAULT_POLICY: NativeMdmPolicy = {
  description: '', password: '', gps: 'any', bluetooth: 'any', wifi: 'any', mobileData: 'any',
  blockUsbStorage: false, brightnessMode: 'none', brightness: 180,
  manageTimeout: false, timeout: 60, manageVolume: false, volume: 0, lockVolume: false,
  disableLocation: false, appPermissions: '', pushOptions: ''
};

const DEFAULT_DESIGN: NativeMdmDesign = {
  useDefault: true, backgroundColor: '', textColor: '', backgroundImageUrl: '',
  iconSize: 'SMALL', header: 'NO_HEADER', headerTemplate: ''
};

// Android's max screen-off timeout in seconds (~24.8 days = effectively never).
const NEVER_SLEEP_SECS = 2147483;

const DEFAULT_MDM: NativeMdmMdm = {
  kioskMode: false, kioskScreenOn: false, kioskKeyguard: false, autostartForeground: false,
  kioskHome: false, kioskRecents: false, kioskNotifications: false, kioskSystemInfo: false,
  kioskLockButtons: false, kioskExit: false, blockStatusBar: false, orientation: 'none',
  runDefaultLauncher: false, autoUpdate: false, disableScreenshots: false, encryptDevice: false, lockSafeSettings: false
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
  const [tab, setTab] = useState<'general' | 'policy' | 'design' | 'mdm' | 'apps' | 'files'>('general');
  const [name, setName] = useState(existing?.name || '');
  const [wifiSsid, setWifiSsid] = useState(existing?.wifiSsid || '');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiSecurity, setWifiSecurity] = useState(existing?.wifiSecurity || 'WPA');
  const [startUrl, setStartUrl] = useState(existing?.startUrl || '');
  const [adminPin, setAdminPin] = useState(existing?.adminPin || '');
  const [policy, setPolicy] = useState<NativeMdmPolicy>(DEFAULT_POLICY);
  const [design, setDesign] = useState<NativeMdmDesign>(DEFAULT_DESIGN);
  const [mdm, setMdm] = useState<NativeMdmMdm>(DEFAULT_MDM);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Seed the policy + design from the config being edited, or from the kiosk template (id 4) for new configs.
  useEffect(() => {
    let alive = true;
    const seedId = existing?.id ?? 4;
    api.mdm.native.getConfiguration(seedId).then((r) => {
      if (!alive) return;
      if (r.configuration.policy) setPolicy({ ...DEFAULT_POLICY, ...r.configuration.policy });
      if (r.configuration.design) setDesign({ ...DEFAULT_DESIGN, ...r.configuration.design });
      if (r.configuration.mdm) setMdm({ ...DEFAULT_MDM, ...r.configuration.mdm });
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
  const patchDesign = (p: Partial<NativeMdmDesign>) => setDesign((prev) => ({ ...prev, ...p }));
  const patchMdm = (p: Partial<NativeMdmMdm>) => setMdm((prev) => ({ ...prev, ...p }));

  const submit = async () => {
    if (!isEdit && !name.trim()) { setErr('A name is required.'); setTab('general'); return; }
    setBusy(true); setErr('');
    try {
      const genPatch = { name: name.trim(), wifiSsid, wifiPassword: wifiPassword || undefined, wifiSecurity, startUrl, adminPin, policy, design, mdm };
      if (isEdit) {
        await api.mdm.native.updateConfiguration(existing!.id, genPatch);
        onCreated({ ...existing!, name: name.trim(), wifiSsid, wifiSecurity, startUrl, adminPin, policy, design, mdm });
      } else {
        const r = await api.mdm.native.createConfiguration({ name: name.trim(), wifiSsid, wifiPassword, wifiSecurity, startUrl, adminPin, policy, design, mdm });
        // Apply the device policy + design + MDM settings to the freshly-cloned config, then surface the QR.
        await api.mdm.native.updateConfiguration(r.id, { policy, design, mdm }).catch(() => {});
        onCreated({ id: r.id, name: name.trim(), wifiSsid, wifiSecurity, wifiPasswordSet: !!wifiPassword, kioskMode: true, mobileEnrollment: true, qrcodeKey: r.qrcodeKey, contentApp: null, deviceCount: 0, startUrl, adminPin, policy, design, mdm });
      }
    } catch (e: any) {
      setErr(e?.message || 'Could not save the configuration.');
      setBusy(false);
    }
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
          {([['general', 'General & Kiosk'], ['policy', 'Device policy'], ['design', 'Design'], ['mdm', 'MDM Settings'], ['apps', 'Applications'], ['files', 'Files']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3.5 py-2 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition ${tab === id ? 'text-slate-900 border-fuchsia-500' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {tab === 'general' && (
            <div className="space-y-3">
              <Field label="Profile name">
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!isEdit} placeholder="e.g. Rich's Auburn Kiosk" className={inputCls} />
              </Field>
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

          {tab === 'design' && (
            loading ? <Spinner /> : (
              <div className="space-y-1">
                <ToggleRow label="Use default design" checked={design.useDefault} onChange={(v) => patchDesign({ useDefault: v })}>
                  <span className="text-[11px] text-slate-400">Launcher uses Headwind's stock look</span>
                </ToggleRow>
                {!design.useDefault && (
                  <div className="space-y-1 pt-2">
                    <div className="flex items-center gap-3 py-1.5">
                      <div className="w-32 shrink-0 text-sm font-semibold text-slate-600">Background</div>
                      <input type="color" value={design.backgroundColor || '#ffffff'} onChange={(e) => patchDesign({ backgroundColor: e.target.value })} className="w-9 h-9 rounded border border-slate-200 bg-white cursor-pointer" />
                      <input value={design.backgroundColor} onChange={(e) => patchDesign({ backgroundColor: e.target.value })} placeholder="#RRGGBB" className={smallInput + ' w-28 font-mono'} />
                    </div>
                    <div className="flex items-center gap-3 py-1.5">
                      <div className="w-32 shrink-0 text-sm font-semibold text-slate-600">Icon text</div>
                      <input type="color" value={design.textColor || '#000000'} onChange={(e) => patchDesign({ textColor: e.target.value })} className="w-9 h-9 rounded border border-slate-200 bg-white cursor-pointer" />
                      <input value={design.textColor} onChange={(e) => patchDesign({ textColor: e.target.value })} placeholder="#RRGGBB" className={smallInput + ' w-28 font-mono'} />
                    </div>
                    <Field label="Background image URL">
                      <input value={design.backgroundImageUrl} onChange={(e) => patchDesign({ backgroundImageUrl: e.target.value })} placeholder="https://…" inputMode="url" className={inputCls} />
                    </Field>
                    <div className="flex items-center gap-3 py-1.5">
                      <div className="w-32 shrink-0 text-sm font-semibold text-slate-600">Icon size</div>
                      <div className="flex gap-1.5">
                        {(['SMALL', 'LARGE'] as const).map((v) => (
                          <button key={v} type="button" onClick={() => patchDesign({ iconSize: v })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition ${design.iconSize === v ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                            style={design.iconSize === v ? { background: MDM_TINT } : undefined}>{v.toLowerCase()}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 py-1.5">
                      <div className="w-32 shrink-0 text-sm font-semibold text-slate-600">Desktop header</div>
                      <div className="flex gap-1.5">
                        {([['NO_HEADER', 'None'], ['CUSTOM', 'Custom']] as const).map(([v, lbl]) => (
                          <button key={v} type="button" onClick={() => patchDesign({ header: v })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${design.header === v ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                            style={design.header === v ? { background: MDM_TINT } : undefined}>{lbl}</button>
                        ))}
                      </div>
                    </div>
                    {design.header === 'CUSTOM' && (
                      <Field label="Header template (HTML)">
                        <textarea value={design.headerTemplate} onChange={(e) => patchDesign({ headerTemplate: e.target.value })} rows={3} placeholder="<div>…</div>" className={inputCls + ' font-mono text-xs'} />
                      </Field>
                    )}
                  </div>
                )}
                {design.useDefault && <p className="text-[11px] text-slate-400 pt-1">Turn off “Use default design” to customize the launcher's colors, background, icon size and header.</p>}
              </div>
            )
          )}

          {tab === 'mdm' && (
            loading ? <Spinner /> : (
              <div className="space-y-1">
                {/* One-click "never sleep" — forces the Android screen-off timeout to max + keep-screen-on + no lock screen. */}
                {(() => {
                  const alwaysOn = policy.manageTimeout && policy.timeout >= 86400;
                  return (
                    <div className="rounded-xl border p-3 mb-2" style={{ borderColor: `${MDM_TINT}55`, background: `${MDM_TINT}0d` }}>
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={alwaysOn} className="w-4 h-4 accent-fuchsia-600"
                          onChange={(e) => {
                            if (e.target.checked) {
                              patch({ manageTimeout: true, timeout: NEVER_SLEEP_SECS });
                              patchMdm({ kioskScreenOn: true, kioskKeyguard: true });
                            } else {
                              patch({ manageTimeout: false, timeout: 60 });
                            }
                          }} />
                        <div>
                          <div className="text-sm font-bold text-slate-800">Screen always on (never sleep)</div>
                          <div className="text-[11px] text-slate-500">Forces no screen timeout, keeps the display on, and disables the lock screen — the tablet stays on the ApexBrowser.</div>
                        </div>
                      </label>
                    </div>
                  );
                })()}
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide pb-1">Kiosk mode</div>
                <ToggleRow label="Kiosk mode" checked={mdm.kioskMode} onChange={(v) => patchMdm({ kioskMode: v })}>
                  <span className="text-[11px] text-slate-400">Lock the device to the kiosk app</span>
                </ToggleRow>
                <ToggleRow label="Auto-start on boot" checked={mdm.autostartForeground} onChange={(v) => patchMdm({ autostartForeground: v })} />
                <ToggleRow label="Keep screen on" checked={mdm.kioskScreenOn} onChange={(v) => patchMdm({ kioskScreenOn: v })} />
                <ToggleRow label="Disable lock screen" checked={mdm.kioskKeyguard} onChange={(v) => patchMdm({ kioskKeyguard: v })} />
                <ToggleRow label="Show home button" checked={mdm.kioskHome} onChange={(v) => patchMdm({ kioskHome: v })} />
                <ToggleRow label="Show recents" checked={mdm.kioskRecents} onChange={(v) => patchMdm({ kioskRecents: v })} />
                <ToggleRow label="Show notifications" checked={mdm.kioskNotifications} onChange={(v) => patchMdm({ kioskNotifications: v })} />
                <ToggleRow label="Show system info" checked={mdm.kioskSystemInfo} onChange={(v) => patchMdm({ kioskSystemInfo: v })} />
                <ToggleRow label="Lock hardware buttons" checked={mdm.kioskLockButtons} onChange={(v) => patchMdm({ kioskLockButtons: v })} />
                <ToggleRow label="Allow admin exit" checked={mdm.kioskExit} onChange={(v) => patchMdm({ kioskExit: v })} />

                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide pt-3 pb-1">Device</div>
                <div className="flex items-center gap-3 py-1.5">
                  <div className="w-40 shrink-0 text-sm font-semibold text-slate-600">Screen orientation</div>
                  <div className="flex gap-1.5">
                    {([['none', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']] as const).map(([v, lbl]) => (
                      <button key={v} type="button" onClick={() => patchMdm({ orientation: v })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${mdm.orientation === v ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                        style={mdm.orientation === v ? { background: MDM_TINT } : undefined}>{lbl}</button>
                    ))}
                  </div>
                </div>
                <ToggleRow label="Block status bar" checked={mdm.blockStatusBar} onChange={(v) => patchMdm({ blockStatusBar: v })} />
                <ToggleRow label="Run default launcher" checked={mdm.runDefaultLauncher} onChange={(v) => patchMdm({ runDefaultLauncher: v })} />
                <ToggleRow label="Auto-update apps" checked={mdm.autoUpdate} onChange={(v) => patchMdm({ autoUpdate: v })} />
                <ToggleRow label="Disable screenshots" checked={mdm.disableScreenshots} onChange={(v) => patchMdm({ disableScreenshots: v })} />
                <ToggleRow label="Encrypt device" checked={mdm.encryptDevice} onChange={(v) => patchMdm({ encryptDevice: v })} />
                <ToggleRow label="Lock safe settings" checked={mdm.lockSafeSettings} onChange={(v) => patchMdm({ lockSafeSettings: v })} />
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

          {tab === 'files' && (
            isEdit ? <FilesPanel configId={existing!.id} />
              : <div className="text-center text-slate-400 text-sm py-12">
                  <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <div className="font-semibold text-slate-600">Create the profile first</div>
                  <div className="text-xs mt-1">Save the profile, then reopen to push files to its devices.</div>
                </div>
          )}
        </div>

        {tab !== 'apps' && tab !== 'files' && (
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

// Per-configuration file push (native Files tab).
const FilesPanel: React.FC<{ configId: number }> = ({ configId }) => {
  const [assigned, setAssigned] = useState<NativeConfigFile[] | null>(null);
  const [available, setAvailable] = useState<NativeRepoFile[]>([]);
  const [addId, setAddId] = useState('');
  const [addPath, setAddPath] = useState('');

  const load = useCallback(() => {
    api.mdm.native.configFiles(configId).then((r) => { setAssigned(r.assigned); setAvailable(r.available); }).catch(() => setAssigned([]));
  }, [configId]);
  useEffect(() => { load(); }, [load]);

  if (!assigned) return <Spinner />;

  const toggleRemove = async (f: NativeConfigFile) => {
    const next = !f.remove;
    setAssigned((prev) => prev!.map((x) => x.fileId === f.fileId ? { ...x, remove: next } : x));
    await api.mdm.native.setConfigFile(configId, f.fileId, { remove: next }).catch(() => load());
  };
  const savePath = async (f: NativeConfigFile, devicePath: string) => {
    setAssigned((prev) => prev!.map((x) => x.fileId === f.fileId ? { ...x, devicePath } : x));
    await api.mdm.native.setConfigFile(configId, f.fileId, { devicePath }).catch(() => load());
  };
  const unassign = async (f: NativeConfigFile) => {
    setAssigned((prev) => prev!.filter((x) => x.fileId !== f.fileId));
    await api.mdm.native.removeConfigFile(configId, f.fileId).catch(() => {});
    load();
  };
  const add = async () => {
    const id = parseInt(addId, 10);
    if (!Number.isFinite(id)) return;
    setAddId(''); setAddPath('');
    await api.mdm.native.addConfigFile(configId, id, addPath || undefined).catch(() => {});
    load();
  };

  return (
    <div className="space-y-4">
      {/* Add file */}
      <div className="flex items-center gap-2">
        <select value={addId} onChange={(e) => { setAddId(e.target.value); const f = available.find((x) => String(x.id) === e.target.value); if (f && !addPath) setAddPath(f.devicePath); }} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">Add a file from the repository…</option>
          {available.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <input value={addPath} onChange={(e) => setAddPath(e.target.value)} placeholder="/sdcard/path" className="w-40 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-sm font-mono" />
        <button onClick={add} disabled={!addId} className="flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-2 disabled:opacity-50" style={{ background: MDM_TINT }}>
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {assigned.length ? assigned.map((f) => (
          <div key={f.fileId} className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-0">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${MDM_TINT}1f` }}><FolderOpen className="w-4 h-4" style={{ color: MDM_TINT }} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-800 truncate">{f.name}</div>
              <input defaultValue={f.devicePath} onBlur={(e) => e.target.value !== f.devicePath && savePath(f, e.target.value)} placeholder="Device path" className="mt-0.5 w-full text-[11px] text-slate-500 font-mono bg-transparent border border-transparent hover:border-slate-200 focus:border-fuchsia-300 rounded px-1 py-0.5 focus:outline-none" />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 cursor-pointer shrink-0" title="Delete this file from the device">
              <input type="checkbox" checked={f.remove} onChange={() => toggleRemove(f)} className="w-3.5 h-3.5 accent-rose-500" /> Remove
            </label>
            <button onClick={() => unassign(f)} title="Unassign from profile" className="text-slate-300 hover:text-rose-500 shrink-0"><X className="w-4 h-4" /></button>
          </div>
        )) : (
          <div className="text-center text-slate-400 text-sm py-8">
            <FolderOpen className="w-7 h-7 mx-auto mb-2 text-slate-300" />
            <div className="font-semibold text-slate-600">No files pushed by this profile</div>
            <div className="text-xs mt-1">Add one from the repository above. Upload new files from ApexMDM’s Files area.</div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">Assigned files are copied to each device at the given path on check-in · “Remove” deletes the file from the device.</p>
    </div>
  );
};

const QrModal: React.FC<{ config: NativeMdmConfig; qrBase: string; onClose: () => void }> = ({ config, qrBase, onClose }) => {
  const [wifiMode, setWifiMode] = useState<boolean>(Boolean(config.wifiSsid));
  const [wifiPass, setWifiPass] = useState<string>(config.wifiPassword || (config.wifiSsid === 'Raytreat' ? '11073CoRd1' : ''));
  const [copied, setCopied] = useState(false);

  const payload: Record<string, any> = {
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME': 'app.apexmsp.kiosk',
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': 'app.apexmsp.kiosk/app.apexmsp.kiosk.ApexAdminReceiver',
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': `${qrBase}/dpc/latest.apk`,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM': '0xR6fh4AZYbrsMoZcsLTpPPVNqRaxeSaJWhACZ9QQFU',
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM': 'JT1tyKVWthy1tZALtQemYceEGJFkIUUEO0ZLGOX4fAc',
    'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
    'android.app.extra.PROVISIONING_SKIP_ENCRYPTION': true,
    'android.app.extra.PROVISIONING_SKIP_USER_CONSENT': true,
    'android.app.extra.PROVISIONING_SKIP_EDUCATION_SCREENS': true,
    'android.app.extra.PROVISIONING_SKIP_USER_SETUP': true,
    'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': {
      serverUrl: qrBase,
      configId: config.id,
      configName: config.name,
      startUrl: config.startUrl || 'https://raytreat.com',
      kiosk: Boolean(config.kioskMode)
    }
  };

  if (wifiMode && config.wifiSsid) {
    payload['android.app.extra.PROVISIONING_WIFI_SSID'] = config.wifiSsid;
    payload['android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE'] = config.wifiSecurity || 'WPA';
    if (wifiPass) {
      payload['android.app.extra.PROVISIONING_WIFI_PASSWORD'] = wifiPass;
    }
  }

  const jsonStr = JSON.stringify(payload, null, 2);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(jsonStr)}&size=360x360&margin=2`;

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-5 text-white flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-fuchsia-600/30 flex items-center justify-center text-fuchsia-400 font-black text-xs">▲</span>
            <div className="font-bold text-sm text-white truncate">{config.name}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-slate-950 p-1 rounded-xl mt-3 border border-slate-800 text-xs">
          <button
            onClick={() => setWifiMode(false)}
            className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition cursor-pointer ${
              !wifiMode ? 'bg-fuchsia-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Signature (Pre-Connected)
          </button>
          <button
            onClick={() => setWifiMode(true)}
            disabled={!config.wifiSsid}
            className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition cursor-pointer ${
              wifiMode ? 'bg-fuchsia-600 text-white shadow-xs' : 'text-slate-400 hover:text-white disabled:opacity-40'
            }`}
          >
            📶 Auto-Join {config.wifiSsid ? `(${config.wifiSsid})` : 'Wi-Fi'}
          </button>
        </div>

        {wifiMode && (
          <div className="mt-2.5 px-3 py-2 bg-slate-950/90 rounded-xl border border-slate-800 text-xs flex items-center justify-between gap-2">
            <span className="text-slate-400 font-medium shrink-0">Wi-Fi Password:</span>
            <input
              type="text"
              value={wifiPass}
              onChange={(e) => setWifiPass(e.target.value)}
              placeholder="Enter Wi-Fi password"
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-fuchsia-500"
            />
          </div>
        )}

        {/* QR Display Card */}
        <div className="mt-4 p-4 bg-white rounded-2xl shadow-inner flex flex-col items-center justify-center border border-slate-700">
          <img src={qrUrl} alt="Enrollment QR" className="w-64 h-64 rounded-lg object-contain" />
          <div className="text-[10px] text-slate-500 font-mono mt-1">DPC: app.apexmsp.kiosk • Signed Checksum Verified</div>
        </div>

        {/* Instructions */}
        <div className="mt-3 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1">
          <div className="font-semibold text-fuchsia-300">How to enroll tablet:</div>
          <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
            <li>Factory-reset tablet or return to the <strong className="text-slate-200">"Hi there / Welcome"</strong> screen.</li>
            <li>Tap quickly <strong className="text-white">6 times</strong> anywhere on the blank space of the screen.</li>
            <li>Scan the QR code above when the camera opens.</li>
          </ol>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied Provisioning JSON!' : 'Copy Provisioning JSON'}
          </button>
          <a
            href={qrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Full Size
          </a>
        </div>
      </div>
    </div>
  );
};

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
