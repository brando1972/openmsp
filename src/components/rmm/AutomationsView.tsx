import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { SelfHealingRule } from '../../types';
import {
  Zap,
  Play,
  Plus,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  X,
  Laptop,
  Server
} from 'lucide-react';

export const AutomationsView: React.FC = () => {
  const {
    automations,
    automationLogs,
    toggleAutomationRule,
    addAutomationRule,
    triggerAutomationRuleDryRun,
    devices
  } = useApp();

  const [showAddModal, setShowAddModal] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleDesc, setRuleDesc] = useState('');
  const [osTarget, setOsTarget] = useState<'windows' | 'macos' | 'all'>('windows');
  const [triggerType, setTriggerType] = useState<SelfHealingRule['triggerType']>('service_stopped');
  const [actionType, setActionType] = useState<SelfHealingRule['actionType']>('restart_service');
  const [scriptContent, setScriptContent] = useState('');

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;

    const newRule: SelfHealingRule = {
      id: `rule-${Date.now()}`,
      name: ruleName,
      description: ruleDesc,
      enabled: true,
      osTarget,
      triggerType,
      actionType,
      scriptContent,
      executionsCount: 0,
      successRate: 100
    };

    addAutomationRule(newRule);
    setShowAddModal(false);
    setRuleName('');
    setRuleDesc('');
    setScriptContent('');
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Self-Healing & Autonomous RMM Remediation</h1>
            <p className="text-slate-400 text-xs">Event-driven triggers, service recovery & automated script policies</p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition shadow-lg shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>New Remediation Rule</span>
        </button>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {automations.map(rule => (
          <div key={rule.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`p-1.5 rounded-lg ${rule.enabled ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
                    <Zap className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-slate-100 text-sm">{rule.name}</h3>
                </div>

                {/* Toggle Button */}
                <button
                  onClick={() => toggleAutomationRule(rule.id)}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold border transition ${
                    rule.enabled
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {rule.enabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>

              <p className="text-slate-400 text-xs mt-2">{rule.description}</p>

              <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Target OS:</span>
                  <span className="font-semibold text-slate-200 uppercase">{rule.osTarget}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Trigger Condition:</span>
                  <span className="font-mono text-amber-400">{rule.triggerType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Remediation Action:</span>
                  <span className="font-mono text-sky-400">{rule.actionType}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3 text-slate-400">
                <span>Executions: <strong className="text-slate-200">{rule.executionsCount}</strong></span>
                <span>Success: <strong className="text-emerald-400">{rule.successRate}%</strong></span>
              </div>

              <button
                onClick={() => {
                  const targetDevice = devices.find(d => {
                    const deviceOs = d.os === 'windows' ? 'windows' : d.os === 'macos' ? 'macos' : d.os;
                    return rule.osTarget === 'all' || rule.osTarget === deviceOs;
                  });
                  if (targetDevice) {
                    triggerAutomationRuleDryRun(rule.id, targetDevice.id, true);
                  } else {
                    alert(`No compatible device found for rule "${rule.name}" (targets ${rule.osTarget})`);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 transition"
              >
                <Play className="w-3.5 h-3.5" /> Test Run Rule
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Execution Logs Table */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <h2 className="font-bold text-slate-100 text-sm">Self-Healing Real-time Execution Audit Log</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider">
              <tr>
                <th className="p-3 rounded-l-xl">Status</th>
                <th className="p-3">Rule Name</th>
                <th className="p-3">Target Endpoint</th>
                <th className="p-3">Timestamp</th>
                <th className="p-3 rounded-r-xl">Execution Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {automationLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-800/30">
                  <td className="p-3">
                    {log.status === 'success' ? (
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> SUCCESS
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-400 font-bold">
                        <XCircle className="w-3.5 h-3.5" /> FAILED
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-bold text-slate-200">{log.ruleName}</td>
                  <td className="p-3 text-sky-400 font-mono">{log.deviceName}</td>
                  <td className="p-3 text-slate-400">{log.timestamp}</td>
                  <td className="p-3 text-slate-300 font-mono text-[11px] max-w-xs truncate">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateRule} className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-bold text-slate-100 text-base">New Self-Healing Automation Rule</h2>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Rule Name</label>
              <input
                type="text"
                required
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="e.g. Windows Search Indexer Reset"
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Description</label>
              <input
                type="text"
                value={ruleDesc}
                onChange={(e) => setRuleDesc(e.target.value)}
                placeholder="What problem does this self-healing rule solve?"
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs outline-none focus:border-sky-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">OS Target</label>
                <select
                  value={osTarget}
                  onChange={(e) => setOsTarget(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 outline-none"
                >
                  <option value="windows">Windows</option>
                  <option value="macos">macOS</option>
                  <option value="all">All Platforms</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">Trigger Condition</label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 outline-none"
                >
                  <option value="service_stopped">Service Stopped</option>
                  <option value="high_cpu">CPU Usage &gt; Threshold</option>
                  <option value="high_disk">Disk Usage &gt; Threshold</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Remediation PowerShell / Bash Script</label>
              <textarea
                rows={3}
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                placeholder="Restart-Service -Name WSearch -Force"
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sky-400 font-mono text-xs outline-none focus:border-sky-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs"
              >
                Save & Enable Rule
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
