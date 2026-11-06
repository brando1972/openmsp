import React, { useCallback, useEffect, useState } from 'react';
import type { PublicInvoiceView } from '@openmsp/api-types';
import { Printer, CreditCard, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { publicInvoiceApi } from '../../services/billingApi';
import { InvoicePaper } from './InvoicePaper';
import { money } from './format';

/**
 * PublicInvoicePage — client-facing page at /invoice/:token (no login).
 * Clients can view and download the invoice/quote as PDF, pay online via
 * Stripe, or accept/decline a quote.
 */
export const PublicInvoicePage: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<PublicInvoiceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const justPaid = params.get('paid') === '1';
  const canceled = params.get('canceled') === '1';

  const load = useCallback(async () => {
    try {
      setData(await publicInvoiceApi.get(token));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // After Stripe redirects back, the webhook may land a moment later — poll briefly.
  useEffect(() => {
    if (!justPaid || !data || data.document.balanceDue <= 0) return;
    const t = setTimeout(load, 2500);
    return () => clearTimeout(t);
  }, [justPaid, data, load]);

  useEffect(() => {
    if (data) document.title = `${data.document.type === 'quote' ? 'Quote' : 'Invoice'} ${data.document.number} · ${data.company.companyName}`;
  }, [data]);

  const pay = async () => {
    setBusy(true);
    try {
      const { url } = await publicInvoiceApi.checkout(token);
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      setData(await publicInvoiceApi.respondToQuote(token, accept));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 text-sm text-slate-600">
        {error ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-sm">
            <div className="font-bold text-slate-800 mb-1">This link isn't available</div>
            <div className="text-xs text-slate-500">{error}. Contact the sender for a new link.</div>
          </div>
        ) : (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </span>
        )}
      </div>
    );
  }

  const d = data.document;
  const cur = data.company.currency || 'USD';
  const brand = data.company.brandColor || '#4f46e5';
  const isInv = d.type === 'invoice';
  const paid = isInv && d.balanceDue <= 0 && d.status === 'paid';
  const canPay = isInv && data.payOnlineAvailable && d.balanceDue > 0 && !['void', 'draft'].includes(d.status);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 select-text print:bg-white">
      <div className="max-w-[860px] mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-4">
        <div className="print:hidden bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px]">
            <div className="text-[11px] text-slate-500">{data.company.companyName}</div>
            <div className="text-sm font-bold">
              {isInv ? 'Invoice' : d.type === 'quote' ? 'Quote' : 'Document'} {d.number}
            </div>
            {isInv && (
              <div className="text-xs mt-0.5">
                {paid ? (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Paid in full — thank you!
                  </span>
                ) : (
                  <>
                    Amount due <b className="tabular-nums">{money(d.balanceDue, cur)}</b>
                    {d.status === 'overdue' && <span className="ml-2 text-rose-600 font-semibold">Overdue</span>}
                  </>
                )}
              </div>
            )}
            {d.type === 'quote' && d.status === 'accepted' && <div className="text-xs text-emerald-700 font-semibold mt-0.5">You accepted this quote. We'll be in touch.</div>}
            {d.type === 'quote' && d.status === 'declined' && <div className="text-xs text-slate-500 mt-0.5">You declined this quote.</div>}
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold"
          >
            <Printer className="w-3.5 h-3.5" /> Download PDF
          </button>
          {d.type === 'quote' && d.status === 'sent' && (
            <>
              <button disabled={busy} onClick={() => respond(false)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold">
                <XCircle className="w-3.5 h-3.5" /> Decline
              </button>
              <button disabled={busy} onClick={() => respond(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-xs font-bold shadow-sm" style={{ background: brand }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Accept quote
              </button>
            </>
          )}
          {canPay && (
            <button disabled={busy} onClick={pay} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-xs font-bold shadow-sm disabled:opacity-60" style={{ background: brand }}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />} Pay {money(d.balanceDue, cur)}
            </button>
          )}
        </div>

        {justPaid && !paid && (
          <div className="print:hidden bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg px-4 py-2.5">
            Payment received — it can take a minute to show here (bank payments take a few business days to clear).
          </div>
        )}
        {canceled && <div className="print:hidden bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5">Payment was canceled. You can try again any time.</div>}
        {error && <div className="print:hidden bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-4 py-2.5">{error}</div>}

        <InvoicePaper doc={d} company={data.company} client={data.client} taxRates={data.taxRates} />

        <div className="print:hidden text-center text-[10px] text-slate-400">
          Questions? {data.company.companyEmail ? <a className="underline" href={`mailto:${data.company.companyEmail}`}>{data.company.companyEmail}</a> : data.company.companyName}
        </div>
      </div>
    </div>
  );
};

export default PublicInvoicePage;
