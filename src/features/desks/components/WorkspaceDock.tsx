import React, { Suspense } from 'react';
import { Activity, AlertTriangle, CandlestickChart, CheckCircle2, CircleDot, Clock3, Globe2, History, Plus, Terminal } from 'lucide-react';
import { useCommanderTasksContext } from '@/contexts/CommanderTasksContext';
import { useTerminalContext, type TerminalSession } from '@/contexts/TerminalContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useDeskSpaceContext } from '../DeskSpaceContext';
import type { AgentProvider } from '@/types/agents';
import type { MissionDraft, TaskRun } from '@/types/tasks';
import { loadAppSettings } from '@/utils/appSettings';
import { resolveAgentRuntimeCommand } from '@/utils/agentRuntime';
import { resolveTerminalShell } from '@/utils/terminalShell';
import { DeskBrowserPanel } from './DeskBrowserPanel';
import { StrategyInspectorPanel } from './StrategyInspectorPanel';
import {
  isWorkspaceDockMode,
  WORKSPACE_DOCK_MODE_EVENT,
  type WorkspaceDockMode,
  type WorkspaceDockModeDetail
} from '../workspaceDockEvents';

const TerminalGrid = React.lazy(() => import('@/components/electron/TerminalGrid').then((module) => ({ default: module.TerminalGrid })));

const STORAGE_KEY = 'hedge-station:workspace-dock-mode:v2';
const LEGACY_STORAGE_KEY = 'hedge-station:workspace-dock-mode:v1';
const defaultDockMode: WorkspaceDockMode = 'inspector';
const MAX_DOCK_TERMINALS = 12;

type WorkStatus = 'waiting' | 'launching' | 'running' | 'attention' | 'completed' | 'failed';
type DockLaunchType = 'codex' | 'opencode' | 'claude' | 'gemini' | 'shell' | 'dev';
type DockLauncherItem = {
  type: DockLaunchType;
  label: string;
  provider?: AgentProvider;
  commandLabel: string;
};

type WorkQueueItem = {
  id: string;
  title: string;
  detail: string;
  status: WorkStatus;
  updatedAt: number;
  terminalId?: string;
};

function loadModeMap(): Record<string, WorkspaceDockMode> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([workspaceId, mode]) => [workspaceId, mode === 'agent' ? 'runs' : mode] as [string, unknown])
        .filter((entry): entry is [string, WorkspaceDockMode] => isWorkspaceDockMode(entry[1]))
    );
  } catch {
    return {};
  }
}

function getDefaultDockMode(kind?: string): WorkspaceDockMode {
  return kind === 'strategy-pod' || kind === 'hedge-fund' ? 'inspector' : 'code';
}

function findRunTerminal(run: TaskRun, terminals: TerminalSession[]): TerminalSession | null {
  return terminals.find((terminal) => run.terminalIds.includes(terminal.id))
    || terminals.find((terminal) => terminal.runId === run.id)
    || null;
}

function findDraftTerminal(draft: MissionDraft, run: TaskRun | undefined, terminals: TerminalSession[]): TerminalSession | null {
  return terminals.find((terminal) => draft.terminalIds?.includes(terminal.id))
    || (run ? findRunTerminal(run, terminals) : null);
}

function deriveRunStatus(run: TaskRun, terminal?: TerminalSession | null): WorkStatus {
  if (run.status === 'failed' || terminal?.runtimeState === 'failed' || terminal?.ptyState === 'failed') {
    return 'failed';
  }

  if (terminal?.runtimeState === 'awaiting-approval' || (!terminal && run.launchState === 'attention')) {
    return 'attention';
  }

  if (run.launchState === 'launching' || terminal?.ptyState === 'creating' || terminal?.runtimeState === 'launching') {
    return 'launching';
  }

  if (run.status === 'completed' || terminal?.runtimeState === 'completed') {
    return 'completed';
  }

  if (run.status === 'running' || run.status === 'routing' || run.status === 'queued') {
    return 'running';
  }

  return 'running';
}

