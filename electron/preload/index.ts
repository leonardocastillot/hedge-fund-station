import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Terminal operations - will be implemented in Phase 2
  terminal: {
    create: (id: string, cwd: string, shell?: string, autoCommand?: string) =>
      ipcRenderer.invoke('terminal:create', { id, cwd, shell, autoCommand }),
    write: (id: string, data: string) =>
      ipcRenderer.send('terminal:write', { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('terminal:resize', { id, cols, rows }),
    kill: (id: string) =>
      ipcRenderer.send('terminal:kill', { id }),
    exists: (id: string) =>
      ipcRenderer.invoke('terminal:exists', id),
    getAllIds: () =>
      ipcRenderer.invoke('terminal:getAllIds'),
    getSnapshot: (id: string) =>
      ipcRenderer.invoke('terminal:getSnapshot', id),
    smokeTest: (cwd: string, shell?: string) =>
      ipcRenderer.invoke('terminal:smokeTest', { cwd, shell }),
    onData: (id: string, callback: (data: { id: string; data: string }) => void) => {
      const channel = `terminal:data:${id}`;
      const listener = (_: any, data: { id: string; data: string }) => callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
    onExit: (id: string, callback: (data: { id: string; exitCode: number }) => void) => {
      const channel = `terminal:exit:${id}`;
      const listener = (_: any, data: { id: string; exitCode: number }) => callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
  },

  // Workspace operations - will be implemented in Phase 3
  workspace: {
    getAll: () => ipcRenderer.invoke('workspace:getAll'),
    getActive: () => ipcRenderer.invoke('workspace:getActive'),
    setActive: (id: string) => ipcRenderer.invoke('workspace:setActive', { id }),
    create: (workspace: any) => ipcRenderer.invoke('workspace:create', { workspace }),
    inferFromPath: (workspacePath: string) => ipcRenderer.invoke('workspace:inferFromPath', { workspacePath }),
    update: (id: string, updates: any) => ipcRenderer.invoke('workspace:update', { id, updates }),
    delete: (id: string) => ipcRenderer.invoke('workspace:delete', { id }),
    pickDirectory: () => ipcRenderer.invoke('workspace:pickDirectory')
  },

  ai: {
    getConfigStatus: () => ipcRenderer.invoke('ai:getConfigStatus'),
    saveGeminiApiKey: (apiKey: string) => ipcRenderer.invoke('ai:saveGeminiApiKey', { apiKey })
  },

  voice: {
    transcribe: (audio: ArrayBuffer, mimeType?: string) =>
      ipcRenderer.invoke('voice:transcribe', { audio, mimeType }),
    getLiveStatus: () =>
      ipcRenderer.invoke('voice:getLiveStatus'),
    createLiveToken: (params?: { model?: string }) =>
      ipcRenderer.invoke('voice:createLiveToken', params)
  },

  obsidian: {
    getStatus: (workspacePath: string, vaultPath?: string) =>
      ipcRenderer.invoke('obsidian:getStatus', { workspacePath, vaultPath }),
    ensureVault: (workspacePath: string, vaultPath?: string) =>
      ipcRenderer.invoke('obsidian:ensureVault', { workspacePath, vaultPath }),
    listNotes: (workspacePath: string, vaultPath?: string, limit?: number) =>
      ipcRenderer.invoke('obsidian:listNotes', { workspacePath, vaultPath, limit }),
    searchRelevant: (workspacePath: string, query: string, vaultPath?: string, limit?: number) =>
      ipcRenderer.invoke('obsidian:searchRelevant', { workspacePath, query, vaultPath, limit }),
    listPinned: (workspacePath: string, vaultPath?: string, workspaceId?: string, workspaceName?: string, limit?: number) =>
      ipcRenderer.invoke('obsidian:listPinned', { workspacePath, vaultPath, workspaceId, workspaceName, limit }),
    getGraph: (workspacePath: string, vaultPath?: string) =>
      ipcRenderer.invoke('obsidian:getGraph', { workspacePath, vaultPath }),
    syncStrategyMemory: (workspacePath: string, strategies: any[], vaultPath?: string, learningEvents?: any[]) =>
      ipcRenderer.invoke('obsidian:syncStrategyMemory', { workspacePath, vaultPath, strategies, learningEvents }),
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
    ) =>
      ipcRenderer.invoke('obsidian:exportMission', {
        workspaceName,
        workspacePath,
        title,
        goal,
        summary,
        details,
        vaultPath,
        agentName,
        runtimeProvider
      }),
    openPath: (path: string) =>
      ipcRenderer.invoke('obsidian:openPath', { path }),
    openVault: (vaultPath: string) =>
      ipcRenderer.invoke('obsidian:openVault', { vaultPath })
  },

  diagnostics: {
    checkCommands: (commands: string[], options?: { cwd?: string; shell?: string }) =>
      ipcRenderer.invoke('diagnostics:checkCommands', { commands, ...(options || {}) }),
    shellSmokeTest: (cwd: string, shell?: string) =>
      ipcRenderer.invoke('diagnostics:shellSmokeTest', { cwd, shell }),
    runMissionDrill: (workspaceName: string, workspacePath: string, commands: string[], vaultPath?: string, shell?: string) =>
      ipcRenderer.invoke('diagnostics:runMissionDrill', { workspaceName, workspacePath, commands, vaultPath, shell }),
    launchCodexLogin: () =>
      ipcRenderer.invoke('diagnostics:launchCodexLogin')
  },

  agentLoop: {
    startMission: (params: {
      workspaceId: string;
      workspaceName: string;
      goal: string;
      briefing?: string;
      completionGate: string[];
      guardrails: string[];
      deliverables: string[];
      workflow: Array<{ stageIndex: number; role: string; label: string; objective: string; output: string }>;
      notes?: Array<{ title: string; snippet: string; path?: string }>;
      maxIterations?: number;
    }) => ipcRenderer.invoke('agentLoop:startMission', params),
    getRun: (runId: string) => ipcRenderer.invoke('agentLoop:getRun', { runId }),
    cancelRun: (runId: string) => ipcRenderer.invoke('agentLoop:cancelRun', { runId })
  },

  missionConsole: {
    listRuns: (workspaceId?: string) =>
      ipcRenderer.invoke('missionConsole:listRuns', { workspaceId }),
    saveRun: (run: any) =>
      ipcRenderer.invoke('missionConsole:saveRun', { run }),
    appendSnapshot: (params: any) =>
      ipcRenderer.invoke('missionConsole:appendSnapshot', params),
    exportHandoff: (params: any) =>
      ipcRenderer.invoke('missionConsole:exportHandoff', params)
  },

  external: {
    openUrl: (url: string) => ipcRenderer.invoke('external:openUrl', { url }),
    openUrlInBrave: (url: string) => ipcRenderer.invoke('external:openUrlInBrave', { url }),
    openUrlsInBrave: (urls: string[]) => ipcRenderer.invoke('external:openUrlsInBrave', { urls })
  },

  dev: {
    getStatus: () => ipcRenderer.invoke('dev:getStatus'),
    reloadRenderer: () => ipcRenderer.invoke('dev:reloadRenderer'),
    restartShell: () => ipcRenderer.invoke('dev:restartShell')
  },

  // Update operations
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (callback: (data: any) => void) => {
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on('update:status', listener);
      return () => ipcRenderer.removeListener('update:status', listener);
    }
  }
});
