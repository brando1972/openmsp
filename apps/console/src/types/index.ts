export * from '@openmsp/api-types';

export interface WorkspaceTab {
  id: string;
  type: import('@openmsp/api-types').NavigationTab | 'device-detail' | 'ticket-detail' | 'probes';
  title: string;
  dataId?: string;
  closable: boolean;
}