function statusTone(status: WorkStatus): { label: string; color: string; background: string; icon: React.ReactNode } {
  switch (status) {
    case 'waiting':
      return { label: 'waiting', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.14)', icon: <Clock3 size={12} /> };
    case 'launching':
      return { label: 'launching', color: 'var(--app-accent)', background: 'var(--app-accent-soft)', icon: <Activity size={12} /> };
    case 'attention':
      return { label: 'attention', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.14)', icon: <AlertTriangle size={12} /> };
    case 'failed':
      return { label: 'failed', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.16)', icon: <AlertTriangle size={12} /> };
    case 'completed':
      return { label: 'completed', color: '#86efac', background: 'rgba(34, 197, 94, 0.14)', icon: <CheckCircle2 size={12} /> };
    case 'running':
    default:
      return { label: 'running', color: 'var(--app-accent)', background: 'var(--app-accent-soft)', icon: <Activity size={12} /> };
  }
}

function formatAgo(timestamp?: number): string {
  if (!timestamp) {
    return 'no output yet';
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

function buildWorkQueueItems(
  workspaceId: string,
  runs: TaskRun[],
  missionDrafts: MissionDraft[],
  terminals: TerminalSession[]
): WorkQueueItem[] {
  const scopedRuns = runs
    .filter((run) => run.workspaceId === workspaceId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const scopedDrafts = missionDrafts
    .filter((draft) => draft.workspaceId === workspaceId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const runById = new Map(scopedRuns.map((run) => [run.id, run]));
  const draftByRunId = new Map(scopedDrafts
    .filter((draft) => draft.runId)
    .map((draft) => [draft.runId as string, draft]));

  const waitingDrafts = scopedDrafts
    .filter((draft) => draft.approvalStatus === 'awaiting-approval' || draft.approvalStatus === 'draft')
    .map((draft) => {
      const run = draft.runId ? runById.get(draft.runId) : undefined;
      const terminal = findDraftTerminal(draft, run, terminals);
      return {
        id: `draft:${draft.id}`,
        title: draft.title,
        detail: `${draft.mode} / approve in chat`,
        status: 'waiting' as const,
        updatedAt: draft.updatedAt,
        terminalId: terminal?.id
      };
    });

  const activeRuns = scopedRuns
    .filter((run) => run.status !== 'completed')
    .map((run) => {
      const draft = draftByRunId.get(run.id);
      const terminal = findRunTerminal(run, terminals);
      const status = deriveRunStatus(run, terminal);
      return {
        id: `run:${run.id}`,
        title: draft?.title || run.summary || run.agentName,
        detail: `${run.runtimeProvider} / ${terminal?.label || 'waiting terminal'} / ${formatAgo(terminal?.lastOutputAt)}`,
        status,
        updatedAt: run.updatedAt,
        terminalId: terminal?.id
      };
    });

  return [...activeRuns, ...waitingDrafts]
    .sort((a, b) => {
      const rank: Record<WorkStatus, number> = {
        failed: 5,
        attention: 4,
        running: 3,
        launching: 2,
        waiting: 1,
        completed: 0
      };
      return rank[b.status] - rank[a.status] || b.updatedAt - a.updatedAt;
    })
    .slice(0, 8);
}

function summarizeQueue(items: WorkQueueItem[]): { active: number; attention: number; waiting: number } {
  return {
    active: items.filter((item) => item.status === 'running' || item.status === 'launching').length,
    attention: items.filter((item) => item.status === 'attention' || item.status === 'failed').length,
    waiting: items.filter((item) => item.status === 'waiting').length
  };
}

function buildDockLauncherItems(shell?: string): DockLauncherItem[] {
  return [
    {
      type: 'codex',
      label: 'Codex',
      provider: 'codex',
      commandLabel: resolveAgentRuntimeCommand('codex', shell)
    },
    {
      type: 'opencode',
      label: 'OpenCode',
      provider: 'opencode',
      commandLabel: resolveAgentRuntimeCommand('opencode', shell)
    },
    {
      type: 'claude',
      label: 'Claude',
      provider: 'claude',
      commandLabel: resolveAgentRuntimeCommand('claude', shell)
    },
    {
      type: 'gemini',
      label: 'Gemini',
      provider: 'gemini',
      commandLabel: resolveAgentRuntimeCommand('gemini', shell)
    },
    {
      type: 'shell',
      label: 'Shell',
      commandLabel: shell || 'system shell'
    },
    {
      type: 'dev',
      label: 'Dev',
      commandLabel: 'npm run dev'
    }
  ];
}

function buildStrategySessionMetadata(workspace?: { asset_symbol?: string; strategy_symbol?: string } | null) {
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

export function WorkspaceDock() {
  const { activeWorkspace, updateWorkspace } = useWorkspaceContext();
  const { getDeskState, setDeskState } = useDeskSpaceContext();
  const { runs, missionDrafts } = useCommanderTasksContext();
  const { terminals, createTerminal } = useTerminalContext();
  const [modeByWorkspace, setModeByWorkspace] = React.useState<Record<string, WorkspaceDockMode>>(() => loadModeMap());
  const [launcherOpen, setLauncherOpen] = React.useState(false);
  const workspaceId = activeWorkspace?.id;
  const deskState = React.useMemo(() => getDeskState(workspaceId), [getDeskState, workspaceId]);
  const activeMode = workspaceId
    ? deskState.rightDockMode || modeByWorkspace[workspaceId] || getDefaultDockMode(activeWorkspace?.kind)
    : defaultDockMode;
  const settings = React.useMemo(() => loadAppSettings(), []);
  const activeShell = React.useMemo(
    () => resolveTerminalShell(activeWorkspace?.shell, settings.defaultShell).shell,
    [activeWorkspace?.shell, settings.defaultShell]
  );
  const launcherItems = React.useMemo(() => buildDockLauncherItems(activeShell), [activeShell]);
  const terminalLimitReached = terminals.length >= MAX_DOCK_TERMINALS;

  const setMode = React.useCallback((mode: WorkspaceDockMode, targetWorkspaceId = workspaceId) => {
    if (!targetWorkspaceId) {
      return;
    }

    setModeByWorkspace((current) => ({
      ...current,
      [targetWorkspaceId]: mode
    }));
    setDeskState(targetWorkspaceId, { rightDockMode: mode });
  }, [setDeskState, workspaceId]);

  React.useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(modeByWorkspace));
  }, [modeByWorkspace]);

  React.useEffect(() => {
    const handleModeRequest = (event: Event) => {
      const detail = event instanceof CustomEvent
        ? event.detail as Partial<WorkspaceDockModeDetail> | undefined
        : undefined;

      if (!isWorkspaceDockMode(detail?.mode)) {
        return;
      }

      setMode(detail.mode, detail.workspaceId || workspaceId);
    };

    window.addEventListener(WORKSPACE_DOCK_MODE_EVENT, handleModeRequest);
    return () => window.removeEventListener(WORKSPACE_DOCK_MODE_EVENT, handleModeRequest);
  }, [setMode, workspaceId]);

  React.useEffect(() => {
    if (!launcherOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-workspace-dock-launcher]')) {
        setLauncherOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [launcherOpen]);

  const handleLaunch = React.useCallback((type: DockLaunchType) => {
    if (!activeWorkspace || terminalLimitReached) {
      return;
    }

    let label = 'Shell';
    let autoCommand: string | undefined;
    let runtimeProvider: AgentProvider | undefined;
    let terminalPurpose = 'workspace-shell';

    switch (type) {
      case 'codex':
        label = 'Codex';
        runtimeProvider = 'codex';
        autoCommand = resolveAgentRuntimeCommand('codex', activeShell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'opencode':
        label = 'OpenCode';
        runtimeProvider = 'opencode';
        autoCommand = resolveAgentRuntimeCommand('opencode', activeShell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'claude':
        label = 'Claude';
        runtimeProvider = 'claude';
        autoCommand = resolveAgentRuntimeCommand('claude', activeShell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'gemini':
        label = 'Gemini';
        runtimeProvider = 'gemini';
        autoCommand = resolveAgentRuntimeCommand('gemini', activeShell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'dev':
        label = 'NPM Dev';
        autoCommand = 'npm run dev';
        terminalPurpose = 'dev-server';
        break;
      case 'shell':
      default:
        label = 'Shell';
        break;
    }

    createTerminal(
      activeWorkspace.path,
      activeShell,
      label,
      autoCommand,
      {
        workspaceId: activeWorkspace.id,
        ...buildStrategySessionMetadata(activeWorkspace),
        terminalPurpose,
        persistenceMode: terminalPurpose === 'dev-server' ? 'ephemeral' : 'screen',
        ...(runtimeProvider ? { runtimeProvider, agentName: `${label} Agent` } : {})
      }
    );
    setMode('code', activeWorkspace.id);
    setLauncherOpen(false);
  }, [activeShell, activeWorkspace, createTerminal, setMode, terminalLimitReached]);

  const tabs: Array<{ id: WorkspaceDockMode; label: string; icon: React.ReactNode }> = [
    { id: 'inspector', label: 'Strategy Inspector', icon: <CandlestickChart size={14} /> },
    { id: 'code', label: 'Agent CLI', icon: <Terminal size={14} /> },
    { id: 'browser', label: 'TradingView/Web', icon: <Globe2 size={14} /> },
    { id: 'runs', label: 'Runs/Evidence', icon: <History size={14} /> }
  ];
  const queueItems = React.useMemo(
    () => workspaceId ? buildWorkQueueItems(workspaceId, runs, missionDrafts, terminals) : [],
    [missionDrafts, runs, terminals, workspaceId]
  );
  const queueSummary = React.useMemo(() => summarizeQueue(queueItems), [queueItems]);
  const hasQueueSignal = queueSummary.active > 0 || queueSummary.attention > 0 || queueSummary.waiting > 0;

  return (
    <aside style={dockStyle}>
      <div style={dockToolbarStyle} aria-label="Asset strategy lab tools dock">
        <div
          style={workspaceNameStyle}
          title={activeWorkspace ? `${activeWorkspace.name}\n${activeWorkspace.path}` : 'No workspace'}
        >
          {activeWorkspace?.name || 'No workspace'}
        </div>

        {activeWorkspace && activeMode === 'code' && hasQueueSignal ? (
          <button
            type="button"
            onClick={() => setMode('runs', activeWorkspace.id)}
            style={{
              ...queueBadgeButtonStyle,
              color: queueSummary.attention > 0 ? '#fca5a5' : 'var(--app-subtle)',
              borderColor: queueSummary.attention > 0 ? 'rgba(248, 113, 113, 0.28)' : 'var(--app-border)'
            }}
            title={`${queueSummary.active} active / ${queueSummary.waiting} waiting / ${queueSummary.attention} attention`}
            aria-label="Open evidence history"
          >
            <span>{queueSummary.active + queueSummary.waiting + queueSummary.attention}</span>
            {queueSummary.attention > 0 ? <span style={queueAlertDotStyle}>{queueSummary.attention}</span> : null}
          </button>
        ) : null}

        <div data-workspace-dock-launcher style={dockLauncherRootStyle}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setLauncherOpen((current) => !current);
            }}
            disabled={!activeWorkspace || terminalLimitReached}
            style={{
              ...dockLauncherButtonStyle,
              opacity: !activeWorkspace || terminalLimitReached ? 0.52 : 1,
              cursor: !activeWorkspace || terminalLimitReached ? 'not-allowed' : 'pointer'
            }}
            title={terminalLimitReached ? `Terminal limit ${MAX_DOCK_TERMINALS} reached` : 'Launch asset strategy agent or shell'}
            aria-label="Launch asset strategy agent or shell"
          >
            <Plus size={14} />
          </button>

          {launcherOpen ? (
            <div style={dockLauncherMenuStyle}>
              {launcherItems.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  disabled={!activeWorkspace || terminalLimitReached}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleLaunch(item.type);
                  }}
                  title={`${item.label} / ${item.commandLabel}`}
                  style={dockLauncherMenuItemStyle}
                >
                  <span style={dockLauncherBadgeStyle}>
                    {item.provider ? item.provider.slice(0, 2).toUpperCase() : item.type === 'dev' ? 'DV' : 'SH'}
                  </span>
                  <span style={dockLauncherLabelStyle}>{item.label}</span>
                  <span style={dockLauncherCommandStyle}>{item.commandLabel}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div style={dockModeGroupStyle} aria-label="Strategy lab support tools">
          {tabs.map((tab) => {
            const selected = activeMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                title={tab.label}
                aria-label={tab.label}
                style={{
                  ...dockModeButtonStyle,
                  background: selected ? 'var(--app-accent-soft)' : 'var(--app-panel-muted)',
                  borderColor: selected ? 'var(--app-border-strong)' : 'var(--app-border)',
                  color: selected ? 'var(--app-accent)' : 'var(--app-muted)'
                }}
              >
                {tab.icon}
              </button>
            );
          })}
        </div>
      </div>

      <div style={activeMode === 'code' ? codeContentStyle : contentStyle}>
        {!activeWorkspace ? (
          <div style={emptyStyle}>Select an asset pod.</div>
        ) : activeMode === 'inspector' ? (
          <StrategyInspectorPanel />
        ) : activeMode === 'code' ? (
          <CodeWorkspacePanel
            queueItems={queueItems}
            onOpenHistory={() => setMode('runs', activeWorkspace.id)}
          />
        ) : activeMode === 'browser' ? (
          <DeskBrowserPanel workspace={activeWorkspace} updateWorkspace={updateWorkspace} compact />
        ) : (
          <WorkspaceRunsPanel workspaceId={activeWorkspace.id} onOpenCode={() => setMode('code', activeWorkspace.id)} />
        )}
      </div>
    </aside>
  );
}

function CodeWorkspacePanel({
  queueItems,
  onOpenHistory
}: {
  queueItems: WorkQueueItem[];
  onOpenHistory: () => void;
}) {
  return (
    <div style={codeWorkspacePanelStyle}>
      <WorkQueueStrip items={queueItems} onOpenHistory={onOpenHistory} />
      <div style={codeTerminalHostStyle}>
        <Suspense fallback={<LoadingState label="Loading code..." />}>
          <TerminalGrid defaultDeskFilter="active" embedded compact />
        </Suspense>
      </div>
    </div>
  );
}

function WorkQueueStrip({
  items,
  onOpenHistory
}: {
  items: WorkQueueItem[];
  onOpenHistory: () => void;
}) {
  if (items.length === 0) {
    return null;
  }

  const attentionCount = items.filter((item) => item.status === 'attention' || item.status === 'failed').length;
  if (attentionCount === 0) {
    return null;
  }

  const activeCount = items.filter((item) => item.status === 'running' || item.status === 'launching').length;

  return (
    <button
      type="button"
      onClick={onOpenHistory}
      style={workQueueStripStyle}
      title="Open Runs/Evidence"
      aria-label="Open runs and evidence history"
    >
      <span style={workQueueTitleStyle}>Attention</span>
      <span style={workQueueMetaStyle}>{activeCount} active</span>
      <span style={{
        ...workQueueMetaStyle,
        color: '#fca5a5'
      }}>{attentionCount} attention</span>
      <History size={12} />
    </button>
  );
}

function WorkspaceRunsPanel({
  workspaceId,
  onOpenCode
}: {
  workspaceId: string;
  onOpenCode: () => void;
}) {
  const { runs, missionDrafts } = useCommanderTasksContext();
  const { terminals, setActiveTerminal } = useTerminalContext();
  const scopedRuns = React.useMemo(
    () => runs
      .filter((run) => run.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [runs, workspaceId]
  );
  const scopedDrafts = React.useMemo(
    () => missionDrafts
      .filter((draft) => draft.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [missionDrafts, workspaceId]
  );
  const scopedTerminals = React.useMemo(
    () => terminals.filter((terminal) => terminal.workspaceId === workspaceId),
    [terminals, workspaceId]
  );
  const draftByRunId = React.useMemo(
    () => new Map(scopedDrafts.filter((draft) => draft.runId).map((draft) => [draft.runId as string, draft])),
    [scopedDrafts]
  );
  const runById = React.useMemo(
    () => new Map(scopedRuns.map((run) => [run.id, run])),
    [scopedRuns]
  );
  const activeRuns = scopedRuns.filter((run) => run.status === 'running' || run.status === 'routing').length;
  const attentionRuns = scopedRuns.filter((run) => {
    const terminal = findRunTerminal(run, scopedTerminals);
    const status = deriveRunStatus(run, terminal);
    return status === 'attention' || status === 'failed';
  }).length;
  const waitingDrafts = scopedDrafts.filter((draft) => draft.approvalStatus === 'awaiting-approval' || draft.approvalStatus === 'draft').length;

  return (
    <section style={runsPanelStyle}>
      <div style={runsSummaryStyle}>
        <SummaryPill label="Waiting" value={`${waitingDrafts}`} />
        <SummaryPill label="Active" value={`${activeRuns}`} />
        <SummaryPill label="Attention" value={`${attentionRuns}`} />
      </div>

      <DockSection title="Agent Drafts">
        {scopedDrafts.slice(0, 6).map((draft) => {
          const run = draft.runId ? runById.get(draft.runId) : undefined;
          const terminal = findDraftTerminal(draft, run, scopedTerminals);
          return (
            <button
              key={draft.id}
              type="button"
              onClick={() => {
                if (!terminal) {
                  return;
                }
                setActiveTerminal(terminal.id);
                onOpenCode();
              }}
              disabled={!terminal}
              style={{
                ...terminalRowButtonStyle,
                cursor: terminal ? 'pointer' : 'default',
                opacity: terminal ? 1 : 0.72
              }}
            >
              <DockRow
                icon={<CircleDot size={13} />}
                title={draft.title}
                detail={`${draft.approvalStatus} / ${draft.mode}${terminal ? ` / ${terminal.label}` : ' / no terminal'}`}
              />
            </button>
          );
        })}
        {scopedDrafts.length === 0 ? <div style={dockEmptyTextStyle}>No drafts yet.</div> : null}
      </DockSection>

      <DockSection title="Runs / Evidence">
        {scopedRuns.slice(0, 8).map((run) => {
          const draft = draftByRunId.get(run.id);
          const terminal = findRunTerminal(run, scopedTerminals);
          const status = deriveRunStatus(run, terminal);
          const tone = statusTone(status);
          return (
            <button
              key={run.id}
              type="button"
              onClick={() => {
                if (!terminal) {
                  return;
                }
                setActiveTerminal(terminal.id);
                onOpenCode();
              }}
              disabled={!terminal}
              style={{
                ...terminalRowButtonStyle,
                cursor: terminal ? 'pointer' : 'default',
                opacity: terminal ? 1 : 0.72
              }}
            >
              <DockRow
                icon={tone.icon}
                title={draft?.title || run.summary || run.agentName}
                detail={`${tone.label} / ${run.runtimeProvider} / ${terminal?.label || 'waiting terminal'} / ${formatAgo(terminal?.lastOutputAt)}`}
              />
            </button>
          );
        })}
        {scopedRuns.length === 0 ? <div style={dockEmptyTextStyle}>No agent runs yet.</div> : null}
      </DockSection>

      <DockSection title="Terminals">
        {scopedTerminals.slice(0, 5).map((terminal) => (
          <button
            key={terminal.id}
            type="button"
            onClick={() => {
              setActiveTerminal(terminal.id);
              onOpenCode();
            }}
            style={terminalRowButtonStyle}
          >
            <DockRow
              icon={<Terminal size={13} />}
              title={terminal.label}
              detail={`${terminal.runtimeState || 'shell'} / ${terminal.ptyState || 'creating'}`}
            />
          </button>
        ))}
        {scopedTerminals.length === 0 ? <div style={dockEmptyTextStyle}>No terminals for this workspace.</div> : null}
      </DockSection>
    </section>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryPillStyle}>
      <span style={summaryLabelStyle}>{label}</span>
      <span style={summaryValueStyle}>{value}</span>
    </div>
  );
}

function DockSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={dockSectionStyle}>
      <div style={dockSectionTitleStyle}>{title}</div>
      <div style={dockSectionBodyStyle}>{children}</div>
    </section>
  );
}

function DockRow({
  icon,
  title,
  detail
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div style={dockRowStyle}>
      <span style={dockRowIconStyle}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={dockRowTitleStyle}>{title}</span>
        <span style={dockRowDetailStyle}>{detail}</span>
      </span>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div style={loadingStyle}>
      {label}
    </div>
  );
}

const dockStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--app-bg)',
  color: 'var(--app-text)',
  borderLeft: '1px solid var(--app-border)',
  overflow: 'hidden'
};

const dockToolbarStyle: React.CSSProperties = {
  height: '34px',
  minHeight: '34px',
  padding: '3px 6px',
  borderBottom: '1px solid var(--app-border)',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0
};

const workspaceNameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  color: 'var(--app-text)',
  fontSize: '11px',
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const dockModeGroupStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  flexShrink: 0
};

const dockModeButtonStyle: React.CSSProperties = {
  width: '26px',
  height: '26px',
  borderRadius: '6px',
  border: '1px solid var(--app-border)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
  fontSize: '11px',
  fontWeight: 850
};

const queueBadgeButtonStyle: React.CSSProperties = {
  height: '24px',
  minWidth: '28px',
  borderRadius: '999px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  padding: '0 7px',
  fontSize: '10px',
  fontWeight: 900,
  cursor: 'pointer',
  flexShrink: 0
};

const queueAlertDotStyle: React.CSSProperties = {
  minWidth: '14px',
  height: '14px',
  borderRadius: '999px',
  padding: '0 4px',
  background: 'rgba(239, 68, 68, 0.18)',
  color: '#fca5a5',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '9px',
  fontWeight: 900
};

const dockLauncherRootStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  zIndex: 50
};

