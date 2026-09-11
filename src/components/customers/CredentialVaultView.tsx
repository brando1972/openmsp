import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { EncryptedCredential } from '../../types';
import {
  Key, Lock, Eye, EyeOff, Copy, Plus, Trash2, Edit2, ShieldCheck,
  Search, Server, Wifi, Shield, Check
} from 'lucide-react';

interface Props {
  customerId: string;
  siteId?: string;
}

export const CredentialVaultView: React.FC<Props> = ({ customerId, siteId }) => {
  const {
    customers, credentials,
    addCredential, updateCredential, deleteCredential
  } = useApp();

  const customer = customers.find(c => c.id === customerId);
  const activeSite = siteId
    ? customer?.jobSites.find(s => s.id === siteId)
    : customer?.jobSites[0];

  const siteCredentials = credentials.filter(c => c.siteId === activeSite?.id);

  const [searchQuery, setSearchQuery] = useState('');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCred, setEditingCred] = useState<EncryptedCredential | null>(null);
  const [formData, setFormData] = useState<Partial<EncryptedCredential>>({
    title: '', assetType: 'Firewall / Router', username: 'admin', password: '', notes: ''
  });

  const toggleReveal = (id: string) => {
    setRevealedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredCredentials = siteCredentials.filter(c => {
    const q = searchQuery.toLowerCase();
    return !searchQuery ||
      c.title.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      c.assetType.toLowerCase().includes(q);
  });

  const handleOpenAdd = () => {
    setEditingCred(null);
    setFormData({
      title: '', assetType: 'Firewall / Router', username: 'admin', password: '', notes: ''
    });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.username || !formData.password) {
      alert('Title, Username, and Password are required.');
      return;
    }
    if (!activeSite) return;

    if (editingCred) {
      updateCredential({ ...editingCred, ...formData } as EncryptedCredential);
    } else {
      addCredential({
        id: `cred-${Date.now()}`,
        siteId: activeSite.id,
        title: formData.title || '',
        assetType: (formData.assetType as any) || 'Firewall / Router',
        username: formData.username || '',
        password: formData.password || '',
        lastRotated: new Date().toISOString().split('T')[0],
        notes: formData.notes
      });
    }
    setIsModalOpen(false);
  };

  if (!activeSite) {
    return (
      <div className="p-6 text-center text-slate-400">
        <Lock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p>No site selected for credential vault access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs">
      {/* Vault Header Banner */}
      <div className="bg-slate-950 text-white rounded-xl p-4 shadow-lg border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500 text-slate-950 flex items-center">
              <ShieldCheck className="w-3 h-3 mr-1" /> AES-256 Encrypted Vault
            </span>
            <span className="text-slate-400 font-mono text-[11px]">{activeSite.name}</span>
          </div>
          <h2 className="text-base font-black text-white mt-1">Credentials & Passwords</h2>
          <p className="text-slate-400 text-[11px]">Secure storage for router, firewall, NVR, WiFi, and domain accounts.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-md transition"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Credential</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search credentials by title, username, or asset type..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {/* Credentials List */}
      {filteredCredentials.length === 0 ? (
        <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-slate-200 p-6">
          <Key className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="font-semibold">No credentials found in vault for this site.</p>
          <button onClick={handleOpenAdd} className="mt-2 text-emerald-700 hover:underline font-bold text-xs">
            + Store First Secret / Password
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredCredentials.map(cred => {
            const isRevealed = !!revealedIds[cred.id];
            const isCopied = copiedId === cred.id;

            return (
              <div key={cred.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 hover:border-emerald-500 transition">
                <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                  <div>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-[9px] uppercase border border-slate-200">
                      {cred.assetType}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm mt-1">{cred.title}</h4>
                    {cred.lastRotated && <p className="text-slate-400 text-[10px]">Rotated: {cred.lastRotated}</p>}
                  </div>
                  <div className="flex items-center space-x-1">
                    <button onClick={() => { setEditingCred(cred); setFormData(cred); setIsModalOpen(true); }} className="p-1 text-slate-400 hover:text-slate-700 rounded">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (confirm(`Delete credential "${cred.title}"?`)) deleteCredential(cred.id); }} className="p-1 text-slate-400 hover:text-red-600 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Username Field */}
                <div className="space-y-1">
                  <span className="text-slate-400 font-bold text-[10px] uppercase block">Username / Account</span>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-900 flex items-center justify-between">
                    <span className="select-all">{cred.username}</span>
                    <button
                      onClick={() => handleCopy(cred.username, `${cred.id}-user`)}
                      className="text-slate-400 hover:text-slate-700 text-[10px] flex items-center space-x-1 ml-2"
                    >
                      {copiedId === `${cred.id}-user` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1">
                  <span className="text-slate-400 font-bold text-[10px] uppercase block">Password / Secret Key</span>
                  <div className="bg-slate-900 text-emerald-400 rounded-lg p-2 font-mono font-bold flex items-center justify-between">
                    <span className="select-all">
                      {isRevealed ? cred.password : '••••••••••••••••'}
                    </span>
                    <div className="flex items-center space-x-2 text-slate-400">
                      <button onClick={() => toggleReveal(cred.id)} className="hover:text-white">
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => handleCopy(cred.password, cred.id)} className="hover:text-emerald-300">
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {cred.notes && (
                  <p className="text-[11px] text-slate-600 italic bg-amber-50/50 p-1.5 rounded border border-amber-100">
                    💡 {cred.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Credential Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md p-4 sm:p-5 text-slate-800 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900">{editingCred ? `Edit: ${editingCred.title}` : 'Store New Credential'}</h3>
              <button onClick={() => setIsModalOpen(false)}><Shield className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Title / System Name: *</label>
                <input required type="text" value={formData.title || ''} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. FortiGate Firewall Admin" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Asset Category:</label>
                <select value={formData.assetType || 'Firewall / Router'} onChange={e => setFormData({ ...formData, assetType: e.target.value as any })} className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold">
                  <option value="Firewall / Router">Firewall / Router</option>
                  <option value="Switch">Switch</option>
                  <option value="Server">Server</option>
                  <option value="NVR / CCTV">NVR / CCTV</option>
                  <option value="WiFi WPA2/3 Key">WiFi WPA2/3 Key</option>
                  <option value="Domain Admin">Domain Admin</option>
                  <option value="Web Portal">Web Portal</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Username / Account ID: *</label>
                <input required type="text" value={formData.username || ''} onChange={e => setFormData({ ...formData, username: e.target.value })} placeholder="admin" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono font-bold" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Password / Secret Key: *</label>
                <input required type="text" value={formData.password || ''} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="Enter secure password" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono font-bold text-emerald-800" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Web Access URL:</label>
                <textarea rows={2} value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="HTTPS port, web UI address, special instructions..." className="w-full bg-slate-50 border border-slate-300 rounded p-2" />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-200 rounded font-bold text-xs">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs shadow">Save Credential</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
