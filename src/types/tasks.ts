import type { AgentRole } from './agents';
import type { AgentProvider } from './agents';

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
export type MissionApprovalStatus =
  | 'draft'
  | 'awaiting-approval'
  | 'approved'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MissionChatMessageRole = 'user' | 'assistant' | 'system';

export type MissionBackendActionKind = 'agent-research' | 'agent-audit' | 'hf-command';
export type MissionBackendActionStatus = 'proposed' | 'running' | 'completed' | 'failed' | 'skipped';
export type MissionArtifactKind = 'agent-run' | 'backtest' | 'validation' | 'paper' | 'terminal' | 'command';

export interface MissionRuntimePlan {
  preferredRuntime: AgentProvider;
  backendRuntime: 'auto' | 'codex-local' | 'api-provider' | 'deterministic';
  codexConnected?: boolean;
  claudeAvailable?: boolean;
  apiProviderAvailable?: boolean;
  defaultModel?: string | null;
  summary: string;
}

export interface MissionBackendAction {
  id: string;
  kind: MissionBackendActionKind;
  label: string;
  command: string;
  strategyId?: string;
  status: MissionBackendActionStatus;
  runId?: string;
  path?: string;
  summary?: string;
  updatedAt?: number;
}

export interface MissionArtifactRef {
  id: string;
  kind: MissionArtifactKind;
  label: string;
  path?: string;
  runId?: string;
  strategyId?: string;
  summary?: string;
  createdAt?: number;
}

export interface MissionPacket {
  missionId: string;
  workspaceId: string;
  mode: string;
  goal: string;
  strategyId?: string;
  runtimePlan: MissionRuntimePlan;
  frontierRuntime: AgentProvider;
  backendActions: MissionBackendAction[];
  evidenceRefs: MissionArtifactRef[];
  guardrails: string[];
  approvalState: MissionApprovalStatus;
  outputs: MissionArtifactRef[];
}

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

export interface MissionChatMessage {
  id: string;
  workspaceId: string;
  taskId?: string;
  draftId?: string;
  role: MissionChatMessageRole;
  content: string;
  createdAt: number;
}

export interface MissionDraft {
  id: string;
  workspaceId: string;
  taskId?: string;
  title: string;
  goal: string;
  mode: string;
  suggestedRoles: AgentRole[];
  proposedCommands: string[];
  risks: string[];
  finalPrompt: string;
  missionPacket?: MissionPacket;
  approvalStatus: MissionApprovalStatus;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  runId?: string;
  terminalIds?: string[];
  error?: string;
}

export interface ApprovedMission {
  draftId: string;
  workspaceId: string;
  title: string;
  goal: string;
  finalPrompt: string;
  suggestedRoles: AgentRole[];
  proposedCommands: string[];
}

export interface CommanderTask {
  id: string;
  title: string;
  goal: string;
  workspaceId: string;
  status: TaskStatus;
  approvalStatus?: MissionApprovalStatus;
  draftId?: string;
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
