import React from 'react';
import { AppProvider, useApp } from './data/AppContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Sidebar } from './components/layout/Sidebar';
import { TopNavbar } from './components/layout/TopNavbar';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { MobileNavDrawer } from './components/layout/MobileNavDrawer';
import { QuickSearchModal } from './components/layout/QuickSearchModal';
import { AICopilotDrawer } from './components/ai/AICopilotDrawer';

import { LoginView } from './components/auth/LoginView';
import { DispatchApp } from './components/dispatch/DispatchApp';

import { DashboardView } from './components/dashboard/DashboardView';
import { RMMView } from './components/rmm/RMMView';
import { AutomationsView } from './components/rmm/AutomationsView';
import { PatchingView } from './components/rmm/PatchingView';
import { RemoteSupportView } from './components/remoteSupport/RemoteSupportView';
import { NetworkMapView } from './components/network/NetworkMapView';
import { PSATicketsView } from './components/psa/PSATicketsView';
import { VaultView } from './components/vault/VaultView';
import { AICopilotView } from './components/ai/AICopilotView';
import { SettingsView } from './components/settings/SettingsView';
import { MdmView } from './components/mdm/MdmView';
import { SecuritySocView } from './components/security/SecuritySocView';
import { BackupDashboardView } from './components/backups/BackupDashboardView';
import { ClientsView } from './components/clients/ClientsView';
import { BillingView } from './components/billing/BillingView';
import { PublicInvoicePage } from './components/billing/PublicInvoicePage';
import { OnboardPage } from './components/onboard/OnboardPage';
import { BillingProvider } from './data/BillingContext';

const MainAppContent: React.FC = () => {
  const { isAuthenticated, activeTab, tabs, activeTabId, tabbedNavigationEnabled } = useApp();

  if (!isAuthenticated) {
    return <LoginView />;
  }

  const isDirectSocRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/soc') || window.location.pathname.startsWith('/sharkfin'));
  const isDirectBackupsRoute =
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/backups');
  const currentTab = tabs.find(t => t.id === activeTabId);
  const currentViewType = isDirectBackupsRoute
    ? 'backups'
    : isDirectSocRoute
    ? 'security-soc'
    : (tabbedNavigationEnabled && currentTab ? currentTab.type : activeTab);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f6f8] text-[#1a1a24] font-sans select-none antialiased">
      {/* Desktop SuperOps Dual-Sidebar Navigation */}
      <Sidebar />

      {/* Main Workspace Canvas */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#f4f6f8] relative">
        <TopNavbar />

        <main className="flex-1 flex min-h-0 overflow-hidden relative bg-[#f4f6f8] pb-16 md:pb-0">
          {currentViewType === 'dashboard' && <DashboardView />}
          {currentViewType === 'rmm' && <RMMView />}
          {currentViewType === 'automations' && <AutomationsView />}
          {currentViewType === 'patching' && <PatchingView />}
          {currentViewType === 'remote-support' && <RemoteSupportView />}
          {currentViewType === 'network-map' && <NetworkMapView />}
          {currentViewType === 'mdm' && <MdmView />}
          {currentViewType === 'security-soc' && <SecuritySocView />}
          {currentViewType === 'backups' && <BackupDashboardView />}
          {currentViewType === 'psa-tickets' && <PSATicketsView />}
          {currentViewType === 'vault' && <VaultView />}
          {currentViewType === 'clients' && <ClientsView />}
          {currentViewType === 'billing' && <BillingView />}
          {currentViewType === 'ai-copilot' && <AICopilotView />}
          {currentViewType === 'settings' && <SettingsView />}
        </main>

        {/* Mobile iOS-Style Bottom Navigation Bar */}
        <MobileBottomNav />
      </div>

      {/* Mobile Slide-Over Navigation Drawer */}
      <MobileNavDrawer />

      {/* Modals & AI Side Drawers */}
      <QuickSearchModal />
      <AICopilotDrawer />
    </div>
  );
};

// Route to the installable mobile dispatch PWA at /dispatch (shares auth + the
// live WebSocket with the desktop console via AppProvider), else the console.
const AppRouter: React.FC = () => {
  const isDispatch = typeof window !== 'undefined' && window.location.pathname.startsWith('/dispatch');
  return isDispatch ? <DispatchApp /> : (
    <BillingProvider>
      <MainAppContent />
    </BillingProvider>
  );
};

export function App() {
  // Public zero-touch machine onboarding portal (no login): /onboard
  if (
    typeof window !== 'undefined' &&
    (window.location.pathname.toLowerCase() === '/onboard' ||
      window.location.pathname.toLowerCase().startsWith('/onboard/'))
  ) {
    return (
      <ErrorBoundary>
        <OnboardPage />
      </ErrorBoundary>
    );
  }
  // Client-facing invoice / quote page (no login): /invoice/<publicToken>
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/invoice/')) {
    return (
      <ErrorBoundary>
        <PublicInvoicePage token={decodeURIComponent(window.location.pathname.split('/')[2] || '')} />
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppRouter />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
