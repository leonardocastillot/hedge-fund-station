import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FlaskConical,
  Play,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import {
  hyperliquidService,
  type HyperliquidGateStatus,
  type HyperliquidPipelineStage,
  type HyperliquidStrategyCatalogRow
} from '@/services/hyperliquidService';

type StrategyPipelineColumn = {
  stage: HyperliquidPipelineStage;
  title: string;
  detail: string;
  icon: typeof FileText;
};

const PIPELINE_COLUMNS: StrategyPipelineColumn[] = [
  { stage: 'research', title: 'Research', detail: 'Docs, specs, and backend packages before evidence.', icon: FileText },
  { stage: 'backtesting', title: 'Backtesting', detail: 'Registered strategies waiting for deterministic tests.', icon: FlaskConical },
  { stage: 'audit', title: 'Audit', detail: 'Only robust backtest passes after costs enter here.', icon: ShieldCheck },
  { stage: 'paper', title: 'Paper', detail: 'Ready candidates and paper runtime evidence.', icon: ClipboardCheck },
  { stage: 'blocked', title: 'Blocked', detail: 'Failed gates and missing evidence stay visible.', icon: AlertTriangle }
];

function detailPath(strategy: HyperliquidStrategyCatalogRow): string {
  return `/strategy/${encodeURIComponent(strategy.strategyId)}/${encodeURIComponent(strategy.pipelineStage)}`;
}

