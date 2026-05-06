import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Beaker, BookOpen, RefreshCcw, TrendingDown, TrendingUp } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { hyperliquidService, type HyperliquidHistoryPoint, type HyperliquidPaperSignal, type HyperliquidPaperTrade } from '@/services/hyperliquidService';
import { useMarketPolling } from '@/hooks/useMarketPolling';

type PaperView = 'signals' | 'trades' | 'review';
type ReviewForm = { close_reason: string; outcome_tag: string; execution_score: number; notes: string };

function formatCompact(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) return 'N/A';
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(digits)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(digits)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(digits)}K`;
  return value.toFixed(digits);
}

const defaultReviewForm = (): ReviewForm => ({
  close_reason: 'target-hit',
  outcome_tag: 'valid-setup',
  execution_score: 7,
  notes: ''
});

export default function HyperliquidPaperLabPage() {
  const [signals, setSignals] = useState<HyperliquidPaperSignal[]>([]);
  const [trades, setTrades] = useState<HyperliquidPaperTrade[]>([]);
  const [activeView, setActiveView] = useState<PaperView>('trades');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewTradeId, setReviewTradeId] = useState<number | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewForm>(defaultReviewForm);
  const [selectedReplayTradeId, setSelectedReplayTradeId] = useState<number | null>(null);
  const [replayHistory, setReplayHistory] = useState<HyperliquidHistoryPoint[]>([]);
  const [replayLoading, setReplayLoading] = useState(false);

  const paperPoll = useMarketPolling(
    'hyperliquid:paper-lab',
    async () => {
      const [signalsPayload, tradesPayload] = await Promise.all([
        hyperliquidService.getPaperSignals(24),
        hyperliquidService.getPaperTrades('all')
      ]);
      return { signals: signalsPayload.signals, trades: tradesPayload.trades };
    },
    { intervalMs: 10_000, staleAfterMs: 30_000 }
  );

  useEffect(() => {
    setLoading(paperPoll.status === 'loading' || paperPoll.isRefreshing);
    if (paperPoll.data) {
      setSignals(paperPoll.data.signals);
      setTrades(paperPoll.data.trades);
      setError(paperPoll.status === 'stale' ? paperPoll.error : null);
      return;
    }
    if (paperPoll.status === 'error') {
      setError(paperPoll.error || 'No se pudo cargar el paper lab.');
    }
  }, [paperPoll.data, paperPoll.error, paperPoll.isRefreshing, paperPoll.status]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const openSignals = useMemo(() => signals.filter((signal) => signal.status === 'open'), [signals]);
  const openTrades = useMemo(() => trades.filter((trade) => trade.status === 'open'), [trades]);
  const closedTrades = useMemo(() => trades.filter((trade) => trade.status === 'closed'), [trades]);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredSignals = useMemo(() => {
    if (!normalizedSearch) return signals;
    return signals.filter((signal) => signal.symbol.toLowerCase().includes(normalizedSearch) || signal.setupTag.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, signals]);
  const filteredTrades = useMemo(() => {
    if (!normalizedSearch) return trades;
    return trades.filter((trade) => trade.symbol.toLowerCase().includes(normalizedSearch) || trade.setupTag.toLowerCase().includes(normalizedSearch) || trade.side.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, trades]);
  const pnlSummary = useMemo(() => ({
    openPnl: openTrades.reduce((sum, trade) => sum + (trade.unrealizedPnlUsd || 0), 0),
    closedPnl: closedTrades.reduce((sum, trade) => sum + (trade.realizedPnlUsd || 0), 0)
  }), [closedTrades, openTrades]);
  const paperAnalytics = useMemo(() => {
    const wins = closedTrades.filter((trade) => (trade.realizedPnlUsd || 0) > 0).length;
    const bySetupMap = new Map<string, { count: number; open: number; closed: number; pnlUsd: number }>();
    const byDecisionMap = new Map<string, { count: number; wins: number; pnlUsd: number }>();
    for (const trade of trades) {
      const bucket = bySetupMap.get(trade.setupTag) || { count: 0, open: 0, closed: 0, pnlUsd: 0 };
      bucket.count += 1;
      if (trade.status === 'open') {
        bucket.open += 1;
        bucket.pnlUsd += trade.unrealizedPnlUsd || 0;
      } else {
        bucket.closed += 1;
        bucket.pnlUsd += trade.realizedPnlUsd || 0;
      }
      bySetupMap.set(trade.setupTag, bucket);

      const decisionLabel = trade.decisionLabel || 'unknown';
      const decisionBucket = byDecisionMap.get(decisionLabel) || { count: 0, wins: 0, pnlUsd: 0 };
      decisionBucket.count += 1;
      if ((trade.realizedPnlUsd || 0) > 0) {
        decisionBucket.wins += 1;
      }
      decisionBucket.pnlUsd += trade.status === 'open' ? trade.unrealizedPnlUsd || 0 : trade.realizedPnlUsd || 0;
      byDecisionMap.set(decisionLabel, decisionBucket);
    }
    return {
      openTrades: openTrades.length,
      closedTrades: closedTrades.length,
      winRate: closedTrades.length ? (wins / closedTrades.length) * 100 : 0,
      bySetup: Array.from(bySetupMap.entries()).map(([setupTag, values]) => ({ setupTag, ...values })).sort((a, b) => b.pnlUsd - a.pnlUsd),
      byDecision: Array.from(byDecisionMap.entries()).map(([decisionLabel, values]) => ({
        decisionLabel,
        ...values,
        winRate: values.count ? (values.wins / values.count) * 100 : 0
      })).sort((a, b) => b.pnlUsd - a.pnlUsd),
      recentSignals: signals.slice(0, 8)
    };
  }, [closedTrades, openTrades.length, signals, trades]);
  const reviewAnalytics = useMemo(() => {
    const reviewedTrades = closedTrades.filter((trade) => trade.review);
    const reviewCoverage = closedTrades.length ? (reviewedTrades.length / closedTrades.length) * 100 : 0;
    const avgExecutionScore = reviewedTrades.length ? reviewedTrades.reduce((sum, trade) => sum + (trade.review?.executionScore || 0), 0) / reviewedTrades.length : 0;
    const avgHoldMinutes = closedTrades.length
      ? closedTrades.reduce((sum, trade) => sum + Math.max(0, ((trade.closedAt || trade.createdAt) - trade.createdAt) / 60_000), 0) / closedTrades.length
      : 0;
    const byReasonMap = new Map<string, number>();
    const byOutcomeMap = new Map<string, number>();
    const bySymbolMap = new Map<string, { trades: number; pnlUsd: number; wins: number }>();
    for (const trade of closedTrades) {
      const symbolBucket = bySymbolMap.get(trade.symbol) || { trades: 0, pnlUsd: 0, wins: 0 };
      symbolBucket.trades += 1;
      symbolBucket.pnlUsd += trade.realizedPnlUsd || 0;
      if ((trade.realizedPnlUsd || 0) > 0) symbolBucket.wins += 1;
      bySymbolMap.set(trade.symbol, symbolBucket);
      if (trade.review?.closeReason) byReasonMap.set(trade.review.closeReason, (byReasonMap.get(trade.review.closeReason) || 0) + 1);
      if (trade.review?.outcomeTag) byOutcomeMap.set(trade.review.outcomeTag, (byOutcomeMap.get(trade.review.outcomeTag) || 0) + 1);
    }
    return {
      reviewedTrades,
      reviewCoverage,
      avgExecutionScore,
      avgHoldMinutes,
      byReason: Array.from(byReasonMap.entries()).sort((a, b) => b[1] - a[1]),
      byOutcome: Array.from(byOutcomeMap.entries()).sort((a, b) => b[1] - a[1]),
      bySymbol: Array.from(bySymbolMap.entries()).map(([symbol, values]) => ({
        symbol,
        ...values,
        winRate: values.trades ? (values.wins / values.trades) * 100 : 0
      })).sort((a, b) => b.pnlUsd - a.pnlUsd).slice(0, 6)
    };
  }, [closedTrades]);
  const sessionAnalytics = useMemo(() => {
    const buckets = new Map<string, { trades: number; wins: number; pnlUsd: number }>();
    for (const trade of closedTrades) {
      const hour = new Date(trade.createdAt).getHours();
      const label = `${String(hour).padStart(2, '0')}:00`;
      const bucket = buckets.get(label) || { trades: 0, wins: 0, pnlUsd: 0 };
      bucket.trades += 1;
      bucket.pnlUsd += trade.realizedPnlUsd || 0;
      if ((trade.realizedPnlUsd || 0) > 0) {
        bucket.wins += 1;
      }
      buckets.set(label, bucket);
    }
    return Array.from(buckets.entries())
      .map(([hour, values]) => ({
        hour,
        ...values,
        winRate: values.trades ? (values.wins / values.trades) * 100 : 0
      }))
      .sort((a, b) => b.pnlUsd - a.pnlUsd)
      .slice(0, 6);
  }, [closedTrades]);
  const selectedReplayTrade = useMemo(() => {
    return closedTrades.find((trade) => trade.id === selectedReplayTradeId) || closedTrades[0] || null;
  }, [closedTrades, selectedReplayTradeId]);
  const replayChartData = useMemo(() => {
    if (!selectedReplayTrade) {
      return [];
    }
    const endTime = selectedReplayTrade.closedAt || selectedReplayTrade.createdAt;
    const startTime = selectedReplayTrade.createdAt - 30 * 60_000;
    const finishTime = endTime + 30 * 60_000;
    return replayHistory
      .filter((point) => point.time >= startTime && point.time <= finishTime)
      .map((point) => ({
        time: new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: point.time,
        price: point.price ?? 0,
        score: point.opportunityScore,
        oi: point.openInterestUsd ?? 0
      }));
  }, [replayHistory, selectedReplayTrade]);

  useEffect(() => {
    if (!selectedReplayTrade) {
      setReplayHistory([]);
      return;
    }
    let mounted = true;
    const loadReplay = async () => {
      setReplayLoading(true);
      try {
        const payload = await hyperliquidService.getHistory(selectedReplayTrade.symbol, 120);
        if (!mounted) {
          return;
        }
        setReplayHistory(payload.points);
      } catch {
        if (mounted) {
          setReplayHistory([]);
        }
      } finally {
        if (mounted) {
          setReplayLoading(false);
        }
      }
    };
    void loadReplay();
    return () => {
      mounted = false;
    };
  }, [selectedReplayTrade?.id, selectedReplayTrade?.symbol]);

  const handleSeedSignals = async () => {
    setLoading(true);
    try {
      const result = await hyperliquidService.seedPaperSignals(6);
      setNotice(`Signals seeded: ${result.created}`);
      await paperPoll.refresh();
    } catch (err: any) {
      setError(err.message || 'No se pudieron generar senales.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTrade = async (signal: HyperliquidPaperSignal) => {
    if (!signal.entryPrice || signal.direction === 'neutral') {
      setError('La senal no tiene un entry utilizable.');
      return;
    }
    setLoading(true);
    try {
      await hyperliquidService.createPaperTrade({
        symbol: signal.symbol,
        side: signal.direction === 'long' ? 'long' : 'short',
        setup_tag: signal.setupTag,
        thesis: signal.thesis,
        entry_price: signal.entryPrice,
        size_usd: 500,
        stop_loss_pct: 0.6,
        take_profit_pct: 1.2,
        decision_label: signal.decisionLabel || undefined,
        trigger_plan: signal.triggerPlan || undefined,
        invalidation_plan: signal.invalidation || undefined,
        execution_quality: signal.executionQuality || undefined
      });
      setNotice(`Paper trade opened for ${signal.symbol}`);
      await paperPoll.refresh();
    } catch (err: any) {
      setError(err.message || 'No se pudo abrir el paper trade.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseTrade = async (tradeId: number) => {
    setLoading(true);
    try {
      await hyperliquidService.closePaperTrade(tradeId);
      setNotice(`Trade ${tradeId} closed`);
      await paperPoll.refresh();
    } catch (err: any) {
      setError(err.message || 'No se pudo cerrar el trade.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReview = async (tradeId: number) => {
    setLoading(true);
    try {
      await hyperliquidService.reviewPaperTrade(tradeId, reviewForm);
      setNotice(`Review saved for trade ${tradeId}`);
      setReviewTradeId(null);
      setReviewForm(defaultReviewForm());
      await paperPoll.refresh();
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar el review.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.10),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.10),_transparent_26%),linear-gradient(180deg,#020617_0%,#07111d_100%)] p-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="rounded-[24px] border border-emerald-500/20 bg-black/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/70">Paper Lab</div>
              <div className="mt-1 text-xl font-semibold text-white">Valida ideas rapidas con pnl, journal y review disciplinado.</div>
            </div>
            <div className="flex gap-2">
              <ActionButton onClick={() => void paperPoll.refresh()} icon={<RefreshCcw className="h-4 w-4" />} label={paperPoll.status === 'stale' ? 'Refresh Stale' : 'Refresh'} />
              <ActionButton onClick={handleSeedSignals} icon={<Beaker className="h-4 w-4" />} label="Seed Signals" tone="emerald" />
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <StatCard label="Open Signals" value={String(openSignals.length)} />
            <StatCard label="Open Trades" value={String(paperAnalytics.openTrades)} />
            <StatCard label="Closed Trades" value={String(paperAnalytics.closedTrades)} />
            <StatCard label="Win Rate" value={`${paperAnalytics.winRate.toFixed(1)}%`} positive={paperAnalytics.winRate >= 50} />
            <StatCard label="Open PnL" value={formatCompact(pnlSummary.openPnl)} positive={pnlSummary.openPnl >= 0} />
            <StatCard label="Closed PnL" value={formatCompact(pnlSummary.closedPnl)} positive={pnlSummary.closedPnl >= 0} />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Review Coverage" value={`${reviewAnalytics.reviewCoverage.toFixed(0)}%`} positive={reviewAnalytics.reviewCoverage >= 75} />
            <StatCard label="Avg Exec Score" value={reviewAnalytics.reviewedTrades.length ? `${reviewAnalytics.avgExecutionScore.toFixed(1)}/10` : 'N/A'} positive={reviewAnalytics.avgExecutionScore >= 7} />
            <StatCard label="Avg Hold" value={reviewAnalytics.avgHoldMinutes ? `${reviewAnalytics.avgHoldMinutes.toFixed(0)}m` : 'N/A'} />
            <StatCard label="Filter" value={normalizedSearch ? normalizedSearch.toUpperCase() : 'ALL'} />
          </div>

          {error ? <div className="mt-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
          {notice ? <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</div> : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.55fr_0.45fr]">
          <Panel title="Performance By Setup">
            {paperAnalytics.bySetup.length === 0 ? (
              <EmptyState copy="No setup analytics yet." />
            ) : (
              <div className="grid gap-2">
                {paperAnalytics.bySetup.map((setup) => (
                  <SimpleRow
                    key={setup.setupTag}
                    label={setup.setupTag}
                    meta={`${setup.count} trades · ${setup.open} open · ${setup.closed} closed`}
                    value={formatCompact(setup.pnlUsd)}
                    positive={setup.pnlUsd >= 0}
                  />
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Decision Quality">
            {paperAnalytics.byDecision.length === 0 ? (
              <EmptyState copy="No decision analytics yet." />
            ) : (
              <div className="grid gap-2">
                {paperAnalytics.byDecision.map((decision) => (
                  <SimpleRow
                    key={decision.decisionLabel}
                    label={decision.decisionLabel}
                    meta={`${decision.count} trades · ${decision.winRate.toFixed(0)}% win`}
                    value={formatCompact(decision.pnlUsd)}
                    positive={decision.pnlUsd >= 0}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.55fr_0.45fr]">
          <Panel title="Review Pulse" rightSlot={<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter symbol or setup" className="w-full max-w-[240px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <MiniList title="Close Reasons" items={reviewAnalytics.byReason.map(([label, count]) => ({ label, value: `${count}` }))} emptyCopy="No trade reviews yet." />
              <MiniList title="Outcome Tags" items={reviewAnalytics.byOutcome.map(([label, count]) => ({ label, value: `${count}` }))} emptyCopy="Review outcomes will show here." />
            </div>
          </Panel>
        </div>

        <Panel
          title="Trading Loop"
          rightSlot={
            <div className="flex flex-wrap gap-2">
              {([
                ['signals', `Signals ${filteredSignals.length}`],
                ['trades', `Trades ${filteredTrades.length}`],
                ['review', `Review ${reviewAnalytics.reviewedTrades.length}`]
              ] as Array<[PaperView, string]>).map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setActiveView(view)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                    activeView === view ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-white/55'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          {activeView === 'signals' ? (
            <SignalsView signals={filteredSignals} loading={loading} onOpenTrade={handleOpenTrade} />
          ) : null}
          {activeView === 'trades' ? (
            <TradesView
              trades={filteredTrades}
              loading={loading}
              reviewTradeId={reviewTradeId}
              reviewForm={reviewForm}
              onCloseTrade={handleCloseTrade}
              onStartReview={(trade) => {
                setReviewTradeId(trade.id);
                setReviewForm({
                  close_reason: trade.review?.closeReason || 'target-hit',
                  outcome_tag: trade.review?.outcomeTag || 'valid-setup',
                  execution_score: trade.review?.executionScore || 7,
                  notes: trade.review?.notes || ''
                });
              }}
              onCancelReview={() => setReviewTradeId(null)}
              onReviewFormChange={setReviewForm}
              onSaveReview={handleSaveReview}
            />
          ) : null}
          {activeView === 'review' ? (
            <ReviewView
              trades={closedTrades}
              loading={loading}
              analytics={reviewAnalytics}
              sessionAnalytics={sessionAnalytics}
              recentSignals={paperAnalytics.recentSignals}
              replayTrade={selectedReplayTrade}
              replayChartData={replayChartData}
              replayLoading={replayLoading}
              onSelectReplayTrade={(trade) => setSelectedReplayTradeId(trade.id)}
              onJumpToTrade={(trade) => {
                setActiveView('trades');
                setReviewTradeId(trade.id);
                setReviewForm({
                  close_reason: trade.review?.closeReason || 'target-hit',
                  outcome_tag: trade.review?.outcomeTag || 'valid-setup',
                  execution_score: trade.review?.executionScore || 7,
                  notes: trade.review?.notes || ''
                });
              }}
            />
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

function SignalsView({
  signals,
  loading,
  onOpenTrade
}: {
  signals: HyperliquidPaperSignal[];
  loading: boolean;
  onOpenTrade: (signal: HyperliquidPaperSignal) => void;
}) {
  if (signals.length === 0) {
    return <EmptyState copy={loading ? 'Loading signals...' : 'No paper signals yet. Seed them from the watchlist.'} />;
  }
  return (
    <div className="grid gap-2">
      {signals.map((signal) => (
        <div key={signal.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="truncate text-base font-semibold text-white">{signal.symbol}</div>
              <Badge>{signal.setupTag}</Badge>
              <Badge>{signal.direction}</Badge>
              {signal.decisionLabel ? <Badge>{signal.decisionLabel}</Badge> : null}
            </div>
            <div className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-white/35">{signal.confidence}</div>
          </div>
          <div className="mt-2 break-words text-sm text-white/70">{signal.thesis}</div>
          {signal.triggerPlan ? <div className="mt-2 text-xs text-sky-200">Trigger: {signal.triggerPlan}</div> : null}
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/45">
            <span>entry {signal.entryPrice ? formatCompact(signal.entryPrice, 4) : 'N/A'}</span>
            <span>exec {signal.executionQuality || 0}</span>
            <span>{new Date(signal.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={loading || signal.direction === 'neutral' || !signal.entryPrice}
              onClick={() => onOpenTrade(signal)}
              className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-100 disabled:opacity-40"
            >
              Open Paper Trade
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TradesView({
  trades,
  loading,
  reviewTradeId,
  reviewForm,
  onCloseTrade,
  onStartReview,
  onCancelReview,
  onReviewFormChange,
  onSaveReview
}: {
  trades: HyperliquidPaperTrade[];
  loading: boolean;
  reviewTradeId: number | null;
  reviewForm: ReviewForm;
  onCloseTrade: (tradeId: number) => void;
  onStartReview: (trade: HyperliquidPaperTrade) => void;
  onCancelReview: () => void;
  onReviewFormChange: React.Dispatch<React.SetStateAction<ReviewForm>>;
  onSaveReview: (tradeId: number) => void;
}) {
  if (trades.length === 0) {
    return <EmptyState copy={loading ? 'Loading trades...' : 'No paper trades yet.'} />;
  }
  return (
    <div className="grid gap-2">
      {trades.map((trade) => (
        <div key={trade.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="truncate text-base font-semibold text-white">{trade.symbol}</div>
              <Badge>{trade.setupTag}</Badge>
              <Badge>{trade.side}</Badge>
              {trade.decisionLabel ? <Badge>{trade.decisionLabel}</Badge> : null}
              {trade.side === 'long' ? <TrendingUp className="h-4 w-4 text-emerald-300" /> : <TrendingDown className="h-4 w-4 text-rose-300" />}
            </div>
            <div className={`text-sm font-semibold ${(trade.status === 'closed' ? (trade.realizedPnlUsd || 0) : (trade.unrealizedPnlUsd || 0)) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {trade.status === 'closed' ? formatCompact(trade.realizedPnlUsd) : formatCompact(trade.unrealizedPnlUsd)}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/55 sm:grid-cols-4">
            <span>entry {formatCompact(trade.entryPrice, 4)}</span>
            <span>mark {formatCompact(trade.markPrice, 4)}</span>
            <span>size {formatCompact(trade.sizeUsd)}</span>
            <span>exec {trade.executionQuality || 0}</span>
          </div>
          <div className="mt-2 break-words text-sm text-white/65">{trade.thesis}</div>
          {trade.triggerPlan ? <div className="mt-2 text-xs text-sky-200">Trigger: {trade.triggerPlan}</div> : null}
          {trade.invalidationPlan ? <div className="mt-1 text-xs text-amber-200">Invalidation: {trade.invalidationPlan}</div> : null}
          {trade.status === 'open' ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={loading}
                onClick={() => onCloseTrade(trade.id)}
                className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 disabled:opacity-40"
              >
                Close
              </button>
            </div>
          ) : (
            <TradeReviewEditor
              trade={trade}
              loading={loading}
              reviewTradeId={reviewTradeId}
              reviewForm={reviewForm}
              onStartReview={() => onStartReview(trade)}
              onCancelReview={onCancelReview}
              onReviewFormChange={onReviewFormChange}
              onSaveReview={() => onSaveReview(trade.id)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ReviewView({
  trades,
  loading,
  analytics,
  sessionAnalytics,
  recentSignals,
  replayTrade,
  replayChartData,
  replayLoading,
  onSelectReplayTrade,
  onJumpToTrade
}: {
  trades: HyperliquidPaperTrade[];
  loading: boolean;
  analytics: {
    reviewedTrades: HyperliquidPaperTrade[];
    bySymbol: Array<{ symbol: string; trades: number; pnlUsd: number; wins: number; winRate: number }>;
  };
  sessionAnalytics: Array<{ hour: string; trades: number; wins: number; pnlUsd: number; winRate: number }>;
  recentSignals: Array<{ setupTag: string; direction: string; confidence: number; createdAt: number }>;
  replayTrade: HyperliquidPaperTrade | null;
  replayChartData: Array<{ time: string; timestamp: number; price: number; score: number; oi: number }>;
  replayLoading: boolean;
  onSelectReplayTrade: (trade: HyperliquidPaperTrade) => void;
  onJumpToTrade: (trade: HyperliquidPaperTrade) => void;
}) {
  if (trades.length === 0) {
    return <EmptyState copy="Close some trades first. Reviews become useful once you have outcomes to compare." />;
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[0.58fr_0.42fr]">
      <div className="grid gap-2">
        {trades.map((trade) => (
          <div key={`review-${trade.id}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="truncate text-base font-semibold text-white">{trade.symbol}</div>
                <Badge>{trade.setupTag}</Badge>
                <Badge>{trade.side}</Badge>
              </div>
              <div className={`text-sm font-semibold ${(trade.realizedPnlUsd || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatCompact(trade.realizedPnlUsd)}</div>
            </div>
            <div className="mt-2 grid gap-2 text-xs text-white/50 sm:grid-cols-3">
              <span>closed {trade.closedAt ? new Date(trade.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
              <span>hold {trade.closedAt ? `${Math.max(0, ((trade.closedAt - trade.createdAt) / 60_000)).toFixed(0)}m` : 'N/A'}</span>
              <span>exit {formatCompact(trade.exitPrice, 4)}</span>
            </div>
            {trade.review ? (
              <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                <div className="font-semibold uppercase tracking-[0.14em]">Review</div>
                <div className="mt-2 text-white/80">{trade.review.closeReason} · {trade.review.outcomeTag} · exec {trade.review.executionScore}/10</div>
                {trade.review.notes ? <div className="mt-1 text-white/65">{trade.review.notes}</div> : null}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => onSelectReplayTrade(trade)}
                className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-100"
              >
                Replay
              </button>
              {!trade.review ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onJumpToTrade(trade)}
                  className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100"
                >
                  Review This Trade
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        <MiniList
          title="Top Symbols"
          items={analytics.bySymbol.map((item) => ({ label: `${item.symbol} · ${item.winRate.toFixed(0)}% win`, value: formatCompact(item.pnlUsd) }))}
          emptyCopy="Symbol stats will appear here."
        />
        <MiniList
          title="Best Hours"
          items={sessionAnalytics.map((item) => ({ label: `${item.hour} · ${item.trades} trades · ${item.winRate.toFixed(0)}% win`, value: formatCompact(item.pnlUsd) }))}
          emptyCopy="Hour-of-day stats will appear here."
        />
        <MiniList
          title="Signal Flow"
          items={recentSignals.map((signal) => ({ label: `${signal.setupTag} · ${signal.direction}`, value: new Date(signal.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }))}
          emptyCopy="No recent signals yet."
        />
        <ReplayPanel trade={replayTrade} chartData={replayChartData} loading={replayLoading} />
      </div>
    </div>
  );
}

function ReplayPanel({
  trade,
  chartData,
  loading
}: {
  trade: HyperliquidPaperTrade | null;
  chartData: Array<{ time: string; timestamp: number; price: number; score: number; oi: number }>;
  loading: boolean;
}) {
  if (!trade) {
    return <MiniList title="Replay" items={[]} emptyCopy="Select or create closed trades to inspect the market around entry and exit." />;
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Replay</div>
        <div className="text-xs text-white/45">{trade.symbol} · {trade.setupTag}</div>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-white/50 sm:grid-cols-3">
        <span>entry {formatCompact(trade.entryPrice, 4)}</span>
        <span>exit {formatCompact(trade.exitPrice, 4)}</span>
        <span>pnl {formatCompact(trade.realizedPnlUsd)}</span>
      </div>
      <div className="mt-3 h-48">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-white/45">Loading replay...</div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-white/45">No history points around this trade yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="time" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="price" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} width={54} />
              <YAxis yAxisId="score" orientation="right" tick={{ fill: 'rgba(125,211,252,0.65)', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(2, 6, 23, 0.92)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  color: 'white'
                }}
              />
              <ReferenceLine yAxisId="price" y={trade.entryPrice} stroke="rgba(52,211,153,0.6)" strokeDasharray="4 4" />
              {trade.exitPrice ? <ReferenceLine yAxisId="price" y={trade.exitPrice} stroke="rgba(251,191,36,0.6)" strokeDasharray="4 4" /> : null}
              <Line yAxisId="price" type="monotone" dataKey="price" stroke="#f8fafc" dot={false} strokeWidth={2} />
              <Line yAxisId="score" type="monotone" dataKey="score" stroke="#38bdf8" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function TradeReviewEditor({
  trade,
  loading,
  reviewTradeId,
  reviewForm,
  onStartReview,
  onCancelReview,
  onReviewFormChange,
  onSaveReview
}: {
  trade: HyperliquidPaperTrade;
  loading: boolean;
  reviewTradeId: number | null;
  reviewForm: ReviewForm;
  onStartReview: () => void;
  onCancelReview: () => void;
  onReviewFormChange: React.Dispatch<React.SetStateAction<ReviewForm>>;
  onSaveReview: () => void;
}) {
  return (
    <div className="mt-3 grid gap-3">
      {trade.review ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
          <div className="font-semibold uppercase tracking-[0.14em]">Review</div>
          <div className="mt-2 text-white/80">{trade.review.closeReason} · {trade.review.outcomeTag} · exec {trade.review.executionScore}/10</div>
          {trade.review.notes ? <div className="mt-1 text-white/65">{trade.review.notes}</div> : null}
        </div>
      ) : null}
      {reviewTradeId === trade.id ? (
        <div className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={reviewForm.close_reason} onChange={(event) => onReviewFormChange((current) => ({ ...current, close_reason: event.target.value }))} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none">
              <option value="target-hit">target-hit</option>
              <option value="stop-hit">stop-hit</option>
              <option value="manual-exit">manual-exit</option>
              <option value="structure-failed">structure-failed</option>
            </select>
            <select value={reviewForm.outcome_tag} onChange={(event) => onReviewFormChange((current) => ({ ...current, outcome_tag: event.target.value }))} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none">
              <option value="valid-setup">valid-setup</option>
              <option value="late-entry">late-entry</option>
              <option value="bad-risk">bad-risk</option>
              <option value="no-edge">no-edge</option>
            </select>
            <input type="number" min={1} max={10} value={reviewForm.execution_score} onChange={(event) => onReviewFormChange((current) => ({ ...current, execution_score: Number(event.target.value) || 1 }))} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" />
          </div>
          <textarea value={reviewForm.notes} onChange={(event) => onReviewFormChange((current) => ({ ...current, notes: event.target.value }))} placeholder="What was good or wrong in this trade?" className="min-h-[84px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancelReview} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Cancel</button>
            <button type="button" disabled={loading} onClick={onSaveReview} className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100 disabled:opacity-40">Save Review</button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button type="button" disabled={loading} onClick={onStartReview} className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100 disabled:opacity-40">
            {trade.review ? 'Edit Review' : 'Add Review'}
          </button>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children, rightSlot }: { title: string; children: ReactNode; rightSlot?: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
          <BookOpen className="h-4 w-4 text-emerald-300" />
          {title}
        </div>
        {rightSlot}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ActionButton({ onClick, icon, label, tone = 'neutral' }: { onClick: () => void; icon: ReactNode; label: string; tone?: 'neutral' | 'emerald' }) {
  const className = tone === 'emerald'
    ? 'inline-flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100'
    : 'inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/70';
  return <button type="button" onClick={onClick} className={className}>{icon}{label}</button>;
}

function SimpleRow({ label, meta, value, positive }: { label: string; meta: string; value: string; positive?: boolean }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{label}</div>
        <div className="mt-1 text-xs text-white/45">{meta}</div>
      </div>
      <div className={`text-sm font-semibold ${positive === undefined ? 'text-white' : positive ? 'text-emerald-300' : 'text-rose-300'}`}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className={`mt-2 text-lg font-semibold ${positive === undefined ? 'text-white' : positive ? 'text-emerald-300' : 'text-rose-300'}`}>{value}</div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <div className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">{children}</div>;
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">{copy}</div>;
}

function MiniList({ title, items, emptyCopy }: { title: string; items: Array<{ label: string; value: string }>; emptyCopy: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{title}</div>
      <div className="mt-3 grid gap-2">
        {items.length === 0 ? (
          <div className="text-sm text-white/45">{emptyCopy}</div>
        ) : (
          items.map((item) => (
            <div key={`${title}-${item.label}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="min-w-0 truncate text-sm text-white/75">{item.label}</div>
              <div className="shrink-0 text-xs font-semibold text-white">{item.value}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
