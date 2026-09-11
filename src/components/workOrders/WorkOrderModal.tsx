import React, { useState, useEffect } from 'react';
import { useApp } from '../../data/AppContext';
import { WorkOrder, Customer, JobSite, BillingProfile, ServiceTypeItem } from '../../types';
import { 
  X, 
  Save, 
  Trash2, 
  Calendar, 
  Clock, 
  DollarSign, 
  CreditCard, 
  MapPin, 
  User, 
  ShieldAlert, 
  Truck, 
  Package, 
  PlusCircle, 
  FileText,
  Copy,
  History,
  Building2,
  Home,
  UserCheck,
  Scissors,
  Plus,
  Flame,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

export const WorkOrderModal: React.FC = () => {
  const { 
    isWorkOrderModalOpen, 
    closeWorkOrderModal, 
    editingWorkOrder, 
    customers, 
    technicians, 
    facilities, 
    equipment, 
    serviceTypes,
    addWorkOrder, 
    updateWorkOrder, 
    addJobSite,
    currentDate,
    setCurrentDate,
    setActiveTab: setGlobalActiveTab,
    companyName
  } = useApp();

  const [activeTab, setActiveTab] = useState<'jobData' | 'schedule' | 'journal'>('jobData');
  const [formData, setFormData] = useState<Partial<WorkOrder>>({});
  const [newJournalNote, setNewJournalNote] = useState('');
  const [showNewJobSiteForm, setShowNewJobSiteForm] = useState(false);

  // New Job Site Mini-Form State
  const [newSiteData, setNewSiteData] = useState<Partial<JobSite>>({
    name: '',
    propertyType: 'Residential',
    address: '',
    city: 'Pensacola',
    state: 'FL',
    zip: '32501',
    turfSqFt: 12000,
    grassType: 'St. Augustine',
    mowFrequency: 'Weekly',
    cutHeightInches: 3.0,
    gateCode: '',
    hazards: ''
  });

  const selectedCustomer = customers.find(c => c.id === formData.customerId) || customers[0];

  useEffect(() => {
    if (editingWorkOrder) {
      setFormData(editingWorkOrder);
    } else {
      const defaultCust = customers[0];
      const defaultSite = defaultCust?.jobSites[0];
      const defaultBill = defaultCust?.billingProfiles[0];
      const defaultSrv = serviceTypes[0];

      setFormData({
        id: `wo-${Date.now()}`,
        woNumber: `WO-${Math.floor(16000 + Math.random() * 9000)}`,
        customerId: defaultCust?.id || '',
        customerName: defaultCust?.name || '',
        customerPhone: defaultCust?.phone || '',
        customerEmail: defaultCust?.email || '',
        billingProfileId: defaultBill?.id || '',
        billingProfileLabel: defaultBill?.label || 'Default Billing',
        billToAddress: defaultBill?.billingAddress || '',
        billToCity: defaultBill?.billingCity || 'Pensacola',
        billToState: defaultBill?.billingState || 'FL',
        billToZip: defaultBill?.billingZip || '32501',
        jobSiteId: defaultSite?.id || '',
        jobName: defaultSite ? `${defaultSite.name} - ${defaultSrv?.name || 'Turf Care'}` : 'Turf Maintenance',
        propertyType: defaultSite?.propertyType || 'Residential',
        jobContact: defaultCust?.name || '',
        jobCell: defaultCust?.cell || '',
        jobAddress: defaultSite?.address || '',
        jobCity: defaultSite?.city || 'Pensacola',
        jobState: defaultSite?.state || 'FL',
        jobZip: defaultSite?.zip || '32501',
        jobCounty: defaultSite?.county || 'Escambia',
        jobCrossStreet: defaultSite?.crossStreet || '',
        turfSqFt: defaultSite?.turfSqFt || 12000,
        grassType: defaultSite?.grassType || 'St. Augustine',
        cutHeightInches: defaultSite?.cutHeightInches || 3.0,
        leedProject: defaultSite?.leedProject || false,
        hazards: defaultSite?.hazards || '',
        lat: defaultSite?.lat || 30.4213,
        lng: defaultSite?.lng || -87.2169,
        distanceMiles: 4.5,
        status: 'active',
        serviceTypeId: defaultSrv?.id || '',
        serviceTypeName: defaultSrv?.name || 'Weekly Premium Mowing, Edging & Blowing',
        technicianId: 'tech-2',
        technicianName: 'Craig',
        sequenceNum: 10,
        date: currentDate || '2026-08-28',
        autoScheduled: true,
        qtyAsset: 1,
        assetType: defaultSrv?.requiredEquipment || '60" Commercial Zero-Turn',
        assetId: '',
        material: defaultSrv?.defaultMaterial || 'None',
        materialQuantity: '',
        notes: defaultSite?.notes || '',
        laydownDepotName: 'Main HQ Operations & Equipment Shop',
        flags: {
          hasDocument: true,
          hasHazard: !!defaultSite?.hazards,
          hasNotes: !!defaultSite?.notes,
          hasEquipment: true,
          hasMaterial: false,
          hasDriver: true,
          isCompleted: false,
          isNested: false
        },
        balanceDue: defaultSrv?.defaultRate || 65.00,
        totalAmount: defaultSrv?.defaultRate || 65.00,
        paymentMethod: defaultBill?.paymentMethod || 'Credit Card',
        isPaidInFull: false,
        oneTime: false,
        journalLogs: [
          {
            id: `j-${Date.now()}`,
            timestamp: new Date().toLocaleDateString('en-US') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            author: 'Dispatcher',
            message: 'Created new landscaping work order.',
            type: 'status'
          }
        ]
      });
    }
  }, [editingWorkOrder, isWorkOrderModalOpen, currentDate, customers, serviceTypes]);

  if (!isWorkOrderModalOpen) return null;

  const handleCustomerSelect = (customerId: string) => {
    const cust = customers.find(c => c.id === customerId);
    if (!cust) return;

    const primarySite = cust.jobSites[0];
    const primaryBill = cust.billingProfiles.find(b => b.isDefault) || cust.billingProfiles[0];

    setFormData(prev => ({
      ...prev,
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      customerEmail: cust.email,
      billingProfileId: primaryBill?.id || '',
      billingProfileLabel: primaryBill?.label || 'Default Profile',
      billToAddress: primaryBill?.billingAddress || '',
      billToCity: primaryBill?.billingCity || 'Pensacola',
      billToState: primaryBill?.billingState || 'FL',
      billToZip: primaryBill?.billingZip || '32501',
      jobSiteId: primarySite?.id || '',
      jobName: primarySite ? `${primarySite.name} - ${prev.serviceTypeName || 'Turf Care'}` : 'Turf Maintenance',
      propertyType: primarySite?.propertyType || 'Residential',
      jobContact: cust.name,
      jobCell: cust.cell,
      jobAddress: primarySite?.address || '',
      jobCity: primarySite?.city || 'Pensacola',
      jobState: primarySite?.state || 'FL',
      jobZip: primarySite?.zip || '32501',
      jobCounty: primarySite?.county || 'Escambia',
      jobCrossStreet: primarySite?.crossStreet || '',
      turfSqFt: primarySite?.turfSqFt || 12000,
      grassType: primarySite?.grassType || 'St. Augustine',
      cutHeightInches: primarySite?.cutHeightInches || 3.0,
      hazards: primarySite?.hazards || cust.notes || '',
      lat: primarySite?.lat || 30.4213,
      lng: primarySite?.lng || -87.2169,
      balanceDue: cust.balance,
      flags: {
        ...(prev.flags || {
          hasDocument: true,
          hasHazard: false,
          hasNotes: false,
          hasEquipment: true,
          hasMaterial: false,
          hasDriver: true,
          isCompleted: false,
          isNested: false
        }),
        hasHazard: !!(primarySite?.hazards || cust.notes)
      }
    }));
  };

  const handleJobSiteSelect = (siteId: string) => {
    if (siteId === 'NEW_SITE') {
      setShowNewJobSiteForm(true);
      return;
    }

    const site = selectedCustomer?.jobSites.find(s => s.id === siteId);
    if (!site) return;

    setFormData(prev => ({
      ...prev,
      jobSiteId: site.id,
      jobName: `${site.name} - ${prev.serviceTypeName || 'Service'}`,
      propertyType: site.propertyType,
      jobAddress: site.address,
      jobCity: site.city,
      jobState: site.state,
      jobZip: site.zip,
      jobCounty: site.county || 'Escambia',
      jobCrossStreet: site.crossStreet || '',
      turfSqFt: site.turfSqFt,
      grassType: site.grassType,
      cutHeightInches: site.cutHeightInches || 3.0,
      hazards: site.hazards || '',
      lat: site.lat,
      lng: site.lng,
      flags: {
        ...prev.flags!,
        hasHazard: !!site.hazards
      }
    }));
  };

  const handleBillingProfileSelect = (profileId: string) => {
    const prof = selectedCustomer?.billingProfiles.find(b => b.id === profileId);
    if (!prof) return;

    setFormData(prev => ({
      ...prev,
      billingProfileId: prof.id,
      billingProfileLabel: prof.label,
      billToAddress: prof.billingAddress,
      billToCity: prof.billingCity,
      billToState: prof.billingState,
      billToZip: prof.billingZip,
      paymentMethod: prof.paymentMethod
    }));
  };

  const handleServiceTypeSelect = (serviceId: string) => {
    const srv = serviceTypes.find(s => s.id === serviceId);
    if (!srv) return;

    setFormData(prev => ({
      ...prev,
      serviceTypeId: srv.id,
      serviceTypeName: srv.name,
      totalAmount: srv.defaultRate,
      balanceDue: srv.defaultRate,
      assetType: srv.requiredEquipment || prev.assetType || '60" Commercial Zero-Turn',
      material: srv.defaultMaterial || prev.material || 'None',
      notes: srv.description ? `${srv.description}\n${prev.notes || ''}` : prev.notes
    }));
  };

  const handleSaveNewJobSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteData.name || !newSiteData.address) {
      alert('Site Name and Address are required.');
      return;
    }

    const createdSite: JobSite = {
      id: `site-${Date.now()}`,
      customerId: selectedCustomer.id,
      name: newSiteData.name || 'New Property Site',
      propertyType: newSiteData.propertyType || 'Residential',
      address: newSiteData.address || '',
      city: newSiteData.city || 'Pensacola',
      state: newSiteData.state || 'FL',
      zip: newSiteData.zip || '32501',
      lat: 30.4213 + (Math.random() - 0.5) * 0.1,
      lng: -87.2169 + (Math.random() - 0.5) * 0.1,
      turfSqFt: Number(newSiteData.turfSqFt) || 10000,
      grassType: (newSiteData.grassType as any) || 'St. Augustine',
      mowFrequency: (newSiteData.mowFrequency as any) || 'Weekly',
      cutHeightInches: Number(newSiteData.cutHeightInches) || 3.0,
      gateCode: newSiteData.gateCode,
      hazards: newSiteData.hazards
    };

    addJobSite(selectedCustomer.id, createdSite);
    setShowNewJobSiteForm(false);
    handleJobSiteSelect(createdSite.id);
  };

  const handleSaveWorkOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.jobAddress) {
      alert('Please provide customer name and job address.');
      return;
    }

    const targetDate = formData.date || currentDate || '2026-08-28';
    const matchedTech = technicians.find(t => t.name === formData.technicianName);
    
    const updatedWo: WorkOrder = {
      ...(formData as WorkOrder),
      date: targetDate,
      technicianId: matchedTech ? matchedTech.id : '',
      flags: {
        hasDocument: true,
        hasHazard: formData.status === 'attention' || !!formData.hazards || !!formData.flags?.hasHazard,
        hasNotes: !!formData.notes,
        hasEquipment: !!formData.assetType,
        hasMaterial: !!formData.material && formData.material !== 'None',
        hasDriver: !!formData.technicianName && formData.technicianName !== 'Unassigned',
        isCompleted: formData.flags?.isCompleted || formData.status === 'completed',
        isNested: formData.flags?.isNested || false
      }
    };

    if (editingWorkOrder) {
      updateWorkOrder(updatedWo);
    } else {
      addWorkOrder(updatedWo);
    }

    // Auto-sync current active view date and navigate to dispatch board so user immediately sees their new work order!
    setCurrentDate(targetDate);
    setGlobalActiveTab('dispatch');
    closeWorkOrderModal();
  };

  const handleAddJournalNote = () => {
    if (!newJournalNote.trim()) return;
    const newEntry = {
      id: `j-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-US') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      author: 'Dispatcher',
      message: newJournalNote.trim(),
      type: 'field_note' as const
    };
    setFormData(prev => ({
      ...prev,
      journalLogs: [newEntry, ...(prev.journalLogs || [])]
    }));
    setNewJournalNote('');
  };

  const STATUS_OPTIONS = [
    { value: 'active', label: 'Active / On-Site / Ready', color: 'bg-[#16a34a] text-white', border: 'border-emerald-600', dot: 'bg-emerald-500' },
    { value: 'scheduled', label: 'Scheduled / Dispatched', color: 'bg-[#06b6d4] text-white', border: 'border-cyan-500', dot: 'bg-cyan-400' },
    { value: 'urgent', label: 'Urgent / Priority Emergency', color: 'bg-[#c026d3] text-white', border: 'border-fuchsia-600', dot: 'bg-fuchsia-400' },
    { value: 'attention', label: 'Attention / Hazard / Delayed', color: 'bg-[#ea580c] text-white', border: 'border-orange-600', dot: 'bg-orange-400' },
    { value: 'completed', label: 'Completed & Verified', color: 'bg-emerald-800 text-white', border: 'border-emerald-900', dot: 'bg-emerald-300' }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5">
      <div className="bg-[#e9ecef] border-2 border-slate-400 rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[96vh] text-slate-800">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-3 sm:px-4 py-2.5 flex items-center justify-between shadow-md border-b border-slate-700">
          <div className="flex items-center space-x-2 sm:space-x-3 truncate">
            <span className="font-black text-xs sm:text-sm tracking-wide truncate">
              {editingWorkOrder ? `Edit WO: ${formData.woNumber}` : 'Add Work Order'}
            </span>
            <span className="text-[11px] text-amber-400 font-bold hidden sm:inline">
              • 1st Generation Land Services LLC
            </span>
          </div>
          <button
            onClick={closeWorkOrderModal}
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* 3 Tabs: Job Data | Schedule | Journal */}
        <div className="bg-slate-200 border-b border-slate-300 px-2 sm:px-4 pt-2 flex items-center space-x-1 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('jobData')}
            className={`px-3 sm:px-5 py-2 rounded-t-lg text-xs font-black tracking-wide transition border-t border-l border-r whitespace-nowrap flex-shrink-0 ${
              activeTab === 'jobData'
                ? 'bg-[#e9ecef] text-slate-900 border-slate-400 shadow-xs'
                : 'bg-slate-300/80 text-slate-600 border-transparent hover:bg-slate-300'
            }`}
          >
            Job Data & Site
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`px-3 sm:px-5 py-2 rounded-t-lg text-xs font-black tracking-wide transition border-t border-l border-r whitespace-nowrap flex-shrink-0 ${
              activeTab === 'schedule'
                ? 'bg-[#e9ecef] text-slate-900 border-slate-400 shadow-xs'
                : 'bg-slate-300/80 text-slate-600 border-transparent hover:bg-slate-300'
            }`}
          >
            Schedule & Recurrence
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('journal')}
            className={`px-3 sm:px-5 py-2 rounded-t-lg text-xs font-black tracking-wide transition border-t border-l border-r flex items-center space-x-1.5 whitespace-nowrap flex-shrink-0 ${
              activeTab === 'journal'
                ? 'bg-[#e9ecef] text-slate-900 border-slate-400 shadow-xs'
                : 'bg-slate-300/80 text-slate-600 border-transparent hover:bg-slate-300'
            }`}
          >
            <span>Journal & Logs</span>
            <span className="px-1.5 py-0.2 bg-slate-400/50 text-slate-800 text-[10px] rounded-full font-bold">
              {formData.journalLogs?.length || 0}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSaveWorkOrder} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-medium">
          {/* TOP HIGHLIGHT: STATUS & COLOR CODING SELECTOR */}
          <div className="bg-white border-2 border-slate-300 rounded-xl p-3 shadow-xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="font-extrabold text-slate-800 uppercase tracking-wide text-xs flex items-center">
                <Flame className="w-3.5 h-3.5 text-amber-500 mr-1.5" />
                Work Order Status, Priority & Color Tag:
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">
                Sets row color on Dispatch Board & map pins
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const isSelected = formData.status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        status: opt.value as any,
                        flags: {
                          ...(prev.flags || {
                            hasDocument: true,
                            hasHazard: false,
                            hasNotes: false,
                            hasEquipment: true,
                            hasMaterial: false,
                            hasDriver: true,
                            isCompleted: false,
                            isNested: false
                          }),
                          isCompleted: opt.value === 'completed',
                          hasHazard: opt.value === 'urgent' || opt.value === 'attention' || !!prev.hazards
                        }
                      }));
                    }}
                    className={`p-2 rounded-lg text-left font-bold text-[11px] transition border-2 flex items-center space-x-2 ${
                      isSelected
                        ? `${opt.color} ${opt.border} shadow-md ring-2 ring-slate-900/20`
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${opt.dot} flex-shrink-0`}></span>
                    <span className="truncate">{opt.label.split('/')[0].trim()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeTab === 'jobData' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* LEFT: Customer, Multi-Billing Profile & Financials */}
              <div className="space-y-4">
                <div className="border border-slate-400/80 rounded-lg p-3 bg-white/70 shadow-xs space-y-3">
                  <div className="font-bold text-slate-800 text-xs uppercase tracking-wide border-b border-slate-200 pb-1 flex items-center justify-between">
                    <span>Customer & Billing Profile:</span>
                    <span className="text-[10px] text-slate-500 font-normal">Multi-Profile Supported</span>
                  </div>

                  <div className="space-y-2">
                    {/* Customer Selector */}
                    <div className="flex items-center space-x-2">
                      <label className="w-24 text-slate-700 font-bold">Customer:</label>
                      <select
                        value={formData.customerId || ''}
                        onChange={(e) => handleCustomerSelect(e.target.value)}
                        className="flex-1 bg-amber-50 border border-slate-400 rounded px-2 py-1 font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.company ? `(${c.company})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Billing Profile Selector (Personal vs Business) */}
                    <div className="flex items-center space-x-2 bg-blue-50/70 p-2 rounded border border-blue-200">
                      <label className="w-24 text-blue-950 font-bold">Bill Profile:</label>
                      <select
                        value={formData.billingProfileId || ''}
                        onChange={(e) => handleBillingProfileSelect(e.target.value)}
                        className="flex-1 bg-white border border-blue-300 rounded px-2 py-1 font-bold text-blue-900 focus:outline-none"
                      >
                        {selectedCustomer?.billingProfiles.map(bp => (
                          <option key={bp.id} value={bp.id}>
                            [{bp.billingType}] {bp.label} ({bp.paymentMethod})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <label className="w-24 text-slate-700">Billing Address:</label>
                      <input
                        type="text"
                        value={formData.billToAddress || ''}
                        onChange={(e) => setFormData({ ...formData, billToAddress: e.target.value })}
                        className="flex-1 bg-white border border-slate-400 rounded px-2 py-1 text-slate-900"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <label className="w-24 text-slate-700">City / State / Zip:</label>
                      <input
                        type="text"
                        value={formData.billToCity || ''}
                        onChange={(e) => setFormData({ ...formData, billToCity: e.target.value })}
                        className="w-28 bg-white border border-slate-400 rounded px-2 py-1"
                      />
                      <input
                        type="text"
                        value={formData.billToState || 'FL'}
                        onChange={(e) => setFormData({ ...formData, billToState: e.target.value })}
                        className="w-14 bg-white border border-slate-400 rounded px-1 py-1 text-center font-bold"
                      />
                      <input
                        type="text"
                        value={formData.billToZip || ''}
                        onChange={(e) => setFormData({ ...formData, billToZip: e.target.value })}
                        className="w-20 bg-white border border-slate-400 rounded px-2 py-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Financials Box */}
                <div className="border border-slate-400/80 rounded-lg p-3 bg-white/70 shadow-xs space-y-2.5">
                  <div className="font-bold text-slate-800 text-xs uppercase tracking-wide border-b border-slate-200 pb-1">
                    Financials & Pricing:
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-600 block text-[11px]">Total Price ($):</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.totalAmount || 0}
                        onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) || 0, balanceDue: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-400 rounded px-2 py-1 font-mono font-bold text-slate-900 text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-slate-600 block text-[11px]">Payment Method:</label>
                      <select
                        value={formData.paymentMethod || 'Credit Card'}
                        onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                        className="w-full bg-white border border-slate-400 rounded px-2 py-1"
                      >
                        <option value="Credit Card">Credit Card</option>
                        <option value="ACH / Bank Transfer">ACH / Bank Transfer</option>
                        <option value="Net 30 Invoice">Net 30 Invoice</option>
                        <option value="Check">Check</option>
                        <option value="Cash">Cash</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center space-x-2 font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isPaidInFull || false}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          isPaidInFull: e.target.checked, 
                          balanceDue: e.target.checked ? 0 : formData.totalAmount || 0 
                        })}
                        className="w-4 h-4 rounded text-emerald-600"
                      />
                      <span>Paid in Full</span>
                    </label>

                    <div className="flex items-center space-x-1">
                      <span className="text-slate-600">Balance Due:</span>
                      <span className="font-mono font-black text-sm text-red-600">
                        ${formData.balanceDue?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: Multi-Job-Site Property & Service Catalog */}
              <div className="space-y-4">
                {/* Job Site Selection (Residential vs Commercial) */}
                <div className="border border-slate-400/80 rounded-lg p-3 bg-white/70 shadow-xs space-y-3">
                  <div className="font-bold text-slate-800 text-xs uppercase tracking-wide border-b border-slate-200 pb-1 flex items-center justify-between">
                    <span>Job Site Property (Multi-Location):</span>
                    <button
                      type="button"
                      onClick={() => setShowNewJobSiteForm(!showNewJobSiteForm)}
                      className="flex items-center space-x-1 text-[11px] bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded border border-amber-300"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add New Site</span>
                    </button>
                  </div>

                  {showNewJobSiteForm ? (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2">
                      <span className="font-bold text-xs text-amber-950 block">Quick Add New Property Site:</span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Property Name (e.g. Vacation Home / Plaza)"
                          value={newSiteData.name || ''}
                          onChange={(e) => setNewSiteData({ ...newSiteData, name: e.target.value })}
                          className="bg-white border border-slate-300 rounded px-2 py-1"
                        />
                        <select
                          value={newSiteData.propertyType || 'Residential'}
                          onChange={(e) => setNewSiteData({ ...newSiteData, propertyType: e.target.value as any })}
                          className="bg-white border border-slate-300 rounded px-2 py-1 font-bold"
                        >
                          <option value="Residential">Residential Property</option>
                          <option value="Commercial">Commercial Property</option>
                        </select>
                      </div>
                      <input
                        type="text"
                        placeholder="Street Address"
                        value={newSiteData.address || ''}
                        onChange={(e) => setNewSiteData({ ...newSiteData, address: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1"
                      />
                      <div className="flex justify-end space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowNewJobSiteForm(false)}
                          className="px-2 py-1 bg-slate-200 rounded text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveNewJobSite}
                          className="px-3 py-1 bg-amber-600 text-white font-bold rounded text-xs"
                        >
                          Save Site & Select
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Job Site Dropdown */}
                      <div className="flex items-center space-x-2">
                        <label className="w-24 text-slate-700 font-bold">Select Site:</label>
                        <select
                          value={formData.jobSiteId || ''}
                          onChange={(e) => handleJobSiteSelect(e.target.value)}
                          className="flex-1 bg-amber-50/80 border border-amber-400 rounded px-2 py-1 font-bold text-slate-900 focus:outline-none"
                        >
                          {selectedCustomer?.jobSites.map(site => (
                            <option key={site.id} value={site.id}>
                              [{site.propertyType}] {site.name} - {site.address}
                            </option>
                          ))}
                          <option value="NEW_SITE">+ Add New Location / Site...</option>
                        </select>
                      </div>

                      <div className="flex items-center space-x-2">
                        <label className="w-24 text-slate-700">Site Address:</label>
                        <input
                          type="text"
                          value={formData.jobAddress || ''}
                          onChange={(e) => setFormData({ ...formData, jobAddress: e.target.value })}
                          className="flex-1 bg-white border border-slate-400 rounded px-2 py-1"
                        />
                      </div>

                      {/* Turf Specs Card */}
                      <div className="grid grid-cols-3 gap-2 bg-amber-50/50 p-2 rounded border border-amber-200 text-[11px]">
                        <div>
                          <label className="text-amber-950 font-bold block text-[10px]">Turf Area (Sq Ft):</label>
                          <input
                            type="number"
                            value={formData.turfSqFt || 0}
                            onChange={(e) => setFormData({ ...formData, turfSqFt: parseInt(e.target.value) || 0 })}
                            className="w-full bg-white border border-amber-300 rounded px-1.5 py-0.5 font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-amber-950 font-bold block text-[10px]">Grass Species:</label>
                          <input
                            type="text"
                            value={formData.grassType || 'St. Augustine'}
                            onChange={(e) => setFormData({ ...formData, grassType: e.target.value })}
                            className="w-full bg-white border border-amber-300 rounded px-1.5 py-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-amber-950 font-bold block text-[10px]">Cut Height (In):</label>
                          <input
                            type="number"
                            step="0.5"
                            value={formData.cutHeightInches || 3.0}
                            onChange={(e) => setFormData({ ...formData, cutHeightInches: parseFloat(e.target.value) || 3.0 })}
                            className="w-full bg-white border border-amber-300 rounded px-1.5 py-0.5 font-bold"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-slate-700 font-bold block mb-0.5 text-amber-800 flex items-center">
                          <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                          Gate Codes, Dog Warnings & Site Hazards:
                        </label>
                        <textarea
                          rows={2}
                          value={formData.hazards || ''}
                          onChange={(e) => setFormData({ ...formData, hazards: e.target.value })}
                          placeholder="e.g. Gate code #8821. Two dogs behind fence. Sprinkler flags."
                          className="w-full bg-amber-50/70 border border-amber-300 rounded px-2 py-1 text-slate-900"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Service Catalog & Technician Dispatch */}
                <div className="border border-slate-400/80 rounded-lg p-3 bg-white/70 shadow-xs space-y-3">
                  <div className="font-bold text-slate-800 text-xs uppercase tracking-wide border-b border-slate-200 pb-1">
                    Service Catalog & Technician Assignment:
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-slate-600 block text-[11px] font-bold">Service Type Preset:</label>
                        <select
                          value={formData.serviceTypeId || ''}
                          onChange={(e) => handleServiceTypeSelect(e.target.value)}
                          className="w-full bg-amber-50/70 border border-amber-400 rounded px-2 py-1 font-bold text-slate-900"
                        >
                          {serviceTypes.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} (${s.defaultRate.toFixed(2)} {s.unitLabel})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-slate-600 block text-[11px] font-bold flex items-center">
                          <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          Assigned Technician:
                        </label>
                        <select
                          value={formData.technicianName || 'Craig'}
                          onChange={(e) => setFormData({ ...formData, technicianName: e.target.value })}
                          className="w-full bg-white border border-slate-400 rounded px-2 py-1 font-bold text-slate-900"
                        >
                          <option value="Unassigned">-- Unassigned --</option>
                          {technicians.map(t => (
                            <option key={t.id} value={t.name}>{t.name} ({t.role})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-slate-600 block text-[11px] font-bold">Scheduled Date:</label>
                        <input
                          type="date"
                          value={formData.date || currentDate || '2026-08-28'}
                          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                          className="w-full bg-white border-2 border-amber-400 rounded px-2 py-1 font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="text-slate-600 block text-[11px]">Sequence #:</label>
                        <input
                          type="number"
                          value={formData.sequenceNum || 10}
                          onChange={(e) => setFormData({ ...formData, sequenceNum: parseInt(e.target.value) || 0 })}
                          className="w-full bg-white border border-slate-400 rounded px-2 py-1 font-mono font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-slate-600 block text-[11px]">PO # (Optional):</label>
                        <input
                          type="text"
                          value={formData.jobSitePO || ''}
                          onChange={(e) => setFormData({ ...formData, jobSitePO: e.target.value })}
                          placeholder="PO-1029"
                          className="w-full bg-white border border-slate-400 rounded px-2 py-1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-slate-600 block text-[11px]">Equipment Required:</label>
                        <select
                          value={formData.assetType || '60" Commercial Zero-Turn'}
                          onChange={(e) => setFormData({ ...formData, assetType: e.target.value })}
                          className="w-full bg-white border border-slate-400 rounded px-2 py-1"
                        >
                          <option value='60" Commercial Zero-Turn'>60" Commercial Zero-Turn Mower</option>
                          <option value='52" Stand-On Mower'>52" Stand-On Mower</option>
                          <option value='36" Walk-Behind Mower'>36" Walk-Behind (Gated)</option>
                          <option value='Stand-On Core Aerator'>Stand-On Core Aerator</option>
                          <option value='Commercial Dump Trailer'>Commercial Dump Trailer</option>
                          <option value='Compact Skid Steer'>Compact Skid Steer / Track Loader</option>
                          <option value='Hydroseeder Rig'>Hydroseeder Rig</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-slate-600 block text-[11px]">Materials / Mulch / Sod:</label>
                        <input
                          type="text"
                          value={formData.material || ''}
                          onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                          placeholder="e.g. Dark Mulch (6 Yds) or Bermuda Sod"
                          className="w-full bg-white border border-slate-400 rounded px-2 py-1"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-slate-600 block text-[11px]">Technician Field Notes:</label>
                      <input
                        type="text"
                        value={formData.notes || ''}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Instructions for crew on property..."
                        className="w-full bg-white border border-slate-400 rounded px-2 py-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SCHEDULE */}
          {activeTab === 'schedule' && (
            <div className="bg-white border border-slate-400 rounded-lg p-5 space-y-4">
              <h3 className="font-bold text-sm text-slate-800 border-b pb-2">Appointment Schedule & Recurrence</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Scheduled Date:</label>
                  <input
                    type="date"
                    value={formData.date || currentDate || '2026-08-28'}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Time Window:</label>
                  <select className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-sm">
                    <option>Morning (7:00 AM - 11:00 AM)</option>
                    <option>Midday (11:00 AM - 2:00 PM)</option>
                    <option>Afternoon (2:00 PM - 6:00 PM)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-slate-700">Recurrence Frequency:</label>
                  <select
                    value={formData.autoScheduled ? 'weekly' : 'onetime'}
                    onChange={(e) => setFormData({ ...formData, autoScheduled: e.target.value !== 'onetime' })}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-sm"
                  >
                    <option value="weekly">Weekly Mowing & Grounds Care</option>
                    <option value="biweekly">Bi-Weekly Maintenance</option>
                    <option value="monthly">Monthly Turf & Plant Care</option>
                    <option value="onetime">One-Time Project</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: JOURNAL */}
          {activeTab === 'journal' && (
            <div className="bg-white border border-slate-400 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-bold text-sm text-slate-800">Activity Journal & Change History</h3>
                <span className="text-xs text-slate-500">{formData.journalLogs?.length || 0} entries</span>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Type field note or dispatch update..."
                  value={newJournalNote}
                  onChange={(e) => setNewJournalNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddJournalNote())}
                  className="flex-1 bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddJournalNote}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-bold"
                >
                  Add Entry
                </button>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
                {formData.journalLogs?.map(log => (
                  <div key={log.id} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                    <div className="flex items-center justify-between text-slate-500 font-mono text-[11px]">
                      <span className="font-bold text-slate-800">{log.author}</span>
                      <span>{log.timestamp}</span>
                    </div>
                    <p className="text-slate-800 mt-1">{log.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-300 flex items-center justify-between">
            <div className="text-[11px] text-slate-600 font-mono font-bold">
              Technician: <span className="text-slate-900">{formData.technicianName || 'Unassigned'}</span> • Date: <span className="text-amber-800">{formData.date || currentDate}</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={closeWorkOrderModal}
                className="px-4 py-2 bg-slate-300 hover:bg-slate-400 text-slate-800 rounded font-bold text-xs transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center space-x-1.5 px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-black text-xs transition shadow-md"
              >
                <Save className="w-4 h-4" />
                <span>Save Work Order</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