function formatPercent(value: unknown): string {
  const numeric = Number(value ?? 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

function formatNumber(value: unknown, digits = 2): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : '0.00';
}

function stageTone(stage: HyperliquidPipelineStage): string {
  if (stage === 'paper') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
  if (stage === 'audit') return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
  if (stage === 'backtesting') return 'border-blue-400/30 bg-blue-500/10 text-blue-100';
  if (stage === 'blocked') return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
  return 'border-white/10 bg-white/[0.04] text-white/70';
}

function gateTone(status: HyperliquidGateStatus): string {
  if (status === 'paper-active' || status === 'ready-for-paper') return 'text-emerald-200';
  if (status === 'audit-eligible' || status === 'backtest-running-eligible') return 'text-cyan-200';
  if (status === 'audit-blocked') return 'text-amber-200';
  return 'text-white/60';
}

function actionLabel(strategy: HyperliquidStrategyCatalogRow): string {
  if (strategy.gateStatus === 'ready-for-paper') {
    return strategy.latestArtifactPaths.paper ? 'Review Paper Candidate' : 'Create Paper Candidate';
  }
  if (strategy.gateStatus === 'paper-active') return 'Review Paper Lab';
  return strategy.nextAction?.label || 'Review Evidence';
}

export default function StrategyLibraryPage() {
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState<HyperliquidStrategyCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStrategies = async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      setError(null);
      const response = await hyperliquidService.getStrategyCatalog(500);
      setStrategies(response.strategies);
      setWarning(response.catalogWarning ?? null);
    } catch (err) {
      setWarning(null);
      setError(err instanceof Error ? err.message : 'Failed to load strategy pipeline.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadStrategies(true);
  }, []);

  const grouped = useMemo(() => {
    return PIPELINE_COLUMNS.reduce<Record<HyperliquidPipelineStage, HyperliquidStrategyCatalogRow[]>>((acc, column) => {
      acc[column.stage] = strategies.filter((strategy) => strategy.pipelineStage === column.stage);
      return acc;
    }, {
      research: [],
      backtesting: [],
      audit: [],
      paper: [],
      blocked: []
    });
  }, [strategies]);

  const summary = useMemo(() => {
    const auditEligible = strategies.filter((strategy) => strategy.gateStatus === 'audit-eligible').length;
    const readyForPaper = strategies.filter((strategy) => strategy.gateStatus === 'ready-for-paper' || strategy.gateStatus === 'paper-active').length;
    const blocked = strategies.filter((strategy) => strategy.pipelineStage === 'blocked').length;
    const backendOnly = strategies.filter((strategy) => !strategy.strategyId.startsWith('runtime:')).length;
    return { auditEligible, readyForPaper, blocked, backendOnly };
  }, [strategies]);

  const runStrategyAction = async (strategy: HyperliquidStrategyCatalogRow) => {
    const actionKey = `${strategy.strategyId}:${strategy.gateStatus}`;
    setRunningAction(actionKey);
    setMessage(null);
    setError(null);
    try {
      if (strategy.gateStatus === 'backtest-running-eligible') {
        const result = await hyperliquidService.runBacktest(strategy.strategyId, false);
        setMessage(`Backtest complete for ${strategy.displayName}: ${result.summary.total_trades} trades, validation ${result.validation?.status ?? 'not run'}.`);
        await loadStrategies(false);
        return;
      }

      if (strategy.gateStatus === 'audit-eligible') {
        const result = await hyperliquidService.runAgentAudit({ strategy_id: strategy.strategyId, runtime: 'auto' });
        setMessage(`Audit complete for ${strategy.displayName}: ${result.recommendation}, ${result.blockerCount} blockers.`);
        await loadStrategies(false);
        return;
      }

      if (strategy.gateStatus === 'ready-for-paper') {
        if (strategy.latestArtifactPaths.paper) {
          navigate(detailPath(strategy));
          return;
        }
        const result = await hyperliquidService.buildPaperCandidate(strategy.strategyId);
        setMessage(`Paper candidate created for ${strategy.displayName}: ${result.paperPath}`);
        await loadStrategies(false);
        return;
      }

      if (strategy.gateStatus === 'paper-active') {
        navigate('/paper');
        return;
      }

      if (strategy.gateStatus === 'audit-blocked' && strategy.nextAction.enabled) {
        if (strategy.nextAction.targetStage === 'audit') {
          const result = await hyperliquidService.runValidation(strategy.strategyId, strategy.latestArtifactPaths.backtest ?? undefined);
          const validationStatus = typeof result.validation.status === 'string' ? result.validation.status : 'recorded';
          setMessage(`Validation re-run complete for ${strategy.displayName}: ${validationStatus}.`);
          await loadStrategies(false);
          return;
        }
        const result = await hyperliquidService.runBacktest(strategy.strategyId, false);
        setMessage(`Gate re-run complete for ${strategy.displayName}: ${result.summary.total_trades} trades, validation ${result.validation?.status ?? 'not run'}.`);
        await loadStrategies(false);
        return;
      }

      navigate(detailPath(strategy));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Strategy action failed.');
    } finally {
      setRunningAction(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-7xl items-center justify-center px-4 py-8">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-6">
      <section className="border-b border-white/10 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">Strategy Pipeline</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Research to Backtesting to Audit to Paper</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Backend evidence is the source of truth. Audit only opens after a robust backtest passes costs; blocked strategies keep their exact gate reasons.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/strategy-audit"
              className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-500/15 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/25"
            >
              <ShieldCheck className="h-4 w-4" />
              Audit Focus
            </Link>
            <button
              type="button"
              onClick={() => void loadStrategies(false)}
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.09]"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>

        {message ? <div className="mt-4 rounded-md border border-cyan-400/25 bg-cyan-500/10 p-3 text-sm text-cyan-50">{message}</div> : null}
        {warning ? <div className="mt-4 rounded-md border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">{warning}</div> : null}
        {error ? <div className="mt-4 rounded-md border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <SummaryMetric label="Backend Strategies" value={String(summary.backendOnly)} detail="catalog evidence only" />
        <SummaryMetric label="Audit Eligible" value={String(summary.auditEligible)} detail="robust backtest passed" tone="text-cyan-200" />
        <SummaryMetric label="Paper Gate" value={String(summary.readyForPaper)} detail="ready or active" tone="text-emerald-200" />
        <SummaryMetric label="Blocked" value={String(summary.blocked)} detail="needs repair before audit" tone={summary.blocked > 0 ? 'text-amber-200' : 'text-emerald-200'} />
      </section>

      <section className="grid gap-3 xl:grid-cols-5">
        {PIPELINE_COLUMNS.map((column) => (
          <PipelineColumn
            key={column.stage}
            column={column}
            strategies={grouped[column.stage]}
            runningAction={runningAction}
            onOpen={(strategy) => navigate(detailPath(strategy))}
            onRun={(strategy) => void runStrategyAction(strategy)}
          />
        ))}
      </section>
    </div>
  );
}

function PipelineColumn({
  column,
  strategies,
  runningAction,
  onOpen,
  onRun
}: {
  column: StrategyPipelineColumn;
  strategies: HyperliquidStrategyCatalogRow[];
  runningAction: string | null;
  onOpen: (strategy: HyperliquidStrategyCatalogRow) => void;
  onRun: (strategy: HyperliquidStrategyCatalogRow) => void;
}) {
  const Icon = column.icon;
  return (
    <div className="min-h-[520px] rounded-md border border-white/10 bg-black/25">
      <div className="border-b border-white/10 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-cyan-200" />
            <div className="truncate text-sm font-semibold text-white">{column.title}</div>
          </div>
          <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${stageTone(column.stage)}`}>
            {strategies.length}
          </span>
        </div>
        <div className="mt-2 text-xs leading-5 text-white/50">{column.detail}</div>
      </div>

      <div className="grid max-h-[720px] gap-2 overflow-y-auto p-2">
        {strategies.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/45">
            No strategies in this gate.
          </div>
        ) : strategies.map((strategy) => (
          <StrategyPipelineCard
            key={strategy.strategyKey}
            strategy={strategy}
            running={runningAction === `${strategy.strategyId}:${strategy.gateStatus}`}
            onOpen={() => onOpen(strategy)}
            onRun={() => onRun(strategy)}
          />
        ))}
      </div>
    </div>
  );
}

function StrategyPipelineCard({
  strategy,
  running,
  onOpen,
  onRun
}: {
  strategy: HyperliquidStrategyCatalogRow;
  running: boolean;
  onOpen: () => void;
  onRun: () => void;
}) {
  const canRunAudit = strategy.gateStatus !== 'audit-eligible' || strategy.nextAction.enabled;
  const actionDisabled = running || !strategy.nextAction.enabled || !canRunAudit;
  const blockers = strategy.gateReasons.length ? strategy.gateReasons : strategy.missingAuditItems;
  const summary = strategy.latestBacktestSummary;

  return (
    <article className="rounded-md border border-white/10 bg-white/[0.035] p-3 transition hover:border-cyan-400/25 hover:bg-white/[0.055]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{strategy.displayName}</div>
            <div className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-white/35">
              {strategy.strategyId}
            </div>
          </div>
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-white/35" />
        </div>

        <div className={`mt-3 text-xs font-semibold uppercase tracking-[0.12em] ${gateTone(strategy.gateStatus)}`}>
          {strategy.gateStatus.replace(/-/g, ' ')}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <TinyMetric label="Trades" value={String(summary?.total_trades ?? strategy.tradeCount)} />
          <TinyMetric label="Return" value={formatPercent(summary?.return_pct)} />
          <TinyMetric label="PF" value={formatNumber(summary?.profit_factor)} />
        </div>
      </button>

      {blockers.length > 0 ? (
        <div className="mt-3 rounded-md border border-white/10 bg-black/25 p-2 text-xs text-white/60">
          {blockers.slice(0, 3).join(', ')}
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2">
        <div className="break-all font-mono text-[10px] leading-4 text-white/45">{strategy.nextAction.command}</div>
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={actionDisabled}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-500/12 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-500/22 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
      >
        {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : strategy.nextAction.enabled ? <Play className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {running ? 'Running' : actionLabel(strategy)}
      </button>
    </article>
  );
}

function SummaryMetric({ label, value, detail, tone = 'text-white' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 truncate text-sm text-white/50">{detail}</div>
    </div>
  );
}

function TinyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</div>
      <div className="mt-1 truncate text-xs font-semibold text-white">{value}</div>
    </div>
  );
}
