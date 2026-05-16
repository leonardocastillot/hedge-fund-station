import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type SeriesMarker,
  type UTCTimestamp
} from 'lightweight-charts';
import {
  AlertTriangle,
  BarChart3,
  CandlestickChart,
  CheckCircle2,
  Clock3,
  FlaskConical,
  History,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  Sparkles,
  Terminal,
  TrendingUp
} from 'lucide-react';
import { useCommanderTasksContext } from '@/contexts/CommanderTasksContext';
import { useTerminalContext } from '@/contexts/TerminalContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  hyperliquidService,
  type HyperliquidStrategyCatalogRow,
  type HyperliquidStrategyLabResponse
} from '@/services/hyperliquidService';
import {
  buildStrategyFactoryBenchmarkBoard,
  getStrategyFactoryFocusLabel,
  type StrategyFactoryFocus
} from '@/utils/strategyFactoryMission';
import BtcPineLabPanel from '@/features/cockpit/pages/BtcPineLabPanel';
import { StrategyFactoryModal } from '@/features/strategies/components/StrategyFactoryModal';
import type { MissionDecision, MissionReview, MissionReviewConfidence } from '@/types/tasks';
import { publishWorkspaceDockMode } from '../workspaceDockEvents';
import {
  buildDraftStrategySessionReviews,
  type DraftStrategySessionReview
} from '../strategySessionReviewModel';

type InspectorMode = 'overview' | 'create' | 'indicator';
type GatedAction = 'backtest' | 'validation' | 'paper';

const SAFE_BACKTEST_OPTIONS = {
  lookbackDays: 3,
  runValidation: true,
  buildPaperCandidate: false
};
const intervals = ['1d', '4h', '1h', '15m'];

