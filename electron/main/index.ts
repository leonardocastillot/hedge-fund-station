import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import { PTYManager } from './pty-manager';
import { WorkspaceManager } from './workspace-manager';
import { registerAgentLoopHandlers, registerDiagnosticsHandlers, registerMarketingHandlers, registerObsidianHandlers, registerTerminalHandlers, registerVoiceHandlers, registerWorkspaceHandlers } from './ipc-handlers';
import { createApplicationMenu } from './menu';
import { UpdateManager } from './updater';
import { MarketingAutomationManager } from './marketing-automation';
import { VoiceTranscriptionManager } from './voice-transcription';
import { ObsidianManager } from './obsidian-manager';
import { DiagnosticsManager } from './diagnostics-manager';
import { AgentLoopManager } from './agent-loop-manager';

let mainWindow: BrowserWindow | null = null;
let ptyManager: PTYManager | null = null;
let workspaceManager: WorkspaceManager | null = null;
let updateManager: UpdateManager | null = null;
let marketingAutomationManager: MarketingAutomationManager | null = null;
let voiceTranscriptionManager: VoiceTranscriptionManager | null = null;
let obsidianManager: ObsidianManager | null = null;
let diagnosticsManager: DiagnosticsManager | null = null;
let agentLoopManager: AgentLoopManager | null = null;
let backendProcess: ChildProcessWithoutNullStreams | null = null;
let legacyBackendProcess: ChildProcessWithoutNullStreams | null = null;
let backendStartTimer: NodeJS.Timeout | null = null;

type BackendBootstrapConfig = {
  mode: 'docker' | 'process';
  backendPath: string;
  command: string;
  args: string[];
};

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');

function getProjectRoot(): string {
  return join(__dirname, '../../');
}

function getBackendConfig(): BackendBootstrapConfig {
  const mode = process.env.HEDGE_STATION_BACKEND_MODE || 'docker';
  if (mode === 'process') {
    return {
      mode,
      backendPath: join(getProjectRoot(), 'backend/hyperliquid_gateway'),
      command: process.platform === 'win32' ? 'python' : 'python3',
      args: ['-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', '18400']
    };
  }

  return {
    mode: 'docker',
    backendPath: getProjectRoot(),
    command: process.platform === 'win32' ? 'docker.exe' : 'docker',
    args: ['compose', 'up', '-d', 'hyperliquid-backend']
  };
}

function getLegacyBackendRoot(): string {
  return process.env.HEDGE_STATION_LEGACY_ROOT || 'C:/Users/leonard/Documents/trading';
}

function getLegacyBackendConfig(): BackendBootstrapConfig | null {
  const legacyRoot = getLegacyBackendRoot();
  if (!existsSync(legacyRoot)) {
    console.warn(`Legacy backend root not found: ${legacyRoot}`);
    return null;
  }

  return {
    mode: 'docker',
    backendPath: legacyRoot,
    command: process.platform === 'win32' ? 'docker.exe' : 'docker',
    args: ['compose', 'up', '-d', 'postgres', 'redis', 'backend']
  };
}

function shouldAutoStartBackend(): boolean {
  return process.env.HEDGE_STATION_AUTOSTART_BACKEND === '1';
}

function shouldAutoStartLegacyBackend(): boolean {
  return process.env.HEDGE_STATION_AUTOSTART_LEGACY !== '0';
}

function startBootstrapProcess(config: BackendBootstrapConfig, label: string): ChildProcessWithoutNullStreams {
  console.log(`Starting ${label} (${config.mode})...`);

  const processRef = spawn(config.command, config.args, {
    cwd: config.backendPath,
    shell: false,
    detached: false,
    windowsHide: true
  });

  if (process.env.NODE_ENV === 'development') {
    processRef.stdout.on('data', (data) => {
      console.log(`[${label}] ${data.toString().trim()}`);
    });

    processRef.stderr.on('data', (data) => {
      console.error(`[${label} Error] ${data.toString().trim()}`);
    });
  }

  processRef.once('error', (error) => {
    console.error(`Failed to start ${label}:`, error);
  });

  console.log(`${label} bootstrap started (PID: ${processRef.pid})`);
  return processRef;
}

function initLegacySchema(): void {
  const legacyRoot = getLegacyBackendRoot();
  if (!existsSync(legacyRoot)) {
    return;
  }

  const processRef = spawn(process.platform === 'win32' ? 'docker.exe' : 'docker', [
    'exec',
    'btc_backend',
    'python',
    '-c',
    "from database import init_db; init_db(); print('init_db_ok')"
  ], {
    cwd: legacyRoot,
    shell: false,
    detached: false,
    windowsHide: true
  });

  if (process.env.NODE_ENV === 'development') {
    processRef.stdout.on('data', (data) => {
      console.log(`[Legacy schema] ${data.toString().trim()}`);
    });

    processRef.stderr.on('data', (data) => {
      console.error(`[Legacy schema error] ${data.toString().trim()}`);
    });
  }

  processRef.once('error', (error) => {
    console.error('Failed to initialize legacy backend schema:', error);
  });
}

