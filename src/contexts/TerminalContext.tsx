import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AgentProvider } from '../types/agents';
import type { MissionConsoleEvidenceRef, MissionConsoleMissionKind } from '../types/missionConsole';
import type { MissionReview } from '../types/tasks';
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
export type TerminalRestoreState = 'live' | 'reopenable';

export interface TerminalSession {
  id: string;
  sessionKey?: string;
  label: string;
  cwd: string;
  shell?: string;
  workspaceId?: string;
  assetSymbol?: string;
  strategySessionId?: string;
  strategySessionTitle?: string;
  strategySessionStatus?: 'draft' | 'linked' | 'completed';
  strategySessionReview?: MissionReview;
  restoreState?: TerminalRestoreState;
  restoreReason?: string;
  lastKnownExcerpt?: string;
  pinned?: boolean;
  color: TerminalColor;
  rainbowEffect?: boolean;
  createdAt: number;
  autoCommand?: string;
  pendingInput?: string;
  pendingInputSentAt?: number;
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
export type TerminalMoveDirection = 'up' | 'down';
export type TerminalCreateMetadata =
  Pick<TerminalSession, 'agentId' | 'agentName' | 'terminalPurpose' | 'missionPrompt'>
  & Pick<TerminalSession, 'workspaceId' | 'missionTitle' | 'missionKind' | 'handoffSummary' | 'evidenceRefs'>
  & Pick<TerminalSession, 'assetSymbol' | 'strategySessionId' | 'strategySessionTitle' | 'strategySessionStatus' | 'strategySessionReview'>
  & Pick<TerminalSession, 'runtimeProvider' | 'runId' | 'pendingInput'>
  & Pick<TerminalSession, 'sessionKey' | 'restoreState' | 'restoreReason' | 'lastKnownExcerpt' | 'pinned'>;

interface TerminalContextValue {
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  createTerminal: (
    cwd: string,
    shell?: string,
    label?: string,
    autoCommand?: string,
    metadata?: TerminalCreateMetadata
  ) => string;
  relaunchTerminal: (sessionKey: string) => string | null;
  closeTerminal: (id: string) => void;
  closeAllTerminals: (predicate?: (terminal: TerminalSession) => boolean) => void;
  writeToTerminal: (id: string, data: string) => void;
  setActiveTerminal: (id: string) => void;
  updateTerminalCwd: (id: string, cwd: string) => void;
  updateTerminalLabel: (id: string, label: string) => void;
  updateTerminalColor: (id: string, color: TerminalColor) => void;
  updateTerminalCommand: (id: string, command: string) => void;
  updateTerminalRuntimeState: (id: string, state: TerminalRuntimeState, detail?: string) => void;
  updateTerminalPtyState: (id: string, state: TerminalPtyState, detail?: string) => void;
  moveTerminal: (id: string, direction: TerminalMoveDirection) => void;
  toggleTerminalPinned: (id: string) => void;
  updateStrategySessionReview: (strategySessionId: string, review: MissionReview) => void;
  getWorkspaceTerminals: (workspaceId?: string | null, workspacePath?: string | null) => TerminalSession[];
  touchTerminalActivity: (id: string) => void;
  retryTerminalRuntime: (id: string, detail?: string) => void;
  toggleRainbowEffect: (id: string) => void;
  onLayoutUpdateNeeded: (callback: LayoutUpdateCallback | null) => void;
}

const TerminalContext = createContext<TerminalContextValue | undefined>(undefined);

const STORAGE_KEY = 'hedge-station:terminal-sessions';
const STALE_RUNTIME_LAUNCH_MS = 45_000;
const TERMINAL_ACTIVITY_UPDATE_MS = 5_000;
const REOPENABLE_REASON = 'App restarted; terminal process is no longer running.';
const TERMINAL_API_UNAVAILABLE_REASON = 'Terminal IPC is unavailable in this browser preview.';

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
    && /launching (codex\.cmd|claude\.exe|gemini\.cmd|opencode\.cmd)/i.test(session.runtimeDetail);

