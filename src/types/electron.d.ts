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

export interface MarketingBlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingTime: string;
  tag: string;
  filePath: string;
  url: string;
  excerpt: string;
  updatedAt: string;
}

export interface MarketingAutomationRunResult {
  post: MarketingBlogPost | null;
  stdout: string;
  stderr: string;
}

export interface MarketingAIConfigStatus {
  isConfigured: boolean;
  hasApiKey: boolean;
  imageModel: string;
  textModel: string;
  assetsDir: string;
  keyPreview: string | null;
}

export interface MarketingGeneratedIdea {
  id: string;
  title: string;
  hook: string;
  summary: string;
  channel: 'linkedin' | 'website' | 'multi';
  angle: string;
  cta: string;
  imagePrompt: string;
  linkedinDraft: string;
  websiteDraft: string;
  sourceSlug?: string;
}

export interface MarketingGeneratedImageResult {
  filePath: string;
  dataUrl: string;
  mimeType: string;
  prompt: string;
  channel: 'linkedin' | 'website-hero' | 'website-inline';
  width: number;
  height: number;
  createdAt: string;
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

export interface ElectronAPI {
  terminal: {
    create: (id: string, cwd: string, shell?: string, autoCommand?: string) => Promise<{ success: boolean; error?: string }>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    kill: (id: string) => void;
    exists: (id: string) => Promise<boolean>;
    getAllIds: () => Promise<string[]>;
    getSnapshot?: (id: string) => Promise<TerminalSnapshot | null>;
    onData: (id: string, callback: (data: { id: string; data: string }) => void) => () => void;
    onExit: (id: string, callback: (data: { id: string; exitCode: number }) => void) => () => void;
  };
  workspace: {
    getAll: () => Promise<Workspace[]>;
    getActive: () => Promise<Workspace>;
    setActive: (id: string) => Promise<void>;
    create: (workspace: Workspace) => Promise<void>;
    update: (id: string, updates: Partial<Workspace>) => Promise<void>;
    delete: (id: string) => Promise<void>;
    pickDirectory: () => Promise<string | null>;
  };
  marketing: {
    runAutoBlogger: () => Promise<MarketingAutomationRunResult>;
    listBlogPosts: (limit?: number) => Promise<MarketingBlogPost[]>;
    getAIConfigStatus: () => Promise<MarketingAIConfigStatus>;
    saveGeminiApiKey: (apiKey: string) => Promise<MarketingAIConfigStatus>;
    generateIdeas: (params: {
      brief?: string;
      selectedPostSlug?: string;
      count?: number;
      channel?: 'linkedin' | 'website' | 'multi';
    }) => Promise<MarketingGeneratedIdea[]>;
    generateImage: (params: {
      prompt: string;
      channel?: 'linkedin' | 'website-hero' | 'website-inline';
      title?: string;
    }) => Promise<MarketingGeneratedImageResult>;
  };
  voice: {
    transcribe: (audio: ArrayBuffer, mimeType?: string) => Promise<VoiceTranscriptionResult>;
    getLiveStatus: () => Promise<GeminiLiveStatus>;
    createLiveToken: (params?: { model?: string }) => Promise<GeminiLiveTokenResponse>;
  };
  obsidian: {
    getStatus: (workspacePath: string, vaultPath?: string) => Promise<ObsidianVaultStatus>;
    listNotes: (workspacePath: string, vaultPath?: string, limit?: number) => Promise<ObsidianNoteSummary[]>;
    searchRelevant: (workspacePath: string, query: string, vaultPath?: string, limit?: number) => Promise<ObsidianRelevantNote[]>;
    listPinned: (workspacePath: string, vaultPath?: string, workspaceId?: string, workspaceName?: string, limit?: number) => Promise<ObsidianRelevantNote[]>;
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
  };
  diagnostics: {
    checkCommands: (commands: string[]) => Promise<DiagnosticsCommandStatus[]>;
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
  external: {
    openUrl: (url: string) => Promise<{ success: boolean }>;
    openUrlInBrave: (url: string) => Promise<{ success: boolean; fallback: boolean }>;
    openUrlsInBrave: (urls: string[]) => Promise<{ success: boolean; results: Array<{ success: boolean; fallback: boolean }> }>;
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
