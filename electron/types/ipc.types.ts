// IPC Type Definitions

export interface LaunchProfileStep {
  command: string;
  delayMs: number;
}

export interface LaunchProfile {
  id: string;
  name: string;
  steps: LaunchProfileStep[];
}

export type WorkspaceKind = 'strategy-pod' | 'hedge-fund' | 'command-hub' | 'project' | 'ops';

export interface DeskBrowserTab {
  id: string;
  title: string;
  url: string;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  kind: WorkspaceKind;
  description: string;
  pinned: boolean;
  default_route: string;
  icon: string;
  color: string;
  default_commands: string[];
  launch_profiles: LaunchProfile[];
  browser_tabs: DeskBrowserTab[];
  shell: string;
  obsidian_vault_path?: string;
  asset_symbol?: string;
  asset_display_name?: string;
  linked_strategy_ids?: string[];
  active_strategy_id?: string;
  strategy_id?: string;
  strategy_display_name?: string;
  strategy_symbol?: string;
  strategy_pod_status?: 'catalog' | 'draft';
  strategy_backend_dir?: string;
  strategy_docs_path?: string;
}

export interface WorkspaceConfig {
  workspaces: Workspace[];
  active_workspace_id: string;
}

export interface TerminalCreateParams {
  id: string;
  cwd: string;
  shell?: string;
  autoCommand?: string;
}

export interface TerminalCreateResult {
  success: boolean;
  error?: string;
  shell?: string;
  cwd?: string;
  normalizedShell?: boolean;
}

export interface TerminalWriteParams {
  id: string;
  data: string;
}

export interface TerminalResizeParams {
  id: string;
  cols: number;
  rows: number;
}

export interface TerminalKillParams {
  id: string;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number;
}

export interface TerminalSnapshot {
  id: string;
  buffer: string;
  cwd?: string;
  shell?: string;
  autoCommand?: string;
  cols: number;
  rows: number;
  exitCode?: number;
}

export interface TerminalSmokeTestResult {
  success: boolean;
  shell: string;
  cwd: string;
  output: string;
  error?: string;
}

export type MissionConsoleProvider = 'codex' | 'claude' | 'gemini' | 'opencode';
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
  missionKind: string;
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
  missionKind: string;
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

export interface MissionConsoleListRunsParams {
  workspaceId?: string;
}

export interface MissionConsoleSaveRunParams {
  run: MissionConsoleRun;
}

export interface MissionConsoleAppendSnapshotParams {
  runId: string;
  terminalId?: string;
  status?: MissionConsoleRunStatus;
  outputExcerpt?: string;
  handoffSummary?: string;
  evidenceRefs?: MissionConsoleEvidenceRef[];
}

export interface MissionConsoleExportHandoffParams {
  runId: string;
  workspacePath?: string;
  summary?: string;
  outputExcerpt?: string;
}

export interface MissionConsoleExportHandoffResult {
  success: boolean;
  path: string;
  run: MissionConsoleRun;
}

export interface WorkspaceSetActiveParams {
  id: string;
}

export interface WorkspaceCreateParams {
  workspace: Workspace;
}

export interface WorkspaceInferParams {
  workspacePath: string;
}

export interface WorkspaceUpdateParams {
  id: string;
  updates: Partial<Workspace>;
}

export interface WorkspaceDeleteParams {
  id: string;
}

export interface AISaveGeminiApiKeyParams {
  apiKey: string;
}

export interface VoiceTranscriptionParams {
  audio: ArrayBuffer;
  mimeType?: string;
}

export interface VoiceTranscriptionResult {
  text: string;
  model: string;
  responseText?: string;
}

export interface GeminiLiveStatus {
  isConfigured: boolean;
  model: string;
  fallbackModel: string;
  keyPreview: string | null;
}

export interface GeminiLiveTokenRequest {
  model?: string;
}

