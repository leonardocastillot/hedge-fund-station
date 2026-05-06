import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, Database, Radar, ShieldAlert, Waves } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  hyperliquidService,
  type HyperliquidAlert,
  type HyperliquidDetailResponse,
  type HyperliquidHistoryPoint,
  type HyperliquidMarketRow,
  type HyperliquidOverviewResponse,
  type HyperliquidWatchlistResponse
} from '@/services/hyperliquidService';
import { useMarketPolling } from '@/hooks/useMarketPolling';

type MarketFilter = 'all' | HyperliquidMarketRow['signalLabel'];

function formatCompact(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(digits)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(digits)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(digits)}K`;
  }
  return value.toFixed(digits);
}

function formatPct(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function signalLabelCopy(signal: HyperliquidMarketRow['signalLabel']) {
  switch (signal) {
    case 'momentum-expansion':
      return 'Momentum';
    case 'crowded-trend':
      return 'Crowded';
    case 'mean-reversion-watch':
      return 'Mean Rev';
    default:
      return 'Neutral';
  }
}

function riskLabelCopy(risk: HyperliquidMarketRow['riskLabel']) {
  switch (risk) {
    case 'high-crowding':
      return 'High Crowd';
    case 'expanding':
      return 'Expanding';
    default:
      return 'Balanced';
  }
}

function severityClass(severity: HyperliquidAlert['severity']) {
  switch (severity) {
    case 'high':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
    case 'medium':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
    default:
      return 'border-white/10 bg-white/[0.03] text-white/70';
  }
}

function setupLabel(row: HyperliquidMarketRow) {
  if (row.primarySetup === 'short-squeeze') {
    return 'Short squeeze';
  }
  if (row.primarySetup === 'long-flush') {
    return 'Long flush';
  }
  if (row.primarySetup === 'fade') {
    return 'Fade / exhaustion';
  }
  if (row.primarySetup === 'breakout-continuation') {
    return 'Breakout / continuation';
  }
  if (row.signalLabel === 'momentum-expansion') {
    return 'Breakout / continuation';
  }
  if (row.signalLabel === 'crowded-trend') {
    return 'Crowded trend / squeeze risk';
  }
  if (row.signalLabel === 'mean-reversion-watch') {
    return 'Fade watch / exhaustion';
  }
  return 'Monitor only';
}

function urgencyLabel(row: HyperliquidMarketRow) {
  if (row.decisionLabel === 'watch-now') {
    return 'Watch now';
  }
  if (row.decisionLabel === 'wait-trigger') {
    return 'Wait trigger';
  }
  if (row.decisionLabel === 'avoid') {
    return 'Avoid';
  }
  if (row.opportunityScore >= 90) {
    return 'High priority';
  }
  if (row.opportunityScore >= 82) {
    return 'Worth review';
  }
  return 'Secondary';
}

function decisionTone(row: HyperliquidMarketRow) {
  if (row.decisionLabel === 'watch-now') {
    return 'text-emerald-200';
  }
  if (row.decisionLabel === 'wait-trigger') {
    return 'text-amber-200';
  }
  return 'text-rose-200';
}

function reviewReason(row: HyperliquidMarketRow) {
  const reasons: string[] = [];
  if ((row.scoreBreakdown.volume || 0) >= 85) {
    reasons.push('high relative volume');
  }
  if ((row.scoreBreakdown.openInterest || 0) >= 85) {
    reasons.push('large OI concentration');
  }
  if ((row.scoreBreakdown.funding || 0) >= 85) {
    reasons.push('extreme funding');
  }
  if ((row.scoreBreakdown.change || 0) >= 85) {
    reasons.push('strong price displacement');
  }
  if (row.crowdingBias === 'longs-at-risk' || row.crowdingBias === 'shorts-at-risk') {
    reasons.push(row.crowdingBias);
  }
  return reasons.length > 0 ? reasons.slice(0, 2).join(' + ') : 'no strong edge yet';
}

function firstCheck(row: HyperliquidMarketRow) {
  if (row.crowdingBias === 'longs-at-risk') {
    return 'Check if crowded longs are losing structure and opening cascade risk.';
  }
  if (row.crowdingBias === 'shorts-at-risk') {
    return 'Check if shorts are trapped and price keeps squeezing through offers.';
  }
  if (row.riskLabel === 'high-crowding') {
    return 'Check liquidation risk and failed breakout behavior.';
  }
  if (row.signalLabel === 'momentum-expansion') {
    return 'Check if buyers still control pullbacks and depth stays bid.';
  }
  if (row.signalLabel === 'mean-reversion-watch') {
    return 'Check for exhaustion, trapped longs/shorts and fading aggression.';
  }
  return 'Check structure, liquidity and whether flow is accelerating.';
}

export default function HyperliquidIntelligencePage() {
  const [overview, setOverview] = useState<HyperliquidOverviewResponse | null>(null);
  const [detail, setDetail] = useState<HyperliquidDetailResponse | null>(null);
  const [history, setHistory] = useState<HyperliquidHistoryPoint[]>([]);
  const [alerts, setAlerts] = useState<HyperliquidAlert[]>([]);
  const [watchlist, setWatchlist] = useState<HyperliquidWatchlistResponse | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [filter, setFilter] = useState<MarketFilter>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const configState = hyperliquidService.getConfigState();

  const overviewPoll = useMarketPolling(
    'hyperliquid:intelligence:overview',
    async () => {
      const [nextOverview, nextAlerts, nextWatchlist] = await Promise.all([
        hyperliquidService.getOverview(28),
        hyperliquidService.getAlerts(18),
        hyperliquidService.getWatchlist(12)
      ]);
      return { nextOverview, nextAlerts, nextWatchlist };
    },
    { intervalMs: 12_000, staleAfterMs: 35_000 }
  );

  useEffect(() => {
    if (!overviewPoll.data) {
      if (overviewPoll.error) {
        setError(overviewPoll.error || 'No se pudo cargar Hyperliquid.');
      }
      return;
    }

    setOverview(overviewPoll.data.nextOverview);
    setAlerts(overviewPoll.data.nextAlerts.alerts);
    setWatchlist(overviewPoll.data.nextWatchlist);
    setSelectedSymbol((current) => current || overviewPoll.data?.nextOverview.markets[0]?.symbol || 'BTC');
    setError(overviewPoll.status === 'stale' ? overviewPoll.error : null);
  }, [overviewPoll.data, overviewPoll.error, overviewPoll.status]);

  const detailSymbol = selectedSymbol || overview?.markets[0]?.symbol || 'BTC';
  const detailPoll = useMarketPolling(
    `hyperliquid:intelligence:detail:${detailSymbol}`,
    async () => {
      const [nextDetail, nextHistory] = await Promise.all([
        hyperliquidService.getDetail(detailSymbol),
        hyperliquidService.getHistory(detailSymbol, 48)
      ]);
      return { nextDetail, nextHistory };
    },
    { intervalMs: 12_000, staleAfterMs: 35_000, enabled: Boolean(detailSymbol) }
  );

  useEffect(() => {
    if (!detailPoll.data) {
      if (detailPoll.status === 'error') {
        setError(detailPoll.error || `No se pudo cargar detalle para ${detailSymbol}.`);
      }
      return;
    }

    setDetail(detailPoll.data.nextDetail);
    setHistory(detailPoll.data.nextHistory.points);
    setError(detailPoll.status === 'stale' ? detailPoll.error : null);
  }, [detailPoll.data, detailPoll.error, detailPoll.status, detailSymbol]);

  const markets = useMemo(() => {
    const base = overview?.markets || [];
    return base.filter((market) => {
      const matchesFilter = filter === 'all' || market.signalLabel === filter;
      const matchesQuery = !query.trim() || market.symbol.toLowerCase().includes(query.trim().toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [filter, overview?.markets, query]);

  const currentMarket = detail?.market || markets[0] || null;
  const selectedAlerts = useMemo(() => alerts.filter((alert) => alert.symbol === selectedSymbol).slice(0, 4), [alerts, selectedSymbol]);
  const visibleAlerts = selectedAlerts.length > 0 ? selectedAlerts : alerts.slice(0, 4);
  const reviewQueue = useMemo(() => {
    const preferred = watchlist?.watchNow?.slice(0, 3) || [];
    return preferred.length > 0 ? preferred : markets.slice(0, 3);
  }, [markets, watchlist?.watchNow]);
  const decisionBuckets = useMemo(() => {
    return [
      { label: 'Watch Now', description: 'Tradeable now', items: watchlist?.watchNow?.slice(0, 4) || [] },
      { label: 'Wait Trigger', description: 'Needs confirmation', items: watchlist?.waitTrigger?.slice(0, 4) || [] },
      { label: 'Avoid', description: 'Interesting but low quality', items: watchlist?.avoid?.slice(0, 4) || [] }
    ];
  }, [watchlist?.avoid, watchlist?.waitTrigger, watchlist?.watchNow]);

  const chartData = useMemo(() => history.map((point) => ({
    time: new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    price: point.price ?? 0,
    score: point.opportunityScore,
    oi: point.openInterestUsd ?? 0
  })), [history]);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.10),_transparent_26%),linear-gradient(180deg,#020617_0%,#07111d_100%)] p-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="rounded-[24px] border border-sky-500/20 bg-black/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300/70">Hyperliquid Radar</div>
              <div className="mt-1 text-xl font-semibold text-white">Que mirar ahora, por que importa y donde profundizar.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{configState.apiUrl}</Badge>
              <Badge>{overview?.updatedAt ? new Date(overview.updatedAt).toLocaleTimeString() : 'Loading'}</Badge>
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_1fr]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar simbolo"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
            />
            <InsightCard
              label="Why Review"
              value={currentMarket ? reviewReason(currentMarket) : 'Waiting for market'}
              tone="sky"
            />
            <InsightCard
              label="First Check"
              value={currentMarket ? firstCheck(currentMarket) : 'Select a market to inspect'}
              tone="emerald"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(['all', 'momentum-expansion', 'crowded-trend', 'mean-reversion-watch', 'neutral'] as MarketFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${filter === item ? 'border-sky-500/35 bg-sky-500/15 text-sky-100' : 'border-white/10 bg-white/[0.03] text-white/55'
                  }`}
              >
                {item === 'all' ? 'All' : signalLabelCopy(item)}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <StatCard label="Top Opportunity" value={overview?.leaders.topOpportunity || 'N/A'} icon={<Radar className="h-4 w-4" />} />
            <StatCard label="Watch Now" value={String(watchlist?.watchNow.length || 0)} icon={<Waves className="h-4 w-4" />} />
            <StatCard label="Wait Trigger" value={String(watchlist?.waitTrigger.length || 0)} icon={<Database className="h-4 w-4" />} />
            <StatCard label="Alerts Live" value={String(alerts.length)} icon={<AlertTriangle className="h-4 w-4" />} />
          </div>

          {error ? <div className="mt-3 rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
        </div>

        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="grid gap-4">
            <Panel title="Setup Board">
              <div className="overflow-auto">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[84px_160px_92px_92px_110px_minmax(180px,1fr)] gap-3 border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                    <span>Symbol</span>
                    <span>Setup</span>
                    <span>Score</span>
                    <span>24h</span>
                    <span>Pressure</span>
                    <span>Why Now</span>
                  </div>
                  {((watchlist?.watchNow?.length ? watchlist.watchNow : markets).slice(0, 10)).map((market) => (
                    <button
                      key={`setup-board-${market.symbol}`}
                      type="button"
                      onClick={() => setSelectedSymbol(market.symbol)}
                      className={`grid w-full grid-cols-[84px_160px_92px_92px_110px_minmax(180px,1fr)] gap-3 border-b border-white/5 px-3 py-3 text-left text-sm ${
                        currentMarket?.symbol === market.symbol ? 'bg-sky-500/10' : 'bg-transparent'
                      }`}
                    >
                      <span className="truncate font-semibold text-white">{market.symbol}</span>
                      <span className="truncate text-white/80">{setupLabel(market)}</span>
                      <span className="text-sky-200">{market.opportunityScore}</span>
                      <span className={market.change24hPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{formatPct(market.change24hPct)}</span>
                      <span className="text-white/75">{formatCompact(market.estimatedTotalLiquidationUsd || 0)}</span>
                      <span className="truncate text-white/45">{reviewReason(market)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Review Queue">
              <div className="grid gap-2 xl:grid-cols-3">
                {reviewQueue.map((market) => (
                  <button
                    key={`queue-${market.symbol}`}
                    type="button"
                    onClick={() => setSelectedSymbol(market.symbol)}
                    className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-base font-semibold text-white">{market.symbol}</div>
                      <div className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-sky-200">{urgencyLabel(market)}</div>
                    </div>
                    <div className="mt-2 line-clamp-1 text-sm text-white/70">{setupLabel(market)}</div>
                    <div className="mt-1 text-xs text-white/45">{reviewReason(market)}</div>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Decision Ladder">
              <div className="grid gap-3 xl:grid-cols-3">
                {decisionBuckets.map((bucket) => (
                  <div key={bucket.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-white">{bucket.label}</div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">{bucket.description}</div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {bucket.items.length === 0 ? (
                        <div className="text-sm text-white/40">No names here right now.</div>
                      ) : (
                        bucket.items.map((market) => (
                          <button
                            key={`${bucket.label}-${market.symbol}`}
                            type="button"
                            onClick={() => setSelectedSymbol(market.symbol)}
                            className="rounded-xl border border-white/10 bg-black/20 p-3 text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-sm font-semibold text-white">{market.symbol}</div>
                              <div className={`text-[10px] uppercase tracking-[0.14em] ${decisionTone(market)}`}>{urgencyLabel(market)}</div>
                            </div>
                            <div className="mt-1 truncate text-xs text-white/60">{setupLabel(market)}</div>
                            <div className="mt-2 text-[11px] text-white/45">{market.triggerPlan || reviewReason(market)}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Radar">
              <div className="grid gap-2">
                {markets.slice(0, 10).map((market) => {
                  const active = currentMarket?.symbol === market.symbol;
                  return (
                    <button
                      key={market.symbol}
                      type="button"
                      onClick={() => setSelectedSymbol(market.symbol)}
                      className={`flex flex-col min-w-0 gap-3 rounded-2xl border p-3.5 text-left transition hover:border-sky-500/30 ${active ? 'border-sky-500/40 bg-sky-500/10' : 'border-white/10 bg-white/[0.03]'
                        }`}
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <div className="min-w-0 shrink-0">
                          <div className="truncate text-base font-semibold text-white">{market.symbol}</div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Score {market.opportunityScore}</div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Badge>{signalLabelCopy(market.signalLabel)}</Badge>
                          <Badge>{riskLabelCopy(market.riskLabel)}</Badge>
                          {market.decisionLabel ? <Badge>{market.decisionLabel}</Badge> : null}
                          {market.crowdingBias ? <Badge>{market.crowdingBias}</Badge> : null}
                        </div>
                      </div>
                      <div className="flex w-full items-end justify-between gap-3">
                        <div className="flex shrink-0 gap-4 sm:gap-6">
                          <Metric label="24h" value={formatPct(market.change24hPct)} positive={market.change24hPct >= 0} />
                          <Metric label="Vol" value={formatCompact(market.volume24h)} />
                          <Metric label="Exec" value={String(market.executionQuality || 0)} positive={(market.executionQuality || 0) >= 60} />
                          <Metric label="Pressure" value={formatCompact(market.estimatedTotalLiquidationUsd || 0)} />
                        </div>
                        <div className="min-w-0 text-right text-[11px] text-white/45">
                          <div className="truncate">{reviewReason(market)}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Alerts Feed">
              <div className="grid gap-2">
                {visibleAlerts.length === 0 ? (
                  <EmptyState copy="Todavia no hay alertas. El feed se llena con cambios reales de score, OI, funding y precio." />
                ) : (
                  visibleAlerts.map((alert) => (
                    <div key={alert.id} className={`rounded-2xl border px-3 py-3 ${severityClass(alert.severity)}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{alert.symbol}</div>
                        <div className="text-[10px] uppercase tracking-[0.14em]">
                          {alert.type} · {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="mt-1 text-sm">{alert.message}</div>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>

          <div className="grid min-w-0 gap-4">
            <Panel title={currentMarket ? `${currentMarket.symbol} Drilldown` : 'Drilldown'}>
              {!detail ? (
                <EmptyState copy="Selecciona un mercado para ver estructura, microestructura y contexto operativo." />
              ) : (
                <div className="grid min-w-0 gap-4">
                  <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                    <div className="min-w-0">
                      <div className="truncate text-2xl font-semibold text-white">{detail.market.symbol}</div>
                      <div className="mt-1 text-sm text-white/55">
                        ${formatCompact(detail.market.price, 4)} · {formatPct(detail.market.change24hPct)} · funding {formatPct((detail.market.fundingRate || 0) * 100, 3)}
                      </div>
                      <div className="mt-2 text-sm text-white/70">{setupLabel(detail.market)} · {firstCheck(detail.market)}</div>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                      <Badge>{signalLabelCopy(detail.market.signalLabel)}</Badge>
                      <Badge>{riskLabelCopy(detail.market.riskLabel)}</Badge>
                      {detail.market.decisionLabel ? <Badge>{detail.market.decisionLabel}</Badge> : null}
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-3">
                    <StatCard label="Volume 24h" value={formatCompact(detail.market.volume24h)} icon={<Activity className="h-4 w-4" />} />
                    <StatCard label="OI USD" value={formatCompact(detail.market.openInterestUsd)} icon={<Database className="h-4 w-4" />} />
                    <StatCard label="Pressure" value={formatCompact(detail.market.estimatedTotalLiquidationUsd || 0)} icon={<AlertTriangle className="h-4 w-4" />} />
                    <StatCard label="Exec Quality" value={String(detail.market.executionQuality || 0)} icon={<Radar className="h-4 w-4" />} />
                    <StatCard
                      label="Orderbook"
                      value={formatPct(detail.orderbook.stats.imbalance * 100, 1)}
                      icon={<ArrowUpRight className="h-4 w-4" />}
                    />
                    <StatCard label="Trade Flow" value={formatPct(detail.trades.stats.imbalance * 100, 1)} icon={<ShieldAlert className="h-4 w-4" />} />
                  </div>

                  <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                    <MiniPanel label="Trigger Plan">
                      <div className="text-sm text-white/75">{detail.market.triggerPlan || firstCheck(detail.market)}</div>
                    </MiniPanel>
                    <MiniPanel label="Invalidation">
                      <div className="text-sm text-white/75">{detail.market.invalidationPlan || 'Invalidate if price, OI and flow stop confirming the thesis.'}</div>
                    </MiniPanel>
                  </div>

                  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(220px,0.85fr)]">
                    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Price vs Score</div>
                        <div className="text-[11px] text-white/40">{history.length} pts</div>
                      </div>
                      <div className="mt-3 h-52">
                        {chartData.length === 0 ? (
                          <EmptyState copy="Esperando snapshots para construir la serie." />
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                              <XAxis dataKey="time" hide />
                              <YAxis yAxisId="price" hide domain={['auto', 'auto']} />
                              <YAxis yAxisId="score" hide orientation="right" domain={[0, 100]} />
                              <Tooltip
                                contentStyle={{
                                  background: 'rgba(2, 6, 23, 0.96)',
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  borderRadius: 16
                                }}
                              />
                              <Line yAxisId="price" type="monotone" dataKey="price" stroke="#38bdf8" strokeWidth={2} dot={false} />
                              <Line yAxisId="score" type="monotone" dataKey="score" stroke="#34d399" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-3">
                      <MiniPanel label="Bid / Ask Depth">
                        <DepthBar
                          label="Bid depth"
                          value={detail.orderbook.stats.bidDepth}
                          compare={detail.orderbook.stats.bidDepth + detail.orderbook.stats.askDepth}
                          tone="emerald"
                        />
                        <DepthBar
                          label="Ask depth"
                          value={detail.orderbook.stats.askDepth}
                          compare={detail.orderbook.stats.bidDepth + detail.orderbook.stats.askDepth}
                          tone="rose"
                        />
                      </MiniPanel>
                      <MiniPanel label="Aggression">
                        <DepthBar
                          label="Buy notional"
                          value={detail.trades.stats.buyNotional}
                          compare={detail.trades.stats.buyNotional + detail.trades.stats.sellNotional}
                          tone="emerald"
                        />
                        <DepthBar
                          label="Sell notional"
                          value={detail.trades.stats.sellNotional}
                          compare={detail.trades.stats.buyNotional + detail.trades.stats.sellNotional}
                          tone="rose"
                        />
                      </MiniPanel>
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                    <MiniPanel label="Last prints">
                      <div className="grid gap-2">
                        {detail.trades.trades.slice(0, 5).map((trade) => (
                          <div key={`${trade.time}-${trade.side}-${trade.notional}`} className="flex items-center justify-between text-xs text-white/65">
                            <span className={trade.side === 'buy' ? 'text-emerald-300' : 'text-rose-300'}>{trade.side}</span>
                            <span>{formatCompact(trade.notional)}</span>
                            <span>{formatCompact(trade.price, 4)}</span>
                          </div>
                        ))}
                      </div>
                    </MiniPanel>
                    <MiniPanel label="Recent candles">
                      <div className="grid gap-2">
                        {detail.candles.candles.slice(-4).reverse().map((candle) => (
                          <div key={candle.time} className="flex items-center justify-between text-xs text-white/65">
                            <span>{new Date(candle.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span>O {formatCompact(candle.open, 4)}</span>
                            <span>C {formatCompact(candle.close, 4)}</span>
                          </div>
                        ))}
                      </div>
                    </MiniPanel>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[24px] border border-white/10 bg-black/25 p-4">
      <div className="break-words text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">{title}</div>
      <div className="mt-3 min-w-0">{children}</div>
    </div>
  );
}

function MiniPanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="break-words text-[10px] font-bold uppercase tracking-[0.14em] leading-relaxed text-white/35">{label}</div>
      <div className="mt-3 grid min-w-0 gap-2">{children}</div>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">{copy}</div>;
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex min-w-0 items-start justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.14em] leading-relaxed text-white/40">
        <span className="min-w-0 break-words">{label}</span>
        <span className="shrink-0 pt-0.5 text-sky-300">{icon}</span>
      </div>
      <div className="mt-2 min-w-0 break-words text-lg font-semibold leading-tight text-white">{value}</div>
    </div>
  );
}

function InsightCard({ label, value, tone }: { label: string; value: string; tone: 'sky' | 'emerald' }) {
  const toneClass = tone === 'sky' ? 'border-sky-500/20 bg-sky-500/10' : 'border-emerald-500/20 bg-emerald-500/10';
  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-2 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div>
      <div className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className={`mt-1 whitespace-nowrap text-sm font-semibold ${positive === undefined ? 'text-white' : positive ? 'text-emerald-300' : 'text-rose-300'}`}>{value}</div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
      {children}
    </div>
  );
}

function DepthBar({
  label,
  value,
  compare,
  tone
}: {
  label: string;
  value: number;
  compare: number;
  tone: 'emerald' | 'rose';
}) {
  const width = compare > 0 ? `${Math.max(4, Math.min(100, (value / compare) * 100))}%` : '0%';
  const background = tone === 'emerald' ? 'from-emerald-500 to-emerald-200' : 'from-rose-500 to-rose-200';
  return (
    <div>
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0">{formatCompact(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className={`h-2 rounded-full bg-gradient-to-r ${background}`} style={{ width }} />
      </div>
    </div>
  );
}
