/**
 * /api/v1/billing — quotes, sales orders, invoices, credit notes, payments,
 * recurring contracts, invoice audit, tax rates, catalog and settings.
 * Contract: apps/console/src/services/billingApi.ts
 */
import { Router, type Response } from 'express';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type {
  BillingDocStatus,
  BillingDocType,
  BillingDocument,
  BillingFrequency,
  BillingSettings,
  CatalogItem,
  CatalogItemType,
  Contract,
  ContractLine,
  ContractQuantityMode,
  ContractStatus,
  TaxRate
} from '@openmsp/api-types';
import {
  BillingError,
  DEFAULT_ORG_ID,
  DOC_TYPES,
  PAYMENT_TERMS,
  STATUSES_BY_TYPE,
  addDays,
  addHistory,
  applyAuditFixes,
  applyCredit,
  auditDocument,
  billingSummary,
  clampBillingDay,
  computeDocument,
  createDocument,
  decorateContract,
  generateContractInvoice,
  initialNextInvoiceDate,
  markTimeEntries,
  newId,
  nextNumber,
  normalizeLine,
  nowIso,
  previewContract,
  recordPayment,
  releaseTimeEntries,
  reverseCreditApplications,
  termsDays,
  toDateStr,
  voidPayment
} from '../billing/engine.js';
import { deliverDocument, integrationStatus } from '../billing/mailer.js';
import { createCheckoutSession } from '../billing/stripe.js';

const router = Router();
router.use(authenticate);

type Handler = (req: AuthenticatedRequest, res: Response) => unknown | Promise<unknown>;
const h = (fn: Handler) => async (req: AuthenticatedRequest, res: Response) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof BillingError) {
      res.status(e.status).json({ error: e.message, ...(e.extra || {}) });
      return;
    }
    console.error('[billing] route error:', e);
    res.status(500).json({ error: (e as Error).message || 'Internal error' });
  }
};

const actorOf = (req: AuthenticatedRequest) => req.user?.name || 'System';
const orgOf = (req: AuthenticatedRequest) => req.user?.orgId || DEFAULT_ORG_ID;
const param = (req: AuthenticatedRequest, k: string) => String((req.params as Record<string, unknown>)[k] ?? '');
const q = (req: AuthenticatedRequest, k: string): string | undefined => {
  const v = req.query[k];
  return typeof v === 'string' && v !== '' && v !== 'all' ? v : undefined;
};

function audit(req: AuthenticatedRequest, action: string, targetType: string, targetId: string, details: Record<string, unknown> = {}) {
  store.recordAudit({
    orgId: orgOf(req),
    userId: req.user?.id,
    actorName: actorOf(req),
    action: `billing.${action}`,
    targetType,
    targetId,
    details,
    ipAddress: req.ip
  });
}

function getDoc(id: string): BillingDocument {
  const doc = store.billingDocuments.get(id);
  if (!doc) throw new BillingError(404, 'Document not found');
  return doc;
}

const isNum = (v: unknown) => typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));

// ---------------------------------------------------------------------------
// Summary & settings
// ---------------------------------------------------------------------------
router.get('/summary', h((_req, res) => {
  res.json(billingSummary());
}));

router.get('/settings', h((_req, res) => {
  res.json({ ...store.billingSettings, ...integrationStatus() });
}));

router.put('/settings', h((req, res) => {
  const b = (req.body || {}) as Partial<BillingSettings>;
  const s = store.billingSettings;
  const strFields = ['companyName', 'companyEmail', 'companyPhone', 'companyWebsite', 'logoUrl', 'brandColor', 'currency',
    'defaultInvoiceNotes', 'defaultInvoiceTerms', 'defaultQuoteNotes', 'defaultQuoteTerms', 'publicPortalBaseUrl'] as const;
  for (const f of strFields) {
    if (b[f] !== undefined) (s as unknown as Record<string, unknown>)[f] = b[f] === null ? undefined : String(b[f]);
  }
  if (b.companyName !== undefined && !String(b.companyName).trim()) throw new BillingError(400, 'companyName cannot be empty');
  if (b.currency !== undefined) s.currency = String(b.currency).toUpperCase().slice(0, 3) || 'USD';
  if (b.companyAddress !== undefined) s.companyAddress = b.companyAddress && typeof b.companyAddress === 'object' ? b.companyAddress : undefined;
  if (b.defaultPaymentTerms !== undefined) {
    if (!PAYMENT_TERMS.includes(b.defaultPaymentTerms)) throw new BillingError(400, 'invalid defaultPaymentTerms');
    s.defaultPaymentTerms = b.defaultPaymentTerms;
  }
  if (b.quoteValidityDays !== undefined) {
    if (!isNum(b.quoteValidityDays) || Number(b.quoteValidityDays) < 1) throw new BillingError(400, 'quoteValidityDays must be >= 1');
    s.quoteValidityDays = Math.floor(Number(b.quoteValidityDays));
  }
  if (b.amountVarianceThresholdPct !== undefined) {
    if (!isNum(b.amountVarianceThresholdPct) || Number(b.amountVarianceThresholdPct) < 0) throw new BillingError(400, 'amountVarianceThresholdPct must be >= 0');
    s.amountVarianceThresholdPct = Number(b.amountVarianceThresholdPct);
  }
  if (b.prefixes && typeof b.prefixes === 'object') {
    for (const [k, v] of Object.entries(b.prefixes)) if (k in s.prefixes && typeof v === 'string') (s.prefixes as Record<string, string>)[k] = v;
  }
  if (b.nextNumbers && typeof b.nextNumbers === 'object') {
    for (const [k, v] of Object.entries(b.nextNumbers)) {
      if (!(k in s.nextNumbers)) continue;
      if (!isNum(v) || Number(v) < 1) throw new BillingError(400, `nextNumbers.${k} must be a positive integer`);
      (s.nextNumbers as Record<string, number>)[k] = Math.floor(Number(v));
    }
  }
  audit(req, 'settings_update', 'billing_settings', orgOf(req), { fields: Object.keys(b) });
  res.json({ ...s, ...integrationStatus() });
}));

