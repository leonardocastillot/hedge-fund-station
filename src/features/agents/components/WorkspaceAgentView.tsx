import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ChevronDown,
  Eye,
  MoreHorizontal,
  Play,
  RotateCcw,
  Send,
  Square,
  Terminal,
  Trash2
} from 'lucide-react';
import { useAgentProfilesContext } from '@/contexts/AgentProfilesContext';
import { useCommanderTasksContext } from '@/contexts/CommanderTasksContext';
import { useTerminalContext } from '@/contexts/TerminalContext';
import type { TerminalSession } from '@/contexts/TerminalContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import type { AgentProfile, AgentProvider } from '@/types/agents';
import type { Workspace } from '@/types/electron';
import { getProviderMeta, resolveAgentRuntimeCommand, resolveAgentRuntimeShell } from '@/utils/agentRuntime';
import { useDeskSpaceContext, type TerminalSortMode } from '@/features/desks/DeskSpaceContext';
import { publishWorkspaceDockMode } from '@/features/desks/workspaceDockEvents';
import {
  buildWorkspaceAgentViewRows,
  countWorkspaceAgentRows,
  type WorkspaceAgentSessionGroup,
  type WorkspaceAgentSessionRow
} from '../utils/workspaceAgentViewModel';

const MAX_AGENT_VIEW_TERMINALS = 12;
const MAX_PEEK_EXCERPT_LENGTH = 520;
const PROVIDER_STORAGE_KEY = 'hedge-station:agent-view-provider:v1';
const GROUPS: Array<{ id: WorkspaceAgentSessionGroup; label: string }> = [
  { id: 'needs-input', label: 'Input' },
  { id: 'ready', label: 'Ready' },
  { id: 'working', label: 'Working' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' }
];

function terminalKey(terminal?: TerminalSession | null): string {
  return terminal?.sessionKey || terminal?.id || '';
}

function rowTerminalKey(row: WorkspaceAgentSessionRow): string {
  return terminalKey(row.terminal) || row.terminalId || row.id;
}

function rowUpdatedAt(row: WorkspaceAgentSessionRow): number {
  return row.updatedAt || row.terminal?.lastOutputAt || row.terminal?.lastStateChangeAt || 0;
}

function rowStatusRank(row: WorkspaceAgentSessionRow): number {
  if (row.terminal?.restoreState === 'reopenable') return 4;
  if (row.group === 'needs-input') return 0;
  if (row.group === 'failed') return 1;
  if (row.group === 'working') return 2;
  if (row.group === 'ready') return 3;
  return 5;
}

function rowProvider(row: WorkspaceAgentSessionRow): string {
  return row.provider || row.terminal?.runtimeProvider || 'shell';
}

function rowStrategy(row: WorkspaceAgentSessionRow): string {
  return [
    row.terminal?.assetSymbol,
    row.terminal?.strategySessionTitle,
    row.terminal?.strategySessionId,
    row.title
  ].filter(Boolean).join(' / ');
}

function rowOrderIndex(order: string[], key: string): number {
  const index = order.indexOf(key);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sortRowsByWorkspaceState(
  rows: WorkspaceAgentSessionRow[],
  mode: TerminalSortMode,
  order: string[],
  pinnedKeys: string[]
): WorkspaceAgentSessionRow[] {
  const pinned = new Set(pinnedKeys);
  return [...rows].sort((a, b) => {
    const aKey = rowTerminalKey(a);
    const bKey = rowTerminalKey(b);
    const aPinned = Boolean(a.terminal?.pinned || pinned.has(aKey));
    const bPinned = Boolean(b.terminal?.pinned || pinned.has(bKey));
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    if (mode === 'status') {
      return rowStatusRank(a) - rowStatusRank(b) || rowUpdatedAt(b) - rowUpdatedAt(a);
    }

    if (mode === 'provider') {
      return rowProvider(a).localeCompare(rowProvider(b)) || rowUpdatedAt(b) - rowUpdatedAt(a);
    }

    if (mode === 'strategy') {
      return rowStrategy(a).localeCompare(rowStrategy(b)) || rowUpdatedAt(b) - rowUpdatedAt(a);
    }

    if (mode === 'recent') {
      return rowUpdatedAt(b) - rowUpdatedAt(a);
    }

    return rowOrderIndex(order, aKey) - rowOrderIndex(order, bKey) || rowUpdatedAt(b) - rowUpdatedAt(a);
  });
}

function formatAgo(timestamp?: number): string {
  if (!timestamp) {
    return 'no activity';
  }

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  return `${Math.round(minutes / 60)}h ago`;
}

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\r/g, '');
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'codex' || value === 'opencode' || value === 'claude' || value === 'gemini';
}

function loadProviderPrefs(): Record<string, AgentProvider> {
  try {
    const raw = localStorage.getItem(PROVIDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, AgentProvider] => (
        typeof entry[0] === 'string' && isAgentProvider(entry[1])
      ))
    );
  } catch {
    return {};
  }
}

function saveProviderPref(workspaceId: string, provider: AgentProvider): void {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify({
      ...loadProviderPrefs(),
      [workspaceId]: provider
    }));
  } catch {
    // Local preferences are optional; agent runtime still works without them.
  }
}

function isWritableComposerTerminal(terminal?: TerminalSession | null): terminal is TerminalSession {
  return Boolean(
    terminal
    && terminal.restoreState !== 'reopenable'
    && terminal.ptyState !== 'failed'
    && terminal.runtimeState !== 'completed'
    && terminal.runtimeState !== 'failed'
  );
}

function getTerminalStatus(terminal: TerminalSession): string {
  if (terminal.runtimeState === 'stalled') {
    return 'working';
  }
  return terminal.runtimeState || terminal.ptyState || 'ready';
}

function compactSessionText(value?: string | null): string {
  if (!value) {
    return '';
  }

  const lines = stripAnsi(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[\u2500-\u259f\u25a0-\u25ff]+/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line, index, linesList) => line !== linesList[index - 1])
    .slice(-6);

  const compacted = lines.join('\n');
  if (compacted.length <= MAX_PEEK_EXCERPT_LENGTH) {
    return compacted;
  }

  const tail = compacted.slice(-MAX_PEEK_EXCERPT_LENGTH);
  return tail.replace(/^\S*\s*/, '') || tail;
}

