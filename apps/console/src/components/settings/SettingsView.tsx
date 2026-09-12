import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import {
  Settings,
  Palette,
  Globe,
  Mail,
  Check,
  Sparkles,
  Building2,
  ShieldCheck,
  Layers,
  LayoutGrid,
  CheckCircle2
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const {
    whiteLabel,
    updateWhiteLabel,
    tabbedNavigationEnabled,
    setTabbedNavigationEnabled
  } = useApp();

  const [companyName, setCompanyName] = useState(whiteLabel.companyName);
  const [primaryColor, setPrimaryColor] = useState(whiteLabel.primaryColor);
  const [accentColor, setAccentColor] = useState(whiteLabel.accentColor);
  const [customDomain, setCustomDomain] = useState(whiteLabel.customDomain);
  const [supportEmail, setSupportEmail] = useState(whiteLabel.supportEmail);
  const [portalMessage, setPortalMessage] = useState(whiteLabel.portalWelcomeMessage);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateWhiteLabel({
      companyName,
      primaryColor,
      accentColor,
      customDomain,
      supportEmail,
      portalWelcomeMessage: portalMessage
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-[#f4f6f8] text-[#1a1a24] space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Settings & Workspace Configuration</h1>
            <p className="text-slate-500 text-xs">Configure SuperOps workspace tabs, MSP branding, themes, and client portal preferences</p>
          </div>
        </div>
      </div>

      {/* Navigation & Multi-Tab Preference Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
            <Layers className="w-4 h-4 text-purple-600" />
            <span>Workspace Navigation & Dynamic Browser Tabs</span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-semibold text-[10px] border border-purple-200">
            SuperOps Feature
          </span>
        </div>

        <div className="flex items-start justify-between gap-6 py-2">
          <div className="space-y-1 max-w-2xl">
            <h4 className="font-semibold text-slate-900 text-xs">Enable Multi-Tab Navigation Mode</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Open multiple asset overviews, tickets, terminal consoles, and customer views simultaneously in browser-style workspace tabs. Active tabs are rendered with SuperOps white tab styling (<code className="font-mono text-purple-700">#ffffff</code>, top-curved <code className="font-mono text-purple-700">10px 10px 0 0</code>) and can be refreshed or closed independently.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={tabbedNavigationEnabled}
              onChange={(e) => setTabbedNavigationEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#090113]"></div>
          </label>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Current navigation mode: <strong className="text-slate-800">{tabbedNavigationEnabled ? 'Dynamic SuperOps Multi-Tab Workspace' : 'Classic Single View Mode'}</strong></span>
          </span>
          <button
            type="button"
            onClick={() => setTabbedNavigationEnabled(!tabbedNavigationEnabled)}
            className="text-xs font-semibold text-purple-700 hover:text-purple-800 underline"
          >
            Switch to {tabbedNavigationEnabled ? 'Classic Mode' : 'Tabbed Mode'}
          </button>
        </div>
      </div>

      {/* Form Settings Grid */}
      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Branding & Custom Colors */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-200 pb-3 text-sm">
            <Palette className="w-4 h-4 text-purple-600" />
            <span>Theme Colors & MSP Identity</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">MSP Organization Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs outline-none focus:bg-white focus:border-purple-500 transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Primary Color (Hex)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono text-xs outline-none focus:bg-white focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Accent Color (Hex)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="flex-1 p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono text-xs outline-none focus:bg-white focus:border-purple-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Custom Domain & Portal Settings */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-200 pb-3 text-sm">
              <Globe className="w-4 h-4 text-purple-600" />
              <span>Custom Domain CNAME & Portal</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Custom Portal CNAME Domain</label>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono text-xs outline-none focus:bg-white focus:border-purple-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Support Email Address</label>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs outline-none focus:bg-white focus:border-purple-500 transition"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs transition shadow-sm flex items-center gap-2 cursor-pointer"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <Sparkles className="w-4 h-4" />}
              <span>{savedSuccess ? 'Settings Applied Live!' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
