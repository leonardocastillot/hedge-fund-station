import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Droplets,
  HeartPulse,
  RadioTower,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle
} from 'lucide-react';
import {
  hyperliquidService,
  type HyperliquidGatewayHealth,
  type HyperliquidMarketRow,
  type HyperliquidOverviewResponse,
  type HyperliquidPaperTrade,
  type HyperliquidStrategyAuditResponse,
  type HyperliquidWatchlistResponse
} from '@/services/hyperliquidService';
import { useMarketPolling } from '@/hooks/useMarketPolling';

type LiveTradingSnapshot = {
  health: HyperliquidGatewayHealth | null;
  overview: HyperliquidOverviewResponse | null;
  watchlist: HyperliquidWatchlistResponse | null;
  trades: HyperliquidPaperTrade[];
  audit: HyperliquidStrategyAuditResponse | null;
  errors: string[];
  fetchedAt: number;
};

const MONITOR_LINKS = [
  { label: 'Hyperliquid', to: '/hyperliquid', icon: RadioTower },
  { label: 'Liquidations', to: '/liquidations', icon: Droplets },
  { label: 'Paper Lab', to: '/paper', icon: Activity },
  { label: 'Portfolio', to: '/portfolio', icon: Wallet }
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown service error.';
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2
  }).format(value);
}

