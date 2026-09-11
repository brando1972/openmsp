import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { EquipmentAsset } from '../../types';
import { 
  Tractor, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  Truck, 
  MapPin,
  X,
  Save,
  Wrench,
  UserCheck
} from 'lucide-react';

export const EquipmentView: React.FC = () => {
  const { equipment, addEquipment, updateEquipment, deleteEquipment, technicians, setActiveTab } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'Available' | 'In Use' | 'Maintenance'>('ALL');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<EquipmentAsset | null>(null);

  const [formData, setFormData] = useState<Partial<EquipmentAsset>>({
    assetNumber: '',
    type: '60" Commercial Zero-Turn',
    status: 'Available',
    location: 'Main HQ Operations Shop',
    address: '4520 W Fairfield Dr, Pensacola, FL',
    daysOut: 0,
    specs: 'Scag Turf Tiger II 61" Velocity Plus Deck'
  });

  const filteredAssets = equipment.filter(asset => {
    const matchesSearch = !searchQuery || 
      asset.assetNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (asset.specs && asset.specs.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = selectedStatus === 'ALL' || asset.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const handleOpenAdd = () => {
    setEditingAsset(null);
    setFormData({
      assetNumber: `Mower-0${Math.floor(3 + Math.random() * 7)}`,
      type: '60" Commercial Zero-Turn',
      status: 'Available',
      location: 'Main HQ Operations Shop',
      address: '4520 W Fairfield Dr, Pensacola, FL',
      daysOut: 0,
      specs: 'Commercial Grade Turf Mower'
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (asset: EquipmentAsset) => {
    setEditingAsset(asset);
    setFormData(asset);
    setIsAddModalOpen(true);
  };

  const handleSaveAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.assetNumber) {
      alert('Asset Number is required.');
      return;
    }

    if (editingAsset) {
      updateEquipment({ ...(formData as EquipmentAsset), id: editingAsset.id });
    } else {
      addEquipment({
        ...(formData as EquipmentAsset),
        id: `eq-${Date.now()}`
      });
    }

    setIsAddModalOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-100 overflow-hidden text-xs">
      {/* Top Breadcrumb */}
      <div className="bg-slate-200 border-b border-slate-300 px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-1 text-slate-700 font-bold">
          <button onClick={() => setActiveTab('customers')} className="px-3 py-1 hover:bg-slate-300 rounded">
            Customers & Sites
          </button>
          <button onClick={() => setActiveTab('dispatch')} className="px-3 py-1 hover:bg-slate-300 rounded">
            Dispatch
          </button>
          <button className="px-3 py-1 bg-white border border-slate-300 rounded shadow-xs text-slate-900 font-extrabold">
            Equipment & Fleet
          </button>
          <button onClick={() => setActiveTab('map')} className="px-3 py-1 hover:bg-slate-300 rounded">
            GIS Map
          </button>
          <button onClick={() => setActiveTab('accounting')} className="px-3 py-1 hover:bg-slate-300 rounded">
            Accounting
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">
            Available in Shop: {equipment.filter(e => e.status === 'Available').length}
          </span>
          <span className="px-2.5 py-1 rounded bg-blue-100 text-blue-900 border border-blue-300 font-bold">
            In Field / On-Route: {equipment.filter(e => e.status === 'In Use').length}
          </span>
        </div>
      </div>

      {/* Main Title & Action Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center">
            <Tractor className="w-5 h-5 text-emerald-600 mr-2" />
            Landscaping Equipment & Machinery Fleet
          </h2>

          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg border border-slate-300">
            <button
              onClick={handleOpenAdd}
              className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded shadow-xs transition"
              title="Add New Landscaping Machine"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
            </button>
            <button
              onClick={() => {
                const target = equipment.find(e => e.id === selectedAssetId) || equipment[0];
                if (target) handleOpenEdit(target);
              }}
              className="p-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded shadow-xs transition"
              title="Edit Selected Machine"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (selectedAssetId && confirm('Delete selected equipment record?')) {
                  deleteEquipment(selectedAssetId);
                }
              }}
              className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded shadow-xs transition"
              title="Delete Machine"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter & Search */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-300 rounded-lg p-1">
            <span className="text-slate-500 font-bold px-1">Status:</span>
            {(['ALL', 'Available', 'In Use', 'Maintenance'] as const).map(st => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-2 py-0.5 rounded font-semibold transition ${
                  selectedStatus === st ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search mower, trailer, skid steer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-60"
            />
          </div>
        </div>
      </div>

      {/* Equipment Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-200 text-slate-800 font-black border-b-2 border-slate-300 sticky top-0 z-10 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-2.5 px-3 w-28">Asset # ↑</th>
              <th className="py-2.5 px-3 w-32">Status</th>
              <th className="py-2.5 px-4 w-52">Equipment Type</th>
              <th className="py-2.5 px-4 w-72">Specifications & Model</th>
              <th className="py-2.5 px-4">Current Location / Assigned Rig</th>
              <th className="py-2.5 px-3 w-36">Technician</th>
              <th className="py-2.5 px-3 text-right w-24">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 bg-white">
            {filteredAssets.map((asset) => {
              const isSelected = selectedAssetId === asset.id;
              const isAvailable = asset.status === 'Available';

              return (
                <tr
                  key={asset.id}
                  onClick={() => setSelectedAssetId(asset.id)}
                  className={`cursor-pointer transition-colors ${
                    isAvailable ? 'bg-emerald-50/70 font-semibold hover:bg-emerald-100/80 text-slate-900' : 
                    isSelected ? 'bg-blue-50 text-slate-900 font-medium' : 
                    'hover:bg-slate-50 text-slate-800 font-normal'
                  }`}
                >
                  <td className="py-2.5 px-3 font-mono font-black text-slate-900">
                    {asset.assetNumber}
                  </td>

                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                      isAvailable ? 'bg-emerald-200 text-emerald-900 border border-emerald-300' :
                      asset.status === 'In Use' ? 'bg-blue-100 text-blue-800' :
                      'bg-orange-100 text-orange-800'
                    }`}>
                      {asset.status}
                    </span>
                  </td>

                  <td className="py-2.5 px-4 font-bold text-slate-900">
                    {asset.type}
                  </td>

                  <td className="py-2.5 px-4 text-slate-600 font-medium">
                    {asset.specs || '--'}
                  </td>

                  <td className="py-2.5 px-4 text-slate-700 font-medium">
                    {asset.location}
                  </td>

                  <td className="py-2.5 px-3 font-bold text-slate-900">
                    {asset.assignedTechnician ? (
                      <span className="flex items-center text-emerald-800">
                        <UserCheck className="w-3.5 h-3.5 mr-1" />
                        {asset.assignedTechnician}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">Available</span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(asset);
                        }}
                        className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded"
                        title="Edit Machine"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Machine Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md p-5 text-slate-800 text-xs space-y-4">
            <div className="bg-slate-900 text-white p-3.5 -m-5 mb-3 flex items-center justify-between rounded-t-xl">
              <h3 className="font-bold text-sm">
                {editingAsset ? `Edit Machine: ${editingAsset.assetNumber}` : 'Add Landscaping Machinery'}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAsset} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Asset Tag #:</label>
                <input
                  type="text"
                  required
                  value={formData.assetNumber || ''}
                  onChange={(e) => setFormData({ ...formData, assetNumber: e.target.value })}
                  placeholder="e.g. Mower-61 or Trailer-03"
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Machinery Type:</label>
                  <select
                    value={formData.type || '60" Commercial Zero-Turn'}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2"
                  >
                    <option value='60" Commercial Zero-Turn'>60" Commercial Zero-Turn</option>
                    <option value='52" Stand-On Mower'>52" Stand-On Mower</option>
                    <option value='36" Walk-Behind Mower'>36" Walk-Behind Mower</option>
                    <option value='Stand-On Core Aerator'>Stand-On Core Aerator</option>
                    <option value='Commercial Dump Trailer'>Commercial Dump Trailer</option>
                    <option value='Compact Skid Steer'>Compact Skid Steer</option>
                    <option value='Hydroseeder Rig'>Hydroseeder Rig</option>
                    <option value='Heavy Duty Sod Cutter'>Heavy Duty Sod Cutter</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status:</label>
                  <select
                    value={formData.status || 'Available'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold"
                  >
                    <option value="Available">Available (In Shop)</option>
                    <option value="In Use">In Use (On Route)</option>
                    <option value="Maintenance">Maintenance / Service</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Make, Model & Deck Specs:</label>
                <input
                  type="text"
                  value={formData.specs || ''}
                  onChange={(e) => setFormData({ ...formData, specs: e.target.value })}
                  placeholder="e.g. Scag Turf Tiger II 61in Velocity Plus Deck"
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Current Staging Location:</label>
                <input
                  type="text"
                  value={formData.location || ''}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. Main HQ Operations Shop"
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Assigned Technician:</label>
                <select
                  value={formData.assignedTechnician || ''}
                  onChange={(e) => setFormData({ ...formData, assignedTechnician: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2"
                >
                  <option value="">-- Available / Unassigned --</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.name}>{t.name} ({t.role})</option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 rounded font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow"
                >
                  Save Machinery
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