function joinRepoPath(repoPath: string, path: string): string {
  if (!path) return repoPath;
  if (path.startsWith('/')) return path;
  return `${repoPath.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
}

function inferStrategyBackendDir(repoPath: string, strategyId: string): string {
  return `${repoPath.replace(/\/$/, '')}/backend/hyperliquid_gateway/strategies/${strategyId}`;
}

function inferStrategyDocsPath(repoPath: string, strategy: HyperliquidStrategyCatalogRow): string {
  if (strategy.latestArtifactPaths.docs) {
    return joinRepoPath(repoPath, strategy.latestArtifactPaths.docs);
  }
  return `${repoPath.replace(/\/$/, '')}/docs/strategies/${strategy.strategyId.replace(/_/g, '-')}.md`;
}

function formatNumber(value: unknown, digits = 2): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return numeric.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(numeric) >= 100 ? 0 : digits
  });
}

function formatCurrency(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return numeric.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(numeric) >= 100 ? 0 : 2
  });
}

function formatPct(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return `${numeric.toFixed(Math.abs(numeric) >= 100 ? 0 : 2)}%`;
}

function formatDate(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toLocaleString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
  }
  return 'n/a';
}

function getSummaryMetric(summary: HyperliquidStrategyLabResponse['summary'], key: string): unknown {
  return summary ? summary[key] : undefined;
}

function sortStrategies(strategies: HyperliquidStrategyCatalogRow[]): HyperliquidStrategyCatalogRow[] {
  return [...strategies].sort((left, right) => {
    const leftActivity = left.lastActivityAt ?? 0;
    const rightActivity = right.lastActivityAt ?? 0;
    if (rightActivity !== leftActivity) return rightActivity - leftActivity;
    return left.displayName.localeCompare(right.displayName);
  });
}

function strategyMatchesAsset(strategy: HyperliquidStrategyCatalogRow, assetSymbol: string): boolean {
  const normalizedAsset = assetSymbol.toUpperCase();
  const strategySymbol = strategy.symbol?.toUpperCase();
  if (strategySymbol) {
    return strategySymbol === normalizedAsset;
  }

  const token = normalizedAsset.toLowerCase();
  return strategy.strategyId.toLowerCase().startsWith(`${token}_`)
    || strategy.displayName.toLowerCase().startsWith(`${token} `);
}

function uniqueStrategyIds(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function StrategyInspectorPanel() {
  const { activeWorkspace, updateWorkspace } = useWorkspaceContext();
  const {
    terminals,
    setActiveTerminal,
    updateStrategySessionReview
  } = useTerminalContext();
  const {
    tasks,
    runs,
    missionDrafts,
    updateTaskReview
  } = useCommanderTasksContext();
  const assetSymbol = activeWorkspace?.asset_symbol || activeWorkspace?.strategy_symbol || 'BTC';
  const [mode, setMode] = useState<InspectorMode>('overview');
  const [catalog, setCatalog] = useState<HyperliquidStrategyCatalogRow[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState(activeWorkspace?.active_strategy_id || activeWorkspace?.strategy_id || '');
  const [artifactId, setArtifactId] = useState('latest');
  const [interval, setInterval] = useState('1d');
  const [pineInterval, setPineInterval] = useState('1h');
  const [lab, setLab] = useState<HyperliquidStrategyLabResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [labLoading, setLabLoading] = useState(false);
  const [action, setAction] = useState<GatedAction | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [factoryOpen, setFactoryOpen] = useState(false);
  const [factoryFocus, setFactoryFocus] = useState<StrategyFactoryFocus>('auto');
  const [error, setError] = useState<string | null>(null);

  const sortedStrategies = useMemo(
    () => sortStrategies(catalog.filter((strategy) => strategyMatchesAsset(strategy, assetSymbol))),
    [assetSymbol, catalog]
  );
  const selectedStrategy = useMemo(
    () => sortedStrategies.find((strategy) => strategy.strategyId === selectedStrategyId) || null,
    [selectedStrategyId, sortedStrategies]
  );
  const pineSymbol = useMemo(
    () => selectedStrategy?.symbol || assetSymbol,
    [assetSymbol, selectedStrategy?.symbol]
  );
  const benchmarkBoard = useMemo(
    () => buildStrategyFactoryBenchmarkBoard(sortedStrategies, 5),
    [sortedStrategies]
  );
  const draftSessions = useMemo(
    () => activeWorkspace
      ? buildDraftStrategySessionReviews({
          workspaceId: activeWorkspace.id,
          assetSymbol,
          terminals,
          runs,
          drafts: missionDrafts,
          tasks
        })
      : [],
    [activeWorkspace, assetSymbol, missionDrafts, runs, tasks, terminals]
  );

  const refreshCatalog = React.useCallback(async () => {
    setCatalogLoading(true);
    setError(null);
    try {
      const response = await hyperliquidService.getStrategyCatalog(500);
      setCatalog(response.strategies);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Strategy catalog failed.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const refreshLab = React.useCallback(async () => {
    if (!selectedStrategyId) {
      setLab(null);
      return;
    }
    setLabLoading(true);
    setError(null);
    try {
      const response = await hyperliquidService.getStrategyLab(selectedStrategyId, {
        artifactId,
        interval
      });
      setLab(response);
    } catch (err) {
      setLab(null);
      setError(err instanceof Error ? err.message : 'Strategy lab payload failed.');
    } finally {
      setLabLoading(false);
    }
  }, [artifactId, interval, selectedStrategyId]);

  useEffect(() => {
    setSelectedStrategyId(activeWorkspace?.active_strategy_id || activeWorkspace?.strategy_id || '');
    setArtifactId('latest');
    setActionResult(null);
  }, [activeWorkspace?.active_strategy_id, activeWorkspace?.id, activeWorkspace?.strategy_id]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    void refreshLab();
  }, [refreshLab]);

  const updatePodStrategy = React.useCallback(async (strategy: HyperliquidStrategyCatalogRow | null) => {
    if (!activeWorkspace || activeWorkspace.kind !== 'strategy-pod' || !strategy) {
      return;
    }
    await updateWorkspace(activeWorkspace.id, {
      active_strategy_id: strategy.strategyId,
      linked_strategy_ids: uniqueStrategyIds([
        ...(activeWorkspace.linked_strategy_ids || []),
        strategy.strategyId
      ]),
      strategy_id: strategy.strategyId,
      strategy_display_name: strategy.displayName,
      strategy_symbol: strategy.symbol || assetSymbol,
      strategy_pod_status: 'catalog',
      strategy_backend_dir: inferStrategyBackendDir(activeWorkspace.path, strategy.strategyId),
      strategy_docs_path: inferStrategyDocsPath(activeWorkspace.path, strategy)
    });
  }, [activeWorkspace, assetSymbol, updateWorkspace]);

  const handleStrategyChange = React.useCallback((strategyId: string) => {
    setSelectedStrategyId(strategyId);
    setArtifactId('latest');
    setActionResult(null);
    const nextStrategy = sortedStrategies.find((strategy) => strategy.strategyId === strategyId) || null;
    void updatePodStrategy(nextStrategy).catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not link strategy to pod.');
    });
  }, [sortedStrategies, updatePodStrategy]);

  const runGatedAction = React.useCallback(async (nextAction: GatedAction) => {
    if (!selectedStrategy) return;
    setAction(nextAction);
    setActionResult(null);
    setError(null);
    try {
      if (nextAction === 'backtest') {
        const result = await hyperliquidService.runBacktest(selectedStrategy.strategyId, SAFE_BACKTEST_OPTIONS);
        setActionResult(`Backtest: ${formatPct(result.summary.return_pct)} return, ${result.summary.total_trades} trades.`);
      } else if (nextAction === 'validation') {
        const result = await hyperliquidService.runValidation(
          selectedStrategy.strategyId,
          lab?.artifact.reportPath || selectedStrategy.latestArtifactPaths.backtest || undefined
        );
        setActionResult(`Validation: ${String(result.validation?.status || 'artifact written')}.`);
      } else {
        const result = await hyperliquidService.buildPaperCandidate(selectedStrategy.strategyId);
        setActionResult(`Paper candidate: ${result.paperPath}.`);
      }
      await refreshCatalog();
      await refreshLab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backend action failed.');
    } finally {
      setAction(null);
    }
  }, [lab?.artifact.reportPath, refreshCatalog, refreshLab, selectedStrategy]);

  const openDockMode = React.useCallback((dockMode: 'code' | 'browser' | 'runs') => {
    if (activeWorkspace) {
      publishWorkspaceDockMode(dockMode, activeWorkspace.id);
    }
  }, [activeWorkspace]);

  const attachDraftTerminal = React.useCallback((terminalId: string) => {
    if (!terminalId) {
      return;
    }
    setActiveTerminal(terminalId);
    openDockMode('code');
  }, [openDockMode, setActiveTerminal]);

  const saveDraftSessionReview = React.useCallback((session: DraftStrategySessionReview, review: MissionReview) => {
    if (session.reviewTaskId) {
      updateTaskReview(session.reviewTaskId, review);
      return;
    }
    updateStrategySessionReview(session.sessionId, review);
  }, [updateStrategySessionReview, updateTaskReview]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--app-text)]">
      <div className="shrink-0 border-b border-[var(--app-border)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">Strategy Inspector</div>
            <div className="truncate text-sm font-black text-white">
              {activeWorkspace?.strategy_display_name || selectedStrategy?.displayName || activeWorkspace?.name || 'No pod selected'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refreshCatalog()}
            disabled={catalogLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50"
            title="Refresh strategy catalog"
            aria-label="Refresh strategy catalog"
          >
            <RefreshCw size={14} className={catalogLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="mt-3 grid gap-2">
          <select
            value={selectedStrategyId}
            onChange={(event) => handleStrategyChange(event.target.value)}
            className="h-9 rounded-md border border-white/10 bg-black/30 px-2 text-xs font-semibold text-white outline-none"
            aria-label="Linked strategy"
          >
            <option value="">No linked strategy</option>
            {sortedStrategies.map((strategy) => (
              <option key={strategy.strategyId} value={strategy.strategyId}>
                {strategy.displayName} / {strategy.gateStatus}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-3 gap-1">
            <ModeButton icon={<TrendingUp size={13} />} label="Review" selected={mode === 'overview'} onClick={() => setMode('overview')} />
            <ModeButton icon={<FlaskConical size={13} />} label="Create" selected={mode === 'create'} onClick={() => setMode('create')} />
            <ModeButton icon={<CandlestickChart size={13} />} label="Pine" selected={mode === 'indicator'} onClick={() => setMode('indicator')} />
          </div>

          {mode === 'overview' ? (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={artifactId}
                onChange={(event) => setArtifactId(event.target.value)}
                className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-[11px] font-semibold text-white outline-none"
                disabled={!lab?.artifacts.length}
                aria-label="Artifact"
              >
                <option value="latest">latest</option>
                {lab?.artifacts.map((artifact) => (
                  <option key={artifact.artifactId} value={artifact.artifactId}>
                    {formatDate(artifact.generatedAt)}
                  </option>
                ))}
              </select>
              <select
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-[11px] font-semibold text-white outline-none"
                aria-label="Chart interval"
              >
                {intervals.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      <div className={`min-h-0 flex-1 ${mode === 'indicator' ? 'overflow-hidden p-2' : 'overflow-auto p-3'}`}>
        {error ? (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {mode === 'indicator' ? (
          <div className="h-full min-h-0">
            <BtcPineLabPanel
              interval={pineInterval}
              mode="pinned"
              surface="dock"
              symbol={pineSymbol}
              onClose={() => setMode('overview')}
              onIntervalChange={setPineInterval}
              onUnpin={() => openDockMode('browser')}
            />
          </div>
        ) : mode === 'create' ? (
          <CreateStrategyInspector
            strategies={sortedStrategies}
            benchmarkBoard={benchmarkBoard}
            focus={factoryFocus}
            setFocus={setFactoryFocus}
            onOpenFactory={() => setFactoryOpen(true)}
            onOpenChat={() => openDockMode('code')}
          />
        ) : (
          <div className="grid gap-3">
            {draftSessions.length > 0 ? (
              <DraftStrategySessionReviewPanel
                sessions={draftSessions}
                onAttachTerminal={attachDraftTerminal}
                onOpenRuns={() => openDockMode('runs')}
                onSaveReview={saveDraftSessionReview}
              />
            ) : null}
            {!selectedStrategy ? (
              <UnlinkedPodState
                strategies={sortedStrategies.slice(0, 6)}
                onSelect={handleStrategyChange}
                onCreate={() => setMode('create')}
                onOpenChat={() => openDockMode('code')}
              />
            ) : (
              <StrategyReviewInspector
                strategy={selectedStrategy}
                lab={lab}
                loading={labLoading}
                action={action}
                actionResult={actionResult}
                onRunAction={runGatedAction}
                onOpenCli={() => openDockMode('code')}
                onOpenRuns={() => openDockMode('runs')}
              />
            )}
          </div>
        )}
      </div>

      <StrategyFactoryModal
        open={factoryOpen}
        strategies={sortedStrategies}
        assetSymbol={assetSymbol}
        onClose={() => setFactoryOpen(false)}
      />
    </section>
  );
}

function ModeButton({
  icon,
  label,
  selected,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[11px] font-black transition ${
        selected
          ? 'border-cyan-300/35 bg-cyan-400/14 text-cyan-50'
          : 'border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.07]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function UnlinkedPodState({
  strategies,
  onSelect,
  onCreate,
  onOpenChat
}: {
  strategies: HyperliquidStrategyCatalogRow[];
  onSelect: (strategyId: string) => void;
  onCreate: () => void;
  onOpenChat: () => void;
}) {
  return (
    <div className="grid gap-3">
      <EmptyState
        title="Pod has no linked strategy"
        copy="Link an existing catalog strategy, create a draft strategy, or use the agentic center to design the thesis first."
      />
      <button type="button" onClick={onCreate} className={primaryButtonClass}>
        <Sparkles size={14} />
        Create with Strategy Factory
      </button>
      <button type="button" onClick={onOpenChat} className={secondaryButtonClass}>
        <Terminal size={14} />
        Open Agent CLI
      </button>
      {strategies.length ? (
        <section className="rounded-md border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">From Catalog</div>
          <div className="mt-2 grid gap-2">
            {strategies.map((strategy) => (
              <button
                key={strategy.strategyId}
                type="button"
                onClick={() => onSelect(strategy.strategyId)}
                className="rounded-md border border-white/10 bg-black/20 p-2 text-left transition hover:bg-white/[0.06]"
              >
                <div className="truncate text-xs font-bold text-white">{strategy.displayName}</div>
                <div className="mt-1 truncate text-[11px] text-slate-500">{strategy.gateStatus} / {strategy.pipelineStage}</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

const reviewDecisionOptions: MissionDecision[] = [
  'pending',
  'ready-for-build',
  'ready-for-backtest',
  'ready-for-paper',
  'needs-more-data',
  'reject'
];
const reviewConfidenceOptions: MissionReviewConfidence[] = ['medium', 'high', 'low'];

function providerList(session: DraftStrategySessionReview): string {
  return session.providers.length ? session.providers.join(', ') : 'runtime';
}

function formatSessionAge(timestamp: number): string {
  if (!timestamp) return 'no activity';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function reviewDecisionLabel(value: MissionDecision): string {
  return value.replace(/-/g, ' ');
}

function DraftStrategySessionReviewPanel({
  sessions,
  onAttachTerminal,
  onOpenRuns,
  onSaveReview
}: {
  sessions: DraftStrategySessionReview[];
  onAttachTerminal: (terminalId: string) => void;
  onOpenRuns: () => void;
  onSaveReview: (session: DraftStrategySessionReview, review: MissionReview) => void;
}) {
  const [selectedSessionId, setSelectedSessionId] = React.useState(sessions[0]?.sessionId ?? '');
  const selectedSession = sessions.find((session) => session.sessionId === selectedSessionId) || sessions[0];
  const [decision, setDecision] = React.useState<MissionDecision>('pending');
  const [confidence, setConfidence] = React.useState<MissionReviewConfidence>('medium');
  const [summary, setSummary] = React.useState('');
  const [nextAction, setNextAction] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!sessions.length) {
      setSelectedSessionId('');
      return;
    }
    setSelectedSessionId((current) => (
      current && sessions.some((session) => session.sessionId === current)
        ? current
        : sessions[0].sessionId
    ));
  }, [sessions]);

  React.useEffect(() => {
    const review = selectedSession?.review;
    setDecision(review?.decision ?? 'pending');
    setConfidence(review?.confidence ?? 'medium');
    setSummary(review?.summary ?? '');
    setNextAction(review?.nextAction ?? '');
    setNotice(null);
  }, [selectedSession?.review, selectedSession?.sessionId]);

  if (!selectedSession) {
    return null;
  }

  const latestTerminal = selectedSession.terminals[0];
  const reviewedAt = selectedSession.review?.updatedAt ? formatDate(selectedSession.review.updatedAt) : null;

  const saveReview = () => {
    const review: MissionReview = {
      decision,
      confidence,
      summary: summary.trim(),
      nextAction: nextAction.trim(),
      updatedAt: Date.now()
    };
    onSaveReview(selectedSession, review);
    setNotice(selectedSession.reviewTaskId ? 'Session review saved to task.' : 'Session review saved locally.');
  };

  return (
    <section className="rounded-md border border-cyan-300/20 bg-cyan-400/[0.07] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-cyan-200">Draft Session Review</div>
          <div className="mt-1 truncate text-sm font-black text-white">{selectedSession.title}</div>
          <div className="mt-1 text-[11px] text-cyan-100/60">
            {selectedSession.assetSymbol} / {providerList(selectedSession)} / {selectedSession.statusLabel} / {formatSessionAge(selectedSession.updatedAt)}
          </div>
        </div>
        <span className={`rounded border px-2 py-1 text-[10px] font-black uppercase ${
          selectedSession.status === 'failed'
            ? 'border-red-300/25 bg-red-400/10 text-red-100'
            : selectedSession.status === 'needs-input'
              ? 'border-amber-300/25 bg-amber-400/10 text-amber-100'
              : selectedSession.status === 'completed'
                ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
                : 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100'
        }`}>
          {selectedSession.statusLabel}
        </span>
      </div>

      {sessions.length > 1 ? (
        <select
          value={selectedSession.sessionId}
          onChange={(event) => setSelectedSessionId(event.target.value)}
          className="mt-3 h-8 w-full rounded-md border border-white/10 bg-black/30 px-2 text-[11px] font-semibold text-white outline-none"
          aria-label="Draft strategy session"
        >
          {sessions.map((session) => (
            <option key={session.sessionId} value={session.sessionId}>
              {session.title} / {session.statusLabel}
            </option>
          ))}
        </select>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <MetricTile label="Terminals" value={formatNumber(selectedSession.terminalIds.length, 0)} />
        <MetricTile label="Runs" value={formatNumber(selectedSession.runIds.length, 0)} />
        <MetricTile label="Drafts" value={formatNumber(selectedSession.draftIds.length, 0)} />
        <MetricTile label="Review" value={selectedSession.review ? reviewDecisionLabel(selectedSession.review.decision) : 'pending'} />
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Latest Session Output</div>
        <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-slate-300">
          {selectedSession.latestExcerpt || 'No captured output yet.'}
        </pre>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Decision
            <select
              value={decision}
              onChange={(event) => setDecision(event.target.value as MissionDecision)}
              className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs font-semibold normal-case tracking-normal text-white outline-none"
            >
              {reviewDecisionOptions.map((option) => (
                <option key={option} value={option}>{reviewDecisionLabel(option)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Confidence
            <select
              value={confidence}
              onChange={(event) => setConfidence(event.target.value as MissionReviewConfidence)}
              className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs font-semibold normal-case tracking-normal text-white outline-none"
            >
              {reviewConfidenceOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Audit summary for this draft session"
          rows={3}
          className="min-h-[78px] rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs leading-5 text-white outline-none placeholder:text-slate-600"
        />
        <textarea
          value={nextAction}
          onChange={(event) => setNextAction(event.target.value)}
          placeholder="Next validation or implementation action"
          rows={2}
          className="min-h-[58px] rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs leading-5 text-white outline-none placeholder:text-slate-600"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={saveReview} className={primaryButtonClass}>
          <CheckCircle2 size={14} />
          Save Session Review
        </button>
        {latestTerminal ? (
          <button type="button" onClick={() => onAttachTerminal(latestTerminal.id)} className={secondaryButtonClass}>
            <Terminal size={14} />
            Attach
          </button>
        ) : null}
        <button type="button" onClick={onOpenRuns} className={secondaryButtonClass}>
          <History size={14} />
          Runs
        </button>
      </div>

      <div className="mt-2 text-[11px] text-cyan-100/55">
        {selectedSession.reviewTaskId ? `Task-backed review${reviewedAt ? ` / ${reviewedAt}` : ''}` : `Local terminal review${reviewedAt ? ` / ${reviewedAt}` : ''}`}.
        {notice ? ` ${notice}` : ''}
      </div>
    </section>
  );
}

function CreateStrategyInspector({
  strategies,
  benchmarkBoard,
  focus,
  setFocus,
  onOpenFactory,
  onOpenChat
}: {
  strategies: HyperliquidStrategyCatalogRow[];
  benchmarkBoard: string[];
  focus: StrategyFactoryFocus;
  setFocus: (focus: StrategyFactoryFocus) => void;
  onOpenFactory: () => void;
  onOpenChat: () => void;
}) {
  const focusOptions: StrategyFactoryFocus[] = ['auto', 'scalper', 'swing'];
  return (
    <div className="grid gap-3">
      <section className="rounded-md border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-300">
          <Sparkles size={14} />
          Strategy Factory
        </div>
        <div className="mt-1 text-sm font-black text-white">Draft backend-first candidates</div>
        <div className="mt-3 grid gap-2">
          {focusOptions.map((option) => {
            const selected = option === focus;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setFocus(option)}
                className={`rounded-md border p-2 text-left transition ${
                  selected
                    ? 'border-cyan-300/35 bg-cyan-400/14 text-cyan-50'
                    : 'border-white/10 bg-black/20 text-slate-300 hover:bg-white/[0.06]'
                }`}
              >
                <span className="text-xs font-black">{getStrategyFactoryFocusLabel(option)}</span>
                <span className="mt-1 block text-[11px] leading-5 text-slate-400">
                  {option === 'auto' ? 'Evidence-led idea selection' : option === 'scalper' ? 'Short-horizon edge search' : 'Multi-session edge search'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <MetricTile label="Strategies" value={formatNumber(strategies.length, 0)} />
        <MetricTile label="Backtest" value={formatNumber(strategies.filter((strategy) => strategy.canBacktest).length, 0)} />
        <MetricTile label="Paper" value={formatNumber(strategies.filter((strategy) => strategy.gateStatus === 'ready-for-paper' || strategy.gateStatus === 'paper-active').length, 0)} />
      </div>

      <button type="button" onClick={onOpenFactory} className={primaryButtonClass}>
        <Rocket size={14} />
        Draft Mission
      </button>
      <button type="button" onClick={onOpenChat} className={secondaryButtonClass}>
        <Terminal size={14} />
        Open Agent CLI
      </button>

      <section className="rounded-md border border-white/10 bg-black/20 p-3">
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Benchmark Board</div>
        <div className="mt-2 grid gap-2">
          {benchmarkBoard.length ? benchmarkBoard.map((line) => (
            <div key={line} className="rounded-md border border-white/10 bg-white/[0.03] p-2 font-mono text-[10px] leading-5 text-slate-300">
              {line}
            </div>
          )) : (
            <EmptyState title="No benchmark rows" copy="Strategy Factory can still work from docs and backend artifacts." />
          )}
        </div>
      </section>
    </div>
  );
}

function StrategyReviewInspector({
  strategy,
  lab,
  loading,
  action,
  actionResult,
  onRunAction,
  onOpenCli,
  onOpenRuns
}: {
  strategy: HyperliquidStrategyCatalogRow;
  lab: HyperliquidStrategyLabResponse | null;
  loading: boolean;
  action: GatedAction | null;
  actionResult: string | null;
  onRunAction: (action: GatedAction) => void;
  onOpenCli: () => void;
  onOpenRuns: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <MetricTile label="Return" value={formatPct(getSummaryMetric(lab?.summary ?? null, 'return_pct'))} />
        <MetricTile label="Net PnL" value={formatCurrency(getSummaryMetric(lab?.summary ?? null, 'net_profit'))} />
        <MetricTile label="Trades" value={formatNumber(getSummaryMetric(lab?.summary ?? null, 'total_trades'), 0)} />
        <MetricTile label="Win Rate" value={formatPct(getSummaryMetric(lab?.summary ?? null, 'win_rate_pct') ?? strategy.winRate)} />
        <MetricTile label="Max DD" value={formatPct(getSummaryMetric(lab?.summary ?? null, 'max_drawdown_pct'))} />
        <MetricTile label="Gate" value={strategy.gateStatus.replace(/-/g, ' ')} />
      </div>

      <section className="overflow-hidden rounded-md border border-white/10 bg-[#071018]">
        <div className="flex h-10 items-center justify-between border-b border-white/10 px-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-black text-white">{strategy.displayName}</div>
            <div className="truncate text-[11px] text-slate-500">{lab?.artifact.selectedArtifactId || 'latest artifact'}</div>
          </div>
          {loading ? <Loader2 size={14} className="animate-spin text-cyan-300" /> : null}
        </div>
        <StrategyChart lab={lab} />
      </section>

      <section className="rounded-md border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-cyan-300">Next Gate</div>
            <div className="mt-1 text-sm font-bold text-white">{lab?.nextAction.label || strategy.nextAction.label}</div>
            <div className="mt-1 break-words font-mono text-[10px] leading-5 text-slate-500">
              {lab?.nextAction.command || strategy.nextAction.command}
            </div>
          </div>
          <span className={`shrink-0 rounded border px-2 py-1 text-[10px] font-black ${
            strategy.nextAction.enabled
              ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
              : 'border-amber-300/25 bg-amber-400/10 text-amber-100'
          }`}>
            {strategy.nextAction.enabled ? 'enabled' : 'blocked'}
          </span>
        </div>
        <div className="mt-3 grid gap-2">
          <button type="button" onClick={() => onRunAction('backtest')} disabled={Boolean(action) || !strategy.canBacktest} className={secondaryButtonClass}>
            {action === 'backtest' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Run Backtest
          </button>
          <button type="button" onClick={() => onRunAction('validation')} disabled={Boolean(action) || !lab?.artifact.reportPath} className={secondaryButtonClass}>
            {action === 'validation' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Run Validation
          </button>
          <button type="button" onClick={() => onRunAction('paper')} disabled={Boolean(action) || strategy.gateStatus !== 'ready-for-paper'} className={secondaryButtonClass}>
            {action === 'paper' ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            Build Paper Candidate
          </button>
        </div>
        {actionResult ? (
          <div className="mt-3 rounded-md border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs leading-5 text-emerald-100">
            {actionResult}
          </div>
        ) : null}
      </section>

      <EquityCurvePanel lab={lab} />
      <EvidenceTimeline lab={lab} />
      <LearningAgentList lab={lab} />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onOpenCli} className={secondaryButtonClass}>
          <Terminal size={14} />
          Agent CLI
        </button>
        <button type="button" onClick={onOpenRuns} className={secondaryButtonClass}>
          <History size={14} />
          Runs
        </button>
      </div>
    </div>
  );
}

function StrategyChart({ lab }: { lab: HyperliquidStrategyLabResponse | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#071018' },
        textColor: '#94a3b8'
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' }
      },
      rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.18)' },
      timeScale: { borderColor: 'rgba(148, 163, 184, 0.18)' },
      crosshair: { mode: 1 }
    });
    chartRef.current = chart;

    if (lab?.chart.available && lab.chart.candles.length) {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444'
      });
      candleSeries.setData(
        lab.chart.candles.map((candle) => ({
          time: Math.floor(candle.time / 1000) as UTCTimestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close
        }))
      );
      createSeriesMarkers(
        candleSeries,
        lab.chart.markers.map((marker): SeriesMarker<UTCTimestamp> => ({
          time: Math.floor(marker.time / 1000) as UTCTimestamp,
          position: marker.position,
          color: marker.color,
          shape: marker.shape,
          text: marker.text
        }))
      );
      chart.timeScale().fitContent();
    }

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [lab]);

  if (!lab?.chart.available) {
    return (
      <div className="grid min-h-[240px] place-items-center p-4">
        <EmptyState
          title="Chart unavailable"
          copy={lab?.chart.reason || 'No compatible backend-side candle dataset was attached to the selected artifact.'}
        />
      </div>
    );
  }

  return <div ref={containerRef} className="h-[260px] min-h-0 w-full" />;
}

function EquityCurvePanel({ lab }: { lab: HyperliquidStrategyLabResponse | null }) {
  const points = (lab?.equityCurve || []).slice(-60);
  const values = points
    .map((point) => Number(point.equity ?? point.value ?? point.balance))
    .filter((value) => Number.isFinite(value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const path = values.length > 1
    ? values.map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = max === min ? 50 : 92 - ((value - min) / (max - min)) * 76;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ')
    : '';

  return (
    <section className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Equity Curve</div>
        <BarChart3 size={14} className="text-slate-500" />
      </div>
      {path ? (
        <svg viewBox="0 0 100 100" className="mt-2 h-28 w-full overflow-visible">
          <path d={path} fill="none" stroke="#22d3ee" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : (
        <div className="mt-3">
          <EmptyState title="No equity curve" copy="Selected artifact has no equity curve payload." />
        </div>
      )}
    </section>
  );
}

function EvidenceTimeline({ lab }: { lab: HyperliquidStrategyLabResponse | null }) {
  const items = lab?.timeline?.slice(0, 8) || [];
  return (
    <section className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Evidence Timeline</div>
        <History size={14} className="text-slate-500" />
      </div>
      <div className="mt-2 grid gap-2">
        {items.length ? items.map((item) => (
          <div key={item.id} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
            <div className="truncate text-xs font-bold text-white">{item.title}</div>
            <div className="mt-1 truncate text-[11px] text-slate-500">{item.source} / {item.status || item.type}</div>
            <div className="mt-1 text-[11px] text-slate-400">{formatDate(item.timestampMs)}</div>
            {item.pnlUsd !== undefined && item.pnlUsd !== null ? (
              <div className="mt-1 text-[11px] text-slate-300">PnL {formatCurrency(item.pnlUsd)}</div>
            ) : null}
          </div>
        )) : (
          <EmptyState title="No timeline yet" copy="Backtest, validation, paper, and runtime artifacts will appear after backend runs." />
        )}
      </div>
    </section>
  );
}

function LearningAgentList({ lab }: { lab: HyperliquidStrategyLabResponse | null }) {
  const learning = lab?.learning || [];
  const runs = lab?.agentRuns || [];
  if (!learning.length && !runs.length) {
    return (
      <section className="rounded-md border border-white/10 bg-black/20 p-3">
        <EmptyState title="No learning events" copy="Agent research and curated lessons will appear after missions run." />
      </section>
    );
  }

  return (
    <section className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Learning & Agents</div>
        <Clock3 size={14} className="text-slate-500" />
      </div>
      <div className="mt-2 grid gap-2">
        {learning.slice(0, 4).map((event) => (
          <div key={event.eventId} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
            <div className="text-xs font-bold text-white">{event.title}</div>
            <div className="mt-1 text-[11px] leading-5 text-slate-400">{event.kind} / {event.outcome}</div>
            {event.nextAction ? <div className="mt-1 text-[11px] leading-5 text-slate-300">{event.nextAction}</div> : null}
          </div>
        ))}
        {runs.slice(0, 4).map((run) => (
          <div key={run.run_id} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
            <div className="text-xs font-bold text-white">{run.mode} / {run.recommendation}</div>
            <div className="mt-1 text-[11px] leading-5 text-slate-400">
              confidence {formatPct(run.confidence * 100)} / blockers {run.blocker_count}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-[64px] rounded-md border border-white/10 bg-white/[0.035] p-2">
      <div className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-2 truncate text-sm font-black tracking-[0] text-white">{value}</div>
    </div>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/10 bg-white/[0.025] p-4 text-center">
      <div className="text-sm font-black text-white">{title}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{copy}</div>
    </div>
  );
}

const primaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-cyan-300/35 bg-cyan-400/15 px-3 text-xs font-black text-cyan-50 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50';
