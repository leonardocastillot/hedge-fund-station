import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import legacyApi from '../services/legacyTradingApi';
import { hyperliquidService, type HyperliquidDetailResponse } from '../services/hyperliquidService';

type LegacyTrade = {
  entry_time?: string;
  exit_time?: string | null;
  entry_price?: number;
  exit_price?: number | null;
  pnl?: number;
  pnl_pct?: number;
  status?: string;
};

type LegacyDetail = {
  strategy_name: string;
  timeframe: string;
  backtest_summary: {
    total_return_pct: number;
    total_trades: number;
    win_rate: number;
    profit_factor: number;
    sharpe_ratio: number;
    max_drawdown_pct: number;
    period_start?: string;
    period_end?: string;
  };
  trades: LegacyTrade[];
};

export default function StrategyDetailPage() {
  const navigate = useNavigate();
  const { strategyName, timeframe } = useParams<{ strategyName: string; timeframe: string }>();
  const decodedName = strategyName ? decodeURIComponent(strategyName) : '';
  const decodedTimeframe = timeframe ? decodeURIComponent(timeframe) : '4h';

  const [legacyDetail, setLegacyDetail] = useState<LegacyDetail | null>(null);
  const [gatewayDetail, setGatewayDetail] = useState<HyperliquidDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!decodedName) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      try {
        const legacyResponse = await legacyApi.get(`/api/backtest/trades/${encodeURIComponent(decodedName)}`, {
          params: { timeframe: decodedTimeframe },
          timeout: 30000
        });
        const payload = legacyResponse.data;
        const trades = payload?.trades?.trades_list ?? payload?.result?.trades ?? payload?.trades ?? [];
        const summary = payload?.backtest_summary ?? payload?.result?.backtest_summary;
        if (summary) {
          setLegacyDetail({
            strategy_name: payload?.strategy_name ?? payload?.result?.strategy_name ?? decodedName,
            timeframe: payload?.timeframe ?? payload?.result?.timeframe ?? decodedTimeframe,
            backtest_summary: summary,
            trades
          });
          setGatewayDetail(null);
          return;
        }
      } catch {
        // Fallback below
      }

      try {
        const detail = await hyperliquidService.getDetail(decodedName, '1h', 24);
        setGatewayDetail(detail);
        setLegacyDetail(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load strategy detail.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [decodedName, decodedTimeframe]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 flex min-h-[50vh] items-center justify-center">
        <div className="h-9 w-9 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (legacyDetail) {
    const summary = legacyDetail.backtest_summary;
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <Hero title={legacyDetail.strategy_name} subtitle={`Legacy trading backend • ${legacyDetail.timeframe}`} onBack={() => navigate('/strategies')} />
        <div className="grid gap-3 md:grid-cols-5">
          <Metric label="Return" value={`${summary.total_return_pct >= 0 ? '+' : ''}${summary.total_return_pct.toFixed(2)}%`} tone={summary.total_return_pct >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
          <Metric label="Win Rate" value={`${summary.win_rate.toFixed(1)}%`} />
          <Metric label="Sharpe" value={summary.sharpe_ratio.toFixed(2)} />
          <Metric label="Drawdown" value={`${summary.max_drawdown_pct.toFixed(1)}%`} />
          <Metric label="Trades" value={String(summary.total_trades)} />
        </div>
        <Panel title="Backtest Window">
          <div className="text-sm text-white/70">
            {summary.period_start || 'N/A'} {'->'} {summary.period_end || 'N/A'}
          </div>
        </Panel>
        <Panel title="Trade Sample">
          <div className="grid gap-2">
            {legacyDetail.trades.slice(0, 20).map((trade, index) => (
              <div key={`${trade.entry_time}-${index}`} className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-5">
                <div className="text-sm text-white/80">{trade.entry_time ? new Date(trade.entry_time).toLocaleString() : 'N/A'}</div>
                <div className="text-sm text-white/60">{trade.status || 'closed'}</div>
                <div className="text-sm text-white/60">${trade.entry_price?.toFixed(2) ?? 'N/A'} {'->'} ${trade.exit_price?.toFixed(2) ?? 'N/A'}</div>
                <div className={`text-sm font-semibold ${(trade.pnl ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>${(trade.pnl ?? 0).toFixed(2)}</div>
                <div className={`text-sm font-semibold ${(trade.pnl_pct ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{(trade.pnl_pct ?? 0).toFixed(2)}%</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  if (gatewayDetail) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <Hero title={gatewayDetail.market.symbol} subtitle="Hyperliquid gateway fallback" onBack={() => navigate('/strategies')} />
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Price" value={gatewayDetail.market.price ? `$${gatewayDetail.market.price.toLocaleString()}` : 'N/D'} />
          <Metric label="24h Move" value={`${gatewayDetail.market.change24hPct >= 0 ? '+' : ''}${gatewayDetail.market.change24hPct.toFixed(2)}%`} tone={gatewayDetail.market.change24hPct >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
          <Metric label="Funding" value={gatewayDetail.market.fundingRate !== null && gatewayDetail.market.fundingRate !== undefined ? `${(gatewayDetail.market.fundingRate * 100).toFixed(4)}%` : 'N/D'} />
          <Metric label="OI USD" value={gatewayDetail.market.openInterestUsd ? `$${(gatewayDetail.market.openInterestUsd / 1_000_000).toFixed(1)}M` : 'N/D'} />
        </div>
        <Panel title="Trigger">
          <div className="text-sm text-white/70">{gatewayDetail.market.triggerPlan || 'No trigger plan stored.'}</div>
        </Panel>
        <Panel title="Invalidation">
          <div className="text-sm text-white/70">{gatewayDetail.market.invalidationPlan || 'No invalidation stored.'}</div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 p-6 text-center">
        <div className="text-lg font-semibold text-rose-100">Strategy detail unavailable.</div>
        <div className="mt-2 text-sm text-rose-100/80">{error || 'Neither backend returned this strategy.'}</div>
      </div>
    </div>
  );
}

function Hero({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <div className="rounded-[24px] border border-cyan-500/15 bg-[linear-gradient(140deg,rgba(6,182,212,0.16),rgba(15,23,42,0.92))] p-5">
      <button onClick={onBack} className="text-sm font-semibold text-cyan-200/80 hover:text-cyan-100">Back to Strategies</button>
      <h1 className="mt-2 text-3xl font-semibold text-white">{title}</h1>
      <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
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

function Metric({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
