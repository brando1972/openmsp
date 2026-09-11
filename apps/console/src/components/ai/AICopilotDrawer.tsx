import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import {
  Bot,
  Sparkles,
  X,
  Send,
  Terminal,
  Play,
  Copy,
  Check,
  Zap,
  TicketCheck,
  FileText
} from 'lucide-react';

export const AICopilotDrawer: React.FC = () => {
  const { isAiDrawerOpen, setIsAiDrawerOpen, aiMessages, sendAIMessage } = useApp();
  const [inputText, setInputText] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isAiDrawerOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendAIMessage(inputText);
    setInputText('');
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col select-none">
      {/* Drawer Header */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 text-white shadow-lg">
            <Sparkles className="w-5 h-5 text-amber-300 animate-spin-slow" />
          </div>
          <div>
            <h2 className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
              <span>Apex AI Copilot</span>
              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 text-[10px] font-extrabold uppercase">
                GPT-4o RMM
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">Autonomous MSP Copilot & Remediation Model</p>
          </div>
        </div>

        <button
          onClick={() => setIsAiDrawerOpen(false)}
          className="p-1 rounded-lg text-slate-400 hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Prompt Suggestions */}
      <div className="p-3 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto custom-scrollbar text-[11px]">
        <button
          onClick={() => sendAIMessage('Generate PowerShell script to fix Print Spooler locks')}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 shrink-0 font-medium"
        >
          Fix Spooler PowerShell
        </button>
        <button
          onClick={() => sendAIMessage('Summarize critical SLA tickets and recommended actions')}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 shrink-0 font-medium"
        >
          SLA Ticket Summary
        </button>
        <button
          onClick={() => sendAIMessage('Generate macOS bash script to purge Xcode and Docker caches')}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-300 shrink-0 font-medium"
        >
          macOS Disk Purge
        </button>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4 text-xs">
        {aiMessages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1.5 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
              <span>{msg.sender === 'user' ? 'Technician' : 'Apex AI'}</span>
              <span>• {msg.timestamp}</span>
            </div>

            <div
              className={`p-3.5 rounded-2xl max-w-[90%] leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-sky-600 text-white font-medium shadow-md'
                  : 'bg-slate-950 border border-slate-800 text-slate-200'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* Code Snippet Box */}
              {msg.codeSnippet && (
                <div className="mt-3 rounded-xl bg-black border border-slate-800 overflow-hidden text-left">
                  <div className="p-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="flex items-center gap-1 text-sky-400">
                      <Terminal className="w-3.5 h-3.5" /> {msg.codeLanguage || 'powershell'}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(msg.codeSnippet!);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      className="hover:text-white flex items-center gap-1"
                    >
                      {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-3 font-mono text-[11px] text-sky-300 overflow-x-auto whitespace-pre">
                    {msg.codeSnippet}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask AI to write PowerShell script, analyze logs, or resolve tickets..."
          className="flex-1 bg-slate-900 border border-slate-800 focus:border-indigo-500 text-slate-100 placeholder-slate-500 px-4 py-2.5 rounded-xl text-xs outline-none"
        />
        <button
          type="submit"
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-md shadow-indigo-600/30"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
