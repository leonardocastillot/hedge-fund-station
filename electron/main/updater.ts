import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';
import log from 'electron-log';

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

export class UpdateManager {
  private mainWindow: BrowserWindow;
  private updateCheckInterval: NodeJS.Timeout | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.configureUpdater();
  }

  private configureUpdater() {
    // Configure auto-updater
    autoUpdater.autoDownload = false; // Manual download after user confirmation
    autoUpdater.autoInstallOnAppQuit = true;

    // Check for updates 3 seconds after app starts (give time for window to load)
    setTimeout(() => {
      this.checkForUpdates();
    }, 3000);

    // Check for updates every 2 hours
    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates();
    }, 2 * 60 * 60 * 1000); // 2 hours

    // Setup event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
      this.sendStatusToRenderer('checking', {
        message: 'Checking for updates...'
      });
    });

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
      this.sendStatusToRenderer('available', {
        message: `New version ${info.version} available!`,
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseDate: info.releaseDate
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available. Current version:', info.version);
      this.sendStatusToRenderer('not-available', {
        message: 'You are running the latest version.',
        version: info.version
      });
    });

    autoUpdater.on('error', (error) => {
      log.error('Update error:', error);
      this.sendStatusToRenderer('error', {
        message: 'Error checking for updates.',
        error: error.message
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      const message = `Downloading update... ${Math.round(progress.percent)}%`;
      log.info(message);
      this.sendStatusToRenderer('downloading', {
        message,
        percent: Math.round(progress.percent),
        transferred: Math.round(progress.transferred / 1024 / 1024), // MB
        total: Math.round(progress.total / 1024 / 1024), // MB
        bytesPerSecond: Math.round(progress.bytesPerSecond / 1024) // KB/s
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      this.sendStatusToRenderer('downloaded', {
        message: 'Update ready to install!',
        version: info.version,
        releaseNotes: info.releaseNotes
      });
    });
  }

  private sendStatusToRenderer(status: string, data: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update:status', { status, data });
    }
  }

  public checkForUpdates() {
    // Only check in production
    if (process.env.NODE_ENV === 'development') {
      log.info('Skipping update check in development mode');
      return;
    }

    autoUpdater.checkForUpdates().catch((error) => {
      log.error('Failed to check for updates:', error);
    });
  }

  public downloadUpdate() {
    log.info('Starting update download...');
    autoUpdater.downloadUpdate().catch((error) => {
      log.error('Failed to download update:', error);
    });
  }

  public installUpdate() {
    log.info('Installing update and restarting...');
    autoUpdater.quitAndInstall(false, true);
  }

  public cleanup() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
  }
}
