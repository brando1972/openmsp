import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { Invoice } from '../../types';
import { 
  X, 
  Printer, 
  Download, 
  CreditCard, 
  CheckCircle2, 
  DollarSign, 
  Building2, 
  Mail, 
  Phone,
  ShieldCheck
} from 'lucide-react';

export const InvoicePreviewModal: React.FC = () => {
  const { viewingInvoice, setViewingInvoice, recordPayment, companyName } = useApp();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState('Credit Card');
  const [payRef, setPayRef] = useState('');

  if (!viewingInvoice) return null;

  const inv = viewingInvoice;

  const handleOpenPay = () => {
    setPayAmount(inv.balanceDue);
    setPayRef(`TXN-${Math.floor(100000 + Math.random() * 900000)}`);
    setShowPaymentModal(true);
  };

  const handleProcessPayment = (e: React.FormEvent) => {
    e.preventDefault();
    recordPayment(inv.id, payAmount, payMethod, payRef);
    alert(`Payment of $${payAmount.toFixed(2)} successfully recorded!`);
    setShowPaymentModal(false);
    setViewingInvoice(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-3xl overflow-hidden flex flex-col max-h-[95vh] text-slate-800 text-xs">
        {/* Header Bar */}
        <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between no-print">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm">Invoice Preview: {inv.invoiceNumber}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
              inv.status === 'Paid' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-slate-900'
            }`}>
              {inv.status}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {inv.balanceDue > 0 && (
              <button
                onClick={handleOpenPay}
                className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold transition shadow"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Process Payment</span>
              </button>
            )}

            <button
              onClick={() => window.print()}
              className="flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded font-bold transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={() => setViewingInvoice(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Sheet */}
        <div className="flex-1 overflow-y-auto p-8 bg-white text-slate-900 space-y-6">
          {/* Invoice Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6">
            <div className="flex items-start space-x-4">
              <img 
                src="/assets/1st_generation_logo.jpg" 
                alt="1st Generation Land Services LLC" 
                className="h-16 object-contain"
              />
              <div>
                <h2 className="font-black text-xl text-slate-900 tracking-tight">1ST GENERATION LAND SERVICES LLC</h2>
                <p className="text-amber-800 font-bold text-xs">Professional Turf, Grounds Care & Property Maintenance</p>
                <p className="text-slate-500 text-[11px] mt-1">4520 W Fairfield Dr, Pensacola, FL 32505</p>
                <p className="text-slate-500 text-[11px]">Phone: (850) 449-8219 • Billing: ap@1stgenerationland.com</p>
              </div>
            </div>

            <div className="text-right">
              <h1 className="text-2xl font-black text-slate-900 tracking-wider uppercase">INVOICE</h1>
              <p className="font-mono font-bold text-sm text-amber-700 mt-1">{inv.invoiceNumber}</p>
              <p className="text-xs text-slate-500 mt-1">Date: <span className="font-semibold text-slate-800">{inv.dateCompleted}</span></p>
              <p className="text-xs text-slate-500">Due Date: <span className="font-semibold text-slate-800">{inv.dueDate}</span></p>
            </div>
          </div>

          {/* Bill To & Service Address */}
          <div className="grid grid-cols-2 gap-6 bg-amber-50/40 p-4 rounded-xl border border-amber-200/80 text-xs">
            <div>
              <span className="text-[10px] font-bold text-amber-900 uppercase block mb-1">Billed To:</span>
              <p className="font-bold text-sm text-slate-900">{inv.customerName}</p>
              {inv.billingProfileLabel && (
                <p className="text-xs text-amber-800 font-semibold">{inv.billingProfileLabel}</p>
              )}
              <p className="text-slate-600 mt-0.5">{inv.billingAddress}</p>
              <p className="text-slate-600">{inv.customerEmail}</p>
            </div>

            <div>
              <span className="text-[10px] font-bold text-amber-900 uppercase block mb-1">Payment Status:</span>
              <div className="flex items-center space-x-2 mt-1">
                <span className={`px-2.5 py-1 rounded text-xs font-black uppercase ${
                  inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}>
                  {inv.status}
                </span>
                {inv.paymentMethod && (
                  <span className="text-slate-600 text-[11px]">via {inv.paymentMethod}</span>
                )}
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-300 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Service / Material Description</th>
                  <th className="py-2.5 px-4 text-center w-20">Qty</th>
                  <th className="py-2.5 px-4 text-right w-28">Unit Price</th>
                  <th className="py-2.5 px-4 text-right w-28">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {inv.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 px-4 font-medium text-slate-900">{item.description}</td>
                    <td className="py-3 px-4 text-center font-mono">{item.quantity}</td>
                    <td className="py-3 px-4 text-right font-mono">${item.unitPrice.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">${item.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="flex justify-end pt-2">
            <div className="w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">${inv.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Florida Sales Tax ({(inv.taxRate * 100).toFixed(1)}%):</span>
                <span className="font-mono">${inv.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-300 pt-1.5">
                <span>Total:</span>
                <span className="font-mono font-black">${inv.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Amount Paid:</span>
                <span className="font-mono text-emerald-700 font-semibold">-${inv.amountPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-black text-base text-slate-900 border-t-2 border-slate-900 pt-1.5">
                <span>Balance Due:</span>
                <span className={`font-mono ${inv.balanceDue > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  ${inv.balanceDue.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="border-t border-slate-200 pt-4 text-center text-slate-500 text-[11px]">
            <p className="font-bold text-slate-800">1st Generation Land Services LLC</p>
            <p className="mt-0.5">Thank you for trusting us with your property care. Inquiries: (850) 449-8219.</p>
          </div>
        </div>

        {/* Payment Processing Modal Overlay */}
        {showPaymentModal && (
          <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md p-5 text-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-bold text-sm flex items-center text-slate-900">
                  <CreditCard className="w-4 h-4 text-emerald-600 mr-1.5" />
                  Process Customer Payment
                </h3>
                <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleProcessPayment} className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Customer & Invoice</span>
                  <span className="font-bold text-slate-900">{inv.customerName} ({inv.invoiceNumber})</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Amount ($):</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-sm font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Method:</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2"
                  >
                    <option value="Credit Card (Visa ending in 4242)">Credit Card (Visa ending in 4242)</option>
                    <option value="Check">Check</option>
                    <option value="ACH / Bank Transfer">ACH / Bank Transfer</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Auth / Check Reference #:</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono"
                  />
                </div>

                <div className="pt-3 border-t flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow"
                  >
                    Confirm & Record Payment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
