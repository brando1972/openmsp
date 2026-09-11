import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { 
  Sprout, 
  MapPin, 
  Tractor, 
  DollarSign, 
  Users, 
  Smartphone, 
  Plus, 
  RotateCcw, 
  Building2, 
  Layers, 
  Edit2,
  Menu,
  X,
  Sparkles
} from 'lucide-react';

export const TopNavbar: React.FC = () => {
  const { 
    activeTab, 
    setActiveTab, 
    companyName, 
    setCompanyName, 
    openWorkOrderModal, 
    setIsServicesModalOpen,
    resetToDefaultData,
    workOrders,
    invoices
  } = useApp();

  const [isEditingBrand, setIsEditingBrand] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pendingInvoicesCount = invoices.filter(i => i.status === 'To Be Billed').length;
  const urgentCount = workOrders.filter(w => w.status === 'urgent' || w.status === 'attention').length;

  const BRANCH_OPTIONS = [
    '1st Generation Land Services LLC - Pensacola HQ (Main)',
    '1st Generation Land Services LLC - Gulf Breeze / Santa Rosa',
    '1st Generation Land Services LLC - Baldwin County Depot'
  ];

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
      {/* ── DESKTOP TOP BAR (lg and up) ── */}
      <div className="hidden lg:flex max-w-[1920px] mx-auto px-4 py-1.5 items-center justify-between border-b border-slate-800/80 text-xs">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="font-medium text-slate-300">Live GPS & Technician Route Engine Active</span>
          </div>
          <span className="text-slate-600">|</span>
          
          {/* Branch / Region Selector */}
          <div className="flex items-center space-x-2 text-slate-400">
            <Building2 className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-slate-400 font-medium">Branch:</span>
            {isEditingBrand ? (
              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="bg-slate-800 text-white border border-amber-500 rounded px-2 py-0.5 text-xs font-bold focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={() => setIsEditingBrand(false)}
                  className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded text-[10px]"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <select
                  value={companyName}
                  onChange={(e) => {
                    if (e.target.value === 'CUSTOM') {
                      setIsEditingBrand(true);
                    } else {
                      setCompanyName(e.target.value);
                    }
                  }}
                  className="bg-slate-800 text-slate-100 rounded px-2 py-0.5 border border-slate-700 focus:outline-none focus:border-amber-500 font-bold"
                >
                  {BRANCH_OPTIONS.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  <option value="CUSTOM">✏️ Custom Branch / Name...</option>
                </select>
                <button
                  onClick={() => setIsEditingBrand(true)}
                  className="text-slate-400 hover:text-white p-0.5"
                  title="Rename Business / Branch"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsServicesModalOpen(true)}
            className="flex items-center space-x-1.5 text-amber-400 hover:text-amber-300 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 transition text-xs font-bold border border-amber-500/30"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Services & Pricing Catalog</span>
          </button>

          <button
            onClick={() => {
              if (confirm('Reset application data to original demo state?')) {
                resetToDefaultData();
              }
            }}
            className="flex items-center space-x-1 text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition text-xs"
            title="Reset to default demo data"
          >
            <RotateCcw className="w-3 h-3 text-amber-400" />
            <span>Reset Demo</span>
          </button>
        </div>
      </div>

      {/* ── MAIN HEADER (Responsive) ── */}
      <div className="max-w-[1920px] mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <div className="h-9 sm:h-11 px-1.5 sm:px-2 py-0.5 bg-amber-50 rounded-lg flex items-center justify-center shadow-md border border-amber-200 overflow-hidden flex-shrink-0">
            <img 
              src="/assets/1st_generation_logo.jpg" 
              alt="1st Generation Land Services LLC" 
              className="h-8 sm:h-9 object-contain"
            />
          </div>
          <div className="truncate">
            <div className="flex items-center space-x-1.5">
              <span className="font-black tracking-tight text-sm sm:text-base text-white truncate">
                1<sup className="text-amber-400 text-[10px]">ST</sup> GENERATION
              </span>
              <span className="hidden xs:inline text-amber-400 font-extrabold tracking-tight text-xs sm:text-sm">
                LAND SERVICES
              </span>
              <span className="text-[9px] uppercase font-bold tracking-widest px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded">
                OPS
              </span>
            </div>
            <p className="hidden md:block text-[10px] text-slate-400 font-mono tracking-wide truncate">
              DISPATCH • GIS ROUTES • PROPERTY CRM • INVOICING
            </p>
          </div>
        </div>

        {/* Global Navigation Tabs (Desktop only) */}
        <nav className="hidden lg:flex items-center space-x-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700 shadow-inner">
          <button
            onClick={() => setActiveTab('dispatch')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'dispatch'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Sprout className="w-4 h-4" />
            <span>Dispatch</span>
            {urgentCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-fuchsia-500 text-white text-[9px] font-extrabold rounded-full">
                {urgentCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('map')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'map'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>GIS Map</span>
          </button>

          <button
            onClick={() => setActiveTab('equipment')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'equipment'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Tractor className="w-4 h-4" />
            <span>Equipment</span>
          </button>

          <button
            onClick={() => setActiveTab('accounting')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'accounting'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Accounting</span>
            {pendingInvoicesCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-slate-900 text-[9px] font-black rounded-full">
                {pendingInvoicesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('customers')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'customers'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Customers & Sites</span>
          </button>

          <button
            onClick={() => setActiveTab('crew')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'crew'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Field App</span>
          </button>
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Quick Work Order Button */}
          <button
            onClick={() => openWorkOrderModal(null)}
            className="flex items-center space-x-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg shadow-lg shadow-amber-950/40 transition transform active:scale-95 border border-amber-400/40 text-xs sm:text-sm"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span className="hidden xs:inline">Add Work Order</span>
            <span className="xs:hidden">New WO</span>
          </button>

          {/* Mobile Menu Toggle Button (Phones & Tablets) */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-slate-300 hover:text-white bg-slate-800 border border-slate-700 rounded-lg transition"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── MOBILE DRAWER / FLYOUT MENU ── */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-slate-950 border-t border-slate-800 p-4 space-y-3 animate-fadeIn">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => { setActiveTab('dispatch'); setMobileMenuOpen(false); }}
              className={`p-3 rounded-lg font-bold flex items-center space-x-2 text-left border ${
                activeTab === 'dispatch' ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-900 text-slate-300 border-slate-800'
              }`}
            >
              <Sprout className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Route Dispatch</span>
            </button>

            <button
              onClick={() => { setActiveTab('crew'); setMobileMenuOpen(false); }}
              className={`p-3 rounded-lg font-bold flex items-center space-x-2 text-left border ${
                activeTab === 'crew' ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-900 text-slate-300 border-slate-800'
              }`}
            >
              <Smartphone className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>Technician Field</span>
            </button>

            <button
              onClick={() => { setActiveTab('map'); setMobileMenuOpen(false); }}
              className={`p-3 rounded-lg font-bold flex items-center space-x-2 text-left border ${
                activeTab === 'map' ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-900 text-slate-300 border-slate-800'
              }`}
            >
              <MapPin className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span>GIS Route Map</span>
            </button>

            <button
              onClick={() => { setActiveTab('customers'); setMobileMenuOpen(false); }}
              className={`p-3 rounded-lg font-bold flex items-center space-x-2 text-left border ${
                activeTab === 'customers' ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-900 text-slate-300 border-slate-800'
              }`}
            >
              <Users className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span>Customers & Sites</span>
            </button>

            <button
              onClick={() => { setActiveTab('accounting'); setMobileMenuOpen(false); }}
              className={`p-3 rounded-lg font-bold flex items-center space-x-2 text-left border ${
                activeTab === 'accounting' ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-900 text-slate-300 border-slate-800'
              }`}
            >
              <DollarSign className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Invoicing ({pendingInvoicesCount})</span>
            </button>

            <button
              onClick={() => { setActiveTab('equipment'); setMobileMenuOpen(false); }}
              className={`p-3 rounded-lg font-bold flex items-center space-x-2 text-left border ${
                activeTab === 'equipment' ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-900 text-slate-300 border-slate-800'
              }`}
            >
              <Tractor className="w-4 h-4 text-orange-400 flex-shrink-0" />
              <span>Machinery Fleet</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <button
              onClick={() => { setIsServicesModalOpen(true); setMobileMenuOpen(false); }}
              className="flex items-center space-x-1.5 text-amber-400 font-bold px-3 py-2 bg-slate-900 rounded-lg border border-amber-500/30"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Services Catalog</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Reset application data to original demo state?')) {
                  resetToDefaultData();
                  setMobileMenuOpen(false);
                }
              }}
              className="flex items-center space-x-1 text-slate-400 hover:text-white px-3 py-2 bg-slate-900 rounded-lg border border-slate-800"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset Demo</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
