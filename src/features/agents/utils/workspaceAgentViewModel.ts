import type { TerminalSession } from '@/contexts/TerminalContext';
import type { AgentProfile, AgentProvider, AgentRole } from '@/types/agents';
import type { CommanderTask, MissionDraft, TaskRun } from '@/types/tasks';

export type WorkspaceAgentSessionGroup = 'needs-input' | 'ready' | 'working' | 'completed' | 'failed';
export type WorkspaceAgentSessionSource = 'run' | 'draft' | 'terminal';

export interface WorkspaceAgentSessionRow {
  id: string;
  source: WorkspaceAgentSessionSource;
  group: WorkspaceAgentSessionGroup;
  title: string;
  detail: string;
  provider?: AgentProvider;
  agentId?: string;
  agentName?: string;
  agentRole?: AgentRole;
  taskId?: string;
  runId?: string;
  draftId?: string;
  terminalId?: string;
  statusLabel: string;
  latestExcerpt: string;
  updatedAt: number;
  terminal?: TerminalSession;
  run?: TaskRun;
  draft?: MissionDraft;
  task?: CommanderTask;
  isMain?: boolean;
}

interface BuildWorkspaceAgentViewRowsParams {
  workspaceId: string;
  agents: AgentProfile[];
  tasks: CommanderTask[];
  runs: TaskRun[];
  drafts: MissionDraft[];
  terminals: TerminalSession[];
}

const GROUP_RANK: Record<WorkspaceAgentSessionGroup, number> = {
  'needs-input': 5,
  ready: 4,
  failed: 3,
  working: 2,
  completed: 1
};

function rowRank(row: WorkspaceAgentSessionRow): number {
  return row.isMain ? 10 : 0;
}

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\r/g, '');
}

