export type AppThemeId =
  | 'obsidian-red'
  | 'aurora-cyan'
  | 'graphite-gold'
  | 'terminal-emerald'
  | 'violet-night';

export type PerformanceProfile = 'daily-light' | 'full' | 'ultra-light';

export interface AppTheme {
  id: AppThemeId;
  name: string;
  description: string;
  swatches: string[];
  vars: Record<string, string>;
}

export interface AppSettings {
  theme: AppThemeId;
  performanceProfile: PerformanceProfile;
  fontSize: number;
  defaultShell: string;
  apiUrl: string;
  enableNotifications: boolean;
  enableSounds: boolean;
  scrollbackLines: number;
}

export const SETTINGS_STORAGE_KEY = 'hedge-station-settings';
export const APP_SETTINGS_CHANGED_EVENT = 'hedge-station-settings-changed';

export const APP_THEMES: AppTheme[] = [
  {
    id: 'obsidian-red',
    name: 'Obsidian Red',
    description: 'Black glass, red alerts, crisp white text.',
    swatches: ['#020408', '#ef4444', '#f0f2f5', '#0e1424'],
    vars: {
      '--app-bg': '#020408',
      '--app-surface': 'rgba(8, 12, 22, 0.65)',
      '--app-surface-raised': 'rgba(14, 20, 36, 0.55)',
      '--app-panel': 'rgba(6, 10, 20, 0.55)',
      '--app-panel-muted': 'rgba(255, 255, 255, 0.02)',
      '--app-border': 'rgba(239, 68, 68, 0.12)',
      '--app-border-strong': 'rgba(239, 68, 68, 0.28)',
      '--app-text': '#f0f2f5',
      '--app-muted': '#8b95a5',
      '--app-subtle': '#545e6e',
      '--app-accent': '#ef4444',
      '--app-accent-2': '#f97316',
      '--app-accent-soft': 'rgba(239, 68, 68, 0.08)',
      '--app-focus': 'rgba(239, 68, 68, 0.32)',
      '--app-glow': 'rgba(239, 68, 68, 0.15)',
      '--app-positive': '#34d399',
      '--app-positive-soft': 'rgba(16, 185, 129, 0.08)',
      '--app-negative': '#fb7185',
      '--app-negative-soft': 'rgba(244, 63, 94, 0.08)',
      '--app-warning': '#f59e0b',
      '--app-warning-soft': 'rgba(245, 158, 11, 0.08)',
      '--app-terminal-bg': 'rgba(2, 4, 8, 0.85)',
      '--app-terminal-border': 'rgba(239, 68, 68, 0.14)'
    }
  },
  {
    id: 'aurora-cyan',
    name: 'Aurora Cyan',
    description: 'Deep navy with cyan and electric blue accents.',
    swatches: ['#020a14', '#22d3ee', '#38bdf8', '#dff7ff'],
    vars: {
      '--app-bg': '#020a14',
      '--app-surface': 'rgba(5, 18, 28, 0.6)',
      '--app-surface-raised': 'rgba(8, 28, 42, 0.5)',
      '--app-panel': 'rgba(4, 16, 28, 0.55)',
      '--app-panel-muted': 'rgba(240, 251, 255, 0.02)',
      '--app-border': 'rgba(34, 211, 238, 0.12)',
      '--app-border-strong': 'rgba(34, 211, 238, 0.28)',
      '--app-text': '#f0fbff',
      '--app-muted': '#7eb0c0',
      '--app-subtle': '#4a6e7e',
      '--app-accent': '#22d3ee',
      '--app-accent-2': '#3b82f6',
      '--app-accent-soft': 'rgba(34, 211, 238, 0.08)',
      '--app-focus': 'rgba(34, 211, 238, 0.32)',
      '--app-glow': 'rgba(34, 211, 238, 0.12)',
      '--app-positive': '#34d399',
      '--app-positive-soft': 'rgba(16, 185, 129, 0.08)',
      '--app-negative': '#fb7185',
      '--app-negative-soft': 'rgba(244, 63, 94, 0.08)',
      '--app-warning': '#f59e0b',
      '--app-warning-soft': 'rgba(245, 158, 11, 0.08)',
      '--app-terminal-bg': 'rgba(2, 10, 20, 0.85)',
      '--app-terminal-border': 'rgba(34, 211, 238, 0.14)'
    }
  },
  {
    id: 'graphite-gold',
    name: 'Graphite Gold',
    description: 'Quiet institutional graphite with warm gold signals.',
    swatches: ['#060606', '#27272a', '#f59e0b', '#fafaf9'],
    vars: {
      '--app-bg': '#060606',
      '--app-surface': 'rgba(12, 12, 12, 0.6)',
      '--app-surface-raised': 'rgba(20, 20, 22, 0.5)',
      '--app-panel': 'rgba(10, 10, 10, 0.55)',
      '--app-panel-muted': 'rgba(250, 250, 249, 0.02)',
      '--app-border': 'rgba(245, 158, 11, 0.12)',
      '--app-border-strong': 'rgba(245, 158, 11, 0.28)',
      '--app-text': '#fafaf9',
      '--app-muted': '#8a847e',
      '--app-subtle': '#5c5650',
      '--app-accent': '#f59e0b',
      '--app-accent-2': '#eab308',
      '--app-accent-soft': 'rgba(245, 158, 11, 0.08)',
      '--app-focus': 'rgba(245, 158, 11, 0.32)',
      '--app-glow': 'rgba(245, 158, 11, 0.12)',
      '--app-positive': '#34d399',
      '--app-positive-soft': 'rgba(16, 185, 129, 0.08)',
      '--app-negative': '#fb7185',
      '--app-negative-soft': 'rgba(244, 63, 94, 0.08)',
      '--app-warning': '#f59e0b',
      '--app-warning-soft': 'rgba(245, 158, 11, 0.08)',
      '--app-terminal-bg': 'rgba(6, 6, 6, 0.85)',
      '--app-terminal-border': 'rgba(245, 158, 11, 0.14)'
    }
  },
  {
    id: 'terminal-emerald',
    name: 'Terminal Emerald',
    description: 'Black terminal energy with emerald confirmation states.',
    swatches: ['#010604', '#10b981', '#34d399', '#ecfdf5'],
    vars: {
      '--app-bg': '#010604',
      '--app-surface': 'rgba(5, 14, 10, 0.6)',
      '--app-surface-raised': 'rgba(8, 24, 16, 0.5)',
      '--app-panel': 'rgba(4, 12, 8, 0.55)',
      '--app-panel-muted': 'rgba(236, 253, 245, 0.02)',
      '--app-border': 'rgba(16, 185, 129, 0.12)',
      '--app-border-strong': 'rgba(16, 185, 129, 0.28)',
      '--app-text': '#ecfdf5',
      '--app-muted': '#7ec0a6',
      '--app-subtle': '#4a7e66',
      '--app-accent': '#10b981',
      '--app-accent-2': '#14b8a6',
      '--app-accent-soft': 'rgba(16, 185, 129, 0.08)',
      '--app-focus': 'rgba(16, 185, 129, 0.32)',
      '--app-glow': 'rgba(16, 185, 129, 0.12)',
      '--app-positive': '#34d399',
      '--app-positive-soft': 'rgba(16, 185, 129, 0.08)',
      '--app-negative': '#fb7185',
      '--app-negative-soft': 'rgba(244, 63, 94, 0.08)',
      '--app-warning': '#f59e0b',
      '--app-warning-soft': 'rgba(245, 158, 11, 0.08)',
      '--app-terminal-bg': 'rgba(1, 6, 4, 0.85)',
      '--app-terminal-border': 'rgba(16, 185, 129, 0.14)'
    }
  },
  {
    id: 'violet-night',
    name: 'Violet Night',
    description: 'Midnight surface with violet and rose contrast.',
    swatches: ['#0a0616', '#8b5cf6', '#ec4899', '#f5f3ff'],
    vars: {
      '--app-bg': '#0a0616',
      '--app-surface': 'rgba(16, 10, 30, 0.6)',
      '--app-surface-raised': 'rgba(24, 16, 48, 0.5)',
      '--app-panel': 'rgba(14, 8, 28, 0.55)',
      '--app-panel-muted': 'rgba(245, 243, 255, 0.02)',
      '--app-border': 'rgba(139, 92, 246, 0.12)',
      '--app-border-strong': 'rgba(139, 92, 246, 0.28)',
      '--app-text': '#f5f3ff',
      '--app-muted': '#a89cd0',
      '--app-subtle': '#6e5e9a',
      '--app-accent': '#8b5cf6',
      '--app-accent-2': '#ec4899',
      '--app-accent-soft': 'rgba(139, 92, 246, 0.08)',
      '--app-focus': 'rgba(139, 92, 246, 0.32)',
      '--app-glow': 'rgba(139, 92, 246, 0.12)',
      '--app-positive': '#34d399',
      '--app-positive-soft': 'rgba(16, 185, 129, 0.08)',
      '--app-negative': '#fb7185',
      '--app-negative-soft': 'rgba(244, 63, 94, 0.08)',
      '--app-warning': '#f59e0b',
      '--app-warning-soft': 'rgba(245, 158, 11, 0.08)',
      '--app-terminal-bg': 'rgba(10, 6, 22, 0.85)',
      '--app-terminal-border': 'rgba(139, 92, 246, 0.14)'
    }
  }
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'obsidian-red',
  performanceProfile: 'daily-light',
  fontSize: 14,
  defaultShell: 'powershell.exe',
  apiUrl: 'http://127.0.0.1:18001',
  enableNotifications: true,
  enableSounds: true,
  scrollbackLines: 3000
};