const dockLauncherButtonStyle: React.CSSProperties = {
  width: '26px',
  height: '26px',
  borderRadius: '6px',
  border: '1px solid var(--app-border-strong)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-text)',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const dockLauncherMenuStyle: React.CSSProperties = {
  position: 'absolute',
  top: '30px',
  right: 0,
  width: '196px',
  display: 'grid',
  gap: '4px',
  padding: '6px',
  borderRadius: '8px',
  border: '1px solid var(--app-border-strong)',
  background: 'var(--app-panel)',
  boxShadow: '0 14px 36px rgba(0, 0, 0, 0.34)',
  zIndex: 1000
};

const dockLauncherMenuItemStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: '30px',
  display: 'grid',
  gridTemplateColumns: '30px minmax(0, 1fr)',
  gridTemplateRows: '1fr 1fr',
  columnGap: '6px',
  alignItems: 'center',
  padding: '0 6px',
  borderRadius: '6px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-text)',
  textAlign: 'left',
  cursor: 'pointer'
};

const dockLauncherBadgeStyle: React.CSSProperties = {
  gridRow: '1 / 3',
  width: '24px',
  height: '18px',
  borderRadius: '999px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-accent-soft)',
  color: 'var(--app-accent)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '8px',
  fontWeight: 900
};

