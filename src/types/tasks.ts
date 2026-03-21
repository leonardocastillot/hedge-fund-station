import type { AgentRole } from './agents';

export type TaskStatus = 'queued' | 'routing' | 'running' | 'completed' | 'failed';
export type RunLaunchMode = 'profile' | 'direct' | 'loop';
export type RunLaunchState = 'launching' | 'ready' | 'attention' | 'verifying';
export type MissionDepth = 'focused' | 'deep';
export type MissionExecutionMode = 'solo' | 'squad' | 'pipeline';
export type MissionDecision =
  | 'pending'
  | 'reject'
  | 'needs-more-data'
  | 'ready-for-backtest'
  | 'ready-for-paper'
  | 'ready-for-build';
export type MissionReviewConfidence = 'low' | 'medium' | 'high';
export type MissionStageReviewStatus = 'pending' | 'running' | 'completed' | 'failed';
export type MissionActionStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface MissionWorkflowStep {
  role: AgentRole;
  label: string;
  objective: string;
  output: string;
  handoff?: string;
}

export interface MissionTaskMetadata {
  mode: string;
  depth: MissionDepth;
  executionMode: MissionExecutionMode;
  routeRoles: AgentRole[];
  deliverables: string[];
  datasets: string[];
  successCriteria: string[];
  guardrails: string[];
  guidedInput: string;
  workflow: MissionWorkflowStep[];
  appSurfaces: string[];
  backendCapabilities: string[];
  completionGate: string[];
  briefing?: string;
}

export interface MissionStageReview {
  stageIndex: number;
  role: AgentRole;
  label: string;
  objective: string;
  status: MissionStageReviewStatus;
  summary: string;
  artifact?: string;
  updatedAt?: number;
}

export interface MissionReview {
  decision: MissionDecision;
  confidence: MissionReviewConfidence;
  summary: string;
  nextAction: string;
  updatedAt?: number;
}

export interface MissionActionRecord {
  id: string;
  key: string;
  label: string;
  status: MissionActionStatus;
  summary: string;
  updatedAt?: number;
}

export interface CommanderTask {
  id: string;
  title: string;
  goal: string;
  workspaceId: string;
  status: TaskStatus;
  createdAt: number;
  mission?: MissionTaskMetadata;
  stageReviews?: MissionStageReview[];
  review?: MissionReview;
  actions?: MissionActionRecord[];
}

export interface TaskRun {
  id: string;
  taskId: string;
  agentId: string;
  agentName: string;
  agentRole?: AgentRole;
  stageIndex?: number;
  stageLabel?: string;
  runtimeProvider: 'claude' | 'codex' | 'gemini';
  workspaceId: string;
  status: TaskStatus;
  launchMode: RunLaunchMode;
  launchState: RunLaunchState;
  summary: string;
  outputExcerpt?: string;
  outputCapturedAt?: number;
  terminalIds: string[];
  loopRunId?: string;
  loopIteration?: number;
  loopMaxIterations?: number;
  verificationSummary?: string;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
}
