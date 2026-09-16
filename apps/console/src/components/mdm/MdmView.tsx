import React, { useMemo } from 'react';
import { useApp } from '../../data/AppContext';
import { Smartphone, ExternalLink, RefreshCw } from 'lucide-react';

/**
 * MDM Management — the ApexMDM (Headwind) admin, embedded in-console as a single
 * pane. The left-nav MDM items set `activeSubRailView` to an `mdm-<section>` key;
 * this view maps that to the matching Headwind hash route and frames it. Headwind
 * sends no X-Frame-Options / frame-ancestors, so it embeds cleanly on apexmsp.app.
 * (Phase 4 replaces this with native console screens over the Headwind REST API.)
 */

const MDM_BASE = 'https://android.apexmsp.app';

const ROUTES: Record<string, { label: string; hash: string }> = {
  'mdm-summary':        { label: 'Overview',       hash: '#/summary' },
  'mdm-devices':        { label: 'Devices',        hash: '#/devices' },
  'mdm-applications':   { label: 'Applications',   hash: '#/applications' },
  'mdm-configurations': { label: 'Configurations', hash: '#/configurations' },
  'mdm-files':          { label: 'Files',          hash: '#/files' },
  'mdm-settings':       { label: 'Settings',       hash: '#/settings' }
};

export const MdmView: React.FC = () => {
  const { activeSubRailView } = useApp();
  const route = ROUTES[activeSubRailView] || ROUTES['mdm-summary'];
  // Re-mount the iframe when the section changes so navigation is reliable.
  const src = useMemo(() => `${MDM_BASE}/${route.hash}`, [route.hash]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      <div className="shrink-0 flex items-center gap-2 px-4 h-11 border-b border-slate-200 bg-[#f7f7fd]">
        <Smartphone className="w-4 h-4 text-fuchsia-600" />
        <div className="text-sm font-bold text-slate-800">MDM Management</div>
        <span className="text-slate-300">/</span>
        <div className="text-sm text-slate-500">{route.label}</div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => { const f = document.getElementById('apexmdm-frame') as HTMLIFrameElement | null; if (f) f.src = src; }}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
            title="Reload"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <a
            href={src} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-fuchsia-700 hover:text-fuchsia-800 border border-fuchsia-200 hover:border-fuchsia-300 rounded-md px-2.5 py-1.5 bg-fuchsia-50"
            title="Open ApexMDM in a new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open full
          </a>
        </div>
      </div>
      <iframe
        id="apexmdm-frame"
        key={src}
        src={src}
        title="ApexMDM"
        className="flex-1 min-h-0 w-full border-0 bg-white"
        allow="clipboard-read; clipboard-write; camera; microphone"
      />
    </div>
  );
};

export default MdmView;
