import React, { useState } from 'react';
import type { CatalogItem, CatalogItemType, TaxRate } from '@openmsp/api-types';
import { Tags, Plus, Pencil, Trash2, Percent, Search } from 'lucide-react';
import { billingApi } from '../../services/billingApi';
import { useBilling } from '../../data/BillingContext';
import { PageHeader, Card, Table, Th, Td, btn, input, Field, Modal, ErrorBanner, EmptyState, Toast, Tabs } from './ui';
import { money } from './format';

const TYPE_LABEL: Record<CatalogItemType, string> = {
  service: 'Service (flat)',
  product: 'Product / hardware',
  labor: 'Labor (hourly)',
  per_device: 'Per device',
  per_user: 'Per user'
};
const DEFAULT_UNIT: Record<CatalogItemType, string> = { service: 'mo', product: 'ea', labor: 'hr', per_device: 'device', per_user: 'user' };

/** ItemsView — product & service catalog plus sales tax rates. */
export const ItemsView: React.FC = () => {
  const { items, taxRates, refreshReference, settings } = useBilling();
  const cur = settings?.currency || 'USD';
  const [tab, setTab] = useState<'items' | 'tax'>('items');
  const [editItem, setEditItem] = useState<Partial<CatalogItem> | null>(null);
  const [editTax, setEditTax] = useState<Partial<TaxRate> | null>(null);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<{ m: string; t?: 'ok' | 'err' } | null>(null);

  const shown = items
    .filter((i) => !q || `${i.name} ${i.sku || ''} ${i.description || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader Icon={Tags} tint="#64748b" title="Items & Tax Rates" subtitle="What you sell and how it's taxed">
        {tab === 'items' ? (
          <button className={btn.primary} onClick={() => setEditItem({ type: 'service', taxable: true, active: true, unit: 'mo', unitPrice: 0 })}>
            <Plus className="w-3.5 h-3.5" /> New item
          </button>
        ) : (
          <button className={btn.primary} onClick={() => setEditTax({ active: true, ratePct: 0 })}>
            <Plus className="w-3.5 h-3.5" /> New tax rate
          </button>
        )}
      </PageHeader>
      <Tabs
        tabs={[
          { key: 'items', label: 'Items', count: items.length },
          { key: 'tax', label: 'Tax rates', count: taxRates.length }
        ]}
        active={tab}
        onChange={(k) => setTab(k as 'items' | 'tax')}
      />
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 pb-20 md:pb-6 space-y-4">
        {tab === 'items' ? (
          <Card padded={false}>
            <div className="p-3 border-b border-slate-100">
              <div className="relative max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input className={`${input} pl-8`} placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            {shown.length === 0 ? (
              <EmptyState Icon={Tags} title="No items" body="Add services, hardware, labor rates and per-device / per-user plans." />
            ) : (
              <Table
                head={
                  <>
                    <Th>Item</Th>
                    <Th className="hidden md:table-cell">Type</Th>
                    <Th right>Price</Th>
                    <Th right className="hidden md:table-cell">Cost</Th>
                    <Th right className="hidden lg:table-cell">Margin</Th>
                    <Th>Tax</Th>
                    <Th />
                  </>
                }
              >
                {shown.map((i) => (
                  <tr key={i.id} className={`hover:bg-slate-50 ${i.active ? '' : 'opacity-50'}`}>
                    <Td>
                      <div className="font-semibold text-slate-800">
                        {i.name} {!i.active && <span className="text-[10px] text-slate-400">(inactive)</span>}
                      </div>
                      <div className="text-[10px] text-slate-400">{[i.sku, i.description].filter(Boolean).join(' · ')}</div>
                    </Td>
                    <Td className="hidden md:table-cell text-slate-500">{TYPE_LABEL[i.type]}</Td>
                    <Td right className="font-semibold">
                      {money(i.unitPrice, cur)}
                      {i.unit && <span className="text-slate-400 font-normal">/{i.unit}</span>}
                    </Td>
                    <Td right className="hidden md:table-cell text-slate-500">{i.cost !== undefined ? money(i.cost, cur) : '—'}</Td>
                    <Td right className="hidden lg:table-cell text-slate-500">
                      {i.cost !== undefined && i.unitPrice > 0 ? `${Math.round(((i.unitPrice - i.cost) / i.unitPrice) * 100)}%` : '—'}
                    </Td>
                    <Td className="text-slate-500">{i.taxable ? 'Taxable' : 'Non-taxable'}</Td>
                    <Td right>
                      <button className={btn.ghost} onClick={() => setEditItem(i)} aria-label={`Edit ${i.name}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        ) : (
          <Card padded={false}>
            {taxRates.length === 0 ? (
              <EmptyState Icon={Percent} title="No tax rates" body="Add your state + local sales tax. Mark one as default; lines can override or be non-taxable, and clients can be tax-exempt." />
            ) : (
              <Table
                head={
                  <>
                    <Th>Name</Th>
                    <Th right>Rate</Th>
                    <Th>Default</Th>
                    <Th>Status</Th>
                    <Th />
                  </>
                }
              >
                {taxRates.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <Td className="font-semibold">{t.name}</Td>
                    <Td right>{t.ratePct}%</Td>
                    <Td>{t.isDefault ? <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">DEFAULT</span> : ''}</Td>
                    <Td className="text-slate-500">{t.active ? 'Active' : 'Inactive'}</Td>
                    <Td right>
                      <button className={btn.ghost} onClick={() => setEditTax(t)} aria-label={`Edit ${t.name}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
            <p className="text-[11px] text-slate-500 px-4 py-3 border-t border-slate-100">
              Tax resolves per line: the line's own rate → the client's default rate → the default rate here. Tax-exempt clients are never charged tax.
            </p>
          </Card>
        )}
      </div>

      {editItem && (
        <ItemModal
          item={editItem}
          currency={cur}
          onClose={() => setEditItem(null)}
          onSaved={async (m) => {
            setEditItem(null);
            await refreshReference();
            setToast({ m });
          }}
          onError={(m) => setToast({ m, t: 'err' })}
        />
      )}
      {editTax && (
        <TaxModal
          rate={editTax}
          onClose={() => setEditTax(null)}
          onSaved={async (m) => {
            setEditTax(null);
            await refreshReference();
            setToast({ m });
          }}
        />
      )}
      <Toast message={toast?.m || null} tone={toast?.t} onDone={() => setToast(null)} />
    </>
  );
};

const ItemModal: React.FC<{ item: Partial<CatalogItem>; currency: string; onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void }> = ({ item, onClose, onSaved, onError }) => {
  const [f, setF] = useState<Partial<CatalogItem>>(item);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CatalogItem>(k: K, v: CatalogItem[K]) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name?.trim()) return setError('Name is required.');
    if (!(Number(f.unitPrice) >= 0)) return setError('Price must be zero or more.');
    setBusy(true);
    try {
      if (f.id) await billingApi.updateItem(f.id, f);
      else await billingApi.createItem(f);
      onSaved(f.id ? 'Item updated' : 'Item added');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!f.id) return;
    try {
      await billingApi.deleteItem(f.id);
      onSaved('Item deleted');
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <Modal
      title={f.id ? `Edit ${item.name}` : 'New item'}
      onClose={onClose}
      footer={
        <>
          {f.id && (
            <button className={`${btn.danger} mr-auto`} onClick={remove}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
          <button className={btn.secondary} onClick={onClose}>Cancel</button>
          <button className={btn.primary} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><ErrorBanner error={error} /></div>
        <Field label="Name *" className="col-span-2">
          <input className={input} value={f.name || ''} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Type">
          <select className={input} value={f.type} onChange={(e) => { const t = e.target.value as CatalogItemType; setF((p) => ({ ...p, type: t, unit: p.unit && p.unit !== DEFAULT_UNIT[p.type as CatalogItemType] ? p.unit : DEFAULT_UNIT[t] })); }}>
            {(Object.keys(TYPE_LABEL) as CatalogItemType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </Field>
        <Field label="SKU">
          <input className={input} value={f.sku || ''} onChange={(e) => set('sku', e.target.value)} />
        </Field>
        <Field label="Price">
          <input className={input} type="number" step="0.01" min="0" value={f.unitPrice ?? ''} onChange={(e) => set('unitPrice', Number(e.target.value))} />
        </Field>
        <Field label="Unit">
          <input className={input} value={f.unit || ''} onChange={(e) => set('unit', e.target.value)} placeholder="mo, hr, device, user, ea" />
        </Field>
        <Field label="Your cost" hint="Optional — for margin">
          <input className={input} type="number" step="0.01" min="0" value={f.cost ?? ''} onChange={(e) => set('cost', e.target.value === '' ? undefined : Number(e.target.value))} />
        </Field>
        <div className="flex flex-col justify-end gap-1.5 pb-1">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!f.taxable} onChange={(e) => set('taxable', e.target.checked)} /> Taxable</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.active !== false} onChange={(e) => set('active', e.target.checked)} /> Active</label>
        </div>
        <Field label="Description" className="col-span-2">
          <textarea className={input} rows={2} value={f.description || ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const TaxModal: React.FC<{ rate: Partial<TaxRate>; onClose: () => void; onSaved: (m: string) => void }> = ({ rate, onClose, onSaved }) => {
  const [f, setF] = useState<Partial<TaxRate>>(rate);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!f.name?.trim()) return setError('Name is required.');
    if (!(Number(f.ratePct) >= 0 && Number(f.ratePct) <= 100)) return setError('Rate must be between 0 and 100.');
    try {
      if (f.id) await billingApi.updateTaxRate(f.id, f);
      else await billingApi.createTaxRate(f);
      onSaved('Tax rate saved');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    try {
      await billingApi.deleteTaxRate(f.id!);
      onSaved('Tax rate deleted');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={f.id ? 'Edit tax rate' : 'New tax rate'}
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          {f.id && <button className={`${btn.danger} mr-auto`} onClick={remove}><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
          <button className={btn.secondary} onClick={onClose}>Cancel</button>
          <button className={btn.primary} onClick={save}>Save</button>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorBanner error={error} />
        <Field label="Name" hint="e.g. TX State + Local (Austin)">
          <input className={input} value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Rate %">
          <input className={input} type="number" step="0.001" min="0" max="100" value={f.ratePct ?? ''} onChange={(e) => setF({ ...f, ratePct: Number(e.target.value) })} />
        </Field>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!f.isDefault} onChange={(e) => setF({ ...f, isDefault: e.target.checked })} /> Default rate for taxable lines</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
      </div>
    </Modal>
  );
};

export default ItemsView;
