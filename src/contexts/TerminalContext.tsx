import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AgentProvider } from '../types/agents';
import type { MissionConsoleEvidenceRef, MissionConsoleMissionKind } from '../types/missionConsole';
import { normalizeRuntimeCommandForShell, resolveTerminalShell } from '../utils/terminalShell';

export type TerminalColor = 'red' | 'green' | 'blue' | 'yellow' | 'purple' | 'cyan' | 'orange' | 'pink';
export type TerminalRuntimeState =
  | 'shell'
  | 'launching'
  | 'handoff'
  | 'ready'
  | 'waiting-response'
  | 'awaiting-approval'
  | 'running'
  | 'stalled'
  | 'completed'
  | 'failed';
export type TerminalPtyState = 'creating' | 'ready' | 'failed';

export interface TerminalSession {
  id: string;
  label: string;
  cwd: string;
  shell?: string;
  workspaceId?: string;
  color: TerminalColor;
  rainbowEffect?: boolean;
  createdAt: number;
  autoCommand?: string;
  missionPrompt?: string;
  missionTitle?: string;
  missionKind?: MissionConsoleMissionKind | string;
  handoffSummary?: string;
  evidenceRefs?: MissionConsoleEvidenceRef[];
  currentCommand?: string;
  agentId?: string;
  agentName?: string;
  terminalPurpose?: string;
  runId?: string;
  runtimeProvider?: AgentProvider;
  runtimeState?: TerminalRuntimeState;
  runtimeDetail?: string;
  runtimeAttempts?: number;
  lastOutputAt?: number;
  lastStateChangeAt?: number;
  ptyState?: TerminalPtyState;
  ptyDetail?: string;
}

export type LayoutUpdateCallback = (terminalId: string) => void;

interface TerminalContextValue {
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  createTerminal: (
    cwd: string,
    shell?: string,
    label?: string,
    autoCommand?: string,
    metadata?: Pick<TerminalSession, 'agentId' | 'agentName' | 'terminalPurpose' | 'missionPrompt'>
      & Pick<TerminalSession, 'workspaceId' | 'missionTitle' | 'missionKind' | 'handoffSummary' | 'evidenceRefs'>
      & Pick<TerminalSession, 'runtimeProvider' | 'runId'>
  ) => string;
  closeTerminal: (id: string) => void;
  closeAllTerminals: (predicate?: (terminal: TerminalSession) => boolean) => void;
  setActiveTerminal: (id: string) => void;
  updateTerminalCwd: (id: string, cwd: string) => void;
  updateTerminalLabel: (id: string, label: string) => void;
  updateTerminalColor: (id: string, color: TerminalColor) => void;
  updateTerminalCommand: (id: string, command: string) => void;
  updateTerminalRuntimeState: (id: string, state: TerminalRuntimeState, detail?: string) => void;
  updateTerminalPtyState: (id: string, state: TerminalPtyState, detail?: string) => void;
  touchTerminalActivity: (id: string) => void;
  retryTerminalRuntime: (id: string, detail?: string) => void;
  toggleRainbowEffect: (id: string) => void;
  onLayoutUpdateNeeded: (callback: LayoutUpdateCallback | null) => void;
}

const TerminalContext = createContext<TerminalContextValue | undefined>(undefined);

const STORAGE_KEY = 'hedge-station:terminal-sessions';
const STALE_RUNTIME_LAUNCH_MS = 45_000;
const TERMINAL_ACTIVITY_UPDATE_MS = 5_000;

function loadPersistedSessions(): TerminalSession[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const sessions = JSON.parse(stored) as TerminalSession[];
      return Array.isArray(sessions)
        ? sessions.map(normalizePersistedSession)
        : [];
    }
  } catch (error) {
    console.error('Failed to load persisted terminal sessions:', error);
  }
  return [];
}

function normalizeRuntimeState(state: TerminalSession['runtimeState'] | 'pending' | 'booted'): TerminalSession['runtimeState'] {
  if (state === 'pending') {
    return 'launching';
  }
  if (state === 'booted') {
    return 'ready';
  }
  return state;
}

function getPersistedSessionAgeMs(session: TerminalSession): number {
  const stamp = typeof session.lastStateChangeAt === 'number'
    ? session.lastStateChangeAt
    : typeof session.createdAt === 'number'
      ? session.createdAt
      : 0;

  return stamp > 0 ? Date.now() - stamp : Number.POSITIVE_INFINITY;
}

