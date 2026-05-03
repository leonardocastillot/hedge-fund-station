import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { strategyService, type Strategy } from '@/services/strategyService';

type StrategyFilter = 'all' | 'long' | 'bidirectional' | 'deployed';
type StrategySort = 'score' | 'return' | 'sharpe' | 'win_rate';

function scoreTone(value: number): string {
  if (value >= 80) return 'text-emerald-300';
  if (value >= 65) return 'text-cyan-300';
  if (value >= 50) return 'text-amber-300';
  return 'text-rose-300';
}

function decisionTone(value: string): string {
  if (value === 'watch-now') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  if (value === 'wait-trigger') return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  return 'border-white/10 bg-white/[0.03] text-white/70';
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export default function StrategyLibraryPage() {
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StrategyFilter>('all');
  const [sortBy, setSortBy] = useState<StrategySort>('score');

  const loadStrategies = async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      setError(null);
      const data = await strategyService.getLibrary(filter, sortBy);
      setStrategies(data.strategies);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load strategy surface.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadStrategies(true);
  }, [filter, sortBy]);

  const summary = useMemo(() => {
    const watchNow = strategies.filter((strategy) => strategy.decision_label === 'watch-now').length;
    const deployed = strategies.filter((strategy) => strategy.total_trades > 0).length;
    const avgExecution = strategies.length > 0
      ? strategies.reduce((sum, strategy) => sum + strategy.execution_quality, 0) / strategies.length
      : 0;

    return {
      watchNow,
      deployed,
      avgExecution,
      alphaStrategies: strategies.filter((strategy) => strategy.source === 'alpha').length
    };
  }, [strategies]);

  const handleDeploy = async (strategy: Strategy) => {
    try {
      await strategyService.deploy(strategy.strategy_name, 'PAPER', 33);
      await loadStrategies(false);
      navigate('/portfolio');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create paper trade.';
      setError(message);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 flex min-h-[50vh] items-center justify-center">
        <div className="h-9 w-9 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <div className="rounded-[24px] border border-cyan-500/15 bg-[linear-gradient(135deg,rgba(8,145,178,0.18),rgba(15,23,42,0.9))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">Strategy Surface</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Strategy library wired to the correct backend contract for this feature.</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Strategies come first from the alpha engine evaluations. If that service is unavailable, this page falls back to legacy cache and then live Hyperliquid gateway opportunities.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/strategy-audit"
              className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/25"
            >
              Open Audit
            </Link>
            <button
              onClick={() => void loadStrategies(false)}
              className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.09]"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SummaryCard label="Strategies" value={String(strategies.length)} detail={`${summary.watchNow} watch-now`} />
          <SummaryCard label="Deployed" value={String(summary.deployed)} detail={`${summary.alphaStrategies} from alpha engine`} />
          <SummaryCard label="Avg Quality" value={`${summary.avgExecution.toFixed(0)}/100`} detail="cross-backend normalized" />
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'long', 'bidirectional', 'deployed'] as StrategyFilter[]).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              filter === value ? 'bg-cyan-500 text-slate-950' : 'border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.08]'
            }`}
          >
            {value}
          </button>
        ))}

        {(['score', 'return', 'sharpe', 'win_rate'] as StrategySort[]).map((value) => (
          <button
            key={value}
            onClick={() => setSortBy(value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              sortBy === value ? 'bg-white text-slate-950' : 'border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.08]'
            }`}
          >
            sort:{value}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {strategies.map((strategy) => (
          <button
            key={`${strategy.strategy_name}-${strategy.timeframe}`}
            onClick={() => navigate(`/strategy/${encodeURIComponent(strategy.strategy_name)}/${encodeURIComponent(strategy.timeframe)}`)}
            className="grid gap-4 rounded-[24px] border border-white/10 bg-black/25 p-4 text-left transition hover:border-cyan-400/30 hover:bg-black/35"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-white">{strategy.strategy_name}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em] ${decisionTone(strategy.decision_label)}`}>
                    {strategy.decision_label}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-white/70">
                    {strategy.setup_tag}
                  </span>
                </div>
                <div className="mt-2 text-sm text-slate-300">{strategy.trigger_plan || `Timeframe ${strategy.timeframe}. Source: ${strategy.source}.`}</div>
              </div>

              <div className="text-right">
                <div className={`text-2xl font-semibold ${scoreTone(strategy.score)}`}>{strategy.score.toFixed(1)}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/40">Composite Score</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <Metric label="24h Move" value={formatPercent(strategy.total_return_pct)} tone={strategy.total_return_pct >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
              <Metric label="Quality" value={`${strategy.execution_quality}/100`} tone="text-cyan-300" />
              <Metric label="Sharpe" value={strategy.sharpe_ratio.toFixed(2)} />
              <Metric label="Win Rate" value={`${strategy.win_rate.toFixed(1)}%`} />
              <Metric label="Trades" value={String(strategy.total_trades)} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-white/55">
                Invalidacion: {strategy.invalidation_plan || 'No invalidation plan stored yet.'}
              </div>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDeploy(strategy);
                }}
                className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/25"
              >
                Create Paper Trade
              </button>
            </div>
          </button>
        ))}

        {strategies.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-white/55">
            No strategies available from the live gateway contract.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-white/55">{detail}</div>
    </div>
  );
}

function Metric({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