export interface GeminiLiveTokenResponse {
  token: string;
  model: string;
  fallbackModel: string;
  expiresAt: string;
  newSessionExpiresAt: string;
  voiceName: string;
}

export interface ObsidianVaultStatus {
  isAvailable: boolean;
  vaultPath: string | null;
  notesPath: string | null;
}

export interface ObsidianNoteSummary {
  name: string;
  path: string;
  updatedAt: number;
}

export interface ObsidianRelevantNote {
  name: string;
  path: string;
  updatedAt: number;
  score: number;
  snippet: string;
  type?: string;
  domain?: string;
  tags: string[];
  pinned?: boolean;
}

export type ObsidianGraphNodeType =
  | 'strategy'
  | 'strategy-doc'
  | 'backend-package'
  | 'backtest-artifact'
  | 'validation-artifact'
  | 'paper-artifact'
  | 'audit-artifact'
  | 'learning-event'
  | 'agent-memory'
  | 'progress-handoff'
  | 'obsidian-note'
  | 'repo-path';

export interface ObsidianGraphNode {
  id: string;
  type: ObsidianGraphNodeType;
  label: string;
  path?: string;
  repoPath?: string;
  updatedAt?: number | null;
  strategyId?: string | null;
  pipelineStage?: string | null;
  gateStatus?: string | null;
  summary?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ObsidianGraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'wiki-link' | 'repo-path' | 'strategy-doc' | 'backend-package' | 'artifact' | 'related-note' | 'learning-link';
  label?: string;
}

export interface ObsidianGraphResponse {
  generatedAt: string;
  vaultPath: string | null;
  notesPath: string | null;
  nodes: ObsidianGraphNode[];
  edges: ObsidianGraphEdge[];
  warnings: string[];
}

export interface ObsidianStrategyMemoryInput {
  strategyId: string;
  displayName?: string;
  pipelineStage?: string;
  gateStatus?: string;
  gateReasons?: string[];
  sourceTypes?: string[];
  registeredForBacktest?: boolean;
  canBacktest?: boolean;
  documentationPaths?: string[];
  latestArtifactPaths?: Record<string, string | null | undefined>;
  latestBacktestSummary?: Record<string, unknown> | null;
  validationStatus?: string | null;
  evidenceCounts?: Record<string, number>;
  checklist?: Record<string, boolean>;
  missingAuditItems?: string[];
  doublingEstimate?: Record<string, unknown> | null;
}

export interface ObsidianStrategyLearningEventInput {
  eventId: string;
  strategyId: string;
  kind: 'hypothesis' | 'decision' | 'lesson' | 'postmortem' | 'rule_change';
  outcome: 'win' | 'loss' | 'mixed' | 'unknown';
  stage?: string | null;
  title: string;
  summary?: string;
  evidencePaths?: string[];
  lesson?: string | null;
  ruleChange?: string | null;
  nextAction?: string | null;
  generatedAt?: string | null;
  path?: string | null;
}

export interface ObsidianGetStatusParams {
  workspacePath: string;
  vaultPath?: string;
}

export interface ObsidianEnsureVaultParams {
  workspacePath: string;
  vaultPath?: string;
}

export interface ObsidianListNotesParams {
  workspacePath: string;
  vaultPath?: string;
  limit?: number;
}

export interface ObsidianExportMissionParams {
  workspaceName: string;
  workspacePath: string;
  vaultPath?: string;
  title: string;
  goal: string;
  summary: string;
  details?: string;
  agentName?: string;
  runtimeProvider?: string;
}

export interface ObsidianOpenPathParams {
  path: string;
}

export interface ObsidianOpenVaultParams {
  vaultPath: string;
}

export interface ObsidianSearchRelevantParams {
  workspacePath: string;
  vaultPath?: string;
  query: string;
  limit?: number;
}

export interface ObsidianListPinnedParams {
  workspacePath: string;
  vaultPath?: string;
  workspaceId?: string;
  workspaceName?: string;
  limit?: number;
}

