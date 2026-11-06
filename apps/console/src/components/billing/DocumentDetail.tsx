import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { BillingDocument, BillingPayment, PublicInvoiceView } from '@openmsp/api-types';
import {
  Send, Pencil, Printer, Copy, MoreHorizontal, CheckCircle2, XCircle, ArrowRightLeft, Wallet, Link2,
  Trash2, Ban, ShieldCheck, AlertTriangle, History, CreditCard, Receipt, Mail, ExternalLink
} from 'lucide-react';
import { billingApi, type SendDocumentResponse } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { PageHeader, StatusBadge, btn, input, Field, Modal, ErrorBanner, Loading, Card, Toast } from './ui';
import { DOC_LABEL, METHOD_LABEL, dateTime, money, shortDate } from './format';
import { InvoicePaper, PrintPortal } from './InvoicePaper';
import { RecordPaymentModal } from './RecordPaymentModal';

let pendingSendId: string | null = null;
/** Ask the next DocumentDetail for `id` to open the Send dialog immediately (used by "Save & send"). */
export const requestSendOnOpen = (id: string) => {
  pendingSendId = id;
};

const publicUrlFor = (token: string, base?: string) =>
  `${(base || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '')}/invoice/${token}`;

/** DocumentDetail — Zoho-style document page: paper preview + contextual actions + payments/history. */
export const DocumentDetail: React.FC<{ id: string }> = ({ id }) => {
  const { closeDocument, editDocument, openDocument, openClient, openContract, billingClients, taxRates, settings, bump, goBilling } = useBilling();
  const cur = settings?.currency || 'USD';
  const [doc, setDoc] = useState<BillingDocument | null>(null);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ m: string; t?: 'ok' | 'err' } | null>(null);
  const [modal, setModal] = useState<null | 'send' | 'payment' | 'credit' | 'void' | 'delete'>(null);
  const [menu, setMenu] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await billingApi.document(id);
      setDoc(d);
      setError(null);
      if (d.type === 'invoice') {
        const p = await billingApi.payments(d.clientId).catch(() => []);
        setPayments(p.filter((x) => x.allocations.some((a) => a.invoiceId === d.id)));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (doc && pendingSendId === doc.id) {
      pendingSendId = null;
      if (doc.status === 'pending_review') setToast({ m: 'This invoice must be approved in Invoice Audit before sending.', t: 'err' });
      else setModal('send');
    }
  }, [doc]);

  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 150);
    return () => clearTimeout(t);
  }, [printing]);

  const client = useMemo(() => billingClients.find((c) => c.id === doc?.clientId) || null, [billingClients, doc?.clientId]);
  const company: PublicInvoiceView['company'] = {
    companyName: settings?.companyName || 'Your Company',
    companyEmail: settings?.companyEmail,
    companyPhone: settings?.companyPhone,
    companyWebsite: settings?.companyWebsite,
    companyAddress: settings?.companyAddress,
    logoUrl: settings?.logoUrl,
    brandColor: settings?.brandColor,
    currency: cur
  };

  const run = async (key: string, fn: () => Promise<BillingDocument | void>, okMsg?: string) => {
    setBusy(key);
    try {
      const r = await fn();
      if (r && r.id !== id) {
        bump();
        openDocument(r.id, r.type);
        return;
      }
      if (r) setDoc(r);
      bump();
      if (okMsg) setToast({ m: okMsg });
      await load();
    } catch (e) {
      setToast({ m: (e as Error).message, t: 'err' });
    } finally {
      setBusy(null);
      setMenu(false);
    }
  };

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ m: msg });
    } catch {
      setToast({ m: text });
    }
  };

  if (error && !doc) {
    return (
      <div className="p-6">
        <ErrorBanner error={error} onRetry={load} />
        <button className={`${btn.secondary} mt-3`} onClick={closeDocument}>
          ← Back
        </button>
      </div>
    );
  }
  if (!doc) return <Loading />;

  const label = DOC_LABEL[doc.type];
  const isInv = doc.type === 'invoice';
  const openForPayment = isInv && ['sent', 'partially_paid', 'overdue'].includes(doc.status) && doc.balanceDue > 0;
  const editable = ['draft', 'pending_review', 'open'].includes(doc.status) || (doc.status === 'sent' && doc.amountPaid === 0 && doc.creditsApplied === 0) || doc.status === 'confirmed';
  const shareable = !['draft', 'pending_review'].includes(doc.status) && (doc.type === 'invoice' || doc.type === 'quote');
  const publicUrl = publicUrlFor(doc.publicToken, settings?.publicPortalBaseUrl);

  return (
    <>
      <PageHeader
        Icon={Receipt}
        tint="#22c55e"
        title={`${label.one} ${doc.number}`}
        subtitle={`${doc.clientName} · ${money(doc.total, cur)}${isInv ? ` · ${money(doc.balanceDue, cur)} due` : ''}`}
        onBack={closeDocument}
      >
        <StatusBadge status={doc.status} className="mr-1" />
        {doc.status === 'pending_review' && (
          <>
            <button className={btn.success} disabled={!!busy} onClick={() => run('approve', () => billingApi.approve(doc.id, true), 'Approved and sent')}>
              <ShieldCheck className="w-3.5 h-3.5" /> Approve &amp; send
            </button>
            <button className={btn.secondary} disabled={!!busy} onClick={() => run('approve', () => billingApi.approve(doc.id, false), 'Approved')}>
              Approve only
            </button>
          </>
        )}
        {editable && (
          <button className={btn.secondary} onClick={() => editDocument(doc.id)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
        {(doc.type === 'invoice' || doc.type === 'quote') && !['void', 'pending_review', 'converted'].includes(doc.status) && (
          <button className={doc.status === 'draft' ? btn.primary : btn.secondary} onClick={() => setModal('send')}>
            <Send className="w-3.5 h-3.5" /> {doc.sentAt ? 'Resend' : 'Send'}
          </button>
        )}
        {openForPayment && (
          <button className={btn.success} onClick={() => setModal('payment')}>
            <Wallet className="w-3.5 h-3.5" /> Record payment
          </button>
        )}
        {doc.type === 'quote' && doc.status === 'sent' && (
          <>
            <button className={btn.secondary} disabled={!!busy} onClick={() => run('acc', () => billingApi.setStatus(doc.id, 'accepted'), 'Marked accepted')}>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Accepted
            </button>
            <button className={btn.secondary} disabled={!!busy} onClick={() => run('dec', () => billingApi.setStatus(doc.id, 'declined'), 'Marked declined')}>
              <XCircle className="w-3.5 h-3.5 text-rose-500" /> Declined
            </button>
          </>
        )}
        {doc.type === 'quote' && ['draft', 'sent', 'accepted'].includes(doc.status) && (
          <>
            <button className={btn.secondary} disabled={!!busy} onClick={() => run('so', () => billingApi.convert(doc.id, 'sales_order'))}>
              <ArrowRightLeft className="w-3.5 h-3.5" /> To sales order
            </button>
            <button className={btn.primary} disabled={!!busy} onClick={() => run('inv', () => billingApi.convert(doc.id, 'invoice'))}>
              <ArrowRightLeft className="w-3.5 h-3.5" /> Convert to invoice
            </button>
          </>
        )}
        {doc.type === 'sales_order' && doc.status === 'draft' && (
          <button className={btn.secondary} disabled={!!busy} onClick={() => run('conf', () => billingApi.setStatus(doc.id, 'confirmed'), 'Sales order confirmed')}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Confirm
          </button>
        )}
        {doc.type === 'sales_order' && ['draft', 'confirmed'].includes(doc.status) && (
          <button className={btn.primary} disabled={!!busy} onClick={() => run('inv', () => billingApi.convert(doc.id, 'invoice'))}>
            <ArrowRightLeft className="w-3.5 h-3.5" /> Convert to invoice
          </button>
        )}
        <button className={btn.secondary} onClick={() => setPrinting(true)} title="Print or save as PDF">
          <Printer className="w-3.5 h-3.5" /> PDF
        </button>
        <div className="relative">
          <button className={btn.secondary} onClick={() => setMenu((m) => !m)} aria-label="More actions">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menu && (
            <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-40 py-1 text-xs" onMouseLeave={() => setMenu(false)}>
              {shareable && <MenuItem Icon={Link2} label="Copy client link" onClick={() => copy(publicUrl, 'Client link copied')} />}
              {shareable && <MenuItem Icon={ExternalLink} label="Open client view" onClick={() => window.open(publicUrl, '_blank', 'noopener')} />}
              {openForPayment && settings?.stripeConfigured && (
                <MenuItem
                  Icon={CreditCard}
                  label="Copy Stripe pay link"
                  onClick={() =>
                    run('stripe', async () => {
                      const r = await billingApi.stripeLink(doc.id);
                      await copy(r.url, 'Stripe payment link copied');
                    })
                  }
                />
              )}
              {openForPayment && <MenuItem Icon={Wallet} label="Apply credits" onClick={() => setModal('credit')} />}
              {doc.status === 'draft' && isInv && <MenuItem Icon={CheckCircle2} label="Mark as sent (no email)" onClick={() => run('ms', () => billingApi.setStatus(doc.id, 'sent'), 'Marked as sent')} />}
              <MenuItem Icon={Copy} label="Duplicate" onClick={() => run('dup', () => billingApi.duplicate(doc.id))} />
              {doc.status === 'pending_review' && <MenuItem Icon={ShieldCheck} label="Open Invoice Audit" onClick={() => goBilling('invoice-audit')} />}
              {!['void', 'draft', 'pending_review', 'converted', 'invoiced'].includes(doc.status) && <MenuItem Icon={Ban} label="Void" danger onClick={() => setModal('void')} />}
              {['draft', 'pending_review'].includes(doc.status) && <MenuItem Icon={Trash2} label="Delete" danger onClick={() => setModal('delete')} />}
            </div>
          )}
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 pb-24 md:pb-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div className="min-w-0 space-y-3">
            {doc.status === 'pending_review' && (doc.auditFlags?.length || 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                    <AlertTriangle className="w-4 h-4" /> Invoice audit found {doc.auditFlags!.length} thing{doc.auditFlags!.length > 1 ? 's' : ''} to check
                  </div>
                  {doc.auditFlags!.some((f) => f.suggestedQuantity !== undefined) && (
                    <button className={btn.secondary} disabled={!!busy} onClick={() => run('fix', () => billingApi.applyAuditFixes(doc.id), 'Quantities updated to live counts')}>
                      Apply suggested counts
                    </button>
                  )}
                </div>
                <ul className="space-y-1">
                  {doc.auditFlags!.map((f, i) => (
                    <li key={i} className="text-[11px] text-amber-900 flex gap-1.5">
                      <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${f.severity === 'critical' ? 'bg-rose-500' : f.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                      {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <InvoicePaper doc={doc} company={company} client={client} taxRates={taxRates} />
          </div>

          <div className="space-y-3">
            <Card title="Summary">
              <dl className="text-xs space-y-1.5">
                <SRow k="Client">
                  <button className="text-violet-700 font-semibold hover:underline" onClick={() => openClient(doc.clientId)}>
                    {doc.clientName}
                  </button>
                </SRow>
                <SRow k="Total">{money(doc.total, cur)}</SRow>
                {isInv && <SRow k="Paid">{money(doc.amountPaid, cur)}</SRow>}
                {isInv && doc.creditsApplied > 0 && <SRow k="Credits">{money(doc.creditsApplied, cur)}</SRow>}
                {(isInv || doc.type === 'credit_note') && (
                  <SRow k={isInv ? 'Balance due' : 'Credit left'}>
                    <span className="font-bold">{money(doc.balanceDue, cur)}</span>
                  </SRow>
                )}
                {doc.sentAt && <SRow k="Sent">{dateTime(doc.sentAt)}</SRow>}
                {doc.lastViewedAt && <SRow k="Client viewed">{dateTime(doc.lastViewedAt)}</SRow>}
                {doc.contractId && (
                  <SRow k="Contract">
                    <button className="text-violet-700 font-semibold hover:underline" onClick={() => openContract(doc.contractId!)}>
                      View contract
                    </button>
                  </SRow>
                )}
                {doc.convertedFromId && (
                  <SRow k="Created from">
                    <button className="text-violet-700 font-semibold hover:underline" onClick={() => openDocument(doc.convertedFromId!)}>
                      Source document
                    </button>
                  </SRow>
                )}
                {doc.convertedToIds?.map((cid) => (
                  <SRow key={cid} k="Converted to">
                    <button className="text-violet-700 font-semibold hover:underline" onClick={() => openDocument(cid)}>
                      Open document
                    </button>
                  </SRow>
                ))}
                {doc.auditApprovedBy && (
                  <SRow k="Approved">
                    {doc.auditApprovedBy} · {shortDate(doc.auditApprovedAt)}
                  </SRow>
                )}
              </dl>
            </Card>

            {isInv && (
              <Card title="Payments" actions={openForPayment ? <button className={btn.ghost} onClick={() => setModal('payment')}>+ Record</button> : undefined}>
                {payments.length === 0 ? (
                  <div className="text-[11px] text-slate-500">No payments yet.</div>
                ) : (
                  <ul className="divide-y divide-slate-100 text-xs">
                    {payments.map((p) => {
                      const a = p.allocations.find((x) => x.invoiceId === doc.id)!;
                      return (
                        <li key={p.id} className={`py-1.5 flex justify-between gap-2 ${p.voided ? 'opacity-50 line-through' : ''}`}>
                          <div>
                            <div className="font-semibold">{p.number}</div>
                            <div className="text-[10px] text-slate-500">
                              {shortDate(p.date)} · {METHOD_LABEL[p.method]}
                              {p.reference ? ` · ${p.reference}` : ''}
                            </div>
                          </div>
                          <div className="tabular-nums font-semibold text-emerald-700">{money(a.amount, cur)}</div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}

            <Card title={<span className="flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> History</span>}>
              <ol className="relative border-l border-slate-200 ml-1.5 space-y-2.5">
                {[...doc.history].reverse().map((h, i) => (
                  <li key={i} className="ml-3">
                    <span className="absolute -left-[5px] mt-1 w-2 h-2 rounded-full bg-violet-300" />
                    <div className="text-[11px] text-slate-700">
                      <span className="font-semibold capitalize">{h.action.replace(/_/g, ' ')}</span>
                      {h.detail && <span className="text-slate-500"> — {h.detail}</span>}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {dateTime(h.at)} · {h.actor}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      </div>

      {printing && (
        <PrintPortal>
          <InvoicePaper doc={doc} company={company} client={client} taxRates={taxRates} />
        </PrintPortal>
      )}

      {modal === 'send' && (
        <SendModal
          doc={doc}
          defaultTo={doc.billingEmail || client?.billingEmail || client?.contactEmail || ''}
          companyName={company.companyName}
          emailConfigured={!!settings?.emailConfigured}
          onClose={() => setModal(null)}
          onSent={(r) => {
            setDoc(r.document);
            bump();
            if (r.sent) {
              setModal(null);
              setToast({ m: `${label.one} emailed` });
            }
          }}
        />
      )}
      {modal === 'payment' && <RecordPaymentModal clientId={doc.clientId} invoiceId={doc.id} onClose={() => setModal(null)} onSaved={() => { setToast({ m: 'Payment recorded' }); void load(); }} />}
      {modal === 'credit' && <ApplyCreditModal invoice={doc} currency={cur} onClose={() => setModal(null)} onDone={(d) => { setDoc(d); bump(); setModal(null); setToast({ m: 'Credit applied' }); void load(); }} />}
      {modal === 'void' && (
        <Modal
          title={`Void ${label.one.toLowerCase()} ${doc.number}?`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className={btn.secondary} onClick={() => setModal(null)}>Cancel</button>
              <button className={btn.danger} onClick={() => { setModal(null); void run('void', () => billingApi.setStatus(doc.id, 'void'), 'Voided'); }}>
                Void
              </button>
            </>
          }
        >
          <p className="text-xs text-slate-600">
            The document stays on record for audit purposes but no longer counts toward the client's balance. Any billed ticket time is released back to unbilled.
            {doc.amountPaid > 0 && ' This invoice has payments — void them first from Payments Received.'}
          </p>
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal
          title={`Delete ${doc.number}?`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className={btn.secondary} onClick={() => setModal(null)}>Cancel</button>
              <button
                className={btn.danger}
                onClick={async () => {
                  try {
                    await billingApi.deleteDocument(doc.id);
                    bump();
                    closeDocument();
                  } catch (e) {
                    setModal(null);
                    setToast({ m: (e as Error).message, t: 'err' });
                  }
                }}
              >
                Delete permanently
              </button>
            </>
          }
        >
          <p className="text-xs text-slate-600">Drafts can be deleted. This can't be undone.</p>
        </Modal>
      )}
      <Toast message={toast?.m || null} tone={toast?.t} onDone={() => setToast(null)} />
    </>
  );
};

const SRow: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-slate-500">{k}</dt>
    <dd className="text-right text-slate-800 tabular-nums">{children}</dd>
  </div>
);

const MenuItem: React.FC<{ Icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; danger?: boolean }> = ({ Icon, label, onClick, danger }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 ${danger ? 'text-rose-600' : 'text-slate-700'}`}>
    <Icon className="w-3.5 h-3.5" /> {label}
  </button>
);

const SendModal: React.FC<{
  doc: BillingDocument;
  defaultTo: string;
  companyName: string;
  emailConfigured: boolean;
  onClose: () => void;
  onSent: (r: SendDocumentResponse) => void;
}> = ({ doc, defaultTo, companyName, emailConfigured, onClose, onSent }) => {
  const label = DOC_LABEL[doc.type].one;
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(`${label} ${doc.number} from ${companyName}`);
  const [message, setMessage] = useState(
    doc.type === 'invoice'
      ? `Hi,\n\nInvoice ${doc.number} is ready. You can view, download, and pay it online using the button below.\n\nThank you for your business.`
      : `Hi,\n\nPlease review quote ${doc.number}. You can accept it online using the button below.\n\nThanks!`
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<SendDocumentResponse | null>(null);

  const send = async () => {
    setError(null);
    if (!to.trim()) return setError('Enter a recipient email.');
    setBusy(true);
    try {
      const r = await billingApi.send(doc.id, { to: to.trim(), cc: cc.trim() || undefined, subject, message });
      onSent(r);
      if (!r.sent) setFallback(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (fallback) {
    return (
      <Modal title={`${label} ready to send`} onClose={onClose} footer={<button className={btn.secondary} onClick={onClose}>Done</button>}>
        <div className="space-y-3 text-xs text-slate-600">
          <p>
            {fallback.error ? `Email delivery failed (${fallback.error}).` : 'No email provider is configured yet, so ApexMSP couldn\'t send it directly.'} The {label.toLowerCase()} is marked as sent — finish in your mail app or share the link:
          </p>
          <div className="flex gap-2">
            {fallback.mailto && (
              <a className={btn.primary} href={fallback.mailto}>
                <Mail className="w-3.5 h-3.5" /> Open in mail app
              </a>
            )}
            <button className={btn.secondary} onClick={() => navigator.clipboard.writeText(fallback.publicUrl)}>
              <Link2 className="w-3.5 h-3.5" /> Copy client link
            </button>
          </div>
          <input className={input} readOnly value={fallback.publicUrl} onFocus={(e) => e.currentTarget.select()} />
          <p className="text-[11px] text-slate-400">Set up email in Billing Settings to send directly from ApexMSP.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Email ${label.toLowerCase()} ${doc.number}`}
      onClose={onClose}
      width="max-w-xl"
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>Cancel</button>
          <button className={btn.primary} onClick={send} disabled={busy}>
            <Send className="w-3.5 h-3.5" /> {busy ? 'Sending…' : emailConfigured ? 'Send' : 'Mark sent & get link'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorBanner error={error} />
        {!emailConfigured && (
          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Email isn't configured yet — you'll get a ready-to-send draft for your mail app plus the client link.
          </div>
        )}
        <Field label="To">
          <input className={input} type="email" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="CC" hint="Comma-separated">
          <input className={input} value={cc} onChange={(e) => setCc(e.target.value)} />
        </Field>
        <Field label="Subject">
          <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message" hint="The email includes a 'View & Pay' button linking to the client page with PDF download.">
          <textarea className={input} rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const ApplyCreditModal: React.FC<{ invoice: BillingDocument; currency: string; onClose: () => void; onDone: (d: BillingDocument) => void }> = ({ invoice, currency, onClose, onDone }) => {
  const [credits, setCredits] = useState<BillingDocument[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    billingApi
      .documents({ type: 'credit_note', clientId: invoice.clientId })
      .then((d) => setCredits(d.filter((c) => c.status === 'open' && c.balanceDue > 0)))
      .catch((e) => setError((e as Error).message));
  }, [invoice.clientId]);
  const total = Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const apply = async () => {
    setError(null);
    if (total - invoice.balanceDue > 0.005) return setError('Total credit exceeds the invoice balance.');
    setBusy(true);
    try {
      let last: BillingDocument = invoice;
      for (const [cid, v] of Object.entries(amounts)) {
        const a = Math.round((parseFloat(v) || 0) * 100) / 100;
        if (a > 0) last = await billingApi.applyCredit(invoice.id, cid, a);
      }
      onDone(last);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Apply credits to ${invoice.number}`}
      onClose={onClose}
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>Cancel</button>
          <button className={btn.primary} onClick={apply} disabled={busy || total <= 0}>
            Apply {money(total, currency)}
          </button>
        </>
      }
    >
      <ErrorBanner error={error} />
      {!credits ? (
        !error && <Loading />
      ) : credits.length === 0 ? (
        <div className="text-xs text-slate-500 py-6 text-center">This client has no open credit notes. (Unapplied payments can be allocated from Payments Received.)</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
            <tr>
              <th className="text-left py-1.5">Credit note</th>
              <th className="text-right py-1.5">Available</th>
              <th className="text-right py-1.5 w-32">Apply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {credits.map((c) => (
              <tr key={c.id}>
                <td className="py-1.5 font-semibold">{c.number}</td>
                <td className="py-1.5 text-right tabular-nums">{money(c.balanceDue, currency)}</td>
                <td className="py-1 pl-2">
                  <input className={`${input} text-right`} type="number" min="0" max={c.balanceDue} step="0.01" value={amounts[c.id] || ''} onChange={(e) => setAmounts({ ...amounts, [c.id]: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="text-[11px] text-slate-500 mt-2">Invoice balance: {money(invoice.balanceDue, currency)}</div>
    </Modal>
  );
};

export default DocumentDetail;
