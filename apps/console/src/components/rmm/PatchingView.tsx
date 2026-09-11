import React from 'react';
import { useApp } from '../../data/AppContext';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Play
} from 'lucide-react';

export const PatchingView: React.FC = () => {
  const { patches, approvePatch, deployPatchToDevices, devices } = useApp();

  return (
    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">OS & Third-Party Patch Management Engine</h1>
            <p className="text-slate-400 text-xs">Windows Cumulative Updates, macOS Security releases, and Chrome/Edge silent patches</p>
          </div>
        </div>

        <div className="text-right text-xs">
          <div className="text-slate-400 font-bold">Fleet Patch Compliance</div>
          <div className="text-2xl font-black text-emerald-400">92.4%</div>
        </div>
      </div>

      {/* Patch Compliance Matrix */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h2 className="font-bold text-slate-100 text-sm">Pending Security Patches & Compliance Matrix</h2>

        <div className="space-y-3">
          {patches.map(patch => {
            const isFullyInstalled = patch.installedDevicesCount >= patch.affectedDevicesCount;
            return (
              <div
                key={patch.id}
                className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sky-400 text-xs">{patch.kbArticle}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      patch.severity === 'critical' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {patch.severity.toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] uppercase font-semibold">
                      {patch.targetOs}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-200 text-xs mt-1.5">{patch.title}</h3>

                  <div className="flex items-center gap-4 text-[11px] text-slate-400 mt-2">
                    <span>Released: {patch.releaseDate}</span>
                    <span>Deployment: <strong className="text-slate-200">{patch.installedDevicesCount} / {patch.affectedDevicesCount} Endpoints</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => approvePatch(patch.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                      patch.approved
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {patch.approved ? 'Approved' : 'Approve Patch'}
                  </button>

                  <button
                    onClick={() => deployPatchToDevices(patch.id)}
                    disabled={isFullyInstalled}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{isFullyInstalled ? 'Fully Installed' : 'Deploy Now'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
