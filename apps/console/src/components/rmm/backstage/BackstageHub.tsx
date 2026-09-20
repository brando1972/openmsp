import React, { useState } from 'react';
import {
  Terminal as TerminalIcon,
  Activity,
  Cog,
  Folder,
  FileText,
  Shield,
  User,
  Globe,
  Maximize2,
  Minimize2,
  Zap,
  Radio,
  ExternalLink
} from 'lucide-react';
import { ManagedDevice } from '../../../types';
import { DeviceTerminal } from '../DeviceTerminal';
import { BackstageProcesses } from './BackstageProcesses';
import { BackstageServices } from './BackstageServices';
import { BackstageFiles } from './BackstageFiles';
import { BackstageEventViewer } from './BackstageEventViewer';

interface BackstageHubProps {
  device: ManagedDevice;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  initialTab?: 'terminal' | 'processes' | 'services' | 'files' | 'events';
}

export const BackstageHub: React.FC<BackstageHubProps> = ({
  device,
  isExpanded,
  onToggleExpand,
  initialTab = 'terminal'
}) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'processes' | 'services' | 'files' | 'events'>(initialTab);
  const [terminalShell, setTerminalShell] = useState<'powershell' | 'cmd' | 'bash'>(
    device.os === 'windows' ? 'powershell' : 'bash'
  );

  const handleOpenTerminalWithCommand = (cmd: string) => {
    setActiveTab('terminal');
    // DeviceTerminal is activated; command can be piped or run
  };

  return (
    <div className="flex flex-col h-full bg-[#06080e] overflow-hidden text-slate-200">
      {/* Backstage Session Identity Banner */}
      <div className="p-3 bg-[#0c101c] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-extrabold text-sm text-white tracking-wide flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Backstage Mode</span>
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-100">{device.name}</span>
            <span className="text-slate-500 font-mono text-[11px]">({device.ipAddress})</span>
          </div>
        </div>

        {/* Live User & Backstage Privilege Badges */}
        <div className="flex items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-800 text-[11px]">
            <User className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">User:</span>
            <strong className="text-emerald-400 font-mono">{device.loggedInUser || 'No active user'}</strong>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-800 text-[11px]">
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400">Domain:</span>
            <span className="text-slate-200 font-mono">{device.domain || 'WORKGROUP'}</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 bg-amber-950/40 text-amber-300 px-2 py-1 rounded border border-amber-800/60 text-[11px] font-semibold">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>NT AUTHORITY\SYSTEM (Session 0)</span>
          </div>

          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition border border-slate-700 ml-1"
              title={isExpanded ? 'Collapse width' : 'Expand full width'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Backstage Sub-Navigation Tabs */}
      <div className="flex items-center bg-[#090d16] border-b border-slate-800 px-2 overflow-x-auto custom-scrollbar shrink-0 text-xs font-bold">
        <button
          onClick={() => setActiveTab('terminal')}
          className={`py-2.5 px-3.5 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'terminal'
              ? 'border-blue-500 text-blue-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
          }`}
        >
          <TerminalIcon className="w-3.5 h-3.5 text-sky-400" />
          <span>Terminal & Shell</span>
        </button>

        <button
          onClick={() => setActiveTab('processes')}
          className={`py-2.5 px-3.5 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'processes'
              ? 'border-blue-500 text-blue-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Task Manager</span>
        </button>

        <button
          onClick={() => setActiveTab('services')}
          className={`py-2.5 px-3.5 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'services'
              ? 'border-blue-500 text-blue-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
          }`}
        >
          <Cog className="w-3.5 h-3.5 text-indigo-400" />
          <span>Services</span>
        </button>

        <button
          onClick={() => setActiveTab('files')}
          className={`py-2.5 px-3.5 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'files'
              ? 'border-blue-500 text-blue-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
          }`}
        >
          <Folder className="w-3.5 h-3.5 text-amber-400" />
          <span>File Explorer</span>
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`py-2.5 px-3.5 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'events'
              ? 'border-blue-500 text-blue-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-purple-400" />
          <span>Event Viewer</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
        {activeTab === 'terminal' && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <DeviceTerminal
              device={device}
              initialShell={terminalShell}
              isExpanded={isExpanded}
              onToggleExpand={onToggleExpand}
            />
          </div>
        )}

        {activeTab === 'processes' && (
          <BackstageProcesses
            device={device}
            onOpenTerminalWithCommand={handleOpenTerminalWithCommand}
          />
        )}

        {activeTab === 'services' && (
          <BackstageServices
            device={device}
            onOpenTerminalWithCommand={handleOpenTerminalWithCommand}
          />
        )}

        {activeTab === 'files' && (
          <BackstageFiles
            device={device}
            onOpenTerminalWithCommand={handleOpenTerminalWithCommand}
          />
        )}

        {activeTab === 'events' && (
          <BackstageEventViewer
            device={device}
            onOpenTerminalWithCommand={handleOpenTerminalWithCommand}
          />
        )}
      </div>
    </div>
  );
};
