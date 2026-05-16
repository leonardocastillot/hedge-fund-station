import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Pin, PinOff, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { TerminalPane } from './TerminalPane';
import { useTerminalContext } from '../../contexts/TerminalContext';
import { useCommanderTasksContext } from '../../contexts/CommanderTasksContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { useDeskSpaceContext, type TerminalLayoutMode, type TerminalSortMode } from '../../features/desks/DeskSpaceContext';
import { loadAppSettings } from '../../utils/appSettings';
import { getProviderMeta, resolveAgentRuntimeCommand } from '../../utils/agentRuntime';
import { resolveTerminalShell } from '../../utils/terminalShell';
import type { TaskStatus } from '../../types/tasks';
import type { TerminalSession } from '../../contexts/TerminalContext';
import type { AgentProvider } from '../../types/agents';

const MAX_TERMINALS = 12;
const TERMINAL_SORT_OPTIONS: Array<{ value: TerminalSortMode; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'status', label: 'Status' },
  { value: 'provider', label: 'Provider' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'recent', label: 'Recent' }
];
const TERMINAL_LAYOUT_OPTIONS: Array<{ value: TerminalLayoutMode; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
  { value: 'focus', label: 'Focus' }
];
type QuickTerminalType = 'shell' | 'codex' | 'opencode' | 'claude' | 'gemini' | 'dev' | 'git' | 'python';
type AgentLauncherItem = {
  type: QuickTerminalType;
  label: string;
  provider?: AgentProvider;
  purpose: string;
  commandLabel: string;
};
export type TerminalDeskFilter = 'all' | 'command-hub' | 'active';

interface TerminalGridProps {
  defaultDeskFilter?: TerminalDeskFilter;
  embedded?: boolean;
  compact?: boolean;
}

function buildAgentLauncherItems(shell?: string): AgentLauncherItem[] {
  return [
    {
      type: 'codex',
      label: 'Codex',
      provider: 'codex',
      purpose: 'Primary code agent',
      commandLabel: resolveAgentRuntimeCommand('codex', shell)
    },
    {
      type: 'opencode',
      label: 'OpenCode',
      provider: 'opencode',
      purpose: 'DeepSeek strategy agent',
      commandLabel: resolveAgentRuntimeCommand('opencode', shell)
    },
    {
      type: 'claude',
      label: 'Claude',
      provider: 'claude',
      purpose: 'Reasoning and review',
      commandLabel: resolveAgentRuntimeCommand('claude', shell)
    },
    {
      type: 'gemini',
      label: 'Gemini',
      provider: 'gemini',
      purpose: 'Second opinion agent',
      commandLabel: resolveAgentRuntimeCommand('gemini', shell)
    },
    {
      type: 'shell',
      label: 'Shell',
      purpose: 'Workspace terminal',
      commandLabel: shell || 'system shell'
    },
    {
      type: 'dev',
      label: 'Dev',
      purpose: 'Local app process',
      commandLabel: 'npm run dev'
    }
  ];
}

function buildTerminalStrategySessionMetadata(workspace?: { asset_symbol?: string; strategy_symbol?: string; name?: string } | null) {
  const assetSymbol = (workspace?.asset_symbol || workspace?.strategy_symbol || '').toUpperCase();
  if (!assetSymbol) {
    return {};
  }
  return {
    assetSymbol,
    strategySessionId: `strategy-session-${assetSymbol.toLowerCase()}-${Date.now()}`,
    strategySessionTitle: `${assetSymbol} draft strategy session`,
    strategySessionStatus: 'draft' as const
  };
}

function getLauncherStatus(item: AgentLauncherItem, terminals: TerminalSession[], limitReached: boolean): string {
  if (limitReached) {
    return 'limit reached';
  }

  const matching = terminals.filter((terminal) => {
    if (item.provider) {
      return terminal.runtimeProvider === item.provider;
    }

    if (item.type === 'dev') {
      return terminal.autoCommand === 'npm run dev' || terminal.terminalPurpose === 'dev-server';
    }

    if (item.type === 'shell') {
      return !terminal.runtimeProvider && !terminal.autoCommand;
    }

    return false;
  });

  if (matching.length === 0) {
    return 'ready';
  }

  const attentionCount = matching.filter((terminal) => (
    terminal.runtimeState === 'failed'
    || terminal.ptyState === 'failed'
  )).length;
  if (attentionCount > 0) {
    return `${attentionCount} attention`;
  }

  const activeCount = matching.filter((terminal) => (
    terminal.runtimeState === 'running'
    || terminal.runtimeState === 'waiting-response'
    || terminal.runtimeState === 'handoff'
    || terminal.runtimeState === 'launching'
    || terminal.runtimeState === 'stalled'
    || terminal.ptyState === 'creating'
  )).length;

  if (activeCount > 0) {
    return `${activeCount} active`;
  }

  return `${matching.length} open`;
}

function terminalKey(terminal: TerminalSession): string {
  return terminal.sessionKey || terminal.id;
}

function terminalUpdatedAt(terminal: TerminalSession): number {
  return terminal.lastOutputAt || terminal.lastStateChangeAt || terminal.createdAt || 0;
}

function terminalStatusRank(terminal: TerminalSession): number {
  if (terminal.restoreState === 'reopenable') return 5;
  if (terminal.runtimeState === 'failed' || terminal.ptyState === 'failed') return 0;
  if (terminal.runtimeState === 'awaiting-approval') return 1;
  if (
    terminal.runtimeState === 'running'
    || terminal.runtimeState === 'waiting-response'
    || terminal.runtimeState === 'handoff'
    || terminal.runtimeState === 'launching'
    || terminal.runtimeState === 'stalled'
    || terminal.ptyState === 'creating'
  ) {
    return 2;
  }
  if (terminal.runtimeState === 'ready') return 3;
  if (terminal.runtimeState === 'completed') return 6;
  return 4;
}

function terminalProviderLabel(terminal: TerminalSession): string {
  if (terminal.runtimeProvider) return terminal.runtimeProvider;
  if (terminal.terminalPurpose === 'dev-server' || terminal.autoCommand === 'npm run dev') return 'dev';
  return 'shell';
}

function terminalStrategyLabel(terminal: TerminalSession): string {
  return [
    terminal.assetSymbol,
    terminal.strategySessionTitle,
    terminal.strategySessionId,
    terminal.label
  ].filter(Boolean).join(' / ');
}

