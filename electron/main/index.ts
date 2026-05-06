import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, session, shell } from 'electron';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import { join } from 'path';
import { spawn, spawnSync, ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { request as httpRequest } from 'http';
import { PTYManager } from './native/pty-manager';
import { WorkspaceManager } from './native/workspace-manager';
import { registerAgentLoopHandlers, registerDiagnosticsHandlers, registerMarketingHandlers, registerMissionConsoleHandlers, registerObsidianHandlers, registerTerminalHandlers, registerVoiceHandlers, registerWorkspaceHandlers } from './ipc/ipc-handlers';
import { createApplicationMenu } from './app/menu';
import { UpdateManager } from './app/updater';
import { MarketingAutomationManager } from './native/marketing-automation';
import { VoiceTranscriptionManager } from './native/voice-transcription';
import { GeminiLiveVoiceManager } from './native/gemini-live-voice';
import { ObsidianManager } from './native/obsidian-manager';
import { DiagnosticsManager } from './native/diagnostics-manager';
import { AgentLoopManager } from './native/agent-loop-manager';
import { MissionConsoleManager } from './native/mission-console-manager';

let mainWindow: BrowserWindow | null = null;
let ptyManager: PTYManager | null = null;
let workspaceManager: WorkspaceManager | null = null;
let updateManager: UpdateManager | null = null;
let marketingAutomationManager: MarketingAutomationManager | null = null;
let voiceTranscriptionManager: VoiceTranscriptionManager | null = null;
let geminiLiveVoiceManager: GeminiLiveVoiceManager | null = null;
let obsidianManager: ObsidianManager | null = null;
let diagnosticsManager: DiagnosticsManager | null = null;
let agentLoopManager: AgentLoopManager | null = null;
let missionConsoleManager: MissionConsoleManager | null = null;
let backendProcess: ChildProcessWithoutNullStreams | null = null;
let legacyBackendProcess: ChildProcessWithoutNullStreams | null = null;
let backendStartTimer: NodeJS.Timeout | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let youtubeAdBlockerReady: Promise<void> | null = null;
const nativeDevBaselineMtime = Date.now();

type DevServiceStatus = {
  ok: boolean;
  url: string;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
};

type DevStatus = {
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
};

function focusMainWindow(): void {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
  app.focus({ steal: true });
}

type BackendBootstrapConfig = {
  mode: 'docker' | 'process';
  backendPath: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  focusMainWindow();
});

function getProjectRoot(): string {
  return join(__dirname, '../../');
}

function getNativeWatchRoots(): string[] {
  const root = getProjectRoot();
  return [
    join(root, 'electron/main'),
    join(root, 'electron/preload'),
    join(root, 'electron/types'),
    join(root, 'electron.vite.config.ts')
  ];
}

function collectChangedNativePaths(targetPath: string, changedPaths: string[], limit = 12): void {
  if (changedPaths.length >= limit || !existsSync(targetPath)) {
    return;
  }

  let stat;
  try {
    stat = statSync(targetPath);
  } catch {
    return;
  }

  if (stat.isDirectory()) {
    for (const entry of readdirSync(targetPath)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'dist-electron') {
        continue;
      }
      collectChangedNativePaths(join(targetPath, entry), changedPaths, limit);
      if (changedPaths.length >= limit) {
        return;
      }
    }
    return;
  }

  if (!/\.(ts|tsx|js|cjs|mjs|json)$/.test(targetPath)) {
    return;
  }

  if (stat.mtimeMs > nativeDevBaselineMtime + 1000) {
    changedPaths.push(targetPath.replace(`${getProjectRoot()}/`, ''));
  }
}

function getNativeChangedPaths(): string[] {
  const changedPaths: string[] = [];
  for (const targetPath of getNativeWatchRoots()) {
    collectChangedNativePaths(targetPath, changedPaths);
    if (changedPaths.length >= 12) {
      break;
    }
  }
  return changedPaths;
}

function checkHttpStatus(url: string, timeoutMs = 1200): Promise<DevServiceStatus> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const request = httpRequest(url, { method: 'GET', timeout: timeoutMs }, (response) => {
      response.resume();
      response.once('end', () => {
        const statusCode = response.statusCode;
        resolve({
          ok: typeof statusCode === 'number' && statusCode >= 200 && statusCode < 500,
          url,
          statusCode,
          latencyMs: Date.now() - startedAt
        });
      });
    });

    request.once('timeout', () => {
      request.destroy(new Error('timeout'));
    });

    request.once('error', (error) => {
      resolve({
        ok: false,
        url,
        latencyMs: Date.now() - startedAt,
        error: error.message
      });
    });

    request.end();
  });
}