function startBackendServer(): void {
  if (backendProcess) {
    return;
  }

  const config = getBackendConfig();
  backendProcess = startBootstrapProcess(config, 'Gateway backend');

  backendProcess.once('close', (code) => {
    console.log(`Gateway backend bootstrap process exited with code ${code}`);
    backendProcess = null;
  });
}

function startLegacyBackendServer(): void {
  if (legacyBackendProcess || !shouldAutoStartLegacyBackend()) {
    return;
  }

  const config = getLegacyBackendConfig();
  if (!config) {
    return;
  }

  legacyBackendProcess = startBootstrapProcess(config, 'Legacy backend');

  legacyBackendProcess.once('close', (code) => {
    console.log(`Legacy backend bootstrap process exited with code ${code}`);
    legacyBackendProcess = null;
  });

  setTimeout(() => {
    initLegacySchema();
  }, 8000);
}

function stopBootstrapProcess(processRef: ChildProcessWithoutNullStreams | null, label: string): null {
  if (processRef) {
    console.log(`Stopping ${label} bootstrap process...`);
    processRef.kill();
  }

  return null;
}

function stopBackendServer(): void {
  if (backendStartTimer) {
    clearTimeout(backendStartTimer);
    backendStartTimer = null;
  }

  backendProcess = stopBootstrapProcess(backendProcess, 'gateway backend');
  legacyBackendProcess = stopBootstrapProcess(legacyBackendProcess, 'legacy backend');
}

function clearIpcChannels(): void {
  const handleChannels = [
    'terminal:create',
    'terminal:exists',
    'terminal:getAllIds',
    'terminal:getSnapshot',
    'workspace:getAll',
    'workspace:getActive',
    'workspace:setActive',
    'workspace:create',
    'workspace:update',
    'workspace:delete',
    'workspace:pickDirectory',
    'marketing:runAutoBlogger',
    'marketing:listBlogPosts',
    'marketing:getAIConfigStatus',
    'marketing:saveGeminiApiKey',
    'marketing:generateIdeas',
    'marketing:generateImage',
    'voice:transcribe',
    'obsidian:getStatus',
    'obsidian:listNotes',
    'obsidian:searchRelevant',
    'obsidian:listPinned',
    'obsidian:exportMission',
    'obsidian:openPath',
    'diagnostics:checkCommands',
    'diagnostics:shellSmokeTest',
    'diagnostics:runMissionDrill',
    'agentLoop:startMission',
    'agentLoop:getRun',
    'agentLoop:cancelRun',
    'update:check',
    'update:download',
    'update:install'
  ];

  const eventChannels = [
    'terminal:write',
    'terminal:resize',
    'terminal:kill'
  ];

  for (const channel of handleChannels) {
    ipcMain.removeHandler(channel);
  }

  for (const channel of eventChannels) {
    ipcMain.removeAllListeners(channel);
  }
}

function registerUpdateHandlers(updateManagerInstance: UpdateManager): void {

  ipcMain.handle('update:check', async () => {
    updateManagerInstance.checkForUpdates();
    return { success: true };
  });

  ipcMain.handle('update:download', async () => {
    updateManagerInstance.downloadUpdate();
    return { success: true };
  });

  ipcMain.handle('update:install', async () => {
    updateManagerInstance.installUpdate();
    return { success: true };
  });

}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    backgroundColor: '#0B0F19',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  ptyManager = new PTYManager(mainWindow);
  workspaceManager = new WorkspaceManager();
  updateManager = new UpdateManager(mainWindow);
  marketingAutomationManager = new MarketingAutomationManager();
  voiceTranscriptionManager = new VoiceTranscriptionManager();
  obsidianManager = new ObsidianManager();
  diagnosticsManager = new DiagnosticsManager();
  agentLoopManager = new AgentLoopManager();

  clearIpcChannels();
  registerTerminalHandlers(ptyManager);
  registerWorkspaceHandlers(workspaceManager);
  registerMarketingHandlers(marketingAutomationManager);
  registerVoiceHandlers(voiceTranscriptionManager);
  registerObsidianHandlers(obsidianManager);
  registerDiagnosticsHandlers(diagnosticsManager);
  registerAgentLoopHandlers(agentLoopManager);
  registerUpdateHandlers(updateManager);
  createApplicationMenu(mainWindow);

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    if (ptyManager) {
      ptyManager.killAllTerminals();
      ptyManager = null;
    }
    if (updateManager) {
      updateManager.cleanup();
      updateManager = null;
    }
    stopBackendServer();
    marketingAutomationManager = null;
    voiceTranscriptionManager = null;
    obsidianManager = null;
    diagnosticsManager = null;
    workspaceManager = null;
    mainWindow = null;
  });
}

function initializeApp(): void {
  createWindow();

  if (shouldAutoStartBackend()) {
    backendStartTimer = setTimeout(() => {
      backendStartTimer = null;
      startBackendServer();
      startLegacyBackendServer();
    }, 1000);
  }
}

app.whenReady().then(() => {
  initializeApp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      initializeApp();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackendServer();
});
