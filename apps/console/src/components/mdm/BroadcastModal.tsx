import React, { useState } from 'react';
import { Radio, X, AlertTriangle, Info, Bell, CheckCircle2, Loader2, Send } from 'lucide-react';
import { apexMdm } from '../../services/api';
import type { MdmProfile } from '@openmsp/api-types';

interface BroadcastModalProps {
  profiles: MdmProfile[];
  onClose: () => void;
  onSuccess?: () => void;
}

export const BroadcastModal: React.FC<BroadcastModalProps> = ({ profiles, onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('info');
  const [targetProfileId, setTargetProfileId] = useState<string>('all');
  const [requireAck, setRequireAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    setSubmitting(true);
    setErrorMsg('');
    try {
      const fullMessage = `[${severity.toUpperCase()}] ${title.trim()}: ${message.trim()}`;
      await apexMdm.sendBroadcast(fullMessage, requireAck);
      setSuccessMsg('Broadcast alert queued successfully to devices!');
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to dispatch broadcast');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Emergency & Fleet Broadcast</h3>
              <p className="text-xs text-slate-400">Push instant pop-up alerts or evacuation alarms to devices</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {successMsg ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
            <div className="text-base font-semibold text-slate-800">{successMsg}</div>
            <p className="text-xs text-slate-500">Device agents will trigger the alert overlay on their next sync or socket ping.</p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="p-5 space-y-4">
            {errorMsg && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Device Scope</label>
              <select
                value={targetProfileId}
                onChange={(e) => setTargetProfileId(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              >
                <option value="all">All Fleet Devices (Entire Organization)</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    Profile: {p.name} ({p.kioskMode ? 'Kiosk Mode' : 'Standard'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Severity & Tone</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSeverity('info')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                    severity === 'info'
                      ? 'border-sky-500 bg-sky-50 text-sky-700 ring-1 ring-sky-500'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Info className="w-3.5 h-3.5 text-sky-500" />
                  Info Notice
                </button>
                <button
                  type="button"
                  onClick={() => setSeverity('warning')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                    severity === 'warning'
                      ? 'border-amber-500 bg-amber-50 text-amber-700 ring-1 ring-amber-500'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Warning
                </button>
                <button
                  type="button"
                  onClick={() => setSeverity('critical')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                    severity === 'critical'
                      ? 'border-rose-500 bg-rose-50 text-rose-700 ring-1 ring-rose-500'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5 text-rose-500" />
                  Critical Alarm
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Alert Headline / Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Weather Warning / Facility Evacuation"
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Alert Message Body</label>
              <textarea
                required
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter detailed message instructing on-ground operators..."
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 resize-none"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireAck}
                  onChange={(e) => setRequireAck(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500"
                />
                <div>
                  <span className="text-xs font-semibold text-slate-700">Require User Acknowledgment</span>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Locks tablet interaction with an impassable full-screen overlay until operator clicks "Acknowledged" with timestamp recorded.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim() || !message.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Dispatch Broadcast
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
