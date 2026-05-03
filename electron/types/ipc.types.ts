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

export interface WorkspaceSetActiveParams {
  id: string;
}

export interface WorkspaceCreateParams {
  workspace: Workspace;
}

export interface WorkspaceUpdateParams {
  id: string;
  updates: Partial<Workspace>;
}

export interface WorkspaceDeleteParams {
  id: string;
}

export interface MarketingListBlogPostsParams {
  limit?: number;
}

export interface MarketingSaveGeminiApiKeyParams {
  apiKey: string;
}

export interface MarketingGenerateIdeasParams {
  brief?: string;
  selectedPostSlug?: string;
  count?: number;
  channel?: 'linkedin' | 'website' | 'multi';
}

export interface MarketingGenerateImageParams {
  prompt: string;
  channel?: 'linkedin' | 'website-hero' | 'website-inline';
  title?: string;
}

export interface VoiceTranscriptionParams {
  audio: ArrayBuffer;
  mimeType?: string;
}

export interface VoiceTranscriptionResult {
  text: string;
  model: string;
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

export interface ObsidianGetStatusParams {
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

export interface DiagnosticsCheckCommandsParams {
  commands: string[];
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