function buildPeekSummary(row: WorkspaceAgentSessionRow): {
  facts: Array<{ label: string; value: string }>;
  excerpt: string;
} {
  const terminal = row.terminal;
  const provider = row.provider || terminal?.runtimeProvider || 'runtime';
  const command = terminal?.currentCommand || terminal?.autoCommand || row.detail || 'workspace session';
  const purpose = terminal?.terminalPurpose || row.source;
  const excerpt = compactSessionText(
    row.latestExcerpt
    || terminal?.runtimeDetail
    || terminal?.ptyDetail
    || row.detail
  );

  return {
    facts: [
      { label: 'Status', value: row.statusLabel },
      { label: 'Provider', value: provider },
      { label: 'Command', value: command },
      { label: 'Purpose', value: purpose },
      { label: 'Updated', value: formatAgo(row.updatedAt) }
    ],
    excerpt: excerpt || 'No recent summary captured.'
  };
}

function getGroupTone(group: WorkspaceAgentSessionGroup): { color: string; background: string; icon: React.ReactNode } {
  switch (group) {
    case 'needs-input':
      return { color: '#fbbf24', background: 'rgba(245, 158, 11, 0.14)', icon: <Clock3 size={13} /> };
    case 'ready':
      return { color: '#86efac', background: 'rgba(34, 197, 94, 0.14)', icon: <CheckCircle2 size={13} /> };
    case 'failed':
      return { color: '#fca5a5', background: 'rgba(239, 68, 68, 0.15)', icon: <AlertTriangle size={13} /> };
    case 'completed':
      return { color: '#86efac', background: 'rgba(34, 197, 94, 0.14)', icon: <CheckCircle2 size={13} /> };
    case 'working':
    default:
      return { color: 'var(--app-accent)', background: 'var(--app-accent-soft)', icon: <Activity size={13} /> };
  }
}

function buildFallbackAgent(workspace: Workspace, provider: AgentProvider): AgentProfile {
  const providerMeta = getProviderMeta(provider);
  return {
    id: `${workspace.id}:agent-view:${provider}`,
    name: `${providerMeta.label} Workspace Agent`,
    role: 'commander',
    provider,
    workspaceId: workspace.id,
    promptTemplate: 'Run one scoped workspace task and return a concise handoff with files, commands, verification, risks, and next action.',
    objective: 'Handle one workspace-scoped task from Agent View.',
    collaboratesWith: ['developer', 'ops', 'researcher'],
    accentColor: providerMeta.accent,
    autoAssignTerminalPurpose: 'agent-view'
  };
}

function getTargetAgents(params: {
  workspace: Workspace;
  mode: 'selected' | 'roster';
  provider: AgentProvider;
  scopedAgents: AgentProfile[];
  selectedAgentIds: string[];
}): AgentProfile[] {
  const { workspace, mode, provider, scopedAgents, selectedAgentIds } = params;
  const selected = scopedAgents.filter((agent) => selectedAgentIds.includes(agent.id));

  if (mode === 'roster') {
    return (scopedAgents.length > 0 ? scopedAgents : [buildFallbackAgent(workspace, provider)])
      .map((agent) => ({ ...agent, provider }));
  }

  if (mode === 'selected') {
    return (selected.length > 0 ? selected : scopedAgents.slice(0, 1))
      .map((agent) => ({ ...agent, provider }));
  }

  return [buildFallbackAgent(workspace, provider)];
}

function getRowCommand(row: WorkspaceAgentSessionRow): string {
  return row.terminal?.currentCommand || row.terminal?.autoCommand || row.detail;
}

function getWorkspaceAssetSymbol(workspace: Workspace): string {
  return (workspace.asset_symbol || workspace.strategy_symbol || workspace.name || 'BTC').toUpperCase();
}

function createStrategySessionMeta(workspace: Workspace, goal?: string) {
  const assetSymbol = getWorkspaceAssetSymbol(workspace);
  const cleanedGoal = goal?.trim().replace(/\s+/g, ' ');
  return {
    assetSymbol,
    strategySessionId: `strategy-session-${assetSymbol.toLowerCase()}-${Date.now()}`,
    strategySessionTitle: cleanedGoal
      ? `${assetSymbol}: ${cleanedGoal.slice(0, 64)}`
      : `${assetSymbol} draft strategy session`,
    strategySessionStatus: 'draft' as const
  };
}

function buildMinimalAgentPrompt(workspace: Workspace, agent: AgentProfile, goal: string): string {
  const assetSymbol = getWorkspaceAssetSymbol(workspace);
  return [
    goal.trim(),
    '',
    `Workspace: ${workspace.name}`,
    `Asset: ${assetSymbol}`,
    `Path: ${workspace.path}`,
    `Role: ${agent.role}`,
    `Asset constraint: build, design, or review a ${assetSymbol} strategy unless the operator explicitly says otherwise.`,
    'Read AGENTS.md and the local project harness before changing files.',
    'Keep output concise. Name files, commands, verification, risks, and next action when relevant.'
  ].join('\n');
}