const dockLauncherLabelStyle: React.CSSProperties = {
  minWidth: 0,
  color: 'var(--app-text)',
  fontSize: '11px',
  fontWeight: 850,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const dockLauncherCommandStyle: React.CSSProperties = {
  minWidth: 0,
  color: 'var(--app-subtle)',
  fontSize: '9px',
  fontWeight: 750,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  padding: '8px'
};

const codeContentStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  padding: '2px'
};

const codeWorkspacePanelStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px'
};

const codeTerminalHostStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden'
};

const workQueueStripStyle: React.CSSProperties = {
  width: '100%',
  height: '26px',
  border: '1px solid var(--app-border)',
  borderRadius: '7px',
  background: 'var(--app-panel)',
  color: 'var(--app-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '7px',
  padding: '0 8px',
  cursor: 'pointer',
  minWidth: 0
};

const workQueueTitleStyle: React.CSSProperties = {
  color: 'var(--app-text)',
  fontSize: '10px',
  fontWeight: 900,
  textTransform: 'uppercase'
};

const workQueueMetaStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 800,
  whiteSpace: 'nowrap'
};

const runsPanelStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  overflowY: 'auto',
  display: 'grid',
  alignContent: 'start',
  gap: '10px'
};

const runsSummaryStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '6px'
};