async function getDevStatus(): Promise<DevStatus> {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const [vite, gateway, backend] = await Promise.all([
    checkHttpStatus('http://127.0.0.1:5173'),
    checkHttpStatus('http://127.0.0.1:18001/health'),
    checkHttpStatus('http://127.0.0.1:18500/health')
  ]);
  const nativeChangedPaths = isDevelopment ? getNativeChangedPaths() : [];

  return {
    isDevelopment,
    rendererLive: vite.ok,
    nativeRestartRequired: nativeChangedPaths.length > 0,
    nativeChangedPaths,
    checkedAt: new Date().toISOString(),
    services: {
      vite,
      gateway,
      backend
    }
  };
}

function canUseDocker(): boolean {
  const command = process.platform === 'win32' ? 'docker.exe' : 'docker';
  const result = spawnSync(command, ['info'], {
    shell: false,
    stdio: 'ignore',
    timeout: 5000
  });
  return result.status === 0;
}

function getBackendConfig(): BackendBootstrapConfig {
  const mode = process.env.HEDGE_STATION_BACKEND_MODE || (canUseDocker() ? 'docker' : 'process');
  if (mode === 'process') {
    return {
      mode,
      backendPath: join(getProjectRoot(), 'backend/hyperliquid_gateway'),
      command: process.platform === 'win32' ? 'python' : 'python3',
      args: ['-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', '18001'],
      env: {
        HYPERLIQUID_DB_PATH: join(getProjectRoot(), 'backend/hyperliquid_gateway/data/hyperliquid.db')
      }
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
  return process.env.HEDGE_STATION_AUTOSTART_BACKEND !== '0';
}

function shouldAutoStartLegacyBackend(): boolean {
  return process.env.HEDGE_STATION_AUTOSTART_LEGACY !== '0';
}

function startBootstrapProcess(config: BackendBootstrapConfig, label: string): ChildProcessWithoutNullStreams {
  console.log(`Starting ${label} (${config.mode})...`);

  const processRef = spawn(config.command, config.args, {
    cwd: config.backendPath,
    env: { ...process.env, ...config.env },
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
    'obsidian:ensureVault',
    'obsidian:listNotes',
    'obsidian:searchRelevant',
    'obsidian:listPinned',
    'obsidian:exportMission',
    'obsidian:openPath',
    'obsidian:openVault',
    'diagnostics:checkCommands',
    'diagnostics:shellSmokeTest',
    'diagnostics:runMissionDrill',
    'agentLoop:startMission',
    'agentLoop:getRun',
    'agentLoop:cancelRun',
    'missionConsole:listRuns',
    'missionConsole:saveRun',
    'missionConsole:appendSnapshot',
    'missionConsole:exportHandoff',
    'external:openUrl',
    'external:openUrlInBrave',
    'external:openUrlsInBrave',
    'dev:getStatus',
    'dev:reloadRenderer',
    'dev:restartShell',
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

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:';
  } catch {
    return false;
  }
}

function openUrlInBrave(url: string): Promise<{ success: boolean; fallback: boolean }> {
  if (!isSafeExternalUrl(url)) {
    return Promise.reject(new Error('Only http(s) URLs can be opened externally.'));
  }

  if (process.platform !== 'darwin') {
    return shell.openExternal(url).then(() => ({ success: true, fallback: true }));
  }

  return new Promise((resolve) => {
    const child = spawn('open', ['-a', 'Brave Browser', url], {
      shell: false,
      detached: true,
      stdio: 'ignore'
    });

    child.once('error', () => {
      void shell.openExternal(url).then(() => resolve({ success: true, fallback: true }));
    });

    child.once('close', (code) => {
      if (code === 0) {
        resolve({ success: true, fallback: false });
        return;
      }

      void shell.openExternal(url).then(() => resolve({ success: true, fallback: true }));
    });

    child.unref();
  });
}

function registerExternalHandlers(): void {
  ipcMain.handle('external:openUrl', async (_event, params: { url: string }) => {
    if (!isSafeExternalUrl(params.url)) {
      throw new Error('Only http(s) URLs can be opened externally.');
    }

    await shell.openExternal(params.url);
    return { success: true };
  });

  ipcMain.handle('external:openUrlInBrave', async (_event, params: { url: string }) => {
    return openUrlInBrave(params.url);
  });

  ipcMain.handle('external:openUrlsInBrave', async (_event, params: { urls: string[] }) => {
    const results = [];
    for (const url of params.urls) {
      results.push(await openUrlInBrave(url));
    }
    return { success: true, results };
  });
}

function reloadMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.reload();
  focusMainWindow();
}

function restartElectronShell(): void {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Electron shell restart is only available in development mode.');
  }

  isQuitting = true;
  app.relaunch();
  app.exit(0);
}

function registerDevHandlers(): void {
  ipcMain.handle('dev:getStatus', async () => getDevStatus());

  ipcMain.handle('dev:reloadRenderer', async () => {
    reloadMainWindow();
    return { success: true };
  });

  ipcMain.handle('dev:restartShell', async () => {
    restartElectronShell();
    return { success: true };
  });
}

function toggleDevTools(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.toggleDevTools();
  focusMainWindow();
}

function getTrayIconPath(): string {
  const pngPath = join(getProjectRoot(), 'resources/icon-source.png');
  if (existsSync(pngPath)) {
    return pngPath;
  }

  return join(getProjectRoot(), 'resources/icon.icns');
}

function createTray(): void {
  if (process.platform !== 'darwin' || tray) {
    return;
  }

  const icon = nativeImage.createFromPath(getTrayIconPath()).resize({
    width: 18,
    height: 18
  });
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('Hedge Fund Station');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open Hedge Fund Station',
      click: focusMainWindow
    },
    {
      label: 'Reload Window',
      click: reloadMainWindow
    },
    {
      label: 'Toggle DevTools',
      click: toggleDevTools
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));

  tray.on('click', focusMainWindow);
}

