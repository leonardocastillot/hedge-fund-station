import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hyperliquidService, type HyperliquidPaperTrade } from '@/services/hyperliquidService';
import { strategyService, type PortfolioStats } from '@/services/strategyService';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
}

function inferPortfolioSource(portfolio: PortfolioStats, trades: HyperliquidPaperTrade[]): 'legacy' | 'gateway' {
  if (portfolio.initial_capital !== 500) {
    return 'legacy';
  }

  if (portfolio.strategies.length > 0 || portfolio.total_trades !== trades.length) {
    return 'legacy';
  }

  return 'gateway';
}

export default function PortfolioDashboardPage() {
  const [portfolio, setPortfolio] = useState<PortfolioStats | null>(null);
  const [trades, setTrades] = useState<HyperliquidPaperTrade[]>([]);
  const [bestHours, setBestHours] = useState<Array<{ hour: string; trades: number; winRate: number; pnlUsd: number }>>([]);
  const [portfolioSource, setPortfolioSource] = useState<'legacy' | 'gateway'>('gateway');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        setError(null);
        const [portfolioResponse, tradesResponse, analyticsResponse] = await Promise.all([
          strategyService.getPortfolioStats(),
          hyperliquidService.getPaperTrades('all'),
          hyperliquidService.getPaperSessionAnalytics()
        ]);
        setPortfolio(portfolioResponse);
        setTrades(tradesResponse.trades);
        setBestHours(analyticsResponse.bestHours ?? []);
        setPortfolioSource(inferPortfolioSource(portfolioResponse, tradesResponse.trades));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load portfolio view.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const summary = useMemo(() => {
    const openTrades = trades.filter((trade) => trade.status === 'open');
    const closedTrades = trades.filter((trade) => trade.status === 'closed');
    const realizedPnl = closedTrades.reduce((sum, trade) => sum + (trade.realizedPnlUsd ?? 0), 0);
    const unrealizedPnl = openTrades.reduce((sum, trade) => sum + (trade.unrealizedPnlUsd ?? 0), 0);
    const notional = trades.reduce((sum, trade) => sum + trade.sizeUsd, 0);
    const wins = closedTrades.filter((trade) => (trade.realizedPnlUsd ?? 0) > 0).length;

    return {
      openTrades,
      closedTrades,
      realizedPnl,
      unrealizedPnl,
      notional,
      winRate: closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0
    };
  }, [trades]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-fuchsia-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <div className="rounded-[24px] border border-fuchsia-500/20 bg-[linear-gradient(135deg,rgba(192,38,211,0.16),rgba(17,24,39,0.92))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-fuchsia-200/80">Portfolio Control</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Deployments and paper-trade telemetry are now split by service ownership.</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Portfolio totals come from the legacy trading backend when available. The trade ledger and session analytics still come from the Hyperliquid gateway.
            </p>
            <div className="mt-3 text-xs uppercase tracking-[0.16em] text-fuchsia-100/70">
              Active portfolio source: {portfolioSource === 'legacy' ? 'legacy trading backend' : 'Hyperliquid gateway fallback'}
            </div>
          </div>

          <Link to="/strategies" className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.12]">
            Open Strategies
          </Link>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total AUM" value={formatCurrency(portfolio?.total_aum ?? summary.notional)} detail={`${portfolio?.active_strategies ?? 0} active strategies`} />
        <StatCard label="Total PnL" value={formatCurrency(portfolio?.total_pnl ?? summary.realizedPnl)} detail={`${portfolio?.total_trades ?? trades.length} tracked trades`} tone={(portfolio?.total_pnl ?? summary.realizedPnl) >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
        <StatCard label="Unrealized PnL" value={formatCurrency(summary.unrealizedPnl)} detail={`${summary.openTrades.length} open gateway trades`} tone={summary.unrealizedPnl >= 0 ? 'text-cyan-300' : 'text-rose-300'} />
        <StatCard label="Win Rate" value={`${summary.winRate.toFixed(0)}%`} detail="closed Hyperliquid sample" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.15fr_0.9fr]">
        <Panel title="Deployments">
          {(portfolio?.strategies ?? []).length === 0 ? (
            <div className="text-sm text-white/55">No deployed strategies recorded in the portfolio service.</div>
          ) : (
            <div className="grid gap-2">
              {portfolio?.strategies.map((deployment) => (
                <div key={deployment.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-semibold text-white">{deployment.strategy_name}</div>
                    <div className="text-xs uppercase tracking-[0.16em] text-white/45">{deployment.status}</div>
                  </div>
                  <div className="text-xs uppercase tracking-[0.16em] text-white/40">
                    {deployment.direction} | {deployment.timeframe} | {deployment.allocation_pct.toFixed(1)}% allocation
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className={deployment.current_pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                      {formatCurrency(deployment.current_pnl)}
                    </span>
                    <span className="text-white/60">{deployment.win_rate_live.toFixed(0)}% WR</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Trade Ledger">
          {trades.length === 0 ? (
            <div className="text-sm text-white/55">No paper trades stored yet. Create one from the strategy surface or the paper lab.</div>
          ) : (
            <div className="grid gap-2">
              {trades.map((trade) => {
                const pnl = trade.realizedPnlUsd ?? trade.unrealizedPnlUsd ?? 0;
                return (
                  <div key={trade.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[110px_minmax(0,1fr)_120px] md:items-center">
                    <div>
                      <div className="text-base font-semibold text-white">{trade.symbol}</div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{trade.setupTag}</div>
                    </div>
                    <div className="text-sm text-white/70">
                      {trade.thesis}
                      <div className="mt-1 text-xs text-white/45">
                        {trade.status.toUpperCase()} | Entry ${trade.entryPrice.toLocaleString()} | Size {formatCurrency(trade.sizeUsd)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-base font-semibold ${pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                      </div>
                      <div className="text-xs text-white/45">{new Date(trade.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Best Local Hours">
          {bestHours.length === 0 ? (
            <div className="text-sm text-white/55">No closed-paper sample yet to rank best hours.</div>
          ) : (
            <div className="grid gap-2">
              {bestHours.slice(0, 6).map((hour) => (
                <div key={hour.hour} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{hour.hour}</div>
                    <div className={`text-sm font-semibold ${hour.pnlUsd >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {hour.pnlUsd >= 0 ? '+' : ''}{formatCurrency(hour.pnlUsd)}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-white/45">{hour.trades} trades | {hour.winRate.toFixed(0)}% win rate</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function StatCard({ label, value, detail, tone = 'text-white' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-sm text-white/50">{detail}</div>
    </div>
  );
}
