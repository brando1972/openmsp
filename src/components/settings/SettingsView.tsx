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
  ShieldCheck
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { whiteLabel, updateWhiteLabel } = useApp();

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
    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-sky-500/10 text-sky-400">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">MSP White-Label Branding & Customization</h1>
            <p className="text-slate-400 text-xs">Tailor platform themes, client portals, dynamic primary colors & custom CNAME domains</p>
          </div>
        </div>
      </div>

      {/* Form Settings Grid */}
      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Branding & Custom Colors */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5">
          <div className="flex items-center gap-2 text-sky-400 font-bold border-b border-slate-800 pb-3 text-sm">
            <Palette className="w-4 h-4" />
            <span>Theme Colors & MSP Identity</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">MSP Organization Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs outline-none focus:border-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Primary Color (Hex)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer p-1"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Accent Color (Hex)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer p-1"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="flex-1 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Custom Domain & Portal Settings */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold border-b border-slate-800 pb-3 text-sm">
              <Globe className="w-4 h-4" />
              <span>Custom Domain CNAME & Portal</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Custom Portal CNAME Domain</label>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Support Email Address</label>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs transition shadow-lg shadow-sky-500/20 flex items-center gap-2"
            >
              {savedSuccess ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              <span>{savedSuccess ? 'Settings Applied Live!' : 'Save & Deploy White-Label'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
