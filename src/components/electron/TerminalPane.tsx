import React, { memo, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { ArrowDownToLine, Clipboard, Maximize2, Palette, Power, Sparkles, X } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from '../../hooks/useTerminal';
import { TerminalColor } from '@/contexts/TerminalContext';
import type { TerminalRuntimeState } from '@/contexts/TerminalContext';
import type { TerminalPtyState } from '@/contexts/TerminalContext';
import type { AgentProvider } from '../../types/agents';
import { COLOR_SCHEMES } from './TerminalColorSchemes';
import { APP_SETTINGS_CHANGED_EVENT, loadAppSettings } from '../../utils/appSettings';
import { getProviderMeta } from '../../utils/agentRuntime';
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';

const TERMINAL_SURFACE_BACKGROUND = '#05070b';
const TERMINAL_PANEL_BACKGROUND = 'linear-gradient(180deg, rgba(5, 9, 13, 0.98), rgba(2, 6, 10, 0.98))';
const TERMINAL_HEADER_ACTIVE_BACKGROUND = 'linear-gradient(180deg, rgba(10, 19, 25, 0.98), rgba(4, 10, 15, 0.98))';
const TERMINAL_HEADER_BACKGROUND = 'rgba(5, 11, 16, 0.96)';
const TERMINAL_FONT_FAMILY = 'Menlo, Monaco, "SFMono-Regular", "SF Mono", "Cascadia Mono", Consolas, "Courier New", monospace';
const TERMINAL_LINE_HEIGHT = 1;
const TERMINAL_HACKER_THEME = {
  background: TERMINAL_SURFACE_BACKGROUND,
  foreground: '#f1f5f9',
  cursor: '#67e8f9',
  cursorAccent: '#02070a',
  selectionBackground: '#155e7566',
  selectionForeground: '#ffffff',
  black: '#64748b',
  red: '#ff6b7a',
  green: '#7ee787',
  yellow: '#facc15',
  blue: '#93c5fd',
  magenta: '#d8b4fe',
  cyan: '#67e8f9',
  white: '#f8fafc',
  brightBlack: '#a1a8b3',
  brightRed: '#fb7185',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#bfdbfe',
  brightMagenta: '#f0abfc',
  brightCyan: '#a5f3fc',
  brightWhite: '#ffffff'
} as const;

function clampTerminalFontSize(value: number): number {
  return Math.max(10, Math.min(value, 18));
}

function clampTerminalScrollback(value: number): number {
  return Math.max(5000, Math.min(value, 50000));
}

function enableUnicode11(terminal: Terminal): void {
  try {
    terminal.loadAddon(new Unicode11Addon());
    terminal.unicode.activeVersion = '11';
  } catch (error) {
    console.warn('Unable to activate xterm Unicode 11 support:', error);
  }
}

function normalizeTerminalTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    return '';
  }

  const windowsPathMatch = trimmed.match(/[A-Za-z]:\\[^|]+/);
  if (windowsPathMatch) {
    return windowsPathMatch[0].trim();
  }

  const unixPathMatch = trimmed.match(/\/[^\]|]+/);
  if (unixPathMatch) {
    return unixPathMatch[0].trim();
  }

  return trimmed;
}

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\r/g, '');
}

