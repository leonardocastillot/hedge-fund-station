import { dialog, ipcMain } from 'electron';
import { PTYManager } from './pty-manager';
import { WorkspaceManager } from './workspace-manager';
import { MarketingAutomationManager } from './marketing-automation';
import { ObsidianManager } from './obsidian-manager';
import { DiagnosticsManager } from './diagnostics-manager';
import { AgentLoopManager } from './agent-loop-manager';
import type {
  TerminalCreateParams,
  TerminalWriteParams,
  TerminalResizeParams,
  TerminalKillParams,
  WorkspaceSetActiveParams,
  WorkspaceCreateParams,
  WorkspaceUpdateParams,
  WorkspaceDeleteParams,
  MarketingListBlogPostsParams,
  MarketingSaveGeminiApiKeyParams,
  MarketingGenerateIdeasParams,
  MarketingGenerateImageParams,
  VoiceTranscriptionParams,
  ObsidianGetStatusParams,
  ObsidianListNotesParams,
  ObsidianSearchRelevantParams,
  ObsidianListPinnedParams,
  ObsidianExportMissionParams,
  ObsidianOpenPathParams,
  DiagnosticsCheckCommandsParams,
  DiagnosticsShellSmokeTestParams,
  DiagnosticsMissionDrillParams,
  AgentLoopStartParams
} from '../types/ipc.types';
import { VoiceTranscriptionManager } from './voice-transcription';

export function registerTerminalHandlers(ptyManager: PTYManager): void {
  // Terminal: Create
  ipcMain.handle('terminal:create', async (_event, params: TerminalCreateParams) => {
    const { id, cwd, shell, autoCommand } = params;
    try {
      ptyManager.createTerminal(id, cwd, shell, autoCommand);
      return { success: true };
    } catch (error) {
      console.error('Failed to create terminal:', error);
      return { success: false, error: String(error) };
    }
  });

  // Terminal: Write
  ipcMain.on('terminal:write', (_event, params: TerminalWriteParams) => {
    const { id, data } = params;
    ptyManager.writeToTerminal(id, data);
  });

  // Terminal: Resize
  ipcMain.on('terminal:resize', (_event, params: TerminalResizeParams) => {
    const { id, cols, rows } = params;
    ptyManager.resizeTerminal(id, cols, rows);
  });

  // Terminal: Kill
  ipcMain.on('terminal:kill', (_event, params: TerminalKillParams) => {
    const { id } = params;
    ptyManager.killTerminal(id);
  });

  // Terminal: Check if exists
  ipcMain.handle('terminal:exists', async (_event, terminalId: string) => {
    return ptyManager.terminalExists(terminalId);
  });

  // Terminal: Get all active IDs
  ipcMain.handle('terminal:getAllIds', async () => {
    return ptyManager.getAllTerminalIds();
  });

  ipcMain.handle('terminal:getSnapshot', async (_event, terminalId: string) => {
    return ptyManager.getTerminalSnapshot(terminalId);
  });
}

