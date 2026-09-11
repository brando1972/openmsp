import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { CameraDevice, IPSubnet } from '../../types';
import {
  Camera, Network, Plus, Trash2, Edit2, ShieldAlert, CheckCircle2,
  AlertTriangle, Server, Wifi, Cpu, Lock, Eye, Copy, X
} from 'lucide-react';

interface Props {
  customerId: string;
  siteId?: string;
}

export const CustomerSiteView: React.FC<Props> = ({ customerId, siteId }) => {
  const {
    customers, cameras, subnets,
    addCamera, updateCamera, deleteCamera,
    addSubnet, updateSubnet, deleteSubnet
  } = useApp();

  const customer = customers.find(c => c.id === customerId);
  const activeSite = siteId
    ? customer?.jobSites.find(s => s.id === siteId)
    : customer?.jobSites[0];

  const siteCameras = cameras.filter(c => c.siteId === activeSite?.id);
  const siteSubnets = subnets.filter(s => s.siteId === activeSite?.id);

  const [activeSubTab, setActiveSubTab] = useState<'cameras' | 'subnets'>('cameras');

  // Camera Modal state
  const [isCamModalOpen, setIsCamModalOpen] = useState(false);
  const [editingCam, setEditingCam] = useState<CameraDevice | null>(null);
  const [camFormData, setCamFormData] = useState<Partial<CameraDevice>>({
    name: '', location: '', ipAddress: '', macAddress: '', rtspUrl: '', nvrChannel: 1, resolution: '4K 3840x2160', status: 'Online', notes: ''
  });

  // Subnet Modal state
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<IPSubnet | null>(null);
  const [subFormData, setSubFormData] = useState<Partial<IPSubnet>>({
    name: '', cidr: '192.168.10.0/24', gateway: '192.168.10.1', dnsServers: ['1.1.1.1', '8.8.8.8'], dhcpRange: '', vlanId: 10, staticAllocations: []
  });

  if (!activeSite) {
    return (
      <div className="p-6 text-center text-slate-400">
        <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p>No site selected or no sites available for this customer.</p>
      </div>
    );
  }

  const handleOpenAddCam = () => {
    setEditingCam(null);
    setCamFormData({
      name: '', location: '', ipAddress: '192.168.10.100', macAddress: '00:1A:2B:00:00:01', rtspUrl: '', nvrChannel: siteCameras.length + 1, resolution: '4K 3840x2160', status: 'Online', notes: ''
    });
    setIsCamModalOpen(true);
  };

  const handleSaveCam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!camFormData.name || !camFormData.ipAddress) {
      alert('Camera Name and IP Address are required.');
      return;
    }
    if (editingCam) {
      updateCamera({ ...editingCam, ...camFormData } as CameraDevice);
    } else {
      addCamera({
        id: `cam-${Date.now()}`,
        siteId: activeSite.id,
        name: camFormData.name || '',
        location: camFormData.location || 'Site Perimeter',
        ipAddress: camFormData.ipAddress || '',
        macAddress: camFormData.macAddress || '',
        rtspUrl: camFormData.rtspUrl,
        nvrChannel: Number(camFormData.nvrChannel) || 1,
        resolution: camFormData.resolution || '1080p',
        status: (camFormData.status as any) || 'Online',
        notes: camFormData.notes
      });
    }
    setIsCamModalOpen(false);
  };

  const handleOpenAddSubnet = () => {
    setEditingSub(null);
    setSubFormData({
      name: '', cidr: '192.168.10.0/24', gateway: '192.168.10.1', dnsServers: ['1.1.1.1', '8.8.8.8'], dhcpRange: '192.168.10.100 - 192.168.10.200', vlanId: 10, staticAllocations: []
    });
    setIsSubModalOpen(true);
  };

  const handleSaveSubnet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subFormData.name || !subFormData.cidr) {
      alert('Subnet Name and CIDR notation are required.');
      return;
    }
    if (editingSub) {
      updateSubnet({ ...editingSub, ...subFormData } as IPSubnet);
    } else {
      addSubnet({
        id: `sub-${Date.now()}`,
        siteId: activeSite.id,
        name: subFormData.name || '',
        cidr: subFormData.cidr || '192.168.10.0/24',
        gateway: subFormData.gateway || '192.168.10.1',
        vlanId: Number(subFormData.vlanId) || 10,
        dnsServers: Array.isArray(subFormData.dnsServers) ? subFormData.dnsServers : ['1.1.1.1'],
        dhcpRange: subFormData.dhcpRange,
        staticAllocations: []
      });
    }
    setIsSubModalOpen(false);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Site Documentation Header Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md flex flex-wrap items-center justify-between gap-3 border border-slate-800">
        <div>
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-500 text-slate-950">
            Site Documentation
          </span>
          <h2 className="text-base font-black text-white mt-1">{activeSite.name}</h2>
          <p className="text-slate-400 text-[11px]">{activeSite.address}, {activeSite.city}, {activeSite.state} {activeSite.zip}</p>
        </div>
        <div className="flex items-center space-x-3 text-[11px]">
          <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            <span className="text-slate-400 block text-[10px]">CCTV Cameras</span>
            <span className="font-mono font-bold text-emerald-400 text-sm">{siteCameras.length} Active</span>
          </div>
          <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            <span className="text-slate-400 block text-[10px]">Subnets / VLANs</span>
            <span className="font-mono font-bold text-cyan-400 text-sm">{siteSubnets.length} Configured</span>
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab('cameras')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition ${
            activeSubTab === 'cameras' ? 'bg-amber-600 text-white shadow' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Camera Locations ({siteCameras.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('subnets')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition ${
            activeSubTab === 'subnets' ? 'bg-amber-600 text-white shadow' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>IP Networks & Subnets ({siteSubnets.length})</span>
        </button>
      </div>

      {/* ── SUB-TAB 1: CAMERA LOCATIONS ── */}
      {activeSubTab === 'cameras' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-800 flex items-center text-xs">
              <Camera className="w-4 h-4 text-amber-600 mr-1.5" />
              IP Security Cameras & CCTV Infrastructure
            </h3>
            <button
              onClick={handleOpenAddCam}
              className="flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Camera</span>
            </button>
          </div>

          {siteCameras.length === 0 ? (
            <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-slate-200 p-6">
              <Camera className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-semibold">No camera locations documented for this site.</p>
              <button onClick={handleOpenAddCam} className="mt-2 text-amber-700 hover:underline font-bold text-xs">
                + Document First Camera Location
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {siteCameras.map(cam => (
                <div key={cam.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-amber-400 transition space-y-2">
                  <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                          cam.status === 'Online' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                          cam.status === 'Warning' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                          'bg-red-100 text-red-800 border-red-300'
                        }`}>
                          {cam.status}
                        </span>
                        <span className="font-mono text-[10px] font-bold text-slate-500">CH #{cam.nvrChannel || '—'}</span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm mt-1">{cam.name}</h4>
                      <p className="text-slate-500 text-[11px]">{cam.location}</p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button onClick={() => { setEditingCam(cam); setCamFormData(cam); setIsCamModalOpen(true); }} className="p-1 text-slate-400 hover:text-slate-700 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if (confirm(`Delete camera "${cam.name}"?`)) deleteCamera(cam.id); }} className="p-1 text-slate-400 hover:text-red-600 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 font-mono text-[11px]">
                    <div>
                      <span className="text-slate-400 font-sans block text-[10px] font-bold">IP Address</span>
                      <span className="font-bold text-slate-900">{cam.ipAddress}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-sans block text-[10px] font-bold">MAC Address</span>
                      <span className="font-bold text-slate-700">{cam.macAddress || '—'}</span>
                    </div>
                  </div>

                  {cam.rtspUrl && (
                    <div className="bg-slate-900 text-slate-200 p-2 rounded-lg font-mono text-[10px] truncate flex items-center justify-between">
                      <span className="truncate mr-2">RTSP: {cam.rtspUrl}</span>
                      <button onClick={() => { navigator.clipboard.writeText(cam.rtspUrl || ''); alert('RTSP stream URL copied to clipboard!'); }} className="text-amber-400 hover:text-amber-300 flex-shrink-0">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {cam.notes && (
                    <p className="text-[11px] text-slate-600 italic bg-amber-50/50 p-1.5 rounded border border-amber-100">
                      💡 {cam.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SUB-TAB 2: IP NETWORKS & SUBNETS ── */}
      {activeSubTab === 'subnets' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-800 flex items-center text-xs">
              <Network className="w-4 h-4 text-cyan-600 mr-1.5" />
              IP Subnets, Gateways & Static Assignments
            </h3>
            <button
              onClick={handleOpenAddSubnet}
              className="flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Subnet</span>
            </button>
          </div>

          {siteSubnets.length === 0 ? (
            <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-slate-200 p-6">
              <Network className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-semibold">No subnets documented for this site.</p>
              <button onClick={handleOpenAddSubnet} className="mt-2 text-amber-700 hover:underline font-bold text-xs">
                + Add Subnet & Gateway
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {siteSubnets.map(sub => (
                <div key={sub.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                  <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        {sub.vlanId && <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 font-bold text-[10px]">VLAN {sub.vlanId}</span>}
                        <h4 className="font-bold text-slate-900 text-sm">{sub.name}</h4>
                      </div>
                      <p className="font-mono text-xs text-amber-700 font-bold mt-0.5">{sub.cidr}</p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button onClick={() => { setEditingSub(sub); setSubFormData(sub); setIsSubModalOpen(true); }} className="p-1 text-slate-400 hover:text-slate-700 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if (confirm(`Delete subnet "${sub.name}"?`)) deleteSubnet(sub.id); }} className="p-1 text-slate-400 hover:text-red-600 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg text-[11px]">
                    <div>
                      <span className="text-slate-400 font-bold block text-[10px]">Gateway Router</span>
                      <span className="font-mono font-bold text-slate-900">{sub.gateway}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold block text-[10px]">DNS Servers</span>
                      <span className="font-mono font-bold text-slate-900">{sub.dnsServers.join(', ')}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold block text-[10px]">DHCP Scope</span>
                      <span className="font-mono font-semibold text-slate-700">{sub.dhcpRange || 'Static Only'}</span>
                    </div>
                  </div>

                  {sub.staticAllocations.length > 0 && (
                    <div className="space-y-1">
                      <span className="font-bold text-slate-700 text-[11px] block">Static IP Allocations:</span>
                      <div className="bg-slate-900 text-slate-200 rounded-lg p-2 overflow-x-auto text-[11px] font-mono">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                              <th className="p-1">IP Address</th>
                              <th className="p-1">Device Name</th>
                              <th className="p-1">Type</th>
                              <th className="p-1">MAC</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {sub.staticAllocations.map(ip => (
                              <tr key={ip.id} className="hover:bg-slate-800/50">
                                <td className="p-1 font-bold text-amber-400">{ip.ipAddress}</td>
                                <td className="p-1 font-sans text-white">{ip.deviceName}</td>
                                <td className="p-1"><span className="px-1.5 py-0.2 bg-slate-800 border border-slate-700 rounded text-[9px] text-cyan-300 font-sans">{ip.deviceType}</span></td>
                                <td className="p-1 text-slate-400 text-[10px]">{ip.macAddress || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Camera Modal ── */}
      {isCamModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md p-4 sm:p-5 text-slate-800 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900">{editingCam ? `Edit Camera: ${editingCam.name}` : 'Add New Security Camera'}</h3>
              <button onClick={() => setIsCamModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveCam} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Camera Name / Label: *</label>
                <input required type="text" value={camFormData.name || ''} onChange={e => setCamFormData({ ...camFormData, name: e.target.value })} placeholder="e.g. CAM-01 Main Gate" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Location Zone:</label>
                  <input type="text" value={camFormData.location || ''} onChange={e => setCamFormData({ ...camFormData, location: e.target.value })} placeholder="North Entrance" className="w-full bg-slate-50 border border-slate-300 rounded p-2" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">NVR Channel #:</label>
                  <input type="number" value={camFormData.nvrChannel || 1} onChange={e => setCamFormData({ ...camFormData, nvrChannel: parseInt(e.target.value) || 1 })} className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Static IP Address: *</label>
                  <input required type="text" value={camFormData.ipAddress || ''} onChange={e => setCamFormData({ ...camFormData, ipAddress: e.target.value })} placeholder="192.168.10.101" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono font-bold" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">MAC Address:</label>
                  <input type="text" value={camFormData.macAddress || ''} onChange={e => setCamFormData({ ...camFormData, macAddress: e.target.value })} placeholder="00:1A:2B:3C:4D:5E" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">RTSP Stream URL:</label>
                <input type="text" value={camFormData.rtspUrl || ''} onChange={e => setCamFormData({ ...camFormData, rtspUrl: e.target.value })} placeholder="rtsp://192.168.10.101:554/stream1" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Status:</label>
                <select value={camFormData.status || 'Online'} onChange={e => setCamFormData({ ...camFormData, status: e.target.value as any })} className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold">
                  <option value="Online">Online</option>
                  <option value="Warning">Warning / Degraded</option>
                  <option value="Offline">Offline</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Camera Notes:</label>
                <textarea rows={2} value={camFormData.notes || ''} onChange={e => setCamFormData({ ...camFormData, notes: e.target.value })} placeholder="Resolution, lens angle, maintenance notes..." className="w-full bg-slate-50 border border-slate-300 rounded p-2" />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button type="button" onClick={() => setIsCamModalOpen(false)} className="px-4 py-2 bg-slate-200 rounded font-bold text-xs">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-xs shadow">Save Camera</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Subnet Modal ── */}
      {isSubModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md p-4 sm:p-5 text-slate-800 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900">{editingSub ? `Edit Subnet: ${editingSub.name}` : 'Add New Subnet'}</h3>
              <button onClick={() => setIsSubModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveSubnet} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Subnet Label Name: *</label>
                <input required type="text" value={subFormData.name || ''} onChange={e => setSubFormData({ ...subFormData, name: e.target.value })} placeholder="e.g. Server & Management Subnet" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CIDR Subnet Block: *</label>
                  <input required type="text" value={subFormData.cidr || ''} onChange={e => setSubFormData({ ...subFormData, cidr: e.target.value })} placeholder="192.168.10.0/24" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono font-bold" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">VLAN Tag ID:</label>
                  <input type="number" value={subFormData.vlanId || 10} onChange={e => setSubFormData({ ...subFormData, vlanId: parseInt(e.target.value) || 10 })} className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono font-bold" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Gateway IP:</label>
                <input type="text" value={subFormData.gateway || ''} onChange={e => setSubFormData({ ...subFormData, gateway: e.target.value })} placeholder="192.168.10.1" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">DHCP Range (Optional):</label>
                <input type="text" value={subFormData.dhcpRange || ''} onChange={e => setSubFormData({ ...subFormData, dhcpRange: e.target.value })} placeholder="192.168.10.100 - 192.168.10.200" className="w-full bg-slate-50 border border-slate-300 rounded p-2 font-mono" />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button type="button" onClick={() => setIsSubModalOpen(false)} className="px-4 py-2 bg-slate-200 rounded font-bold text-xs">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded font-bold text-xs shadow">Save Subnet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