function normalizePersistedSession(session: TerminalSession): TerminalSession {
  const shellResolution = resolveTerminalShell(session.shell);
  const normalizedAutoCommand = normalizeRuntimeCommandForShell(session.autoCommand, shellResolution.shell);
  const normalizedCurrentCommand = normalizeRuntimeCommandForShell(session.currentCommand, shellResolution.shell);
  const normalizedRuntimeState = normalizeRuntimeState(session.runtimeState);
  const staleLaunching =
    normalizedRuntimeState === 'launching'
    && getPersistedSessionAgeMs(session) > STALE_RUNTIME_LAUNCH_MS;
  const nextRuntimeState = staleLaunching
    ? (session.runtimeProvider ? 'stalled' : 'shell')
    : normalizedRuntimeState;
  const staleWindowsLaunchDetail = session.runtimeDetail
    && /launching (codex\.cmd|claude\.exe|gemini\.cmd)/i.test(session.runtimeDetail);

  return {
    ...session,
    shell: shellResolution.shell,
    autoCommand: normalizedAutoCommand,
    currentCommand: normalizedCurrentCommand,
    runtimeState: nextRuntimeState,
    runtimeDetail: staleLaunching
      ? 'Reattached terminal session; runtime launch state was stale'
      : staleWindowsLaunchDetail
        ? 'Reattached terminal session'
        : session.runtimeDetail,
    lastOutputAt: typeof session.lastOutputAt === 'number' ? session.lastOutputAt : undefined,
    lastStateChangeAt: staleLaunching
      ? Date.now()
      : typeof session.lastStateChangeAt === 'number'
        ? session.lastStateChangeAt
        : undefined
  };
}

function saveSessionsToStorage(sessions: TerminalSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error('Failed to save terminal sessions:', error);
  }
}

function formatTerminalCreateError(error?: string): string {
  const message = error || 'Failed to create terminal process';
  if (/terminal:doctor|node-pty|spawn-helper|posix_spawnp|execute permission/i.test(message)) {
    return message.includes('terminal:doctor')
      ? message
      : `${message}. Run npm run terminal:doctor, then restart the Electron shell.`;
  }

  return message;
}