  return {
    ...session,
    sessionKey: typeof session.sessionKey === 'string' && session.sessionKey.trim()
      ? session.sessionKey
      : session.id,
    shell: shellResolution.shell,
    autoCommand: normalizedAutoCommand,
    currentCommand: normalizedCurrentCommand,
    strategySessionReview: session.strategySessionReview,
    restoreState: session.restoreState === 'reopenable' ? 'reopenable' : 'live',
    restoreReason: typeof session.restoreReason === 'string' ? session.restoreReason : undefined,
    lastKnownExcerpt: typeof session.lastKnownExcerpt === 'string' ? session.lastKnownExcerpt : undefined,
    pinned: typeof session.pinned === 'boolean' ? session.pinned : false,
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

function terminalSessionKey(session: TerminalSession): string {
  return session.sessionKey || session.id;
}

function markSessionReopenable(session: TerminalSession, reason = REOPENABLE_REASON): TerminalSession {
  return {
    ...session,
    restoreState: 'reopenable',
    restoreReason: reason,
    ptyState: 'failed',
    ptyDetail: reason,
    runtimeState: session.runtimeProvider
      ? session.runtimeState === 'completed'
        ? 'completed'
        : 'stalled'
      : session.runtimeState || 'shell',
    runtimeDetail: reason,
    lastStateChangeAt: Date.now()
  };
}

function normalizeOutputExcerpt(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\r/g, '')
    .trim()
    .slice(-1200);

  return normalized || undefined;
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
  const monitorActivityRef = React.useRef<Record<string, number>>({});
  const pendingInputTimersRef = React.useRef<Record<string, number>>({});

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
        const terminalApi = window.electronAPI?.terminal;
        if (!terminalApi?.getAllIds) {
          setTerminals((current) => current.map((terminal) => markSessionReopenable(terminal, TERMINAL_API_UNAVAILABLE_REASON)));
          setActiveTerminalId(null);
          return;
        }

        const activeIds = new Set(await terminalApi.getAllIds());
        const restoredTerminals = terminals.map((terminal) => (
          activeIds.has(terminal.id)
            ? {
                ...terminal,
                restoreState: 'live' as const,
                restoreReason: undefined,
                ptyState: terminal.ptyState === 'failed' ? 'ready' as const : terminal.ptyState
              }
            : markSessionReopenable(terminal)
        ));

        if (restoredTerminals.some((terminal, index) => (
          terminal.restoreState !== terminals[index]?.restoreState
          || terminal.ptyState !== terminals[index]?.ptyState
          || terminal.restoreReason !== terminals[index]?.restoreReason
        ))) {
          setTerminals(restoredTerminals);
        }

        setActiveTerminalId((current) => {
          if (current && restoredTerminals.some(t => t.id === current && t.restoreState !== 'reopenable')) {
            return current;
          }
          return restoredTerminals.find((terminal) => terminal.restoreState !== 'reopenable')?.id ?? null;
        });
      } catch (error) {
        console.error('Failed to restore terminal sessions:', error);
        setTerminals((current) => current.map((terminal) => markSessionReopenable(terminal)));
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
    metadata?: TerminalCreateMetadata
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
      sessionKey: metadata?.sessionKey || id,
      label: label || `Terminal ${terminals.length + 1}`,
      cwd,
      shell: resolvedShell,
      workspaceId: metadata?.workspaceId,
      assetSymbol: metadata?.assetSymbol,
      strategySessionId: metadata?.strategySessionId,
      strategySessionTitle: metadata?.strategySessionTitle,
      strategySessionStatus: metadata?.strategySessionStatus,
      strategySessionReview: metadata?.strategySessionReview,
      restoreState: metadata?.restoreState || 'live',
      restoreReason: metadata?.restoreReason,
      lastKnownExcerpt: metadata?.lastKnownExcerpt,
      pinned: metadata?.pinned || false,
      color: nextColor,
      createdAt: now,
      autoCommand: resolvedAutoCommand,
      pendingInput: metadata?.pendingInput,
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

    const terminalApi = window.electronAPI?.terminal;
    if (!terminalApi?.create) {
      setTerminals(prev => prev.map((item) => (
        item.id === id
          ? {
              ...item,
              ptyState: 'failed',
              ptyDetail: TERMINAL_API_UNAVAILABLE_REASON,
              runtimeState: item.runtimeProvider ? 'failed' : item.runtimeState,
              runtimeDetail: TERMINAL_API_UNAVAILABLE_REASON,
              lastStateChangeAt: Date.now()
            }
          : item
      )));

      if (layoutUpdateCallbackRef.current) {
        setTimeout(() => layoutUpdateCallbackRef.current?.(id), 0);
      }

      return id;
    }

    void terminalApi.create(id, cwd, resolvedShell, resolvedAutoCommand)
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

  const relaunchTerminal = useCallback((sessionKey: string): string | null => {
    const source = terminals.find((terminal) => (
      terminalSessionKey(terminal) === sessionKey || terminal.id === sessionKey
    ));

    if (!source) {
      return null;
    }

    if (source.restoreState !== 'reopenable') {
      setActiveTerminalId(source.id);
      return source.id;
    }

    const nextId = createTerminal(
      source.cwd,
      source.shell,
      source.label,
      source.currentCommand || source.autoCommand,
      {
        sessionKey: terminalSessionKey(source),
        workspaceId: source.workspaceId,
        assetSymbol: source.assetSymbol,
        strategySessionId: source.strategySessionId,
        strategySessionTitle: source.strategySessionTitle,
        strategySessionStatus: source.strategySessionStatus,
        strategySessionReview: source.strategySessionReview,
        agentId: source.agentId,
        agentName: source.agentName,
        terminalPurpose: source.terminalPurpose,
        missionPrompt: source.missionPrompt,
        missionTitle: source.missionTitle,
        missionKind: source.missionKind,
        handoffSummary: source.handoffSummary,
        evidenceRefs: source.evidenceRefs,
        runtimeProvider: source.runtimeProvider,
        runId: source.runId,
        pinned: source.pinned,
        lastKnownExcerpt: source.lastKnownExcerpt
      }
    );

    setTerminals((prev) => prev.filter((terminal) => terminal.id !== source.id));
    return nextId;
  }, [createTerminal, terminals]);

  const closeTerminal = useCallback((id: string) => {
    const target = terminals.find((terminal) => terminal.id === id);
    const terminalApi = window.electronAPI?.terminal;
    if (target?.restoreState !== 'reopenable' && terminalApi?.kill) {
      terminalApi.kill(id);
    }

    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== id);

      if (activeTerminalId === id && filtered.some((terminal) => terminal.restoreState !== 'reopenable')) {
        const liveTerminals = filtered.filter((terminal) => terminal.restoreState !== 'reopenable');
        setActiveTerminalId(liveTerminals[liveTerminals.length - 1]?.id ?? null);
      } else if (filtered.length === 0) {
        setActiveTerminalId(null);
      }

      return filtered;
    });
  }, [activeTerminalId, terminals]);

  const closeAllTerminals = useCallback((predicate?: (terminal: TerminalSession) => boolean) => {
    setTerminals((prev) => {
      const targets = predicate ? prev.filter(predicate) : prev;

      targets.forEach((terminal) => {
        const terminalApi = window.electronAPI?.terminal;
        if (terminal.restoreState !== 'reopenable' && terminalApi?.kill) {
          terminalApi.kill(terminal.id);
        }
      });

      const targetIds = new Set(targets.map((terminal) => terminal.id));
      const filtered = prev.filter((terminal) => !targetIds.has(terminal.id));

      setActiveTerminalId((current) => {
        if (current && filtered.some((terminal) => terminal.id === current && terminal.restoreState !== 'reopenable')) {
          return current;
        }
        const liveTerminals = filtered.filter((terminal) => terminal.restoreState !== 'reopenable');
        return liveTerminals[liveTerminals.length - 1]?.id ?? null;
      });

      return filtered;
    });
  }, []);

  const writeToTerminal = useCallback((id: string, data: string) => {
    if (!id || !data) {
      return;
    }

    if (terminals.find((terminal) => terminal.id === id)?.restoreState === 'reopenable') {
      return;
    }

    window.electronAPI?.terminal?.write?.(id, data);
  }, [terminals]);

  const setActiveTerminal = useCallback((id: string) => {
    setActiveTerminalId(current => {
      if (current === id) {
        return current;
      }

      return terminals.some(t => t.id === id && t.restoreState !== 'reopenable') ? id : current;
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

  const moveTerminal = useCallback((id: string, direction: TerminalMoveDirection) => {
    setTerminals((prev) => {
      const index = prev.findIndex((terminal) => terminal.id === id);
      if (index < 0) {
        return prev;
      }

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }

      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  }, []);

  const toggleTerminalPinned = useCallback((id: string) => {
    setTerminals(prev => prev.map(t => (
      t.id === id ? { ...t, pinned: !t.pinned } : t
    )));
  }, []);

  const updateStrategySessionReview = useCallback((strategySessionId: string, review: MissionReview) => {
    const sessionId = strategySessionId.trim();
    if (!sessionId) {
      return;
    }

    setTerminals(prev => prev.map((terminal) => (
      terminal.strategySessionId === sessionId && !terminal.runId
        ? {
            ...terminal,
            strategySessionReview: review,
            lastStateChangeAt: Date.now()
          }
        : terminal
    )));
  }, []);

  const getWorkspaceTerminals = useCallback((workspaceId?: string | null, workspacePath?: string | null) => (
    terminals.filter((terminal) => (
      terminal.workspaceId === workspaceId
      || (!terminal.workspaceId && Boolean(workspacePath) && terminal.cwd === workspacePath)
    ))
  ), [terminals]);

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

  const terminalMonitorKey = useMemo(
    () => terminals
      .filter((terminal) => terminal.restoreState !== 'reopenable')
      .map((terminal) => terminal.id)
      .sort()
      .join('|'),
    [terminals]
  );

  useEffect(() => {
    return () => {
      Object.values(pendingInputTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      pendingInputTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const activeTerminalIds = new Set(
      terminals
        .filter((terminal) => terminal.restoreState !== 'reopenable')
        .map((terminal) => terminal.id)
    );

    Object.keys(pendingInputTimersRef.current).forEach((terminalId) => {
      const terminal = terminals.find((item) => item.id === terminalId);
      if (
        !terminal
        || !terminal.pendingInput
        || terminal.pendingInputSentAt
        || terminal.ptyState === 'failed'
        || terminal.restoreState === 'reopenable'
      ) {
        window.clearTimeout(pendingInputTimersRef.current[terminalId]);
        delete pendingInputTimersRef.current[terminalId];
      }
    });

    terminals.forEach((terminal) => {
      if (
        !terminal.pendingInput
        || terminal.pendingInputSentAt
        || terminal.ptyState === 'failed'
        || terminal.restoreState === 'reopenable'
        || pendingInputTimersRef.current[terminal.id]
      ) {
        return;
      }

      const ageMs = Date.now() - terminal.createdAt;
      const delayMs = terminal.runtimeProvider && terminal.autoCommand
        ? Math.max(0, 2400 - ageMs)
        : 180;

      pendingInputTimersRef.current[terminal.id] = window.setTimeout(() => {
        const pendingInput = terminal.pendingInput;
        delete pendingInputTimersRef.current[terminal.id];
        if (!pendingInput || !activeTerminalIds.has(terminal.id)) {
          return;
        }

        window.electronAPI?.terminal?.write?.(terminal.id, pendingInput);
        const now = Date.now();
        setTerminals((prev) => prev.map((item) => (
          item.id === terminal.id
            ? {
                ...item,
                pendingInput: undefined,
                pendingInputSentAt: now,
                runtimeState: item.runtimeProvider ? 'waiting-response' : item.runtimeState,
                runtimeDetail: item.runtimeProvider ? 'Sent operator message' : item.runtimeDetail,
                lastStateChangeAt: now
              }
            : item
        )));
      }, delayMs);
    });
  }, [terminals]);

  useEffect(() => {
    const terminalApi = window.electronAPI?.terminal;
    if (!terminalApi?.onData || !terminalApi?.onExit) {
      return;
    }

    const cleanups = terminals
      .filter((terminal) => terminal.restoreState !== 'reopenable')
      .map((terminal) => {
      const onDataCleanup = terminalApi.onData(terminal.id, (payload?: { data?: string }) => {
        const now = Date.now();
        const lastTouch = monitorActivityRef.current[terminal.id] || 0;
        const shouldTouch = now - lastTouch >= TERMINAL_ACTIVITY_UPDATE_MS;
        const nextExcerpt = normalizeOutputExcerpt(payload?.data);

        setTerminals((prev) => prev.map((item) => {
          if (item.id !== terminal.id) {
            return item;
          }

          const shouldMarkHandoff = Boolean(item.runtimeProvider && item.runtimeState === 'launching');
          if (!shouldTouch && !shouldMarkHandoff) {
            return item;
          }

          monitorActivityRef.current[terminal.id] = now;
          return {
            ...item,
            lastOutputAt: shouldTouch ? now : item.lastOutputAt,
            lastKnownExcerpt: nextExcerpt || item.lastKnownExcerpt,
            runtimeState: shouldMarkHandoff ? 'handoff' : item.runtimeState,
            runtimeDetail: shouldMarkHandoff ? 'Runtime output detected' : item.runtimeDetail,
            lastStateChangeAt: shouldMarkHandoff ? now : item.lastStateChangeAt
          };
        }));
      });

      const onExitCleanup = terminalApi.onExit(terminal.id, ({ exitCode }) => {
        const now = Date.now();
        setTerminals((prev) => prev.map((item) => (
          item.id === terminal.id
            ? {
                ...item,
                runtimeState: item.runtimeProvider ? (exitCode === 0 ? 'completed' : 'failed') : item.runtimeState,
                runtimeDetail: item.runtimeProvider
                  ? (exitCode === 0 ? 'Process exited successfully' : `Process exited with code ${exitCode}`)
                  : item.runtimeDetail,
                lastOutputAt: item.lastOutputAt || now,
                lastStateChangeAt: now
              }
            : item
        )));
      });

      return () => {
        onDataCleanup();
        onExitCleanup();
      };
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [terminalMonitorKey]);

  const value = useMemo<TerminalContextValue>(() => ({
    terminals,
    activeTerminalId,
    createTerminal,
    relaunchTerminal,
    closeTerminal,
    closeAllTerminals,
    writeToTerminal,
    setActiveTerminal,
    updateTerminalCwd,
    updateTerminalLabel,
    updateTerminalColor,
    updateTerminalCommand,
    updateTerminalRuntimeState,
    updateTerminalPtyState,
    moveTerminal,
    toggleTerminalPinned,
    updateStrategySessionReview,
    getWorkspaceTerminals,
    touchTerminalActivity,
    retryTerminalRuntime,
    toggleRainbowEffect,
    onLayoutUpdateNeeded
  }), [
    terminals,
    activeTerminalId,
    createTerminal,
    relaunchTerminal,
    closeTerminal,
    closeAllTerminals,
    writeToTerminal,
    setActiveTerminal,
    updateTerminalCwd,
    updateTerminalLabel,
    updateTerminalColor,
    updateTerminalCommand,
    updateTerminalRuntimeState,
    updateTerminalPtyState,
    moveTerminal,
    toggleTerminalPinned,
    updateStrategySessionReview,
    getWorkspaceTerminals,
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
