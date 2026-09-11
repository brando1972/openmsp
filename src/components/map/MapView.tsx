import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../data/AppContext';
import { MapFilterSidebar, MapLayerState } from './MapFilterSidebar';
import { 
  MapPin, 
  Layers, 
  Navigation, 
  ExternalLink, 
  Eye, 
  Truck, 
  Phone, 
  AlertTriangle, 
  Building2, 
  Package, 
  Maximize2,
  ZoomIn,
  ZoomOut,
  Home,
  UserCheck,
  Scissors
} from 'lucide-react';
import L from 'leaflet';

export const MapView: React.FC = () => {
  const { 
    workOrders, 
    facilities, 
    technicians, 
    equipment, 
    setQuickInspectWO, 
    openWorkOrderModal, 
    currentDate 
  } = useApp();

  const [mapType, setMapType] = useState<'map' | 'satellite'>('map');
  const [selectedTechnician, setSelectedTechnician] = useState<string>('ALL');
  const [selectedPropertyType, setSelectedPropertyType] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('2026-08-28');
  const [endDate, setEndDate] = useState<string>('2026-08-28');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [activePin, setActivePin] = useState<any | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  const [layers, setLayers] = useState<MapLayerState>({
    showAll: true,
    workOrders: true,
    facilities: true,
    jobSites: true,
    office: true,
    equipment: true,
    fuel: true,
    technicians: true,
    nurseries: true,
    traffic: false,
    density: false,
    showCarryOver: true
  });

  // Initialize Leaflet Map (tiles + panes must be created in this effect —
  // React Strict Mode remounts and other effects will not re-run).
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const map = L.map(el, {
      center: [30.5200, -87.2100],
      zoom: 11,
      zoomControl: true
    });

    tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    setMapReady(true);

    const invalidate = () => map.invalidateSize();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(invalidate);
    });
    ro.observe(el);
    requestAnimationFrame(invalidate);

    return () => {
      ro.disconnect();
      setMapReady(false);
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      markersLayerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  // Update Tile Layer
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    if (mapType === 'satellite') {
      tileLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
          maxZoom: 18
        }
      ).addTo(mapInstanceRef.current);
    } else {
      tileLayerRef.current = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19
        }
      ).addTo(mapInstanceRef.current);
    }
  }, [mapType, mapReady]);

  // Update Markers & Polylines
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !markersLayerRef.current || !routeLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    routeLayerRef.current.clearLayers();

    // 1. Render Work Orders / Job Site Markers
    if (layers.workOrders || layers.jobSites) {
      const filteredWOs = workOrders.filter(wo => {
        const matchesDate = layers.showCarryOver ? true : (wo.date === currentDate || !wo.date);
        const matchesTech = selectedTechnician === 'ALL' || wo.technicianName === selectedTechnician;
        const matchesProp = selectedPropertyType === 'ALL' || wo.propertyType === selectedPropertyType;
        return matchesDate && matchesTech && matchesProp;
      });

      filteredWOs.forEach(wo => {
        let pinColor = '#16a34a'; // Green
        if (wo.status === 'urgent') pinColor = '#c026d3'; // Purple
        else if (wo.status === 'scheduled') pinColor = '#06b6d4'; // Cyan
        else if (wo.status === 'attention') pinColor = '#ea580c'; // Coral
        else if (wo.status === 'completed') pinColor = '#059669';

        const isCommercial = wo.propertyType === 'Commercial';

        const customHtml = `
          <div style="
            background: white;
            border: 2px solid ${pinColor};
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
            padding: 2px 6px;
            display: flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            font-family: sans-serif;
            font-size: 11px;
            font-weight: bold;
            white-space: nowrap;
          ">
            <span>${isCommercial ? '🏢' : '🏡'}</span>
            <span style="
              display: inline-block;
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: ${pinColor};
            "></span>
            <span style="color: #0f172a;">${wo.sequenceNum ? `#${wo.sequenceNum}` : wo.woNumber.replace('WO-', '')}</span>
          </div>
        `;

        const icon = L.divIcon({
          html: customHtml,
          className: 'custom-wo-marker',
          iconSize: [46, 24],
          iconAnchor: [23, 24]
        });

        const marker = L.marker([wo.lat, wo.lng], { icon });
        marker.on('click', () => {
          setActivePin({ type: 'workOrder', data: wo });
        });

        markersLayerRef.current?.addLayer(marker);
      });

      // Draw Route Polylines for Craig and Dsweat
      const craigOrders = filteredWOs.filter(w => w.technicianName === 'Craig').sort((a,b) => (a.sequenceNum||0) - (b.sequenceNum||0));
      if (craigOrders.length > 1) {
        const latlngs = craigOrders.map(w => [w.lat, w.lng] as [number, number]);
        const polyline = L.polyline(latlngs, {
          color: '#ec4899',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.85
        });
        routeLayerRef.current?.addLayer(polyline);
      }

      const dsweatOrders = filteredWOs.filter(w => w.technicianName === 'Dsweat').sort((a,b) => (a.sequenceNum||0) - (b.sequenceNum||0));
      if (dsweatOrders.length > 1) {
        const latlngs = dsweatOrders.map(w => [w.lat, w.lng] as [number, number]);
        const polyline = L.polyline(latlngs, {
          color: '#06b6d4',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.85
        });
        routeLayerRef.current?.addLayer(polyline);
      }
    }

    // 2. Render Facilities
    if (layers.facilities || layers.nurseries || layers.office) {
      facilities.forEach(fac => {
        let facColor = '#3b82f6';
        let iconSymbol = '🏢';
        if (fac.type.includes('HQ')) { facColor = '#1e293b'; iconSymbol = '⭐ HQ'; }
        if (fac.type.includes('Laydown')) { facColor = '#f59e0b'; iconSymbol = '🚜 Yard'; }
        if (fac.type.includes('Compost')) { facColor = '#10b981'; iconSymbol = '♻️ Compost'; }
        if (fac.type.includes('Nursery')) { facColor = '#059669'; iconSymbol = '🌱 Nursery'; }
        if (fac.type.includes('Fuel')) { facColor = '#6366f1'; iconSymbol = '⛽ Fuel'; }

        const customHtml = `
          <div style="
            background: #1e293b;
            color: white;
            border: 2px solid ${facColor};
            border-radius: 6px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.4);
            padding: 2px 6px;
            font-family: sans-serif;
            font-size: 10px;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
          ">
            <span>${iconSymbol}</span>
            <span>${fac.name.split(' ')[0]}</span>
          </div>
        `;

        const icon = L.divIcon({
          html: customHtml,
          className: 'custom-fac-marker',
          iconSize: [60, 24],
          iconAnchor: [30, 24]
        });

        const marker = L.marker([fac.lat, fac.lng], { icon });
        marker.on('click', () => {
          setActivePin({ type: 'facility', data: fac });
        });

        markersLayerRef.current?.addLayer(marker);
      });
    }

    // 3. Render Technicians Live GPS
    if (layers.technicians) {
      technicians.forEach(tech => {
        const customHtml = `
          <div style="
            background: ${tech.color};
            color: white;
            border: 2px solid white;
            border-radius: 50%;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 10px ${tech.color};
            font-size: 12px;
            font-weight: bold;
          ">
            🚜
          </div>
        `;

        const icon = L.divIcon({
          html: customHtml,
          className: 'custom-drv-marker',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const marker = L.marker([tech.currentLat, tech.currentLng], { icon });
        marker.on('click', () => {
          setActivePin({ type: 'technician', data: tech });
        });

        markersLayerRef.current?.addLayer(marker);
      });
    }
  }, [layers, workOrders, facilities, technicians, equipment, selectedTechnician, selectedPropertyType, mapType, currentDate, mapReady]);

  return (
    <div className="flex-1 flex min-h-0 w-full overflow-hidden relative">
      {/* Left Filter Sidebar */}
      <MapFilterSidebar
        layers={layers}
        setLayers={setLayers}
        selectedTechnician={selectedTechnician}
        setSelectedTechnician={setSelectedTechnician}
        selectedPropertyType={selectedPropertyType}
        setSelectedPropertyType={setSelectedPropertyType}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />

      {/* Map Main Canvas */}
      <div className="flex-1 relative min-h-0 min-w-0 h-full">
        {/* Top Floating Map / Satellite Switcher */}
        <div className="absolute top-3 right-4 z-20 bg-white/95 backdrop-blur rounded-lg shadow-lg border border-slate-300 p-1 flex items-center space-x-1 text-xs font-bold">
          <button
            onClick={() => setMapType('map')}
            className={`px-3 py-1.5 rounded transition ${
              mapType === 'map' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Map
          </button>
          <button
            onClick={() => setMapType('satellite')}
            className={`px-3 py-1.5 rounded transition ${
              mapType === 'satellite' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Satellite
          </button>
        </div>

        {/* Map Container */}
        <div ref={mapContainerRef} className="absolute inset-0 z-0" />

        {/* Selected Pin Details Card */}
        {activePin && (
          <div className="absolute bottom-6 right-6 z-30 w-80 bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden animate-fadeIn text-xs text-slate-800">
            {activePin.type === 'workOrder' && (
              <div>
                <div className={`p-3 text-white flex items-center justify-between ${
                  activePin.data.status === 'urgent' ? 'bg-fuchsia-600' :
                  activePin.data.status === 'attention' ? 'bg-orange-600' :
                  'bg-slate-800'
                }`}>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-mono text-[10px] uppercase font-bold opacity-90">
                        {activePin.data.woNumber} • Seq #{activePin.data.sequenceNum || '--'}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                        activePin.data.propertyType === 'Commercial' ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white'
                      }`}>
                        {activePin.data.propertyType || 'Residential'}
                      </span>
                    </div>
                    <h3 className="font-black text-sm line-clamp-1 mt-0.5">{activePin.data.customerName}</h3>
                  </div>
                  <button onClick={() => setActivePin(null)} className="p-1 hover:bg-white/20 rounded">
                    ✕
                  </button>
                </div>

                <div className="p-3 space-y-2.5">
                  <div className="flex items-start space-x-1.5 text-slate-700">
                    <MapPin className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <span>{activePin.data.jobAddress}, {activePin.data.jobCity}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                    <div>
                      <span className="text-slate-500 block text-[10px] font-bold">Technician</span>
                      <span className="font-bold text-slate-900">{activePin.data.technicianName || 'Unassigned'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] font-bold">Turf Specs</span>
                      <span className="font-mono font-bold text-emerald-800">
                        {activePin.data.turfSqFt ? `${activePin.data.turfSqFt.toLocaleString()} sq ft` : '--'}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] bg-emerald-50 p-1.5 rounded border border-emerald-200 text-emerald-950 font-semibold">
                    ✂️ {activePin.data.serviceTypeName || activePin.data.jobName}
                  </div>

                  {activePin.data.hazards && (
                    <div className="bg-amber-50 border-l-2 border-amber-500 p-1.5 text-[11px] text-amber-900 font-medium">
                      ⚠️ {activePin.data.hazards}
                    </div>
                  )}

                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      onClick={() => setQuickInspectWO(activePin.data)}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded font-bold transition flex items-center justify-center space-x-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </button>

                    <button
                      onClick={() => openWorkOrderModal(activePin.data)}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold transition flex items-center justify-center space-x-1"
                    >
                      <span>Edit WO</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activePin.type === 'facility' && (
              <div>
                <div className="p-3 bg-slate-800 text-white flex items-center justify-between">
                  <div>
                    <span className="font-mono text-[10px] uppercase font-bold text-emerald-400">
                      {activePin.data.type}
                    </span>
                    <h3 className="font-black text-sm">{activePin.data.name}</h3>
                  </div>
                  <button onClick={() => setActivePin(null)} className="p-1 hover:bg-white/20 rounded">
                    ✕
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-slate-600">{activePin.data.address}, {activePin.data.city}, {activePin.data.state}</p>
                  <p className="text-slate-500 font-medium">Hours: {activePin.data.hours}</p>
                </div>
              </div>
            )}

            {activePin.type === 'technician' && (
              <div>
                <div className="p-3 bg-slate-800 text-white flex items-center justify-between">
                  <div>
                    <span className="font-mono text-[10px] uppercase font-bold text-cyan-400">
                      Technician Route GPS
                    </span>
                    <h3 className="font-black text-sm">{activePin.data.name} ({activePin.data.role})</h3>
                  </div>
                  <button onClick={() => setActivePin(null)} className="p-1 hover:bg-white/20 rounded">
                    ✕
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  <p className="font-bold text-slate-800">{activePin.data.vehicle}</p>
                  <p className="text-slate-600">Status: <span className="font-semibold text-emerald-700">{activePin.data.status}</span></p>
                  <p className="text-slate-600">Phone: {activePin.data.phone}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
