import React, { useState } from 'react';
import { AppProvider, useApp } from './data/AppContext';
import { TopNavbar } from './components/layout/TopNavbar';
import { DispatchGrid } from './components/dispatch/DispatchGrid';
import { MapView } from './components/map/MapView';
import { EquipmentView } from './components/equipment/EquipmentView';
import { AccountingView } from './components/accounting/AccountingView';
import { CustomerDirectory } from './components/customers/CustomerDirectory';
import { MobileCrewView } from './components/fieldCrew/MobileCrewView';
import { WorkOrderModal } from './components/workOrders/WorkOrderModal';
import { ServicesManagementModal } from './components/services/ServicesManagementModal';
import { 
  Sprout, 
  MapPin, 
  Smartphone, 
  Users, 
  DollarSign, 
  Layers,
  Menu,
  Tractor
} from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { activeTab, setActiveTab, workOrders, invoices } = useApp();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const urgentCount = workOrders.filter(w => w.status === 'urgent' || w.status === 'attention').length;
  const pendingInvoicesCount = invoices.filter(i => i.status === 'To Be Billed').length;

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-slate-100 select-none">
      {/* Top Main Navigation */}
      <TopNavbar />

      {/* Dynamic View Router */}
      <main className="flex-1 flex min-h-0 overflow-hidden pb-14 lg:pb-0 relative">
        {activeTab === 'dispatch' && <DispatchGrid />}
        {activeTab === 'map' && <MapView />}
        {activeTab === 'equipment' && <EquipmentView />}
        {activeTab === 'accounting' && <AccountingView />}
        {activeTab === 'customers' && <CustomerDirectory />}
        {activeTab === 'crew' && <MobileCrewView />}
      </main>

      {/* ── MOBILE BOTTOM NAVIGATION BAR (Phones & Tablets) ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800 flex items-center justify-around py-1.5 px-2 text-[10px] font-bold text-slate-400 shadow-2xl safe-area-bottom">
        <button
          onClick={() => setActiveTab('dispatch')}
          className={`flex flex-col items-center py-1 px-2 rounded-lg transition relative ${
            activeTab === 'dispatch' ? 'text-amber-400 font-extrabold' : 'hover:text-slate-200'
          }`}
        >
          <Sprout className="w-5 h-5 mb-0.5" />
          <span>Dispatch</span>
          {urgentCount > 0 && (
            <span className="absolute top-0.5 right-1 w-2 h-2 rounded-full bg-fuchsia-500 ring-2 ring-slate-950" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('crew')}
          className={`flex flex-col items-center py-1 px-2 rounded-lg transition ${
            activeTab === 'crew' ? 'text-amber-400 font-extrabold' : 'hover:text-slate-200'
          }`}
        >
          <Smartphone className="w-5 h-5 mb-0.5" />
          <span>Field Crew</span>
        </button>

        <button
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center py-1 px-2 rounded-lg transition ${
            activeTab === 'map' ? 'text-amber-400 font-extrabold' : 'hover:text-slate-200'
          }`}
        >
          <MapPin className="w-5 h-5 mb-0.5" />
          <span>GIS Map</span>
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          className={`flex flex-col items-center py-1 px-2 rounded-lg transition ${
            activeTab === 'customers' ? 'text-amber-400 font-extrabold' : 'hover:text-slate-200'
          }`}
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span>Customers</span>
        </button>

        <button
          onClick={() => setActiveTab('accounting')}
          className={`flex flex-col items-center py-1 px-2 rounded-lg transition relative ${
            activeTab === 'accounting' ? 'text-amber-400 font-extrabold' : 'hover:text-slate-200'
          }`}
        >
          <DollarSign className="w-5 h-5 mb-0.5" />
          <span>Invoices</span>
          {pendingInvoicesCount > 0 && (
            <span className="absolute top-0.5 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-slate-950" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('equipment')}
          className={`flex flex-col items-center py-1 px-2 rounded-lg transition ${
            activeTab === 'equipment' ? 'text-amber-400 font-extrabold' : 'hover:text-slate-200'
          }`}
        >
          <Tractor className="w-5 h-5 mb-0.5" />
          <span>Fleet</span>
        </button>
      </nav>

      {/* Global Modals */}
      <WorkOrderModal />
      <ServicesManagementModal />
    </div>
  );
};

export function App() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}

export default App;
