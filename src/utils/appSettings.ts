export interface AppSettings {
  theme: 'dark' | 'light';
  fontSize: number;
  defaultShell: string;
  apiUrl: string;
  enableNotifications: boolean;
  enableSounds: boolean;
  scrollbackLines: number;
}

export const SETTINGS_STORAGE_KEY = 'hedge-station-settings';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 14,
  defaultShell: 'powershell.exe',
  apiUrl: 'http://127.0.0.1:18001',
  enableNotifications: true,
  enableSounds: true,
  scrollbackLines: 3000
};

export function loadAppSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!saved) {
      return DEFAULT_APP_SETTINGS;
    }

    return {
      ...DEFAULT_APP_SETTINGS,
      ...JSON.parse(saved)
    };
  } catch (error) {
    console.error('Failed to load app settings:', error);
    return DEFAULT_APP_SETTINGS;
  }
}
