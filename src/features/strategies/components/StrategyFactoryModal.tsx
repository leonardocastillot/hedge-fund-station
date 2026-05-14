import React from 'react';
import { CheckCircle2, Loader2, LockKeyhole, Rocket, Sparkles, TrendingUp, X, Zap } from 'lucide-react';
import { useAgentProfilesContext } from '@/contexts/AgentProfilesContext';
import { useCommanderTasksContext } from '@/contexts/CommanderTasksContext';
import { useTerminalContext } from '@/contexts/TerminalContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  hyperliquidService,
  type HyperliquidAgentRuntimeStatus,
  type HyperliquidStrategyCatalogRow
} from '@/services/hyperliquidService';
import type { MissionDraft } from '@/types/tasks';
import { getProviderMeta } from '@/utils/agentRuntime';
import { launchApprovedMissionDraft } from '@/utils/missionDraftLaunch';
import {
  buildStrategyFactoryBenchmarkBoard,
  buildStrategyFactoryMissionDraftInput,
  getStrategyFactoryFocusLabel,
  type StrategyFactoryFocus
} from '@/utils/strategyFactoryMission';

interface StrategyFactoryModalProps {
  open: boolean;
  strategies: HyperliquidStrategyCatalogRow[];
  onClose: () => void;
}

const focusOptions: Array<{
  value: StrategyFactoryFocus;
  icon: React.ReactNode;
  detail: string;
}> = [
  { value: 'auto', icon: <Sparkles className="h-4 w-4" />, detail: 'Evidence decides' },
  { value: 'scalper', icon: <Zap className="h-4 w-4" />, detail: 'Short-horizon edge' },
  { value: 'swing', icon: <TrendingUp className="h-4 w-4" />, detail: 'Multi-session edge' }
];

function getDraftStatusLabel(status: MissionDraft['approvalStatus']): string {
  if (status === 'awaiting-approval' || status === 'draft') return 'awaiting approval';
  return status.replace('-', ' ');
}