export function registerWorkspaceHandlers(workspaceManager: WorkspaceManager): void {
  // Workspace: Get All
  ipcMain.handle('workspace:getAll', async () => {
    try {
      return workspaceManager.getAll();
    } catch (error) {
      console.error('Failed to get workspaces:', error);
      throw error;
    }
  });

  // Workspace: Get Active
  ipcMain.handle('workspace:getActive', async () => {
    try {
      return workspaceManager.getActive();
    } catch (error) {
      console.error('Failed to get active workspace:', error);
      throw error;
    }
  });

  // Workspace: Set Active
  ipcMain.handle('workspace:setActive', async (_event, params: WorkspaceSetActiveParams) => {
    const { id } = params;
    try {
      workspaceManager.setActive(id);
      return { success: true };
    } catch (error) {
      console.error('Failed to set active workspace:', error);
      throw error;
    }
  });

  // Workspace: Create
  ipcMain.handle('workspace:create', async (_event, params: WorkspaceCreateParams) => {
    const { workspace } = params;
    try {
      workspaceManager.create(workspace);
      return { success: true };
    } catch (error) {
      console.error('Failed to create workspace:', error);
      throw error;
    }
  });

  // Workspace: Update
  ipcMain.handle('workspace:update', async (_event, params: WorkspaceUpdateParams) => {
    const { id, updates } = params;
    try {
      workspaceManager.update(id, updates);
      return { success: true };
    } catch (error) {
      console.error('Failed to update workspace:', error);
      throw error;
    }
  });

  // Workspace: Delete
  ipcMain.handle('workspace:delete', async (_event, params: WorkspaceDeleteParams) => {
    const { id } = params;
    try {
      workspaceManager.delete(id);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete workspace:', error);
      throw error;
    }
  });

  ipcMain.handle('workspace:pickDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });
}

export function registerMarketingHandlers(marketingAutomationManager: MarketingAutomationManager): void {
  ipcMain.handle('marketing:runAutoBlogger', async () => {
    try {
      return await marketingAutomationManager.runAutoBlogger();
    } catch (error) {
      console.error('Failed to run auto-blogger:', error);
      throw error;
    }
  });

  ipcMain.handle('marketing:listBlogPosts', async (_event, params?: MarketingListBlogPostsParams) => {
    try {
      return marketingAutomationManager.listRecentBlogPosts(params?.limit ?? 8);
    } catch (error) {
      console.error('Failed to list blog posts:', error);
      throw error;
    }
  });

  ipcMain.handle('marketing:getAIConfigStatus', async () => {
    try {
      return marketingAutomationManager.getAIConfigStatus();
    } catch (error) {
      console.error('Failed to get marketing AI config status:', error);
      throw error;
    }
  });

  ipcMain.handle('marketing:saveGeminiApiKey', async (_event, params: MarketingSaveGeminiApiKeyParams) => {
    try {
      return marketingAutomationManager.saveGeminiApiKey(params.apiKey);
    } catch (error) {
      console.error('Failed to save Gemini API key:', error);
      throw error;
    }
  });

  ipcMain.handle('marketing:generateIdeas', async (_event, params: MarketingGenerateIdeasParams) => {
    try {
      return marketingAutomationManager.generatePostIdeas(params);
    } catch (error) {
      console.error('Failed to generate marketing ideas:', error);
      throw error;
    }
  });

  ipcMain.handle('marketing:generateImage', async (_event, params: MarketingGenerateImageParams) => {
    try {
      return marketingAutomationManager.generateImage(params);
    } catch (error) {
      console.error('Failed to generate marketing image:', error);
      throw error;
    }
  });
}

export function registerVoiceHandlers(voiceTranscriptionManager: VoiceTranscriptionManager): void {
  ipcMain.handle('voice:transcribe', async (_event, params: VoiceTranscriptionParams) => {
    try {
      return await voiceTranscriptionManager.transcribe(params);
    } catch (error) {
      console.error('Failed to transcribe audio:', error);
      throw error;
    }
  });
}

export function registerObsidianHandlers(obsidianManager: ObsidianManager): void {
  ipcMain.handle('obsidian:getStatus', async (_event, params: ObsidianGetStatusParams) => {
    return obsidianManager.getStatus(params);
  });

  ipcMain.handle('obsidian:listNotes', async (_event, params: ObsidianListNotesParams) => {
    return obsidianManager.listNotes(params);
  });

  ipcMain.handle('obsidian:searchRelevant', async (_event, params: ObsidianSearchRelevantParams) => {
    return obsidianManager.searchRelevant(params);
  });

  ipcMain.handle('obsidian:listPinned', async (_event, params: ObsidianListPinnedParams) => {
    return obsidianManager.listPinned(params);
  });

  ipcMain.handle('obsidian:exportMission', async (_event, params: ObsidianExportMissionParams) => {
    return obsidianManager.exportMission(params);
  });

  ipcMain.handle('obsidian:openPath', async (_event, params: ObsidianOpenPathParams) => {
    return obsidianManager.openPath(params);
  });
}

export function registerDiagnosticsHandlers(diagnosticsManager: DiagnosticsManager): void {
  ipcMain.handle('diagnostics:checkCommands', async (_event, params: DiagnosticsCheckCommandsParams) => {
    return diagnosticsManager.checkCommands(params);
  });

  ipcMain.handle('diagnostics:shellSmokeTest', async (_event, params: DiagnosticsShellSmokeTestParams) => {
    return diagnosticsManager.shellSmokeTest(params);
  });

  ipcMain.handle('diagnostics:runMissionDrill', async (_event, params: DiagnosticsMissionDrillParams) => {
    return diagnosticsManager.runMissionDrill(params);
  });
}

export function registerAgentLoopHandlers(agentLoopManager: AgentLoopManager): void {
  ipcMain.handle('agentLoop:startMission', async (_event, params: AgentLoopStartParams) => {
    return agentLoopManager.startMission(params);
  });

  ipcMain.handle('agentLoop:getRun', async (_event, params: { runId: string }) => {
    return agentLoopManager.getRun(params.runId);
  });

  ipcMain.handle('agentLoop:cancelRun', async (_event, params: { runId: string }) => {
    return agentLoopManager.cancelRun(params.runId);
  });
}
