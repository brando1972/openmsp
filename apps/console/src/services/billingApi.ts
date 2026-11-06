/**
 * billingApi — typed client for Client Management & Billing
 * (`/api/v1/clients/*`, `/api/v1/billing/*`, `/api/v1/public/invoices/*`).
 * This file is the frontend half of the API contract; the Express routes in
 * apps/api/src/routes/billing.ts, clients.ts and publicInvoices.ts implement it.
 */
import { request, API_V1 } from './api';
import type {
  ClientTenant,
  ClientOverview,
  ClientFinancialSummary,
  BillingSettings,
  TaxRate,
  CatalogItem,
  BillingDocument,
  BillingDocType,
  BillingDocStatus,
  BillingPayment,
  Contract,
  ContractLine,
  PublicInvoiceView,
  PaymentAllocation,
  PaymentMethod
} from '@openmsp/api-types';

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body)
});

const qs = (params: Record<string, string | undefined>) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== 'all');
  return p.length ? `?${p.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')}` : '';
};

export interface BillingSummary {
  outstanding: number;
  overdue: number;
  overdueCount: number;
  draftCount: number;
  pendingReviewCount: number;
  openQuotesTotal: number;
  openQuotesCount: number;
  mrr: number;
  activeContracts: number;
  invoicedThisMonth: number;
  collectedThisMonth: number;
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number };
  topClientsByOutstanding: { clientId: string; clientName: string; outstanding: number }[];
}

export interface SendDocumentRequest {
  to?: string;
  cc?: string;
  subject?: string;
  message?: string;
}

export interface SendDocumentResponse {
  sent: boolean;               // true if delivered via configured email provider
  publicUrl: string;           // client-facing invoice/quote page
  mailto?: string;             // fallback when no email provider configured
  document: BillingDocument;
  error?: string;
}

export interface RecordPaymentRequest {
  clientId: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  allocations: Omit<PaymentAllocation, 'invoiceNumber'>[];
}