export const TerminalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [terminals, setTerminals] = useState<TerminalSession[]>(() => loadPersistedSessions());
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const persistTimeoutRef = React.useRef<number | null>(null);
  const layoutUpdateCallbackRef = React.useRef<LayoutUpdateCallback | null>(null);

  useEffect(() => {
    if (persistTimeoutRef.current !== null) {
      window.clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      if (terminals.length > 0) {
        saveSessionsToStorage(terminals);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      persistTimeoutRef.current = null;
    }, 250);

    return () => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [terminals]);

  useEffect(() => {
    const restoreSessions = async () => {
      if (terminals.length === 0) {
        return;
      }

      try {
        const activeIds = new Set(await window.electronAPI.terminal.getAllIds());
        const restoredTerminals = terminals.filter((terminal) => activeIds.has(terminal.id));

        if (restoredTerminals.length !== terminals.length) {
          setTerminals(restoredTerminals);
        }

        setActiveTerminalId((current) => {
          if (current && restoredTerminals.some(t => t.id === current)) {
            return current;
          }
          return restoredTerminals[0]?.id ?? null;
        });
      } catch (error) {
        console.error('Failed to restore terminal sessions:', error);
        setTerminals([]);
        setActiveTerminalId(null);
      }
    };

    restoreSessions();
  }, []);

  const createTerminal = useCallback((
    cwd: string,
    shell?: string,
    label?: string,
    autoCommand?: string,
    metadata?: Pick<TerminalSession, 'agentId' | 'agentName' | 'terminalPurpose' | 'missionPrompt'>
      & Pick<TerminalSession, 'workspaceId' | 'missionTitle' | 'missionKind' | 'handoffSummary' | 'evidenceRefs'>
      & Pick<TerminalSession, 'runtimeProvider' | 'runId'>
  ): string => {
    const id = `terminal-${uuidv4()}`;
    const colors: TerminalColor[] = ['red', 'green', 'blue', 'yellow', 'purple', 'cyan', 'orange', 'pink'];
    const nextColor = colors[terminals.length % colors.length];
    const shellResolution = resolveTerminalShell(shell);
    const resolvedShell = shellResolution.shell;
    const resolvedAutoCommand = normalizeRuntimeCommandForShell(autoCommand, resolvedShell);
    const now = Date.now();

    const terminal: TerminalSession = {
      id,
      label: label || `Terminal ${terminals.length + 1}`,
      cwd,
      shell: resolvedShell,
      workspaceId: metadata?.workspaceId,
      color: nextColor,
      createdAt: now,
      autoCommand: resolvedAutoCommand,
      missionPrompt: metadata?.missionPrompt,
      missionTitle: metadata?.missionTitle,
      missionKind: metadata?.missionKind,
      handoffSummary: metadata?.handoffSummary,
      evidenceRefs: metadata?.evidenceRefs,
      currentCommand: resolvedAutoCommand || undefined,
      agentId: metadata?.agentId,
      agentName: metadata?.agentName,
      terminalPurpose: metadata?.terminalPurpose,
      runId: metadata?.runId,
      runtimeProvider: metadata?.runtimeProvider,
      runtimeState: metadata?.runtimeProvider && resolvedAutoCommand ? 'launching' : 'shell',
      runtimeDetail: metadata?.runtimeProvider && resolvedAutoCommand ? 'Launching runtime process' : 'Interactive shell',
      runtimeAttempts: metadata?.runtimeProvider && resolvedAutoCommand ? 1 : 0,
      lastStateChangeAt: now,
      ptyState: 'creating',
      ptyDetail: 'Creating terminal process'
    };

    setTerminals(prev => [...prev, terminal]);
    setActiveTerminalId(id);

    void window.electronAPI.terminal.create(id, cwd, resolvedShell, resolvedAutoCommand)
      .then((result) => {
        if (result?.success === false) {
          const detail = formatTerminalCreateError(result.error);
          setTerminals(prev => prev.map((item) => (
            item.id === id
              ? {
                  ...item,
                  ptyState: 'failed',
                  ptyDetail: detail,
                  runtimeState: item.runtimeProvider ? 'failed' : item.runtimeState,
                  runtimeDetail: detail || item.runtimeDetail,
                  lastStateChangeAt: Date.now()
                }
              : item
          )));
          return;
        }

        setTerminals(prev => prev.map((item) => (
          item.id === id
            ? {
                ...item,
                shell: result?.shell || item.shell,
                cwd: result?.cwd || item.cwd,
                ptyState: 'ready',
                ptyDetail: result?.normalizedShell && result.shell
                  ? `Terminal process ready (${result.shell})`
                  : 'Terminal process ready',
                lastStateChangeAt: Date.now()
              }
            : item
        )));
      })
      .catch((error) => {
        const message = formatTerminalCreateError(error instanceof Error ? error.message : undefined);
        setTerminals(prev => prev.map((item) => (
          item.id === id
            ? {
                ...item,
                ptyState: 'failed',
                ptyDetail: message,
                runtimeState: item.runtimeProvider ? 'failed' : item.runtimeState,
                runtimeDetail: message,
                lastStateChangeAt: Date.now()
              }
            : item
        )));
      });

    if (layoutUpdateCallbackRef.current) {
      setTimeout(() => layoutUpdateCallbackRef.current?.(id), 0);
    }

    return id;
  }, [terminals.length]);

  const closeTerminal = useCallback((id: string) => {
    window.electronAPI.terminal.kill(id);

    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== id);

      if (activeTerminalId === id && filtered.length > 0) {
        setActiveTerminalId(filtered[filtered.length - 1].id);
      } else if (filtered.length === 0) {
        setActiveTerminalId(null);
      }

      return filtered;
    });
  }, [activeTerminalId]);

  const closeAllTerminals = useCallback((predicate?: (terminal: TerminalSession) => boolean) => {
    setTerminals((prev) => {
      const targets = predicate ? prev.filter(predicate) : prev;

      targets.forEach((terminal) => {
        window.electronAPI.terminal.kill(terminal.id);
      });

      const targetIds = new Set(targets.map((terminal) => terminal.id));
      const filtered = prev.filter((terminal) => !targetIds.has(terminal.id));

      setActiveTerminalId((current) => {
        if (current && filtered.some((terminal) => terminal.id === current)) {
          return current;
        }
        return filtered[filtered.length - 1]?.id ?? null;
      });

      return filtered;
    });
  }, []);

  const setActiveTerminal = useCallback((id: string) => {
    setActiveTerminalId(current => {
      if (current === id) {
        return current;
      }

      return terminals.some(t => t.id === id) ? id : current;
    });
  }, [terminals]);

  const updateTerminalCwd = useCallback((id: string, cwd: string) => {
    const nextCwd = cwd.trim();
    if (!nextCwd) {
      return;
    }

    setTerminals(prev => prev.map(t => (
      t.id === id && t.cwd !== nextCwd ? { ...t, cwd: nextCwd } : t
    )));
  }, []);

  const updateTerminalLabel = useCallback((id: string, label: string) => {
    setTerminals(prev => prev.map(t => (t.id === id ? { ...t, label } : t)));
  }, []);

  const updateTerminalColor = useCallback((id: string, color: TerminalColor) => {
    setTerminals(prev => prev.map(t => (t.id === id ? { ...t, color } : t)));
  }, []);

  const updateTerminalCommand = useCallback((id: string, command: string) => {
    setTerminals(prev => prev.map(t => (
      t.id === id
        ? { ...t, currentCommand: normalizeRuntimeCommandForShell(command, t.shell) }
        : t
    )));
  }, []);

  const updateTerminalRuntimeState = useCallback((id: string, state: TerminalRuntimeState, detail?: string) => {
    setTerminals(prev => prev.map(t => (
      t.id === id
        ? {
            ...t,
            runtimeState: state,
            runtimeDetail: detail,
            lastStateChangeAt: Date.now()
          }
        : t
    )));
  }, []);

  const updateTerminalPtyState = useCallback((id: string, state: TerminalPtyState, detail?: string) => {
    setTerminals(prev => prev.map(t => (
      t.id === id
        ? {
            ...t,
            ptyState: state,
            ptyDetail: detail,
            lastStateChangeAt: Date.now()
          }
        : t
    )));
  }, []);

  const touchTerminalActivity = useCallback((id: string) => {
    const now = Date.now();
    setTerminals(prev => {
      let changed = false;
      const next = prev.map(t => {
        if (t.id !== id) {
          return t;
        }

        if (typeof t.lastOutputAt === 'number' && now - t.lastOutputAt < TERMINAL_ACTIVITY_UPDATE_MS) {
          return t;
        }

        changed = true;
        return {
          ...t,
          lastOutputAt: now
        };
      });

      return changed ? next : prev;
    });
  }, []);

  const retryTerminalRuntime = useCallback((id: string, detail?: string) => {
    setTerminals(prev => prev.map(t => (
      t.id === id
        ? {
            ...t,
            currentCommand: normalizeRuntimeCommandForShell(t.currentCommand || t.autoCommand, t.shell),
            runtimeState: 'launching',
            runtimeAttempts: (t.runtimeAttempts ?? 0) + 1,
            runtimeDetail: detail || `Retrying ${t.currentCommand || 'runtime'}`,
            lastStateChangeAt: Date.now()
          }
        : t
    )));
  }, []);

  const toggleRainbowEffect = useCallback((id: string) => {
    setTerminals(prev => prev.map(t => (t.id === id ? { ...t, rainbowEffect: !t.rainbowEffect } : t)));
  }, []);

  const onLayoutUpdateNeeded = useCallback((callback: LayoutUpdateCallback | null) => {
    layoutUpdateCallbackRef.current = callback;
  }, []);

  const value = useMemo<TerminalContextValue>(() => ({
    terminals,
    activeTerminalId,
    createTerminal,
    closeTerminal,
    closeAllTerminals,
    setActiveTerminal,
    updateTerminalCwd,
    updateTerminalLabel,
    updateTerminalColor,
    updateTerminalCommand,
    updateTerminalRuntimeState,
    updateTerminalPtyState,
    touchTerminalActivity,
    retryTerminalRuntime,
    toggleRainbowEffect,
    onLayoutUpdateNeeded
  }), [
    terminals,
    activeTerminalId,
    createTerminal,
    closeTerminal,
    closeAllTerminals,
    setActiveTerminal,
    updateTerminalCwd,
    updateTerminalLabel,
    updateTerminalColor,
    updateTerminalCommand,
    updateTerminalRuntimeState,
    updateTerminalPtyState,
    touchTerminalActivity,
    retryTerminalRuntime,
    toggleRainbowEffect,
    onLayoutUpdateNeeded
  ]);

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
};

export const useTerminalContext = () => {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminalContext must be used within TerminalProvider');
  }
  return context;
};
