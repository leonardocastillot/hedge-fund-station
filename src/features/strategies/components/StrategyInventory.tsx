import { useMemo, useState } from 'react';
import type { HyperliquidStrategyCatalogRow } from '@/services/hyperliquidService';

type InventoryFilter = 'all' | 'registered' | 'docs-only' | 'paper' | 'blocked';

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

function cleanupState(strategy: HyperliquidStrategyCatalogRow): { label: string; detail: string; tone: string } {
  if (strategy.gateStatus === 'paper-active') {
    return { label: 'Paper Active', detail: 'paper ledger evidence', tone: 'text-emerald-200' };
  }
  if (strategy.gateStatus === 'ready-for-paper') {
    return { label: 'Paper Ready', detail: strategy.latestArtifactPaths.paper ? 'candidate artifact exists' : 'validation passed', tone: 'text-emerald-200' };
  }
  if (strategy.gateStatus === 'audit-eligible') {
    return { label: 'Audit Ready', detail: 'robust backtest passed', tone: 'text-cyan-200' };
  }
  if (strategy.gateStatus === 'backtest-running-eligible') {
    return { label: 'Needs Backtest', detail: 'registered without artifact', tone: 'text-blue-200' };
  }
  if (!strategy.registeredForBacktest && strategy.sourceTypes.includes('docs')) {
    return { label: 'Docs Only', detail: 'needs backend package', tone: 'text-white/60' };
  }
  if (strategy.pipelineStage === 'blocked') {
    return { label: 'Blocked', detail: (strategy.gateReasons[0] || strategy.missingAuditItems[0] || 'gate failed').replace(/_/g, ' '), tone: 'text-amber-200' };
  }
  return { label: 'Research', detail: strategy.sourceTypes.join(', ') || 'catalog row', tone: 'text-white/70' };
}

function matchesFilter(strategy: HyperliquidStrategyCatalogRow, filter: InventoryFilter): boolean {
  if (filter === 'registered') return strategy.registeredForBacktest;
  if (filter === 'docs-only') return !strategy.registeredForBacktest && strategy.sourceTypes.includes('docs');
  if (filter === 'paper') return strategy.pipelineStage === 'paper';
  if (filter === 'blocked') return strategy.pipelineStage === 'blocked';
  return true;
}

export function StrategyInventory({
  strategies,
  onOpen
}: {
  strategies: HyperliquidStrategyCatalogRow[];
  onOpen: (strategy: HyperliquidStrategyCatalogRow) => void;
}) {
  const [filter, setFilter] = useState<InventoryFilter>('all');
  const filteredStrategies = useMemo(() => strategies.filter((strategy) => matchesFilter(strategy, filter)), [filter, strategies]);
  const filters: Array<{ id: InventoryFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: strategies.length },
    { id: 'registered', label: 'Registered', count: strategies.filter((strategy) => strategy.registeredForBacktest).length },
    { id: 'paper', label: 'Paper', count: strategies.filter((strategy) => strategy.pipelineStage === 'paper').length },
    { id: 'blocked', label: 'Blocked', count: strategies.filter((strategy) => strategy.pipelineStage === 'blocked').length },
    { id: 'docs-only', label: 'Docs Only', count: strategies.filter((strategy) => !strategy.registeredForBacktest && strategy.sourceTypes.includes('docs')).length }
  ];

  return (
    <section className="min-w-0 rounded-md border border-white/10 bg-black/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3">
        <div>
          <div className="text-sm font-semibold text-white">All Strategy Inventory</div>
          <div className="mt-1 text-xs text-white/45">{strategies.length} catalog rows with docs, backend, artifacts, and cleanup state.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                filter === item.id ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.08]'
              }`}
            >
              {item.label} {item.count}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2 p-2 md:grid-cols-2 xl:grid-cols-3">
        {filteredStrategies.map((strategy) => {
          const cleanup = cleanupState(strategy);
          const sourceLabels = [
            strategy.registeredForBacktest ? 'registered' : null,
            strategy.latestArtifactPaths.backtest ? 'backtest' : null,
            strategy.latestArtifactPaths.validation ? 'validation' : null,
            strategy.latestArtifactPaths.paper ? 'paper' : null,
            strategy.btcOptimization ? 'optimizer' : null,
            strategy.sourceTypes.includes('docs') ? 'docs' : null
          ].filter(Boolean) as string[];
          return (
            <button
              key={`inventory:${strategy.strategyKey}`}
              type="button"
              onClick={() => onOpen(strategy)}
              className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-cyan-400/25 hover:bg-white/[0.055]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{strategy.displayName}</div>
                  <div className="mt-1 truncate font-mono text-[10px] text-white/35">{strategy.strategyId}</div>
                </div>
                <span className={`shrink-0 text-xs font-semibold ${cleanup.tone}`}>{cleanup.label}</span>
              </div>
              <div className="mt-2 truncate text-xs text-white/50">{cleanup.detail}</div>
              <div className="mt-3 flex flex-wrap gap-1">
                {sourceLabels.length === 0 ? <SourcePill label="catalog" /> : sourceLabels.map((label) => <SourcePill key={`${strategy.strategyId}:${label}`} label={label} />)}
              </div>
              <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(4rem,1fr))]">
                <TinyMetric label="Gate" value={strategy.gateStatus.replace(/-/g, ' ')} />
                <TinyMetric label="2x ETA" value={formatDoublingEstimate(strategy)} />
                <TinyMetric label="Trades" value={String(strategy.latestBacktestSummary?.total_trades ?? strategy.tradeCount)} />
              </div>
            </button>
          );
        })}
        {filteredStrategies.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/45">
            No strategies match this inventory filter.
          </div>
        ) : null}
      </div>
    </section>
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

function SourcePill({ label }: { label: string }) {
  return (
    <span className="rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
      {label}
    </span>
  );
}