export const WorkspaceAgentView: React.FC<{ workspaceId?: string }> = ({ workspaceId }) => {
  const { activeWorkspace, workspaces } = useWorkspaceContext();
  const { getDeskState, setDeskState } = useDeskSpaceContext();
  const { agents } = useAgentProfilesContext();
  const {
    tasks,
    runs,
    missionDrafts,
    createTask,
    updateTaskStatus,
    createRun,
    updateRun,
    removeRun,
    updateMissionDraft,
    removeMissionDraft
  } = useCommanderTasksContext();
  const {
    terminals,
    activeTerminalId,
    createTerminal,
    closeTerminal,
    relaunchTerminal,
    setActiveTerminal,
    updateTerminalRuntimeState,
    writeToTerminal
  } = useTerminalContext();
  const workspace = React.useMemo(
    () => workspaces.find((item) => item.id === workspaceId) || activeWorkspace || null,
    [activeWorkspace, workspaceId, workspaces]
  );
  const deskState = React.useMemo(() => getDeskState(workspace?.id), [getDeskState, workspace?.id]);
  const scopedAgents = React.useMemo(
    () => agents.filter((agent) => agent.workspaceId === workspace?.id),
    [agents, workspace?.id]
  );
  const rows = React.useMemo(
    () => workspace
      ? sortRowsByWorkspaceState(buildWorkspaceAgentViewRows({
          workspaceId: workspace.id,
          agents,
          tasks,
          runs,
          drafts: missionDrafts,
          terminals
        }), deskState.terminalSortMode, deskState.terminalOrder, deskState.pinnedTerminalKeys)
      : [],
    [agents, deskState.pinnedTerminalKeys, deskState.terminalOrder, deskState.terminalSortMode, missionDrafts, runs, tasks, terminals, workspace]
  );
  const counts = React.useMemo(() => countWorkspaceAgentRows(rows), [rows]);
  const [provider, setProvider] = React.useState<AgentProvider>('codex');
  const [selectedAgentIds, setSelectedAgentIds] = React.useState<string[]>([]);
  const [prompt, setPrompt] = React.useState('');
  const [peekRowId, setPeekRowId] = React.useState<string | null>(null);
  const [replyText, setReplyText] = React.useState('');
  const [replyOpenRowId, setReplyOpenRowId] = React.useState<string | null>(null);
  const [agentActionsOpen, setAgentActionsOpen] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [isLaunching, setIsLaunching] = React.useState(false);
  const autoOpenedDockWorkspaceRef = React.useRef<string | null>(null);
  const activePeekRow = React.useMemo(
    () => rows.find((row) => row.id === peekRowId) || null,
    [peekRowId, rows]
  );

  React.useEffect(() => {
    if (!workspace) {
      setProvider('codex');
      return;
    }
    setProvider(loadProviderPrefs()[workspace.id] || 'codex');
  }, [workspace?.id]);

  React.useEffect(() => {
    if (!workspace) {
      setSelectedAgentIds([]);
      return;
    }

    setSelectedAgentIds((current) => {
      const valid = current.filter((id) => scopedAgents.some((agent) => agent.id === id));
      if (valid.length > 0) {
        return valid;
      }

      const defaultAgent = scopedAgents.find((agent) => agent.role === 'commander') || scopedAgents[0];
      return defaultAgent ? [defaultAgent.id] : [];
    });
  }, [scopedAgents, workspace]);

  const openTerminalCount = terminals.length;
  const workspaceTerminals = React.useMemo(
    () => workspace
      ? terminals.filter((terminal) => (
          terminal.workspaceId === workspace.id
          || (!terminal.workspaceId && terminal.cwd === workspace.path)
        ))
      : [],
    [terminals, workspace]
  );
  const mainTerminals = React.useMemo(
    () => workspaceTerminals.filter((terminal) => terminal.terminalPurpose === 'workspace-main-agent'),
    [workspaceTerminals]
  );
  const composerTargetTerminal = React.useMemo(
    () => {
      const activeWorkspaceTerminal = workspaceTerminals.find((terminal) => terminal.id === activeTerminalId);
      if (isWritableComposerTerminal(activeWorkspaceTerminal)) {
        return activeWorkspaceTerminal;
      }

      const restoredActiveTerminal = deskState.activeTerminalKey
        ? workspaceTerminals.find((terminal) => terminalKey(terminal) === deskState.activeTerminalKey)
        : undefined;
      if (isWritableComposerTerminal(restoredActiveTerminal)) {
        return restoredActiveTerminal;
      }

      const selectedRowTerminal = activePeekRow?.terminal
        || (activePeekRow?.terminalId
          ? workspaceTerminals.find((terminal) => terminal.id === activePeekRow.terminalId)
          : null);
      if (isWritableComposerTerminal(selectedRowTerminal)) {
        return selectedRowTerminal;
      }

      const liveMainTerminals = mainTerminals
        .filter(isWritableComposerTerminal)
        .sort((a, b) => b.createdAt - a.createdAt);
      const providerMain = liveMainTerminals.find((terminal) => terminal.runtimeProvider === provider);
      if (providerMain) {
        return providerMain;
      }

      return liveMainTerminals[0] || null;
    },
    [activePeekRow, activeTerminalId, deskState.activeTerminalKey, mainTerminals, provider, workspaceTerminals]
  );
  const canSend = Boolean(workspace && prompt.trim() && !isLaunching);

  const focusTerminalInRightDock = React.useCallback((terminalId: string, activeTerminalKey = terminalId) => {
    if (!workspace) {
      return;
    }

    setActiveTerminal(terminalId);
    setDeskState(workspace.id, {
      activeTerminalKey,
      terminalLayout: 'focus'
    });
    publishWorkspaceDockMode('code', workspace.id);
  }, [setActiveTerminal, setDeskState, workspace]);

  React.useEffect(() => {
    if (!workspace) {
      autoOpenedDockWorkspaceRef.current = null;
      return;
    }

    if (!composerTargetTerminal || autoOpenedDockWorkspaceRef.current === workspace.id) {
      return;
    }

    autoOpenedDockWorkspaceRef.current = workspace.id;
    focusTerminalInRightDock(composerTargetTerminal.id, terminalKey(composerTargetTerminal));
  }, [composerTargetTerminal, focusTerminalInRightDock, workspace]);

  const handleProviderChange = React.useCallback((nextProvider: AgentProvider) => {
    setProvider(nextProvider);
    if (workspace) {
      saveProviderPref(workspace.id, nextProvider);
    }
  }, [workspace]);

  const handleAttach = React.useCallback((row: WorkspaceAgentSessionRow) => {
    if (!workspace || !row.terminalId) {
      return;
    }

    const targetTerminal = row.terminal || workspaceTerminals.find((terminal) => terminal.id === row.terminalId);
    if (targetTerminal?.restoreState === 'reopenable') {
      const nextId = relaunchTerminal(terminalKey(targetTerminal));
      if (nextId) {
        focusTerminalInRightDock(nextId, terminalKey(targetTerminal));
      }
    } else {
      if (targetTerminal) {
        focusTerminalInRightDock(row.terminalId, terminalKey(targetTerminal));
      } else {
        focusTerminalInRightDock(row.terminalId);
      }
    }
    setStatusMessage(`Showing live console for ${row.title}`);
  }, [focusTerminalInRightDock, relaunchTerminal, workspace, workspaceTerminals]);

  const handlePeek = React.useCallback((row: WorkspaceAgentSessionRow) => {
    setPeekRowId(row.id);
    setReplyText('');
    setReplyOpenRowId(null);

    if (row.terminalId && row.terminal?.restoreState !== 'reopenable') {
      setActiveTerminal(row.terminalId);
    }
  }, [setActiveTerminal]);

  const handleReply = React.useCallback((row: WorkspaceAgentSessionRow) => {
    if (!row.terminalId || row.terminal?.restoreState === 'reopenable' || !replyText.trim()) {
      return;
    }

    writeToTerminal(row.terminalId, `${replyText.trim()}\r`);
    if (row.terminal?.runtimeProvider) {
      updateTerminalRuntimeState(row.terminalId, 'waiting-response', 'Operator message sent');
    }
    setReplyText('');
    setReplyOpenRowId(null);
    setStatusMessage(`Reply sent to ${row.title}`);
  }, [replyText, updateTerminalRuntimeState, writeToTerminal]);

  const createMainAgentTerminal = React.useCallback((pendingInput?: string, runId?: string, missionPrompt?: string) => {
    if (!workspace) {
      return null;
    }

    if (openTerminalCount + 1 > MAX_AGENT_VIEW_TERMINALS) {
      setStatusMessage(`Terminal limit ${MAX_AGENT_VIEW_TERMINALS} reached.`);
      return null;
    }

    const runtimeShell = resolveAgentRuntimeShell(workspace.shell);
    const providerMeta = getProviderMeta(provider);
    const sessionMeta = createStrategySessionMeta(workspace, pendingInput);
    const terminalId = createTerminal(
      workspace.path,
      runtimeShell,
      `${providerMeta.label} Main`,
      resolveAgentRuntimeCommand(provider, runtimeShell),
      {
        workspaceId: workspace.id,
        ...sessionMeta,
        terminalPurpose: 'workspace-main-agent',
        runtimeProvider: provider,
        agentName: `${providerMeta.label} Main`,
        runId,
        missionPrompt,
        ...(pendingInput ? { pendingInput } : {})
      }
    );
    focusTerminalInRightDock(terminalId);
    return terminalId;
  }, [createTerminal, focusTerminalInRightDock, openTerminalCount, provider, workspace]);

  const launchMinimalAgentSessions = React.useCallback((goal: string, targetAgents: AgentProfile[], summaryPrefix: string) => {
    if (!workspace || !goal.trim() || targetAgents.length === 0) {
      return false;
    }

    if (openTerminalCount + targetAgents.length > MAX_AGENT_VIEW_TERMINALS) {
      setStatusMessage(`Close ${openTerminalCount + targetAgents.length - MAX_AGENT_VIEW_TERMINALS} terminal(s) before launching this set.`);
      return false;
    }

    const taskTitle = goal.trim().slice(0, 72);
    const task = createTask(goal.trim(), workspace.id, taskTitle);
    updateTaskStatus(task.id, 'routing');
    updateTaskStatus(task.id, 'running');
    const runtimeShell = resolveAgentRuntimeShell(workspace.shell);
    const sessionMeta = createStrategySessionMeta(workspace, goal);
    let lastTerminalId: string | null = null;

    targetAgents.forEach((agent) => {
      const providerMeta = getProviderMeta(agent.provider);
      const run = createRun({
        taskId: task.id,
        agentId: agent.id,
        agentName: agent.name,
        agentRole: agent.role,
        runtimeProvider: agent.provider,
        workspaceId: workspace.id,
        status: 'running',
        launchMode: 'direct',
        launchState: 'launching',
        summary: `${summaryPrefix} ${providerMeta.label} for ${agent.name}`,
        terminalIds: []
      });
      const terminalId = createTerminal(
        workspace.path,
        runtimeShell,
        `${agent.name}: ${providerMeta.label}`,
        resolveAgentRuntimeCommand(agent.provider, runtimeShell),
        {
          agentId: agent.id,
          agentName: agent.name,
          terminalPurpose: 'agent-view',
          workspaceId: workspace.id,
          ...sessionMeta,
          runtimeProvider: agent.provider,
          missionPrompt: buildMinimalAgentPrompt(workspace, agent, goal),
          runId: run.id
        }
      );
      lastTerminalId = terminalId;
      updateRun(run.id, {
        terminalIds: [terminalId],
        launchState: 'ready',
        summary: `${summaryPrefix} launched directly for ${agent.name}`
      });
    });

    if (lastTerminalId) {
      focusTerminalInRightDock(lastTerminalId);
    }
    setStatusMessage(`Launched ${targetAgents.length} agent${targetAgents.length === 1 ? '' : 's'}`);
    return true;
  }, [createRun, createTask, createTerminal, focusTerminalInRightDock, openTerminalCount, updateRun, updateTaskStatus, workspace]);

  const handleStop = React.useCallback((row: WorkspaceAgentSessionRow) => {
    if (row.terminalId) {
      closeTerminal(row.terminalId);
    }
    if (row.runId) {
      updateRun(row.runId, {
        status: 'failed',
        launchState: 'attention',
        summary: 'Stopped manually from Agent View',
        endedAt: Date.now()
      });
    }
    if (row.taskId) {
      updateTaskStatus(row.taskId, 'failed');
    }
    if (row.draftId) {
      updateMissionDraft(row.draftId, { approvalStatus: 'cancelled' });
    }
    setStatusMessage(`Stopped ${row.title}`);
  }, [closeTerminal, updateMissionDraft, updateRun, updateTaskStatus]);

  const handleRemove = React.useCallback((row: WorkspaceAgentSessionRow) => {
    if (row.terminalId) {
      closeTerminal(row.terminalId);
    }
    if (row.runId) {
      removeRun(row.runId);
    }
    if (row.draftId) {
      removeMissionDraft(row.draftId);
    }
    if (peekRowId === row.id) {
      setPeekRowId(null);
      setReplyOpenRowId(null);
    }
    setStatusMessage(`Removed ${row.title}`);
  }, [closeTerminal, peekRowId, removeMissionDraft, removeRun]);

  const handleRetry = React.useCallback((row: WorkspaceAgentSessionRow) => {
    if (!workspace) {
      return;
    }

    if (row.terminal?.restoreState === 'reopenable') {
      const terminalId = relaunchTerminal(terminalKey(row.terminal));
      if (terminalId) {
        focusTerminalInRightDock(terminalId, terminalKey(row.terminal));
      }
      setStatusMessage(`Relaunched ${row.title}`);
      return;
    }

    if (row.run && row.task) {
      const sourceAgent = scopedAgents.find((agent) => agent.id === row.run?.agentId);
      const retryAgent = {
        ...(sourceAgent || buildFallbackAgent(workspace, row.provider || provider)),
        provider: row.provider || provider
      };
      launchMinimalAgentSessions(row.task.goal || row.title, [retryAgent], 'Retrying');
      setStatusMessage(`Retry launched for ${row.title}`);
      return;
    }

    if (row.terminal) {
      const terminal = row.terminal;
      const terminalId = createTerminal(
        terminal.cwd,
        terminal.shell,
        `Retry: ${terminal.label}`,
        terminal.currentCommand || terminal.autoCommand,
        {
          workspaceId: terminal.workspaceId,
          assetSymbol: terminal.assetSymbol,
          strategySessionId: terminal.strategySessionId,
          strategySessionTitle: terminal.strategySessionTitle,
          strategySessionStatus: terminal.strategySessionStatus,
          agentId: terminal.agentId,
          agentName: terminal.agentName,
          terminalPurpose: terminal.terminalPurpose,
          runtimeProvider: terminal.runtimeProvider,
          runId: terminal.runId
        }
      );
      focusTerminalInRightDock(terminalId);
      setStatusMessage(`Retry terminal opened for ${row.title}`);
    }
  }, [createTerminal, focusTerminalInRightDock, launchMinimalAgentSessions, provider, relaunchTerminal, scopedAgents, workspace]);

  const handleSendChatMessage = React.useCallback(() => {
    if (!workspace || !prompt.trim() || isLaunching) {
      return;
    }

    setIsLaunching(true);
    setStatusMessage(null);
    const rawMessage = `${prompt.trim()}\r`;

    if (composerTargetTerminal?.id) {
      writeToTerminal(composerTargetTerminal.id, rawMessage);
      if (composerTargetTerminal.runtimeProvider) {
        updateTerminalRuntimeState(composerTargetTerminal.id, 'waiting-response', 'Operator message sent');
      }
      focusTerminalInRightDock(composerTargetTerminal.id, terminalKey(composerTargetTerminal));
      setStatusMessage(`Sent to ${composerTargetTerminal.label}`);
    } else {
      if (openTerminalCount + 1 > MAX_AGENT_VIEW_TERMINALS) {
        setStatusMessage(`Terminal limit ${MAX_AGENT_VIEW_TERMINALS} reached.`);
        setIsLaunching(false);
        return;
      }

      const providerMeta = getProviderMeta(provider);
      const mainAgent = buildFallbackAgent(workspace, provider);
      const taskTitle = prompt.trim().slice(0, 72);
      const task = createTask(prompt.trim(), workspace.id, taskTitle);
      updateTaskStatus(task.id, 'routing');
      updateTaskStatus(task.id, 'running');
      const run = createRun({
        taskId: task.id,
        agentId: mainAgent.id,
        agentName: `${providerMeta.label} Main`,
        agentRole: mainAgent.role,
        runtimeProvider: provider,
        workspaceId: workspace.id,
        status: 'running',
        launchMode: 'direct',
        launchState: 'launching',
        summary: `Agent View main ${providerMeta.label} session`,
        terminalIds: []
      });
      const terminalId = createMainAgentTerminal(rawMessage, run.id, buildMinimalAgentPrompt(workspace, mainAgent, prompt.trim()));
      if (terminalId) {
        updateRun(run.id, {
          terminalIds: [terminalId],
          launchState: 'ready',
          summary: `Agent View main ${providerMeta.label} session opened`
        });
      } else {
        updateRun(run.id, {
          status: 'failed',
          launchState: 'attention',
          summary: 'Could not open main CLI',
          endedAt: Date.now()
        });
        updateTaskStatus(task.id, 'failed');
      }
      setStatusMessage(terminalId ? `Opening ${getProviderMeta(provider).label} main CLI` : 'Could not open main CLI');
    }

    setPrompt('');
    setIsLaunching(false);
  }, [composerTargetTerminal, createMainAgentTerminal, createRun, createTask, focusTerminalInRightDock, isLaunching, openTerminalCount, prompt, provider, updateRun, updateTaskStatus, updateTerminalRuntimeState, workspace, writeToTerminal]);

  const handleLaunchSelectedAgents = React.useCallback(() => {
    if (!workspace || !prompt.trim()) {
      return;
    }

    const selectedTargets = getTargetAgents({
      workspace,
      mode: 'selected',
      provider,
      scopedAgents,
      selectedAgentIds
    });
    if (launchMinimalAgentSessions(prompt.trim(), selectedTargets, 'Agent View')) {
      setPrompt('');
    }
  }, [launchMinimalAgentSessions, prompt, provider, scopedAgents, selectedAgentIds, workspace]);

  const handleLaunchRoster = React.useCallback(() => {
    if (!workspace || !prompt.trim()) {
      return;
    }

    const rosterTargets = getTargetAgents({
      workspace,
      mode: 'roster',
      provider,
      scopedAgents,
      selectedAgentIds
    });
    if (launchMinimalAgentSessions(prompt.trim(), rosterTargets, 'Agent View roster')) {
      setPrompt('');
    }
  }, [launchMinimalAgentSessions, prompt, provider, scopedAgents, selectedAgentIds, workspace]);

  const handleLaunchClaudeAgentView = React.useCallback(() => {
    if (!workspace) {
      return;
    }

    if (openTerminalCount + 1 > MAX_AGENT_VIEW_TERMINALS) {
      setStatusMessage(`Terminal limit ${MAX_AGENT_VIEW_TERMINALS} reached.`);
      return;
    }

    const runtimeShell = resolveAgentRuntimeShell(workspace.shell);
    const sessionMeta = createStrategySessionMeta(workspace, `${getWorkspaceAssetSymbol(workspace)} Claude strategy session`);
    const terminalId = createTerminal(
      workspace.path,
      runtimeShell,
      'Claude Agent View',
      `claude agents --cwd ${quoteShellArg(workspace.path)}`,
      {
        workspaceId: workspace.id,
        ...sessionMeta,
        terminalPurpose: 'agent-runtime',
        runtimeProvider: 'claude',
        agentName: 'Claude Agent View'
      }
    );
    focusTerminalInRightDock(terminalId);
    setStatusMessage('Claude Agent View opened in live console.');
  }, [createTerminal, focusTerminalInRightDock, openTerminalCount, workspace]);

  if (!workspace) {
    return (
      <div style={emptyShellStyle}>Select a workspace.</div>
    );
  }

  const providerMeta = getProviderMeta(provider);
  const rowsByGroup = new Map<WorkspaceAgentSessionGroup, WorkspaceAgentSessionRow[]>();
  GROUPS.forEach((group) => rowsByGroup.set(group.id, rows.filter((row) => row.group === group.id)));
  const composerTargetLabel = composerTargetTerminal
    ? `${composerTargetTerminal.label} / ${getTerminalStatus(composerTargetTerminal)}`
    : `new ${providerMeta.label} main CLI`;
  const activePeekSummary = activePeekRow ? buildPeekSummary(activePeekRow) : null;
  const replyOpen = Boolean(activePeekRow && replyOpenRowId === activePeekRow.id);

  return (
    <section style={shellStyle} aria-label="Workspace Agent View">
      <div style={topBarStyle}>
        <div style={topBarStatusStyle}>
          <Activity size={13} />
          <span style={topBarLabelStyle}>Sessions</span>
          <span style={topBarCountStyle}>{rows.length}</span>
        </div>

        <div style={summaryStyle}>
          <SummaryPill label="Input" value={counts['needs-input']} tone="warn" />
          <SummaryPill label="Ready" value={counts.ready} tone="ready" />
          <SummaryPill label="Working" value={counts.working} tone="active" />
          <SummaryPill label="Done" value={counts.completed} tone="done" />
          <SummaryPill label="Failed" value={counts.failed} tone="bad" />
        </div>
      </div>

      <div style={bodyStyle}>
        <div style={listStyle}>
          {GROUPS.map((group) => {
            const groupRows = rowsByGroup.get(group.id) || [];
            const tone = getGroupTone(group.id);
            if (groupRows.length === 0) {
              return null;
            }

            return (
              <section key={group.id} style={groupStyle}>
                <div style={groupHeaderStyle}>
                  <span style={{ ...groupIconStyle, color: tone.color, background: tone.background }}>{tone.icon}</span>
                  <span>{group.label}</span>
                  <span style={groupCountStyle}>{groupRows.length}</span>
                </div>

                <div style={rowsStyle}>
                  {groupRows.map((row) => (
                    <AgentRow
                      key={row.id}
                      row={row}
                      selected={peekRowId === row.id}
                      onPeek={handlePeek}
                      onAttach={handleAttach}
                      onRetry={handleRetry}
                      onStop={handleStop}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {rows.length === 0 ? (
            <div style={emptyShellStyle}>No agent sessions in this workspace.</div>
          ) : null}
        </div>

        <aside style={peekStyle}>
          {activePeekRow ? (
            <>
              <div style={peekHeaderStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={peekTitleStyle}>{activePeekRow.title}</div>
                  <div style={peekMetaStyle}>{activePeekRow.statusLabel} / {activePeekRow.provider || 'runtime'} / {formatAgo(activePeekRow.updatedAt)}</div>
                </div>
                <div style={peekActionsStyle}>
                  {activePeekRow.terminalId && activePeekRow.terminal?.restoreState !== 'reopenable' ? (
                    <button
                      type="button"
                      onClick={() => setReplyOpenRowId(replyOpen ? null : activePeekRow.id)}
                      style={detailButtonStyle}
                      title={replyOpen ? 'Hide reply box' : 'Reply to this session'}
                    >
                      <Send size={13} />
                      Reply
                    </button>
                  ) : null}
                  {activePeekRow.terminalId ? (
                    <button type="button" onClick={() => handleAttach(activePeekRow)} style={detailButtonStyle} title="Show this session in the right live console">
                      <Terminal size={13} />
                      Live Console
                    </button>
                  ) : null}
                </div>
              </div>
              {activePeekSummary ? (
                <div style={peekSummaryStyle}>
                  <div style={peekFactsGridStyle}>
                    {activePeekSummary.facts.map((fact) => (
                      <div key={fact.label} style={peekFactStyle}>
                        <span style={peekFactLabelStyle}>{fact.label}</span>
                        <span style={peekFactValueStyle}>{fact.value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={peekExcerptStyle}>
                    <div style={peekSectionLabelStyle}>Recent summary</div>
                    <div style={peekExcerptTextStyle}>{activePeekSummary.excerpt}</div>
                  </div>
                </div>
              ) : null}
              {activePeekRow.terminalId && activePeekRow.terminal?.restoreState !== 'reopenable' && replyOpen ? (
                <div style={replyBoxStyle}>
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder="Reply to this session..."
                    rows={3}
                    style={replyInputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => handleReply(activePeekRow)}
                    disabled={!replyText.trim()}
                    style={{
                      ...primaryButtonStyle,
                      opacity: replyText.trim() ? 1 : 0.5,
                      cursor: replyText.trim() ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <Send size={14} />
                    Reply
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div style={peekEmptyStyle}>Select a row to peek.</div>
          )}
        </aside>
      </div>

      <div style={dispatchStyle}>
        <div style={composerTopRowStyle}>
          <select value={provider} onChange={(event) => handleProviderChange(event.target.value as AgentProvider)} style={selectStyle}>
            <option value="codex">Codex</option>
            <option value="opencode">OpenCode</option>
            <option value="claude">Claude</option>
            <option value="gemini">Gemini</option>
          </select>
          <span style={composerTargetStatusStyle} title={composerTargetLabel}>
            Target: {composerTargetLabel}
          </span>
          <button
            type="button"
            onClick={() => setAgentActionsOpen((open) => !open)}
            style={agentActionsToggleStyle}
            title={agentActionsOpen ? 'Hide agent actions' : 'Show agent actions'}
          >
            <MoreHorizontal size={14} />
            Agent actions
            <ChevronDown size={13} style={{ transform: agentActionsOpen ? 'rotate(180deg)' : 'none' }} />
          </button>
        </div>

        {agentActionsOpen ? (
          <div style={agentActionsPanelStyle}>
            <div style={agentActionGroupStyle}>
              <span style={agentActionLabelStyle}>Open CLI</span>
              <div style={agentActionButtonsStyle}>
                <button type="button" onClick={() => createMainAgentTerminal()} style={secondaryButtonStyle}>
                  <Terminal size={14} />
                  New main CLI
                </button>
                <button type="button" onClick={handleLaunchClaudeAgentView} style={secondaryButtonStyle}>
                  <Terminal size={14} />
                  Claude View
                </button>
              </div>
            </div>
            <div style={agentActionGroupStyle}>
              <span style={agentActionLabelStyle}>Launch agents</span>
              <div style={agentActionButtonsStyle}>
                <button
                  type="button"
                  onClick={handleLaunchSelectedAgents}
                  disabled={!prompt.trim()}
                  style={{
                    ...secondaryButtonStyle,
                    opacity: prompt.trim() ? 1 : 0.5,
                    cursor: prompt.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  <Play size={14} />
                  Selected
                </button>
                <button
                  type="button"
                  onClick={handleLaunchRoster}
                  disabled={!prompt.trim()}
                  style={{
                    ...secondaryButtonStyle,
                    opacity: prompt.trim() ? 1 : 0.5,
                    cursor: prompt.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  <Play size={14} />
                  Roster
                </button>
              </div>
            </div>
            <div style={agentActionGroupStyle}>
              <span style={agentActionLabelStyle}>Roles</span>
              <div style={agentPickerStyle}>
                {scopedAgents.slice(0, 10).map((agent) => {
                  const checked = selectedAgentIds.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => {
                        setSelectedAgentIds((current) => (
                          current.includes(agent.id)
                            ? current.filter((id) => id !== agent.id)
                            : [...current, agent.id]
                        ));
                      }}
                      style={{
                        ...agentChipStyle,
                        borderColor: checked ? agent.accentColor : 'var(--app-border)',
                        color: checked ? agent.accentColor : 'var(--app-subtle)'
                      }}
                      title={agent.name}
                    >
                      {agent.role}
                    </button>
                  );
                })}
                {scopedAgents.length === 0 ? (
                  <span style={agentActionHintStyle}>Fallback commander will be used.</span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div style={promptRowStyle}>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSendChatMessage();
              }
            }}
            placeholder={`Message ${composerTargetTerminal?.label || `${providerMeta.label} main CLI`} in ${workspace.name}...`}
            rows={2}
            style={promptInputStyle}
          />
          <button
            type="button"
            onClick={handleSendChatMessage}
            disabled={!canSend}
            style={{
              ...dispatchButtonStyle,
              opacity: canSend ? 1 : 0.45,
              cursor: canSend ? 'pointer' : 'not-allowed'
            }}
            title={composerTargetTerminal ? `Send to ${composerTargetTerminal.label}` : `Open ${providerMeta.label} main CLI and send`}
          >
            <Send size={15} />
            Send
          </button>
        </div>
        {statusMessage ? <div style={statusStyle}>{statusMessage}</div> : null}
      </div>
    </section>
  );
};

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: 'warn' | 'ready' | 'active' | 'done' | 'bad' }) {
  const tones = {
    warn: { color: '#fbbf24', background: 'rgba(245, 158, 11, 0.12)' },
    ready: { color: '#86efac', background: 'rgba(34, 197, 94, 0.12)' },
    active: { color: 'var(--app-accent)', background: 'var(--app-accent-soft)' },
    done: { color: '#86efac', background: 'rgba(34, 197, 94, 0.12)' },
    bad: { color: '#fca5a5', background: 'rgba(239, 68, 68, 0.13)' }
  }[tone];

  return (
    <div style={{ ...summaryPillStyle, color: tones.color, background: tones.background }}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AgentRow({
  row,
  selected,
  onPeek,
  onAttach,
  onRetry,
  onStop,
  onRemove
}: {
  row: WorkspaceAgentSessionRow;
  selected: boolean;
  onPeek: (row: WorkspaceAgentSessionRow) => void;
  onAttach: (row: WorkspaceAgentSessionRow) => void;
  onRetry: (row: WorkspaceAgentSessionRow) => void;
  onStop: (row: WorkspaceAgentSessionRow) => void;
  onRemove: (row: WorkspaceAgentSessionRow) => void;
}) {
  const tone = getGroupTone(row.group);
  const providerMeta = row.provider ? getProviderMeta(row.provider) : null;
  return (
    <article style={{
      ...rowStyle,
      borderColor: selected ? 'var(--app-border-strong)' : 'var(--app-border)',
      background: selected ? 'var(--app-panel)' : 'var(--app-panel-muted)'
    }}>
      <button type="button" onClick={() => onPeek(row)} style={rowMainButtonStyle}>
        <span style={{ ...rowStatusIconStyle, color: tone.color, background: tone.background }}>{tone.icon}</span>
        <span style={rowTextStyle}>
          <span style={rowTitleStyle}>{row.title}</span>
          <span style={rowDetailStyle}>{row.detail || getRowCommand(row) || 'workspace session'}</span>
          {row.latestExcerpt ? <span style={rowExcerptStyle}>{row.latestExcerpt}</span> : null}
        </span>
        <span style={rowMetaStyle}>
          {providerMeta ? (
            <span style={{ ...providerMiniStyle, color: providerMeta.accent, background: providerMeta.glow }}>
              {providerMeta.shortLabel}
            </span>
          ) : null}
          <span>{row.statusLabel}</span>
          <span>{formatAgo(row.updatedAt)}</span>
        </span>
      </button>

      <div style={rowActionsStyle}>
        <button type="button" onClick={() => onPeek(row)} style={iconButtonStyle} title="Peek">
          <Eye size={13} />
        </button>
        <button type="button" onClick={() => onAttach(row)} disabled={!row.terminalId} style={iconButtonStyle} title="Show live console">
          <Terminal size={13} />
        </button>
        <button type="button" onClick={() => onRetry(row)} style={iconButtonStyle} title="Retry">
          <RotateCcw size={13} />
        </button>
        <button type="button" onClick={() => onStop(row)} style={iconButtonStyle} title="Stop">
          <Square size={12} />
        </button>
        <button type="button" onClick={() => onRemove(row)} style={dangerIconButtonStyle} title="Remove">
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  );
}

const shellStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--app-bg)',
  color: 'var(--app-text)',
  overflow: 'hidden'
};

const topBarStyle: React.CSSProperties = {
  flex: '0 0 auto',
  minHeight: '42px',
  padding: '7px 10px',
  borderBottom: '1px solid var(--app-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px'
};

const topBarStatusStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  color: 'var(--app-subtle)',
  fontSize: '11px',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 0
};

const topBarLabelStyle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const topBarCountStyle: React.CSSProperties = {
  minWidth: '20px',
  height: '20px',
  borderRadius: '999px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-text)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '10px',
  fontWeight: 900
};

const summaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '6px',
  flexWrap: 'wrap'
};

const summaryPillStyle: React.CSSProperties = {
  minWidth: '70px',
  height: '26px',
  borderRadius: '6px',
  border: '1px solid var(--app-border)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '0 8px',
  fontSize: '10px',
  fontWeight: 850
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 32%)',
  overflow: 'hidden'
};

const listStyle: React.CSSProperties = {
  minHeight: 0,
  overflow: 'auto',
  padding: '8px',
  display: 'grid',
  alignContent: 'start',
  gap: '8px'
};

const groupStyle: React.CSSProperties = {
  display: 'grid',
  gap: '6px'
};

const groupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  color: 'var(--app-subtle)',
  fontSize: '11px',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 0
};

const groupIconStyle: React.CSSProperties = {
  width: '22px',
  height: '22px',
  borderRadius: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const groupCountStyle: React.CSSProperties = {
  color: 'var(--app-muted)',
  fontSize: '10px',
  marginLeft: 'auto'
};

const rowsStyle: React.CSSProperties = {
  display: 'grid',
  gap: '5px'
};

const rowStyle: React.CSSProperties = {
  minWidth: 0,
  borderRadius: '7px',
  border: '1px solid var(--app-border)',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'stretch',
  overflow: 'hidden'
};

const rowMainButtonStyle: React.CSSProperties = {
  minWidth: 0,
  border: 0,
  background: 'transparent',
  color: 'inherit',
  padding: '8px 9px',
  display: 'grid',
  gridTemplateColumns: '24px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '8px',
  textAlign: 'left',
  cursor: 'pointer'
};

const rowStatusIconStyle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  borderRadius: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const rowTextStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: '2px'
};

const rowTitleStyle: React.CSSProperties = {
  minWidth: 0,
  color: 'var(--app-text)',
  fontSize: '12px',
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const rowDetailStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 750,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const rowExcerptStyle: React.CSSProperties = {
  color: 'var(--app-muted)',
  fontSize: '10px',
  lineHeight: 1.35,
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 1,
  WebkitBoxOrient: 'vertical'
};

const rowMetaStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '6px',
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 800,
  whiteSpace: 'nowrap'
};

const providerMiniStyle: React.CSSProperties = {
  minWidth: '24px',
  height: '18px',
  borderRadius: '999px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '8px',
  fontWeight: 900
};

const rowActionsStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  padding: '0 6px',
  borderLeft: '1px solid var(--app-border)'
};

const iconButtonStyle: React.CSSProperties = {
  width: '25px',
  height: '25px',
  borderRadius: '6px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-subtle)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  cursor: 'pointer'
};

const dangerIconButtonStyle: React.CSSProperties = {
  ...iconButtonStyle,
  color: '#fca5a5'
};

const peekStyle: React.CSSProperties = {
  minHeight: 0,
  borderLeft: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden'
};

const peekHeaderStyle: React.CSSProperties = {
  minHeight: '48px',
  padding: '8px 9px',
  borderBottom: '1px solid var(--app-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px'
};

const peekActionsStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '5px',
  flexShrink: 0
};

const detailButtonStyle: React.CSSProperties = {
  height: '25px',
  borderRadius: '6px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-subtle)',
  padding: '0 8px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
  fontSize: '10px',
  fontWeight: 850,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

const peekTitleStyle: React.CSSProperties = {
  color: 'var(--app-text)',
  fontSize: '12px',
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const peekMetaStyle: React.CSSProperties = {
  marginTop: '3px',
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const peekSummaryStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: '10px',
  overflow: 'auto',
  background: 'var(--app-terminal-bg)',
  display: 'grid',
  alignContent: 'start',
  gap: '9px'
};

const peekFactsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
  gap: '7px'
};

const peekFactStyle: React.CSSProperties = {
  minWidth: 0,
  borderRadius: '7px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  padding: '7px',
  display: 'grid',
  gap: '3px'
};

const peekFactLabelStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '9px',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 0
};

const peekFactValueStyle: React.CSSProperties = {
  color: 'var(--app-text)',
  fontSize: '10px',
  fontWeight: 850,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const peekExcerptStyle: React.CSSProperties = {
  minWidth: 0,
  borderRadius: '7px',
  border: '1px solid var(--app-border)',
  background: 'rgba(2, 6, 23, 0.66)',
  padding: '9px',
  display: 'grid',
  gap: '6px'
};

const peekSectionLabelStyle: React.CSSProperties = {
  color: 'var(--app-accent)',
  fontSize: '9px',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 0
};

const peekExcerptTextStyle: React.CSSProperties = {
  margin: 0,
  color: '#d1d5db',
  fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
  fontSize: '10.5px',
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere'
};

const peekEmptyStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--app-subtle)',
  fontSize: '11px',
  fontWeight: 850
};

const replyBoxStyle: React.CSSProperties = {
  flex: '0 0 auto',
  padding: '8px',
  borderTop: '1px solid var(--app-border)',
  display: 'grid',
  gap: '7px'
};

const replyInputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '62px',
  resize: 'vertical',
  borderRadius: '7px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-bg)',
  color: 'var(--app-text)',
  padding: '8px',
  fontSize: '11px',
  lineHeight: 1.4,
  outline: 'none'
};

const dispatchStyle: React.CSSProperties = {
  flex: '0 0 auto',
  borderTop: '1px solid var(--app-border)',
  background: 'var(--app-bg)',
  padding: '8px 10px',
  display: 'grid',
  gap: '7px',
  minWidth: 0
};

const composerTopRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  gap: '7px',
  flexWrap: 'nowrap'
};

const selectStyle: React.CSSProperties = {
  height: '28px',
  maxWidth: '132px',
  borderRadius: '6px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-text)',
  padding: '0 8px',
  fontSize: '11px',
  fontWeight: 800,
  outline: 'none',
  flexShrink: 0
};

const agentPickerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  flexWrap: 'wrap',
  minWidth: 0
};

const composerTargetStatusStyle: React.CSSProperties = {
  minHeight: '24px',
  minWidth: 0,
  maxWidth: '100%',
  borderRadius: '999px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-subtle)',
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 8px',
  fontSize: '10px',
  fontWeight: 850,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: '1 1 auto'
};

const agentActionsToggleStyle: React.CSSProperties = {
  height: '28px',
  minWidth: '118px',
  borderRadius: '6px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-subtle)',
  padding: '0 8px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
  fontSize: '10px',
  fontWeight: 850,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0
};

const agentActionsPanelStyle: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  padding: '8px',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '8px',
  minWidth: 0
};

const agentActionGroupStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: '6px'
};

const agentActionLabelStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '9px',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 0
};

const agentActionButtonsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap',
  minWidth: 0
};

const agentActionHintStyle: React.CSSProperties = {
  color: 'var(--app-muted)',
  fontSize: '10px',
  fontWeight: 800
};

const agentChipStyle: React.CSSProperties = {
  height: '24px',
  borderRadius: '999px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  padding: '0 8px',
  fontSize: '10px',
  fontWeight: 850,
  cursor: 'pointer'
};

const promptRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '8px',
  alignItems: 'stretch'
};

const promptInputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '48px',
  maxHeight: '120px',
  resize: 'vertical',
  borderRadius: '7px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-text)',
  padding: '8px 9px',
  fontSize: '12px',
  lineHeight: 1.4,
  outline: 'none'
};

const primaryButtonStyle: React.CSSProperties = {
  height: '30px',
  borderRadius: '7px',
  border: '1px solid var(--app-border-strong)',
  background: 'var(--app-accent-soft)',
  color: 'var(--app-accent)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '7px',
  padding: '0 10px',
  fontSize: '11px',
  fontWeight: 900,
  cursor: 'pointer'
};

const secondaryButtonStyle: React.CSSProperties = {
  height: '28px',
  borderRadius: '6px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-subtle)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '0 9px',
  fontSize: '11px',
  fontWeight: 850,
  cursor: 'pointer'
};

const dispatchButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  height: '100%',
  minWidth: '82px'
};

const statusStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 800
};

const emptyShellStyle: React.CSSProperties = {
  minHeight: '120px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--app-subtle)',
  fontSize: '12px',
  fontWeight: 850
};
