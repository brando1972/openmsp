import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { Customer, JobSite, BillingProfile } from '../../types';
import { CustomerSiteView } from './CustomerSiteView';
import { CredentialVaultView } from './CredentialVaultView';
import {
  Users, Search, Plus, Phone, Mail, MapPin, CreditCard, ShieldAlert,
  Calendar, FileText, DollarSign, X, CheckCircle2, Building2,
  Home, Trash2, Edit2, Clock, Eye, ChevronLeft, ArrowLeft,
  Camera, Key, Network, Lock
} from 'lucide-react';

type CustomerTab = 'sites' | 'tech_docs' | 'vault' | 'billing' | 'scheduled' | 'history' | 'invoices';

export const CustomerDirectory: React.FC = () => {
  const {
    customers, workOrders, invoices,
    addCustomer, updateCustomer, deleteCustomer,
    addJobSite, updateJobSite, deleteJobSite,
    addBillingProfile, updateBillingProfile, deleteBillingProfile,
    openWorkOrderModal, setViewingInvoice
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(customers[0]?.id || null);
  const [activeTab, setActiveTab] = useState<CustomerTab>('sites');
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [custFormData, setCustFormData] = useState<Partial<Customer>>({ name: '', company: '', email: '', phone: '', cell: '', category: 'Residential', salesRep: '', balance: 0, notes: '', billingProfiles: [], jobSites: [] });

  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<JobSite | null>(null);
  const [siteFormData, setSiteFormData] = useState<Partial<JobSite>>({ name: '', propertyType: 'Residential', address: '', city: 'Pensacola', state: 'FL', zip: '32501', county: 'Escambia', turfSqFt: 12000, grassType: 'St. Augustine', mowFrequency: 'Weekly', cutHeightInches: 3.0, gateCode: '', hazards: '' });

  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [editingBilling, setEditingBilling] = useState<BillingProfile | null>(null);
  const [billingFormData, setBillingFormData] = useState<Partial<BillingProfile>>({ label: '', billingType: 'Personal', billingAddress: '', billingCity: 'Pensacola', billingState: 'FL', billingZip: '32501', email: '', phone: '', paymentMethod: 'Credit Card', taxExempt: false, isDefault: false });

  const filteredCustomers = customers.filter(c => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery ||
      c.name.toLowerCase().includes(q) ||
      (c.company && c.company.toLowerCase().includes(q)) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.jobSites.some(s => s.address.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    const matchesCategory = selectedCategory === 'ALL' || c.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const activeCustomer = customers.find(c => c.id === selectedCustomerId) || filteredCustomers[0];

  const customerWOs = workOrders.filter(wo => wo.customerId === activeCustomer?.id);
  const scheduledWOs = customerWOs.filter(wo => !wo.flags.isCompleted && wo.status !== 'completed');
  const historyWOs = customerWOs.filter(wo => wo.flags.isCompleted || wo.status === 'completed');
  const customerInvoices = invoices.filter(inv => inv.customerId === activeCustomer?.id);

  const handleOpenAddCustomer = () => {
    setEditingCustomer(null);
    setCustFormData({ name: '', company: '', email: '', phone: '', cell: '', category: 'Residential', salesRep: '', balance: 0, notes: '', billingProfiles: [], jobSites: [] });
    setIsCustomerModalOpen(true);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custFormData.name) { alert('Customer Name is required.'); return; }
    if (editingCustomer) {
      updateCustomer({ ...editingCustomer, ...custFormData } as Customer);
    } else {
      const newId = `cust-${Date.now()}`;
      const defaultBill: BillingProfile = { id: `bp-${Date.now()}`, label: 'Personal Primary', billingType: 'Personal', billingAddress: '', billingCity: 'Pensacola', billingState: 'FL', billingZip: '32501', email: custFormData.email || '', phone: custFormData.phone || '', paymentMethod: 'Credit Card', cardBrand: 'Visa', cardLast4: '0000', taxExempt: false, isDefault: true };
      const defaultSite: JobSite = { id: `site-${Date.now()}`, customerId: newId, name: 'Primary Residence', propertyType: custFormData.category || 'Residential', address: '', city: 'Pensacola', state: 'FL', zip: '32501', lat: 30.4213, lng: -87.2169, turfSqFt: 10000, grassType: 'St. Augustine', mowFrequency: 'Weekly', cutHeightInches: 3.0, hazards: '' };
      addCustomer({ id: newId, name: custFormData.name || '', company: custFormData.company || '', email: custFormData.email || '', phone: custFormData.phone || '', cell: custFormData.cell || '', category: custFormData.category || 'Residential', salesRep: custFormData.salesRep || '', balance: 0, notes: custFormData.notes || '', billingProfiles: [defaultBill], jobSites: [defaultSite] });
      setSelectedCustomerId(newId);
    }
    setIsCustomerModalOpen(false);
  };

  const handleOpenAddSite = () => {
    setEditingSite(null);
    setSiteFormData({ name: '', propertyType: activeCustomer?.category || 'Residential', address: '', city: 'Pensacola', state: 'FL', zip: '32501', county: 'Escambia', turfSqFt: 12000, grassType: 'St. Augustine', mowFrequency: 'Weekly', cutHeightInches: 3.0, gateCode: '', hazards: '' });
    setIsSiteModalOpen(true);
  };

  const handleSaveSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteFormData.name || !siteFormData.address) { alert('Site Name and Address are required.'); return; }
    if (editingSite) {
      updateJobSite(activeCustomer.id, { ...editingSite, ...siteFormData } as JobSite);
    } else {
      addJobSite(activeCustomer.id, { id: `site-${Date.now()}`, customerId: activeCustomer.id, name: siteFormData.name || '', propertyType: siteFormData.propertyType || 'Residential', address: siteFormData.address || '', city: siteFormData.city || 'Pensacola', state: siteFormData.state || 'FL', zip: siteFormData.zip || '32501', county: siteFormData.county || 'Escambia', lat: 30.4213 + (Math.random() - 0.5) * 0.1, lng: -87.2169 + (Math.random() - 0.5) * 0.1, turfSqFt: Number(siteFormData.turfSqFt) || 12000, grassType: (siteFormData.grassType as any) || 'St. Augustine', mowFrequency: (siteFormData.mowFrequency as any) || 'Weekly', cutHeightInches: Number(siteFormData.cutHeightInches) || 3.0, gateCode: siteFormData.gateCode, hazards: siteFormData.hazards });
    }
    setIsSiteModalOpen(false);
  };

  const handleOpenAddBilling = () => {
    setEditingBilling(null);
    setBillingFormData({ label: 'Business Account', billingType: 'Business', companyName: activeCustomer?.company || '', billingAddress: '', billingCity: 'Pensacola', billingState: 'FL', billingZip: '32501', email: activeCustomer?.email || '', phone: activeCustomer?.phone || '', paymentMethod: 'Net 30 Invoice', taxExempt: false, isDefault: false });
    setIsBillingModalOpen(true);
  };

  const handleSaveBilling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingFormData.label) { alert('Profile label is required.'); return; }
    if (editingBilling) {
      updateBillingProfile(activeCustomer.id, { ...editingBilling, ...billingFormData } as BillingProfile);
    } else {
      addBillingProfile(activeCustomer.id, { id: `bp-${Date.now()}`, label: billingFormData.label || '', billingType: billingFormData.billingType || 'Personal', companyName: billingFormData.companyName, billingAddress: billingFormData.billingAddress || '', billingCity: billingFormData.billingCity || 'Pensacola', billingState: billingFormData.billingState || 'FL', billingZip: billingFormData.billingZip || '32501', email: billingFormData.email || '', phone: billingFormData.phone || '', paymentMethod: (billingFormData.paymentMethod as any) || 'Credit Card', cardBrand: billingFormData.cardBrand || 'Visa', cardLast4: billingFormData.cardLast4 || '0000', taxExempt: !!billingFormData.taxExempt, taxId: billingFormData.taxId, isDefault: !!billingFormData.isDefault });
    }
    setIsBillingModalOpen(false);
  };

  const STATUS_COLOR: Record<string, string> = {
    active: 'bg-green-100 text-green-800 border-green-300',
    scheduled: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    urgent: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300',
    attention: 'bg-orange-100 text-orange-800 border-orange-300',
    completed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  };

  const TABS: { key: CustomerTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'sites', label: 'Job Sites', icon: <MapPin className="w-3.5 h-3.5" />, count: activeCustomer?.jobSites.length },
    { key: 'tech_docs', label: 'Cameras & Subnets', icon: <Camera className="w-3.5 h-3.5" /> },
    { key: 'vault', label: 'Credential Vault', icon: <Key className="w-3.5 h-3.5" /> },
    { key: 'billing', label: 'Billing Profiles', icon: <CreditCard className="w-3.5 h-3.5" />, count: activeCustomer?.billingProfiles.length },
    { key: 'scheduled', label: 'Scheduled Jobs', icon: <Calendar className="w-3.5 h-3.5" />, count: scheduledWOs.length },
    { key: 'history', label: 'Service History', icon: <Clock className="w-3.5 h-3.5" />, count: historyWOs.length },
    { key: 'invoices', label: 'Invoices', icon: <DollarSign className="w-3.5 h-3.5" />, count: customerInvoices.length },
  ];

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-100 text-xs relative">
      {/* ── LEFT: Customer List (Hidden on mobile if viewing detail) ── */}
      <div className={`w-full lg:w-80 bg-white border-r border-slate-200 flex flex-col ${mobileShowDetail ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50">
          <div className="flex items-center justify-between">
            <span className="font-black text-slate-900 text-sm flex items-center">
              <Users className="w-4 h-4 text-amber-600 mr-1.5" />
              Customer Directory
            </span>
            <button onClick={handleOpenAddCustomer} className="flex items-center space-x-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow-sm text-xs">
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search customer, site, address..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <div className="flex items-center space-x-1 bg-slate-200 p-0.5 rounded-lg text-[11px]">
            {['ALL', 'Residential', 'Commercial'].map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`flex-1 py-1 rounded font-semibold transition ${selectedCategory === cat ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-300'}`}>{cat}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredCustomers.map(cust => {
            const isSelected = activeCustomer?.id === cust.id;
            const custWOCount = workOrders.filter(w => w.customerId === cust.id && !w.flags.isCompleted).length;
            return (
              <div 
                key={cust.id} 
                onClick={() => { 
                  setSelectedCustomerId(cust.id); 
                  setActiveTab('sites');
                  setMobileShowDetail(true);
                }} 
                className={`p-3 cursor-pointer transition ${isSelected ? 'bg-amber-50 border-l-4 border-amber-600' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-slate-900 text-sm sm:text-xs">{cust.name}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${cust.category === 'Commercial' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{cust.category}</span>
                    </div>
                    {cust.company && <p className="text-slate-500 text-[11px] mt-0.5">{cust.company}</p>}
                    <p className="text-slate-400 text-[11px] mt-0.5">{cust.phone}</p>
                  </div>
                  <div className="text-right">
                    <span className={`font-mono font-bold text-xs ${cust.balance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>${cust.balance.toFixed(2)}</span>
                    {custWOCount > 0 && <p className="text-[10px] text-amber-700 font-bold mt-0.5">{custWOCount} active</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT: Customer Detail with 5 Tabs (Full-width on mobile if detail active) ── */}
      {activeCustomer ? (
        <div className={`flex-1 flex flex-col overflow-hidden ${mobileShowDetail ? 'flex' : 'hidden lg:flex'}`}>
          {/* Customer Header Card */}
          <div className="bg-white border-b border-slate-200 px-4 sm:px-5 py-3 shadow-sm">
            {/* Mobile Back Button */}
            <div className="lg:hidden mb-2">
              <button 
                onClick={() => setMobileShowDetail(false)}
                className="flex items-center space-x-1 text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>← All Customers</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-base sm:text-lg font-black text-slate-900">{activeCustomer.name}</h1>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${activeCustomer.category === 'Commercial' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{activeCustomer.category}</span>
                </div>
                {activeCustomer.company && <p className="text-slate-600 font-semibold text-xs mt-0.5">{activeCustomer.company}</p>}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                  <span className="flex items-center"><Phone className="w-3 h-3 mr-1 text-slate-400" />{activeCustomer.phone || '—'}</span>
                  <span className="flex items-center"><Mail className="w-3 h-3 mr-1 text-slate-400" />{activeCustomer.email || '—'}</span>
                  {activeCustomer.notes && (
                    <span className="flex items-center text-amber-700">
                      <ShieldAlert className="w-3 h-3 mr-1 text-amber-600 flex-shrink-0" />
                      <span className="truncate max-w-[200px]">{activeCustomer.notes}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2 self-end sm:self-auto">
                <button onClick={() => { setEditingCustomer(activeCustomer); setCustFormData(activeCustomer); setIsCustomerModalOpen(true); }} className="p-1.5 text-slate-500 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => openWorkOrderModal(null)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow-sm text-xs"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>+ Schedule WO</span>
                </button>
              </div>
            </div>

            {/* 5-Tab Navigation (Horizontal scrollable on mobile) */}
            <div className="flex items-center space-x-1 mt-3 overflow-x-auto pb-1 scrollbar-none">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t-lg text-[11px] font-bold transition border-b-2 whitespace-nowrap flex-shrink-0 ${
                    activeTab === tab.key
                      ? 'bg-slate-100 text-amber-700 border-amber-600'
                      : 'text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${activeTab === tab.key ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content Area */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-5">

            {/* ── TAB: CAMERAS & SUBNETS (MSP SITE DOCS) ── */}
            {activeTab === 'tech_docs' && (
              <CustomerSiteView customerId={activeCustomer.id} />
            )}

            {/* ── TAB: CREDENTIAL VAULT ── */}
            {activeTab === 'vault' && (
              <CredentialVaultView customerId={activeCustomer.id} />
            )}

            {/* ── TAB 1: JOB SITES ── */}
            {activeTab === 'sites' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-slate-800 flex items-center text-sm"><MapPin className="w-4 h-4 text-amber-600 mr-1.5" />Job Site Properties ({activeCustomer.jobSites.length})</h3>
                  <button onClick={handleOpenAddSite} className="flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs shadow-sm">
                    <Plus className="w-3.5 h-3.5" /><span>Add Property</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeCustomer.jobSites.map(site => (
                    <div key={site.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-amber-400 transition">
                      <div className="flex items-start justify-between border-b border-slate-100 pb-2 mb-3">
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${site.propertyType === 'Commercial' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{site.propertyType === 'Commercial' ? '🏢' : '🏡'} {site.propertyType}</span>
                            <h4 className="font-bold text-slate-900">{site.name}</h4>
                          </div>
                          <p className="text-slate-500 text-[11px] mt-1 flex items-center"><MapPin className="w-3 h-3 text-red-400 mr-1 flex-shrink-0" />{site.address}, {site.city}, {site.state} {site.zip}</p>
                        </div>
                        <div className="flex items-center space-x-1">
                          <button onClick={() => { setEditingSite(site); setSiteFormData(site); setIsSiteModalOpen(true); }} className="p-1 text-slate-400 hover:text-slate-700 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { if (confirm(`Delete site "${site.name}"?`)) deleteJobSite(activeCustomer.id, site.id); }} className="p-1 text-slate-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px]">
                        <div><span className="text-slate-400 font-bold block text-[10px]">Turf Area</span><span className="font-mono font-bold text-slate-900">{site.turfSqFt.toLocaleString()} sq ft</span></div>
                        <div><span className="text-slate-400 font-bold block text-[10px]">Grass Type</span><span className="font-semibold text-slate-900">{site.grassType}</span></div>
                        <div><span className="text-slate-400 font-bold block text-[10px]">Cut Height</span><span className="font-mono font-bold text-slate-900">{site.cutHeightInches || 3.0}"</span></div>
                      </div>
                      {site.hazards && (
                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-[11px] text-amber-900">
                          <span className="font-bold flex items-center"><ShieldAlert className="w-3 h-3 mr-1 text-amber-600" />Gate & Hazards:</span>
                          <p className="mt-0.5">{site.hazards}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB 2: BILLING PROFILES ── */}
            {activeTab === 'billing' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-slate-800 flex items-center text-sm"><CreditCard className="w-4 h-4 text-blue-600 mr-1.5" />Billing Profiles ({activeCustomer.billingProfiles.length})</h3>
                  <button onClick={handleOpenAddBilling} className="flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs shadow-sm">
                    <Plus className="w-3.5 h-3.5" /><span>Add Profile</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeCustomer.billingProfiles.map(bp => (
                    <div key={bp.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-blue-400 transition">
                      <div className="flex items-start justify-between border-b border-slate-100 pb-2 mb-3">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${bp.billingType === 'Business' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}`}>{bp.billingType} Profile</span>
                            {bp.isDefault && <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-bold rounded border border-amber-300">Default</span>}
                          </div>
                          <h4 className="font-bold text-slate-900 mt-1">{bp.label}</h4>
                          {bp.companyName && <p className="text-slate-500 text-[11px]">{bp.companyName}</p>}
                        </div>
                        <div className="flex items-center space-x-1">
                          <button onClick={() => { setEditingBilling(bp); setBillingFormData(bp); setIsBillingModalOpen(true); }} className="p-1 text-slate-400 hover:text-slate-700 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { if (confirm(`Delete profile "${bp.label}"?`)) deleteBillingProfile(activeCustomer.id, bp.id); }} className="p-1 text-slate-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="space-y-1 text-[11px] text-slate-600">
                        <p>Address: <strong className="text-slate-900">{bp.billingAddress}, {bp.billingCity}, {bp.billingState} {bp.billingZip}</strong></p>
                        <p>Method: <strong className="text-slate-900">{bp.paymentMethod}</strong>{bp.cardLast4 ? ` (${bp.cardBrand || 'Card'} •••• ${bp.cardLast4})` : ''}</p>
                        {bp.taxExempt && <p className="text-emerald-700 font-bold">✓ Tax Exempt {bp.taxId ? `· ID: ${bp.taxId}` : ''}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB 3: SCHEDULED JOBS ── */}
            {activeTab === 'scheduled' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-slate-800 flex items-center text-sm"><Calendar className="w-4 h-4 text-amber-600 mr-1.5" />Scheduled & Active Jobs ({scheduledWOs.length})</h3>
                  <button onClick={() => openWorkOrderModal(null)} className="flex items-center space-x-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shadow-sm">
                    <Plus className="w-3.5 h-3.5" /><span>+ Schedule Job</span>
                  </button>
                </div>
                {scheduledWOs.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200 p-6">
                    <Calendar className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold">No upcoming jobs scheduled.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {scheduledWOs.map(wo => (
                      <div key={wo.id} className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm flex items-start justify-between hover:border-amber-300 transition">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="font-mono text-[10px] font-black text-slate-500">{wo.woNumber}</span>
                            <span className={`px-2 py-0.2 rounded text-[9px] font-black uppercase border ${STATUS_COLOR[wo.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>{wo.status}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${wo.propertyType === 'Commercial' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{wo.propertyType}</span>
                          </div>
                          <p className="font-bold text-slate-900 truncate">{wo.serviceTypeName || wo.jobName}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span className="flex items-center"><Calendar className="w-3 h-3 mr-1 text-amber-500" />{wo.date || '—'}</span>
                            <span className="flex items-center"><Users className="w-3 h-3 mr-1 text-emerald-500" />{wo.technicianName || 'Unassigned'}</span>
                            <span className="flex items-center"><MapPin className="w-3 h-3 mr-1 text-red-400" />{wo.jobAddress}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-2 sm:ml-4 flex-shrink-0">
                          <span className={`font-mono font-bold text-xs ${wo.balanceDue > 0 ? 'text-red-600' : 'text-emerald-700'}`}>${wo.balanceDue?.toFixed(2)}</span>
                          <button onClick={() => openWorkOrderModal(wo)} className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300"><Edit2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 4: SERVICE HISTORY ── */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                <h3 className="font-black text-slate-800 flex items-center text-sm"><Clock className="w-4 h-4 text-slate-500 mr-1.5" />Completed Service History ({historyWOs.length})</h3>
                {historyWOs.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200 p-6">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold">No completed jobs yet for this customer.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyWOs.map(wo => (
                      <div key={wo.id} className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm flex items-start justify-between hover:border-emerald-300 transition">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="font-mono text-[10px] font-black text-slate-500">{wo.woNumber}</span>
                            <span className="px-2 py-0.2 rounded text-[9px] font-black uppercase border bg-emerald-100 text-emerald-800 border-emerald-300">Completed</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${wo.propertyType === 'Commercial' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{wo.propertyType}</span>
                          </div>
                          <p className="font-bold text-slate-900 truncate">{wo.serviceTypeName || wo.jobName}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" />{wo.date || '—'}</span>
                            <span className="flex items-center"><Users className="w-3 h-3 mr-1" />{wo.technicianName || '—'}</span>
                            <span className="flex items-center"><MapPin className="w-3 h-3 mr-1 text-red-400" />{wo.jobAddress}</span>
                          </div>
                        </div>
                        <div className="text-right ml-2 sm:ml-4 flex-shrink-0">
                          <span className="font-mono font-bold text-emerald-700 block text-xs">${wo.totalAmount?.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-400">Paid</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 5: INVOICES & PAYMENTS ── */}
            {activeTab === 'invoices' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-black text-slate-800 flex items-center text-sm"><DollarSign className="w-4 h-4 text-emerald-600 mr-1.5" />Invoices & Payments ({customerInvoices.length})</h3>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 font-bold rounded-lg text-[11px]">
                      Due: ${customerInvoices.reduce((a, i) => a + i.balanceDue, 0).toFixed(2)}
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-lg text-[11px]">
                      Paid: ${customerInvoices.reduce((a, i) => a + i.amountPaid, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                {customerInvoices.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200 p-6">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold">No invoices found for this customer.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customerInvoices.map(inv => (
                      <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm flex items-center justify-between hover:border-emerald-300 transition">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="font-mono font-black text-slate-700 text-[11px]">{inv.invoiceNumber}</span>
                            <span className={`px-2 py-0.2 rounded text-[9px] font-black uppercase border ${inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>{inv.status}</span>
                            {inv.propertyType && <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${inv.propertyType === 'Commercial' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{inv.propertyType}</span>}
                          </div>
                          <p className="font-bold text-slate-900 truncate">{inv.items[0]?.description}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span>Date: {inv.dateCompleted}</span>
                            <span>Due: {inv.dueDate}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3 ml-2 sm:ml-4 flex-shrink-0">
                          <div className="text-right">
                            <p className="font-mono font-bold text-slate-900 text-xs">${inv.total.toFixed(2)}</p>
                            <p className={`text-[10px] font-bold ${inv.balanceDue > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{inv.balanceDue > 0 ? `$${inv.balanceDue.toFixed(2)} due` : '✓ Paid'}</p>
                          </div>
                          <button onClick={() => setViewingInvoice(inv)} className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-[11px] shadow-sm">
                            <Eye className="w-3.5 h-3.5" /><span>View</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      ) : (
        <div className="flex-1 hidden lg:flex items-center justify-center text-slate-400">
          <div className="text-center"><Users className="w-12 h-12 mx-auto mb-2 text-slate-300" /><p>Select a customer to view details.</p></div>
        </div>
      )}

      {/* ── Modals: Customer / Site / Billing (Responsive) ── */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md p-4 sm:p-5 text-slate-800 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h3>
              <button onClick={() => setIsCustomerModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div><label className="block font-bold text-slate-700 mb-1">Full Name: *</label><input required type="text" value={custFormData.name || ''} onChange={e => setCustFormData({ ...custFormData, name: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold" /></div>
              <div><label className="block font-bold text-slate-700 mb-1">Company (Optional):</label><input type="text" value={custFormData.company || ''} onChange={e => setCustFormData({ ...custFormData, company: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className="block font-bold text-slate-700 mb-1">Phone:</label><input type="text" value={custFormData.phone || ''} onChange={e => setCustFormData({ ...custFormData, phone: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2" /></div>
                <div><label className="block font-bold text-slate-700 mb-1">Email:</label><input type="email" value={custFormData.email || ''} onChange={e => setCustFormData({ ...custFormData, email: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2" /></div>
              </div>
              <div><label className="block font-bold text-slate-700 mb-1">Account Category:</label>
                <select value={custFormData.category || 'Residential'} onChange={e => setCustFormData({ ...custFormData, category: e.target.value as any })} className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold">
                  <option value="Residential">Residential</option><option value="Commercial">Commercial</option><option value="HOA">HOA / Community</option><option value="Municipal">Municipal / Government</option>
                </select>
              </div>
              <div><label className="block font-bold text-slate-700 mb-1">Access Notes / Gate Codes:</label><textarea rows={2} value={custFormData.notes || ''} onChange={e => setCustFormData({ ...custFormData, notes: e.target.value })} className="w-full bg-amber-50 border border-amber-200 rounded p-2" /></div>
              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="px-4 py-2 bg-slate-200 rounded font-bold text-xs">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-xs shadow">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSiteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-lg p-4 sm:p-5 text-slate-800 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900">{editingSite ? `Edit: ${editingSite.name}` : `Add Site for ${activeCustomer.name}`}</h3>
              <button onClick={() => setIsSiteModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveSite} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className="block font-bold text-slate-700 mb-1">Site Nickname: *</label><input required type="text" value={siteFormData.name || ''} onChange={e => setSiteFormData({ ...siteFormData, name: e.target.value })} placeholder="e.g. Beach House" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold" /></div>
                <div><label className="block font-bold text-slate-700 mb-1">Property Type:</label>
                  <select value={siteFormData.propertyType || 'Residential'} onChange={e => setSiteFormData({ ...siteFormData, propertyType: e.target.value as any })} className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold">
                    <option value="Residential">Residential</option><option value="Commercial">Commercial</option><option value="HOA">HOA Grounds</option>
                  </select>
                </div>
              </div>
              <div><label className="block font-bold text-slate-700 mb-1">Street Address: *</label><input required type="text" value={siteFormData.address || ''} onChange={e => setSiteFormData({ ...siteFormData, address: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="block font-bold text-slate-700 mb-1">City:</label><input type="text" value={siteFormData.city || ''} onChange={e => setSiteFormData({ ...siteFormData, city: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2" /></div>
                <div><label className="block font-bold text-slate-700 mb-1">State:</label><input type="text" value={siteFormData.state || 'FL'} onChange={e => setSiteFormData({ ...siteFormData, state: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2" /></div>
                <div><label className="block font-bold text-slate-700 mb-1">Zip:</label><input type="text" value={siteFormData.zip || ''} onChange={e => setSiteFormData({ ...siteFormData, zip: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2" /></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="block font-bold text-slate-700 mb-1">Turf Sq Ft:</label><input type="number" value={siteFormData.turfSqFt || 12000} onChange={e => setSiteFormData({ ...siteFormData, turfSqFt: parseInt(e.target.value) || 0 })} className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono font-bold" /></div>
                <div><label className="block font-bold text-slate-700 mb-1">Grass:</label>
                  <select value={siteFormData.grassType || 'St. Augustine'} onChange={e => setSiteFormData({ ...siteFormData, grassType: e.target.value as any })} className="w-full bg-slate-50 border border-slate-300 rounded p-2">
                    <option value="St. Augustine">St. Aug</option><option value="Bermuda">Bermuda</option><option value="Zoysia">Zoysia</option><option value="Centipede">Centipede</option><option value="Bahia">Bahia</option>
                  </select>
                </div>
                <div><label className="block font-bold text-slate-700 mb-1">Cut (in):</label><input type="number" step="0.5" value={siteFormData.cutHeightInches || 3.0} onChange={e => setSiteFormData({ ...siteFormData, cutHeightInches: parseFloat(e.target.value) || 3.0 })} className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold" /></div>
              </div>
              <div><label className="block font-bold text-slate-700 mb-1">Gate Code & Hazards:</label><textarea rows={2} value={siteFormData.hazards || ''} onChange={e => setSiteFormData({ ...siteFormData, hazards: e.target.value })} placeholder="Gate code, dogs, hazards" className="w-full bg-amber-50 border border-amber-200 rounded p-2" /></div>
              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button type="button" onClick={() => setIsSiteModalOpen(false)} className="px-4 py-2 bg-slate-200 rounded font-bold text-xs">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-xs shadow">Save Site</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isBillingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-lg p-4 sm:p-5 text-slate-800 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900">{editingBilling ? `Edit: ${editingBilling.label}` : `Add Billing Profile`}</h3>
              <button onClick={() => setIsBillingModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveBilling} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className="block font-bold text-slate-700 mb-1">Profile Label: *</label><input required type="text" value={billingFormData.label || ''} onChange={e => setBillingFormData({ ...billingFormData, label: e.target.value })} placeholder="e.g. Personal Visa" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold" /></div>
                <div><label className="block font-bold text-slate-700 mb-1">Billing Type:</label>
                  <select value={billingFormData.billingType || 'Personal'} onChange={e => setBillingFormData({ ...billingFormData, billingType: e.target.value as any })} className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold">
                    <option value="Personal">Personal</option><option value="Business">Business / Commercial</option>
                  </select>
                </div>
              </div>
              <div><label className="block font-bold text-slate-700 mb-1">Billing Address: *</label><input required type="text" value={billingFormData.billingAddress || ''} onChange={e => setBillingFormData({ ...billingFormData, billingAddress: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="block font-bold text-slate-700 mb-1">City:</label><input type="text" value={billingFormData.billingCity || 'Pensacola'} onChange={e => setBillingFormData({ ...billingFormData, billingCity: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2" /></div>
                <div><label className="block font-bold text-slate-700 mb-1">State:</label><input type="text" value={billingFormData.billingState || 'FL'} onChange={e => setBillingFormData({ ...billingFormData, billingState: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2" /></div>
                <div><label className="block font-bold text-slate-700 mb-1">Zip:</label><input type="text" value={billingFormData.billingZip || ''} onChange={e => setBillingFormData({ ...billingFormData, billingZip: e.target.value })} className="w-full bg-slate-50 border border-slate-300 rounded p-2" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className="block font-bold text-slate-700 mb-1">Payment Method:</label>
                  <select value={billingFormData.paymentMethod || 'Credit Card'} onChange={e => setBillingFormData({ ...billingFormData, paymentMethod: e.target.value as any })} className="w-full bg-slate-50 border border-slate-300 rounded p-2">
                    <option value="Credit Card">Credit Card on File</option><option value="ACH / Bank Transfer">ACH / Bank Transfer</option><option value="Net 30 Invoice">Net 30 Invoice</option><option value="Check">Check</option><option value="Cash">Cash</option>
                  </select>
                </div>
                <div><label className="block font-bold text-slate-700 mb-1">Tax ID / Exemption:</label><input type="text" value={billingFormData.taxId || ''} onChange={e => setBillingFormData({ ...billingFormData, taxId: e.target.value })} placeholder="FEIN or Resale Cert" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono" /></div>
              </div>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer font-semibold"><input type="checkbox" checked={!!billingFormData.taxExempt} onChange={e => setBillingFormData({ ...billingFormData, taxExempt: e.target.checked })} className="w-4 h-4 rounded text-amber-600" /><span>Tax Exempt</span></label>
                <label className="flex items-center space-x-2 cursor-pointer font-semibold"><input type="checkbox" checked={!!billingFormData.isDefault} onChange={e => setBillingFormData({ ...billingFormData, isDefault: e.target.checked })} className="w-4 h-4 rounded text-amber-600" /><span>Default</span></label>
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button type="button" onClick={() => setIsBillingModalOpen(false)} className="px-4 py-2 bg-slate-200 rounded font-bold text-xs">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-xs shadow">Save Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
