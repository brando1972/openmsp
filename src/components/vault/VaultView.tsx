import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { VaultItem, VaultItemType } from '../../types';
import {
  KeyRound,
  Plus,
  Search,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  ShieldCheck,
  Clock,
  Star,
  Folder,
  RefreshCw,
  X,
  Lock
} from 'lucide-react';

export const VaultView: React.FC = () => {
  const {
    vaultItems,
    addVaultItem,
    deleteVaultItem,
    toggleFavoriteVaultItem,
    generatePassword,
    clients
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // Password Generator Modal / Widget
  const [showGenModal, setShowGenModal] = useState(false);
  const [genLength, setGenLength] = useState(18);
  const [genPass, setGenPass] = useState(() => generatePassword(18));
  const [copiedPass, setCopiedPass] = useState(false);

  // New Vault Item Form
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [folder, setFolder] = useState('Domain Controllers');
  const [itemType, setItemType] = useState<VaultItemType>('login');

  // Eye toggle for passwords in list
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});

  const toggleVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreateVaultItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const client = clients.find(c => c.id === clientId);

    addVaultItem({
      clientId,
      clientName: client?.name || 'All Clients',
      folder,
      type: itemType,
      title,
      username,
      password,
      url,
      notes,
      totpSecret: totpSecret || undefined,
      favorite: false
    });

    setShowAddModal(false);
    setTitle('');
    setUsername('');
    setPassword('');
    setUrl('');
    setNotes('');
  };

  const filteredItems = vaultItems.filter(v => {
    if (selectedFolder !== 'all' && v.folder !== selectedFolder) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return v.title.toLowerCase().includes(q) || v.clientName.toLowerCase().includes(q) || (v.username && v.username.toLowerCase().includes(q));
    }
    return true;
  });

  const foldersList = Array.from(new Set(vaultItems.map(v => v.folder)));

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-base">Bitwarden Zero-Trust Credential Vault</h1>
            <p className="text-slate-400 text-xs">AES-256 client-side zero-knowledge vault, TOTP generator & password auditor</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setGenPass(generatePassword(genLength));
              setShowGenModal(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition"
          >
            <RefreshCw className="w-4 h-4 text-emerald-400" />
            <span>Password Generator</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs transition shadow-md shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* Main Vault Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Folders */}
        <div className="w-60 bg-slate-900 border-r border-slate-800 p-4 space-y-4 shrink-0 hidden md:block">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-400 uppercase tracking-wider">
            <Folder className="w-4 h-4 text-emerald-400" /> Folders
          </div>

          <div className="space-y-1 text-xs font-semibold">
            <button
              onClick={() => setSelectedFolder('all')}
              className={`w-full text-left p-2 rounded-lg transition ${selectedFolder === 'all' ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              All Vault Items ({vaultItems.length})
            </button>

            {foldersList.map(f => (
              <button
                key={f}
                onClick={() => setSelectedFolder(f)}
                className={`w-full text-left p-2 rounded-lg transition truncate ${selectedFolder === f ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Items List */}
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vault logins, servers, or SSH keys..."
              className="w-full bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 pl-9 pr-4 py-2 rounded-xl text-xs outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-3">
            {filteredItems.map(item => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleFavoriteVaultItem(item.id)} className="text-slate-500 hover:text-amber-400">
                    <Star className={`w-4 h-4 ${item.favorite ? 'text-amber-400 fill-amber-400' : ''}`} />
                  </button>
                  <div>
                    <div className="font-bold text-slate-100 text-sm flex items-center gap-2">
                      <span>{item.title}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 text-[10px] font-mono">
                        {item.clientName}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-3">
                      <span>Username: <strong className="text-slate-200">{item.username || 'N/A'}</strong></span>
                      <span>Folder: <span className="text-emerald-400">{item.folder}</span></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* TOTP Counter Widget */}
                  {item.totpSecret && (
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2 text-xs">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-mono font-bold text-emerald-400">{item.totpCode}</span>
                      <span className="text-[10px] text-slate-500 font-mono">({item.totpRemainingSeconds}s)</span>
                    </div>
                  )}

                  {/* Password Copy & Eye Toggle */}
                  <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs">
                    <span className="font-mono text-slate-300 w-32 truncate">
                      {visiblePasswords[item.id] ? item.password : '••••••••••••'}
                    </span>
                    <button
                      onClick={() => toggleVisibility(item.id)}
                      className="p-1 text-slate-400 hover:text-slate-200"
                    >
                      {visiblePasswords[item.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(item.password || '')}
                      className="p-1 text-emerald-400 hover:text-emerald-300"
                      title="Copy Password"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => deleteVaultItem(item.id)}
                    className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Password Generator Modal */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-emerald-400" />
                <h2 className="font-bold text-slate-100 text-base">Bitwarden Password Generator</h2>
              </div>
              <button onClick={() => setShowGenModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-black border border-slate-800 text-center relative">
              <span className="font-mono text-lg font-bold text-emerald-400 tracking-wider break-all">{genPass}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(genPass);
                  setCopiedPass(true);
                  setTimeout(() => setCopiedPass(false), 2000);
                }}
                className="mt-3 w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5"
              >
                {copiedPass ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedPass ? 'Copied to Clipboard!' : 'Copy High-Entropy Password'}</span>
              </button>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                <span>Length</span>
                <span>{genLength} Characters</span>
              </div>
              <input
                type="range"
                min="10"
                max="32"
                value={genLength}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setGenLength(val);
                  setGenPass(generatePassword(val));
                }}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <button
              onClick={() => setGenPass(generatePassword(genLength))}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
            >
              Regenerate Passphrase
            </button>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateVaultItem} className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-bold text-slate-100 text-base">Add New Bitwarden Vault Item</h2>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Item Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. NYC Active Directory Root"
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">Username / Access ID</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">Password</label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">2FA / TOTP Secret Key (Optional)</label>
              <input
                type="text"
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                placeholder="JBSWY3DPEHPK3PXP"
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono text-xs outline-none"
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
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs"
              >
                Save Credential
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
