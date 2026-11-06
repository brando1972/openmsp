import React from 'react';
import { createPortal } from 'react-dom';
import type { BillingDocument, BillingSettings, ClientTenant, TaxRate } from '@openmsp/api-types';
import { DOC_LABEL, money, shortDate, TERMS_LABEL } from './format';

type Company = Pick<
  BillingSettings,
  'companyName' | 'companyEmail' | 'companyPhone' | 'companyWebsite' | 'companyAddress' | 'logoUrl' | 'brandColor' | 'currency'
>;

const addr = (a?: ClientTenant['billingAddress']) =>
  a
    ? [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + (a.postalCode ? ` ${a.postalCode}` : ''), a.country]
        .map((x) => (x || '').trim())
        .filter(Boolean)
    : [];

/**
 * InvoicePaper — the branded, printable rendering of any billing document
 * (invoice, quote, sales order, credit note). Used by the console detail view,
 * the print/PDF portal, and the public client-facing /invoice/:token page.
 */
export const InvoicePaper: React.FC<{
  doc: BillingDocument;
  company: Company;
  client?: Pick<ClientTenant, 'name' | 'billingAddress' | 'contactName'> | null;
  taxRates?: TaxRate[];
}> = ({ doc, company, client, taxRates = [] }) => {
  const brand = company.brandColor || '#4f46e5';
  const cur = company.currency || 'USD';
  const label = DOC_LABEL[doc.type].one;
  const isInvoice = doc.type === 'invoice';
  const hasDiscountCol = doc.lines.some((l) => (l.discountPct || 0) > 0);

  // Tax breakdown by rate
  const taxByRate = new Map<string, { name: string; amount: number }>();
  for (const l of doc.lines) {
    if (!l.taxAmount) continue;
    const rate = taxRates.find((t) => t.id === l.taxRateId);
    const key = rate?.id || 'tax';
    const name = rate ? `${rate.name} (${rate.ratePct}%)` : 'Tax';
    const cur0 = taxByRate.get(key) || { name, amount: 0 };
    cur0.amount += l.taxAmount;
    taxByRate.set(key, cur0);
  }

  return (
    <div className="invoice-paper bg-white text-slate-800 w-full max-w-[820px] mx-auto shadow-sm border border-slate-200 rounded-lg print:shadow-none print:border-0 print:rounded-none">
      <div className="h-1.5 rounded-t-lg print:rounded-none" style={{ background: brand }} />
      <div className="p-6 sm:p-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div className="min-w-0">
            {company.logoUrl ? (
              <img src={company.logoUrl} alt={company.companyName} className="h-12 max-w-[220px] object-contain mb-2" />
            ) : (
              <div className="text-xl font-black tracking-tight" style={{ color: brand }}>
                {company.companyName}
              </div>
            )}
            <div className="text-[11px] text-slate-500 leading-relaxed mt-1">
              {company.logoUrl && <div className="font-semibold text-slate-700">{company.companyName}</div>}
              {addr(company.companyAddress).map((l) => (
                <div key={l}>{l}</div>
              ))}
              {company.companyPhone && <div>{company.companyPhone}</div>}
              {company.companyEmail && <div>{company.companyEmail}</div>}
              {company.companyWebsite && <div>{company.companyWebsite}</div>}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-2xl font-light uppercase tracking-[0.2em] text-slate-400">{label}</div>
            <div className="text-sm font-bold text-slate-800 mt-1"># {doc.number}</div>
            {isInvoice && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Balance due</div>
                <div className="text-xl font-bold tabular-nums">{money(doc.balanceDue, cur)}</div>
              </div>
            )}
            {doc.type === 'credit_note' && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Credit remaining</div>
                <div className="text-xl font-bold tabular-nums">{money(doc.balanceDue, cur)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Bill to + meta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Bill to</div>
            <div className="text-sm font-bold text-slate-800">{client?.name || doc.clientName}</div>
            <div className="text-[11px] text-slate-500 leading-relaxed">
              {client?.contactName && <div>Attn: {client.contactName}</div>}
              {addr(client?.billingAddress).map((l) => (
                <div key={l}>{l}</div>
              ))}
              {doc.billingEmail && <div>{doc.billingEmail}</div>}
            </div>
          </div>
          <div className="sm:justify-self-end">
            <table className="text-[11px]">
              <tbody>
                <MetaRow k={`${label} date`} v={shortDate(doc.issueDate)} />
                {isInvoice && doc.paymentTerms && <MetaRow k="Terms" v={TERMS_LABEL[doc.paymentTerms]} />}
                {isInvoice && <MetaRow k="Due date" v={shortDate(doc.dueDate)} />}
                {doc.type === 'quote' && <MetaRow k="Valid until" v={shortDate(doc.expiryDate)} />}
                {doc.reference && <MetaRow k="Reference / PO" v={doc.reference} />}
                {doc.servicePeriod && <MetaRow k="Service period" v={`${shortDate(doc.servicePeriod.start)} – ${shortDate(doc.servicePeriod.end)}`} />}
              </tbody>
            </table>
          </div>
        </div>

        {doc.subject && (
          <div className="mt-6 text-xs">
            <span className="text-slate-400 font-semibold">Subject: </span>
            <span className="text-slate-700">{doc.subject}</span>
          </div>
        )}

        {/* Lines */}
        <table className="w-full mt-6 text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white" style={{ background: brand }}>
              <th className="text-left px-3 py-2 font-bold w-8">#</th>
              <th className="text-left px-3 py-2 font-bold">Item &amp; description</th>
              <th className="text-right px-3 py-2 font-bold w-20">Qty</th>
              <th className="text-right px-3 py-2 font-bold w-24">Rate</th>
              {hasDiscountCol && <th className="text-right px-3 py-2 font-bold w-16">Disc.</th>}
              <th className="text-right px-3 py-2 font-bold w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={l.id} className="border-b border-slate-100 align-top break-inside-avoid">
                <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-slate-800">{l.name}</div>
                  {l.description && <div className="text-[11px] text-slate-500 whitespace-pre-line mt-0.5">{l.description}</div>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {Number(l.quantity).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  {l.unit && <div className="text-[10px] text-slate-400">{l.unit}</div>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(l.unitPrice, cur)}</td>
                {hasDiscountCol && <td className="px-3 py-2.5 text-right tabular-nums">{l.discountPct ? `${l.discountPct}%` : '—'}</td>}
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{money(l.amount ?? l.quantity * l.unitPrice, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <table className="text-xs w-full sm:w-72">
            <tbody>
              <TotRow k="Sub total" v={money(doc.subtotal, cur)} />
              {doc.discountTotal > 0 && <TotRow k={`Discount${doc.discountPct ? ` (${doc.discountPct}%)` : ''}`} v={`− ${money(doc.discountTotal, cur)}`} />}
              {taxByRate.size > 0
                ? Array.from(taxByRate.values()).map((t) => <TotRow key={t.name} k={t.name} v={money(t.amount, cur)} />)
                : doc.taxTotal > 0 && <TotRow k="Tax" v={money(doc.taxTotal, cur)} />}
              <tr className="border-t border-slate-200">
                <td className="py-2 font-bold text-slate-800">Total</td>
                <td className="py-2 text-right font-bold tabular-nums text-slate-900">{money(doc.total, cur)}</td>
              </tr>
              {isInvoice && doc.amountPaid > 0 && <TotRow k="Payments made" v={`(−) ${money(doc.amountPaid, cur)}`} accent="text-emerald-600" />}
              {isInvoice && doc.creditsApplied > 0 && <TotRow k="Credits applied" v={`(−) ${money(doc.creditsApplied, cur)}`} accent="text-emerald-600" />}
              {isInvoice && (
                <tr className="bg-slate-50">
                  <td className="py-2 px-2 font-bold">Balance due</td>
                  <td className="py-2 px-2 text-right font-bold tabular-nums">{money(doc.balanceDue, cur)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(doc.notes || doc.terms) && (
          <div className="mt-8 grid gap-4 text-[11px] text-slate-600">
            {doc.notes && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Notes</div>
                <div className="whitespace-pre-line">{doc.notes}</div>
              </div>
            )}
            {doc.terms && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Terms &amp; conditions</div>
                <div className="whitespace-pre-line">{doc.terms}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const MetaRow: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <tr>
    <td className="pr-4 py-0.5 text-slate-400 font-semibold whitespace-nowrap">{k}</td>
    <td className="py-0.5 text-slate-700 text-right">{v}</td>
  </tr>
);

const TotRow: React.FC<{ k: string; v: React.ReactNode; accent?: string }> = ({ k, v, accent = '' }) => (
  <tr>
    <td className="py-1 text-slate-500">{k}</td>
    <td className={`py-1 text-right tabular-nums ${accent}`}>{v}</td>
  </tr>
);

/**
 * PrintPortal — renders children into <body> outside #root so window.print()
 * only outputs the document (see `.print-portal` rules in styles/index.css).
 */
export const PrintPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [el] = React.useState(() => {
    const d = document.createElement('div');
    d.className = 'print-portal';
    return d;
  });
  React.useEffect(() => {
    document.body.appendChild(el);
    document.body.classList.add('has-print-portal');
    return () => {
      document.body.removeChild(el);
      document.body.classList.remove('has-print-portal');
    };
  }, [el]);
  return createPortal(children, el);
};
