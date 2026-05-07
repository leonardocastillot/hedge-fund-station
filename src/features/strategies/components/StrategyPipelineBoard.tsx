import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Play,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { HyperliquidGateStatus, HyperliquidStrategyCatalogRow } from '@/services/hyperliquidService';
import type { ActionablePipelineStage } from '../strategyPipelineModel';

type StrategyPipelineColumn = {
  stage: ActionablePipelineStage;
  title: string;
  detail: string;
  icon: LucideIcon;
};

const PIPELINE_COLUMNS: StrategyPipelineColumn[] = [
  { stage: 'backtesting', title: 'Backtesting', detail: 'Registered strategies waiting for deterministic tests.', icon: FlaskConical },
  { stage: 'audit', title: 'Audit', detail: 'Only robust backtest passes after costs enter here.', icon: ShieldCheck },
  { stage: 'paper', title: 'Paper', detail: 'Ready candidates and paper runtime evidence.', icon: ClipboardCheck },
  { stage: 'blocked', title: 'Blocked', detail: 'Failed gates and missing evidence that need repair.', icon: AlertTriangle }
];

const pipelineGridStyle = {
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 248px), 1fr))'
};

function formatPercent(value: unknown): string {
  const numeric = Number(value ?? 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

function formatNumber(value: unknown, digits = 2): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : '0.00';
}

function formatDoublingDays(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'N/A';
  if (numeric < 1) return '<1d';
  if (numeric < 100) return `${numeric.toFixed(1)}d`;
  return `${Math.round(numeric)}d`;
}

function formatDoublingEstimate(strategy: HyperliquidStrategyCatalogRow): string {
  const estimate = strategy.doublingEstimate;
  if (!estimate?.candidate || !estimate.projectedDaysToDouble) return 'N/A';
  return formatDoublingDays(estimate.projectedDaysToDouble);
}

function stageTone(stage: ActionablePipelineStage): string {
  if (stage === 'paper') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
  if (stage === 'audit') return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
  if (stage === 'backtesting') return 'border-blue-400/30 bg-blue-500/10 text-blue-100';
  return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
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

export function StrategyPipelineBoard({
  grouped,
  runningAction,
  onOpen,
  onRun
}: {
  grouped: Record<ActionablePipelineStage, HyperliquidStrategyCatalogRow[]>;
  runningAction: string | null;
  onOpen: (strategy: HyperliquidStrategyCatalogRow) => void;
  onRun: (strategy: HyperliquidStrategyCatalogRow) => void;
}) {
  return (
    <section className="grid min-w-0 items-start gap-3" style={pipelineGridStyle}>
      {PIPELINE_COLUMNS.map((column) => (
        <PipelineColumn
          key={column.stage}
          column={column}
          strategies={grouped[column.stage]}
          runningAction={runningAction}
          onOpen={onOpen}
          onRun={onRun}
        />
      ))}
    </section>
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
    <div className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-md border border-white/10 bg-black/25">
      <div className="shrink-0 border-b border-white/10 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-cyan-200" />
            <div className="truncate text-sm font-semibold text-white">{column.title}</div>
          </div>
          <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${stageTone(column.stage)}`}>
            {strategies.length}
          </span>
        </div>
        <div className="mt-2 text-xs leading-5 text-white/55">{column.detail}</div>
      </div>

      <div className="grid content-start gap-2 overflow-y-auto p-2 [max-height:min(68vh,720px)]">
        {strategies.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/45">
            No actionable strategies in this gate.
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
  const actionDisabled = running || !strategy.nextAction.enabled;
  const blockers = strategy.gateReasons.length ? strategy.gateReasons : strategy.missingAuditItems;
  const summary = strategy.latestBacktestSummary;

  return (
    <article className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-3 transition hover:border-cyan-400/25 hover:bg-white/[0.055]">
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

        <div className={`mt-3 text-xs font-semibold uppercase leading-5 tracking-[0.12em] ${gateTone(strategy.gateStatus)}`}>
          {strategy.gateStatus.replace(/-/g, ' ')}
        </div>

        <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(4rem,1fr))]">
          <TinyMetric label="Trades" value={String(summary?.total_trades ?? strategy.tradeCount)} />
          <TinyMetric label="Return" value={formatPercent(summary?.return_pct)} />
          <TinyMetric label="PF" value={formatNumber(summary?.profit_factor)} />
          <TinyMetric label="2x ETA" value={formatDoublingEstimate(strategy)} />
        </div>
      </button>

      {blockers.length > 0 ? (
        <div className="mt-3 grid gap-1 rounded-md border border-white/10 bg-black/25 p-2 text-xs leading-5 text-white/60">
          {blockers.slice(0, 3).map((blocker) => (
            <div key={blocker} className="break-words">
              {blocker}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2">
        <div className="max-h-20 overflow-y-auto break-all font-mono text-[10px] leading-4 text-white/45">{strategy.nextAction.command}</div>
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={actionDisabled}
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-500/12 px-3 py-2 text-[11px] font-bold leading-4 text-cyan-50 transition hover:bg-cyan-500/22 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
      >
        {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : strategy.nextAction.enabled ? <Play className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        <span className="min-w-0 text-center">{running ? 'Running' : actionLabel(strategy)}</span>
      </button>
    </article>
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
