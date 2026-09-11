import React from 'react';
import { AppProvider, useApp } from './data/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopNavbar } from './components/layout/TopNavbar';
import { QuickSearchModal } from './components/layout/QuickSearchModal';
import { AICopilotDrawer } from './components/ai/AICopilotDrawer';

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
  const { activeTab } = useApp();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans select-none antialiased">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNavbar />

        <main className="flex-1 flex min-h-0 overflow-hidden relative">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'rmm' && <RMMView />}
          {activeTab === 'automations' && <AutomationsView />}
          {activeTab === 'patching' && <PatchingView />}
          {activeTab === 'remote-support' && <RemoteSupportView />}
          {activeTab === 'psa-tickets' && <PSATicketsView />}
          {activeTab === 'vault' && <VaultView />}
          {activeTab === 'ai-copilot' && <AICopilotView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

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
