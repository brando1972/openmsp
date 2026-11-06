import type {
  BillingDocStatus,
  BillingDocType,
  BillingLineItem,
  PaymentMethod,
  PaymentTerms,
  TaxRate,
  BillingFrequency,
  ContractStatus
} from '@openmsp/api-types';

export const money = (n: number | undefined | null, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n) || 0);

export const shortDate = (d?: string) => {
  if (!d) return '—';
  const dt = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const dateTime = (d?: string) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const TERMS_LABEL: Record<PaymentTerms, string> = {
  due_on_receipt: 'Due on receipt',
  net_7: 'Net 7',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60'
};

export const TERMS_DAYS: Record<PaymentTerms, number> = {
  due_on_receipt: 0, net_7: 7, net_15: 15, net_30: 30, net_45: 45, net_60: 60
};

export const DOC_LABEL: Record<BillingDocType, { one: string; many: string; sub: string }> = {
  quote: { one: 'Quote', many: 'Quotes', sub: 'quotes' },
  sales_order: { one: 'Sales Order', many: 'Sales Orders', sub: 'sales-orders' },
  invoice: { one: 'Invoice', many: 'Invoices', sub: 'invoices' },
  credit_note: { one: 'Credit Note', many: 'Credit Notes', sub: 'credit-notes' }
};

export const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
  sent: 'bg-sky-50 text-sky-700 border-sky-200',
  partially_paid: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  void: 'bg-slate-100 text-slate-400 border-slate-200 line-through',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  declined: 'bg-rose-50 text-rose-700 border-rose-200',
  expired: 'bg-slate-100 text-slate-500 border-slate-200',
  converted: 'bg-violet-50 text-violet-700 border-violet-200',
  confirmed: 'bg-sky-50 text-sky-700 border-sky-200',
  invoiced: 'bg-violet-50 text-violet-700 border-violet-200',
  open: 'bg-sky-50 text-sky-700 border-sky-200',
  applied: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  // contracts / clients
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  prospect: 'bg-violet-50 text-violet-700 border-violet-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200'
};

export const statusLabel = (s: BillingDocStatus | ContractStatus | string) =>
  s === 'pending_review' ? 'Needs review' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  stripe_card: 'Card (Stripe)',
  stripe_ach: 'ACH (Stripe)',
  check: 'Check',
  cash: 'Cash',
  ach: 'ACH / Bank transfer',
  wire: 'Wire',
  credit_card_manual: 'Card (manual)',
  other: 'Other'
};

export const FREQ_LABEL: Record<BillingFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiannually: 'Every 6 months',
  annually: 'Annually'
};

export const FREQ_MONTHS: Record<BillingFrequency, number> = { monthly: 1, quarterly: 3, semiannually: 6, annually: 12 };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Client-side mirror of the server's computeDocument() so editors can show
 * live totals. The server is always the source of truth once saved.
 */
export function computeTotals(
  lines: BillingLineItem[],
  opts: { taxRates: TaxRate[]; defaultTaxRateId?: string; taxExempt?: boolean; discountPct?: number }
) {
  const fallback = opts.taxRates.find((t) => t.id === opts.defaultTaxRateId) || opts.taxRates.find((t) => t.isDefault && t.active);
  let subtotal = 0;
  let tax = 0;
  const lineAmounts = lines.map((l) => {
    const amount = round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (1 - (Number(l.discountPct) || 0) / 100));
    const rate = opts.taxExempt || !l.taxable ? undefined : opts.taxRates.find((t) => t.id === l.taxRateId) || fallback;
    subtotal += amount;
    const lt = rate ? amount * (rate.ratePct / 100) : 0;
    tax += lt;
    return { amount, tax: lt, rate };
  });
  const discountTotal = round2(subtotal * ((Number(opts.discountPct) || 0) / 100));
  const factor = subtotal > 0 ? (subtotal - discountTotal) / subtotal : 1;
  const taxTotal = round2(tax * factor);
  return {
    lineAmounts,
    subtotal: round2(subtotal),
    discountTotal,
    taxTotal,
    total: round2(subtotal - discountTotal + taxTotal)
  };
}

export const newId = (p = 'ln') => `${p}-${Math.random().toString(36).slice(2, 10)}`;
