import type { TerminalSession } from '@/contexts/TerminalContext';
import type { AgentProvider } from '@/types/agents';
import type { CommanderTask, MissionDraft, MissionReview, TaskRun } from '@/types/tasks';

export type DraftStrategySessionStatus = 'needs-input' | 'ready' | 'working' | 'completed' | 'failed';
export type DraftStrategySessionReviewSource = 'task' | 'terminal';

export interface DraftStrategySessionReview {
  sessionId: string;
  assetSymbol: string;
  title: string;
  status: DraftStrategySessionStatus;
  statusLabel: string;
  providers: AgentProvider[];
  latestExcerpt: string;
  updatedAt: number;
  createdAt: number;
  review?: MissionReview;
  reviewTaskId?: string;
  reviewSource?: DraftStrategySessionReviewSource;
  terminals: TerminalSession[];
  terminalIds: string[];
  runIds: string[];
  draftIds: string[];
  taskIds: string[];
}

interface BuildDraftStrategySessionReviewsParams {
  workspaceId: string;
  assetSymbol: string;
  terminals: TerminalSession[];
  runs: TaskRun[];
  drafts: MissionDraft[];
  tasks: CommanderTask[];
}

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\r/g, '');
}

function compactText(value?: string | null): string {
  if (!value) {
    return '';
  }

  return stripAnsi(value)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-5)
    .join('\n')
    .slice(-900);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function terminalUpdatedAt(terminal: TerminalSession): number {
  return terminal.lastOutputAt || terminal.lastStateChangeAt || terminal.createdAt || 0;
}

function taskUpdatedAt(task: CommanderTask): number {
  return task.review?.updatedAt || task.createdAt || 0;
}

function terminalMatchesAsset(terminal: TerminalSession, assetSymbol: string): boolean {
  return (terminal.assetSymbol || '').toUpperCase() === assetSymbol.toUpperCase();
}

function terminalStatus(terminal: TerminalSession): DraftStrategySessionStatus {
  if (terminal.ptyState === 'failed' || terminal.runtimeState === 'failed') return 'failed';
  if (terminal.runtimeState === 'awaiting-approval') return 'needs-input';
  if (terminal.runtimeState === 'completed') return 'completed';
  if (terminal.runtimeState === 'ready') return 'ready';
  return 'working';
}

function sessionStatus(terminals: TerminalSession[], runs: TaskRun[], drafts: MissionDraft[]): DraftStrategySessionStatus {
  const terminalStatuses = terminals.map(terminalStatus);
  if (terminalStatuses.includes('failed') || runs.some((run) => run.status === 'failed') || drafts.some((draft) => draft.approvalStatus === 'failed')) {
    return 'failed';
  }
  if (terminalStatuses.includes('needs-input') || drafts.some((draft) => draft.approvalStatus === 'draft' || draft.approvalStatus === 'awaiting-approval')) {
    return 'needs-input';
  }
  if (terminalStatuses.length > 0 && terminalStatuses.every((status) => status === 'completed')) {
    return 'completed';
  }
  if (terminalStatuses.includes('ready')) {
    return 'ready';
  }
  return 'working';
}

function statusLabel(status: DraftStrategySessionStatus): string {
  if (status === 'needs-input') return 'needs input';
  return status;
}

function latestReviewFromTerminals(terminals: TerminalSession[]): MissionReview | undefined {
  return terminals
    .map((terminal) => terminal.strategySessionReview)
    .filter((review): review is MissionReview => Boolean(review))
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))[0];
}