function registerYoutubeEmbedHeaders(): void {
  const youtubeSession = session.fromPartition('persist:youtube');
  const urls = [
    '*://youtube.com/*',
    '*://www.youtube.com/*',
    '*://*.youtube.com/*',
    '*://*.googlevideo.com/*',
    '*://*.ytimg.com/*'
  ];

  youtubeSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };

    try {
      const url = new URL(details.url);
      const hostname = url.hostname;
      const isYoutubeEmbed = (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) && url.pathname.startsWith('/embed/');
      const isPlaybackAsset = hostname.endsWith('.googlevideo.com') || hostname.endsWith('.ytimg.com');

      if (isYoutubeEmbed || isPlaybackAsset) {
        requestHeaders.Referer = 'https://www.youtube.com/';
      }

      if (isYoutubeEmbed) {
        requestHeaders.Origin = 'https://www.youtube.com';
      }
    } catch {
      requestHeaders.Referer = 'https://www.youtube.com/';
    }

    callback({ requestHeaders });
  });
}

function enableYoutubeAdBlocker(): Promise<void> {
  if (youtubeAdBlockerReady) {
    return youtubeAdBlockerReady;
  }

  const youtubeSession = session.fromPartition('persist:youtube');
  if (!('registerPreloadScript' in youtubeSession)) {
    youtubeAdBlockerReady = Promise.resolve();
    console.log('YouTube ad blocker skipped: current Electron session API does not support registerPreloadScript');
    return youtubeAdBlockerReady;
  }

  youtubeAdBlockerReady = ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
    .then((blocker) => {
      blocker.enableBlockingInSession(youtubeSession);
      console.log('YouTube ad blocker enabled for persist:youtube session');
    })
    .catch((error) => {
      console.warn('YouTube ad blocker could not be enabled:', error);
    });

  return youtubeAdBlockerReady;
}

async function configureYoutubeSession(): Promise<void> {
  registerYoutubeEmbedHeaders();
  await enableYoutubeAdBlocker();
}

function createWindow(): void {
  createTray();

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    title: 'Hedge Fund Station',
    backgroundColor: '#0B0F19',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  });

  ptyManager = new PTYManager(mainWindow);
  workspaceManager = new WorkspaceManager();
  updateManager = new UpdateManager(mainWindow);
  marketingAutomationManager = new MarketingAutomationManager();
  voiceTranscriptionManager = new VoiceTranscriptionManager();
  geminiLiveVoiceManager = new GeminiLiveVoiceManager();
  obsidianManager = new ObsidianManager();
  diagnosticsManager = new DiagnosticsManager();
  agentLoopManager = new AgentLoopManager();
  missionConsoleManager = new MissionConsoleManager();

  clearIpcChannels();
  registerTerminalHandlers(ptyManager);
  registerWorkspaceHandlers(workspaceManager);
  registerMarketingHandlers(marketingAutomationManager);
  registerVoiceHandlers(voiceTranscriptionManager, geminiLiveVoiceManager);
  registerObsidianHandlers(obsidianManager);
  registerDiagnosticsHandlers(diagnosticsManager);
  registerAgentLoopHandlers(agentLoopManager);
  registerMissionConsoleHandlers(missionConsoleManager);
  registerExternalHandlers();
  if (process.env.NODE_ENV === 'development') {
    registerDevHandlers();
  }
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

  mainWindow.once('ready-to-show', () => {
    focusMainWindow();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    focusMainWindow();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Window failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
    focusMainWindow();
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details);
  });

  mainWindow.on('close', (event) => {
    if (process.platform !== 'darwin' || isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow?.hide();
  });

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
    geminiLiveVoiceManager = null;
    obsidianManager = null;
    diagnosticsManager = null;
    agentLoopManager = null;
    missionConsoleManager = null;
    workspaceManager = null;
    mainWindow = null;
  });
}

async function initializeApp(): Promise<void> {
  await configureYoutubeSession();
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
  void initializeApp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void initializeApp();
    } else {
      focusMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackendServer();
});
