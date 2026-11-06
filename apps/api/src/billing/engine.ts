/**
 * Billing engine — pure-ish business logic for Client Management & Billing.
 * Totals/tax computation, document numbering, contract (recurring) invoice
 * generation with live device/user counts, invoice audit flags, payments,
 * credit notes and the hourly billing scheduler.
 */
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import type {
  AuditFlag,
  BillingDocStatus,
  BillingDocType,
  BillingDocument,
  BillingFrequency,
  BillingLineItem,
  BillingPayment,
  BillingSettings,
  ClientFinancialSummary,
  ClientTenant,
  Contract,
  ContractDeviceFilter,
  ContractLine,
  CreditApplication,
  LineSource,
  PaymentTerms,
  PSATicket,
  TaxRate,
  TimeEntry,
  UnbilledTimeEntry
} from '@openmsp/api-types';

// ---------------------------------------------------------------------------
// Errors / small helpers
// ---------------------------------------------------------------------------
export class BillingError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
export const PAYMENT_TERMS: PaymentTerms[] = ['due_on_receipt', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60'];
export const DOC_TYPES: BillingDocType[] = ['quote', 'sales_order', 'invoice', 'credit_note'];
export const STATUSES_BY_TYPE: Record<BillingDocType, BillingDocStatus[]> = {
  quote: ['draft', 'sent', 'accepted', 'declined', 'expired', 'converted'],
  sales_order: ['draft', 'confirmed', 'invoiced', 'void'],
  invoice: ['draft', 'pending_review', 'sent', 'partially_paid', 'paid', 'overdue', 'void'],
  credit_note: ['open', 'applied', 'void']
};
/** Invoice statuses that carry a collectible balance. */
export const OPEN_INVOICE_STATUSES: BillingDocStatus[] = ['sent', 'partially_paid', 'overdue'];

export const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const nowIso = (): string => new Date().toISOString();
export const today = (): string => new Date().toISOString().slice(0, 10);

const isDateStr = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
export const toDateStr = (s: unknown, fallback = today()): string => (isDateStr(s) ? s.slice(0, 10) : fallback);

function parseDate(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1));
}
const fmt = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  const dt = parseDate(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmt(dt);
}

/** Add months; when `day` is given the result lands on that day of month (clamped to month length). */
export function addMonths(d: string, n: number, day?: number): string {
  const dt = parseDate(d);
  const targetDay = day ?? dt.getUTCDate();
  const first = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(targetDay, lastDay));
  return fmt(first);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function termsDays(t?: PaymentTerms): number {
  switch (t) {
    case 'due_on_receipt': return 0;
    case 'net_7': return 7;
    case 'net_15': return 15;
    case 'net_45': return 45;
    case 'net_60': return 60;
    case 'net_30':
    default: return 30;
  }
}

export const frequencyMonths = (f: BillingFrequency): number =>
  f === 'quarterly' ? 3 : f === 'semiannually' ? 6 : f === 'annually' ? 12 : 1;

export const newToken = (): string => crypto.randomBytes(24).toString('base64url');
export const newId = (prefix: string): string => `${prefix}-${uuidv4().substring(0, 8)}`;

export function settings(): BillingSettings {
  return store.billingSettings;
}

type NumberKind = keyof BillingSettings['nextNumbers'];
const KIND_BY_TYPE: Record<BillingDocType, NumberKind> = {
  quote: 'quote',
  sales_order: 'salesOrder',
  invoice: 'invoice',
  credit_note: 'creditNote'
};

/** Allocate the next document number for a kind, e.g. INV-001001. */
export function nextNumber(kind: NumberKind): string {
  const s = settings();
  const n = Math.max(1, Math.floor(Number(s.nextNumbers[kind]) || 1));
  s.nextNumbers[kind] = n + 1;
  return `${s.prefixes[kind] ?? ''}${String(n).padStart(6, '0')}`;
}
export const nextDocNumber = (type: BillingDocType): string => nextNumber(KIND_BY_TYPE[type]);

export function addHistory(doc: BillingDocument, actor: string, action: string, detail?: string): void {
  if (!Array.isArray(doc.history)) doc.history = [];
  doc.history.push({ at: nowIso(), actor, action, ...(detail ? { detail } : {}) });
  doc.updatedAt = nowIso();
}

export function docLabel(type: BillingDocType): string {
  return type === 'quote' ? 'Quote' : type === 'sales_order' ? 'Sales Order' : type === 'credit_note' ? 'Credit Note' : 'Invoice';
}

// ---------------------------------------------------------------------------
// Tax + totals
// ---------------------------------------------------------------------------
export function defaultTaxRate(): TaxRate | undefined {
  const rates = Array.from(store.taxRates.values()).filter((t) => t.active !== false);
  return rates.find((t) => t.isDefault) || undefined;
}

export function resolveTaxRate(line: BillingLineItem, client?: ClientTenant): TaxRate | undefined {
  const byId = (id?: string) => {
    if (!id) return undefined;
    const t = store.taxRates.get(id);
    return t && t.active !== false ? t : undefined;
  };
  return byId(line.taxRateId) || byId(client?.taxRateId) || defaultTaxRate();
}