export interface ObsidianGetGraphParams {
  workspacePath: string;
  vaultPath?: string;
}

export interface ObsidianSyncStrategyMemoryParams {
  workspacePath: string;
  vaultPath?: string;
  strategies: ObsidianStrategyMemoryInput[];
  learningEvents?: ObsidianStrategyLearningEventInput[];
}

export interface ObsidianSyncStrategyMemoryResult {
  vaultPath: string;
  notesPath: string;
  created: number;
  updated: number;
  skipped: number;
  writtenFiles: string[];
  skippedFiles: string[];
  warnings: string[];
}

export interface DiagnosticsCheckCommandsParams {
  commands: string[];
  cwd?: string;
  shell?: string;
}

export interface DiagnosticsCommandStatus {
  command: string;
  available: boolean;
  resolvedPath?: string;
}

export interface DiagnosticsShellSmokeTestParams {
  cwd: string;
  shell?: string;
}

export interface DiagnosticsShellSmokeTestResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface DiagnosticsMissionDrillParams {
  workspaceName: string;
  workspacePath: string;
  vaultPath?: string;
  shell?: string;
  commands: string[];
}

export interface DiagnosticsMissionDrillResult {
  success: boolean;
  checkedAt: string;
  summary: string;
  commandStatuses: DiagnosticsCommandStatus[];
  shell: DiagnosticsShellSmokeTestResult;
  notePath?: string;
  errors: string[];
}

export interface DiagnosticsDataFootprintParams {
  workspacePath: string;
}

export interface DiagnosticsDataFootprintResult {
  dataRoot: string;
  dbPath: string;
  dataDirBytes: number | null;
  dbBytes: number | null;
  warningThresholdBytes: number;
  isHeavy: boolean;
  detail: string;
}

export interface DiagnosticsProcessMetric {
  pid: number;
  type: string;
  serviceName?: string;
  cpuPercent: number;
  idleWakeupsPerSecond: number;
  workingSetBytes: number;
}

export interface DiagnosticsPerformanceSnapshotResult {
  capturedAt: string;
  processes: DiagnosticsProcessMetric[];
  totals: {
    cpuPercent: number;
    workingSetBytes: number;
    rendererCount: number;
    gpuCount: number;
  };
}

export interface DevServiceStatus {
  ok: boolean;
  url: string;
  checkedUrls?: string[];
  statusCode?: number;
  latencyMs?: number;
  stale?: boolean;
  detail?: string;
  error?: string;
}

export interface DevStatus {
  isDevelopment: boolean;
  rendererLive: boolean;
  nativeRestartRequired: boolean;
  nativeChangedPaths: string[];
  checkedAt: string;
  services: {
    vite: DevServiceStatus;
    gateway: DevServiceStatus;
    backend: DevServiceStatus;
  };
}

export interface AgentLoopMemoryNote {
  title: string;
  snippet: string;
  path?: string;
}

export interface AgentLoopWorkflowStep {
  stageIndex: number;
  role: string;
  label: string;
  objective: string;
  output: string;
}

export interface AgentLoopStartParams {
  workspaceId: string;
  workspaceName: string;
  goal: string;
  briefing?: string;
  completionGate: string[];
  guardrails: string[];
  deliverables: string[];
  workflow: AgentLoopWorkflowStep[];
  notes?: AgentLoopMemoryNote[];
  maxIterations?: number;
}

export interface AgentLoopStageUpdate {
  stageIndex: number;
  label: string;
  summary: string;
  artifact?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface AgentLoopRunSnapshot {
  id: string;
  workspaceId: string;
  workspaceName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  summary: string;
  decision: string;
  confidence: 'low' | 'medium' | 'high';
  nextAction: string;
  iteration: number;
  maxIterations: number;
  verificationSummary: string;
  unmetGates: string[];
  blockers: string[];
  suggestedOps: string[];
  stageUpdates: AgentLoopStageUpdate[];
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  error?: string;
}
