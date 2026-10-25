import React from 'react';
import { RefreshCw, AlertTriangle, Info } from 'lucide-react';

interface BackstageLiveStatusProps {
  state: 'loading' | 'error' | 'unsupported';
  deviceName: string;
  what: string;
  error?: string | null;
  onRetry?: () => void;
}

/** Shared loading / error / unsupported panel for Backstage tabs that read live device data. */
export const BackstageLiveStatus: React.FC<BackstageLiveStatusProps> = ({ state, deviceName, what, error, onRetry }) => {
  if (state === 'loading') {
    return (
      <div className="py-12 text-center text-slate-400 font-sans">
        <RefreshCw className="w-7 h-7 mx-auto mb-2 text-sky-400 animate-spin" />
        <div className="font-bold text-slate-300">Loading {what} from {deviceName}…</div>
        <div className="text-xs text-slate-500 mt-1">The agent checks in every 30 seconds, so this can take up to a minute.</div>
      </div>
    );
  }

  if (state === 'unsupported') {
    return (
      <div className="py-12 text-center text-slate-500 font-sans">
        <Info className="w-8 h-8 mx-auto mb-2 text-slate-600" />
        <div className="font-bold text-slate-400">Live {what} is only available for Windows devices</div>
        <div className="text-xs text-slate-600 mt-1">Use the Terminal tab to inspect this device.</div>
      </div>
    );
  }

  return (
    <div className="py-12 px-6 text-center font-sans">
      <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
      <div className="font-bold text-rose-300">Couldn't load {what} from {deviceName}</div>
      {error && <div className="text-xs text-slate-400 mt-1 max-w-lg mx-auto break-words font-mono">{error}</div>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      )}
    </div>
  );
};
