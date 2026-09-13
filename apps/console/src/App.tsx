import React from 'react';
import { AppProvider, useApp } from './data/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopNavbar } from './components/layout/TopNavbar';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { MobileNavDrawer } from './components/layout/MobileNavDrawer';
import { QuickSearchModal } from './components/layout/QuickSearchModal';
import { AICopilotDrawer } from './components/ai/AICopilotDrawer';

import { LoginView } from './components/auth/LoginView';

import { DashboardView } from './components/dashboard/DashboardView';
import { RMMView } from './components/rmm/RMMView';
import { AutomationsView } from './components/rmm/AutomationsView';
import { PatchingView } from './components/rmm/PatchingView';
import { RemoteSupportView } from './components/remoteSupport/RemoteSupportView';
import { PSATicketsView } from './components/psa/PSATicketsView';
import { VaultView } from './components/vault/VaultView';
import { AICopilotView } from './components/ai/AICopilotView';
import { SettingsView } from './components/settings/SettingsView';

const MainAppContent: React.FC = () => {
  const { isAuthenticated, activeTab, tabs, activeTabId, tabbedNavigationEnabled } = useApp();

  if (!isAuthenticated) {
    return <LoginView />;
  }

  const currentTab = tabs.find(t => t.id === activeTabId);
  const currentViewType = tabbedNavigationEnabled && currentTab ? currentTab.type : activeTab;

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
          {currentViewType === 'psa-tickets' && <PSATicketsView />}
          {currentViewType === 'vault' && <VaultView />}
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

export function App() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}

export default App;