// ---------------------------------------------------------------------------
// Tax rates
// ---------------------------------------------------------------------------
router.get('/tax-rates', h((_req, res) => {
  res.json(Array.from(store.taxRates.values()).sort((a, b) => a.name.localeCompare(b.name)));
}));

function applyTaxDefault(rate: TaxRate) {
  if (rate.isDefault) for (const t of store.taxRates.values()) if (t.id !== rate.id) t.isDefault = false;
}

router.post('/tax-rates', h((req, res) => {
  const { name, ratePct, isDefault, active } = req.body || {};
  if (!name || !String(name).trim()) throw new BillingError(400, 'name is required');
  if (!isNum(ratePct) || Number(ratePct) < 0 || Number(ratePct) > 100) throw new BillingError(400, 'ratePct must be 0-100');
  const rate: TaxRate = { id: newId('tax'), name: String(name).trim(), ratePct: Number(ratePct), isDefault: !!isDefault, active: active !== false };
  store.taxRates.set(rate.id, rate);
  applyTaxDefault(rate);
  audit(req, 'tax_rate_create', 'tax_rate', rate.id, { name: rate.name, ratePct: rate.ratePct });
  res.status(201).json(rate);
}));

router.put('/tax-rates/:id', h((req, res) => {
  const rate = store.taxRates.get(param(req, 'id'));
  if (!rate) throw new BillingError(404, 'Tax rate not found');
  const { name, ratePct, isDefault, active } = req.body || {};
  if (name !== undefined) {
    if (!String(name).trim()) throw new BillingError(400, 'name cannot be empty');
    rate.name = String(name).trim();
  }
  if (ratePct !== undefined) {
    if (!isNum(ratePct) || Number(ratePct) < 0 || Number(ratePct) > 100) throw new BillingError(400, 'ratePct must be 0-100');
    rate.ratePct = Number(ratePct);
  }
  if (isDefault !== undefined) rate.isDefault = !!isDefault;
  if (active !== undefined) rate.active = !!active;
  applyTaxDefault(rate);
  audit(req, 'tax_rate_update', 'tax_rate', rate.id, { ...req.body });
  res.json(rate);
}));

