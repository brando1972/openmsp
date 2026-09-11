import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { ServiceTypeItem } from '../../types';
import { 
  X, 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  Layers, 
  DollarSign, 
  Clock, 
  Truck, 
  Package, 
  CheckCircle2,
  Sparkles
} from 'lucide-react';

export const ServicesManagementModal: React.FC = () => {
  const { 
    isServicesModalOpen, 
    setIsServicesModalOpen, 
    serviceTypes, 
    addServiceType, 
    updateServiceType, 
    deleteServiceType 
  } = useApp();

  const [editingService, setEditingService] = useState<ServiceTypeItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [formData, setFormData] = useState<Partial<ServiceTypeItem>>({
    name: '',
    category: 'Mowing & Maintenance',
    chargeUnit: 'per_cut',
    unitLabel: '$ / Cut',
    defaultRate: 65.00,
    estimatedMinutes: 45,
    requiredEquipment: '60" Commercial Zero-Turn',
    defaultMaterial: '',
    description: ''
  });

  if (!isServicesModalOpen) return null;

  const handleOpenAdd = () => {
    setEditingService(null);
    setFormData({
      id: `srv-${Date.now()}`,
      name: '',
      category: 'Mowing & Maintenance',
      chargeUnit: 'per_cut',
      unitLabel: '$ / Cut',
      defaultRate: 65.00,
      estimatedMinutes: 45,
      requiredEquipment: '60" Commercial Zero-Turn',
      defaultMaterial: '',
      description: ''
    });
    setIsEditing(true);
  };

  const handleOpenEdit = (srv: ServiceTypeItem) => {
    setEditingService(srv);
    setFormData(srv);
    setIsEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      alert('Service Name is required.');
      return;
    }

    const serviceObj: ServiceTypeItem = {
      ...(formData as ServiceTypeItem),
      id: editingService ? editingService.id : `srv-${Date.now()}`
    };

    if (editingService) {
      updateServiceType(serviceObj);
    } else {
      addServiceType(serviceObj);
    }

    setIsEditing(false);
    setEditingService(null);
  };

  const getUnitLabel = (unit: string) => {
    switch (unit) {
      case 'per_cut': return '$ / Cut';
      case 'per_yard': return '$ / Cu Yd';
      case 'per_pallet': return '$ / Pallet';
      case 'per_hour': return '$ / Man-Hour';
      case 'per_sqft': return '$ / 1,000 Sq Ft';
      case 'per_acre': return '$ / Acre';
      default: return 'Flat Rate';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 text-xs">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">Landscaping Services & Pricing Catalog</h2>
              <p className="text-[11px] text-slate-400">Add, edit, or configure charge rates and service presets</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                onClick={handleOpenAdd}
                className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add New Service</span>
              </button>
            )}

            <button
              onClick={() => setIsServicesModalOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isEditing ? (
            <form onSubmit={handleSave} className="bg-slate-50 border border-slate-300 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-bold text-sm text-slate-900">
                  {editingService ? `Edit Service: ${editingService.name}` : 'Create New Landscaping Service'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-slate-500 hover:text-slate-800 font-semibold text-xs"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Service Name:</label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Weekly Mowing & Edging or Pine Straw Spreading"
                    className="w-full bg-white border border-slate-300 rounded p-2 font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Service Category:</label>
                  <select
                    value={formData.category || 'Mowing & Maintenance'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded p-2 font-medium"
                  >
                    <option value="Mowing & Maintenance">Mowing & Maintenance</option>
                    <option value="Turf & Soil Care">Turf & Soil Care (Aeration, Fertilization)</option>
                    <option value="Plant & Tree Care">Plant & Tree Care (Pruning, Shaping)</option>
                    <option value="Materials & Installation">Materials & Installation (Mulch, Sod, Pine Straw)</option>
                    <option value="Seasonal & Cleanups">Seasonal & Cleanups</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Charge Pricing Unit:</label>
                  <select
                    value={formData.chargeUnit || 'per_cut'}
                    onChange={(e) => {
                      const unit = e.target.value as any;
                      setFormData({ 
                        ...formData, 
                        chargeUnit: unit,
                        unitLabel: getUnitLabel(unit)
                      });
                    }}
                    className="w-full bg-white border border-slate-300 rounded p-2 font-bold"
                  >
                    <option value="per_cut">Per Cut / Visit ($ / Cut)</option>
                    <option value="per_yard">Per Cubic Yard ($ / Cu Yd)</option>
                    <option value="per_pallet">Per Pallet / Bale ($ / Pallet)</option>
                    <option value="per_hour">Per Man-Hour ($ / Hour)</option>
                    <option value="per_sqft">Per 1,000 Sq Ft ($ / 1k Sq Ft)</option>
                    <option value="per_acre">Per Acre ($ / Acre)</option>
                    <option value="flat">Flat Rate Project ($)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Default Rate ($):</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.defaultRate || 0}
                    onChange={(e) => setFormData({ ...formData, defaultRate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 rounded p-2 font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Estimated Duration (Mins):</label>
                  <input
                    type="number"
                    value={formData.estimatedMinutes || 45}
                    onChange={(e) => setFormData({ ...formData, estimatedMinutes: parseInt(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 rounded p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Required Equipment / Machinery:</label>
                  <input
                    type="text"
                    value={formData.requiredEquipment || ''}
                    onChange={(e) => setFormData({ ...formData, requiredEquipment: e.target.value })}
                    placeholder="e.g. 60in Zero Turn, Stand-On Aerator, Dump Trailer"
                    className="w-full bg-white border border-slate-300 rounded p-2"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Default Material (Optional):</label>
                  <input
                    type="text"
                    value={formData.defaultMaterial || ''}
                    onChange={(e) => setFormData({ ...formData, defaultMaterial: e.target.value })}
                    placeholder="e.g. Dark Hardwood Mulch or Bermuda Sod"
                    className="w-full bg-white border border-slate-300 rounded p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Service Scope & Crew Description:</label>
                <textarea
                  rows={2}
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Details of service execution..."
                  className="w-full bg-white border border-slate-300 rounded p-2"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-1 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Service Preset</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {serviceTypes.map((srv) => (
                <div
                  key={srv.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-emerald-400 transition shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                        {srv.category}
                      </span>
                      <span className="font-mono font-black text-emerald-800 text-sm">
                        ${srv.defaultRate.toFixed(2)} <span className="text-[10px] text-slate-500 font-normal">{srv.unitLabel}</span>
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-slate-900 mt-2">{srv.name}</h4>
                    {srv.description && (
                      <p className="text-slate-600 text-[11px] mt-1 line-clamp-2">{srv.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-600">
                      <span className="flex items-center font-medium">
                        <Clock className="w-3 h-3 mr-1 text-slate-400" />
                        {srv.estimatedMinutes} min
                      </span>
                      {srv.requiredEquipment && (
                        <span className="flex items-center font-medium">
                          <Truck className="w-3 h-3 mr-1 text-blue-500" />
                          {srv.requiredEquipment}
                        </span>
                      )}
                      {srv.defaultMaterial && (
                        <span className="flex items-center font-medium">
                          <Package className="w-3 h-3 mr-1 text-amber-600" />
                          {srv.defaultMaterial}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200 mt-3">
                    <button
                      onClick={() => handleOpenEdit(srv)}
                      className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition"
                      title="Edit Service"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete service "${srv.name}"?`)) {
                          deleteServiceType(srv.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded transition"
                      title="Delete Service"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