function orderIndex(order: string[], key: string): number {
  const index = order.indexOf(key);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sortWorkspaceTerminals(
  terminals: TerminalSession[],
  mode: TerminalSortMode,
  order: string[],
  pinnedKeys: string[]
): TerminalSession[] {
  const pinned = new Set(pinnedKeys);
  return [...terminals].sort((a, b) => {
    const aPinned = a.pinned || pinned.has(terminalKey(a));
    const bPinned = b.pinned || pinned.has(terminalKey(b));
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    if (mode === 'status') {
      return terminalStatusRank(a) - terminalStatusRank(b)
        || terminalUpdatedAt(b) - terminalUpdatedAt(a)
        || orderIndex(order, terminalKey(a)) - orderIndex(order, terminalKey(b));
    }

    if (mode === 'provider') {
      return terminalProviderLabel(a).localeCompare(terminalProviderLabel(b))
        || terminalUpdatedAt(b) - terminalUpdatedAt(a)
        || orderIndex(order, terminalKey(a)) - orderIndex(order, terminalKey(b));
    }

    if (mode === 'strategy') {
      return terminalStrategyLabel(a).localeCompare(terminalStrategyLabel(b))
        || terminalUpdatedAt(b) - terminalUpdatedAt(a)
        || orderIndex(order, terminalKey(a)) - orderIndex(order, terminalKey(b));
    }

    if (mode === 'recent') {
      return terminalUpdatedAt(b) - terminalUpdatedAt(a)
        || orderIndex(order, terminalKey(a)) - orderIndex(order, terminalKey(b));
    }

    return orderIndex(order, terminalKey(a)) - orderIndex(order, terminalKey(b))
      || a.createdAt - b.createdAt;
  });
}

export const TerminalGrid: React.FC<TerminalGridProps> = ({ defaultDeskFilter = 'all', embedded = false, compact = false }) => {
  const navigate = useNavigate();
  const {
    terminals,
    activeTerminalId,
    createTerminal,
    relaunchTerminal,
    closeTerminal,
    setActiveTerminal,
    updateTerminalCwd,
    updateTerminalLabel,
    updateTerminalColor,
    updateTerminalRuntimeState,
    moveTerminal,
    toggleTerminalPinned,
    touchTerminalActivity,
    retryTerminalRuntime,
    stopTerminalSession,
    toggleRainbowEffect,
    onLayoutUpdateNeeded
  } = useTerminalContext();
  const { runs, tasks, updateRun, updateTaskStatus } = useCommanderTasksContext();
  const { activeWorkspace, workspaces } = useWorkspaceContext();
  const { getDeskState, setDeskState } = useDeskSpaceContext();
  const [deskFilter, setDeskFilter] = React.useState<TerminalDeskFilter>(defaultDeskFilter);
  const [handoffNotice, setHandoffNotice] = React.useState<string | null>(null);
  const minimalCodeChrome = embedded && compact;
  const deskState = React.useMemo(() => getDeskState(activeWorkspace?.id), [activeWorkspace?.id, getDeskState]);
  const layoutMode = deskState.terminalLayout;
  const terminalLimitReached = terminals.length >= MAX_TERMINALS;
  const settings = React.useMemo(() => loadAppSettings(), []);
  const activeShell = React.useMemo(
    () => resolveTerminalShell(activeWorkspace?.shell, settings.defaultShell).shell,
    [activeWorkspace?.shell, settings.defaultShell]
  );
  const agentLaunches = React.useMemo(() => buildAgentLauncherItems(activeShell), [activeShell]);
  const handleOpenDiagnostics = React.useCallback(() => {
    navigate('/diagnostics');
  }, [navigate]);
  const commandHubWorkspace = React.useMemo(
    () => workspaces.find((workspace) => workspace.kind === 'command-hub') || null,
    [workspaces]
  );
  const workspaceVisibleTerminals = React.useMemo(() => {
    if (deskFilter === 'command-hub') {
      return terminals.filter((terminal) => (
        terminal.workspaceId === commandHubWorkspace?.id
        || (!terminal.workspaceId && commandHubWorkspace?.path && terminal.cwd === commandHubWorkspace.path)
      ));
    }

    if (deskFilter === 'active') {
      return terminals.filter((terminal) => (
        terminal.workspaceId === activeWorkspace?.id
        || (!terminal.workspaceId && activeWorkspace?.path && terminal.cwd === activeWorkspace.path)
      ));
    }

    return terminals;
  }, [activeWorkspace?.id, activeWorkspace?.path, commandHubWorkspace?.id, commandHubWorkspace?.path, deskFilter, terminals]);
  const workspaceTerminalKeys = React.useMemo(
    () => workspaceVisibleTerminals.map((terminal) => terminalKey(terminal)),
    [workspaceVisibleTerminals]
  );

  React.useEffect(() => {
    if (!activeWorkspace?.id || deskFilter !== 'active') {
      return;
    }

    const currentOrder = deskState.terminalOrder;
    const nextOrder = [
      ...currentOrder.filter((key) => workspaceTerminalKeys.includes(key)),
      ...workspaceTerminalKeys.filter((key) => !currentOrder.includes(key))
    ];
    const nextPinned = deskState.pinnedTerminalKeys.filter((key) => workspaceTerminalKeys.includes(key));

    if (
      nextOrder.length !== currentOrder.length
      || nextOrder.some((key, index) => key !== currentOrder[index])
      || nextPinned.length !== deskState.pinnedTerminalKeys.length
    ) {
      setDeskState(activeWorkspace.id, {
        terminalOrder: nextOrder,
        pinnedTerminalKeys: nextPinned
      });
    }
  }, [
    activeWorkspace?.id,
    deskFilter,
    deskState.pinnedTerminalKeys,
    deskState.terminalOrder,
    setDeskState,
    workspaceTerminalKeys
  ]);

  React.useEffect(() => {
    if (!activeWorkspace?.id || !activeTerminalId) {
      return;
    }

    const activeTerminal = workspaceVisibleTerminals.find((terminal) => terminal.id === activeTerminalId);
    if (!activeTerminal) {
      return;
    }

    const key = terminalKey(activeTerminal);
    if (deskState.activeTerminalKey !== key) {
      setDeskState(activeWorkspace.id, { activeTerminalKey: key });
    }
  }, [activeTerminalId, activeWorkspace?.id, deskState.activeTerminalKey, setDeskState, workspaceVisibleTerminals]);

  const visibleTerminals = React.useMemo(
    () => sortWorkspaceTerminals(
      workspaceVisibleTerminals,
      deskState.terminalSortMode,
      deskState.terminalOrder,
      deskState.pinnedTerminalKeys
    ),
    [deskState.pinnedTerminalKeys, deskState.terminalOrder, deskState.terminalSortMode, workspaceVisibleTerminals]
  );
  const missionTerminals = React.useMemo(
    () => visibleTerminals.filter((terminal) => Boolean(terminal.missionTitle || terminal.terminalPurpose === 'mission-console')),
    [visibleTerminals]
  );

  React.useEffect(() => {
    runs.forEach((run) => {
      const runtimeTerminal = terminals.find((terminal) => run.terminalIds.includes(terminal.id));
      if (!runtimeTerminal) {
        return;
      }

      const nextRunState = deriveRunState(run.status, runtimeTerminal);
      if (!nextRunState) {
        return;
      }

      const updates = {
        ...nextRunState,
        endedAt: nextRunState.status === 'completed' || nextRunState.status === 'failed'
          ? (run.endedAt ?? Date.now())
          : undefined
      };

      if (
        run.status !== updates.status
        || run.launchState !== updates.launchState
        || run.summary !== updates.summary
        || run.endedAt !== updates.endedAt
      ) {
        updateRun(run.id, updates);
      }
    });
  }, [runs, terminals, updateRun]);

  React.useEffect(() => {
    let cancelled = false;

    const normalizeOutputExcerpt = (buffer?: string | null) => {
      if (!buffer) {
        return '';
      }

      return buffer
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\u001b\][^\u0007]*\u0007/g, '')
        .replace(/\r/g, '')
        .trim()
        .slice(-3000);
    };

    const syncSnapshots = async () => {
      const candidateRuns = runs.filter((run) => run.terminalIds.length > 0);

      for (const run of candidateRuns) {
        const terminalId = run.terminalIds[0];
        const getSnapshot = window.electronAPI?.terminal?.getSnapshot;
        if (!terminalId || typeof getSnapshot !== 'function') {
          continue;
        }

        try {
          // eslint-disable-next-line no-await-in-loop
          const snapshot = await getSnapshot(terminalId);
          if (cancelled || !snapshot) {
            continue;
          }

          const nextExcerpt = normalizeOutputExcerpt(snapshot.buffer);
          if (nextExcerpt && nextExcerpt !== run.outputExcerpt) {
            updateRun(run.id, {
              outputExcerpt: nextExcerpt,
              outputCapturedAt: Date.now()
            });
          }
        } catch {
          // Ignore snapshot failures; runtime state already covers hard failures.
        }
      }
    };

    void syncSnapshots();
    const interval = window.setInterval(() => {
      void syncSnapshots();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runs, updateRun]);

  React.useEffect(() => {
    let cancelled = false;

    const normalizeOutputExcerpt = (buffer?: string | null) => {
      if (!buffer) {
        return '';
      }

      return buffer
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\u001b\][^\u0007]*\u0007/g, '')
        .replace(/\r/g, '')
        .trim()
        .slice(-3000);
    };

    const syncMissionSnapshots = async () => {
      for (const terminal of terminals) {
        const getSnapshot = window.electronAPI?.terminal?.getSnapshot;
        if (
          !terminal.runId
          || !terminal.missionTitle
          || typeof getSnapshot !== 'function'
          || typeof window.electronAPI?.missionConsole?.appendSnapshot !== 'function'
        ) {
          continue;
        }

        try {
          // eslint-disable-next-line no-await-in-loop
          const snapshot = await getSnapshot(terminal.id);
          if (cancelled || !snapshot) {
            continue;
          }

          // eslint-disable-next-line no-await-in-loop
          await window.electronAPI.missionConsole.appendSnapshot({
            runId: terminal.runId,
            terminalId: terminal.id,
            status: terminal.runtimeState || (terminal.ptyState === 'failed' ? 'failed' : 'launching'),
            outputExcerpt: normalizeOutputExcerpt(snapshot.buffer),
            handoffSummary: terminal.handoffSummary || terminal.runtimeDetail,
            evidenceRefs: terminal.evidenceRefs
          });
        } catch {
          // Mission Console snapshots are opportunistic; terminal state remains visible even if persistence fails.
        }
      }
    };

    void syncMissionSnapshots();
    const interval = window.setInterval(() => {
      void syncMissionSnapshots();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [terminals]);

  React.useEffect(() => {
    tasks.forEach((task) => {
      const taskRuns = runs.filter((run) => run.taskId === task.id);
      if (taskRuns.length === 0) {
        return;
      }

      const nextStatus = deriveTaskStatus(task, taskRuns);
      if (task.status !== nextStatus) {
        updateTaskStatus(task.id, nextStatus);
      }
    });
  }, [runs, tasks, updateTaskStatus]);

  React.useEffect(() => {
    const handleExternalTerminalCreate = (_terminalId: string) => {};

    onLayoutUpdateNeeded(handleExternalTerminalCreate);
    return () => onLayoutUpdateNeeded(null);
  }, [onLayoutUpdateNeeded]);

  const handleNewTerminal = (type: QuickTerminalType = 'shell') => {
    if (terminalLimitReached) {
      alert(`Maximum ${MAX_TERMINALS} terminals reached. Close one before opening another.`);
      return;
    }

    const defaultCwd = activeWorkspace?.path || '/Users/optimus/Documents/New project 9';
    const shell = activeShell;

    let label = 'Terminal';
    let autoCommand: string | undefined;
    let runtimeProvider: AgentProvider | undefined;
    let terminalPurpose = 'workspace-shell';

    switch (type) {
      case 'codex':
        label = 'Codex';
        runtimeProvider = 'codex';
        autoCommand = resolveAgentRuntimeCommand('codex', shell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'opencode':
        label = 'OpenCode';
        runtimeProvider = 'opencode';
        autoCommand = resolveAgentRuntimeCommand('opencode', shell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'claude':
        label = 'Claude';
        runtimeProvider = 'claude';
        autoCommand = resolveAgentRuntimeCommand('claude', shell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'gemini':
        label = 'Gemini';
        runtimeProvider = 'gemini';
        autoCommand = resolveAgentRuntimeCommand('gemini', shell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'dev':
        label = 'NPM Dev';
        autoCommand = 'npm run dev';
        terminalPurpose = 'dev-server';
        break;
      case 'git':
        label = 'Git';
        autoCommand = 'git status';
        break;
      case 'python':
        label = 'Python';
        autoCommand = 'python';
        break;
      case 'shell':
      default:
        label = 'Shell';
        autoCommand = undefined;
        break;
    }

    createTerminal(
      defaultCwd,
      shell,
      label,
      autoCommand,
      {
        workspaceId: activeWorkspace?.id,
        ...buildTerminalStrategySessionMetadata(activeWorkspace),
        terminalPurpose,
        persistenceMode: terminalPurpose === 'dev-server' ? 'ephemeral' : 'screen',
        ...(runtimeProvider ? { runtimeProvider, agentName: `${label} Agent` } : {})
      }
    );
  };

  const handleCloseTerminal = (terminalId: string) => {
    closeTerminal(terminalId);
  };

  const handleStopTerminalSession = React.useCallback((terminalId: string) => {
    void stopTerminalSession(terminalId);
  }, [stopTerminalSession]);

  const handleSortModeChange = React.useCallback((mode: TerminalSortMode) => {
    if (!activeWorkspace?.id) {
      return;
    }
    setDeskState(activeWorkspace.id, { terminalSortMode: mode });
  }, [activeWorkspace?.id, setDeskState]);

  const handleLayoutModeChange = React.useCallback((mode: TerminalLayoutMode) => {
    if (!activeWorkspace?.id) {
      return;
    }
    setDeskState(activeWorkspace.id, { terminalLayout: mode });
  }, [activeWorkspace?.id, setDeskState]);

  const handleMoveTerminal = React.useCallback((terminal: TerminalSession, direction: 'up' | 'down') => {
    if (!activeWorkspace?.id) {
      return;
    }

    const orderedKeys = visibleTerminals.map((item) => terminalKey(item));
    const key = terminalKey(terminal);
    const index = orderedKeys.indexOf(key);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= orderedKeys.length) {
      return;
    }

    const nextOrder = [...orderedKeys];
    const [item] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, item);
    setDeskState(activeWorkspace.id, {
      terminalSortMode: 'manual',
      terminalOrder: nextOrder
    });
    moveTerminal(terminal.id, direction);
  }, [activeWorkspace?.id, moveTerminal, setDeskState, visibleTerminals]);

  const handleTogglePin = React.useCallback((terminal: TerminalSession) => {
    if (!activeWorkspace?.id) {
      return;
    }

    const key = terminalKey(terminal);
    const pinned = new Set(deskState.pinnedTerminalKeys);
    const nextPinned = !(pinned.has(key) || terminal.pinned);
    if (nextPinned) {
      pinned.add(key);
    } else {
      pinned.delete(key);
    }
    if (Boolean(terminal.pinned) !== nextPinned) {
      toggleTerminalPinned(terminal.id);
    }
    setDeskState(activeWorkspace.id, { pinnedTerminalKeys: Array.from(pinned) });
  }, [activeWorkspace?.id, deskState.pinnedTerminalKeys, setDeskState, toggleTerminalPinned]);

  const handleRelaunchTerminal = React.useCallback((terminal: TerminalSession) => {
    const nextId = relaunchTerminal(terminalKey(terminal));
    if (nextId && activeWorkspace?.id) {
      setDeskState(activeWorkspace.id, { activeTerminalKey: terminalKey(terminal) });
    }
  }, [activeWorkspace?.id, relaunchTerminal, setDeskState]);

  const handleFocusTerminal = React.useCallback((terminal: TerminalSession) => {
    if (terminal.restoreState === 'reopenable') {
      return;
    }

    setActiveTerminal(terminal.id);
    if (activeWorkspace?.id) {
      setDeskState(activeWorkspace.id, { activeTerminalKey: terminalKey(terminal) });
    }
  }, [activeWorkspace?.id, setActiveTerminal, setDeskState]);

  const handleExportMissionHandoff = async (terminal: TerminalSession) => {
    const getSnapshot = window.electronAPI.terminal.getSnapshot;
    if (!terminal.runId || typeof getSnapshot !== 'function' || typeof window.electronAPI?.missionConsole?.exportHandoff !== 'function') {
      return;
    }

    try {
      const snapshot = await getSnapshot(terminal.id);
      const outputExcerpt = snapshot?.buffer
        ?.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\u001b\][^\u0007]*\u0007/g, '')
        .replace(/\r/g, '')
        .trim()
        .slice(-6000);
      const result = await window.electronAPI.missionConsole.exportHandoff({
        runId: terminal.runId,
        workspacePath: terminal.cwd,
        summary: terminal.handoffSummary || terminal.runtimeDetail || terminal.missionTitle,
        outputExcerpt
      });
      setHandoffNotice(`Handoff exported: ${result.path}`);
    } catch (error) {
      setHandoffNotice(error instanceof Error ? error.message : 'Could not export Mission Console handoff.');
    }
  };

  const getGridLayout = (count: number) => {
    if (layoutMode === 'vertical') {
      return { cols: 1, rows: count };
    }

    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    return { cols: 2, rows: 3 };
  };

  const focusTerminal = React.useMemo(() => {
    if (layoutMode !== 'focus') {
      return null;
    }

    return visibleTerminals.find((terminal) => terminalKey(terminal) === deskState.activeTerminalKey)
      || visibleTerminals.find((terminal) => terminal.id === activeTerminalId)
      || visibleTerminals[0]
      || null;
  }, [activeTerminalId, deskState.activeTerminalKey, layoutMode, visibleTerminals]);
  const layoutTerminals = focusTerminal ? [focusTerminal] : visibleTerminals;
  const gridLayout = getGridLayout(layoutTerminals.length);
  const compactGridColumns = 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))';
  const compactGridRows = visibleTerminals.length <= 2 ? 'minmax(0, 1fr)' : 'minmax(180px, 1fr)';
  const useListLayout = layoutMode === 'list';
  const useFocusLayout = layoutMode === 'focus';

  if (visibleTerminals.length === 0 && minimalCodeChrome) {
    return (
      <div style={minimalTerminalEmptyStyle}>
        <span style={{ color: 'var(--app-subtle)', fontSize: '11px', fontWeight: 800 }}>
          No terminals
        </span>
      </div>
    );
  }

  if (visibleTerminals.length === 0) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--app-terminal-bg)',
        color: 'var(--app-muted)',
        padding: compact ? '12px' : embedded ? '0' : '40px'
      }}>
        <div style={{
          background: 'var(--app-panel)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          padding: compact ? '18px' : '40px 60px',
          width: compact ? '100%' : undefined,
          maxWidth: compact ? '100%' : undefined,
          borderRadius: embedded ? '8px' : '16px',
          border: '1px solid var(--app-terminal-border)',
          boxShadow: '0 8px 32px var(--app-glow)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px'
        }}>
          <div style={{ fontSize: compact ? '30px' : '48px', marginBottom: '8px', fontFamily: "'JetBrains Mono', monospace" }}>CLI</div>
          <div style={{ fontSize: compact ? '15px' : '20px', color: 'var(--app-text)', fontWeight: '600', marginBottom: '8px', textAlign: 'center' }}>
            {terminals.length === 0 ? 'No terminal sessions running' : 'No terminals match this workspace filter'}
          </div>
          <div style={{ fontSize: compact ? '12px' : '14px', color: 'var(--app-muted)', textAlign: 'center', maxWidth: compact ? '260px' : '340px', lineHeight: '1.5' }}>
            Launch a shell or agent runtime for this workspace.
          </div>
          <div style={{ width: '100%', display: 'grid', gap: '10px' }}>
            <TerminalDeskFilterBar
              value={deskFilter}
              onChange={setDeskFilter}
              activeDeskName={activeWorkspace?.name}
              commandHubName={commandHubWorkspace?.name}
            />
            <AgentLauncher
              items={agentLaunches}
              terminals={visibleTerminals}
              terminalLimitReached={terminalLimitReached}
              onLaunch={handleNewTerminal}
              compact={compact}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      minHeight: 0,
      background: 'var(--app-bg)',
      padding: embedded ? '0' : '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: minimalCodeChrome ? '0' : '8px'
    }}>
      {minimalCodeChrome ? (
        <div style={compactTerminalToolbarStyle}>
          <TerminalLayoutToolbar
            value={layoutMode}
            onChange={handleLayoutModeChange}
            compact
          />
          <TerminalOrderToolbar
            value={deskState.terminalSortMode}
            count={visibleTerminals.length}
            restoreCount={visibleTerminals.filter((terminal) => terminal.restoreState === 'reopenable').length}
            onChange={handleSortModeChange}
            compact
          />
        </div>
      ) : null}

      {!minimalCodeChrome ? (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexDirection: 'column',
          padding: '6px 8px',
          background: 'var(--app-panel)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: embedded ? '8px' : '8px',
          border: '1px solid var(--app-border)',
          boxShadow: '0 2px 12px var(--app-glow), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
          gap: '6px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            minWidth: 0,
            width: '100%'
          }}>
            <span style={{ color: 'var(--app-accent)', fontSize: '12px', fontWeight: '800', whiteSpace: 'nowrap' }}>Code</span>
            <div style={{
              background: terminalLimitReached ? 'var(--app-negative-soft)' : 'var(--app-accent-soft)',
              padding: '2px 7px',
              borderRadius: '999px',
              fontSize: '10px',
              color: terminalLimitReached ? 'var(--app-negative)' : 'var(--app-accent)',
              fontWeight: '700',
              border: `1px solid ${terminalLimitReached ? 'var(--app-negative)' : 'var(--app-border-strong)'}`
            }}>
              {visibleTerminals.length}/{MAX_TERMINALS}
            </div>

            <TerminalLayoutToolbar
              value={layoutMode}
              onChange={handleLayoutModeChange}
            />

            <TerminalDeskFilterBar
              value={deskFilter}
              onChange={setDeskFilter}
              activeDeskName={activeWorkspace?.name}
              commandHubName={commandHubWorkspace?.name}
            />

            <TerminalOrderToolbar
              value={deskState.terminalSortMode}
              count={visibleTerminals.length}
              restoreCount={visibleTerminals.filter((terminal) => terminal.restoreState === 'reopenable').length}
              onChange={handleSortModeChange}
            />
          </div>

          <AgentLauncher
            items={agentLaunches}
            terminals={visibleTerminals}
            terminalLimitReached={terminalLimitReached}
            onLaunch={handleNewTerminal}
            compact={compact}
          />
        </div>
      ) : null}

      {!minimalCodeChrome && missionTerminals.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '8px',
          padding: '0 2px'
        }}>
          {missionTerminals.map((terminal) => (
            <div key={`mission-${terminal.id}`} style={{
              border: '1px solid var(--app-border-strong)',
              borderRadius: '12px',
              background: 'var(--app-panel)',
              padding: '10px',
              display: 'grid',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--app-text)', fontSize: '12px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {terminal.missionTitle || terminal.label}
                  </div>
                  <div style={{ color: 'var(--app-subtle)', fontSize: '10px', marginTop: '4px' }}>
                    {terminal.runtimeProvider || 'shell'} / {terminal.missionKind || 'mission'} / {terminal.runtimeState || terminal.ptyState}
                  </div>
                </div>
                <button type="button" onClick={() => setActiveTerminal(terminal.id)} style={missionTinyButtonStyle}>Focus</button>
              </div>
              <div style={{ color: 'var(--app-muted)', fontSize: '10px', lineHeight: 1.4, minHeight: '28px' }}>
                {terminal.runtimeDetail || terminal.ptyDetail || 'Mission terminal is active.'}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void handleExportMissionHandoff(terminal)} style={missionTinyButtonStyle}>Export handoff</button>
                {terminal.lastOutputAt ? (
                  <span style={{ color: 'var(--app-subtle)', fontSize: '10px', alignSelf: 'center' }}>
                    output {Math.max(0, Math.round((Date.now() - terminal.lastOutputAt) / 1000))}s ago
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {handoffNotice ? (
            <div style={{
              gridColumn: '1 / -1',
              color: handoffNotice.startsWith('Handoff exported') ? 'var(--app-accent)' : 'var(--app-negative)',
              fontSize: '11px',
              padding: '2px 4px'
            }}>{handoffNotice}</div>
          ) : null}
        </div>
      ) : null}

      {useFocusLayout && visibleTerminals.length > 1 ? (
        <TerminalFocusStrip
          terminals={visibleTerminals}
          activeTerminal={focusTerminal}
          onSelect={handleFocusTerminal}
        />
      ) : null}

      <div style={{
        flex: 1,
        minHeight: 0,
        display: useListLayout ? 'flex' : 'grid',
        flexDirection: useListLayout ? 'column' : undefined,
        gridTemplateColumns: !useListLayout
          ? (minimalCodeChrome ? compactGridColumns : `repeat(${gridLayout.cols}, 1fr)`)
          : undefined,
        gridTemplateRows: !useListLayout && !minimalCodeChrome ? `repeat(${gridLayout.rows}, 1fr)` : undefined,
        gridAutoRows: !useListLayout && minimalCodeChrome ? compactGridRows : undefined,
        gap: minimalCodeChrome ? '5px' : '6px',
        overflow: useListLayout || (minimalCodeChrome && layoutTerminals.length > 2) ? 'auto' : 'hidden',
        scrollbarGutter: useListLayout ? 'stable' : undefined
      }}>
        {layoutTerminals.map((terminal) => (
          <div
            key={terminal.id}
            style={{
              position: 'relative',
              minWidth: 0,
              height: useListLayout ? undefined : '100%',
              flex: useListLayout
                ? '0 0 auto'
                : undefined,
              minHeight: useListLayout
                ? (compact ? '360px' : '420px')
                : useFocusLayout
                  ? 0
                  : 0,
              overflow: 'hidden',
              contain: 'layout paint'
            }}
            onClick={() => handleFocusTerminal(terminal)}
          >
            <TerminalItemControls
              terminal={terminal}
              pinned={Boolean(terminal.pinned || deskState.pinnedTerminalKeys.includes(terminalKey(terminal)))}
              onMove={handleMoveTerminal}
              onTogglePin={handleTogglePin}
              onRelaunch={handleRelaunchTerminal}
            />
            {terminal.restoreState === 'reopenable' ? (
              <RestoreTerminalCard
                terminal={terminal}
                onRelaunch={handleRelaunchTerminal}
                onClose={handleCloseTerminal}
                onStopSession={handleStopTerminalSession}
              />
            ) : (
              <div style={{ width: '100%', height: '100%' }}>
                <TerminalPane
                  id={terminal.id}
                  cwd={terminal.cwd}
                  shell={terminal.shell}
                  label={terminal.label}
                  color={terminal.color}
                  rainbowEffect={terminal.rainbowEffect}
                  autoCommand={terminal.autoCommand}
                  missionPrompt={terminal.missionPrompt}
                  missionTitle={terminal.missionTitle}
                  agentName={terminal.agentName}
                  terminalPurpose={terminal.terminalPurpose}
                  runId={terminal.runId}
                  currentCommand={terminal.currentCommand}
                  runtimeProvider={terminal.runtimeProvider}
                  runtimeState={terminal.runtimeState}
                  runtimeDetail={terminal.runtimeDetail}
                  runtimeAttempts={terminal.runtimeAttempts}
                  ptyState={terminal.ptyState}
                  ptyDetail={terminal.ptyDetail}
                  persistenceMode={terminal.persistenceMode}
                  screenStatus={terminal.screenStatus}
                  screenSessionName={terminal.screenSessionName}
                  screenLogPath={terminal.screenLogPath}
                  onClose={() => handleCloseTerminal(terminal.id)}
                  onStopSession={() => handleStopTerminalSession(terminal.id)}
                  onTitleChange={(nextTitle) => updateTerminalCwd(terminal.id, nextTitle)}
                  onLabelChange={(newLabel) => updateTerminalLabel(terminal.id, newLabel)}
                  onColorChange={(newColor) => updateTerminalColor(terminal.id, newColor)}
                  onToggleRainbow={() => toggleRainbowEffect(terminal.id)}
                  onRuntimeStateChange={(state, detail) => updateTerminalRuntimeState(terminal.id, state, detail)}
                  onActivity={() => touchTerminalActivity(terminal.id)}
                  onRuntimeRetry={(detail) => retryTerminalRuntime(terminal.id, detail)}
                  onOpenDiagnostics={handleOpenDiagnostics}
                  isActive={activeTerminalId === terminal.id}
                  compactChrome={minimalCodeChrome}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

function TerminalOrderToolbar({
  value,
  count,
  restoreCount,
  onChange,
  compact = false
}: {
  value: TerminalSortMode;
  count: number;
  restoreCount: number;
  onChange: (value: TerminalSortMode) => void;
  compact?: boolean;
}) {
  return (
    <div style={compact ? compactOrderToolbarStyle : orderToolbarStyle}>
      <SlidersHorizontal size={compact ? 12 : 13} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TerminalSortMode)}
        style={orderSelectStyle}
        title="Terminal order"
        aria-label="Terminal order"
      >
        {TERMINAL_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <span style={orderCountStyle}>{count}</span>
      {restoreCount > 0 ? <span style={restoreCountStyle}>{restoreCount} restore</span> : null}
    </div>
  );
}

function TerminalLayoutToolbar({
  value,
  onChange,
  compact = false
}: {
  value: TerminalLayoutMode;
  onChange: (value: TerminalLayoutMode) => void;
  compact?: boolean;
}) {
  return (
    <div style={compact ? compactLayoutToolbarStyle : layoutToolbarStyle} aria-label="Terminal layout">
      {TERMINAL_LAYOUT_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            title={`Switch terminal layout to ${option.label}`}
            style={{
              ...layoutSegmentButtonStyle,
              background: selected ? 'var(--app-focus)' : 'transparent',
              borderColor: selected ? 'var(--app-border-strong)' : 'transparent',
              color: selected ? 'var(--app-text)' : 'var(--app-subtle)'
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TerminalFocusStrip({
  terminals,
  activeTerminal,
  onSelect
}: {
  terminals: TerminalSession[];
  activeTerminal: TerminalSession | null;
  onSelect: (terminal: TerminalSession) => void;
}) {
  return (
    <div style={focusStripStyle} aria-label="Focused terminal selector">
      {terminals.map((terminal) => {
        const selected = activeTerminal?.id === terminal.id;
        return (
          <button
            key={terminal.id}
            type="button"
            onClick={() => onSelect(terminal)}
            title={terminal.currentCommand || terminal.autoCommand || terminal.label}
            style={{
              ...focusStripButtonStyle,
              background: selected ? 'var(--app-focus)' : 'var(--app-panel-muted)',
              borderColor: selected ? 'var(--app-border-strong)' : 'var(--app-border)',
              color: selected ? 'var(--app-text)' : 'var(--app-muted)'
            }}
          >
            <span style={focusStripTitleStyle}>{terminal.label}</span>
            <span style={focusStripMetaStyle}>{terminal.runtimeState || terminal.ptyState || 'shell'}</span>
          </button>
        );
      })}
    </div>
  );
}

function TerminalItemControls({
  terminal,
  pinned,
  onMove,
  onTogglePin,
  onRelaunch
}: {
  terminal: TerminalSession;
  pinned: boolean;
  onMove: (terminal: TerminalSession, direction: 'up' | 'down') => void;
  onTogglePin: (terminal: TerminalSession) => void;
  onRelaunch: (terminal: TerminalSession) => void;
}) {
  return (
    <div style={terminalItemControlsStyle} onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => onMove(terminal, 'up')} style={floatingToolButtonStyle} title="Move up" aria-label="Move terminal up">
        <ArrowUp size={12} />
      </button>
      <button type="button" onClick={() => onMove(terminal, 'down')} style={floatingToolButtonStyle} title="Move down" aria-label="Move terminal down">
        <ArrowDown size={12} />
      </button>
      <button
        type="button"
        onClick={() => onTogglePin(terminal)}
        style={{
          ...floatingToolButtonStyle,
          color: pinned ? 'var(--app-accent)' : '#cbd5e1',
          borderColor: pinned ? 'var(--app-border-strong)' : 'rgba(148, 163, 184, 0.16)'
        }}
        title={pinned ? 'Unpin' : 'Pin'}
        aria-label={pinned ? 'Unpin terminal' : 'Pin terminal'}
      >
        {pinned ? <PinOff size={12} /> : <Pin size={12} />}
      </button>
      {terminal.restoreState === 'reopenable' ? (
        <button type="button" onClick={() => onRelaunch(terminal)} style={floatingToolButtonStyle} title="Relaunch" aria-label="Relaunch terminal">
          <RotateCcw size={12} />
        </button>
      ) : null}
    </div>
  );
}

function RestoreTerminalCard({
  terminal,
  onRelaunch,
  onClose,
  onStopSession
}: {
  terminal: TerminalSession;
  onRelaunch: (terminal: TerminalSession) => void;
  onClose: (terminalId: string) => void;
  onStopSession: (terminalId: string) => void;
}) {
  const command = terminal.currentCommand || terminal.autoCommand || 'interactive shell';
  const detail = terminal.restoreReason || terminal.runtimeDetail || terminal.ptyDetail || 'Terminal process is not running.';
  const isPersistent = terminal.persistenceMode === 'screen';
  return (
    <section style={restoreCardStyle}>
      <div style={restoreCardHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={restoreCardTitleStyle}>{terminal.label}</div>
          <div style={restoreCardMetaStyle}>
            {terminalProviderLabel(terminal)} / {isPersistent ? `screen ${terminal.screenStatus || 'detached'} / ` : ''}{command}
          </div>
        </div>
        <button type="button" onClick={() => onClose(terminal.id)} style={restoreIconButtonStyle} title="Remove" aria-label="Remove restored terminal">
          <X size={13} />
        </button>
      </div>
      <div style={restoreDetailStyle}>{detail}</div>
      {terminal.lastKnownExcerpt ? (
        <pre style={restoreExcerptStyle}>{terminal.lastKnownExcerpt}</pre>
      ) : null}
      <div style={restoreActionRowStyle}>
        <button type="button" onClick={() => onRelaunch(terminal)} style={restoreButtonStyle}>
          <RotateCcw size={14} />
          {isPersistent ? 'Reattach' : 'Relaunch'}
        </button>
        {isPersistent ? (
          <button type="button" onClick={() => onStopSession(terminal.id)} style={restoreDangerButtonStyle}>
            Stop session
          </button>
        ) : null}
      </div>
    </section>
  );
}

const missionTinyButtonStyle: React.CSSProperties = {
  border: '1px solid var(--app-border-strong)',
  borderRadius: '8px',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-accent)',
  padding: '5px 8px',
  fontSize: '10px',
  fontWeight: 800,
  cursor: 'pointer'
};

const orderToolbarStyle: React.CSSProperties = {
  minHeight: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  border: '1px solid var(--app-border)',
  borderRadius: '6px',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-subtle)',
  padding: '2px 6px',
  fontSize: '10px',
  fontWeight: 850
};

const layoutToolbarStyle: React.CSSProperties = {
  minHeight: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  border: '1px solid var(--app-border)',
  borderRadius: '6px',
  background: 'var(--app-panel-muted)',
  padding: '2px',
  flexShrink: 0
};

const compactLayoutToolbarStyle: React.CSSProperties = {
  ...layoutToolbarStyle,
  height: '28px',
  minHeight: '28px',
  borderRadius: 0,
  borderLeft: 0,
  borderTop: 0,
  borderBottom: 0
};

const layoutSegmentButtonStyle: React.CSSProperties = {
  height: '20px',
  minWidth: '42px',
  borderRadius: '5px',
  border: '1px solid transparent',
  background: 'transparent',
  padding: '0 7px',
  fontSize: '10px',
  fontWeight: 900,
  cursor: 'pointer'
};

const compactTerminalToolbarStyle: React.CSSProperties = {
  minHeight: '28px',
  display: 'flex',
  alignItems: 'center',
  borderBottom: '1px solid var(--app-border)',
  background: 'var(--app-panel)',
  flexShrink: 0,
  overflowX: 'auto',
  overflowY: 'hidden'
};

const compactOrderToolbarStyle: React.CSSProperties = {
  ...orderToolbarStyle,
  height: '28px',
  minHeight: '28px',
  borderRadius: '0',
  borderLeft: 0,
  borderRight: 0,
  borderTop: 0,
  borderBottom: 0,
  justifyContent: 'flex-start',
  flexShrink: 0
};

const focusStripStyle: React.CSSProperties = {
  minHeight: '42px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarGutter: 'stable',
  padding: minimalFocusStripPadding(),
  border: '1px solid var(--app-border)',
  borderRadius: '8px',
  background: 'var(--app-panel)'
};

function minimalFocusStripPadding() {
  return '5px';
}

const focusStripButtonStyle: React.CSSProperties = {
  minWidth: '120px',
  maxWidth: '180px',
  height: '30px',
  display: 'grid',
  alignContent: 'center',
  gap: '2px',
  borderRadius: '7px',
  border: '1px solid var(--app-border)',
  padding: '3px 8px',
  cursor: 'pointer',
  textAlign: 'left',
  flexShrink: 0
};

const focusStripTitleStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '10px',
  fontWeight: 900
};

const focusStripMetaStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--app-subtle)',
  fontSize: '9px',
  fontWeight: 800
};

const orderSelectStyle: React.CSSProperties = {
  height: '20px',
  minWidth: '74px',
  border: '1px solid var(--app-border)',
  borderRadius: '5px',
  background: 'rgba(2, 6, 23, 0.84)',
  color: 'var(--app-text)',
  fontSize: '10px',
  fontWeight: 850,
  outline: 'none'
};

const orderCountStyle: React.CSSProperties = {
  minWidth: '18px',
  height: '18px',
  borderRadius: '999px',
  background: 'var(--app-accent-soft)',
  color: 'var(--app-accent)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '9px',
  fontWeight: 900
};

const restoreCountStyle: React.CSSProperties = {
  color: '#fbbf24',
  fontSize: '9px',
  fontWeight: 900,
  whiteSpace: 'nowrap'
};

const terminalItemControlsStyle: React.CSSProperties = {
  position: 'absolute',
  top: '5px',
  right: '5px',
  zIndex: 12,
  display: 'inline-flex',
  gap: '3px',
  padding: '3px',
  borderRadius: '7px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'rgba(2, 6, 23, 0.72)',
  backdropFilter: 'blur(10px)'
};

const floatingToolButtonStyle: React.CSSProperties = {
  width: '20px',
  height: '20px',
  borderRadius: '5px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.86)',
  color: '#cbd5e1',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer'
};

const restoreCardStyle: React.CSSProperties = {
  height: '100%',
  minHeight: '180px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  border: '1px solid var(--app-border-strong)',
  borderRadius: '8px',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(2, 6, 23, 0.95))',
  color: 'var(--app-text)',
  padding: '36px 12px 12px',
  overflow: 'hidden'
};

const restoreCardHeaderStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '8px'
};

const restoreCardTitleStyle: React.CSSProperties = {
  minWidth: 0,
  color: 'var(--app-text)',
  fontSize: '12px',
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const restoreCardMetaStyle: React.CSSProperties = {
  marginTop: '4px',
  color: 'var(--app-subtle)',
  fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
  fontSize: '10px',
  fontWeight: 750,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const restoreIconButtonStyle: React.CSSProperties = {
  ...floatingToolButtonStyle,
  position: 'relative',
  flexShrink: 0
};

const restoreDetailStyle: React.CSSProperties = {
  color: '#fbbf24',
  fontSize: '11px',
  fontWeight: 800,
  lineHeight: 1.4
};

const restoreExcerptStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  margin: 0,
  padding: '8px',
  borderRadius: '7px',
  border: '1px solid var(--app-border)',
  background: 'rgba(2, 6, 23, 0.76)',
  color: 'var(--app-muted)',
  fontSize: '10px',
  lineHeight: 1.45,
  overflow: 'hidden',
  whiteSpace: 'pre-wrap'
};

const restoreButtonStyle: React.CSSProperties = {
  flex: 1,
  height: '30px',
  borderRadius: '7px',
  border: '1px solid var(--app-border-strong)',
  background: 'var(--app-accent-soft)',
  color: 'var(--app-accent)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '7px',
  fontSize: '11px',
  fontWeight: 900,
  cursor: 'pointer'
};

const restoreActionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const restoreDangerButtonStyle: React.CSSProperties = {
  height: '30px',
  borderRadius: '7px',
  border: '1px solid rgba(248, 113, 113, 0.24)',
  background: 'rgba(239, 68, 68, 0.10)',
  color: '#fca5a5',
  padding: '0 10px',
  fontSize: '10px',
  fontWeight: 900,
  cursor: 'pointer'
};

const minimalTerminalEmptyStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  background: 'var(--app-terminal-bg)',
  color: 'var(--app-muted)'
};

function AgentLauncher({
  items,
  terminals,
  terminalLimitReached,
  onLaunch,
  compact
}: {
  items: AgentLauncherItem[];
  terminals: TerminalSession[];
  terminalLimitReached: boolean;
  onLaunch: (type: QuickTerminalType) => void;
  compact?: boolean;
}) {
  return (
    <div style={agentLauncherShellStyle} aria-label="Agent launcher">
      <span style={agentLauncherTitleStyle}>Agents</span>
      <div style={{
        ...agentLauncherGridStyle,
        gridTemplateColumns: compact
          ? 'repeat(auto-fit, minmax(74px, 1fr))'
          : 'repeat(6, minmax(70px, 1fr))'
      }}>
        {items.map((item) => {
          const providerMeta = item.provider ? getProviderMeta(item.provider) : null;
          const status = getLauncherStatus(item, terminals, terminalLimitReached);
          const accent = providerMeta?.accent || (item.type === 'dev' ? '#f59e0b' : '#94a3b8');
          const isAttention = status.includes('attention');
          const statusDotColor = isAttention
            ? 'var(--app-negative)'
            : status === 'ready'
              ? 'var(--app-subtle)'
              : accent;
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => onLaunch(item.type)}
              disabled={terminalLimitReached}
              title={terminalLimitReached ? `Terminal limit ${MAX_TERMINALS} reached` : `${item.label} - ${item.purpose} - ${item.commandLabel} - ${status}`}
              aria-label={`Launch ${item.label}`}
              style={{
                ...agentLauncherCardStyle,
                opacity: terminalLimitReached ? 0.52 : 1,
                cursor: terminalLimitReached ? 'not-allowed' : 'pointer',
                borderColor: status === 'ready' ? 'var(--app-border)' : `${accent}40`
              }}
            >
              <span style={{
                ...agentProviderBadgeStyle,
                color: accent,
                background: `${accent}12`,
                borderColor: `${accent}30`
              }}>
                {providerMeta?.shortLabel || (item.type === 'dev' ? 'DV' : 'SH')}
              </span>
              <span style={agentLauncherNameStyle}>{item.label}</span>
              <span title={status} style={{ ...agentLauncherStatusDotStyle, background: statusDotColor }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const agentLauncherShellStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '7px'
};

const agentLauncherTitleStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: 'uppercase',
  flexShrink: 0
};

const agentLauncherGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '5px',
  minWidth: 0,
  flex: 1
};

const agentLauncherCardStyle: React.CSSProperties = {
  minWidth: 0,
  height: '30px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
  padding: '4px 6px',
  borderRadius: '7px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-text)',
  textAlign: 'left',
  transition: 'border-color 0.15s ease, background 0.15s ease'
};

const agentProviderBadgeStyle: React.CSSProperties = {
  minWidth: '24px',
  height: '18px',
  padding: '1px 5px',
  borderRadius: '999px',
  border: '1px solid var(--app-border)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '8px',
  fontWeight: 900,
  letterSpacing: 0,
  flexShrink: 0
};

const agentLauncherNameStyle: React.CSSProperties = {
  minWidth: 0,
  color: 'var(--app-text)',
  fontSize: '10px',
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const agentLauncherStatusDotStyle: React.CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '999px',
  flexShrink: 0,
  opacity: 0.85
};

function TerminalDeskFilterBar({
  value,
  onChange,
  activeDeskName,
  commandHubName
}: {
  value: TerminalDeskFilter;
  onChange: (value: TerminalDeskFilter) => void;
  activeDeskName?: string;
  commandHubName?: string;
}) {
  const filters: Array<{ value: TerminalDeskFilter; label: string; title: string }> = [
    { value: 'all', label: 'All', title: 'Show all terminal sessions' },
    { value: 'command-hub', label: commandHubName || 'Command Hub', title: 'Show global command hub terminals' },
    { value: 'active', label: activeDeskName || 'Active Workspace', title: 'Show terminals for the active workspace' }
  ];

  return (
    <div style={deskFilterBarStyle} aria-label="Terminal workspace filter">
      {filters.map((filter) => {
        const selected = filter.value === value;
        return (
          <button
            key={filter.value}
            type="button"
            title={filter.title}
            onClick={() => onChange(filter.value)}
            style={{
              ...deskFilterButtonStyle,
              background: selected ? 'var(--app-focus)' : 'var(--app-panel-muted)',
              borderColor: selected ? 'var(--app-border-strong)' : 'var(--app-border)',
              color: selected ? 'var(--app-text)' : 'var(--app-subtle)'
            }}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

const deskFilterBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap'
};

const deskFilterButtonStyle: React.CSSProperties = {
  height: '26px',
  minWidth: '44px',
  maxWidth: '150px',
  padding: '4px 9px',
  border: '1px solid var(--app-border)',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '10px',
  fontWeight: 800,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

function deriveRunState(
  currentStatus: TaskStatus,
  terminal: TerminalSession
): { status: TaskStatus; launchState: 'launching' | 'ready' | 'attention'; summary: string } | null {
  const now = Date.now();
  const staleRuntime = (terminal.runtimeState === 'running' || terminal.runtimeState === 'waiting-response')
    && typeof terminal.lastOutputAt === 'number'
    && now - terminal.lastOutputAt > 90_000;

  if (terminal.ptyState === 'failed') {
    return {
      status: 'failed',
      launchState: 'attention',
      summary: terminal.ptyDetail || 'Terminal process failed before mission launch'
    };
  }

  if (terminal.runtimeState === 'failed') {
    return {
      status: 'failed',
      launchState: 'attention',
      summary: terminal.runtimeDetail || 'AI runtime failed'
    };
  }

  if (terminal.runtimeState === 'completed') {
    return {
      status: 'completed',
      launchState: 'ready',
      summary: terminal.runtimeDetail || 'Mission runtime completed'
    };
  }

  if (terminal.runtimeState === 'ready' || terminal.runtimeState === 'handoff' || terminal.runtimeState === 'waiting-response' || terminal.runtimeState === 'running') {
    return {
      status: 'running',
      launchState: 'ready',
      summary: staleRuntime
        ? `Working; no recent runtime output for ${Math.round((now - (terminal.lastOutputAt || now)) / 1000)}s`
        : terminal.runtimeDetail || (terminal.runtimeState === 'waiting-response'
        ? 'Mission dispatched, waiting for agent response'
        : terminal.runtimeState === 'handoff'
          ? 'Runtime handshake detected'
        : terminal.runtimeState === 'ready'
          ? 'Runtime ready for operator input'
        : 'Mission running in terminal')
    };
  }

  if (terminal.runtimeState === 'stalled') {
    return {
      status: currentStatus === 'queued' ? 'queued' : 'running',
      launchState: 'ready',
      summary: terminal.runtimeDetail || 'Runtime is still opening or waiting for output'
    };
  }

  if (terminal.runtimeState === 'awaiting-approval') {
    return {
      status: currentStatus === 'queued' ? 'queued' : 'running',
      launchState: 'attention',
      summary: terminal.runtimeDetail || 'Runtime waiting for approval'
    };
  }

  if (terminal.runtimeState === 'launching' || terminal.ptyState === 'creating') {
    return {
      status: 'running',
      launchState: 'launching',
      summary: terminal.runtimeDetail || terminal.ptyDetail || 'Launching runtime'
    };
  }

  return null;
}

function deriveTaskStatus(
  task: { mission?: { executionMode?: string; workflow?: Array<{ role: string }> } },
  taskRuns: Array<{ status: TaskStatus; stageIndex?: number }>
): TaskStatus {
  if (taskRuns.some((run) => run.status === 'failed')) {
    return 'failed';
  }

  if (task.mission?.executionMode === 'pipeline' && Array.isArray(task.mission.workflow) && task.mission.workflow.length > 0) {
    const completedStages = new Set(
      taskRuns
        .filter((run) => run.status === 'completed' && typeof run.stageIndex === 'number')
        .map((run) => run.stageIndex as number)
    );

    if (completedStages.size >= task.mission.workflow.length) {
      return 'completed';
    }

    return 'running';
  }

  if (taskRuns.every((run) => run.status === 'completed')) {
    return 'completed';
  }

  if (taskRuns.some((run) => run.status === 'running' || run.status === 'routing' || run.status === 'queued')) {
    return 'running';
  }

  return 'running';
}