router.delete('/tax-rates/:id', h((req, res) => {
  const id = param(req, 'id');
  const rate = store.taxRates.get(id);
  if (!rate) throw new BillingError(404, 'Tax rate not found');
  store.taxRates.delete(id);
  for (const c of store.clients.values()) if (c.taxRateId === id) delete c.taxRateId;
  audit(req, 'tax_rate_delete', 'tax_rate', id, { name: rate.name });
  res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// Catalog items
// ---------------------------------------------------------------------------
const ITEM_TYPES: CatalogItemType[] = ['service', 'product', 'labor', 'per_device', 'per_user'];

router.get('/items', h((_req, res) => {
  res.json(Array.from(store.catalogItems.values()).sort((a, b) => a.name.localeCompare(b.name)));
}));

function applyItemFields(item: CatalogItem, b: Partial<CatalogItem>) {
  if (b.name !== undefined) {
    if (!String(b.name).trim()) throw new BillingError(400, 'name cannot be empty');
    item.name = String(b.name).trim();
  }
  if (b.type !== undefined) {
    if (!ITEM_TYPES.includes(b.type)) throw new BillingError(400, `type must be one of ${ITEM_TYPES.join(', ')}`);
    item.type = b.type;
  }
  if (b.unitPrice !== undefined) {
    if (!isNum(b.unitPrice)) throw new BillingError(400, 'unitPrice must be a number');
    item.unitPrice = Number(b.unitPrice);
  }
  if (b.cost !== undefined) {
    if (b.cost !== null && !isNum(b.cost)) throw new BillingError(400, 'cost must be a number');
    item.cost = b.cost === null ? undefined : Number(b.cost);
  }
  for (const f of ['sku', 'description', 'unit'] as const) if (b[f] !== undefined) item[f] = b[f] ? String(b[f]) : undefined;
  if (b.taxable !== undefined) item.taxable = !!b.taxable;
  if (b.active !== undefined) item.active = !!b.active;
}

router.post('/items', h((req, res) => {
  const b = (req.body || {}) as Partial<CatalogItem>;
  if (!b.name || !String(b.name).trim()) throw new BillingError(400, 'name is required');
  if (!isNum(b.unitPrice)) throw new BillingError(400, 'unitPrice is required');
  const now = nowIso();
  const item: CatalogItem = {
    id: newId('item'), name: '', type: 'service', unitPrice: 0, taxable: false, active: true, createdAt: now, updatedAt: now
  };
  applyItemFields(item, b);
  store.catalogItems.set(item.id, item);
  audit(req, 'item_create', 'catalog_item', item.id, { name: item.name, unitPrice: item.unitPrice });
  res.status(201).json(item);
}));

router.put('/items/:id', h((req, res) => {
  const item = store.catalogItems.get(param(req, 'id'));
  if (!item) throw new BillingError(404, 'Item not found');
  applyItemFields(item, req.body || {});
  item.updatedAt = nowIso();
  audit(req, 'item_update', 'catalog_item', item.id, { fields: Object.keys(req.body || {}) });
  res.json(item);
}));

router.delete('/items/:id', h((req, res) => {
  const id = param(req, 'id');
  const item = store.catalogItems.get(id);
  if (!item) throw new BillingError(404, 'Item not found');
  store.catalogItems.delete(id);
  audit(req, 'item_delete', 'catalog_item', id, { name: item.name });
  res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
router.get('/documents', h((req, res) => {
  const type = q(req, 'type');
  const clientId = q(req, 'clientId');
  const status = q(req, 'status');
  const docs = Array.from(store.billingDocuments.values())
    .filter((d) => (!type || d.type === type) && (!clientId || d.clientId === clientId) && (!status || d.status === status))
    .sort((a, b) => (b.issueDate === a.issueDate ? b.createdAt.localeCompare(a.createdAt) : b.issueDate.localeCompare(a.issueDate)));
  res.json(docs);
}));

router.get('/documents/:id', h((req, res) => {
  res.json(getDoc(param(req, 'id')));
}));

router.post('/documents', h((req, res) => {
  const b = (req.body || {}) as Partial<BillingDocument>;
  const type = (b.type || 'invoice') as BillingDocType;
  if (!DOC_TYPES.includes(type)) throw new BillingError(400, `type must be one of ${DOC_TYPES.join(', ')}`);
  if (!b.clientId) throw new BillingError(400, 'clientId is required');
  const doc = createDocument({ ...b, type, clientId: b.clientId, status: b.status === 'pending_review' ? 'pending_review' : undefined }, actorOf(req), orgOf(req));
  if (doc.type === 'invoice') doc.auditFlags = auditDocument(doc);
  audit(req, `${doc.type}_create`, 'billing_document', doc.id, { number: doc.number, clientId: doc.clientId, total: doc.total });
  res.status(201).json(doc);
}));

router.put('/documents/:id', h((req, res) => {
  const doc = getDoc(param(req, 'id'));
  const b = (req.body || {}) as Partial<BillingDocument>;
  if (doc.status === 'void') throw new BillingError(400, 'Void documents cannot be edited');
  if (doc.status === 'converted' || doc.status === 'invoiced') throw new BillingError(400, `A ${doc.status} document cannot be edited`);

  if (b.clientId !== undefined && b.clientId !== doc.clientId) {
    if (doc.amountPaid > 0 || doc.creditsApplied > 0) throw new BillingError(400, 'Cannot change the client after payments or credits were applied');
    const client = store.clients.get(b.clientId);
    if (!client) throw new BillingError(400, 'clientId does not reference an existing client');
    doc.clientId = client.id;
    doc.clientName = client.name;
    if (b.billingEmail === undefined) doc.billingEmail = client.billingEmail || client.contactEmail || undefined;
  }
  if (b.paymentTerms !== undefined && !PAYMENT_TERMS.includes(b.paymentTerms)) throw new BillingError(400, 'invalid paymentTerms');
  const datesChanged = b.issueDate !== undefined || b.paymentTerms !== undefined;
  if (b.issueDate !== undefined) doc.issueDate = toDateStr(b.issueDate, doc.issueDate);
  if (b.paymentTerms !== undefined) doc.paymentTerms = b.paymentTerms;
  if (doc.type === 'invoice') {
    if (b.dueDate !== undefined) doc.dueDate = toDateStr(b.dueDate, doc.dueDate);
    else if (datesChanged) doc.dueDate = addDays(doc.issueDate, termsDays(doc.paymentTerms));
  }
  if (doc.type === 'quote' && b.expiryDate !== undefined) doc.expiryDate = toDateStr(b.expiryDate, doc.expiryDate);
  for (const f of ['billingEmail', 'reference', 'subject', 'notes', 'terms'] as const) {
    if (b[f] !== undefined) doc[f] = b[f] === null ? undefined : String(b[f]);
  }
  if (b.discountPct !== undefined) {
    if (b.discountPct !== null && (!isNum(b.discountPct) || Number(b.discountPct) < 0 || Number(b.discountPct) > 100)) throw new BillingError(400, 'discountPct must be 0-100');
    doc.discountPct = b.discountPct === null ? undefined : Number(b.discountPct);
  }
  if (b.servicePeriod !== undefined) doc.servicePeriod = b.servicePeriod || undefined;
  if (b.lines !== undefined) {
    if (!Array.isArray(b.lines)) throw new BillingError(400, 'lines must be an array');
    doc.lines = b.lines.map((l, i) => normalizeLine(l, i));
    if (doc.type === 'invoice') {
      releaseTimeEntries(doc);
      markTimeEntries(doc);
    }
  }
  computeDocument(doc);
  if (doc.type === 'invoice' && (doc.status === 'draft' || doc.status === 'pending_review')) doc.auditFlags = auditDocument(doc);
  addHistory(doc, actorOf(req), 'updated', Object.keys(b).filter((k) => k !== 'id').join(', '));
  audit(req, `${doc.type}_update`, 'billing_document', doc.id, { number: doc.number, total: doc.total });
  res.json(doc);
}));

function unlinkConversion(doc: BillingDocument, actor: string) {
  if (!doc.convertedFromId) return;
  const src = store.billingDocuments.get(doc.convertedFromId);
  if (!src) return;
  src.convertedToIds = (src.convertedToIds || []).filter((id) => id !== doc.id);
  if (!src.convertedToIds.length) {
    if (src.type === 'quote' && src.status === 'converted') src.status = 'accepted';
    if (src.type === 'sales_order' && src.status === 'invoiced') src.status = 'confirmed';
  }
  addHistory(src, actor, 'conversion_removed', `${doc.number} was deleted`);
}

router.delete('/documents/:id', h((req, res) => {
  const doc = getDoc(param(req, 'id'));
  const deletable = doc.status === 'draft' || doc.status === 'pending_review' ||
    (doc.type === 'credit_note' && doc.status === 'open' && !doc.creditsApplied);
  if (!deletable) throw new BillingError(400, `Only draft documents can be deleted — void this ${doc.status} document instead`);
  releaseTimeEntries(doc);
  reverseCreditApplications(doc, actorOf(req));
  unlinkConversion(doc, actorOf(req));
  for (const c of store.contracts.values()) if (c.lastInvoiceId === doc.id) delete c.lastInvoiceId;
  store.billingDocuments.delete(doc.id);
  audit(req, `${doc.type}_delete`, 'billing_document', doc.id, { number: doc.number });
  res.json({ success: true });
}));

router.post('/documents/:id/status', h((req, res) => {
  const doc = getDoc(param(req, 'id'));
  const status = req.body?.status as BillingDocStatus;
  const note = req.body?.note ? String(req.body.note) : undefined;
  if (!status || !STATUSES_BY_TYPE[doc.type].includes(status)) {
    throw new BillingError(400, `status must be one of ${STATUSES_BY_TYPE[doc.type].join(', ')} for a ${doc.type}`);
  }
  if (doc.status === status) {
    res.json(doc);
    return;
  }
  if (doc.status === 'void') throw new BillingError(400, 'Void documents cannot change status');
  const actor = actorOf(req);
  const prev = doc.status;

  if (status === 'void') {
    if (doc.amountPaid > 0) throw new BillingError(400, 'Void the payments applied to this document first');
    releaseTimeEntries(doc);
    reverseCreditApplications(doc, actor);
    unlinkConversion(doc, actor);
  } else if (doc.type === 'invoice' && prev === 'pending_review' && status !== 'draft') {
    throw new BillingError(409, 'This invoice is pending review — approve it in Invoice Audit first');
  } else if (doc.type === 'invoice' && (status === 'draft' || status === 'pending_review') && (doc.amountPaid > 0 || doc.creditsApplied > 0)) {
    throw new BillingError(400, 'Invoices with payments or credits cannot return to draft');
  }
  doc.status = status;
  if (status === 'sent' && !doc.sentAt) doc.sentAt = nowIso();
  computeDocument(doc);
  addHistory(doc, actor, 'status_changed', `${prev} → ${doc.status}${note ? ` — ${note}` : ''}`);
  audit(req, `${doc.type}_status`, 'billing_document', doc.id, { number: doc.number, from: prev, to: doc.status, note });
  res.json(doc);
}));

router.post('/documents/:id/convert', h((req, res) => {
  const src = getDoc(param(req, 'id'));
  const to = req.body?.to as 'sales_order' | 'invoice';
  if (to !== 'sales_order' && to !== 'invoice') throw new BillingError(400, "to must be 'sales_order' or 'invoice'");
  if (src.type === 'quote') {
    if (!['draft', 'sent', 'accepted'].includes(src.status)) throw new BillingError(400, `A ${src.status} quote cannot be converted`);
  } else if (src.type === 'sales_order') {
    if (to !== 'invoice') throw new BillingError(400, 'Sales orders can only be converted to invoices');
    if (!['draft', 'confirmed'].includes(src.status)) throw new BillingError(400, `A ${src.status} sales order cannot be converted`);
  } else {
    throw new BillingError(400, 'Only quotes and sales orders can be converted');
  }
  const actor = actorOf(req);
  const created = createDocument(
    {
      type: to,
      clientId: src.clientId,
      billingEmail: src.billingEmail,
      reference: src.reference,
      subject: src.subject,
      discountPct: src.discountPct,
      notes: src.notes,
      terms: src.terms,
      convertedFromId: src.id,
      paymentTerms: src.paymentTerms,
      lines: src.lines.map((l) => ({ ...l, id: undefined as unknown as string }))
    },
    actor,
    orgOf(req),
    `Converted from ${src.number}`
  );
  src.convertedToIds = [...(src.convertedToIds || []), created.id];
  if (src.type === 'quote') src.status = 'converted';
  if (src.type === 'sales_order') src.status = 'invoiced';
  addHistory(src, actor, 'converted', `Converted to ${created.number}`);
  if (created.type === 'invoice') created.auditFlags = auditDocument(created);
  audit(req, `${src.type}_convert`, 'billing_document', src.id, { from: src.number, to: created.number, toType: to });
  res.status(201).json(created);
}));

router.post('/documents/:id/duplicate', h((req, res) => {
  const src = getDoc(param(req, 'id'));
  const created = createDocument(
    {
      type: src.type,
      clientId: src.clientId,
      billingEmail: src.billingEmail,
      reference: src.reference,
      subject: src.subject,
      discountPct: src.discountPct,
      notes: src.notes,
      terms: src.terms,
      paymentTerms: src.paymentTerms,
      // Never duplicate billed time links (would double-bill) — copies become manual lines.
      lines: src.lines.map((l) => {
        const { sourceRef, ...rest } = l;
        const keepRef = l.source !== 'time_entry' && sourceRef && !sourceRef.timeEntryIds ? { sourceRef } : {};
        return { ...rest, ...keepRef, id: undefined as unknown as string, source: l.source === 'time_entry' ? 'manual' : l.source };
      })
    },
    actorOf(req),
    orgOf(req),
    `Duplicated from ${src.number}`
  );
  audit(req, `${src.type}_duplicate`, 'billing_document', created.id, { from: src.number, number: created.number });
  res.status(201).json(created);
}));

router.post('/documents/:id/send', h(async (req, res) => {
  const doc = getDoc(param(req, 'id'));
  const { to, cc, subject, message } = req.body || {};
  const result = await deliverDocument(doc, { to, cc, subject, message }, actorOf(req));
  audit(req, `${doc.type}_send`, 'billing_document', doc.id, { number: doc.number, emailed: result.sent, to: to || doc.billingEmail });
  res.json(result);
}));

router.post('/documents/:id/approve', h(async (req, res) => {
  const doc = getDoc(param(req, 'id'));
  if (doc.type !== 'invoice') throw new BillingError(400, 'Only invoices go through audit approval');
  if (doc.status !== 'draft' && doc.status !== 'pending_review') throw new BillingError(400, `Invoice is already ${doc.status}`);
  const actor = actorOf(req);
  doc.auditFlags = auditDocument(doc);
  doc.auditApprovedBy = actor;
  doc.auditApprovedAt = nowIso();
  addHistory(doc, actor, 'approved', doc.auditFlags.length ? `Approved with ${doc.auditFlags.length} open flag(s)` : 'Approved — no audit flags');
  if (req.body?.send) {
    await deliverDocument(doc, {}, actor, true);
  } else {
    doc.status = 'sent';
    computeDocument(doc);
  }
  // Contracts with autoSend email immediately after approval.
  const contract = doc.contractId ? store.contracts.get(doc.contractId) : undefined;
  if (!req.body?.send && contract?.autoSend && !doc.sentAt) await deliverDocument(doc, {}, actor, true);
  audit(req, 'invoice_approve', 'billing_document', doc.id, { number: doc.number, send: !!req.body?.send, flags: doc.auditFlags.map((f) => f.code) });
  res.json(doc);
}));

router.post('/documents/:id/reaudit', h((req, res) => {
  const doc = getDoc(param(req, 'id'));
  computeDocument(doc);
  doc.auditFlags = auditDocument(doc);
  doc.updatedAt = nowIso();
  audit(req, 'invoice_reaudit', 'billing_document', doc.id, { number: doc.number, flags: doc.auditFlags.map((f) => f.code) });
  res.json(doc);
}));

router.post('/documents/:id/apply-audit-fixes', h((req, res) => {
  const doc = getDoc(param(req, 'id'));
  if (doc.status !== 'draft' && doc.status !== 'pending_review') throw new BillingError(400, 'Audit fixes can only be applied to draft or pending-review invoices');
  const changed = applyAuditFixes(doc);
  addHistory(doc, actorOf(req), 'audit_fixes_applied', `${changed} line(s) updated to live counts`);
  audit(req, 'invoice_apply_audit_fixes', 'billing_document', doc.id, { number: doc.number, changed });
  res.json(doc);
}));

router.post('/documents/:id/apply-credit', h((req, res) => {
  const invoice = getDoc(param(req, 'id'));
  const { creditNoteId, amount } = req.body || {};
  if (!creditNoteId) throw new BillingError(400, 'creditNoteId is required');
  const cn = store.billingDocuments.get(String(creditNoteId));
  if (!cn) throw new BillingError(404, 'Credit note not found');
  const app = applyCredit(invoice, cn, Number(amount), actorOf(req));
  audit(req, 'credit_apply', 'billing_document', invoice.id, { invoice: invoice.number, creditNote: cn.number, amount: app.amount });
  res.json(invoice);
}));

router.post('/documents/:id/stripe-link', h(async (req, res) => {
  const doc = getDoc(param(req, 'id'));
  const url = await createCheckoutSession(doc);
  addHistory(doc, actorOf(req), 'stripe_link_created');
  audit(req, 'invoice_stripe_link', 'billing_document', doc.id, { number: doc.number });
  res.json({ url });
}));

// ---------------------------------------------------------------------------
// Invoice audit queue
// ---------------------------------------------------------------------------
router.get('/audit', h((_req, res) => {
  const docs = Array.from(store.billingDocuments.values())
    .filter((d) => d.type === 'invoice' && (d.status === 'pending_review' || d.status === 'draft'))
    .map((d) => {
      d.auditFlags = auditDocument(d);
      return d;
    })
    .sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'pending_review' ? -1 : 1));
  res.json(docs);
}));

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
router.get('/payments', h((req, res) => {
  const clientId = q(req, 'clientId');
  res.json(
    Array.from(store.billingPayments.values())
      .filter((p) => !clientId || p.clientId === clientId)
      .sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
  );
}));

router.post('/payments', h((req, res) => {
  const b = req.body || {};
  if (!b.clientId) throw new BillingError(400, 'clientId is required');
  const payment = recordPayment(
    { clientId: b.clientId, amount: b.amount, date: b.date, method: b.method, reference: b.reference, notes: b.notes, allocations: b.allocations || [] },
    actorOf(req),
    orgOf(req)
  );
  audit(req, 'payment_create', 'billing_payment', payment.id, { number: payment.number, amount: payment.amount, allocations: payment.allocations });
  res.status(201).json(payment);
}));

router.post('/payments/:id/void', h((req, res) => {
  const p = store.billingPayments.get(param(req, 'id'));
  if (!p) throw new BillingError(404, 'Payment not found');
  voidPayment(p, actorOf(req));
  audit(req, 'payment_void', 'billing_payment', p.id, { number: p.number, amount: p.amount });
  res.json(p);
}));

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
const FREQS: BillingFrequency[] = ['monthly', 'quarterly', 'semiannually', 'annually'];
const C_STATUSES: ContractStatus[] = ['draft', 'active', 'paused', 'expired', 'cancelled'];
const Q_MODES: ContractQuantityMode[] = ['fixed', 'device_count', 'user_count'];

function normalizeContractLine(raw: Partial<ContractLine>, idx: number): ContractLine {
  if (!raw || typeof raw !== 'object') throw new BillingError(400, `Contract line ${idx + 1} is invalid`);
  const item = raw.itemId ? store.catalogItems.get(raw.itemId) : undefined;
  const name = String(raw.name ?? item?.name ?? '').trim();
  if (!name) throw new BillingError(400, `Contract line ${idx + 1}: name is required`);
  const quantityMode = (raw.quantityMode || 'fixed') as ContractQuantityMode;
  if (!Q_MODES.includes(quantityMode)) throw new BillingError(400, `Contract line ${idx + 1}: quantityMode must be ${Q_MODES.join(', ')}`);
  const unitPrice = raw.unitPrice === undefined ? Number(item?.unitPrice ?? NaN) : Number(raw.unitPrice);
  if (!Number.isFinite(unitPrice)) throw new BillingError(400, `Contract line ${idx + 1}: unitPrice must be a number`);
  if (raw.fixedQuantity !== undefined && raw.fixedQuantity !== null && !isNum(raw.fixedQuantity)) throw new BillingError(400, `Contract line ${idx + 1}: fixedQuantity must be a number`);
  if (raw.minimumQuantity !== undefined && raw.minimumQuantity !== null && !isNum(raw.minimumQuantity)) throw new BillingError(400, `Contract line ${idx + 1}: minimumQuantity must be a number`);
  const f = raw.deviceFilter;
  return {
    id: raw.id || newId('cl'),
    ...(raw.itemId ? { itemId: raw.itemId } : {}),
    name,
    ...(raw.description ?? item?.description ? { description: raw.description ?? item?.description } : {}),
    quantityMode,
    ...(quantityMode === 'fixed' ? { fixedQuantity: raw.fixedQuantity === undefined || raw.fixedQuantity === null ? 1 : Number(raw.fixedQuantity) } : {}),
    ...(raw.minimumQuantity !== undefined && raw.minimumQuantity !== null ? { minimumQuantity: Number(raw.minimumQuantity) } : {}),
    ...(quantityMode === 'device_count'
      ? { deviceFilter: { os: Array.isArray(f?.os) ? f!.os : [], includeMdm: !!f?.includeMdm, includeInactive: !!f?.includeInactive } }
      : {}),
    ...(raw.unit ?? item?.unit ? { unit: raw.unit ?? item?.unit } : {}),
    unitPrice,
    taxable: raw.taxable === undefined ? !!item?.taxable : !!raw.taxable
  };
}

function applyContractFields(c: Contract, b: Partial<Contract>, isCreate: boolean) {
  if (b.clientId !== undefined) {
    const client = store.clients.get(b.clientId);
    if (!client) throw new BillingError(400, 'clientId does not reference an existing client');
    c.clientId = client.id;
    c.clientName = client.name;
  }
  if (b.name !== undefined) {
    if (!String(b.name).trim()) throw new BillingError(400, 'name cannot be empty');
    c.name = String(b.name).trim();
  }
  if (b.status !== undefined) {
    if (!C_STATUSES.includes(b.status)) throw new BillingError(400, `status must be one of ${C_STATUSES.join(', ')}`);
    c.status = b.status;
  }
  if (b.billingFrequency !== undefined) {
    if (!FREQS.includes(b.billingFrequency)) throw new BillingError(400, `billingFrequency must be one of ${FREQS.join(', ')}`);
    c.billingFrequency = b.billingFrequency;
  }
  if (b.paymentTerms !== undefined) {
    if (!PAYMENT_TERMS.includes(b.paymentTerms)) throw new BillingError(400, 'invalid paymentTerms');
    c.paymentTerms = b.paymentTerms;
  }
  if (b.startDate !== undefined) c.startDate = toDateStr(b.startDate, c.startDate);
  if (b.endDate !== undefined) c.endDate = b.endDate ? toDateStr(b.endDate) : undefined;
  if (b.billingDay !== undefined) c.billingDay = clampBillingDay(b.billingDay);
  for (const f of ['autoRenew', 'billInAdvance', 'requireReview', 'autoSend'] as const) if (b[f] !== undefined) c[f] = !!b[f];
  if (b.slaTier !== undefined) c.slaTier = b.slaTier || undefined;
  if (b.notes !== undefined) c.notes = b.notes || undefined;
  for (const f of ['includedHoursPerPeriod', 'overageHourlyRate'] as const) {
    if (b[f] === undefined) continue;
    if (b[f] === null || (b[f] as unknown) === '') { delete c[f]; continue; }
    if (!isNum(b[f]) || Number(b[f]) < 0) throw new BillingError(400, `${f} must be a non-negative number`);
    c[f] = Number(b[f]);
  }
  if (b.lines !== undefined) {
    if (!Array.isArray(b.lines)) throw new BillingError(400, 'lines must be an array');
    c.lines = b.lines.map((l, i) => normalizeContractLine(l, i));
  }
  if (b.nextInvoiceDate) c.nextInvoiceDate = toDateStr(b.nextInvoiceDate, c.nextInvoiceDate);
  else if (isCreate || ((b.startDate !== undefined || b.billingDay !== undefined || b.billInAdvance !== undefined || b.billingFrequency !== undefined) && !c.lastInvoicedAt)) {
    c.nextInvoiceDate = initialNextInvoiceDate(c);
  }
  if (c.endDate && c.endDate < c.startDate) throw new BillingError(400, 'endDate must be after startDate');
}

router.get('/contracts', h((req, res) => {
  const clientId = q(req, 'clientId');
  res.json(
    Array.from(store.contracts.values())
      .filter((c) => !clientId || c.clientId === clientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(decorateContract)
  );
}));

router.get('/contracts/:id', h((req, res) => {
  const c = store.contracts.get(param(req, 'id'));
  if (!c) throw new BillingError(404, 'Contract not found');
  res.json(decorateContract(c));
}));

router.post('/contracts', h((req, res) => {
  const b = (req.body || {}) as Partial<Contract>;
  if (!b.clientId) throw new BillingError(400, 'clientId is required');
  if (!b.name || !String(b.name).trim()) throw new BillingError(400, 'name is required');
  const s = store.billingSettings;
  const now = nowIso();
  const c: Contract = {
    id: newId('ctr'),
    orgId: orgOf(req),
    number: '',
    clientId: '',
    clientName: '',
    name: '',
    status: 'active',
    startDate: toDateStr(b.startDate),
    autoRenew: true,
    billingFrequency: 'monthly',
    billingDay: 1,
    billInAdvance: true,
    nextInvoiceDate: '',
    paymentTerms: s.defaultPaymentTerms || 'net_30',
    requireReview: true,
    autoSend: false,
    lines: [],
    createdAt: now,
    updatedAt: now
  };
  applyContractFields(c, b, true);
  c.number = nextNumber('contract');
  store.contracts.set(c.id, c);
  audit(req, 'contract_create', 'contract', c.id, { number: c.number, clientId: c.clientId, name: c.name });
  res.status(201).json(decorateContract(c));
}));

router.put('/contracts/:id', h((req, res) => {
  const c = store.contracts.get(param(req, 'id'));
  if (!c) throw new BillingError(404, 'Contract not found');
  applyContractFields(c, req.body || {}, false);
  c.updatedAt = nowIso();
  audit(req, 'contract_update', 'contract', c.id, { number: c.number, fields: Object.keys(req.body || {}) });
  res.json(decorateContract(c));
}));

router.delete('/contracts/:id', h((req, res) => {
  const id = param(req, 'id');
  const c = store.contracts.get(id);
  if (!c) throw new BillingError(404, 'Contract not found');
  const invoiced = Array.from(store.billingDocuments.values()).some((d) => d.contractId === id && d.status !== 'void');
  if (invoiced) {
    // Keep history intact: cancel instead of hard delete when invoices reference it.
    c.status = 'cancelled';
    c.updatedAt = nowIso();
    audit(req, 'contract_cancel', 'contract', id, { number: c.number, reason: 'has invoices' });
  } else {
    store.contracts.delete(id);
    audit(req, 'contract_delete', 'contract', id, { number: c.number });
  }
  res.json({ success: true });
}));

router.get('/contracts/:id/preview', h((req, res) => {
  const c = store.contracts.get(param(req, 'id'));
  if (!c) throw new BillingError(404, 'Contract not found');
  res.json(previewContract(c));
}));

router.post('/contracts/:id/generate', h(async (req, res) => {
  const c = store.contracts.get(param(req, 'id'));
  if (!c) throw new BillingError(404, 'Contract not found');
  if (c.status === 'cancelled' || c.status === 'expired') throw new BillingError(400, `Contract is ${c.status}`);
  if (!c.lines.length) throw new BillingError(400, 'Contract has no lines');
  const sender = (doc: BillingDocument, actor: string) => deliverDocument(doc, {}, actor, true);
  const r = generateContractInvoice(c, actorOf(req), sender);
  if (r.duplicateOf) {
    audit(req, 'contract_invoice_duplicate_skipped', 'contract', c.id, { existing: r.duplicateOf.number });
    throw new BillingError(409, `Invoice ${r.duplicateOf.number} already covers this period — advanced next invoice date to ${c.nextInvoiceDate}`, {
      existingId: r.duplicateOf.id
    });
  }
  if (r.sendPromise) await r.sendPromise;
  audit(req, 'contract_invoice_generate', 'billing_document', r.invoice!.id, { contract: c.number, number: r.invoice!.number, total: r.invoice!.total });
  res.status(201).json(r.invoice);
}));

export default router;