/** Recompute line amounts, tax, totals, balance and auto status transitions. Mutates and returns `doc`. */
export function computeDocument(doc: BillingDocument): BillingDocument {
  const client = store.clients.get(doc.clientId);
  const exempt = !!client?.taxExempt;
  const docDisc = Math.min(100, Math.max(0, Number(doc.discountPct) || 0));
  const factor = 1 - docDisc / 100;

  let subtotal = 0;
  let taxTotal = 0;
  for (const line of doc.lines || []) {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const lineDisc = Math.min(100, Math.max(0, Number(line.discountPct) || 0));
    line.amount = round2(qty * price * (1 - lineDisc / 100));
    subtotal += line.amount;
    let tax = 0;
    if (line.taxable && !exempt) {
      const rate = resolveTaxRate(line, client);
      if (rate) tax = round2(line.amount * factor * (Number(rate.ratePct) || 0) / 100);
    }
    line.taxAmount = tax;
    taxTotal += tax;
  }
  doc.subtotal = round2(subtotal);
  doc.discountTotal = round2(doc.subtotal * docDisc / 100);
  doc.taxTotal = round2(taxTotal);
  doc.total = round2(doc.subtotal - doc.discountTotal + doc.taxTotal);
  doc.amountPaid = round2(Number(doc.amountPaid) || 0);
  doc.creditsApplied = round2(Number(doc.creditsApplied) || 0);
  doc.balanceDue = Math.max(0, round2(doc.total - doc.amountPaid - doc.creditsApplied));

  if (doc.type === 'invoice') {
    const auto: BillingDocStatus[] = ['sent', 'partially_paid', 'paid', 'overdue'];
    if (auto.includes(doc.status)) {
      let next: BillingDocStatus;
      if (doc.total > 0 && doc.balanceDue <= 0) next = 'paid';
      else if (doc.amountPaid + doc.creditsApplied > 0) next = 'partially_paid';
      else next = 'sent';
      if (next !== 'paid' && doc.balanceDue > 0 && doc.dueDate && doc.dueDate < today()) next = 'overdue';
      doc.status = next;
    }
  } else if (doc.type === 'credit_note') {
    // For credit notes `creditsApplied` tracks credit consumed; balanceDue = remaining credit.
    if (doc.status !== 'void') doc.status = doc.total > 0 && doc.balanceDue <= 0 ? 'applied' : 'open';
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------
export function findTimeEntry(id: string): { ticket: PSATicket; entry: TimeEntry } | undefined {
  for (const ticket of store.tickets.values()) {
    const entry = (ticket.timeEntries || []).find((e) => e.id === id);
    if (entry) return { ticket, entry };
  }
  return undefined;
}

export function unbilledTimeFor(clientId: string): UnbilledTimeEntry[] {
  const out: UnbilledTimeEntry[] = [];
  for (const t of store.tickets.values()) {
    if (t.clientId !== clientId) continue;
    for (const e of t.timeEntries || []) {
      if (!e.billable || e.invoiceId) continue;
      out.push({
        ticketId: t.id,
        ticketNumber: t.ticketNumber,
        ticketTitle: t.title,
        entry: e,
        amount: round2(((Number(e.minutes) || 0) / 60) * (Number(e.hourlyRate) || 0))
      });
    }
  }
  return out;
}

/** Mark every time entry referenced by the doc's lines as billed on it. */
export function markTimeEntries(doc: BillingDocument): void {
  for (const line of doc.lines || []) {
    for (const id of line.sourceRef?.timeEntryIds || []) {
      const found = findTimeEntry(id);
      if (found && (!found.entry.invoiceId || found.entry.invoiceId === doc.id)) found.entry.invoiceId = doc.id;
    }
  }
}

/** Clear invoiceId on every time entry billed on this doc. */
export function releaseTimeEntries(doc: BillingDocument): void {
  for (const t of store.tickets.values()) {
    for (const e of t.timeEntries || []) if (e.invoiceId === doc.id) delete e.invoiceId;
  }
}

// ---------------------------------------------------------------------------
// Document construction
// ---------------------------------------------------------------------------
export function normalizeLine(raw: Partial<BillingLineItem>, idx = 0): BillingLineItem {
  if (!raw || typeof raw !== 'object') throw new BillingError(400, `Line ${idx + 1} is invalid`);
  const item = raw.itemId ? store.catalogItems.get(raw.itemId) : undefined;
  const name = String(raw.name ?? item?.name ?? '').trim();
  if (!name) throw new BillingError(400, `Line ${idx + 1}: name is required`);
  const quantity = raw.quantity === undefined ? 1 : Number(raw.quantity);
  const unitPrice = raw.unitPrice === undefined ? Number(item?.unitPrice ?? 0) : Number(raw.unitPrice);
  if (!Number.isFinite(quantity)) throw new BillingError(400, `Line ${idx + 1}: quantity must be a number`);
  if (!Number.isFinite(unitPrice)) throw new BillingError(400, `Line ${idx + 1}: unitPrice must be a number`);
  const discountPct = raw.discountPct === undefined || raw.discountPct === null ? undefined : Number(raw.discountPct);
  if (discountPct !== undefined && (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100)) {
    throw new BillingError(400, `Line ${idx + 1}: discountPct must be 0-100`);
  }
  const sources: LineSource[] = ['manual', 'catalog', 'contract', 'device_count', 'user_count', 'time_entry'];
  const source: LineSource = raw.source && sources.includes(raw.source) ? raw.source : raw.itemId ? 'catalog' : 'manual';
  return {
    id: raw.id || newId('ln'),
    ...(raw.itemId ? { itemId: raw.itemId } : {}),
    name,
    ...(raw.description ?? item?.description ? { description: raw.description ?? item?.description } : {}),
    quantity,
    ...(raw.unit ?? item?.unit ? { unit: raw.unit ?? item?.unit } : {}),
    unitPrice,
    ...(discountPct !== undefined ? { discountPct } : {}),
    taxable: raw.taxable === undefined ? (item ? !!item.taxable : false) : !!raw.taxable,
    ...(raw.taxRateId ? { taxRateId: raw.taxRateId } : {}),
    source,
    ...(raw.sourceRef ? { sourceRef: raw.sourceRef } : {})
  };
}

export interface BuildDocInput extends Partial<BillingDocument> {
  type: BillingDocType;
  clientId: string;
}

/** Create, number, compute and store a new billing document. */
export function createDocument(input: BuildDocInput, actor: string, orgId = DEFAULT_ORG_ID, historyDetail?: string): BillingDocument {
  if (!DOC_TYPES.includes(input.type)) throw new BillingError(400, `type must be one of ${DOC_TYPES.join(', ')}`);
  const client = store.clients.get(input.clientId);
  if (!client) throw new BillingError(400, 'clientId does not reference an existing client');
  if (input.lines !== undefined && !Array.isArray(input.lines)) throw new BillingError(400, 'lines must be an array');
  if (input.paymentTerms && !PAYMENT_TERMS.includes(input.paymentTerms)) throw new BillingError(400, 'invalid paymentTerms');
  const s = settings();
  const lines = (input.lines || []).map((l, i) => normalizeLine(l, i));
  const issueDate = toDateStr(input.issueDate);
  const paymentTerms: PaymentTerms = input.paymentTerms || client.paymentTerms || s.defaultPaymentTerms || 'net_30';

  let status: BillingDocStatus;
  if (input.type === 'credit_note') status = 'open';
  else if (input.type === 'invoice' && (input.status === 'pending_review' || input.status === 'sent')) status = input.status;
  else status = 'draft';

  const now = nowIso();
  const doc: BillingDocument = {
    id: newId(input.type === 'invoice' ? 'inv' : input.type === 'quote' ? 'qt' : input.type === 'sales_order' ? 'so' : 'cn'),
    orgId,
    type: input.type,
    number: nextDocNumber(input.type),
    clientId: client.id,
    clientName: client.name,
    billingEmail: input.billingEmail || client.billingEmail || client.contactEmail || undefined,
    status,
    issueDate,
    ...(input.type === 'invoice'
      ? { dueDate: toDateStr(input.dueDate, addDays(issueDate, termsDays(paymentTerms))), paymentTerms }
      : {}),
    ...(input.type === 'quote'
      ? { expiryDate: toDateStr(input.expiryDate, addDays(issueDate, Number(s.quoteValidityDays) || 30)) }
      : {}),
    ...(input.type === 'sales_order' ? { paymentTerms } : {}),
    reference: input.reference,
    subject: input.subject,
    lines,
    discountPct: input.discountPct !== undefined ? Math.min(100, Math.max(0, Number(input.discountPct) || 0)) : undefined,
    subtotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    total: 0,
    amountPaid: 0,
    creditsApplied: 0,
    balanceDue: 0,
    notes: input.notes ?? (input.type === 'quote' ? s.defaultQuoteNotes : input.type === 'invoice' ? s.defaultInvoiceNotes : undefined),
    terms: input.terms ?? (input.type === 'quote' ? s.defaultQuoteTerms : input.type === 'invoice' ? s.defaultInvoiceTerms : undefined),
    convertedFromId: input.convertedFromId,
    contractId: input.contractId,
    servicePeriod: input.servicePeriod,
    publicToken: newToken(),
    history: [],
    createdBy: actor,
    createdAt: now,
    updatedAt: now
  };
  computeDocument(doc);
  addHistory(doc, actor, 'created', historyDetail);
  store.billingDocuments.set(doc.id, doc);
  if (doc.type === 'invoice') markTimeEntries(doc);
  return doc;
}

// ---------------------------------------------------------------------------
// Devices / contracts
// ---------------------------------------------------------------------------
export function countDevices(clientId: string, filter: ContractDeviceFilter = {}): { count: number; deviceIds: string[] } {
  const osList = Array.isArray(filter.os) ? filter.os : [];
  const deviceIds: string[] = [];
  for (const d of store.devices.values()) {
    if (d.clientId !== clientId) continue;
    if (osList.length && !osList.includes(d.os)) continue;
    if (d.health === 'offline' && !filter.includeInactive) continue;
    deviceIds.push(d.id);
  }
  if (filter.includeMdm) {
    for (const [serial, m] of store.mdmClients.entries()) if (m.clientId === clientId) deviceIds.push(serial);
  }
  return { count: deviceIds.length, deviceIds };
}

export function liveQuantity(line: ContractLine, client?: ClientTenant): { quantity: number; deviceIds?: string[] } {
  if (line.quantityMode === 'device_count') {
    const { count, deviceIds } = client ? countDevices(client.id, line.deviceFilter) : { count: 0, deviceIds: [] };
    return { quantity: Math.max(count, Number(line.minimumQuantity) || 0), deviceIds };
  }
  if (line.quantityMode === 'user_count') {
    return { quantity: Math.max(Number(client?.billableUsers) || 0, Number(line.minimumQuantity) || 0) };
  }
  return { quantity: Number(line.fixedQuantity ?? 1) || 0 };
}

export function contractPeriod(c: Contract, invoiceDate = c.nextInvoiceDate): { start: string; end: string } {
  const m = frequencyMonths(c.billingFrequency);
  if (c.billInAdvance) return { start: invoiceDate, end: addDays(addMonths(invoiceDate, m), -1) };
  return { start: addMonths(invoiceDate, -m), end: addDays(invoiceDate, -1) };
}

/** First invoice date for a contract given its start date, billing day and advance/arrears setting. */
export function initialNextInvoiceDate(c: Pick<Contract, 'startDate' | 'billingDay' | 'billingFrequency' | 'billInAdvance'>): string {
  const day = clampBillingDay(c.billingDay);
  const start = parseDate(c.startDate);
  let first = start.getUTCDate() <= day ? addMonths(c.startDate, 0, day) : addMonths(c.startDate, 1, day);
  if (!c.billInAdvance) first = addMonths(first, frequencyMonths(c.billingFrequency), day);
  return first;
}

export const clampBillingDay = (d: unknown): number => Math.min(28, Math.max(1, Math.floor(Number(d) || 1)));

function contractLinesToDocLines(c: Contract, client?: ClientTenant, periodLabel?: string): BillingLineItem[] {
  return (c.lines || []).map((l) => {
    const { quantity, deviceIds } = liveQuantity(l, client);
    const source: LineSource = l.quantityMode === 'device_count' ? 'device_count' : l.quantityMode === 'user_count' ? 'user_count' : 'contract';
    return {
      id: newId('ln'),
      ...(l.itemId ? { itemId: l.itemId } : {}),
      name: l.name,
      description: [l.description, periodLabel].filter(Boolean).join(' — ') || undefined,
      quantity,
      unit: l.unit,
      unitPrice: Number(l.unitPrice) || 0,
      taxable: !!l.taxable,
      source,
      sourceRef: { contractId: c.id, contractLineId: l.id, ...(deviceIds ? { deviceIds } : {}) }
    };
  });
}

/** Contract decorated with live currentQuantity/currentAmount, recurringAmount and mrr. */
export function decorateContract(c: Contract): Contract {
  const client = store.clients.get(c.clientId);
  let recurring = 0;
  const lines = (c.lines || []).map((l) => {
    const { quantity } = liveQuantity(l, client);
    const currentAmount = round2(quantity * (Number(l.unitPrice) || 0));
    recurring += currentAmount;
    return { ...l, currentQuantity: quantity, currentAmount };
  });
  const recurringAmount = round2(recurring);
  return { ...c, lines, recurringAmount, mrr: round2(recurringAmount / frequencyMonths(c.billingFrequency)) };
}

export function previewContract(c: Contract) {
  const decorated = decorateContract(c);
  const client = store.clients.get(c.clientId);
  const period = contractPeriod(c);
  const tmp = {
    id: 'preview', type: 'invoice', clientId: c.clientId, status: 'draft',
    lines: contractLinesToDocLines(c, client), amountPaid: 0, creditsApplied: 0
  } as unknown as BillingDocument;
  computeDocument(tmp);
  return {
    contract: decorated,
    lines: decorated.lines,
    periodStart: period.start,
    periodEnd: period.end,
    subtotal: tmp.subtotal,
    taxTotal: tmp.taxTotal,
    total: tmp.total
  };
}

export function findPeriodInvoice(contractId: string, periodStart: string, excludeId?: string): BillingDocument | undefined {
  for (const d of store.billingDocuments.values()) {
    if (d.id === excludeId || d.type !== 'invoice' || d.status === 'void') continue;
    if (d.contractId === contractId && d.servicePeriod?.start === periodStart) return d;
  }
  return undefined;
}

export interface GenerateResult {
  invoice?: BillingDocument;
  duplicateOf?: BillingDocument;
  sendPromise?: Promise<unknown>;
}

/**
 * Generate the invoice for a contract's current period (nextInvoiceDate).
 * Skips (and reports) when an invoice already exists for the same period.
 * Advances nextInvoiceDate in both cases.
 */
export function generateContractInvoice(
  c: Contract,
  actor: string,
  sender?: (doc: BillingDocument, actor: string) => Promise<unknown>
): GenerateResult {
  const client = store.clients.get(c.clientId);
  if (!client) throw new BillingError(400, 'Contract client no longer exists');
  const period = contractPeriod(c);
  const m = frequencyMonths(c.billingFrequency);
  const advance = () => {
    c.nextInvoiceDate = addMonths(c.nextInvoiceDate, m, clampBillingDay(c.billingDay));
    c.updatedAt = nowIso();
  };

  const existing = findPeriodInvoice(c.id, period.start);
  if (existing) {
    advance();
    return { duplicateOf: existing };
  }

  const periodLabel = `Service period ${period.start} to ${period.end}`;
  const lines = contractLinesToDocLines(c, client, periodLabel);

  // Included hours / overage from billable unbilled time logged in the period.
  const coveredEntryIds: string[] = [];
  if (c.includedHoursPerPeriod !== undefined && c.includedHoursPerPeriod !== null && Number(c.overageHourlyRate) > 0) {
    let minutes = 0;
    for (const u of unbilledTimeFor(c.clientId)) {
      const d = toDateStr(u.entry.date, '');
      if (d && d >= period.start && d <= period.end) {
        minutes += Number(u.entry.minutes) || 0;
        coveredEntryIds.push(u.entry.id);
      }
    }
    if (coveredEntryIds.length) {
      const hours = round2(minutes / 60);
      const included = Number(c.includedHoursPerPeriod) || 0;
      const overage = round2(Math.max(0, hours - included));
      lines.push({
        id: newId('ln'),
        name: overage > 0 ? 'Support hours overage' : 'Included support hours',
        description: `${hours} hrs logged in period, ${included} hrs included${overage > 0 ? `, ${overage} hrs billable overage` : ''}`,
        quantity: overage > 0 ? overage : hours,
        unit: 'hr',
        unitPrice: overage > 0 ? Number(c.overageHourlyRate) : 0,
        taxable: false,
        source: 'contract',
        sourceRef: { contractId: c.id, timeEntryIds: coveredEntryIds }
      });
    }
  }

  const invoice = createDocument(
    {
      type: 'invoice',
      clientId: c.clientId,
      status: c.requireReview ? 'pending_review' : 'sent',
      paymentTerms: c.paymentTerms,
      subject: `${c.name} — ${period.start} to ${period.end}`,
      notes: c.notes || undefined,
      contractId: c.id,
      servicePeriod: period,
      lines
    },
    actor,
    c.orgId,
    `Generated from contract ${c.number}`
  );
  invoice.auditFlags = auditDocument(invoice);
  c.lastInvoicedAt = nowIso();
  c.lastInvoiceId = invoice.id;
  advance();

  let sendPromise: Promise<unknown> | undefined;
  if (!c.requireReview && c.autoSend && sender) {
    sendPromise = sender(invoice, actor).catch((e) => console.warn('[billing] auto-send failed:', (e as Error).message));
  }
  return { invoice, sendPromise };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export function auditDocument(doc: BillingDocument): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const client = store.clients.get(doc.clientId);
  const s = settings();

  for (const line of doc.lines || []) {
    if ((line.source === 'device_count' || line.source === 'user_count') && line.sourceRef?.contractLineId) {
      const contract = line.sourceRef.contractId ? store.contracts.get(line.sourceRef.contractId) : undefined;
      const cl = contract?.lines.find((l) => l.id === line.sourceRef!.contractLineId);
      if (!cl) continue;
      const { quantity } = liveQuantity(cl, client);
      if (quantity !== Number(line.quantity)) {
        const isDev = line.source === 'device_count';
        flags.push({
          code: isDev ? 'device_count_mismatch' : 'user_count_mismatch',
          severity: 'warning',
          message: `"${line.name}" bills ${line.quantity} ${isDev ? 'device' : 'user'}(s) but the live count is ${quantity}.`,
          lineId: line.id,
          suggestedQuantity: quantity
        });
      }
    }
  }

  const unbilled = unbilledTimeFor(doc.clientId).filter((u) => u.entry.invoiceId !== doc.id);
  if (unbilled.length) {
    const mins = unbilled.reduce((a, u) => a + (Number(u.entry.minutes) || 0), 0);
    const amt = round2(unbilled.reduce((a, u) => a + u.amount, 0));
    flags.push({
      code: 'unbilled_time',
      severity: 'info',
      message: `${client?.name || 'Client'} has ${unbilled.length} unbilled billable time entr${unbilled.length === 1 ? 'y' : 'ies'} (${round2(mins / 60)} hrs, $${amt.toFixed(2)}).`
    });
  }

  if (doc.total <= 0) flags.push({ code: 'zero_total', severity: 'warning', message: 'Invoice total is $0.00.' });

  const prev = Array.from(store.billingDocuments.values())
    .filter((d) => d.id !== doc.id && d.type === 'invoice' && d.clientId === doc.clientId && d.status !== 'void' && d.status !== 'draft' && d.createdAt <= doc.createdAt)
    .sort((a, b) => (a.issueDate === b.issueDate ? a.createdAt.localeCompare(b.createdAt) : a.issueDate.localeCompare(b.issueDate)))
    .pop();
  const threshold = Number(s.amountVarianceThresholdPct) || 25;
  if (prev && prev.total > 0) {
    const pct = ((doc.total - prev.total) / prev.total) * 100;
    if (Math.abs(pct) > threshold) {
      flags.push({
        code: 'amount_variance',
        severity: 'warning',
        message: `Total $${doc.total.toFixed(2)} is ${pct > 0 ? 'up' : 'down'} ${Math.abs(round2(pct))}% vs previous invoice ${prev.number} ($${prev.total.toFixed(2)}).`
      });
    }
  }

  if (!doc.billingEmail && !client?.billingEmail && !client?.contactEmail) {
    flags.push({ code: 'missing_billing_email', severity: 'warning', message: 'No billing email on file — the invoice cannot be emailed.' });
  }

  if (doc.contractId && doc.servicePeriod?.start) {
    const dup = findPeriodInvoice(doc.contractId, doc.servicePeriod.start, doc.id);
    if (dup) {
      flags.push({ code: 'duplicate_period', severity: 'critical', message: `Invoice ${dup.number} already bills this contract for the period starting ${doc.servicePeriod.start}.` });
    }
  }

  if (!client?.taxExempt && (doc.lines || []).some((l) => l.taxable && !resolveTaxRate(l, client))) {
    flags.push({ code: 'tax_missing', severity: 'warning', message: 'Taxable lines have no resolvable tax rate (set a default tax rate or one on the client).' });
  }
  return flags;
}

/** Update counted lines to their live suggested quantities. Returns number of lines changed. */
export function applyAuditFixes(doc: BillingDocument): number {
  const client = store.clients.get(doc.clientId);
  const flags = auditDocument(doc);
  let changed = 0;
  for (const f of flags) {
    if (!f.lineId || f.suggestedQuantity === undefined) continue;
    const line = doc.lines.find((l) => l.id === f.lineId);
    if (!line) continue;
    line.quantity = f.suggestedQuantity;
    if (line.source === 'device_count' && line.sourceRef?.contractId) {
      const cl = store.contracts.get(line.sourceRef.contractId)?.lines.find((l) => l.id === line.sourceRef!.contractLineId);
      if (cl) line.sourceRef.deviceIds = liveQuantity(cl, client).deviceIds;
    }
    changed++;
  }
  computeDocument(doc);
  doc.auditFlags = auditDocument(doc);
  return changed;
}

// ---------------------------------------------------------------------------
// Payments & credits
// ---------------------------------------------------------------------------
export function applyPaymentAllocations(p: BillingPayment, actor: string, sign: 1 | -1): void {
  for (const a of p.allocations) {
    const inv = store.billingDocuments.get(a.invoiceId);
    if (!inv) continue;
    inv.amountPaid = Math.max(0, round2((Number(inv.amountPaid) || 0) + sign * a.amount));
    computeDocument(inv);
    addHistory(
      inv,
      actor,
      sign > 0 ? 'payment_recorded' : 'payment_voided',
      `${p.number}: $${a.amount.toFixed(2)} via ${p.method}${p.reference ? ` (${p.reference})` : ''}`
    );
  }
}

export interface PaymentInput {
  clientId: string;
  amount: number;
  date?: string;
  method: BillingPayment['method'];
  reference?: string;
  notes?: string;
  allocations: { invoiceId: string; amount: number }[];
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
}

const PAYMENT_METHODS: BillingPayment['method'][] = ['stripe_card', 'stripe_ach', 'check', 'cash', 'ach', 'wire', 'credit_card_manual', 'other'];

export function recordPayment(input: PaymentInput, actor: string, orgId = DEFAULT_ORG_ID): BillingPayment {
  const client = store.clients.get(input.clientId);
  if (!client) throw new BillingError(400, 'clientId does not reference an existing client');
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new BillingError(400, 'amount must be a positive number');
  if (!PAYMENT_METHODS.includes(input.method)) throw new BillingError(400, `method must be one of ${PAYMENT_METHODS.join(', ')}`);
  const allocsIn = Array.isArray(input.allocations) ? input.allocations : [];
  const allocations: BillingPayment['allocations'] = [];
  const seen = new Set<string>();
  let allocated = 0;
  for (const a of allocsIn) {
    const amt = round2(Number(a?.amount));
    if (!a?.invoiceId || !Number.isFinite(amt) || amt < 0) throw new BillingError(400, 'Each allocation needs invoiceId and a non-negative amount');
    if (amt === 0) continue;
    if (seen.has(a.invoiceId)) throw new BillingError(400, 'Duplicate invoice in allocations');
    seen.add(a.invoiceId);
    const inv = store.billingDocuments.get(a.invoiceId);
    if (!inv || inv.type !== 'invoice') throw new BillingError(400, `Invoice ${a.invoiceId} not found`);
    if (inv.clientId !== client.id) throw new BillingError(400, `Invoice ${inv.number} belongs to a different client`);
    if (!OPEN_INVOICE_STATUSES.includes(inv.status)) throw new BillingError(400, `Invoice ${inv.number} is ${inv.status} and cannot accept payments`);
    if (amt > inv.balanceDue + 0.005) throw new BillingError(400, `Allocation $${amt.toFixed(2)} exceeds ${inv.number} balance $${inv.balanceDue.toFixed(2)}`);
    allocations.push({ invoiceId: inv.id, invoiceNumber: inv.number, amount: amt });
    allocated += amt;
  }
  allocated = round2(allocated);
  if (allocated > amount + 0.005) throw new BillingError(400, 'Allocations exceed payment amount');

  const payment: BillingPayment = {
    id: newId('pmt'),
    orgId,
    number: nextNumber('payment'),
    clientId: client.id,
    clientName: client.name,
    date: toDateStr(input.date),
    amount,
    method: input.method,
    reference: input.reference || undefined,
    notes: input.notes || undefined,
    allocations,
    unapplied: Math.max(0, round2(amount - allocated)),
    ...(input.stripeSessionId ? { stripeSessionId: input.stripeSessionId } : {}),
    ...(input.stripePaymentIntentId ? { stripePaymentIntentId: input.stripePaymentIntentId } : {}),
    createdBy: actor,
    createdAt: nowIso()
  };
  store.billingPayments.set(payment.id, payment);
  applyPaymentAllocations(payment, actor, 1);
  return payment;
}

export function voidPayment(p: BillingPayment, actor: string): BillingPayment {
  if (p.voided) throw new BillingError(400, 'Payment is already void');
  p.voided = true;
  applyPaymentAllocations(p, actor, -1);
  return p;
}

export function applyCredit(invoice: BillingDocument, creditNote: BillingDocument, amountIn: number, actor: string): CreditApplication {
  const amount = round2(Number(amountIn));
  if (invoice.type !== 'invoice') throw new BillingError(400, 'Credits can only be applied to invoices');
  if (creditNote.type !== 'credit_note') throw new BillingError(400, 'creditNoteId is not a credit note');
  if (creditNote.status !== 'open') throw new BillingError(400, `Credit note ${creditNote.number} is ${creditNote.status}`);
  if (creditNote.clientId !== invoice.clientId) throw new BillingError(400, 'Credit note belongs to a different client');
  if (!OPEN_INVOICE_STATUSES.includes(invoice.status)) throw new BillingError(400, `Invoice ${invoice.number} is ${invoice.status} and cannot accept credits`);
  if (!Number.isFinite(amount) || amount <= 0) throw new BillingError(400, 'amount must be a positive number');
  if (amount > creditNote.balanceDue + 0.005) throw new BillingError(400, `Amount exceeds remaining credit $${creditNote.balanceDue.toFixed(2)}`);
  if (amount > invoice.balanceDue + 0.005) throw new BillingError(400, `Amount exceeds invoice balance $${invoice.balanceDue.toFixed(2)}`);
  const app: CreditApplication = { id: newId('capp'), creditNoteId: creditNote.id, invoiceId: invoice.id, amount, at: nowIso() };
  store.creditApplications.set(app.id, app);
  invoice.creditsApplied = round2((Number(invoice.creditsApplied) || 0) + amount);
  creditNote.creditsApplied = round2((Number(creditNote.creditsApplied) || 0) + amount);
  computeDocument(invoice);
  computeDocument(creditNote);
  addHistory(invoice, actor, 'credit_applied', `${creditNote.number}: $${amount.toFixed(2)}`);
  addHistory(creditNote, actor, 'credit_applied', `Applied $${amount.toFixed(2)} to ${invoice.number}`);
  return app;
}

/** Reverse all credit applications touching a document (invoice or credit note). */
export function reverseCreditApplications(doc: BillingDocument, actor: string): void {
  for (const app of Array.from(store.creditApplications.values())) {
    if (app.invoiceId !== doc.id && app.creditNoteId !== doc.id) continue;
    const inv = store.billingDocuments.get(app.invoiceId);
    const cn = store.billingDocuments.get(app.creditNoteId);
    if (inv) {
      inv.creditsApplied = Math.max(0, round2(inv.creditsApplied - app.amount));
      computeDocument(inv);
      if (inv.id !== doc.id) addHistory(inv, actor, 'credit_reversed', `${cn?.number || app.creditNoteId}: $${app.amount.toFixed(2)}`);
    }
    if (cn) {
      cn.creditsApplied = Math.max(0, round2(cn.creditsApplied - app.amount));
      computeDocument(cn);
      if (cn.id !== doc.id) addHistory(cn, actor, 'credit_reversed', `${inv?.number || app.invoiceId}: $${app.amount.toFixed(2)}`);
    }
    store.creditApplications.delete(app.id);
  }
}

// ---------------------------------------------------------------------------
// Financial summaries
// ---------------------------------------------------------------------------
export function financialSummary(clientId: string): ClientFinancialSummary {
  const t = today();
  const yearAgo = addMonths(t, -12);
  let outstanding = 0, overdue = 0, credit = 0, paid12 = 0, mrr = 0;
  let lastInvoiceDate: string | undefined, lastPaymentDate: string | undefined;
  for (const d of store.billingDocuments.values()) {
    if (d.clientId !== clientId) continue;
    if (d.type === 'invoice') {
      if (OPEN_INVOICE_STATUSES.includes(d.status)) {
        outstanding += d.balanceDue;
        if (d.dueDate && d.dueDate < t) overdue += d.balanceDue;
      }
      if (d.status !== 'void' && d.status !== 'draft' && d.status !== 'pending_review' && (!lastInvoiceDate || d.issueDate > lastInvoiceDate)) lastInvoiceDate = d.issueDate;
    } else if (d.type === 'credit_note' && d.status === 'open') {
      credit += d.balanceDue;
    }
  }
  for (const p of store.billingPayments.values()) {
    if (p.clientId !== clientId || p.voided) continue;
    credit += p.unapplied || 0;
    if (p.date >= yearAgo) paid12 += p.amount;
    if (!lastPaymentDate || p.date > lastPaymentDate) lastPaymentDate = p.date;
  }
  for (const c of store.contracts.values()) {
    if (c.clientId === clientId && c.status === 'active') mrr += decorateContract(c).mrr || 0;
  }
  const unbilled = unbilledTimeFor(clientId);
  return {
    clientId,
    outstanding: round2(outstanding),
    overdue: round2(overdue),
    creditBalance: round2(credit),
    paidLast12Months: round2(paid12),
    mrr: round2(mrr),
    unbilledTimeMinutes: unbilled.reduce((a, u) => a + (Number(u.entry.minutes) || 0), 0),
    unbilledTimeAmount: round2(unbilled.reduce((a, u) => a + u.amount, 0)),
    ...(lastInvoiceDate ? { lastInvoiceDate } : {}),
    ...(lastPaymentDate ? { lastPaymentDate } : {})
  };
}

export function billingSummary() {
  const t = today();
  const month = t.slice(0, 7);
  const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  let outstanding = 0, overdue = 0, overdueCount = 0, draftCount = 0, pendingReviewCount = 0;
  let openQuotesTotal = 0, openQuotesCount = 0, invoicedThisMonth = 0, collectedThisMonth = 0;
  const byClient = new Map<string, { clientId: string; clientName: string; outstanding: number }>();
  for (const d of store.billingDocuments.values()) {
    if (d.type === 'invoice') {
      if (d.status === 'draft') draftCount++;
      if (d.status === 'pending_review') pendingReviewCount++;
      if (!['draft', 'pending_review', 'void'].includes(d.status) && d.issueDate.slice(0, 7) === month) invoicedThisMonth += d.total;
      if (OPEN_INVOICE_STATUSES.includes(d.status) && d.balanceDue > 0) {
        outstanding += d.balanceDue;
        const late = d.dueDate ? daysBetween(d.dueDate, t) : 0;
        if (late > 0) { overdue += d.balanceDue; overdueCount++; }
        if (late <= 0) aging.current += d.balanceDue;
        else if (late <= 30) aging.d1_30 += d.balanceDue;
        else if (late <= 60) aging.d31_60 += d.balanceDue;
        else if (late <= 90) aging.d61_90 += d.balanceDue;
        else aging.d90_plus += d.balanceDue;
        const e = byClient.get(d.clientId) || { clientId: d.clientId, clientName: d.clientName, outstanding: 0 };
        e.outstanding += d.balanceDue;
        byClient.set(d.clientId, e);
      }
    } else if (d.type === 'quote' && (d.status === 'draft' || d.status === 'sent')) {
      openQuotesTotal += d.total;
      openQuotesCount++;
    }
  }
  for (const p of store.billingPayments.values()) {
    if (!p.voided && p.date.slice(0, 7) === month) collectedThisMonth += p.amount;
  }
  let mrr = 0, activeContracts = 0;
  for (const c of store.contracts.values()) {
    if (c.status !== 'active') continue;
    activeContracts++;
    mrr += decorateContract(c).mrr || 0;
  }
  return {
    outstanding: round2(outstanding),
    overdue: round2(overdue),
    overdueCount,
    draftCount,
    pendingReviewCount,
    openQuotesTotal: round2(openQuotesTotal),
    openQuotesCount,
    mrr: round2(mrr),
    activeContracts,
    invoicedThisMonth: round2(invoicedThisMonth),
    collectedThisMonth: round2(collectedThisMonth),
    aging: {
      current: round2(aging.current), d1_30: round2(aging.d1_30), d31_60: round2(aging.d31_60),
      d61_90: round2(aging.d61_90), d90_plus: round2(aging.d90_plus)
    },
    topClientsByOutstanding: Array.from(byClient.values())
      .map((e) => ({ ...e, outstanding: round2(e.outstanding) }))
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5)
  };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------
export function runBillingCycle(sender?: (doc: BillingDocument, actor: string) => Promise<unknown>): { generated: number; expiredQuotes: number; skipped: number } {
  const t = today();
  const actor = 'Billing Scheduler';
  let generated = 0, expiredQuotes = 0, skipped = 0;

  for (const c of store.contracts.values()) {
    if (c.status === 'active' && c.endDate && c.endDate < t && !c.autoRenew) {
      c.status = 'expired';
      c.updatedAt = nowIso();
      continue;
    }
    if (c.status !== 'active') continue;
    // Catch up at most 24 periods per run to avoid runaway loops on bad data.
    for (let i = 0; i < 24 && c.nextInvoiceDate && c.nextInvoiceDate <= t; i++) {
      if (c.endDate && contractPeriod(c).start > c.endDate && !c.autoRenew) break;
      try {
        const r = generateContractInvoice(c, actor, sender);
        if (r.invoice) {
          generated++;
          store.recordAudit({
            orgId: c.orgId || DEFAULT_ORG_ID, actorName: actor, action: 'billing.contract_invoice_generate',
            targetType: 'billing_document', targetId: r.invoice.id, details: { contractId: c.id, number: r.invoice.number }
          });
        } else skipped++;
      } catch (e) {
        console.warn(`[billing] contract ${c.number} generation failed:`, (e as Error).message);
        break;
      }
    }
  }

  for (const d of store.billingDocuments.values()) {
    if (d.type === 'quote' && d.status === 'sent' && d.expiryDate && d.expiryDate < t) {
      d.status = 'expired';
      addHistory(d, actor, 'expired', `Quote expired on ${d.expiryDate}`);
      expiredQuotes++;
    } else if (d.type === 'invoice' && OPEN_INVOICE_STATUSES.includes(d.status)) {
      const before = d.status;
      computeDocument(d);
      if (before !== d.status && d.status === 'overdue') addHistory(d, actor, 'overdue', `Past due date ${d.dueDate}`);
    }
  }
  if (generated || expiredQuotes) store.persist();
  return { generated, expiredQuotes, skipped };
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
export function startBillingScheduler(sender?: (doc: BillingDocument, actor: string) => Promise<unknown>): void {
  if (schedulerTimer) return;
  const tick = () => {
    try {
      const r = runBillingCycle(sender);
      if (r.generated || r.expiredQuotes || r.skipped) console.log(`[billing] cycle: ${r.generated} invoice(s) generated, ${r.skipped} duplicate period(s) skipped, ${r.expiredQuotes} quote(s) expired`);
    } catch (e) {
      console.warn('[billing] scheduler cycle failed:', (e as Error).message);
    }
  };
  setTimeout(tick, 5000).unref?.();
  schedulerTimer = setInterval(tick, 60 * 60 * 1000);
  schedulerTimer.unref?.();
}
