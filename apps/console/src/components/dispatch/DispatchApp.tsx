import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  MapPin, Navigation, MessageSquare, Send, ChevronLeft, Plus, Power, LogOut,
  Clock, User, Radio, Loader2, CheckCircle2, Circle, Map as MapIcon, ListChecks, X, Phone
} from 'lucide-react';
import { useApp } from '../../data/AppContext';
import { api } from '../../services/api';
import type {
  DispatchJob, DispatchJobStatus, JobMessage, TechLocation, DispatchTech
} from '@openmsp/api-types';

/* ==========================================================================
   ApexMSP Dispatch — installable mobile field-service app (/dispatch).
   Role-aware: dispatchers (owner/admin) get a job board + live tech map;
   techs get their assigned jobs, status actions, per-job chat, and a shift
   toggle that streams GPS. Shares the console's auth + WebSocket via useApp().
   ========================================================================== */

const STATUS: Record<DispatchJobStatus, { label: string; color: string }> = {
  unassigned: { label: 'Unassigned', color: '#94a3b8' },
  assigned:   { label: 'Assigned',   color: '#818cf8' },
  accepted:   { label: 'Accepted',   color: '#38bdf8' },
  en_route:   { label: 'En route',   color: '#f59e0b' },
  on_site:    { label: 'On site',    color: '#10b981' },
  done:       { label: 'Done',       color: '#22c55e' },
  cancelled:  { label: 'Cancelled',  color: '#ef4444' }
};
const PRIORITY: Record<string, string> = { low: '#64748b', normal: '#38bdf8', high: '#f59e0b', urgent: '#ef4444' };

// The forward action a tech takes from each status.
const TECH_NEXT: Partial<Record<DispatchJobStatus, { label: string; to: DispatchJobStatus }>> = {
  assigned: { label: 'Accept job', to: 'accepted' },
  accepted: { label: "I'm en route", to: 'en_route' },
  en_route: { label: 'Arrived on site', to: 'on_site' },
  on_site:  { label: 'Complete job', to: 'done' }
};

// ---- small helpers ----------------------------------------------------------
function timeAgo(iso?: string) {
  if (!iso) return '';
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}
function whenLabel(iso?: string) {
  if (!iso) return '';
  const dt = new Date(iso);
  return dt.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('no geolocation')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
  });
}
function openMaps(job: DispatchJob) {
  const dest = job.location ? `${job.location.lat},${job.location.lng}` : encodeURIComponent(job.address);
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank', 'noopener');
}

const StatusPill: React.FC<{ s: DispatchJobStatus; small?: boolean }> = ({ s, small }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full font-semibold ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'}`}
    style={{ color: STATUS[s].color, background: `${STATUS[s].color}1a` }}
  >
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS[s].color }} />
    {STATUS[s].label}
  </span>
);

// ---- shared data hooks ------------------------------------------------------
function useJobs(activeOnly: boolean) {
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    api.dispatch.listJobs(activeOnly ? { active: true } : undefined)
      .then((r) => setJobs(r.jobs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeOnly]);
  useEffect(() => {
    load();
    const unsub = api.ws.on('dispatch.job', (e: any) => {
      const j = e.payload as DispatchJob;
      setJobs((prev) => {
        const others = prev.filter((x) => x.id !== j.id);
        return [j, ...others];
      });
    });
    return unsub;
  }, [load]);
  return { jobs, loading, reload: load, setJobs };
}

function useThread(jobId: string | null) {
  const [messages, setMessages] = useState<JobMessage[]>([]);
  useEffect(() => {
    if (!jobId) { setMessages([]); return; }
    api.dispatch.listMessages(jobId).then((r) => setMessages(r.messages || [])).catch(() => {});
    const unsub = api.ws.on('dispatch.message', (e: any) => {
      const m = e.payload as JobMessage;
      if (m.jobId !== jobId) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });
    return unsub;
  }, [jobId]);
  return { messages, setMessages };
}