function getNormalizedLines(value: string): string[] {
  return stripAnsi(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isApprovalPrompt(value: string): boolean {
  return /(approve|approval|allow|continue\?|confirm|trust|permission|y\/n|\[y\/n\]|\[y\/N\]|\[Y\/n\]|yes\/no)/i.test(value);
}

function isRuntimeFailure(value: string): boolean {
  return /(not recognized|command not found|no se puede cargar el archivo|execution of scripts is disabled|unauthorizedaccess|not found|no such file|cannot find)/i.test(value);
}

function isLikelyShellPrompt(value: string): boolean {
  return getNormalizedLines(value).slice(-5).some((line) => (
    /^PS [A-Za-z]:\\.+>\s*$/.test(line)
    || /^[A-Za-z]:\\.+>\s*$/.test(line)
    || /^Microsoft PowerShell/i.test(line)
    || /^PowerShell \d/i.test(line)
    || isLikelyUnixShellPromptLine(line)
  ));
}

function isLikelyUnixShellPromptLine(line: string): boolean {
  if (line.length > 180) {
    return false;
  }

  return /^➜\s+/.test(line)
    || /^[\w.-]+@[\w.-]+(?:\s|:).+[%$#]\s*$/.test(line)
    || /(?:^|[\s:])(?:~|\/|\.{1,2}\/)[^\n]*[%$#]\s*$/.test(line)
    || /(?:^|\s)git:\([^)]+\).*(?:[%$#]|[✗*+])\s*$/.test(line)
    || /^(?:bash|zsh|sh|fish)(?:[-\w. ]*)?[%$#>]\s*$/.test(line)
    || /^[%$#>]\s*$/.test(line);
}

function isLikelyCommandEcho(value: string, command?: string): boolean {
  if (!command?.trim()) {
    return false;
  }

  const normalizedCommand = command.trim().toLowerCase();
  return getNormalizedLines(value).every((line) => line.toLowerCase() === normalizedCommand);
}

function isRuntimeIdlePrompt(value: string): boolean {
  const compact = getNormalizedLines(value)
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  if (!compact) {
    return false;
  }

  const hasAskPrompt = /\bask anything\b/.test(compact);
  const hasCommandHints = /\btype\s+\/\s+for commands?\b/.test(compact)
    && /\bctrl\+p\b.*\bcommands?\b/.test(compact);
  const hasAgentPickerHint = /\btab\b.*\bagents?\b/.test(compact);

  return hasAskPrompt || (hasCommandHints && hasAgentPickerHint);
}

function isLiveRuntimeState(state?: TerminalRuntimeState): boolean {
  return state === 'handoff'
    || state === 'ready'
    || state === 'waiting-response'
    || state === 'running'
    || state === 'awaiting-approval';
}

function getRuntimeDisplay(
  runtimeState: TerminalRuntimeState,
  ptyState: TerminalPtyState,
  hasExited: boolean
): { label: string; color: string; background: string; border: string } {
  if (ptyState === 'failed' || runtimeState === 'failed') {
    return {
      label: 'Failed',
      color: '#fca5a5',
      background: 'rgba(239, 68, 68, 0.13)',
      border: 'rgba(248, 113, 113, 0.24)'
    };
  }

  if (hasExited || runtimeState === 'completed') {
    return {
      label: 'Completed',
      color: '#93c5fd',
      background: 'rgba(59, 130, 246, 0.12)',
      border: 'rgba(96, 165, 250, 0.22)'
    };
  }

  if (runtimeState === 'awaiting-approval') {
    return {
      label: 'Needs Input',
      color: '#fbbf24',
      background: 'rgba(245, 158, 11, 0.13)',
      border: 'rgba(251, 191, 36, 0.24)'
    };
  }

  if (runtimeState === 'stalled') {
    return {
      label: 'Waiting',
      color: '#67e8f9',
      background: 'rgba(6, 182, 212, 0.12)',
      border: 'rgba(103, 232, 249, 0.22)'
    };
  }

  if (runtimeState === 'running') {
    return {
      label: 'Running',
      color: '#34d399',
      background: 'rgba(16, 185, 129, 0.13)',
      border: 'rgba(52, 211, 153, 0.24)'
    };
  }

  if (runtimeState === 'waiting-response') {
    return {
      label: 'Waiting',
      color: '#67e8f9',
      background: 'rgba(6, 182, 212, 0.12)',
      border: 'rgba(103, 232, 249, 0.22)'
    };
  }

  if (runtimeState === 'ready') {
    return {
      label: 'Ready',
      color: '#86efac',
      background: 'rgba(34, 197, 94, 0.12)',
      border: 'rgba(134, 239, 172, 0.22)'
    };
  }

  if (runtimeState === 'launching' || runtimeState === 'handoff' || ptyState === 'creating') {
    return {
      label: 'Launching',
      color: '#fbbf24',
      background: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(251, 191, 36, 0.22)'
    };
  }

  return {
    label: ptyState === 'ready' ? 'Ready' : 'Launching',
    color: ptyState === 'ready' ? '#cbd5e1' : '#fbbf24',
    background: ptyState === 'ready' ? 'rgba(148, 163, 184, 0.10)' : 'rgba(245, 158, 11, 0.12)',
    border: ptyState === 'ready' ? 'rgba(148, 163, 184, 0.18)' : 'rgba(251, 191, 36, 0.22)'
  };
}

function getTerminalPurposeLabel(terminalPurpose?: string, runtimeProvider?: AgentProvider, autoCommand?: string): string {
  if (runtimeProvider) {
    return 'Agent runtime';
  }

  if (terminalPurpose === 'dev-server' || autoCommand === 'npm run dev') {
    return 'Dev process';
  }

  if (terminalPurpose === 'mission-console') {
    return 'Mission console';
  }

  return 'Workspace shell';
}

function compactPath(path: string): string {
  if (!path) {
    return 'cwd unavailable';
  }

  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 3) {
    return path;
  }

  return `.../${parts.slice(-3).join('/')}`;
}

interface TerminalPaneProps {
  id: string;
  cwd: string;
  shell?: string;
  label?: string;
  color?: TerminalColor;
  rainbowEffect?: boolean;
  autoCommand?: string;
  missionPrompt?: string;
  missionTitle?: string;
  agentName?: string;
  terminalPurpose?: string;
  runId?: string;
  currentCommand?: string;
  runtimeProvider?: AgentProvider;
  runtimeState?: TerminalRuntimeState;
  runtimeDetail?: string;
  runtimeAttempts?: number;
  ptyState?: TerminalPtyState;
  ptyDetail?: string;
  persistenceMode?: 'ephemeral' | 'screen';
  screenStatus?: string;
  screenSessionName?: string;
  screenLogPath?: string;
  onClose?: () => void;
  onStopSession?: () => void;
  onTitleChange?: (title: string) => void;
  onLabelChange?: (label: string) => void;
  onColorChange?: (color: TerminalColor) => void;
  onToggleRainbow?: () => void;
  onRuntimeStateChange?: (state: TerminalRuntimeState, detail?: string) => void;
  onActivity?: () => void;
  onRuntimeRetry?: (detail?: string) => void;
  onOpenDiagnostics?: () => void;
  isActive?: boolean;
  compactChrome?: boolean;
}

const terminalMetaLineStyle: React.CSSProperties = {
  minWidth: 0,
  width: '100%',
  color: '#94a3b8',
  fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
  fontSize: '9px',
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const terminalToolButtonStyle: React.CSSProperties = {
  width: '22px',
  height: '22px',
  padding: 0,
  borderRadius: '6px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.82)',
  color: '#cbd5e1',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '11px',
  fontWeight: 900,
  lineHeight: 1,
  transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease'
};

const terminalTextToolButtonStyle: React.CSSProperties = {
  ...terminalToolButtonStyle,
  width: 'auto',
  minWidth: '24px',
  padding: '0 7px',
  gap: '4px',
  fontSize: '9px',
  letterSpacing: '0.01em'
};

const TerminalPaneComponent: React.FC<TerminalPaneProps> = ({
  id,
  cwd,
  shell,
  label = 'Terminal',
  color = 'red',
  rainbowEffect = false,
  autoCommand,
  missionPrompt,
  missionTitle,
  agentName,
  terminalPurpose,
  runId,
  currentCommand,
  runtimeProvider,
  runtimeState = 'shell',
  runtimeDetail,
  runtimeAttempts = 0,
  ptyState = 'creating',
  ptyDetail,
  persistenceMode = 'ephemeral',
  screenStatus,
  screenSessionName,
  screenLogPath,
  onClose,
  onStopSession,
  onTitleChange,
  onLabelChange,
  onColorChange,
  onToggleRainbow,
  onRuntimeStateChange,
  onActivity,
  onRuntimeRetry,
  onOpenDiagnostics,
  isActive = false,
  compactChrome = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const hasExitedRef = useRef(false);
  const onTitleChangeRef = useRef(onTitleChange);
  const resizeFrameRef = useRef<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasExited, setHasExited] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editLabel, setEditLabel] = useState(label);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [outputViewerOpen, setOutputViewerOpen] = useState(false);
  const [outputViewerText, setOutputViewerText] = useState('');
  const [outputViewerStatus, setOutputViewerStatus] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef(loadAppSettings());
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const runtimeMonitorRef = useRef<{ armedAt: number; resolved: boolean; timeoutId: number | null }>({
    armedAt: 0,
    resolved: false,
    timeoutId: null
  });
  const runtimeIdleTimerRef = useRef<number | null>(null);
  const bootFallbackTimerRef = useRef<number | null>(null);
  const missionResponseTimerRef = useRef<number | null>(null);
  const autoRetryRef = useRef(false);
  const missionDispatchRef = useRef(false);
  const approvalPendingRef = useRef(false);
  const sawRuntimeOutputRef = useRef(false);
  const sawShellPromptRef = useRef(false);
  const outputQueueRef = useRef('');
  const outputFrameRef = useRef<number | null>(null);
  const runtimeStateCacheRef = useRef<{ state?: TerminalRuntimeState; detail?: string; updatedAt: number }>({
    updatedAt: 0
  });

  // Get color scheme
  const colorScheme = COLOR_SCHEMES[color];
  const performanceProfile = usePerformanceProfile();
  const allowAmbientTerminalMotion = performanceProfile === 'full';
  const rainbowAccentAnimated = Boolean(rainbowEffect && allowAmbientTerminalMotion);

  useEffect(() => {
    hasExitedRef.current = hasExited;
  }, [hasExited]);

  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);

  useEffect(() => {
    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      if (runtimeMonitorRef.current.timeoutId !== null) {
        window.clearTimeout(runtimeMonitorRef.current.timeoutId);
      }
      if (runtimeIdleTimerRef.current !== null) {
        window.clearTimeout(runtimeIdleTimerRef.current);
      }
      if (bootFallbackTimerRef.current !== null) {
        window.clearTimeout(bootFallbackTimerRef.current);
      }
      if (missionResponseTimerRef.current !== null) {
        window.clearTimeout(missionResponseTimerRef.current);
      }
      if (outputFrameRef.current !== null) {
        window.cancelAnimationFrame(outputFrameRef.current);
      }
    };
  }, []);

  const resolveRuntimeState = React.useCallback((state: TerminalRuntimeState, detail?: string) => {
    if (!runtimeProvider || !onRuntimeStateChange) {
      return;
    }

    const previous = runtimeStateCacheRef.current;
    const now = Date.now();
    const normalizedDetail = detail?.trim();
    const shouldSuppress =
      previous.state === state
      && previous.detail === normalizedDetail
      && now - previous.updatedAt < 1200;

    if (shouldSuppress) {
      return;
    }

    runtimeStateCacheRef.current = {
      state,
      detail: normalizedDetail,
      updatedAt: now
    };

    if (runtimeMonitorRef.current.timeoutId !== null) {
      window.clearTimeout(runtimeMonitorRef.current.timeoutId);
      runtimeMonitorRef.current.timeoutId = null;
    }
    if (runtimeIdleTimerRef.current !== null) {
      window.clearTimeout(runtimeIdleTimerRef.current);
      runtimeIdleTimerRef.current = null;
    }
    if (bootFallbackTimerRef.current !== null) {
      window.clearTimeout(bootFallbackTimerRef.current);
      bootFallbackTimerRef.current = null;
    }
    if (missionResponseTimerRef.current !== null) {
      window.clearTimeout(missionResponseTimerRef.current);
      missionResponseTimerRef.current = null;
    }

    runtimeMonitorRef.current.resolved = state === 'completed' || state === 'failed';
    onRuntimeStateChange(state, detail);
  }, [onRuntimeStateChange, runtimeProvider]);

  const dispatchMissionPrompt = React.useCallback(() => {
    if (!runtimeProvider || !missionPrompt || missionDispatchRef.current || approvalPendingRef.current) {
      return;
    }

    missionDispatchRef.current = true;
    resolveRuntimeState('waiting-response', 'Mission prompt dispatched');
    window.electronAPI.terminal.write(id, missionPrompt);
    if (missionResponseTimerRef.current !== null) {
      window.clearTimeout(missionResponseTimerRef.current);
    }
    missionResponseTimerRef.current = window.setTimeout(() => {
      if (missionDispatchRef.current && !approvalPendingRef.current) {
        resolveRuntimeState('stalled', 'Mission sent but the runtime has not produced output yet');
      }
      missionResponseTimerRef.current = null;
    }, 20000);
    window.setTimeout(() => {
      window.electronAPI.terminal.write(id, '\r');
    }, 80);
  }, [id, missionPrompt, resolveRuntimeState, runtimeProvider]);

  const startRuntimeAttempt = React.useCallback((detail: string) => {
    if (!runtimeProvider || !autoCommand || !onRuntimeStateChange) {
      return;
    }

    missionDispatchRef.current = false;
    approvalPendingRef.current = false;
    sawRuntimeOutputRef.current = false;
    sawShellPromptRef.current = false;

    if (runtimeMonitorRef.current.timeoutId !== null) {
      window.clearTimeout(runtimeMonitorRef.current.timeoutId);
    }
    if (runtimeIdleTimerRef.current !== null) {
      window.clearTimeout(runtimeIdleTimerRef.current);
    }
    if (bootFallbackTimerRef.current !== null) {
      window.clearTimeout(bootFallbackTimerRef.current);
    }
    if (missionResponseTimerRef.current !== null) {
      window.clearTimeout(missionResponseTimerRef.current);
      missionResponseTimerRef.current = null;
    }

    runtimeMonitorRef.current = {
      armedAt: Date.now(),
      resolved: false,
      timeoutId: null
    };

    onRuntimeStateChange('launching', detail);

    bootFallbackTimerRef.current = window.setTimeout(() => {
      if (!approvalPendingRef.current && !missionDispatchRef.current && sawRuntimeOutputRef.current && !sawShellPromptRef.current) {
        resolveRuntimeState('ready', `Runtime opened for ${autoCommand}`);
        dispatchMissionPrompt();
      } else if (!approvalPendingRef.current && !missionDispatchRef.current && !sawRuntimeOutputRef.current) {
        resolveRuntimeState('stalled', `Waiting for ${autoCommand} to confirm runtime handoff`);
      }
      bootFallbackTimerRef.current = null;
    }, 8000);
  }, [autoCommand, dispatchMissionPrompt, onRuntimeStateChange, resolveRuntimeState, runtimeProvider]);

  const runtimeLooksLive = React.useCallback(() => (
    sawRuntimeOutputRef.current
    || missionDispatchRef.current
    || approvalPendingRef.current
    || isLiveRuntimeState(runtimeStateCacheRef.current.state)
    || isLiveRuntimeState(runtimeState)
  ), [runtimeState]);

  const triggerAutoRetry = React.useCallback((reason: string) => {
    if (!runtimeProvider || !autoCommand || !onRuntimeRetry || autoRetryRef.current || runtimeAttempts >= 2) {
      return;
    }

    if (runtimeLooksLive() || hasExitedRef.current) {
      resolveRuntimeState('running', `Runtime is active; suppressed relaunch (${reason})`);
      return;
    }

    autoRetryRef.current = true;
    onRuntimeRetry(`Auto-retrying ${autoCommand}: ${reason}`);

    window.setTimeout(() => {
      startRuntimeAttempt(`Retrying ${autoCommand}`);
      window.electronAPI.terminal.write(id, `${autoCommand}\r`);
    }, 450);
  }, [autoCommand, id, onRuntimeRetry, resolveRuntimeState, runtimeAttempts, runtimeLooksLive, runtimeProvider, startRuntimeAttempt]);

  const armRuntimeMonitor = React.useCallback(() => {
    startRuntimeAttempt(`Launching ${autoCommand}`);
  }, [autoCommand, startRuntimeAttempt]);

  const queueTerminalWrite = React.useCallback((data: string) => {
    outputQueueRef.current += data;

    if (outputFrameRef.current !== null) {
      return;
    }

    outputFrameRef.current = window.requestAnimationFrame(() => {
      outputFrameRef.current = null;
      if (!terminalRef.current || !outputQueueRef.current) {
        outputQueueRef.current = '';
        return;
      }

      terminalRef.current.write(outputQueueRef.current);
      outputQueueRef.current = '';
    });
  }, []);

  const inspectRuntimeOutput = React.useCallback((data: string) => {
    if (!runtimeProvider || !autoCommand) {
      return;
    }

    const normalized = stripAnsi(data).trim();

    if (!normalized) {
      return;
    }

    const runtimeIsLive = runtimeLooksLive();

    if (isRuntimeFailure(normalized) && !runtimeIsLive) {
      resolveRuntimeState('failed', normalized.slice(0, 180));
      triggerAutoRetry(normalized.slice(0, 120));
      return;
    }

    if (isLikelyCommandEcho(normalized, autoCommand)) {
      return;
    }

    if (isApprovalPrompt(normalized)) {
      approvalPendingRef.current = true;
      resolveRuntimeState('awaiting-approval', normalized.slice(0, 180));
      return;
    }

    if (isRuntimeIdlePrompt(normalized)) {
      approvalPendingRef.current = false;
      sawRuntimeOutputRef.current = true;
      resolveRuntimeState('ready', normalized.slice(0, 180));
      return;
    }

    if (isLikelyShellPrompt(normalized)) {
      sawShellPromptRef.current = true;

      if (!runtimeIsLive && !missionDispatchRef.current && Date.now() - runtimeMonitorRef.current.armedAt > 1500) {
        resolveRuntimeState('failed', 'Runtime returned control to the shell before accepting the mission');
        triggerAutoRetry('runtime returned to shell prompt');
      }
      return;
    }

    if (approvalPendingRef.current) {
      return;
    }

    if (runtimeIdleTimerRef.current !== null) {
      window.clearTimeout(runtimeIdleTimerRef.current);
    }
    if (missionResponseTimerRef.current !== null) {
      window.clearTimeout(missionResponseTimerRef.current);
      missionResponseTimerRef.current = null;
    }

    sawRuntimeOutputRef.current = true;

    if (!missionDispatchRef.current) {
      if (!missionPrompt) {
        resolveRuntimeState('ready', normalized.slice(0, 180));
      } else {
        resolveRuntimeState('handoff', 'Runtime handshake detected, dispatching mission');
      }
      runtimeIdleTimerRef.current = window.setTimeout(() => {
        if (!approvalPendingRef.current && !missionDispatchRef.current) {
          dispatchMissionPrompt();
        }
        runtimeIdleTimerRef.current = null;
      }, missionPrompt ? 1200 : 900);
      return;
    }

    resolveRuntimeState('running', normalized.slice(0, 180));
  }, [autoCommand, dispatchMissionPrompt, missionPrompt, resolveRuntimeState, runtimeLooksLive, runtimeProvider, triggerAutoRetry]);

  // Terminal communication hook
  const { write, resize, getSnapshot } = useTerminal(id, {
    onData: (data) => {
      onActivity?.();
      inspectRuntimeOutput(data);
      queueTerminalWrite(data);
    },
    onExit: (exitCode) => {
      setHasExited(true);

      if (runtimeProvider) {
        if (exitCode === 0) {
          resolveRuntimeState('completed', 'Process exited successfully');
        } else {
          resolveRuntimeState('failed', `Process exited with code ${exitCode}`);
          triggerAutoRetry(`process exited with code ${exitCode}`);
        }
      }

      queueTerminalWrite(`\r\n\r\n[Process exited with code ${exitCode}]\r\n`);
    }
  });

  const applyTerminalVisualSettings = React.useCallback((settings = loadAppSettings()) => {
    settingsRef.current = settings;

    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.theme = { ...TERMINAL_HACKER_THEME };
    terminal.options.fontSize = clampTerminalFontSize(settings.fontSize);
    terminal.options.fontFamily = TERMINAL_FONT_FAMILY;
    terminal.options.fontWeight = '400';
    terminal.options.fontWeightBold = '700';
    terminal.options.letterSpacing = 0;
    terminal.options.lineHeight = TERMINAL_LINE_HEIGHT;
    terminal.options.scrollback = clampTerminalScrollback(settings.scrollbackLines);

    if (!fitAddonRef.current || !containerRef.current) {
      return;
    }

    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      if (!fitAddonRef.current || terminalRef.current !== terminal || !containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      fitAddonRef.current.fit();
      const { cols, rows } = terminal;
      const lastSize = lastSizeRef.current;
      if (lastSize?.cols !== cols || lastSize?.rows !== rows) {
        lastSizeRef.current = { cols, rows };
        resize(cols, rows);
      }
    });
  }, [resize]);

  useEffect(() => {
    applyTerminalVisualSettings();

    const handleSettingsChange = () => {
      applyTerminalVisualSettings();
    };

    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, handleSettingsChange);
    window.addEventListener('storage', handleSettingsChange);
    return () => {
      window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, handleSettingsChange);
      window.removeEventListener('storage', handleSettingsChange);
    };
  }, [applyTerminalVisualSettings, performanceProfile]);

  const handleManualRuntimeRetry = React.useCallback(() => {
    if (!runtimeProvider || !autoCommand || hasExitedRef.current) {
      return;
    }

    if (runtimeLooksLive()) {
      resolveRuntimeState('running', 'Runtime is already active; open a new CLI to relaunch.');
      return;
    }

    if (runtimeState !== 'failed' && runtimeState !== 'stalled') {
      return;
    }

    autoRetryRef.current = false;
    missionDispatchRef.current = false;
    approvalPendingRef.current = false;
    onRuntimeRetry?.(`Manual retrying ${autoCommand}`);

    window.setTimeout(() => {
      startRuntimeAttempt(`Retrying ${autoCommand}`);
      write(`${autoCommand}\r`);
    }, 120);
  }, [autoCommand, onRuntimeRetry, resolveRuntimeState, runtimeLooksLive, runtimeProvider, runtimeState, startRuntimeAttempt, write]);

  useEffect(() => {
    if (runtimeAttempts <= 1) {
      autoRetryRef.current = false;
    }
  }, [runtimeAttempts]);

  // Initialize xterm once for this PTY. Runtime and PTY status props can change
  // often, so this effect must not depend on those values or typing will remount
  // the terminal surface.
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;
    const container = containerRef.current;

    // Use conservative terminal settings for CLI stability.
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: clampTerminalFontSize(settingsRef.current.fontSize),
      fontFamily: TERMINAL_FONT_FAMILY,
      fontWeight: '400',
      fontWeightBold: '700',
      letterSpacing: 0,
      lineHeight: TERMINAL_LINE_HEIGHT,
      theme: { ...TERMINAL_HACKER_THEME },
      scrollback: clampTerminalScrollback(settingsRef.current.scrollbackLines),
      allowProposedApi: true,
      allowTransparency: false,
      customGlyphs: true,
      smoothScrollDuration: 0
    });
    enableUnicode11(terminal);

    // Create fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in container
    terminal.open(container);

    const containerRect = container.getBoundingClientRect();
    if (containerRect.width > 0 && containerRect.height > 0) {
      fitAddon.fit();
    }

    // CRITICAL: Focus terminal immediately
    if (isActive) {
      terminal.focus();
    }

    // Handle user input
    terminal.onData((data) => {
      if (!hasExitedRef.current) {
        if (approvalPendingRef.current) {
          approvalPendingRef.current = false;
          resolveRuntimeState('launching', 'Approval submitted, waiting for runtime response');
        }
        write(data);
      }
    });

    // Handle title changes
    terminal.onTitleChange((title) => {
      if (!runtimeProvider && onTitleChangeRef.current) {
        onTitleChangeRef.current(normalizeTerminalTitle(title));
      }
    });

    // Store refs
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    applyTerminalVisualSettings(settingsRef.current);

    void getSnapshot().then((snapshot) => {
      if (!snapshot || terminalRef.current !== terminal) {
        return;
      }

      if (snapshot.buffer) {
        terminal.write(snapshot.buffer);
      }

      if (typeof snapshot.exitCode === 'number') {
        setHasExited(true);
      }
    }).catch(() => undefined);

    if (runtimeProvider && autoCommand) {
      armRuntimeMonitor();
    }
    setIsInitialized(true);

    // Cleanup - CRITICAL: NO matar PTY durante hot reload
    return () => {
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      // NO llamar kill() aquí - los PTY deben sobrevivir hot reload
      // Solo se matan cuando el usuario cierra explícitamente (ver onClose)
    };
  }, [applyTerminalVisualSettings, id, write, getSnapshot]);

  // Handle resize
  useEffect(() => {
    if (!fitAddonRef.current || !terminalRef.current || !isInitialized) return;

    const handleResize = () => {
      if (!fitAddonRef.current || !terminalRef.current || !containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      fitAddonRef.current.fit();
      const { cols, rows } = terminalRef.current;
      const lastSize = lastSizeRef.current;
      if (lastSize?.cols === cols && lastSize?.rows === rows) {
        return;
      }

      lastSizeRef.current = { cols, rows };
      resize(cols, rows);
    };

    const scheduleResize = () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        handleResize();
      });
    };

    scheduleResize();

    // Listen for window resize
    const resizeObserver = new ResizeObserver(() => {
      scheduleResize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      resizeObserver.disconnect();
    };
  }, [isInitialized, resize]);

  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  // Focus label input when editing starts
  useEffect(() => {
    if (isEditingLabel && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [isEditingLabel]);

  // Close color picker when clicking outside
  useEffect(() => {
    if (!showColorPicker) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-color-picker]')) {
        setShowColorPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker]);

  // Handle label editing
  const handleLabelDoubleClick = () => {
    setIsEditingLabel(true);
    setEditLabel(label);
  };

  const handleLabelSave = () => {
    const newLabel = editLabel.trim();
    if (newLabel && newLabel !== label && onLabelChange) {
      onLabelChange(newLabel);
    }
    setIsEditingLabel(false);
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleLabelSave();
    } else if (e.key === 'Escape') {
      setIsEditingLabel(false);
      setEditLabel(label);
    }
  };

  const readTerminalSnapshotText = React.useCallback(async () => {
    const snapshot = await getSnapshot();
    return stripAnsi(snapshot?.buffer || '').trimEnd();
  }, [getSnapshot]);

  const handleOpenOutputViewer = React.useCallback(async () => {
    setOutputViewerOpen(true);
    setOutputViewerStatus('Loading terminal output...');
    try {
      const text = await readTerminalSnapshotText();
      setOutputViewerText(text || 'No terminal output captured yet.');
      setOutputViewerStatus(text ? `${text.length.toLocaleString()} characters captured` : 'No output captured yet');
    } catch (error) {
      setOutputViewerText('');
      setOutputViewerStatus(error instanceof Error ? error.message : 'Could not read terminal output');
    }
  }, [readTerminalSnapshotText]);

  const handleCopyOutput = React.useCallback(async () => {
    try {
      const text = await readTerminalSnapshotText();
      await navigator.clipboard.writeText(text);
      setOutputViewerStatus(text ? `Copied ${text.length.toLocaleString()} characters` : 'No output to copy');
    } catch (error) {
      setOutputViewerStatus(error instanceof Error ? error.message : 'Could not copy terminal output');
    }
  }, [readTerminalSnapshotText]);

  const handleJumpBottom = React.useCallback(() => {
    terminalRef.current?.scrollToBottom();
    terminalRef.current?.focus();
  }, []);

  const hasRuntimeAttention = Boolean(runtimeProvider && (runtimeState === 'failed' || runtimeState === 'awaiting-approval'));
  const canRetryRuntime = Boolean(runtimeProvider && autoCommand && !hasExited && runtimeState === 'failed');
  const statusDetail = ptyState !== 'ready' ? (ptyDetail || runtimeDetail) : runtimeDetail;
  const shouldShowStatusFooter = Boolean(
    hasRuntimeAttention
    || (runtimeProvider && runtimeDetail && !hasExited)
    || (!hasExited && ptyDetail && ptyState !== 'ready')
  );
  const footerButtonStyle: React.CSSProperties = {
    height: '22px',
    padding: '2px 8px',
    borderRadius: '5px',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(15, 23, 42, 0.92)',
    color: '#cbd5e1',
    fontSize: '10px',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  };
  const providerMeta = runtimeProvider ? getProviderMeta(runtimeProvider) : null;
  const runtimeDisplay = getRuntimeDisplay(runtimeState, ptyState, hasExited);
  const providerAccent = providerMeta?.accent || colorScheme.primary;
  const terminalIdentity = missionTitle || agentName || label;
  const purposeLabel = getTerminalPurposeLabel(terminalPurpose, runtimeProvider, autoCommand);
  const commandLabel = currentCommand || autoCommand || (runtimeProvider ? providerMeta?.label : undefined) || shell || 'interactive shell';
  const ptyLabel = hasExited ? 'exited' : ptyState;
  const detailLabel = statusDetail || (runId ? `run ${runId.slice(0, 8)}` : undefined);
  const metaParts = [
    purposeLabel,
    persistenceMode === 'screen' ? `screen ${screenStatus || 'persistent'}` : null,
    screenSessionName ? `session ${screenSessionName}` : null,
    screenLogPath ? `log ${compactPath(screenLogPath)}` : null,
    `cmd ${commandLabel}`,
    compactPath(cwd),
    `pty ${ptyLabel}`,
    runtimeProvider && runtimeAttempts > 1 && !hasExited ? `retry ${runtimeAttempts - 1}` : null,
    detailLabel
  ].filter(Boolean);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: TERMINAL_PANEL_BACKGROUND,
      border: isActive
        ? `1px solid ${providerAccent}cc`
        : `1px solid ${colorScheme.border}`,
      borderRadius: compactChrome ? '8px' : '12px',
      overflow: 'hidden',
      boxShadow: isActive
        ? compactChrome
          ? `0 0 0 1px ${providerAccent}2e, 0 8px 18px rgba(0, 0, 0, 0.26)`
          : `0 0 0 1px ${providerAccent}24, 0 14px 30px rgba(0, 0, 0, 0.34)`
        : '0 0 0 1px rgba(15, 23, 42, 0.42), 0 8px 18px rgba(0, 0, 0, 0.22)',
      position: 'relative',
      zIndex: isActive ? 2 : 1,
      isolation: 'isolate',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
      // Remove transform scale which causes blurriness
      transform: 'none'
    }}>
      {/* Manual accent rail. Animation stays off unless the full visual profile is active. */}
      {rainbowEffect ? (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, #fb7185, #f59e0b, #84cc16, #22d3ee, #60a5fa, #c084fc, #fb7185)',
          backgroundSize: '300% 100%',
          pointerEvents: 'none',
          zIndex: 6,
          animation: rainbowAccentAnimated ? 'borderFlow 12s linear infinite' : 'none',
          opacity: allowAmbientTerminalMotion ? 0.44 : 0.28
        }} />
      ) : null}

      <style>
        {`
          @keyframes borderFlow {
            0% {
              background-position: 0% 50%;
            }
            100% {
              background-position: 400% 50%;
            }
          }
        `}
      </style>

      {/* Terminal header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: compactChrome ? '6px' : '8px',
        padding: compactChrome ? '4px 6px' : '5px 8px',
        background: isActive ? TERMINAL_HEADER_ACTIVE_BACKGROUND : TERMINAL_HEADER_BACKGROUND,
        borderBottom: isActive ? `1px solid ${providerAccent}44` : '1px solid rgba(148, 163, 184, 0.12)',
        fontSize: '10px',
        color: isActive ? 'var(--app-text)' : 'var(--app-muted)',
        position: 'relative',
        zIndex: 10,
        boxShadow: isActive && allowAmbientTerminalMotion
          ? `0 4px 14px ${providerMeta?.glow || colorScheme.glow}`
          : 'inset 0 -1px 0 rgba(255, 255, 255, 0.025)'
      }}
      title={compactChrome ? metaParts.join(' / ') : undefined}
      >
        <div style={{ display: 'grid', gap: compactChrome ? 0 : '2px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <span style={{
              width: compactChrome ? '26px' : '28px',
              height: compactChrome ? '20px' : '22px',
              borderRadius: '6px',
              border: `1px solid ${providerAccent}4f`,
              background: `${providerAccent}17`,
              color: providerAccent,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              fontWeight: 900,
              letterSpacing: 0,
              flexShrink: 0
            }}>
              {providerMeta?.shortLabel || (terminalPurpose === 'dev-server' ? 'DEV' : 'SH')}
            </span>

            <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center' }}>
              {isEditingLabel ? (
                <input
                  ref={labelInputRef}
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={handleLabelSave}
                  onKeyDown={handleLabelKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: 'rgba(2, 6, 23, 0.92)',
                    border: `1px solid ${providerAccent}80`,
                    borderRadius: '6px',
                    padding: '2px 6px',
                    fontSize: '11px',
                    color: '#ffffff',
                    fontWeight: 800,
                    outline: 'none',
                    minWidth: '110px',
                    maxWidth: '220px'
                  }}
                />
              ) : (
                <button
                  type="button"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleLabelDoubleClick();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title="Double-click to edit terminal name"
                  style={{
                    minWidth: 0,
                    width: 'fit-content',
                    maxWidth: '100%',
                    border: '0',
                    background: 'transparent',
                    color: isActive ? 'var(--app-text)' : '#cbd5e1',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '11px',
                    fontWeight: 900,
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {terminalIdentity}
                </button>
              )}
            </div>

            {!compactChrome && isActive ? (
              <span style={{
                color: providerAccent,
                background: `${providerAccent}18`,
                border: `1px solid ${providerAccent}3d`,
                borderRadius: '999px',
                padding: '2px 6px',
                fontSize: '8px',
                fontWeight: 900,
                textTransform: 'uppercase',
                flexShrink: 0
              }}>
                Active
              </span>
            ) : null}

            {compactChrome ? (
              <span
                title={runtimeDisplay.label}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '999px',
                  background: runtimeDisplay.color,
                  boxShadow: `0 0 10px ${runtimeDisplay.color}66`,
                  flexShrink: 0
                }}
              />
            ) : (
              <span style={{
              color: runtimeDisplay.color,
              background: runtimeDisplay.background,
              border: `1px solid ${runtimeDisplay.border}`,
              borderRadius: '999px',
              padding: '2px 6px',
              fontSize: '8px',
              fontWeight: 900,
              textTransform: 'uppercase',
              flexShrink: 0
            }}>
              {runtimeDisplay.label}
              </span>
            )}
          </div>

          {!compactChrome ? (
            <div
            style={{
              ...terminalMetaLineStyle,
              color: hasRuntimeAttention ? '#fbbf24' : '#94a3b8'
            }}
            title={metaParts.join(' / ')}
          >
            {metaParts.join(' · ')}
            </div>
          ) : null}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '3px',
          position: 'relative',
          zIndex: 2000
        }}>
          {!compactChrome ? (
            <>
              <div data-color-picker style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowColorPicker(!showColorPicker);
                  }}
                  style={{
                    ...terminalToolButtonStyle,
                    color: colorScheme.primary,
                    background: colorScheme.badge,
                    borderColor: colorScheme.badgeBorder
                }}
                title="Change terminal color"
              >
                  <Palette size={12} />
                </button>

                {showColorPicker && (
                  <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(0, 0, 0, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px',
                    zIndex: 99999,
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
                  }}>
                    {Object.entries(COLOR_SCHEMES).map(([colorKey, scheme]) => (
                      <button
                        key={colorKey}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onColorChange?.(colorKey as TerminalColor);
                          setShowColorPicker(false);
                        }}
                        style={{
                          background: scheme.badge,
                          border: `2px solid ${color === colorKey ? scheme.primary : scheme.badgeBorder}`,
                          borderRadius: '8px',
                          padding: '12px',
                          cursor: 'pointer',
                          fontSize: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          boxShadow: color === colorKey ? `0 0 20px ${scheme.glow}` : 'none'
                        }}
                        title={scheme.name}
                      >
                        {scheme.icon}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRainbow?.();
                }}
                style={{
                  ...terminalToolButtonStyle,
                  color: rainbowEffect ? '#ffffff' : '#94a3b8',
                  background: rainbowEffect
                    ? 'linear-gradient(90deg, #ef4444, #f97316, #eab308, #10b981, #06b6d4, #3b82f6, #a855f7, #ec4899)'
                    : 'rgba(15, 23, 42, 0.82)',
                  backgroundSize: '400% 100%',
                  animation: rainbowAccentAnimated ? 'borderFlow 10s linear infinite' : 'none',
                  borderColor: rainbowEffect ? 'rgba(255, 255, 255, 0.24)' : 'rgba(148, 163, 184, 0.16)'
                }}
                title={rainbowEffect ? 'Disable visual accent' : 'Enable visual accent'}
              >
                <Sparkles size={12} />
              </button>
            </>
          ) : null}

          {onClose ? (
            <>
              {persistenceMode === 'screen' ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStopSession?.();
                  }}
                  style={{
                    ...terminalTextToolButtonStyle,
                    color: '#fca5a5',
                    background: 'rgba(239, 68, 68, 0.10)',
                    borderColor: 'rgba(248, 113, 113, 0.24)'
                  }}
                  title={`Stop persistent screen session${screenSessionName ? ` ${screenSessionName}` : ''}`}
                >
                  <Power size={12} />
                  {!compactChrome ? 'Stop' : null}
                </button>
              ) : null}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleOpenOutputViewer();
                }}
                style={terminalTextToolButtonStyle}
                title="Open full terminal output"
              >
                <Maximize2 size={12} />
                {!compactChrome ? 'Output' : null}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyOutput();
                }}
                style={terminalToolButtonStyle}
                title="Copy terminal output"
              >
                <Clipboard size={12} />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleJumpBottom();
                }}
                style={terminalToolButtonStyle}
                title="Jump to latest output"
              >
                <ArrowDownToLine size={12} />
              </button>
            </>
          ) : null}

          {onClose ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              style={{
                ...terminalToolButtonStyle,
                color: '#fca5a5',
                background: 'rgba(239, 68, 68, 0.10)',
                borderColor: 'rgba(248, 113, 113, 0.22)'
              }}
              title={persistenceMode === 'screen' ? 'Close view and keep screen session running' : 'Close terminal'}
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Terminal container - ultra translucent pro background */}
      <div
        ref={containerRef}
        onMouseDown={() => {
          if (terminalRef.current) {
            terminalRef.current.focus();
          }
        }}
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          overflow: 'hidden',
          padding: 0,
          background: TERMINAL_SURFACE_BACKGROUND,
          position: 'relative',
          cursor: 'text',
          zIndex: 1
        }}
        tabIndex={0}
      />

      {shouldShowStatusFooter ? (
        <div style={{
          padding: '4px 10px',
          borderTop: '1px solid rgba(148, 163, 184, 0.08)',
          color: '#94a3b8',
          fontSize: '10px',
          background: 'rgba(2, 6, 23, 0.95)',
          minHeight: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{
            minWidth: 0,
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {statusDetail || 'Runtime needs attention'}
          </span>
          {hasRuntimeAttention ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {runtimeState === 'failed' ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleManualRuntimeRetry();
                  }}
                  disabled={!canRetryRuntime}
                  title={canRetryRuntime ? 'Retry runtime before handoff' : 'Open a new console to relaunch this runtime'}
                  style={{
                    ...footerButtonStyle,
                    opacity: canRetryRuntime ? 1 : 0.45,
                    cursor: canRetryRuntime ? 'pointer' : 'not-allowed'
                  }}
                >
                  Retry runtime
                </button>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDiagnostics?.();
                }}
                style={footerButtonStyle}
              >
                Diagnostics
              </button>
              {onClose ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                  }}
                  style={{
                    ...footerButtonStyle,
                    border: '1px solid rgba(248, 113, 113, 0.24)',
                    color: '#fca5a5'
                  }}
                >
                  Close
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}

      {outputViewerOpen ? (
        <TerminalOutputViewer
          title={terminalIdentity}
          detail={metaParts.join(' / ')}
          text={outputViewerText}
          status={outputViewerStatus}
          onClose={() => setOutputViewerOpen(false)}
          onCopy={() => void handleCopyOutput()}
        />
      ) : null}

    </div>
  );
};

