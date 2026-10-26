import { PSATicket as BasePSATicket } from '@openmsp/api-types';
export * from '@openmsp/api-types';

export interface MiroFishSandbox {
  sandbox_id: string;
  mode: string;
  status: string;
  tested_repos: string[];
  summary: string;
  verification_badge?: string;
  stages?: string[];
  retention_days?: number;
  blue_state?: string;
  green_state?: string;
  last_action_feedback?: string;
}

export interface OrchChatMessage {
  id: string;
  sender: string;
  role: 'operator' | 'orch';
  text: string;
  timestamp: string;
}

export interface PSATicket extends BasePSATicket {
  ticket_scope?: 'MSP_CLIENT' | 'NODALCORTEX_DEVOPS' | 'HERMES_AUTONOMOUS';
  origin_channel?: 'CLIENT_EMAIL' | 'CLIENT_PORTAL' | 'RMM_ALERT' | 'HERMES_ORCH' | 'NODALCORTEX_IMMUNITY';
  suppress_from_client_queue?: boolean;
  assigned_team?: string;
  autonomy_level?: string;
  staged_remediation?: string;
  global_coding_rule?: string;
  cuda_telemetry?: {
    engine?: string;
    embed_model?: string;
    llm_model?: string;
    cloud_429_errors?: number;
  };
  mirofish_sandbox?: MiroFishSandbox;
  root_cause?: string;
  remediation_action?: string;
  orch_conversation_note?: string;
  billable_minutes?: number;
  mirofish_verified?: boolean;
  orch_chat_history?: OrchChatMessage[];
}

export type Ticket = PSATicket;

export interface WorkspaceTab {
  id: string;
  type: import('@openmsp/api-types').NavigationTab | 'device-detail' | 'ticket-detail' | 'probes';
  title: string;
  dataId?: string;
  closable: boolean;
}