// ===========================================================================
// Root
// ===========================================================================
export const DispatchApp: React.FC = () => {
  const { isAuthenticated, currentUser } = useApp();
  if (!isAuthenticated || !currentUser) return <DispatchLogin />;
  const dispatcher = currentUser.role === 'owner' || currentUser.role === 'admin';
  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a0b10] text-slate-100 overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {dispatcher ? <DispatcherApp /> : <TechApp />}
    </div>
  );
};

// ---- login ------------------------------------------------------------------
const DispatchLogin: React.FC = () => {
  const { login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr(''); setBusy(true);
    try { await login(email.trim(), password); }
    catch { setErr('Sign-in failed. Check your credentials.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-[#0a0b10] text-slate-100 flex flex-col items-center justify-center px-6" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#ff2d6f] to-[#ff0055] flex items-center justify-center shadow-lg">
            <MapPin className="w-8 h-8 text-white" />
          </div>
          <div className="text-xl font-bold">ApexMSP Dispatch</div>
          <div className="text-xs text-slate-400">Field jobs · GPS · messaging</div>
        </div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoCapitalize="none"
          placeholder="Email" className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[#ff0055]" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Password" className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[#ff0055]" />
        {err && <div className="text-sm text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg px-3 py-2">{err}</div>}
        <button onClick={submit} disabled={busy}
          className="mt-1 bg-[#ff0055] hover:bg-[#e0004c] text-white font-semibold rounded-xl px-4 py-3 flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in'}
        </button>
      </div>
    </div>
  );
};

// ---- header -----------------------------------------------------------------
const AppHeader: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => {
  const { currentUser, logout } = useApp();
  return (
    <div className="shrink-0 flex items-center gap-2 px-4 h-14 border-b border-white/10 bg-[#0a0b10]">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-b from-[#ff2d6f] to-[#ff0055] flex items-center justify-center">
        <MapPin className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold leading-tight truncate">{title}</div>
        <div className="text-[11px] text-slate-400 truncate">{currentUser?.name}</div>
      </div>
      {right}
      <button onClick={() => logout()} className="p-2 text-slate-400 hover:text-white" title="Sign out"><LogOut className="w-4 h-4" /></button>
    </div>
  );
};

// ===========================================================================
// TECH
// ===========================================================================
const TechApp: React.FC = () => {
  const { jobs, loading } = useJobs(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [onShift, setOnShift] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSent = useRef<{ lat: number; lng: number; t: number } | null>(null);

  // Load current shift state on mount.
  useEffect(() => { api.dispatch.getShift().then((r) => setOnShift(!!r.shift?.onShift)).catch(() => {}); }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }, []);

  const startWatch = useCallback(() => {
    if (!('geolocation' in navigator) || watchIdRef.current !== null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy, heading, speed } = pos.coords;
        const now = Date.now();
        const prev = lastSent.current;
        const moved = prev ? haversine(prev, { lat, lng }) : Infinity;
        // Throttle: report at most every 15s, or sooner after moving >25m.
        if (prev && now - prev.t < 15000 && moved < 25) return;
        lastSent.current = { lat, lng, t: now };
        api.dispatch.reportLocation({
          lat, lng,
          accuracy: accuracy ?? undefined,
          heading: heading != null && !Number.isNaN(heading) ? heading : undefined,
          speedMps: speed != null && !Number.isNaN(speed) ? speed : undefined
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  }, []);

  useEffect(() => { if (onShift) startWatch(); else stopWatch(); return stopWatch; }, [onShift, startWatch, stopWatch]);

  const toggleShift = async () => {
    const next = !onShift;
    setOnShift(next);
    try { await api.dispatch.setShift(next); } catch { setOnShift(!next); return; }
    if (next) { try { const p = await getPosition(); api.dispatch.reportLocation({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }).catch(() => {}); } catch { /* user denied */ } }
  };

  const active = jobs.filter((j) => j.status !== 'done' && j.status !== 'cancelled');
  const doneJobs = jobs.filter((j) => j.status === 'done' || j.status === 'cancelled');

  if (openId) return <JobDetail jobId={openId} onBack={() => setOpenId(null)} asDispatcher={false} />;

  return (
    <>
      <AppHeader title="My Jobs" right={
        <button onClick={toggleShift}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border ${onShift ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/15 text-slate-300'}`}>
          <Power className="w-3.5 h-3.5" /> {onShift ? 'On shift' : 'Off'}
        </button>
      } />
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {onShift && (
          <div className="flex items-center gap-2 text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <Radio className="w-3.5 h-3.5 animate-pulse" /> Sharing your location with dispatch while on shift.
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
        ) : active.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-16">No active jobs assigned to you.</div>
        ) : active.map((j) => <TechJobCard key={j.id} job={j} onOpen={() => setOpenId(j.id)} />)}

        {doneJobs.length > 0 && (
          <>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide pt-3 px-1">Recently closed</div>
            {doneJobs.slice(0, 10).map((j) => <TechJobCard key={j.id} job={j} onOpen={() => setOpenId(j.id)} muted />)}
          </>
        )}
      </div>
    </>
  );
};

const TechJobCard: React.FC<{ job: DispatchJob; onOpen: () => void; muted?: boolean }> = ({ job, onOpen, muted }) => (
  <button onClick={onOpen} className={`w-full text-left bg-white/5 border border-white/10 rounded-xl p-3.5 active:bg-white/10 ${muted ? 'opacity-60' : ''}`}>
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-6 rounded-full" style={{ background: PRIORITY[job.priority] }} />
          <div className="font-semibold text-[15px] truncate">{job.title}</div>
        </div>
        <div className="text-xs text-slate-400 mt-1 truncate">{job.customerName} · {job.address}</div>
        <div className="flex items-center gap-2 mt-2">
          <StatusPill s={job.status} small />
          {job.scheduledStart && <span className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{whenLabel(job.scheduledStart)}</span>}
        </div>
      </div>
    </div>
  </button>
);

// ===========================================================================
// JOB DETAIL (shared; dispatcher gets reassign/cancel)
// ===========================================================================
const JobDetail: React.FC<{ jobId: string; onBack: () => void; asDispatcher: boolean }> = ({ jobId, onBack, asDispatcher }) => {
  const [job, setJob] = useState<DispatchJob | null>(null);
  const [busy, setBusy] = useState(false);
  const { messages, setMessages } = useThread(jobId);

  const load = useCallback(() => { api.dispatch.getJob(jobId).then((r) => { setJob(r.job); setMessages(r.messages || []); }).catch(() => {}); }, [jobId, setMessages]);
  useEffect(() => {
    load();
    const unsub = api.ws.on('dispatch.job', (e: any) => { const j = e.payload as DispatchJob; if (j.id === jobId) setJob(j); });
    return unsub;
  }, [load, jobId]);

  const advance = async (to: DispatchJobStatus) => {
    setBusy(true);
    let location: { lat: number; lng: number; accuracy?: number } | undefined;
    try { const p = await getPosition(); location = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }; } catch { /* no fix */ }
    try { const r = await api.dispatch.updateStatus(jobId, { status: to, location }); setJob(r.job); } catch { /* ignore */ } finally { setBusy(false); }
  };

  if (!job) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>;
  const next = !asDispatcher ? TECH_NEXT[job.status] : undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-2 px-3 h-14 border-b border-white/10">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-300"><ChevronLeft className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold truncate">{job.title}</div>
          <div className="text-[11px] text-slate-500">{job.jobNumber}</div>
        </div>
        <StatusPill s={job.status} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* facts */}
        <div className="p-3 space-y-3 border-b border-white/10">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{job.customerName}</div>
              <div className="text-xs text-slate-400">{job.address}</div>
            </div>
            <button onClick={() => openMaps(job)} className="flex items-center gap-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-2.5 py-1.5">
              <Navigation className="w-3.5 h-3.5" /> Go
            </button>
          </div>
          {job.description && <div className="text-sm text-slate-300 bg-white/5 rounded-lg p-2.5">{job.description}</div>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
            {job.assignedTechName && <span className="flex items-center gap-1"><User className="w-3 h-3" />{job.assignedTechName}</span>}
            {job.scheduledStart && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{whenLabel(job.scheduledStart)}</span>}
            <span className="flex items-center gap-1">Priority: <b style={{ color: PRIORITY[job.priority] }}>{job.priority}</b></span>
          </div>
        </div>

        {/* tech action */}
        {next && (
          <div className="p-3 border-b border-white/10">
            <button onClick={() => advance(next.to)} disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-[#ff0055] hover:bg-[#e0004c] text-white font-bold rounded-xl py-3.5 text-[15px] disabled:opacity-60">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-5 h-5" /> {next.label}</>}
            </button>
          </div>
        )}
        {asDispatcher && <DispatcherJobControls job={job} onChanged={setJob} />}

        {/* timeline */}
        <div className="p-3 border-b border-white/10">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Timeline</div>
          <div className="space-y-2">
            {job.events.slice().reverse().map((ev, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Circle className="w-2.5 h-2.5 mt-1 shrink-0" style={{ color: STATUS[ev.status].color, fill: STATUS[ev.status].color }} />
                <div className="min-w-0 flex-1">
                  <span className="text-slate-200">{STATUS[ev.status].label}</span>
                  {ev.note && <span className="text-slate-400"> · {ev.note}</span>}
                  <span className="text-slate-500"> · {ev.byName} · {timeAgo(ev.at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* chat */}
        <JobChat jobId={jobId} messages={messages} />
      </div>
    </div>
  );
};

// dispatcher-only reassign / cancel controls inside the detail
const DispatcherJobControls: React.FC<{ job: DispatchJob; onChanged: (j: DispatchJob) => void }> = ({ job, onChanged }) => {
  const [techs, setTechs] = useState<DispatchTech[]>([]);
  useEffect(() => { api.dispatch.listTechs().then((r) => setTechs(r.techs || [])).catch(() => {}); }, []);
  const reassign = async (techId: string) => { if (!techId) return; try { const r = await api.dispatch.assign(job.id, techId); onChanged(r.job); } catch { /* */ } };
  const cancel = async () => { try { const r = await api.dispatch.updateStatus(job.id, { status: 'cancelled' }); onChanged(r.job); } catch { /* */ } };
  return (
    <div className="p-3 border-b border-white/10 flex items-center gap-2">
      <select value={job.assignedTechId || ''} onChange={(e) => reassign(e.target.value)}
        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm">
        <option value="">Assign tech…</option>
        {techs.map((t) => <option key={t.id} value={t.id} className="bg-slate-900">{t.name}{t.onShift ? ' · on shift' : ''}</option>)}
      </select>
      {job.status !== 'cancelled' && job.status !== 'done' && (
        <button onClick={cancel} className="text-xs font-semibold text-rose-300 border border-rose-800 rounded-lg px-3 py-2.5">Cancel</button>
      )}
    </div>
  );
};

const JobChat: React.FC<{ jobId: string; messages: JobMessage[] }> = ({ jobId, messages }) => {
  const { currentUser } = useApp();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  const send = async () => {
    const body = text.trim(); if (!body) return; setText('');
    try { await api.dispatch.sendMessage(jobId, body); } catch { /* */ }
  };
  return (
    <div className="p-3">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> Messages</div>
      <div className="space-y-2 mb-3">
        {messages.length === 0 && <div className="text-xs text-slate-500 text-center py-4">No messages yet.</div>}
        {messages.map((m) => {
          const mine = m.senderId === currentUser?.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-[#ff0055] text-white rounded-br-sm' : 'bg-white/10 text-slate-100 rounded-bl-sm'}`}>
                {!mine && <div className="text-[10px] text-slate-400 mb-0.5">{m.senderName}</div>}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`text-[9px] mt-0.5 ${mine ? 'text-white/70' : 'text-slate-500'}`}>{timeAgo(m.at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 sticky bottom-0">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Message…" className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-[#ff0055]" />
        <button onClick={send} className="w-10 h-10 rounded-full bg-[#ff0055] flex items-center justify-center shrink-0"><Send className="w-4 h-4 text-white" /></button>
      </div>
    </div>
  );
};

// ===========================================================================
// DISPATCHER
// ===========================================================================
const DispatcherApp: React.FC = () => {
  const [tab, setTab] = useState<'board' | 'map'>('board');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { jobs, loading } = useJobs(false);

  if (openId) return <JobDetail jobId={openId} onBack={() => setOpenId(null)} asDispatcher />;

  return (
    <>
      <AppHeader title="Dispatch" right={
        <div className="flex bg-white/5 rounded-full p-0.5 mr-1">
          <button onClick={() => setTab('board')} className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${tab === 'board' ? 'bg-[#ff0055] text-white' : 'text-slate-300'}`}><ListChecks className="w-3.5 h-3.5" /></button>
          <button onClick={() => setTab('map')} className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${tab === 'map' ? 'bg-[#ff0055] text-white' : 'text-slate-300'}`}><MapIcon className="w-3.5 h-3.5" /></button>
        </div>
      } />
      {tab === 'board' ? (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
          {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
            : jobs.length === 0 ? <div className="text-center text-slate-500 text-sm py-16">No jobs yet. Tap + to create one.</div>
            : jobs.map((j) => <DispatchJobCard key={j.id} job={j} onOpen={() => setOpenId(j.id)} />)}
        </div>
      ) : <LiveMap />}

      {tab === 'board' && (
        <button onClick={() => setCreating(true)}
          className="absolute right-4 bottom-5 w-14 h-14 rounded-full bg-[#ff0055] shadow-lg flex items-center justify-center active:scale-95" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          <Plus className="w-7 h-7 text-white" />
        </button>
      )}
      {creating && <CreateJobSheet onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
    </>
  );
};

const DispatchJobCard: React.FC<{ job: DispatchJob; onOpen: () => void }> = ({ job, onOpen }) => (
  <button onClick={onOpen} className="w-full text-left bg-white/5 border border-white/10 rounded-xl p-3.5 active:bg-white/10">
    <div className="flex items-center gap-2">
      <span className="w-1.5 h-6 rounded-full" style={{ background: PRIORITY[job.priority] }} />
      <div className="font-semibold text-[15px] truncate flex-1">{job.title}</div>
      <StatusPill s={job.status} small />
    </div>
    <div className="text-xs text-slate-400 mt-1 truncate">{job.customerName} · {job.address}</div>
    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
      <span className="flex items-center gap-1"><User className="w-3 h-3" />{job.assignedTechName || 'Unassigned'}</span>
      <span>{timeAgo(job.updatedAt)}</span>
    </div>
  </button>
);

// ---- create job -------------------------------------------------------------
const CreateJobSheet: React.FC<{ onClose: () => void; onCreated: (id: string) => void }> = ({ onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [techId, setTechId] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [techs, setTechs] = useState<DispatchTech[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api.dispatch.listTechs().then((r) => setTechs(r.techs || [])).catch(() => {}); }, []);

  const submit = async () => {
    if (!title || !customerName || !address) { setErr('Title, customer and address are required.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.dispatch.createJob({
        title, customerName, address, description,
        priority: priority as any,
        assignedTechId: techId || undefined,
        scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : undefined
      });
      onCreated(r.job.id);
    } catch { setErr('Could not create the job.'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onMouseDown={onClose}>
      <div className="w-full bg-[#12141b] rounded-t-2xl max-h-[92%] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 bg-[#12141b]">
          <div className="font-bold">New job</div>
          <button onClick={onClose} className="text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          {[
            { v: title, set: setTitle, ph: 'Job title (e.g. Firewall swap)' },
            { v: customerName, set: setCustomerName, ph: 'Customer / site name' },
            { v: address, set: setAddress, ph: 'Address' }
          ].map((f, i) => (
            <input key={i} value={f.v} onChange={(e) => f.set(e.target.value)} placeholder={f.ph}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[#ff0055]" />
          ))}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Details (optional)"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-[#ff0055]" />
          <div className="flex gap-2">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm">
              {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
            </select>
            <select value={techId} onChange={(e) => setTechId(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm">
              <option value="" className="bg-slate-900">Unassigned</option>
              {techs.map((t) => <option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-400 uppercase tracking-wide">Scheduled start (optional)</label>
            <input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)}
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#ff0055]" />
          </div>
          {err && <div className="text-sm text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg px-3 py-2">{err}</div>}
          <button onClick={submit} disabled={busy}
            className="w-full bg-[#ff0055] hover:bg-[#e0004c] text-white font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create job'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---- live tech map ----------------------------------------------------------
const LiveMap: React.FC = () => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<L.Map | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const [locations, setLocations] = useState<TechLocation[]>([]);
  const [techs, setTechs] = useState<DispatchTech[]>([]);

  useEffect(() => {
    api.dispatch.listLocations().then((r) => setLocations(r.locations || [])).catch(() => {});
    api.dispatch.listTechs().then((r) => setTechs(r.techs || [])).catch(() => {});
    const unsub = api.ws.on('dispatch.location', (e: any) => {
      const l = e.payload as TechLocation;
      setLocations((prev) => [l, ...prev.filter((x) => x.userId !== l.userId)]);
    });
    return unsub;
  }, []);

  // init map once
  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([39.5, -98.35], 4);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    mapObj.current = map;
    return () => { map.remove(); mapObj.current = null; markers.current.clear(); };
  }, []);

  // sync markers
  useEffect(() => {
    const map = mapObj.current; if (!map) return;
    const pts: L.LatLngExpression[] = [];
    for (const l of locations) {
      pts.push([l.lat, l.lng]);
      const html = `<div style="display:flex;flex-direction:column;align-items:center">
        <div style="background:${l.onShift ? '#22c55e' : '#64748b'};width:16px;height:16px;border-radius:50%;border:2px solid #0a0b10;box-shadow:0 0 0 2px ${l.onShift ? '#22c55e' : '#64748b'}55"></div>
        <div style="font-size:10px;color:#e2e8f0;background:#0a0b10cc;padding:0 4px;border-radius:4px;margin-top:2px;white-space:nowrap">${l.userName}</div></div>`;
      const icon = L.divIcon({ html, className: '', iconSize: [16, 16], iconAnchor: [8, 8] });
      const existing = markers.current.get(l.userId);
      if (existing) { existing.setLatLng([l.lat, l.lng]); existing.setIcon(icon); }
      else markers.current.set(l.userId, L.marker([l.lat, l.lng], { icon }).addTo(map));
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 15 });
  }, [locations]);

  const onShiftCount = techs.filter((t) => t.onShift).length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={mapRef} className="flex-1 min-h-0 bg-[#0a0b10]" />
      <div className="shrink-0 max-h-[38%] overflow-y-auto border-t border-white/10 bg-[#0a0b10]">
        <div className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Techs · {onShiftCount} on shift</div>
        {techs.map((t) => (
          <div key={t.id} className="flex items-center gap-2 px-3 py-2 border-t border-white/5">
            <span className={`w-2 h-2 rounded-full ${t.onShift ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{t.name}</div>
              <div className="text-[11px] text-slate-500">{t.location ? `updated ${timeAgo(t.location.updatedAt)}` : 'no location'} · {t.openJobs} open</div>
            </div>
            {t.onShift && <span className="text-[10px] font-bold text-emerald-300">ON SHIFT</span>}
          </div>
        ))}
        {techs.length === 0 && <div className="text-center text-slate-500 text-sm py-6">No techs yet.</div>}
      </div>
    </div>
  );
};

export default DispatchApp;
