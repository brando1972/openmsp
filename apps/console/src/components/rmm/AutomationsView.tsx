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
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-[#f4f6f8] text-[#1a1a24] space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Self-Healing & Autonomous RMM Remediation</h1>
            <p className="text-slate-500 text-xs">Event-driven triggers, service recovery & automated script policies</p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs transition shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Remediation Rule</span>
        </button>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {automations.map(rule => (
          <div key={rule.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`p-1.5 rounded-lg ${rule.enabled ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-slate-100 text-slate-400'}`}>
                    <Zap className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-slate-800 text-sm">{rule.name}</h3>
                </div>

                {/* Toggle Button */}
                <button
                  onClick={() => toggleAutomationRule(rule.id)}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold border transition cursor-pointer ${
                    rule.enabled
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-slate-100 border-slate-200 text-slate-500'
                  }`}
                >
                  {rule.enabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>

              <p className="text-slate-500 text-xs mt-2">{rule.description}</p>

              <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Target OS:</span>
                  <span className="font-semibold text-slate-700 uppercase">{rule.osTarget}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Trigger Condition:</span>
                  <span className="font-mono text-amber-700 font-semibold">{rule.triggerType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Remediation Action:</span>
                  <span className="font-mono text-purple-700 font-semibold">{rule.actionType}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3 text-slate-500">
                <span>Executions: <strong className="text-slate-800">{rule.executionsCount}</strong></span>
                <span>Success: <strong className="text-emerald-600">{rule.successRate}%</strong></span>
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
                className="px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" /> Test Run Rule
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Execution Logs Table */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-600" />
          <h2 className="font-bold text-slate-800 text-sm">Self-Healing Real-time Execution Audit Log</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
              <tr>
                <th className="py-3 px-4 rounded-l-lg">Status</th>
                <th className="py-3 px-4">Rule Name</th>
                <th className="py-3 px-4">Target Endpoint</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 rounded-r-lg">Execution Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {automationLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4">
                    {log.status === 'success' ? (
                      <span className="flex items-center gap-1 text-emerald-700 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> SUCCESS
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-700 font-bold">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" /> FAILED
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-800">{log.ruleName}</td>
                  <td className="py-3 px-4 text-purple-700 font-mono">{log.deviceName}</td>
                  <td className="py-3 px-4 text-slate-500">{log.timestamp}</td>
                  <td className="py-3 px-4 text-slate-600 font-mono text-[11px] max-w-xs truncate">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateRule} className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-bold text-slate-900 text-base">New Self-Healing Automation Rule</h2>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Rule Name</label>
              <input
                type="text"
                required
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="e.g. Windows Search Indexer Reset"
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs outline-none focus:bg-white focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
              <input
                type="text"
                value={ruleDesc}
                onChange={(e) => setRuleDesc(e.target.value)}
                placeholder="What problem does this self-healing rule solve?"
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs outline-none focus:bg-white focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">OS Target</label>
                <select
                  value={osTarget}
                  onChange={(e) => setOsTarget(e.target.value as any)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 outline-none"
                >
                  <option value="windows">Windows</option>
                  <option value="macos">macOS</option>
                  <option value="all">All Platforms</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Trigger Condition</label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as any)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 outline-none"
                >
                  <option value="service_stopped">Service Stopped</option>
                  <option value="high_cpu">CPU Usage &gt; Threshold</option>
                  <option value="high_disk">Disk Usage &gt; Threshold</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Remediation Script</label>
              <textarea
                rows={3}
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                placeholder="Restart-Service -Name WSearch -Force"
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs outline-none focus:bg-white focus:border-purple-500"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs shadow-sm"
              >
                Save &amp; Enable Rule
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