export interface ContractPreview {
  contract: Contract;
  lines: ContractLine[];        // with currentQuantity/currentAmount
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  taxTotal: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
export const clientsApi = {
  list: () => request<ClientTenant[]>('/clients'),
  get: (id: string) => request<ClientTenant>(`/clients/${id}`),
  create: (data: Partial<ClientTenant>) => request<ClientTenant>('/clients', json('POST', data)),
  update: (id: string, data: Partial<ClientTenant>) => request<ClientTenant>(`/clients/${id}`, json('PUT', data)),
  archive: (id: string) => request<ClientTenant>(`/clients/${id}`, json('DELETE')),
  overview: (id: string) => request<ClientOverview>(`/clients/${id}/overview`),
  financials: () => request<ClientFinancialSummary[]>('/clients/financials'),
  /** Create a draft invoice from unbilled billable ticket time (all, or the given entry ids). */
  invoiceUnbilledTime: (id: string, timeEntryIds?: string[]) =>
    request<BillingDocument>(`/clients/${id}/invoice-time`, json('POST', { timeEntryIds }))
};

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
export const billingApi = {
  summary: () => request<BillingSummary>('/billing/summary'),

  getSettings: () => request<BillingSettings>('/billing/settings'),
  updateSettings: (data: Partial<BillingSettings>) => request<BillingSettings>('/billing/settings', json('PUT', data)),

  taxRates: () => request<TaxRate[]>('/billing/tax-rates'),
  createTaxRate: (data: Partial<TaxRate>) => request<TaxRate>('/billing/tax-rates', json('POST', data)),
  updateTaxRate: (id: string, data: Partial<TaxRate>) => request<TaxRate>(`/billing/tax-rates/${id}`, json('PUT', data)),
  deleteTaxRate: (id: string) => request<{ success: boolean }>(`/billing/tax-rates/${id}`, json('DELETE')),

  items: () => request<CatalogItem[]>('/billing/items'),
  createItem: (data: Partial<CatalogItem>) => request<CatalogItem>('/billing/items', json('POST', data)),
  updateItem: (id: string, data: Partial<CatalogItem>) => request<CatalogItem>(`/billing/items/${id}`, json('PUT', data)),
  deleteItem: (id: string) => request<{ success: boolean }>(`/billing/items/${id}`, json('DELETE')),

  documents: (filter: { type?: BillingDocType; clientId?: string; status?: string } = {}) =>
    request<BillingDocument[]>(`/billing/documents${qs(filter)}`),
  document: (id: string) => request<BillingDocument>(`/billing/documents/${id}`),
  createDocument: (data: Partial<BillingDocument>) => request<BillingDocument>('/billing/documents', json('POST', data)),
  updateDocument: (id: string, data: Partial<BillingDocument>) => request<BillingDocument>(`/billing/documents/${id}`, json('PUT', data)),
  deleteDocument: (id: string) => request<{ success: boolean }>(`/billing/documents/${id}`, json('DELETE')),
  setStatus: (id: string, status: BillingDocStatus, note?: string) =>
    request<BillingDocument>(`/billing/documents/${id}/status`, json('POST', { status, note })),
  convert: (id: string, to: 'sales_order' | 'invoice') =>
    request<BillingDocument>(`/billing/documents/${id}/convert`, json('POST', { to })),
  duplicate: (id: string) => request<BillingDocument>(`/billing/documents/${id}/duplicate`, json('POST')),
  send: (id: string, data: SendDocumentRequest = {}) =>
    request<SendDocumentResponse>(`/billing/documents/${id}/send`, json('POST', data)),
  approve: (id: string, sendAfter = false) =>
    request<BillingDocument>(`/billing/documents/${id}/approve`, json('POST', { send: sendAfter })),
  reaudit: (id: string) => request<BillingDocument>(`/billing/documents/${id}/reaudit`, json('POST')),
  /** Apply audit suggestions (e.g. update device-count lines to live counts). */
  applyAuditFixes: (id: string) => request<BillingDocument>(`/billing/documents/${id}/apply-audit-fixes`, json('POST')),
  applyCredit: (invoiceId: string, creditNoteId: string, amount: number) =>
    request<BillingDocument>(`/billing/documents/${invoiceId}/apply-credit`, json('POST', { creditNoteId, amount })),
  stripeLink: (id: string) => request<{ url: string }>(`/billing/documents/${id}/stripe-link`, json('POST')),

  auditQueue: () => request<BillingDocument[]>('/billing/audit'),

  payments: (clientId?: string) => request<BillingPayment[]>(`/billing/payments${qs({ clientId })}`),
  recordPayment: (data: RecordPaymentRequest) => request<BillingPayment>('/billing/payments', json('POST', data)),
  voidPayment: (id: string) => request<BillingPayment>(`/billing/payments/${id}/void`, json('POST')),

  contracts: (clientId?: string) => request<Contract[]>(`/billing/contracts${qs({ clientId })}`),
  contract: (id: string) => request<Contract>(`/billing/contracts/${id}`),
  createContract: (data: Partial<Contract>) => request<Contract>('/billing/contracts', json('POST', data)),
  updateContract: (id: string, data: Partial<Contract>) => request<Contract>(`/billing/contracts/${id}`, json('PUT', data)),
  deleteContract: (id: string) => request<{ success: boolean }>(`/billing/contracts/${id}`, json('DELETE')),
  previewContract: (id: string) => request<ContractPreview>(`/billing/contracts/${id}/preview`),
  generateInvoice: (id: string) => request<BillingDocument>(`/billing/contracts/${id}/generate`, json('POST'))
};

// ---------------------------------------------------------------------------
// Public (no auth) — client-facing invoice / quote page
// ---------------------------------------------------------------------------
export const publicInvoiceApi = {
  get: async (token: string): Promise<PublicInvoiceView> => {
    const res = await fetch(`${API_V1}/public/invoices/${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    return res.json();
  },
  checkout: async (token: string): Promise<{ url: string }> => {
    const res = await fetch(`${API_V1}/public/invoices/${encodeURIComponent(token)}/checkout`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    return res.json();
  },
  respondToQuote: async (token: string, accept: boolean): Promise<PublicInvoiceView> => {
    const res = await fetch(`${API_V1}/public/invoices/${encodeURIComponent(token)}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept })
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    return res.json();
  }
};