export function getAppTheme(themeId: AppSettings['theme']): AppTheme {
  return APP_THEMES.find((theme) => theme.id === themeId) ?? APP_THEMES[0];
}

export function normalizePerformanceProfile(value: unknown): PerformanceProfile {
  return value === 'full' || value === 'ultra-light' ? value : 'daily-light';
}

export function normalizeAppSettings(settings: Partial<AppSettings>): AppSettings {
  const legacyTheme = settings.theme as string | undefined;
  const theme = APP_THEMES.some((item) => item.id === legacyTheme)
    ? legacyTheme as AppThemeId
    : DEFAULT_APP_SETTINGS.theme;

  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    theme,
    performanceProfile: normalizePerformanceProfile(settings.performanceProfile)
  };
}

export function loadAppSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!saved) {
      return DEFAULT_APP_SETTINGS;
    }

    return normalizeAppSettings(JSON.parse(saved));
  } catch (error) {
    console.error('Failed to load app settings:', error);
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings): AppSettings {
  const normalizedSettings = normalizeAppSettings(settings);
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSettings));
  window.dispatchEvent(new CustomEvent(APP_SETTINGS_CHANGED_EVENT, { detail: normalizedSettings }));
  return normalizedSettings;
}

export function resetAppSettings(): AppSettings {
  localStorage.removeItem(SETTINGS_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(APP_SETTINGS_CHANGED_EVENT, { detail: DEFAULT_APP_SETTINGS }));
  return DEFAULT_APP_SETTINGS;
}

export function applyAppTheme(themeId: AppThemeId) {
  if (typeof document === 'undefined') return;

  const theme = getAppTheme(themeId);
  const root = document.documentElement;
  root.dataset.appTheme = theme.id;

  Object.entries(theme.vars).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
}
