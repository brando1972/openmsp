import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { BillingDocType, BillingSettings, CatalogItem, ClientTenant, TaxRate, BillingLineItem } from '@openmsp/api-types';
import { useApp } from './AppContext';
import { billingApi, clientsApi } from '../services/billingApi';
import { DOC_LABEL } from '../components/billing/format';

/**
 * BillingContext — shared state + cross-navigation for Client Management.
 *
 * Keeps reference data (settings, tax rates, catalog, clients-with-billing-profile)
 * and the "where am I" state for the clients & billing workspaces so any screen
 * (Client 360, invoices, contracts, audit…) can deep-link to any other.
 */

export type DocEditorState =
  | { mode: 'new'; type: BillingDocType; clientId?: string; lines?: BillingLineItem[]; contractId?: string }
  | { mode: 'edit'; docId: string };

interface BillingContextType {
  settings: BillingSettings | null;
  taxRates: TaxRate[];
  items: CatalogItem[];
  billingClients: ClientTenant[];
  refreshReference: () => Promise<void>;
  refreshClients: () => Promise<void>;
  referenceError: string | null;

  // navigation
  clientDetailId: string | null;
  openClient: (id: string) => void;
  closeClient: () => void;
  docDetailId: string | null;
  docSub: string | null;
  openDocument: (id: string, type?: BillingDocType) => void;
  closeDocument: () => void;
  editor: DocEditorState | null;
  newDocument: (type: BillingDocType, prefill?: { clientId?: string; lines?: BillingLineItem[] }) => void;
  editDocument: (id: string, type?: BillingDocType) => void;
  closeEditor: () => void;
  contractEditorId: string | 'new' | null;
  contractPrefillClientId: string | null;
  openContract: (id: string | 'new', clientId?: string) => void;
  closeContract: () => void;
  goBilling: (sub: string) => void;
  /** bump to make lists re-fetch after a mutation elsewhere */
  version: number;
  bump: () => void;
}

const Ctx = createContext<BillingContextType | null>(null);

export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setActiveTab, setActiveSubRailView, activeSubRailView, isAuthenticated } = useApp();
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [billingClients, setBillingClients] = useState<ClientTenant[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  const [clientDetailId, setClientDetailId] = useState<string | null>(null);
  const [docDetailId, setDocDetailId] = useState<string | null>(null);
  // the billing sub-view a document/editor was opened in; switching sections closes it
  const [docSub, setDocSub] = useState<string | null>(null);
  const [editor, setEditor] = useState<DocEditorState | null>(null);
  const [contractEditorId, setContractEditorId] = useState<string | 'new' | null>(null);
  const [contractPrefillClientId, setContractPrefillClientId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const refreshClients = useCallback(async () => {
    try {
      setBillingClients(await clientsApi.list());
    } catch {
      /* surfaced by the screens that need it */
    }
  }, []);

  const refreshReference = useCallback(async () => {
    try {
      const [s, t, i] = await Promise.all([billingApi.getSettings(), billingApi.taxRates(), billingApi.items()]);
      setSettings(s);
      setTaxRates(t);
      setItems(i);
      setReferenceError(null);
    } catch (e) {
      setReferenceError((e as Error).message);
    }
    await refreshClients();
  }, [refreshClients]);

  useEffect(() => {
    if (isAuthenticated) void refreshReference();
  }, [isAuthenticated, refreshReference]);

  const goBilling = useCallback(
    (sub: string) => {
      setActiveTab('billing');
      setActiveSubRailView(sub);
    },
    [setActiveTab, setActiveSubRailView]
  );

  const openClient = useCallback(
    (id: string) => {
      setClientDetailId(id);
      setActiveTab('clients');
      setActiveSubRailView('clients');
    },
    [setActiveTab, setActiveSubRailView]
  );

  const openDocument = useCallback(
    (id: string, type?: BillingDocType) => {
      setEditor(null);
      setDocDetailId(id);
      setDocSub(type ? DOC_LABEL[type].sub : activeSubRailView);
      if (type) goBilling(DOC_LABEL[type].sub);
    },
    [goBilling, activeSubRailView]
  );

  const newDocument = useCallback(
    (type: BillingDocType, prefill?: { clientId?: string; lines?: BillingLineItem[] }) => {
      setDocDetailId(null);
      setEditor({ mode: 'new', type, ...prefill });
      setDocSub(DOC_LABEL[type].sub);
      goBilling(DOC_LABEL[type].sub);
    },
    [goBilling]
  );

  const editDocument = useCallback(
    (id: string, type?: BillingDocType) => {
      setDocDetailId(null);
      setEditor({ mode: 'edit', docId: id });
      setDocSub(type ? DOC_LABEL[type].sub : activeSubRailView);
      if (type) goBilling(DOC_LABEL[type].sub);
    },
    [goBilling, activeSubRailView]
  );

  const openContract = useCallback(
    (id: string | 'new', clientId?: string) => {
      setContractPrefillClientId(clientId || null);
      setContractEditorId(id);
      goBilling('contracts');
    },
    [goBilling]
  );

  const value: BillingContextType = {
    settings,
    taxRates,
    items,
    billingClients,
    refreshReference,
    refreshClients,
    referenceError,
    clientDetailId,
    openClient,
    closeClient: () => setClientDetailId(null),
    docDetailId,
    docSub,
    openDocument,
    closeDocument: () => setDocDetailId(null),
    editor,
    newDocument,
    editDocument,
    closeEditor: () => setEditor(null),
    contractEditorId,
    contractPrefillClientId,
    openContract,
    closeContract: () => {
      setContractEditorId(null);
      setContractPrefillClientId(null);
    },
    goBilling,
    version,
    bump
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useBilling = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useBilling must be used inside <BillingProvider>');
  return c;
};
