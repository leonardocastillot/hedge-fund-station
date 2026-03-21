export type AgentRole =
  | 'commander'
  | 'backtester'
  | 'developer'
  | 'researcher'
  | 'ops'
  | 'executor'
  | 'trader'
  | 'market-structure'
  | 'derivatives'
  | 'execution'
  | 'risk'
  | 'data-engineer';
export type AgentProvider = 'claude' | 'codex' | 'gemini';

export interface AgentProfile {
  id: string;
  name: string;
  role: AgentRole;
  provider: AgentProvider;
  workspaceId: string;
  defaultLaunchProfileId?: string;
  promptTemplate: string;
  objective?: string;
  collaboratesWith?: AgentRole[];
  accentColor: string;
  autoAssignTerminalPurpose: string;
}