const summaryPillStyle: React.CSSProperties = {
  minHeight: '46px',
  borderRadius: '8px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel)',
  padding: '8px',
  display: 'grid',
  alignContent: 'center',
  gap: '3px'
};

const summaryLabelStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '9px',
  fontWeight: 850,
  textTransform: 'uppercase'
};

const summaryValueStyle: React.CSSProperties = {
  color: 'var(--app-text)',
  fontSize: '10px',
  fontWeight: 850,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const dockSectionStyle: React.CSSProperties = {
  border: '1px solid var(--app-border)',
  borderRadius: '8px',
  background: 'var(--app-panel)',
  overflow: 'hidden'
};

const dockSectionTitleStyle: React.CSSProperties = {
  padding: '9px 10px',
  borderBottom: '1px solid var(--app-border)',
  color: 'var(--app-text)',
  fontSize: '11px',
  fontWeight: 850
};

const dockSectionBodyStyle: React.CSSProperties = {
  padding: '8px',
  display: 'grid',
  gap: '7px'
};

const terminalRowButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  textAlign: 'left'
};

const dockRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '24px minmax(0, 1fr)',
  gap: '8px',
  alignItems: 'center',
  padding: '8px',
  borderRadius: '7px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-surface)'
};

const dockRowIconStyle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  borderRadius: '7px',
  border: '1px solid var(--app-border-strong)',
  background: 'var(--app-accent-soft)',
  color: 'var(--app-accent)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const dockRowTitleStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--app-text)',
  fontSize: '11px',
  fontWeight: 850,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const dockRowDetailStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '3px',
  color: 'var(--app-subtle)',
  fontSize: '10px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const dockEmptyTextStyle: React.CSSProperties = {
  padding: '10px',
  borderRadius: '7px',
  border: '1px dashed var(--app-border)',
  color: 'var(--app-subtle)',
  fontSize: '11px'
};

const loadingStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--app-subtle)',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em'
};

const emptyStyle: React.CSSProperties = {
  height: '100%',
  border: '1px dashed var(--app-border)',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--app-subtle)',
  fontSize: '12px'
};
