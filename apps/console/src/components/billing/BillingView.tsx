import React, { useEffect } from 'react';
import type { BillingDocType } from '@openmsp/api-types';
import { useApp } from '../../data/AppContext';
import { useBilling } from '../../data/BillingContext';
import { BillingOverview } from './BillingOverview';
import { DocumentList } from './DocumentList';
import { DocumentEditor } from './DocumentEditor';
import { DocumentDetail } from './DocumentDetail';
import { PaymentsView } from './PaymentsView';
import { ContractsView } from './ContractsView';
import { InvoiceAuditView } from './InvoiceAuditView';
import { ItemsView } from './ItemsView';
import { BillingSettingsView } from './BillingSettingsView';

const SUB_TO_TYPE: Record<string, BillingDocType> = {
  quotes: 'quote',
  'sales-orders': 'sales_order',
  invoices: 'invoice',
  'credit-notes': 'credit_note'
};

/** BillingView — routes the "billing" tab's sub-views (see RoadmapNav → Client Management). */
export const BillingView: React.FC = () => {
  const { activeSubRailView, setActiveSubRailView } = useApp();
  const { editor, docDetailId, docSub, closeDocument, closeEditor, contractEditorId, closeContract } = useBilling();
  const sub = activeSubRailView || 'billing-overview';
  const docType = SUB_TO_TYPE[sub];

  // Switching to another section (e.g. Invoices → Quotes) closes any open document/editor.
  useEffect(() => {
    if ((docDetailId || editor) && docSub && docSub !== sub) {
      closeDocument();
      closeEditor();
    }
    if (contractEditorId && sub !== 'contracts') closeContract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  useEffect(() => {
    if (!activeSubRailView || !KNOWN.has(activeSubRailView)) setActiveSubRailView('billing-overview');
  }, [activeSubRailView, setActiveSubRailView]);

  let body: React.ReactNode;
  if (docType) {
    if (editor) body = <DocumentEditor key={editor.mode === 'edit' ? editor.docId : `new-${editor.type}`} />;
    else if (docDetailId) body = <DocumentDetail key={docDetailId} id={docDetailId} />;
    else body = <DocumentList type={docType} />;
  } else if (sub === 'payments') body = <PaymentsView />;
  else if (sub === 'contracts') body = <ContractsView />;
  else if (sub === 'invoice-audit') body = <InvoiceAuditView />;
  else if (sub === 'items') body = <ItemsView />;
  else if (sub === 'billing-settings') body = <BillingSettingsView />;
  else body = <BillingOverview />;

  return <div className="flex-1 flex flex-col min-w-0 bg-[#f4f6f8] text-[#1a1a24] overflow-hidden">{body}</div>;
};

const KNOWN = new Set([
  'billing-overview',
  'quotes',
  'sales-orders',
  'invoices',
  'credit-notes',
  'payments',
  'contracts',
  'invoice-audit',
  'items',
  'billing-settings'
]);

export default BillingView;