export const StrategyFactoryModal: React.FC<StrategyFactoryModalProps> = ({ open, strategies, onClose }) => {
  const { activeWorkspace } = useWorkspaceContext();
  const { agents, ensureWorkspaceAgents } = useAgentProfilesContext();
  const {
    createTask,
    updateTaskStatus,
    createRun,
    updateRun,
    addMissionMessage,
    createMissionDraft,
    updateMissionDraft
  } = useCommanderTasksContext();
  const { createTerminal } = useTerminalContext();
  const [focus, setFocus] = React.useState<StrategyFactoryFocus>('auto');
  const [runtimeStatus, setRuntimeStatus] = React.useState<HyperliquidAgentRuntimeStatus | null>(null);
  const [claudeAvailable, setClaudeAvailable] = React.useState(false);
  const [runtimeLoading, setRuntimeLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState<MissionDraft | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const workspaceAgents = React.useMemo(
    () => agents.filter((agent) => agent.workspaceId === activeWorkspace?.id),
    [activeWorkspace?.id, agents]
  );
  const benchmarkPreview = React.useMemo(
    () => buildStrategyFactoryBenchmarkBoard(strategies, 3),
    [strategies]
  );
  const codexReady = Boolean(runtimeStatus?.codexAuthenticated);
  const codexLoginRequired = runtimeStatus ? !runtimeStatus.codexAuthenticated : false;

  const refreshRuntime = React.useCallback(async () => {
    setRuntimeLoading(true);
    setError(null);
    try {
      const [status, commands] = await Promise.all([
        hyperliquidService.getAgentRuntimeStatus().catch(() => null),
        window.electronAPI?.diagnostics?.checkCommands
          ? window.electronAPI.diagnostics.checkCommands(['claude']).catch(() => [])
          : Promise.resolve([])
      ]);
      setRuntimeStatus(status);
      setClaudeAvailable(commands.some((command) => command.command === 'claude' && command.available));
      if (!status) {
        setError('Unable to read Codex runtime status.');
      }
    } finally {
      setRuntimeLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      setMessage(null);
      setError(null);
      void refreshRuntime();
    }
  }, [open, refreshRuntime]);

  const launchCodexLogin = React.useCallback(async () => {
    if (!window.electronAPI?.diagnostics?.launchCodexLogin) {
      setError('Codex login launcher is not available in this build.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.electronAPI.diagnostics.launchCodexLogin();
      if (result.success) {
        setMessage('Codex login opened. Complete it, then refresh runtime.');
      } else {
        setError(result.error || 'Unable to launch Codex login.');
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const createFactoryDraft = React.useCallback(() => {
    if (!activeWorkspace) {
      setError('No active workspace is selected.');
      return;
    }

    const draftInput = buildStrategyFactoryMissionDraftInput({
      workspaceId: activeWorkspace.id,
      focus,
      strategies,
      runtimeStatus,
      claudeAvailable
    });
    const nextDraft = createMissionDraft(draftInput);
    addMissionMessage({
      workspaceId: activeWorkspace.id,
      role: 'user',
      content: draftInput.goal
    });
    addMissionMessage({
      workspaceId: activeWorkspace.id,
      draftId: nextDraft.id,
      role: 'assistant',
      content: `Strategy Factory draft ready for approval: ${draftInput.title}.`
    });
    setDraft(nextDraft);
    setMessage('Draft ready for approval.');
    setError(null);
  }, [activeWorkspace, addMissionMessage, claudeAvailable, createMissionDraft, focus, runtimeStatus, strategies]);

  const approveAndLaunch = React.useCallback(() => {
    if (!activeWorkspace || !draft) {
      return;
    }

    if (!codexReady) {
      setError(runtimeStatus ? 'Codex login required.' : 'Codex runtime status required.');
      return;
    }

    if (workspaceAgents.length === 0) {
      ensureWorkspaceAgents([activeWorkspace]);
    }

    const launchResult = launchApprovedMissionDraft(
      {
        workspace: activeWorkspace,
        workspaceAgents,
        createTask,
        updateTaskStatus,
        createTerminal,
        createRun,
        updateRun
      },
      {
        draft,
        summaryPrefix: 'Strategy Factory launching'
      }
    );

    if (!launchResult.ok) {
      updateMissionDraft(draft.id, {
        taskId: launchResult.task.id,
        approvalStatus: 'failed',
        error: launchResult.error
      });
      setDraft((current) => current ? {
        ...current,
        taskId: launchResult.task.id,
        approvalStatus: 'failed',
        error: launchResult.error
      } : current);
      setError(launchResult.error);
      return;
    }

    const updates: Partial<MissionDraft> = {
      taskId: launchResult.task.id,
      runId: launchResult.run.id,
      terminalIds: launchResult.run.terminalIds,
      approvalStatus: 'running',
      approvedAt: Date.now()
    };
    updateMissionDraft(draft.id, updates);
    setDraft((current) => current ? { ...current, ...updates } : current);
    addMissionMessage({
      workspaceId: activeWorkspace.id,
      taskId: launchResult.task.id,
      draftId: draft.id,
      role: 'system',
      content: `Approved. ${getProviderMeta(launchResult.agent.provider).label} launched from Strategy Pipeline.`
    });
    setMessage('Codex launched from Strategy Pipeline.');
    setError(null);
  }, [
    activeWorkspace,
    addMissionMessage,
    codexReady,
    createRun,
    createTask,
    createTerminal,
    draft,
    ensureWorkspaceAgents,
    updateMissionDraft,
    updateRun,
    updateTaskStatus,
    workspaceAgents
  ]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-white/10 bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">Strategy Factory</div>
            <h2 className="mt-1 text-lg font-semibold text-white">Create Strategy Mission</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
            aria-label="Close Strategy Factory"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {focusOptions.map((option) => {
              const active = focus === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFocus(option.value)}
                  className={`min-h-20 rounded-md border p-3 text-left transition ${
                    active
                      ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-50'
                      : 'border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.07]'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {option.icon}
                    {getStrategyFactoryFocusLabel(option.value)}
                  </span>
                  <span className="mt-2 block text-xs text-white/45">{option.detail}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className={`rounded-md border p-3 text-sm ${
              codexLoginRequired
                ? 'border-amber-400/25 bg-amber-500/10 text-amber-100'
                : 'border-white/10 bg-white/[0.03] text-white/65'
            }`}>
              <div className="flex items-center gap-2 font-semibold text-white">
                {runtimeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : codexLoginRequired ? <LockKeyhole className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
                {codexLoginRequired ? 'Codex login required' : runtimeStatus?.codexAuthenticated ? 'Codex connected' : 'Runtime status'}
              </div>
              <div className="mt-1 text-xs text-white/45">
                {runtimeStatus?.defaultModel ? `Model ${runtimeStatus.defaultModel}` : runtimeStatus?.runtimeMode || 'Checking local Codex runtime'}
              </div>
            </div>
            <div className="flex gap-2 sm:flex-col">
              <button
                type="button"
                onClick={() => void refreshRuntime()}
                disabled={runtimeLoading || busy}
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {runtimeLoading ? 'Refreshing' : 'Refresh'}
              </button>
              {codexLoginRequired ? (
                <button
                  type="button"
                  onClick={() => void launchCodexLogin()}
                  disabled={busy}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-amber-300/30 bg-amber-400/15 px-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <LockKeyhole className="h-4 w-4" />
                  Open Login
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">Benchmark Preview</div>
            <div className="mt-2 space-y-2 text-xs leading-5 text-white/55">
              {benchmarkPreview.length ? benchmarkPreview.map((line) => <div key={line}>{line}</div>) : <div>No catalog rows loaded yet.</div>}
            </div>
          </div>

          {draft ? (
            <div className="rounded-md border border-cyan-300/25 bg-cyan-400/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-cyan-50">{draft.title}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.14em] text-cyan-100/55">{getDraftStatusLabel(draft.approvalStatus)}</div>
                </div>
                <div className="text-xs text-cyan-100/60">{draft.proposedCommands.length} commands</div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-cyan-50/80">Mission Draft</summary>
                <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/25 p-3 text-xs leading-5 text-white/65">{draft.goal}</pre>
              </details>
            </div>
          ) : null}

          {message ? <div className="rounded-md border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}
          {error ? <div className="rounded-md border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 p-4">
          <button
            type="button"
            onClick={createFactoryDraft}
            disabled={busy || !activeWorkspace}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none"
          >
            <Sparkles className="h-4 w-4" />
            Create Draft
          </button>
          <button
            type="button"
            onClick={approveAndLaunch}
            disabled={busy || !draft || !codexReady || draft.approvalStatus === 'running'}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-400/15 px-3 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none"
          >
            <Rocket className="h-4 w-4" />
            Approve Launch
          </button>
        </div>
      </div>
    </div>
  );
};
