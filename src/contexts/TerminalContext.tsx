import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AgentProvider } from '../types/agents';

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
  color: TerminalColor;
  rainbowEffect?: boolean;
  createdAt: number;
  autoCommand?: string;
  missionPrompt?: string;
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

function loadPersistedSessions(): TerminalSession[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const sessions = JSON.parse(stored) as TerminalSession[];
      return Array.isArray(sessions)
        ? sessions.map((session) => ({
            ...session,
            currentCommand: session.currentCommand === 'codex.cmd'
              ? 'codex'
              : session.currentCommand === 'claude.exe'
                ? 'claude'
                : session.currentCommand === 'gemini.cmd'
                  ? 'gemini'
                  : session.currentCommand,
            runtimeState:
              session.runtimeState === 'pending'
                ? 'launching'
                : session.runtimeState === 'booted'
                  ? 'ready'
                  : session.runtimeState,
            runtimeDetail: session.runtimeDetail && /launching (codex\.cmd|claude\.exe|gemini\.cmd)/i.test(session.runtimeDetail)
              ? 'Reattached terminal session'
              : session.runtimeDetail,
            lastOutputAt: typeof session.lastOutputAt === 'number' ? session.lastOutputAt : undefined,
            lastStateChangeAt: typeof session.lastStateChangeAt === 'number' ? session.lastStateChangeAt : undefined
          }))
        : [];
    }
  } catch (error) {
    console.error('Failed to load persisted terminal sessions:', error);
  }
  return [];
}

function saveSessionsToStorage(sessions: TerminalSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error('Failed to save terminal sessions:', error);
  }
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
      & Pick<TerminalSession, 'runtimeProvider' | 'runId'>
  ): string => {
    const id = `terminal-${uuidv4()}`;
    const colors: TerminalColor[] = ['red', 'green', 'blue', 'yellow', 'purple', 'cyan', 'orange', 'pink'];
    const nextColor = colors[terminals.length % colors.length];

    const terminal: TerminalSession = {
      id,
      label: label || `Terminal ${terminals.length + 1}`,
      cwd,
      shell,
      color: nextColor,
      createdAt: Date.now(),
      autoCommand,
      missionPrompt: metadata?.missionPrompt,
      currentCommand: autoCommand || undefined,
      agentId: metadata?.agentId,
      agentName: metadata?.agentName,
      terminalPurpose: metadata?.terminalPurpose,
      runId: metadata?.runId,
      runtimeProvider: metadata?.runtimeProvider,
      runtimeState: metadata?.runtimeProvider && autoCommand ? 'launching' : 'shell',
      runtimeDetail: metadata?.runtimeProvider && autoCommand ? 'Launching runtime process' : 'Interactive shell',
      runtimeAttempts: metadata?.runtimeProvider && autoCommand ? 1 : 0,
      lastStateChangeAt: Date.now(),
      ptyState: 'creating',
      ptyDetail: 'Creating terminal process'
    };

    setTerminals(prev => [...prev, terminal]);
    setActiveTerminalId(id);

    void window.electronAPI.terminal.create(id, cwd, shell, autoCommand)
      .then((result) => {
        if (result?.success === false) {
          setTerminals(prev => prev.map((item) => (
            item.id === id
              ? {
                  ...item,
                  ptyState: 'failed',
                  ptyDetail: result.error || 'Failed to create terminal process',
                  runtimeState: item.runtimeProvider ? 'failed' : item.runtimeState,
                  runtimeDetail: result.error || item.runtimeDetail
                }
              : item
          )));
          return;
        }

        setTerminals(prev => prev.map((item) => (
          item.id === id
            ? {
                ...item,
                ptyState: 'ready',
                ptyDetail: 'Terminal process ready'
              }
            : item
        )));
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to create terminal process';
        setTerminals(prev => prev.map((item) => (
          item.id === id
            ? {
                ...item,
                ptyState: 'failed',
                ptyDetail: message,
                runtimeState: item.runtimeProvider ? 'failed' : item.runtimeState,
                runtimeDetail: message
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
    setTerminals(prev => prev.map(t => (t.id === id ? { ...t, currentCommand: command } : t)));
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
    setTerminals(prev => prev.map(t => (
      t.id === id
        ? {
            ...t,
            lastOutputAt: Date.now()
          }
        : t
    )));
  }, []);

  const retryTerminalRuntime = useCallback((id: string, detail?: string) => {
    setTerminals(prev => prev.map(t => (
      t.id === id
        ? {
            ...t,
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