function excerpt(value?: string | null): string {
  if (!value) {
    return '';
  }

  return stripAnsi(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join('\n')
    .slice(-900);
}

function findRunTerminal(run: TaskRun, terminals: TerminalSession[]): TerminalSession | undefined {
  return terminals.find((terminal) => run.terminalIds.includes(terminal.id))
    || terminals.find((terminal) => terminal.runId === run.id);
}

function draftNeedsInput(draft: MissionDraft): boolean {
  return draft.approvalStatus === 'draft' || draft.approvalStatus === 'awaiting-approval';
}

function terminalGroup(terminal?: TerminalSession): WorkspaceAgentSessionGroup {
  if (!terminal) {
    return 'working';
  }

  if (terminal.restoreState === 'reopenable') {
    return 'ready';
  }

  if (terminal.ptyState === 'failed' || terminal.runtimeState === 'failed') {
    return 'failed';
  }

  if (terminal.runtimeState === 'completed') {
    return 'completed';
  }

  if (terminal.runtimeState === 'awaiting-approval') {
    return 'needs-input';
  }

  if (terminal.runtimeState === 'ready') {
    return 'ready';
  }

  return 'working';
}

function runGroup(run: TaskRun, terminal?: TerminalSession): WorkspaceAgentSessionGroup {
  const fromTerminal = terminalGroup(terminal);
  if (fromTerminal === 'failed' || fromTerminal === 'completed' || fromTerminal === 'needs-input') {
    return fromTerminal;
  }

  if (run.status === 'failed') {
    return 'failed';
  }

  if (run.status === 'completed') {
    return 'completed';
  }

  return 'working';
}

function draftGroup(draft: MissionDraft, terminal?: TerminalSession): WorkspaceAgentSessionGroup {
  const fromTerminal = terminalGroup(terminal);
  if (fromTerminal === 'failed' || fromTerminal === 'completed' || fromTerminal === 'needs-input') {
    return fromTerminal;
  }

  if (draft.approvalStatus === 'failed') {
    return 'failed';
  }

  if (draft.approvalStatus === 'completed') {
    return 'completed';
  }

  if (draftNeedsInput(draft)) {
    return 'needs-input';
  }

  return 'working';
}

function getUpdatedAt(run?: TaskRun, draft?: MissionDraft, terminal?: TerminalSession): number {
  return terminal?.lastOutputAt
    || run?.outputCapturedAt
    || run?.updatedAt
    || draft?.updatedAt
    || terminal?.lastStateChangeAt
    || terminal?.createdAt
    || 0;
}

function buildDetail(parts: Array<string | undefined | null | false>): string {
  return parts.filter(Boolean).join(' / ');
}

function statusLabelForRun(run: TaskRun, terminal?: TerminalSession): string {
  if (terminal?.restoreState === 'reopenable') {
    return 'restore';
  }

  if (terminal?.runtimeState) {
    return terminal.runtimeState === 'stalled' ? 'working' : terminal.runtimeState;
  }
  if (terminal?.ptyState && terminal.ptyState !== 'ready') {
    return terminal.ptyState;
  }
  if (run.launchState === 'ready') {
    return 'ready';
  }
  return `${run.status}:${run.launchState}`;
}

function isAgentTerminal(terminal: TerminalSession): boolean {
  return Boolean(
    terminal.restoreState === 'reopenable'
    || terminal.runtimeProvider
    || terminal.agentId
    || terminal.runId
    || terminal.missionTitle
    || terminal.terminalPurpose === 'workspace-main-agent'
    || terminal.terminalPurpose === 'agent-runtime'
    || terminal.terminalPurpose === 'mission-console'
    || terminal.terminalPurpose === 'runtime-probe'
  );
}

export function buildWorkspaceAgentViewRows({
  workspaceId,
  agents,
  tasks,
  runs,
  drafts,
  terminals
}: BuildWorkspaceAgentViewRowsParams): WorkspaceAgentSessionRow[] {
  const scopedAgents = agents.filter((agent) => agent.workspaceId === workspaceId);
  const scopedRuns = runs.filter((run) => run.workspaceId === workspaceId);
  const scopedDrafts = drafts.filter((draft) => draft.workspaceId === workspaceId);
  const scopedTerminals = terminals.filter((terminal) => terminal.workspaceId === workspaceId);
  const agentById = new Map(scopedAgents.map((agent) => [agent.id, agent]));
  const taskById = new Map(tasks.filter((task) => task.workspaceId === workspaceId).map((task) => [task.id, task]));
  const draftByRunId = new Map(scopedDrafts.filter((draft) => draft.runId).map((draft) => [draft.runId as string, draft]));
  const usedTerminalIds = new Set<string>();

  const runRows = scopedRuns.map((run): WorkspaceAgentSessionRow => {
    const terminal = findRunTerminal(run, scopedTerminals);
    if (terminal) {
      usedTerminalIds.add(terminal.id);
    }

    const agent = agentById.get(run.agentId);
    const task = taskById.get(run.taskId);
    const draft = draftByRunId.get(run.id);
    const title = draft?.title || task?.title || run.summary || run.agentName;
    const statusLabel = statusLabelForRun(run, terminal);
    const latestExcerpt = excerpt(run.outputExcerpt || terminal?.lastKnownExcerpt || terminal?.runtimeDetail || terminal?.ptyDetail || run.summary);

    return {
      id: `run:${run.id}`,
      source: 'run',
      group: runGroup(run, terminal),
      title,
      detail: buildDetail([
        terminal?.assetSymbol,
        terminal?.strategySessionTitle,
        run.agentRole,
        run.launchMode,
        terminal?.label || 'no terminal',
        terminal?.currentCommand || terminal?.autoCommand
      ]),
      provider: run.runtimeProvider,
      agentId: run.agentId,
      agentName: run.agentName,
      agentRole: run.agentRole || agent?.role,
      taskId: run.taskId,
      runId: run.id,
      draftId: draft?.id,
      terminalId: terminal?.id || run.terminalIds[0],
      statusLabel,
      latestExcerpt,
      updatedAt: getUpdatedAt(run, draft, terminal),
      terminal,
      run,
      draft,
      task
    };
  });

  const draftRows = scopedDrafts
    .filter((draft) => !draft.runId || draftNeedsInput(draft))
    .map((draft): WorkspaceAgentSessionRow => {
      const terminal = scopedTerminals.find((item) => draft.terminalIds?.includes(item.id));
      if (terminal) {
        usedTerminalIds.add(terminal.id);
      }

      const task = draft.taskId ? taskById.get(draft.taskId) : undefined;
      return {
        id: `draft:${draft.id}`,
        source: 'draft',
        group: draftGroup(draft, terminal),
        title: draft.title,
        detail: buildDetail([
          terminal?.assetSymbol,
          terminal?.strategySessionTitle,
          draft.mode,
          draft.approvalStatus,
          draft.suggestedRoles.slice(0, 3).join(', ')
        ]),
        provider: draft.missionPacket?.frontierRuntime || draft.missionPacket?.runtimePlan.preferredRuntime,
        taskId: draft.taskId,
        draftId: draft.id,
        terminalId: terminal?.id,
        statusLabel: draft.approvalStatus,
        latestExcerpt: excerpt(draft.error || draft.goal),
        updatedAt: getUpdatedAt(undefined, draft, terminal),
        terminal,
        draft,
        task
      };
    });

  const terminalRows = scopedTerminals
    .filter((terminal) => !usedTerminalIds.has(terminal.id) && isAgentTerminal(terminal))
    .map((terminal): WorkspaceAgentSessionRow => {
      const agent = terminal.agentId ? agentById.get(terminal.agentId) : undefined;
      const isMain = terminal.terminalPurpose === 'workspace-main-agent';
      const title = isMain ? terminal.label : terminal.missionTitle || terminal.agentName || terminal.label;
      const statusLabel = terminal.runtimeState === 'stalled'
        ? 'working'
        : terminal.runtimeState || terminal.ptyState || 'terminal';
      return {
        id: `terminal:${terminal.id}`,
        source: 'terminal',
        group: terminalGroup(terminal),
        title,
        detail: buildDetail([
          terminal.assetSymbol,
          terminal.strategySessionTitle,
          terminal.terminalPurpose,
          terminal.label,
          terminal.currentCommand || terminal.autoCommand
        ]),
        provider: terminal.runtimeProvider,
        agentId: terminal.agentId,
        agentName: terminal.agentName,
        agentRole: agent?.role,
        runId: terminal.runId,
        terminalId: terminal.id,
        statusLabel,
        latestExcerpt: excerpt(terminal.lastKnownExcerpt || terminal.runtimeDetail || terminal.ptyDetail || terminal.currentCommand),
        updatedAt: getUpdatedAt(undefined, undefined, terminal),
        terminal,
        isMain
      };
    });

  return [...runRows, ...draftRows, ...terminalRows]
    .sort((a, b) => GROUP_RANK[b.group] - GROUP_RANK[a.group] || rowRank(b) - rowRank(a) || b.updatedAt - a.updatedAt);
}

export function countWorkspaceAgentRows(rows: WorkspaceAgentSessionRow[]): Record<WorkspaceAgentSessionGroup, number> {
  return rows.reduce<Record<WorkspaceAgentSessionGroup, number>>((counts, row) => {
    counts[row.group] += 1;
    return counts;
  }, {
    'needs-input': 0,
    ready: 0,
    working: 0,
    completed: 0,
    failed: 0
  });
}
