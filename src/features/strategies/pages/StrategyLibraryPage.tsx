import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutList, Library, PlusCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { StrategyFactoryModal } from '../components/StrategyFactoryModal';
import { StrategyInventory } from '../components/StrategyInventory';
import { StrategyPipelineBoard } from '../components/StrategyPipelineBoard';
import {
  groupActionableStrategies,
  sortInventoryStrategies,
  summarizeStrategyPipeline
} from '../strategyPipelineModel';
import {
  hyperliquidService,
  type HyperliquidStrategyCatalogRow
} from '@/services/hyperliquidService';

type StrategyLibraryView = 'pipeline' | 'inventory';

const summaryGridStyle = {
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))'
};

const SAFE_BACKTEST_OPTIONS = {
  lookbackDays: 3,
  runValidation: true,
  buildPaperCandidate: false
};

function detailPath(strategy: HyperliquidStrategyCatalogRow): string {
  return `/strategy/${encodeURIComponent(strategy.strategyId)}/${encodeURIComponent(strategy.pipelineStage)}`;
}

function formatDoublingDays(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'N/A';
  if (numeric < 1) return '<1d';
  if (numeric < 100) return `${numeric.toFixed(1)}d`;
  return `${Math.round(numeric)}d`;
}

export default function StrategyLibraryPage() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<StrategyLibraryView>('pipeline');
  const [strategies, setStrategies] = useState<HyperliquidStrategyCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [factoryOpen, setFactoryOpen] = useState(false);
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

  const grouped = useMemo(() => groupActionableStrategies(strategies), [strategies]);
  const inventory = useMemo(() => sortInventoryStrategies(strategies), [strategies]);
  const summary = useMemo(() => summarizeStrategyPipeline(strategies), [strategies]);

  const runStrategyAction = async (strategy: HyperliquidStrategyCatalogRow) => {
    const actionKey = `${strategy.strategyId}:${strategy.gateStatus}`;
    setRunningAction(actionKey);
    setMessage(null);
    setError(null);
    try {
      if (strategy.gateStatus === 'backtest-running-eligible') {
        const result = await hyperliquidService.runBacktest(strategy.strategyId, SAFE_BACKTEST_OPTIONS);
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
        const result = await hyperliquidService.runBacktest(strategy.strategyId, SAFE_BACKTEST_OPTIONS);
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
    <div className="mx-auto flex w-full min-w-0 max-w-[1480px] flex-col gap-4 px-4 py-5 sm:px-5">
      <section className="border-b border-white/10 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-[min(100%,44rem)]">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">Strategy Pipeline</div>
            <h1 className="mt-1 text-xl font-semibold leading-tight text-white sm:text-2xl">Actionable Research to Paper Flow</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              The default board shows only strategies with a real next step or evidence gate. Research-only and docs-only rows stay available in All Strategies.
            </p>
          </div>

          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={() => setFactoryOpen(true)}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-400/15 px-3 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/25 sm:flex-none"
            >
              <PlusCircle className="h-4 w-4" />
              Create Strategy
            </button>
            <Link
              to="/strategy-audit"
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-500/15 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/25 sm:flex-none"
            >
              <ShieldCheck className="h-4 w-4" />
              Audit Focus
            </Link>
            <button
              type="button"
              onClick={() => void loadStrategies(false)}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.09] sm:flex-none"
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

      <StrategyFactoryModal
        open={factoryOpen}
        strategies={strategies}
        onClose={() => setFactoryOpen(false)}
      />

      <section className="grid min-w-0 gap-3" style={summaryGridStyle}>
        <SummaryMetric label="Pipeline Rows" value={String(summary.actionableCount)} detail={`${summary.inventoryOnly} in inventory only`} />
        <SummaryMetric label="All Strategies" value={String(strategies.length)} detail={`${summary.registered} registered`} />
        <SummaryMetric label="Audit Eligible" value={String(summary.auditEligible)} detail="robust backtest passed" tone="text-cyan-200" />
        <SummaryMetric label="Paper Gate" value={String(summary.readyForPaper)} detail="ready or active" tone="text-emerald-200" />
        <SummaryMetric
          label="Fastest 2x"
          value={formatDoublingDays(summary.fastestDoubling?.doublingEstimate?.projectedDaysToDouble)}
          detail={summary.fastestDoubling ? summary.fastestDoubling.displayName : 'no validated positive BTC artifact'}
          tone={summary.fastestDoubling ? 'text-emerald-200' : 'text-white/60'}
        />
        <SummaryMetric label="Blocked" value={String(summary.blocked)} detail="needs repair before audit" tone={summary.blocked > 0 ? 'text-amber-200' : 'text-emerald-200'} />
      </section>

      <section className="flex flex-wrap gap-2">
        <ViewToggle
          active={activeView === 'pipeline'}
          icon={<LayoutList className="h-4 w-4" />}
          label="Pipeline"
          detail={`${summary.actionableCount} actionable`}
          onClick={() => setActiveView('pipeline')}
        />
        <ViewToggle
          active={activeView === 'inventory'}
          icon={<Library className="h-4 w-4" />}
          label="All Strategies"
          detail={`${strategies.length} total`}
          onClick={() => setActiveView('inventory')}
        />
      </section>

      {activeView === 'pipeline' ? (
        <>
          {summary.inventoryOnly > 0 ? (
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-white/55">
              {summary.inventoryOnly} research-only catalog row{summary.inventoryOnly === 1 ? '' : 's'} are intentionally kept out of the main pipeline. Open All Strategies to inspect docs-only work.
            </div>
          ) : null}
          <StrategyPipelineBoard
            grouped={grouped}
            runningAction={runningAction}
            onOpen={(strategy) => navigate(detailPath(strategy))}
            onRun={(strategy) => void runStrategyAction(strategy)}
          />
        </>
      ) : (
        <StrategyInventory strategies={inventory} onOpen={(strategy) => navigate(detailPath(strategy))} />
      )}
    </div>
  );
}

function SummaryMetric({ label, value, detail, tone = 'text-white' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 break-words text-sm leading-5 text-white/50">{detail}</div>
    </div>
  );
}

function ViewToggle({
  active,
  icon,
  label,
  detail,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
        active ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-50' : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]'
      }`}
    >
      {icon}
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-white/40">{detail}</span>
      </span>
    </button>
  );
}
