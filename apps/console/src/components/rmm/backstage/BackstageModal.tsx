import React, { useState } from 'react';
import { X, Maximize2, Minimize2, Zap } from 'lucide-react';
import { ManagedDevice } from '../../../types';
import { BackstageHub } from './BackstageHub';

interface BackstageModalProps {
  device: ManagedDevice;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'terminal' | 'processes' | 'services' | 'files' | 'events';
}

export const BackstageModal: React.FC<BackstageModalProps> = ({
  device,
  isOpen,
  onClose,
  initialTab = 'terminal'
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fadeIn">
      <div
        className={`bg-[#06080e] border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col transition-all duration-200 ${
          isMaximized
            ? 'fixed inset-2 z-50 rounded-lg'
            : 'w-full max-w-6xl h-[88vh]'
        }`}
      >
        {/* Modal Window Titlebar */}
        <div className="bg-[#0b0e17] px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 font-extrabold text-xs border border-amber-800/80 uppercase tracking-wide">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Backstage Remote Session</span>
            </span>
            <span className="text-slate-400 text-xs font-mono">•</span>
            <span className="text-slate-200 text-xs font-bold truncate">{device.name}</span>
            <span className="text-slate-500 text-[11px] font-mono">({device.hostname})</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsMaximized(prev => !prev)}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
              title={isMaximized ? 'Restore window size' : 'Maximize window'}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition"
              title="Close Backstage session"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: BackstageHub */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <BackstageHub
            device={device}
            isExpanded={isMaximized}
            onToggleExpand={() => setIsMaximized(prev => !prev)}
            initialTab={initialTab}
          />
        </div>
      </div>
    </div>
  );
};
