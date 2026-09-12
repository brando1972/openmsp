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
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-[#f4f6f8] text-[#1a1a24] space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">OS & Third-Party Patch Management Engine</h1>
            <p className="text-slate-500 text-xs">Windows Cumulative Updates, macOS Security releases, and Chrome/Edge silent patches</p>
          </div>
        </div>

        <div className="text-right text-xs">
          <div className="text-slate-500 font-medium">Fleet Patch Compliance</div>
          <div className="text-2xl font-black text-emerald-600">92.4%</div>
        </div>
      </div>

      {/* Patch Compliance Matrix */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-800 text-sm">Pending Security Patches & Compliance Matrix</h2>

        <div className="space-y-3">
          {patches.map(patch => {
            const isFullyInstalled = patch.installedDevicesCount >= patch.affectedDevicesCount;
            return (
              <div
                key={patch.id}
                className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-purple-700 text-xs">{patch.kbArticle}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      patch.severity === 'critical' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {patch.severity.toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] uppercase font-semibold">
                      {patch.targetOs}
                    </span>
                  </div>

                  <h3 className="font-semibold text-slate-800 text-xs mt-1.5">{patch.title}</h3>
                  <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-1">
                    <span>Category: <strong className="text-slate-700">{patch.category}</strong></span>
                    <span>Released: <strong className="text-slate-700">{patch.releaseDate}</strong></span>
                    <span>Installed: <strong className="text-emerald-700">{patch.installedDevicesCount}</strong> / {patch.affectedDevicesCount} Endpoints</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!patch.approved ? (
                    <button
                      onClick={() => approvePatch(patch.id)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition shadow-2xs"
                    >
                      Approve Patch
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                  )}

                  <button
                    onClick={() => deployPatchToDevices(patch.id)}
                    disabled={!patch.approved || isFullyInstalled}
                    className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition ${
                      patch.approved && !isFullyInstalled
                        ? 'bg-[#090113] hover:bg-slate-800 text-white shadow-xs cursor-pointer'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isFullyInstalled ? 'Fully Deployed' : 'Deploy Now'}</span>
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