export function buildDraftStrategySessionReviews({
  workspaceId,
  assetSymbol,
  terminals,
  runs,
  drafts,
  tasks
}: BuildDraftStrategySessionReviewsParams): DraftStrategySessionReview[] {
  const scopedTerminals = terminals.filter((terminal) => (
    terminal.workspaceId === workspaceId
    && Boolean(terminal.strategySessionId)
    && terminalMatchesAsset(terminal, assetSymbol)
  ));
  const groups = new Map<string, TerminalSession[]>();

  scopedTerminals.forEach((terminal) => {
    const sessionId = terminal.strategySessionId;
    if (!sessionId) return;
    groups.set(sessionId, [...(groups.get(sessionId) || []), terminal]);
  });

  return Array.from(groups.entries())
    .map(([sessionId, groupTerminals]): DraftStrategySessionReview => {
      const terminalIds = groupTerminals.map((terminal) => terminal.id);
      const groupRuns = runs.filter((run) => (
        run.workspaceId === workspaceId
        && (
          groupTerminals.some((terminal) => terminal.runId === run.id)
          || run.terminalIds.some((terminalId) => terminalIds.includes(terminalId))
        )
      ));
      const runIds = groupRuns.map((run) => run.id);
      const taskIds = unique(groupRuns.map((run) => run.taskId).filter(Boolean));
      const groupDrafts = drafts.filter((draft) => (
        draft.workspaceId === workspaceId
        && (
          (draft.runId && runIds.includes(draft.runId))
          || (draft.taskId && taskIds.includes(draft.taskId))
          || draft.terminalIds?.some((terminalId) => terminalIds.includes(terminalId))
        )
      ));
      const draftTaskIds = groupDrafts.map((draft) => draft.taskId).filter((taskId): taskId is string => Boolean(taskId));
      const allTaskIds = unique([...taskIds, ...draftTaskIds]);
      const groupTasks = tasks.filter((task) => task.workspaceId === workspaceId && allTaskIds.includes(task.id));
      const reviewedTask = groupTasks
        .filter((task) => Boolean(task.review))
        .sort((left, right) => taskUpdatedAt(right) - taskUpdatedAt(left))[0];
      const reviewTask = reviewedTask || groupTasks.sort((left, right) => taskUpdatedAt(right) - taskUpdatedAt(left))[0];
      const terminalReview = latestReviewFromTerminals(groupTerminals);
      const sortedTerminals = [...groupTerminals].sort((left, right) => terminalUpdatedAt(right) - terminalUpdatedAt(left));
      const latestRun = [...groupRuns].sort((left, right) => (right.outputCapturedAt || right.updatedAt) - (left.outputCapturedAt || left.updatedAt))[0];
      const latestDraft = [...groupDrafts].sort((left, right) => right.updatedAt - left.updatedAt)[0];
      const latestTerminal = sortedTerminals[0];
      const createdAt = Math.min(...groupTerminals.map((terminal) => terminal.createdAt));
      const updatedAt = Math.max(
        ...groupTerminals.map(terminalUpdatedAt),
        ...groupRuns.map((run) => run.outputCapturedAt || run.updatedAt),
        ...groupDrafts.map((draft) => draft.updatedAt),
        0
      );
      const review = groupTasks.length > 0 ? reviewedTask?.review : terminalReview;
      const providers = unique(
        [
          ...groupTerminals.map((terminal) => terminal.runtimeProvider),
          ...groupRuns.map((run) => run.runtimeProvider)
        ].filter((provider): provider is AgentProvider => Boolean(provider))
      );
      const latestExcerpt = compactText(
        latestRun?.outputExcerpt
        || latestTerminal?.lastKnownExcerpt
        || latestTerminal?.runtimeDetail
        || latestTerminal?.ptyDetail
        || latestDraft?.goal
      );
      const status = sessionStatus(groupTerminals, groupRuns, groupDrafts);

      return {
        sessionId,
        assetSymbol,
        title: latestTerminal?.strategySessionTitle || latestDraft?.title || reviewTask?.title || `${assetSymbol} draft strategy session`,
        status,
        statusLabel: statusLabel(status),
        providers,
        latestExcerpt,
        updatedAt,
        createdAt,
        review,
        reviewTaskId: reviewTask?.id,
        reviewSource: reviewedTask?.review ? 'task' : groupTasks.length === 0 && terminalReview ? 'terminal' : undefined,
        terminals: sortedTerminals,
        terminalIds,
        runIds,
        draftIds: groupDrafts.map((draft) => draft.id),
        taskIds: allTaskIds
      };
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}
