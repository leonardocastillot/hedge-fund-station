import type { AgentProvider } from './agents';

export type MissionConsoleProvider = AgentProvider;
export type MissionConsoleMissionKind = 'development' | 'research' | 'ops' | 'review' | 'custom';
export type MissionConsoleRunStatus =
  | 'shell'
  | 'launching'
  | 'handoff'
  | 'ready'
  | 'waiting-response'
  | 'awaiting-approval'
  | 'running'
  | 'stalled'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface MissionConsoleEvidenceRef {
  id: string;
  kind: string;
  label: string;
  path?: string;
  summary?: string;
  createdAt?: number;
}

export interface MissionConsoleTemplate {
  id: string;
  name: string;
  missionKind: MissionConsoleMissionKind;
  provider?: MissionConsoleProvider;
  goalPlaceholder: string;
  promptTemplate: string;
  outputContract: string;
  recommendedCommands: string[];
}

export interface MissionConsoleRun {
  id: string;
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
  title: string;
  goal: string;
  provider: MissionConsoleProvider;
  missionKind: MissionConsoleMissionKind | string;
  prompt: string;
  status: MissionConsoleRunStatus;
  terminalId?: string;
  commands: string[];
  outputExcerpt?: string;
  outputCapturedAt?: number;
  handoffSummary?: string;
  handoffPath?: string;
  evidenceRefs: MissionConsoleEvidenceRef[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface MissionConsoleAppendSnapshotParams {
  runId: string;
  terminalId?: string;
  status?: MissionConsoleRunStatus;
  outputExcerpt?: string;
  handoffSummary?: string;
  evidenceRefs?: MissionConsoleEvidenceRef[];
}

export interface MissionConsoleExportHandoffResult {
  success: boolean;
  path: string;
  run: MissionConsoleRun;
}
