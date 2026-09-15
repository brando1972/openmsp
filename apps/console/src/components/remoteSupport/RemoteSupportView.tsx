import React, { useState } from 'react';
import {
  Monitor,
  RefreshCw,
  ExternalLink,
  Wifi,
  ShieldCheck,
  Info
} from 'lucide-react';

/**
 * ApexConnect — embedded remote-support device manager.
 *
 * The ApexConnect engine (mesh.apexmsp.app) renders the full device grid and every
 * action we need — remote desktop, terminal, file transfer, power control, etc.
 * We embed it here (the server has AllowFraming enabled) so techs manage devices
 * inside the ApexMSP console, with a "Full screen" pop-out as a fallback.
 *
 * Server URL is configurable at build time via VITE_MESH_URL.
 */
const MESH_URL: string =
  ((import.meta as any)?.env?.VITE_MESH_URL as string) || 'https://mesh.apexmsp.app';

export const RemoteSupportView: React.FC = () => {
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const reload = () => {
    setLoaded(false);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#f4f6f8]">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Remote Support</h1>
              <p className="text-xs text-slate-500">
                Managed devices &middot; remote desktop, terminal, files &amp; power via ApexConnect
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
              <Wifi className="w-3.5 h-3.5" /> ApexMSP Group
            </span>
            <button
              onClick={reload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
              title="Reload the device manager"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <a
              href={MESH_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#090113] text-white text-xs font-semibold hover:bg-slate-800 transition"
              title="Open the full ApexConnect console in a new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Full screen
            </a>
          </div>
        </div>

        {/* First-load hint */}
        {showHint && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-purple-50 border border-purple-100 text-[12px] text-purple-800">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              If prompted, sign in once with your ApexConnect admin account — the session is
              remembered afterward. Every device that has the ApexMSP agent installed appears
              below; click a device for its remote desktop, terminal, files, and power actions.
            </div>
            <button
              onClick={() => setShowHint(false)}
              className="text-purple-400 hover:text-purple-700 text-xs font-semibold cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Embedded MeshCentral device manager */}
      <div className="flex-1 min-h-0 px-6 pb-6">
        <div className="h-full rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden relative">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm z-10 bg-white/70">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading remote support console…
            </div>
          )}
          <iframe
            key={reloadKey}
            src={MESH_URL}
            title="ApexMSP Remote Support"
            className="w-full h-full border-0"
            allow="fullscreen; clipboard-read; clipboard-write; camera; microphone; display-capture"
            onLoad={() => setLoaded(true)}
          />
        </div>
      </div>

      {/* Footer note */}
      <div className="px-6 pb-4 shrink-0 hidden md:flex items-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5" />
        Secured over Cloudflare &middot; agents auto-enroll into the ApexMSP device group
      </div>
    </div>
  );
};
