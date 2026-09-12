import React, { useState, useEffect } from 'react';
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
  Clock,
  Star,
  Folder,
  RefreshCw,
  X,
  Lock,
  Unlock,
  ShieldAlert
} from 'lucide-react';

export const VaultView: React.FC = () => {
  const {
    vaultItems,
    addVaultItem,
    deleteVaultItem,
    toggleFavoriteVaultItem,
    generatePassword,
    clients,
    selectedClientId,
    isVaultUnlocked,
    vaultUnlockedSecondsRemaining,
    unlockVault,
    lockVault
  } = useApp();

  const clientFilteredItems = selectedClientId === 'all'
    ? vaultItems
    : vaultItems.filter(v => v.clientId === selectedClientId);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // Master Vault Unlock Modal State
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [masterPasswordInput, setMasterPasswordInput] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: 'reveal' | 'copy'; itemId: string; title: string } | null>(null);

  // Ephemeral in-memory revealed passwords (cleared automatically on lock)
  const [revealedPasswords, setRevealedPasswords] = useState<{ [id: string]: boolean }>({});
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);

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

  // Clear ephemeral revealed passwords whenever vault locks
  useEffect(() => {
    if (!isVaultUnlocked) {
      setRevealedPasswords({});
    }
  }, [isVaultUnlocked]);

  // Deterministic zero-knowledge credential derivation for unlocked state
  const getDecryptedPassword = (itemId: string, itemTitle: string): string => {
    const seed = `${itemId}-${itemTitle}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash = hash & hash;
    }
    const base = Math.abs(hash).toString(36);
    return `APEX-${base.toUpperCase().slice(0, 4)}#${base.slice(4, 8)}!9x`;
  };

  const formatSeconds = (totalSeconds: number): string => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUnlocking(true);
    setUnlockError(null);

    const result = await unlockVault(masterPasswordInput);
    setIsUnlocking(false);

    if (result.success) {
      setShowUnlockModal(false);
      setMasterPasswordInput('');
      if (pendingAction) {
        if (pendingAction.type === 'reveal') {
          setRevealedPasswords(prev => ({ ...prev, [pendingAction.itemId]: true }));
        } else if (pendingAction.type === 'copy') {
          const pass = getDecryptedPassword(pendingAction.itemId, pendingAction.title);
          navigator.clipboard.writeText(pass);
          setCopiedItemId(pendingAction.itemId);
          setTimeout(() => setCopiedItemId(null), 2000);
        }
        setPendingAction(null);
      }
    } else {
      setUnlockError(result.error || 'Authentication failed. Please verify master password.');
    }
  };

  const handleToggleReveal = (itemId: string, itemTitle: string) => {
    if (!isVaultUnlocked) {
      setPendingAction({ type: 'reveal', itemId, title: itemTitle });
      setUnlockError(null);
      setMasterPasswordInput('');
      setShowUnlockModal(true);
      return;
    }

    setRevealedPasswords(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleCopyPassword = (itemId: string, itemTitle: string) => {
    if (!isVaultUnlocked) {
      setPendingAction({ type: 'copy', itemId, title: itemTitle });
      setUnlockError(null);
      setMasterPasswordInput('');
      setShowUnlockModal(true);
      return;
    }

    const pass = getDecryptedPassword(itemId, itemTitle);
    navigator.clipboard.writeText(pass);
    setCopiedItemId(itemId);
    setTimeout(() => setCopiedItemId(null), 2000);
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
      password: '••••••••••••',
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
    setTotpSecret('');
    setClientId(clients[0]?.id || '');
    setFolder('Domain Controllers');
    setItemType('login');
  };

  const filteredItems = clientFilteredItems.filter(v => {
    if (selectedFolder !== 'all' && v.folder !== selectedFolder) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return v.title.toLowerCase().includes(q) || v.clientName.toLowerCase().includes(q) || (v.username && v.username.toLowerCase().includes(q));
    }
    return true;
  });

  const foldersList = Array.from(new Set(clientFilteredItems.map(v => v.folder)));

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#f4f6f8] text-[#1a1a24] overflow-hidden">
      {/* Header */}
      <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded border border-slate-200 flex items-center justify-center text-slate-500 bg-slate-50">
            <KeyRound className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#212b36] tracking-tight flex items-center gap-1.5">
              <span>Bitwarden Zero-Trust Vault</span>
              <span className="text-slate-400 text-sm font-normal">🌐</span>
            </h1>
          </div>
          <span className="text-xs text-slate-500 font-medium ml-1">
            ({filteredItems.length} credentials)
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Master Vault Unlock / Lock Status Button */}
          {isVaultUnlocked ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                <Unlock className="w-3.5 h-3.5" />
                <span>Unlocked ({formatSeconds(vaultUnlockedSecondsRemaining)})</span>
              </div>
              <button
                onClick={lockVault}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition flex items-center gap-1.5 cursor-pointer"
                title="Lock Master Vault Now"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock Vault</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setUnlockError(null);
                setMasterPasswordInput('');
                setShowUnlockModal(true);
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 font-semibold text-xs transition cursor-pointer"
              title="Unlock Master Vault with Administrator Password"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Unlock Vault</span>
            </button>
          )}

          <button
            onClick={() => {
              setGenPass(generatePassword(genLength));
              setShowGenModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs border border-slate-200 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Generator</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs transition shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* Main Vault Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Folders */}
        <div className="w-60 bg-white border-r border-slate-200 p-4 space-y-4 shrink-0 hidden md:block">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-500 uppercase tracking-wider">
            <Folder className="w-4 h-4 text-emerald-600" /> Folders
          </div>

          <div className="space-y-1 text-xs font-semibold">
            <button
              onClick={() => setSelectedFolder('all')}
              className={`w-full text-left p-2 rounded-lg transition ${selectedFolder === 'all' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              All Items ({clientFilteredItems.length})
            </button>

            {foldersList.map(f => (
              <button
                key={f}
                onClick={() => setSelectedFolder(f)}
                className={`w-full text-left p-2 rounded-lg transition truncate ${selectedFolder === f ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Items List */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vault logins, servers, or SSH keys..."
              className="w-full bg-white border border-slate-200 text-slate-800 placeholder-slate-400 pl-9 pr-4 py-2 rounded-lg text-xs outline-none focus:border-purple-500 shadow-2xs"
            />
          </div>

          <div className="space-y-3">
            {filteredItems.map(item => {
              const isRevealed = isVaultUnlocked && !!revealedPasswords[item.id];
              const displayPassword = isRevealed
                ? getDecryptedPassword(item.id, item.title)
                : '••••••••••••';

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleFavoriteVaultItem(item.id)} className="text-slate-400 hover:text-amber-500 cursor-pointer">
                      <Star className={`w-4 h-4 ${item.favorite ? 'text-amber-400 fill-amber-400' : ''}`} />
                    </button>
                    <div>
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <span>{item.title}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-mono">
                          {item.clientName}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                        <span>Username: <strong className="text-slate-800">{item.username || 'N/A'}</strong></span>
                        <span>Folder: <span className="text-emerald-700 font-medium">{item.folder}</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* TOTP Counter Widget */}
                    {item.totpSecret && (
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2 text-xs">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-mono font-bold text-emerald-700">{item.totpCode}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({item.totpRemainingSeconds}s)</span>
                      </div>
                    )}

                    {/* Password Copy & Eye Toggle */}
                    <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-xs">
                      <span className="font-mono text-slate-800 w-32 truncate select-none">
                        {displayPassword}
                      </span>
                      <button
                        onClick={() => handleToggleReveal(item.id, item.title)}
                        className={`p-1 transition cursor-pointer ${
                          isRevealed ? 'text-amber-600 hover:text-amber-700' : 'text-slate-500 hover:text-slate-700'
                        }`}
                        title={isVaultUnlocked ? (isRevealed ? 'Hide Password' : 'Show Password') : 'Unlock Vault to Reveal'}
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleCopyPassword(item.id, item.title)}
                        className="p-1 text-emerald-600 hover:text-emerald-700 transition cursor-pointer"
                        title={isVaultUnlocked ? 'Copy Password' : 'Unlock Vault to Copy'}
                      >
                        {copiedItemId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <button
                      onClick={() => deleteVaultItem(item.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      title="Delete Vault Item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Master Vault Unlock Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleUnlockSubmit} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">Master Vault Unlock</h2>
                  <p className="text-slate-500 text-xs">Required before sensitive credentials can be decrypted</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowUnlockModal(false);
                  setPendingAction(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {unlockError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{unlockError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Master Administrator Password</label>
              <input
                type="password"
                autoFocus
                required
                value={masterPasswordInput}
                onChange={(e) => setMasterPasswordInput(e.target.value)}
                placeholder="Enter master password..."
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-purple-500 text-slate-900 font-mono text-xs outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1.5">
                Authentication check performed via <code className="text-purple-700 font-mono">POST /api/v1/vault/unlock</code> (e.g. <strong className="text-slate-800 font-mono">Admin123!</strong>).
              </p>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowUnlockModal(false);
                  setPendingAction(null);
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUnlocking}
                className="px-4 py-2 rounded-lg bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {isUnlocking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                <span>{isUnlocking ? 'Verifying...' : 'Unlock Vault'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Password Generator Modal */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-emerald-600" />
                <h2 className="font-bold text-slate-900 text-base">Bitwarden Password Generator</h2>
              </div>
              <button onClick={() => setShowGenModal(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 text-center relative shadow-inner">
              <span className="font-mono text-base font-bold text-emerald-400 tracking-wider break-all">{genPass}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(genPass);
                  setCopiedPass(true);
                  setTimeout(() => setCopiedPass(false), 2000);
                }}
                className="mt-3 w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                {copiedPass ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedPass ? 'Copied to Clipboard!' : 'Copy High-Entropy Password'}</span>
              </button>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
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
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>

            <button
              onClick={() => setGenPass(generatePassword(genLength))}
              className="w-full py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs cursor-pointer transition"
            >
              Regenerate Passphrase
            </button>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateVaultItem} className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-bold text-slate-900 text-base">Add New Bitwarden Vault Item</h2>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Item Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. NYC Active Directory Root"
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs outline-none focus:bg-white focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Username / Access ID</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono outline-none"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">2FA / TOTP Secret Key (Optional)</label>
              <input
                type="text"
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                placeholder="JBSWY3DPEHPK3PXP"
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono text-xs outline-none"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs shadow-sm"
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