function TerminalOutputViewer({
  title,
  detail,
  text,
  status,
  onClose,
  onCopy
}: {
  title: string;
  detail: string;
  text: string;
  status: string;
  onClose: () => void;
  onCopy: () => void;
}) {
  return (
    <div style={outputViewerOverlayStyle} role="dialog" aria-modal="true" aria-label="Terminal output viewer">
      <section style={outputViewerPanelStyle}>
        <header style={outputViewerHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={outputViewerTitleStyle}>{title}</div>
            <div style={outputViewerDetailStyle} title={detail}>{detail}</div>
            <div style={outputViewerStatusStyle}>{status}</div>
          </div>
          <div style={outputViewerActionsStyle}>
            <button type="button" onClick={onCopy} style={outputViewerButtonStyle}>
              <Clipboard size={13} />
              Copy output
            </button>
            <button type="button" onClick={onClose} style={outputViewerIconButtonStyle} aria-label="Close output viewer">
              <X size={15} />
            </button>
          </div>
        </header>
        <pre style={outputViewerPreStyle}>{text}</pre>
      </section>
    </div>
  );
}

const outputViewerOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100000,
  padding: '28px',
  background: 'rgba(2, 6, 23, 0.72)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  display: 'grid',
  placeItems: 'center'
};

const outputViewerPanelStyle: React.CSSProperties = {
  width: 'min(1120px, 96vw)',
  height: 'min(820px, 92vh)',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: '14px',
  border: '1px solid rgba(148, 163, 184, 0.24)',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98))',
  boxShadow: '0 24px 80px rgba(0, 0, 0, 0.58)'
};

const outputViewerHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '14px',
  alignItems: 'start',
  padding: '14px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.92)'
};

const outputViewerTitleStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '14px',
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const outputViewerDetailStyle: React.CSSProperties = {
  marginTop: '5px',
  color: '#94a3b8',
  fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
  fontSize: '10px',
  fontWeight: 750,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const outputViewerStatusStyle: React.CSSProperties = {
  marginTop: '6px',
  color: '#67e8f9',
  fontSize: '10px',
  fontWeight: 800
};

const outputViewerActionsStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px'
};

const outputViewerButtonStyle: React.CSSProperties = {
  height: '30px',
  borderRadius: '8px',
  border: '1px solid rgba(103, 232, 249, 0.24)',
  background: 'rgba(6, 182, 212, 0.10)',
  color: '#cffafe',
  padding: '0 10px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  fontSize: '11px',
  fontWeight: 850,
  cursor: 'pointer'
};

const outputViewerIconButtonStyle: React.CSSProperties = {
  ...outputViewerButtonStyle,
  width: '30px',
  padding: 0,
  justifyContent: 'center',
  borderColor: 'rgba(248, 113, 113, 0.26)',
  background: 'rgba(239, 68, 68, 0.10)',
  color: '#fecaca'
};

const outputViewerPreStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  margin: 0,
  padding: '14px',
  overflow: 'auto',
  scrollbarGutter: 'stable',
  background: '#05070b',
  color: '#dbeafe',
  fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
  fontSize: '12px',
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere'
};

export const TerminalPane = memo(TerminalPaneComponent, (prev, next) => (
  prev.id === next.id &&
  prev.cwd === next.cwd &&
  prev.shell === next.shell &&
  prev.label === next.label &&
  prev.color === next.color &&
  prev.rainbowEffect === next.rainbowEffect &&
  prev.autoCommand === next.autoCommand &&
  prev.missionPrompt === next.missionPrompt &&
  prev.currentCommand === next.currentCommand &&
  prev.runtimeProvider === next.runtimeProvider &&
  prev.ptyState === next.ptyState &&
  prev.ptyDetail === next.ptyDetail &&
  prev.runtimeState === next.runtimeState &&
  prev.runtimeDetail === next.runtimeDetail &&
  prev.runtimeAttempts === next.runtimeAttempts &&
  prev.persistenceMode === next.persistenceMode &&
  prev.screenStatus === next.screenStatus &&
  prev.screenSessionName === next.screenSessionName &&
  prev.screenLogPath === next.screenLogPath &&
  prev.onOpenDiagnostics === next.onOpenDiagnostics &&
  prev.isActive === next.isActive &&
  prev.compactChrome === next.compactChrome
));
