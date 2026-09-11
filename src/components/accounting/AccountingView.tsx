import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { Invoice } from '../../types';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { 
  DollarSign, 
  Search, 
  Printer, 
  Trash2, 
  RotateCcw, 
  Settings, 
  Calculator, 
  Moon, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Eye, 
  Plus,
  RefreshCw,
  CreditCard,
  Building2,
  Home
} from 'lucide-react';

export const AccountingView: React.FC = () => {
  const { 
    invoices, 
    workOrders, 
    setViewingInvoice, 
    deleteInvoice, 
    batchGenerateInvoices,
    setActiveTab 
  } = useApp();

  const [activeAccountingSubTab, setActiveAccountingSubTab] = useState<string>('toBeBilled');
  const [selectedQueue, setSelectedQueue] = useState<string>('To be Billed');
  const [propertyFilter, setPropertyFilter] = useState<'ALL' | 'Residential' | 'Commercial'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  const filteredInvoices = invoices.filter(inv => {
    const matchesQueue = selectedQueue === 'ALL' 
      ? true 
      : selectedQueue === 'To be Billed' 
        ? (inv.status === 'To Be Billed' || inv.status === 'Draft' || inv.status === 'Sent')
        : inv.status === selectedQueue;

    const matchesProperty = propertyFilter === 'ALL' || inv.propertyType === propertyFilter;

    const q = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      inv.customerName.toLowerCase().includes(q) ||
      inv.billingAddress.toLowerCase().includes(q) ||
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.billingProfileLabel && inv.billingProfileLabel.toLowerCase().includes(q));

    return matchesQueue && matchesProperty && matchesSearch;
  });

  const handleSelectAll = () => {
    if (selectedInvoiceIds.length === filteredInvoices.length) {
      setSelectedInvoiceIds([]);
    } else {
      setSelectedInvoiceIds(filteredInvoices.map(i => i.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedInvoiceIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBatchGenerate = () => {
    const unbilledWOs = workOrders.filter(wo => wo.flags.isCompleted || wo.status === 'completed');
    batchGenerateInvoices(unbilledWOs.map(w => w.id));
    alert(`Batch billing generated for ${unbilledWOs.length} completed work orders!`);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-100 overflow-hidden text-xs">
      {/* Top Breadcrumb & Accounting Subtabs */}
      <div className="bg-slate-200 border-b border-slate-300 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center space-x-1 text-slate-700 font-bold">
          <button 
            onClick={() => setActiveAccountingSubTab('home')}
            className={`px-3 py-1 rounded transition ${activeAccountingSubTab === 'home' ? 'bg-white text-slate-900 border border-slate-300' : 'hover:bg-slate-300'}`}
          >
            Home
          </button>
          <button 
            onClick={() => setActiveAccountingSubTab('toBeBilled')}
            className={`px-3 py-1 rounded transition ${activeAccountingSubTab === 'toBeBilled' ? 'bg-white text-slate-900 border border-slate-300 font-black' : 'hover:bg-slate-300'}`}
          >
            Batch Invoices
          </button>
          <button 
            onClick={() => setActiveAccountingSubTab('pricing')}
            className={`px-3 py-1 rounded transition ${activeAccountingSubTab === 'pricing' ? 'bg-white text-slate-900 border border-slate-300' : 'hover:bg-slate-300'}`}
          >
            Pricing & Services
          </button>
          <button 
            onClick={() => setActiveAccountingSubTab('statements')}
            className={`px-3 py-1 rounded transition ${activeAccountingSubTab === 'statements' ? 'bg-white text-slate-900 border border-slate-300' : 'hover:bg-slate-300'}`}
          >
            Customer Statements
          </button>
          <button 
            onClick={() => setActiveAccountingSubTab('tax')}
            className={`px-3 py-1 rounded transition ${activeAccountingSubTab === 'tax' ? 'bg-white text-slate-900 border border-slate-300' : 'hover:bg-slate-300'}`}
          >
            Tax Center (7.5%)
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded">
            Unbilled Total: ${filteredInvoices.reduce((acc, i) => acc + i.balanceDue, 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Main Title & Action Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center">
            <DollarSign className="w-5 h-5 text-emerald-600 mr-1.5" />
            Accounting & Batch Billing
          </h2>

          <select
            value={selectedQueue}
            onChange={(e) => setSelectedQueue(e.target.value)}
            className="bg-slate-50 border-2 border-slate-400 rounded-md px-3 py-1 font-bold text-slate-900 text-xs focus:outline-none focus:border-emerald-600"
          >
            <option value="To be Billed">To be Billed Queue</option>
            <option value="Paid">Paid Invoices</option>
            <option value="Draft">Draft Invoices</option>
            <option value="ALL">All Transactions</option>
          </select>

          {/* Action Toolbar Icons */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-300">
            <button
              onClick={handleBatchGenerate}
              className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold transition shadow-xs"
              title="Generate Invoices from Completed Work Orders"
            >
              <span>Generate Batch</span>
              <span className="text-[10px]">▾</span>
            </button>

            <button
              onClick={() => alert("Snoozed selected items to next billing cycle.")}
              className="p-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded transition"
              title="Snooze / Hold Selected Items"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                if (selectedInvoiceIds.length > 0 && confirm(`Void ${selectedInvoiceIds.length} selected invoice(s)?`)) {
                  selectedInvoiceIds.forEach(id => deleteInvoice(id));
                  setSelectedInvoiceIds([]);
                }
              }}
              className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded transition"
              title="Delete / Void Selected Invoices"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => alert("Batch pricing matrix and Florida sales tax (7.5%) recalculated.")}
              className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
              title="Batch Price & Tax Calculator"
            >
              <Calculator className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => window.print()}
              className="p-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded transition"
              title="Print Selected Batch Invoices"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => alert("Syncing batch ledger with QuickBooks Online...")}
              className="p-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded transition"
              title="Sync with QuickBooks"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search & Property Filter */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-300">
            <button
              onClick={() => setPropertyFilter('ALL')}
              className={`px-2 py-0.5 rounded font-semibold transition ${propertyFilter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
            >
              All
            </button>
            <button
              onClick={() => setPropertyFilter('Residential')}
              className={`px-2 py-0.5 rounded font-semibold transition ${propertyFilter === 'Residential' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}
            >
              Residential
            </button>
            <button
              onClick={() => setPropertyFilter('Commercial')}
              className={`px-2 py-0.5 rounded font-semibold transition ${propertyFilter === 'Commercial' ? 'bg-blue-700 text-white' : 'text-slate-600'}`}
            >
              Commercial
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search client, address, ID, profile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-60"
            />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs min-w-[850px]">
          <thead className="bg-slate-200 text-slate-800 font-extrabold border-b-2 border-slate-300 sticky top-0 z-10 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-2.5 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={selectedInvoiceIds.length > 0 && selectedInvoiceIds.length === filteredInvoices.length}
                  onChange={handleSelectAll}
                  className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-3 w-24">ID ↑</th>
              <th className="py-2.5 px-4 w-32">Date Completed</th>
              <th className="py-2.5 px-4 w-44">Service Rendered</th>
              <th className="py-2.5 px-4">Customer & Billing Profile</th>
              <th className="py-2.5 px-4">Billing Address</th>
              <th className="py-2.5 px-3 text-right w-24">Total</th>
              <th className="py-2.5 px-3 text-center w-14">Error</th>
              <th className="py-2.5 px-3 text-right w-28">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 bg-white">
            {filteredInvoices.map((inv) => {
              const isSelected = selectedInvoiceIds.includes(inv.id);
              const hasWarning = inv.hasWarning;

              return (
                <tr
                  key={inv.id}
                  onClick={() => handleToggleSelect(inv.id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50/90 font-semibold' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(inv.id)}
                      className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                    />
                  </td>

                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                    {inv.invoiceNumber.replace('INV-', '')}
                  </td>

                  <td className="py-2.5 px-4 text-slate-600 font-medium">
                    {inv.dateCompleted}
                  </td>

                  <td className="py-2.5 px-4 font-semibold text-slate-800">
                    {inv.items[0]?.description}
                  </td>

                  <td className="py-2.5 px-4">
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-slate-900">{inv.customerName}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${
                          inv.propertyType === 'Commercial' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {inv.propertyType || 'Residential'}
                        </span>
                      </div>
                      {inv.billingProfileLabel && (
                        <span className="text-[10px] text-slate-500 font-medium">
                          Profile: {inv.billingProfileLabel}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-2.5 px-4 text-slate-600 truncate max-w-xs">
                    {inv.billingAddress}
                  </td>

                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                    ${inv.total.toFixed(2)}
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    {hasWarning && (
                      <span
                        title={inv.warningMessage || 'Missing PO or document confirmation'}
                        className="inline-flex items-center justify-center p-0.5 text-amber-500 hover:text-amber-600 font-bold"
                      >
                        ⚠️
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end space-x-1.5">
                      <button
                        onClick={() => setViewingInvoice(inv)}
                        className="p-1 px-2 bg-slate-800 hover:bg-slate-900 text-white rounded font-bold text-[10px] flex items-center space-x-1 shadow-xs"
                        title="Preview & Print Invoice"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View</span>
                      </button>

                      {inv.balanceDue > 0 && (
                        <button
                          onClick={() => setViewingInvoice(inv)}
                          className="p-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] flex items-center space-x-1 shadow-xs"
                          title="Collect Payment"
                        >
                          <CreditCard className="w-3 h-3" />
                          <span>Pay</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <InvoicePreviewModal />
    </div>
  );
};
