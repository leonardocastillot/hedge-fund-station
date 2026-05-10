// Type definitions for window.electronAPI

export interface LaunchProfileStep {
  command: string;
  delayMs: number;
}

export interface LaunchProfile {
  id: string;
  name: string;
  steps: LaunchProfileStep[];
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  icon: string;
  color: string;
  default_commands: string[];
  launch_profiles: LaunchProfile[];
  shell: string;
  obsidian_vault_path?: string;
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

export interface DiagnosticsCommandStatus {
  command: string;
  available: boolean;
  resolvedPath?: string;
}

export interface DiagnosticsShellSmokeTestResult {
  success: boolean;
  output: string;
  error?: string;
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

export interface DevServiceStatus {
  ok: boolean;
  url: string;
  statusCode?: number;
  latencyMs?: number;
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

export type MissionConsoleProvider = 'codex' | 'claude' | 'gemini';
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

export interface AIConfigStatus {
  isConfigured: boolean;
  hasGeminiApiKey: boolean;
  textModel: string;
  liveModel: string;
  keyPreview: string | null;
}

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  data: {
    message: string;
    version?: string;
    percent?: number;
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
    releaseNotes?: string;
    releaseDate?: string;
    error?: string;
  };
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

export interface GeminiLiveTokenResponse {
  token: string;
  model: string;
  fallbackModel: string;
  expiresAt: string;
  newSessionExpiresAt: string;
  voiceName: string;
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

export interface ElectronAPI {
  terminal: {
    create: (id: string, cwd: string, shell?: string, autoCommand?: string) => Promise<{ success: boolean; error?: string }>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    kill: (id: string) => void;
    exists: (id: string) => Promise<boolean>;
    getAllIds: () => Promise<string[]>;
    getSnapshot?: (id: string) => Promise<TerminalSnapshot | null>;
    smokeTest: (cwd: string, shell?: string) => Promise<TerminalSmokeTestResult>;
    onData: (id: string, callback: (data: { id: string; data: string }) => void) => () => void;
    onExit: (id: string, callback: (data: { id: string; exitCode: number }) => void) => () => void;
  };
  workspace: {
    getAll: () => Promise<Workspace[]>;
    getActive: () => Promise<Workspace>;
    setActive: (id: string) => Promise<void>;
    create: (workspace: Workspace) => Promise<void>;
    inferFromPath: (workspacePath: string) => Promise<Workspace>;
    update: (id: string, updates: Partial<Workspace>) => Promise<void>;
    delete: (id: string) => Promise<void>;
    pickDirectory: () => Promise<string | null>;
  };
  ai: {
    getConfigStatus: () => Promise<AIConfigStatus>;
    saveGeminiApiKey: (apiKey: string) => Promise<AIConfigStatus>;
  };
  voice: {
    transcribe: (audio: ArrayBuffer, mimeType?: string) => Promise<VoiceTranscriptionResult>;
    getLiveStatus: () => Promise<GeminiLiveStatus>;
    createLiveToken: (params?: { model?: string }) => Promise<GeminiLiveTokenResponse>;
  };
  obsidian: {
    getStatus: (workspacePath: string, vaultPath?: string) => Promise<ObsidianVaultStatus>;
    ensureVault: (workspacePath: string, vaultPath?: string) => Promise<ObsidianVaultStatus>;
    listNotes: (workspacePath: string, vaultPath?: string, limit?: number) => Promise<ObsidianNoteSummary[]>;
    searchRelevant: (workspacePath: string, query: string, vaultPath?: string, limit?: number) => Promise<ObsidianRelevantNote[]>;
    listPinned: (workspacePath: string, vaultPath?: string, workspaceId?: string, workspaceName?: string, limit?: number) => Promise<ObsidianRelevantNote[]>;
    getGraph: (workspacePath: string, vaultPath?: string) => Promise<ObsidianGraphResponse>;
    syncStrategyMemory: (
      workspacePath: string,
      strategies: ObsidianStrategyMemoryInput[],
      vaultPath?: string,
      learningEvents?: ObsidianStrategyLearningEventInput[]
    ) => Promise<ObsidianSyncStrategyMemoryResult>;
    exportMission: (
      workspaceName: string,
      workspacePath: string,
      title: string,
      goal: string,
      summary: string,
      details?: string,
      vaultPath?: string,
      agentName?: string,
      runtimeProvider?: string
    ) => Promise<{ filePath: string }>;
    openPath: (path: string) => Promise<{ success: boolean }>;
    openVault: (vaultPath: string) => Promise<{ success: boolean; fallback: boolean }>;
  };
  diagnostics: {
    checkCommands: (commands: string[], options?: { cwd?: string; shell?: string }) => Promise<DiagnosticsCommandStatus[]>;
    shellSmokeTest: (cwd: string, shell?: string) => Promise<DiagnosticsShellSmokeTestResult>;
    runMissionDrill: (workspaceName: string, workspacePath: string, commands: string[], vaultPath?: string, shell?: string) => Promise<DiagnosticsMissionDrillResult>;
    launchCodexLogin: () => Promise<{ success: boolean; command: string; error?: string }>;
  };
    agentLoop: {
    startMission: (params: {
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
    }) => Promise<AgentLoopRunSnapshot>;
      getRun: (runId: string) => Promise<AgentLoopRunSnapshot | null>;
      cancelRun: (runId: string) => Promise<{ success: boolean }>;
    };
    missionConsole: {
      listRuns: (workspaceId?: string) => Promise<MissionConsoleRun[]>;
      saveRun: (run: MissionConsoleRun) => Promise<MissionConsoleRun>;
      appendSnapshot: (params: MissionConsoleAppendSnapshotParams) => Promise<MissionConsoleRun>;
      exportHandoff: (params: {
        runId: string;
        workspacePath?: string;
        summary?: string;
        outputExcerpt?: string;
      }) => Promise<MissionConsoleExportHandoffResult>;
    };
    external: {
    openUrl: (url: string) => Promise<{ success: boolean }>;
    openUrlInBrave: (url: string) => Promise<{ success: boolean; fallback: boolean }>;
    openUrlsInBrave: (urls: string[]) => Promise<{ success: boolean; results: Array<{ success: boolean; fallback: boolean }> }>;
  };
  dev?: {
    getStatus: () => Promise<DevStatus>;
    reloadRenderer: () => Promise<{ success: boolean }>;
    restartShell: () => Promise<{ success: boolean }>;
  };
  update: {
    check: () => Promise<{ success: boolean }>;
    download: () => Promise<{ success: boolean }>;
    install: () => Promise<{ success: boolean }>;
    onStatus: (callback: (data: UpdateStatus) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
