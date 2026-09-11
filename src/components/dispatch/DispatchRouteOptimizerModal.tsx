import React, { useState, useEffect, useRef, useMemo } from 'react';
import { WorkOrder } from '../../types';
import { X, Navigation, Zap, Building2, Ruler, CheckCircle2, Map as MapIcon, ListOrdered } from 'lucide-react';
import L from 'leaflet';

function hav(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function nn(depot:[number,number], orders:WorkOrder[]):WorkOrder[] {
  const rem=[...orders], route:WorkOrder[]=[];
  let cur=depot;
  while(rem.length){
    let ni=0, nd=Infinity;
    rem.forEach((w,i)=>{ const d=hav(cur[0],cur[1],w.lat,w.lng); if(d<nd){nd=d;ni=i;} });
    route.push(rem[ni]); cur=[rem[ni].lat,rem[ni].lng]; rem.splice(ni,1);
  }
  return route;
}
function totalDist(depot:[number,number], orders:WorkOrder[]) {
  if(!orders.length) return 0;
  let d=hav(depot[0],depot[1],orders[0].lat,orders[0].lng);
  for(let i=1;i<orders.length;i++) d+=hav(orders[i-1].lat,orders[i-1].lng,orders[i].lat,orders[i].lng);
  return d;
}

const DEPOT:[number,number]=[30.4742,-87.2640];

interface Props { open:boolean; onClose:()=>void; orders:WorkOrder[]; onApply:(r:WorkOrder[])=>void; }

export const DispatchRouteOptimizerModal:React.FC<Props>=({open,onClose,orders,onApply})=>{
  const [algo,setAlgo]=useState<'shortest'|'priority'|'commercial'>('shortest');
  const [applied,setApplied]=useState(false);
  const [mobileTab, setMobileTab] = useState<'stops' | 'map'>('stops');

  const panelRef = useRef<HTMLDivElement>(null);
  const mapDiv   = useRef<HTMLDivElement>(null);
  const mapInst  = useRef<L.Map|null>(null);
  const layerGrp = useRef<L.LayerGroup|null>(null);
  const [mapReady,setMapReady]=useState(false);

  const route = useMemo(() => {
    if (!open || !orders.length) return [];
    if (algo === 'priority') {
      const u = orders.filter(w => w.status === 'urgent' || w.status === 'attention');
      const rest = orders.filter(w => w.status !== 'urgent' && w.status !== 'attention');
      return [...nn(DEPOT, u), ...nn(DEPOT, rest)];
    }
    if (algo === 'commercial') {
      const c = orders.filter(w => w.propertyType === 'Commercial');
      const res = orders.filter(w => w.propertyType !== 'Commercial');
      return [...nn(DEPOT, c), ...nn(DEPOT, res)];
    }
    return nn(DEPOT, orders);
  }, [algo, orders, open]);

  useEffect(() => {
    if (open) setApplied(false);
  }, [algo, orders, open]);

  const mapVisible = open && (mobileTab === 'map' || (typeof window !== 'undefined' && window.innerWidth >= 768));

  /* Init map when the panel is actually visible */
  useEffect(()=>{
    if(!open || !mapVisible || !mapDiv.current) return;

    const el = mapDiv.current;
    const map = L.map(el,{center:DEPOT,zoom:11});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap',maxZoom:19
    }).addTo(map);
    layerGrp.current=L.layerGroup().addTo(map);
    mapInst.current=map;
    setMapReady(true);

    const invalidate = () => map.invalidateSize();
    const ro = new ResizeObserver(() => { requestAnimationFrame(invalidate); });
    ro.observe(el);
    requestAnimationFrame(invalidate);

    return ()=>{
      ro.disconnect();
      setMapReady(false);
      map.remove();
      mapInst.current=null;
      layerGrp.current=null;
    };
  },[open, mapVisible, mobileTab]);

  /* Draw markers on map */
  useEffect(()=>{
    if(!mapReady||!mapInst.current||!layerGrp.current||!route.length) return;
    layerGrp.current.clearLayers();

    L.marker(DEPOT,{icon:L.divIcon({
      html:`<div style="background:#1e293b;color:white;border:2px solid #f59e0b;border-radius:8px;padding:2px 7px;font-size:10px;font-weight:900;white-space:nowrap">⭐ HQ Depot</div>`,
      className:'custom-fac-marker',iconSize:[80,24],iconAnchor:[40,24]
    })}).addTo(layerGrp.current);

    route.forEach((wo,i)=>{
      const c=wo.status==='urgent'?'#c026d3':wo.status==='attention'?'#ea580c':'#16a34a';
      L.marker([wo.lat,wo.lng],{icon:L.divIcon({
        html:`<div style="background:white;border:2px solid ${c};border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;color:${c};box-shadow:0 2px 6px rgba(0,0,0,.3)">${i+1}</div>`,
        className:'custom-wo-marker',iconSize:[26,26],iconAnchor:[13,13]
      })}).bindTooltip(`#${i+1}: ${wo.customerName}<br>${wo.jobAddress}`).addTo(layerGrp.current!);
    });

    const pts:[number,number][]=[DEPOT,...route.map(w=>[w.lat,w.lng] as [number,number])];
    L.polyline(pts,{color:'#f59e0b',weight:3,dashArray:'8 6',opacity:.9}).addTo(layerGrp.current!);
    mapInst.current!.invalidateSize();
    mapInst.current!.fitBounds(L.latLngBounds(pts).pad(0.1));
  },[route,mapReady]);

  if(!open) return null;

  const origD=totalDist(DEPOT,orders), optD=totalDist(DEPOT,route), sav=origD-optD;

  const ALGOS=[
    {key:'shortest',label:'Shortest Distance (TSP)',icon:<Ruler size={14}/>,desc:'Optimal geographic drive sequence'},
    {key:'priority',label:'Urgent First',icon:<Zap size={14} color="#c026d3"/>,desc:'Rush jobs first, then shortest distance'},
    {key:'commercial',label:'Commercial AM',icon:<Building2 size={14} color="#2563eb"/>,desc:'Commercial sites first, residential after'},
  ];

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(2,6,23,.85)',display:'flex',alignItems:'center',justifyContent:'center',padding:window.innerWidth < 640 ? 4 : 16}}>
      <div style={{width:'100%',maxWidth:1140,height:window.innerWidth < 640 ? '98vh' : 'calc(100vh - 40px)',maxHeight:840,background:'white',borderRadius:16,overflow:'hidden',boxShadow:'0 25px 60px rgba(0,0,0,.5)',border:'1px solid #cbd5e1',display:'flex',flexDirection:'column'}}>

        {/* Header */}
        <div style={{flexShrink:0,height:52,background:'#0f172a',color:'white',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:28,height:28,background:'#d97706',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center'}}><Navigation size={14} color="white"/></div>
            <div>
              <p style={{margin:0,fontWeight:900,fontSize:13}}>Route Optimizer & Map</p>
              <p style={{margin:0,fontSize:10,color:'#94a3b8'}} className="hidden sm:block">Auto-sequence today's stops</p>
            </div>
          </div>

          {/* Mobile Tab Switcher (Phones) */}
          <div className="flex md:hidden items-center bg-slate-800 p-0.5 rounded-lg text-[11px] font-bold">
            <button
              onClick={() => setMobileTab('stops')}
              className={`px-2.5 py-1 rounded transition flex items-center space-x-1 ${mobileTab === 'stops' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Stops</span>
            </button>
            <button
              onClick={() => setMobileTab('map')}
              className={`px-2.5 py-1 rounded transition flex items-center space-x-1 ${mobileTab === 'map' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map</span>
            </button>
          </div>

          <button onClick={onClose} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',padding:4}}><X size={20}/></button>
        </div>

        {/* Body */}
        <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>

          {/* Left panel (Stops, Metrics & Algo) */}
          <div className={`w-full md:w-80 flex-shrink-0 border-r border-slate-200 flex-col bg-slate-50 overflow-hidden ${mobileTab === 'stops' ? 'flex' : 'hidden md:flex'}`}>
            <div className="p-3 border-b border-slate-200 space-y-1.5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Optimization Mode:</p>
              <div className="grid grid-cols-3 md:grid-cols-1 gap-1.5">
                {ALGOS.map(o=>(
                  <button key={o.key} onClick={()=>setAlgo(o.key as any)} className={`text-left p-2 rounded-lg border-2 transition flex items-center md:items-start space-x-1.5 ${algo===o.key?'bg-amber-50 border-amber-500 shadow-xs':'bg-white border-slate-200'}`}>
                    <span className="flex-shrink-0">{o.icon}</span>
                    <div className="min-w-0"><p className={`font-bold text-[11px] truncate ${algo===o.key?'text-amber-900':'text-slate-700'}`}>{o.label}</p></div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 border-b border-slate-200 space-y-1.5">
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-white border border-slate-200 rounded-lg p-1.5"><p className="text-[10px] text-slate-500 font-bold">Original</p><p className="font-mono font-black">{origD.toFixed(1)} mi</p></div>
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-1.5"><p className="text-[10px] text-amber-700 font-bold">Optimized</p><p className="font-mono font-black text-amber-900">{optD.toFixed(1)} mi</p></div>
              </div>
              {sav>0.1&&<div className="bg-emerald-50 border border-emerald-300 rounded p-1 text-center text-emerald-800 font-bold text-[11px]">✓ Saves ~{sav.toFixed(1)} mi · ~{Math.round(sav*2)} min</div>}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Optimized Sequence ({route.length}):</p>
              {route.map((wo,i)=>(
                <div key={wo.id} className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg p-2 shadow-xs">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] flex-shrink-0 text-white ${wo.status==='urgent'?'bg-fuchsia-600':wo.status==='attention'?'bg-orange-500':'bg-amber-600'}`}>{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[11px] text-slate-900 truncate">{wo.customerName}</p>
                    <p className="text-[10px] text-slate-500 truncate">{wo.jobAddress}</p>
                  </div>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${wo.propertyType==='Commercial'?'bg-blue-100 text-blue-800':'bg-emerald-100 text-emerald-800'}`}>{wo.propertyType==='Commercial'?'🏢':'🏡'}</span>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-slate-200 space-y-1.5">
              {applied
                ?<div className="flex items-center justify-center space-x-2 py-2 bg-emerald-100 border border-emerald-300 rounded-lg text-emerald-800 font-bold text-xs"><CheckCircle2 className="w-4 h-4"/><span>Applied to Dispatch!</span></div>
                :<button onClick={()=>{onApply(route);setApplied(true);}} disabled={!route.length} className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-lg shadow-sm text-xs flex items-center justify-center space-x-1.5"><CheckCircle2 className="w-4 h-4"/><span>Apply Sequence to Board</span></button>
              }
            </div>
          </div>

          {/* Map panel (Full width on mobile when map tab active) */}
          <div ref={panelRef} className={`flex-1 relative min-w-0 min-h-0 overflow-hidden ${mobileTab === 'map' ? 'flex' : 'hidden md:flex'}`}>
            <div ref={mapDiv} className="absolute inset-0 z-0" />

            {/* Legend */}
            <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 border border-slate-300 rounded-lg p-2 text-[10px] shadow-md space-y-1">
              <p className="font-black text-slate-700 uppercase tracking-wider">Legend</p>
              <div className="flex items-center space-x-1.5"><span className="font-bold text-amber-600">⭐</span><span>HQ Depot</span></div>
              <div className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /><span>Stop</span></div>
              <div className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-fuchsia-600 inline-block" /><span>Urgent</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