function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatTime(value: number | null | undefined): string {
  if (!value) {
    return 'N/D';
  }
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function decisionTone(label?: string | null): string {
  if (label === 'watch-now') {
    return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100';
  }
  if (label === 'avoid') {
    return 'border-rose-400/25 bg-rose-500/10 text-rose-100';
  }
  return 'border-amber-400/25 bg-amber-500/10 text-amber-100';
}

function marketPressure(market: HyperliquidMarketRow): number {
  return market.estimatedTotalLiquidationUsd
    ?? ((market.estimatedLongLiquidationUsd ?? 0) + (market.estimatedShortLiquidationUsd ?? 0));
}

async function loadLiveSnapshot(): Promise<LiveTradingSnapshot> {
  const [healthResult, overviewResult, watchlistResult, tradesResult, auditResult] = await Promise.allSettled([
    hyperliquidService.health(),
    hyperliquidService.getOverview(48),
    hyperliquidService.getWatchlist(18),
    hyperliquidService.getPaperTrades('all'),
    hyperliquidService.getStrategyAudit(500)
  ]);
  const errors: string[] = [];

  const health = healthResult.status === 'fulfilled'
    ? healthResult.value
    : (errors.push(`Gateway: ${errorMessage(healthResult.reason)}`), null);
  const overview = overviewResult.status === 'fulfilled'
    ? overviewResult.value
    : (errors.push(`Overview: ${errorMessage(overviewResult.reason)}`), null);
  const watchlist = watchlistResult.status === 'fulfilled'
    ? watchlistResult.value
    : (errors.push(`Watchlist: ${errorMessage(watchlistResult.reason)}`), null);
  const trades = tradesResult.status === 'fulfilled'
    ? tradesResult.value.trades
    : (errors.push(`Paper trades: ${errorMessage(tradesResult.reason)}`), []);
  const audit = auditResult.status === 'fulfilled'
    ? auditResult.value
    : (errors.push(`Audit: ${errorMessage(auditResult.reason)}`), null);

  return { health, overview, watchlist, trades, audit, errors, fetchedAt: Date.now() };
}

export default function LiveTradingStationPage() {
  const livePoll = useMarketPolling(
    'station:live-trading',
    loadLiveSnapshot,
    { intervalMs: 10_000, staleAfterMs: 35_000 }
  );
  const snapshot = livePoll.data;
  const health = snapshot?.health ?? null;
  const watchlist = snapshot?.watchlist ?? null;
  const trades = snapshot?.trades ?? [];
  const audit = snapshot?.audit ?? null;
  const overviewMarkets = snapshot?.overview?.markets ?? [];

  const openTrades = useMemo(() => trades.filter((trade) => trade.status === 'open'), [trades]);
  const closedTrades = useMemo(() => trades.filter((trade) => trade.status === 'closed'), [trades]);
  const reviewQueue = useMemo(() => closedTrades.filter((trade) => !trade.review).slice(0, 6), [closedTrades]);
  const openRiskUsd = useMemo(() => openTrades.reduce((sum, trade) => sum + trade.sizeUsd, 0), [openTrades]);
  const openPnlUsd = useMemo(() => openTrades.reduce((sum, trade) => sum + (trade.unrealizedPnlUsd ?? 0), 0), [openTrades]);
  const closedPnlUsd = useMemo(() => closedTrades.reduce((sum, trade) => sum + (trade.realizedPnlUsd ?? 0), 0), [closedTrades]);

  const pressureMarkets = useMemo(() => {
    return overviewMarkets
      .filter((market) => marketPressure(market) > 0)
      .slice()
      .sort((a, b) => marketPressure(b) - marketPressure(a))
      .slice(0, 6);
  }, [overviewMarkets]);

  const readinessGates = useMemo(() => {
    const cacheFresh = Boolean(health?.ok && health.cacheUpdatedAt && (health.cacheAgeMs ?? Number.POSITIVE_INFINITY) < 60_000);
    const reviewCoverage = audit?.summary.reviewCoverage ?? 0;
    return [
      { label: 'Gateway fresh', ok: cacheFresh, detail: `Updated ${formatTime(health?.cacheUpdatedAt)}` },
      { label: 'Paper ledger visible', ok: trades.length > 0, detail: `${trades.length} paper records` },
      { label: 'Review coverage', ok: reviewCoverage >= 80, detail: `${Math.round(reviewCoverage)}% reviewed` },
      { label: 'Execution disabled', ok: true, detail: 'Monitor-only station' }
    ];
  }, [audit?.summary.reviewCoverage, health?.cacheAgeMs, health?.cacheUpdatedAt, health?.ok, trades.length]);

  const watchNow = watchlist?.watchNow ?? [];
  const waitTrigger = watchlist?.waitTrigger ?? [];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5">
      <section className="border-b border-white/10 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">Fixed Trading Station</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Live Trading</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Safe live monitor for market pressure, paper runtime, review coverage, and readiness gates.
            </p>
          </div>
          <div className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-100">
            Monitor only
          </div>
        </div>
        <div className="mt-4 rounded-md border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">
          Real execution remains locked behind future backend risk APIs, kill switches, validation evidence, and explicit human approval.
        </div>
        {livePoll.error || snapshot?.errors.length ? (
          <div className="mt-3 rounded-md border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">
            {(snapshot?.errors.length ? snapshot.errors : [livePoll.error]).filter(Boolean).join(' | ')}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Gateway" value={health?.ok ? 'Online' : 'Partial'} detail={`Cache ${health?.cacheWarm ? 'warm' : 'cold'} | ${formatTime(health?.cacheUpdatedAt)}`} icon={<HeartPulse className="h-4 w-4" />} tone={health?.ok ? 'text-emerald-200' : 'text-amber-200'} />
        <Metric label="Open Risk" value={formatCurrency(openRiskUsd)} detail={`${openTrades.length} open paper trades`} icon={<ShieldCheck className="h-4 w-4" />} />
        <Metric label="Open PnL" value={formatCurrency(openPnlUsd)} detail={`${formatCurrency(closedPnlUsd)} closed paper PnL`} icon={openPnlUsd >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />} tone={openPnlUsd >= 0 ? 'text-emerald-200' : 'text-rose-200'} />
        <Metric label="Review Queue" value={String(reviewQueue.length)} detail={`${Math.round(audit?.summary.reviewCoverage ?? 0)}% coverage`} icon={<AlertTriangle className="h-4 w-4" />} tone={reviewQueue.length > 0 ? 'text-amber-200' : 'text-emerald-200'} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <Panel title="Watch Now">
            {watchNow.length === 0 ? (
              <EmptyState text="No watch-now setups in the current gateway snapshot." />
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {watchNow.slice(0, 8).map((market) => (
                  <MarketRow key={`${market.symbol}-${market.primarySetup ?? 'setup'}`} market={market} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Liquidation Pressure">
            {pressureMarkets.length === 0 ? (
              <EmptyState text="No liquidation-pressure estimates are available in the overview snapshot." />
            ) : (
              <div className="grid gap-2">
                {pressureMarkets.map((market) => (
                  <div key={market.symbol} className="grid gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[92px_1fr_120px] md:items-center">
                    <div>
                      <div className="text-sm font-bold text-white">{market.symbol}</div>
                      <div className="mt-1 text-xs text-slate-500">{market.crowdingBias ?? 'balanced'}</div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-cyan-300"
                        style={{ width: `${Math.min(100, Math.max(8, Math.abs(market.pressureImbalance ?? 0) * 100))}%` }}
                      />
                    </div>
                    <div className="text-right text-sm font-semibold text-cyan-100">{formatCurrency(marketPressure(market))}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Readiness Gates">
            <div className="grid gap-2">
              {readinessGates.map((gate) => (
                <div key={gate.label} className="flex items-start gap-3 rounded-md border border-white/10 bg-black/25 p-3">
                  {gate.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{gate.label}</div>
                    <div className="mt-1 text-xs text-slate-400">{gate.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Review Queue">
            {reviewQueue.length === 0 ? (
              <EmptyState text="No closed paper trades are waiting for review." />
            ) : (
              <div className="grid gap-2">
                {reviewQueue.map((trade) => (
                  <Link key={trade.id} to="/paper" className="rounded-md border border-white/10 bg-white/[0.03] p-3 transition hover:border-amber-400/30 hover:bg-amber-500/10">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{trade.symbol} {trade.side.toUpperCase()}</div>
                      <div className={(trade.realizedPnlUsd ?? 0) >= 0 ? 'text-sm font-semibold text-emerald-200' : 'text-sm font-semibold text-rose-200'}>
                        {formatCurrency(trade.realizedPnlUsd ?? 0)}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-400">{trade.setupTag}</div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Monitor Modules">
            <div className="grid gap-2">
              {MONITOR_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white/80 transition hover:border-cyan-400/30 hover:bg-cyan-500/10"
                >
                  <span className="flex items-center gap-2">
                    <item.icon className="h-4 w-4 text-cyan-200" />
                    {item.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-white/40" />
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <Panel title="Wait On Trigger">
        {waitTrigger.length === 0 ? (
          <EmptyState text="No wait-trigger setups in the current gateway snapshot." />
        ) : (
          <div className="grid gap-2 lg:grid-cols-3">
            {waitTrigger.slice(0, 9).map((market) => (
              <MarketRow key={`${market.symbol}-${market.primarySetup ?? 'trigger'}`} market={market} compact />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-white/10 bg-black/25 p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">{title}</div>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  tone = 'text-white'
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
        <span>{label}</span>
        <span className="text-white/35">{icon}</span>
      </div>
      <div className={`mt-3 text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-slate-400">{detail}</div>
    </div>
  );
}

function MarketRow({ market, compact = false }: { market: HyperliquidMarketRow; compact?: boolean }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold text-white">{market.symbol}</div>
            <div className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${decisionTone(market.decisionLabel)}`}>
              {market.decisionLabel ?? 'wait-trigger'}
            </div>
          </div>
          <div className="mt-1 truncate text-xs text-slate-400">{market.primarySetup ?? market.signalLabel}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-white">{market.price ? formatCurrency(market.price) : 'N/A'}</div>
          <div className={(market.change24hPct ?? 0) >= 0 ? 'mt-1 text-xs text-emerald-300' : 'mt-1 text-xs text-rose-300'}>
            {(market.change24hPct ?? 0).toFixed(2)}%
          </div>
        </div>
      </div>
      {compact ? null : (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <MiniStat label="OI" value={formatCompact(market.openInterestUsd)} />
          <MiniStat label="Funding" value={market.fundingRate === null ? 'N/A' : `${(market.fundingRate * 100).toFixed(3)}%`} />
          <MiniStat label="EQ" value={String(market.executionQuality ?? 0)} />
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black/20 px-2 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</div>
      <div className="mt-1 truncate text-xs font-semibold text-slate-200">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">
      {text}
    </div>
  );
}
