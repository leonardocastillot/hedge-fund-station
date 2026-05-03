import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { alphaEngineApi, type EvaluationItem } from '@/services/alphaEngineApi';
import legacyApi from '@/services/legacyTradingApi';
import {
  hyperliquidService,
  type HyperliquidBacktestTrade,
  type HyperliquidDetailResponse,
  type HyperliquidLatestAgentRunResponse,
  type HyperliquidLatestBacktestResponse,
  type HyperliquidPaperTrade,
  type HyperliquidStrategyAuditRow
} from '@/services/hyperliquidService';

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

type TradeFilter = 'all' | 'winners' | 'losers' | 'open-paper';

type NormalizedTrade = {
  id: string;
  source: 'backtest' | 'paper';
  symbol: string;
  side: string;
  status: string;
  entryTime: string | number | null;
  exitTime: string | number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  sizeUsd: number | null;
  grossPnl: number | null;
  netPnl: number | null;
  returnPct: number | null;
  fees: number | null;
  exitReason: string | null;
  thesis: string | null;
  triggerPlan: string | null;
  invalidationPlan: string | null;
  filtersPassed: Record<string, string>;
  filtersFailed: Record<string, string>;
  reasons: string[];
};

type TradeChartPoint = {
  index: number;
  label: string;
  symbol: string;
  side: string;
  pnl: number;
  cumulativePnl: number;
  returnPct: number | null;
  drawdown: number;
  source: string;
};

export default function StrategyDetailPage() {
  const navigate = useNavigate();
  const { strategyName, timeframe } = useParams<{ strategyName: string; timeframe: string }>();
  const decodedName = strategyName ? decodeURIComponent(strategyName) : '';
  const decodedTimeframe = timeframe ? decodeURIComponent(timeframe) : '4h';

  const [legacyDetail, setLegacyDetail] = useState<LegacyDetail | null>(null);
  const [alphaDetail, setAlphaDetail] = useState<EvaluationItem | null>(null);
  const [gatewayDetail, setGatewayDetail] = useState<HyperliquidDetailResponse | null>(null);
  const [auditDetail, setAuditDetail] = useState<HyperliquidStrategyAuditRow | null>(null);
  const [latestBacktest, setLatestBacktest] = useState<HyperliquidLatestBacktestResponse | null>(null);
  const [backtestArtifactError, setBacktestArtifactError] = useState<string | null>(null);
  const [ensuringBacktest, setEnsuringBacktest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [backtestMessage, setBacktestMessage] = useState<string | null>(null);
  const [latestAgentRun, setLatestAgentRun] = useState<HyperliquidLatestAgentRunResponse | null>(null);
  const [runningAgentRun, setRunningAgentRun] = useState(false);
  const [agentRunMessage, setAgentRunMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoEnsureAttemptedRef = useRef(new Set<string>());

  const refreshLatestBacktest = async (strategyId: string, ensureMissing = false) => {
    setBacktestArtifactError(null);
    try {
      const latest = await hyperliquidService.getLatestBacktest(strategyId);
      setLatestBacktest(latest);
    } catch (err) {
      if (ensureMissing && !strategyId.startsWith('runtime:') && !autoEnsureAttemptedRef.current.has(strategyId)) {
        autoEnsureAttemptedRef.current.add(strategyId);
        setEnsuringBacktest(true);
        try {
          const ensured = await hyperliquidService.ensureBacktest(strategyId);
          setLatestBacktest(ensured);
          setBacktestArtifactError(null);
          setBacktestMessage(ensured.created ? 'Backtest evidence generated automatically.' : 'Backtest evidence loaded.');
          try {
            const audit = await hyperliquidService.getStrategyAudit(500);
            const normalizedName = normalizeIdentifier(strategyId);
            const evidence = audit.strategies.find((item) => normalizeIdentifier(item.strategyId) === normalizedName);
            if (evidence) setAuditDetail(evidence);
          } catch {
            // Optional audit refresh; the trade artifact is enough for this view.
          }
          return;
        } catch (ensureErr) {
          setBacktestArtifactError(ensureErr instanceof Error ? ensureErr.message : 'No backtest trade artifact found for this strategy.');
        } finally {
          setEnsuringBacktest(false);
        }
        return;
      }
      setLatestBacktest(null);
      setBacktestArtifactError(err instanceof Error ? err.message : 'No backtest trade artifact found for this strategy.');
    }
  };

  const normalizedTrades = useMemo(() => {
    const backtestTrades = (latestBacktest?.report?.trades ?? []).map((trade, index) => normalizeBacktestTrade(trade, index));
    const paperTrades = (auditDetail?.trades ?? []).map((trade) => normalizePaperTrade(trade));
    return [...backtestTrades, ...paperTrades].sort((a, b) => parseTradeTime(b.entryTime) - parseTradeTime(a.entryTime));
  }, [auditDetail?.trades, latestBacktest?.report?.trades]);

  useEffect(() => {
    const load = async () => {
      if (!decodedName) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setLatestBacktest(null);
      setBacktestArtifactError(null);
      setEnsuringBacktest(false);

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
          setAlphaDetail(null);
          setGatewayDetail(null);
          setAuditDetail(null);
          setLoading(false);
          return;
        }
      } catch {
        // Fallback below
      }

      try {
        const snapshot = await alphaEngineApi.evaluations();
        const normalizedName = decodedName.toLowerCase();
        const evaluation = snapshot.strategies.find((item) => (
          item.strategy_id.toLowerCase() === normalizedName ||
          item.title.toLowerCase() === normalizedName
        ));
        if (evaluation) {
          setAlphaDetail(evaluation);
          setLegacyDetail(null);
          setGatewayDetail(null);
          try {
            const audit = await hyperliquidService.getStrategyAudit(500);
            const normalizedEvaluationId = normalizeIdentifier(evaluation.strategy_id);
            const evidence = audit.strategies.find((item) => normalizeIdentifier(item.strategyId) === normalizedEvaluationId);
            setAuditDetail(evidence ?? null);
          } catch {
            setAuditDetail(null);
          }
          void refreshLatestBacktest(evaluation.strategy_id, true);
          setLoading(false);
          return;
        }
      } catch {
        // Gateway fallback below
      }

      try {
        const audit = await hyperliquidService.getStrategyAudit(500);
        const normalizedName = normalizeIdentifier(decodedName);
        const evidence = audit.strategies.find((item) => {
          const candidates = [
            item.strategyKey,
            item.strategyId,
            item.displayName,
            `${item.symbol ?? ''} ${item.setupTag ?? ''}`.trim()
          ].map(normalizeIdentifier);
          return candidates.includes(normalizedName);
        });
        if (evidence) {
          setAuditDetail(evidence);
          setLegacyDetail(null);
          setAlphaDetail(null);
          setGatewayDetail(null);
          void refreshLatestBacktest(evidence.strategyId, true);
          setLoading(false);
          return;
        }
      } catch {
        // Gateway symbol fallback below.
      }

      try {
        const detail = await hyperliquidService.getDetail(resolveGatewaySymbol(decodedName), '1h', 24);
        setGatewayDetail(detail);
        setAlphaDetail(null);
        setLegacyDetail(null);
        setAuditDetail(null);
        setLatestBacktest(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No backend evidence or gateway market matched this strategy.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [decodedName, decodedTimeframe]);

  useEffect(() => {
    const strategyId = auditDetail?.strategyId || alphaDetail?.strategy_id;
    if (!strategyId || strategyId.startsWith('runtime:')) {
      setLatestAgentRun(null);
      return;
    }
    let cancelled = false;
    hyperliquidService.getLatestAgentRun(strategyId)
      .then((response) => {
        if (!cancelled) setLatestAgentRun(response);
      })
      .catch(() => {
        if (!cancelled) setLatestAgentRun(null);
      });
    return () => {
      cancelled = true;
    };
  }, [alphaDetail?.strategy_id, auditDetail?.strategyId]);

  const runBackendBacktest = async (strategyId: string) => {
    setRunningBacktest(true);
    setBacktestMessage(null);
    try {
      const result = await hyperliquidService.runBacktest(strategyId, true);
      const windowText = result.datasetStart && result.datasetEnd ? ` (${result.datasetStart.slice(0, 10)} -> ${result.datasetEnd.slice(0, 10)})` : '';
      setBacktestMessage(`Backtest listo${windowText}: ${result.summary.total_trades} trades, retorno ${formatPercent(result.summary.return_pct)}, validacion ${result.validation?.status ?? 'N/D'}.`);
      await refreshLatestBacktest(strategyId);
      try {
        const audit = await hyperliquidService.getStrategyAudit(500);
        const normalizedName = normalizeIdentifier(strategyId);
        const evidence = audit.strategies.find((item) => normalizeIdentifier(item.strategyId) === normalizedName);
        if (evidence) {
          setAuditDetail(evidence);
          setAlphaDetail(null);
          setLegacyDetail(null);
          setGatewayDetail(null);
        }
      } catch {
        // The backtest API is served by the VM alpha engine; local gateway audit is optional.
      }
    } catch (err) {
      setBacktestMessage(err instanceof Error ? err.message : 'No se pudo correr el backtest en el gateway.');
    } finally {
      setRunningBacktest(false);
    }
  };

  const runAgentResearch = async (strategyId: string) => {
    setRunningAgentRun(true);
    setAgentRunMessage(null);
    try {
      const response = await hyperliquidService.runAgentResearch({ strategy_id: strategyId, runtime: 'auto' });
      const latest = await hyperliquidService.getLatestAgentRun(response.strategyId);
      setLatestAgentRun(latest);
      setAgentRunMessage(`Research OS listo: ${response.recommendation}, ${response.blockerCount} blockers.`);
    } catch (err) {
      setAgentRunMessage(err instanceof Error ? err.message : 'No se pudo correr Research OS.');
    } finally {
      setRunningAgentRun(false);
    }
  };

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

  if (alphaDetail) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <Hero title={alphaDetail.title} subtitle={`Alpha engine evaluation • ${alphaDetail.stage} • ${alphaDetail.promotion_state}`} onBack={() => navigate('/strategies')} />
        <BacktestAction
          strategyId={alphaDetail.strategy_id}
          running={runningBacktest}
          message={backtestMessage}
          onRun={() => void runBackendBacktest(alphaDetail.strategy_id)}
        />
        <AgenticResearchSummary
          latest={latestAgentRun}
          running={runningAgentRun}
          message={agentRunMessage}
          onRun={() => void runAgentResearch(alphaDetail.strategy_id)}
        />
        <div className="grid gap-3 md:grid-cols-5">
          <Metric label="Return" value={alphaDetail.return_pct === null ? 'N/D' : `${alphaDetail.return_pct >= 0 ? '+' : ''}${alphaDetail.return_pct.toFixed(2)}%`} tone={(alphaDetail.return_pct ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
          <Metric label="Win Rate" value={alphaDetail.win_rate_pct === null ? 'N/D' : `${alphaDetail.win_rate_pct.toFixed(1)}%`} />
          <Metric label="Profit Factor" value={alphaDetail.profit_factor === null ? 'N/D' : alphaDetail.profit_factor.toFixed(2)} />
          <Metric label="Drawdown" value={alphaDetail.max_drawdown_pct === null ? 'N/D' : `${alphaDetail.max_drawdown_pct.toFixed(1)}%`} />
          <Metric label="Trades" value={String(alphaDetail.total_trades ?? 0)} />
        </div>
        <TradesSection
          trades={normalizedTrades}
          expectedTrades={alphaDetail.total_trades ?? null}
          artifactPath={latestBacktest?.reportPath ?? null}
          artifactError={backtestArtifactError}
          loadingEvidence={ensuringBacktest}
          emptyAction="No backtest trade artifact found for this strategy. Run Backtest to generate inspectable trade evidence."
        />
        <Panel title="Validation Notes">
          <div className="grid gap-2">
            {(alphaDetail.notes.length > 0 ? alphaDetail.notes : ['No validation notes returned by the alpha engine.']).map((note, index) => (
              <div key={`${note}-${index}`} className="text-sm text-white/70">{note}</div>
            ))}
          </div>
        </Panel>
        <Panel title="Backend Evidence">
          <div className="grid gap-2 text-sm text-white/70 md:grid-cols-2">
            <div>Strategy ID: {alphaDetail.strategy_id}</div>
            <div>Dataset: {alphaDetail.dataset_mode || 'N/D'} ({alphaDetail.dataset_rows} rows)</div>
            <div>Proxy: {alphaDetail.proxy_model}</div>
            <div>Last run: {alphaDetail.last_run_at || 'N/D'}</div>
          </div>
        </Panel>
      </div>
    );
  }

  if (auditDetail) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <Hero title={auditDetail.displayName} subtitle={`Strategy evidence • ${auditDetail.stage.replace(/_/g, ' ')}`} onBack={() => navigate('/strategies')} />
        <BacktestAction
          strategyId={auditDetail.strategyId}
          running={runningBacktest}
          message={backtestMessage}
          onRun={() => void runBackendBacktest(auditDetail.strategyId)}
        />
        <AgenticResearchSummary
          latest={latestAgentRun}
          running={runningAgentRun}
          message={agentRunMessage}
          onRun={() => void runAgentResearch(auditDetail.strategyId)}
        />
        <div className="grid gap-3 md:grid-cols-5">
          <Metric label="Trades" value={String(auditDetail.tradeCount)} />
          <Metric label="Backtest" value={String(auditDetail.evidenceCounts.backtestTrades)} />
          <Metric label="Paper" value={String(auditDetail.evidenceCounts.paperTrades)} />
          <Metric label="Win Rate" value={`${auditDetail.winRate.toFixed(1)}%`} />
          <Metric label="PnL" value={formatCurrency(auditDetail.totalPnlUsd)} tone={auditDetail.totalPnlUsd >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
        </div>
        <TradesSection
          trades={normalizedTrades}
          expectedTrades={auditDetail.tradeCount}
          artifactPath={latestBacktest?.reportPath ?? auditDetail.latestArtifactPaths.backtest}
          artifactError={backtestArtifactError}
          loadingEvidence={ensuringBacktest}
          emptyAction="No backtest trade artifact found for this strategy. Run Backtest to generate inspectable trade evidence."
        />
        <Panel title="Evidence Sources">
          <div className="grid gap-2 text-sm text-white/70 md:grid-cols-2">
            <div>Strategy ID: {auditDetail.strategyId}</div>
            <div>Sources: {auditDetail.sourceTypes.join(', ') || 'N/D'}</div>
            <div>Validation: {auditDetail.validationStatus || 'N/D'}</div>
            <div>Missing: {auditDetail.missingAuditItems.join(', ') || 'none'}</div>
          </div>
        </Panel>
        <Panel title="Timeline">
          <div className="grid gap-2">
            {auditDetail.timeline.slice(0, 20).map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                    <div className="mt-1 text-xs text-white/45">{item.timestampMs ? new Date(item.timestampMs).toLocaleString() : 'N/D'} | {item.type}</div>
                  </div>
                  {typeof item.pnlUsd === 'number' ? (
                    <div className={`text-sm font-semibold ${item.pnlUsd >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatCurrency(item.pnlUsd)}</div>
                  ) : null}
                </div>
                {item.subtitle ? <div className="mt-2 text-sm text-white/60">{item.subtitle}</div> : null}
              </div>
            ))}
            {auditDetail.timeline.length === 0 ? <div className="text-sm text-white/55">Strategy found, but no timeline evidence is attached yet.</div> : null}
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

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/[-\s]+/g, '_');
}

function resolveGatewaySymbol(value: string): string {
  return value.trim().split(/\s+/)[0]?.toUpperCase() || value.toUpperCase();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatOptionalCurrency(value: number | null): string {
  return value === null ? 'N/D' : formatCurrency(value);
}

function formatOptionalPercent(value: number | null): string {
  return value === null ? 'N/D' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatPrice(value: number | null): string {
  if (value === null) return 'N/D';
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 })}`;
}

function formatTradeTime(value: string | number | null): string {
  if (value === null || value === undefined || value === '') return 'N/D';
  const timestamp = parseTradeTime(value);
  if (!timestamp) return String(value);
  return new Date(timestamp).toLocaleString();
}

function parseTradeTime(value: string | number | null): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pnlTone(value: number | null): string {
  if ((value ?? 0) > 0) return 'text-emerald-300';
  if ((value ?? 0) < 0) return 'text-rose-300';
  return 'text-white';
}

function normalizeBacktestTrade(trade: HyperliquidBacktestTrade, index: number): NormalizedTrade {
  const entryContext = (trade.entry_context ?? {}) as {
    thesis?: string | null;
    trigger_plan?: string | null;
    invalidation_plan?: string | null;
    signal_eval?: {
      reasons?: string[];
      filters_passed?: Record<string, string>;
      filters_failed?: Record<string, string>;
    };
  };
  const entryTime = trade.entry_timestamp ?? trade.entry_time ?? null;
  const exitTime = trade.exit_timestamp ?? trade.exit_time ?? null;
  return {
    id: `backtest:${trade.strategy_id ?? 'strategy'}:${entryTime ?? index}:${index}`,
    source: 'backtest',
    symbol: trade.symbol ?? 'N/D',
    side: trade.side ?? 'n/a',
    status: trade.status ?? 'closed',
    entryTime,
    exitTime,
    entryPrice: trade.entry_price ?? null,
    exitPrice: trade.exit_price ?? null,
    sizeUsd: trade.size_usd ?? null,
    grossPnl: trade.gross_pnl ?? null,
    netPnl: trade.net_pnl ?? null,
    returnPct: trade.return_pct ?? null,
    fees: trade.fees ?? null,
    exitReason: trade.exit_reason ?? null,
    thesis: entryContext.thesis ?? null,
    triggerPlan: entryContext.trigger_plan ?? null,
    invalidationPlan: entryContext.invalidation_plan ?? null,
    filtersPassed: entryContext.signal_eval?.filters_passed ?? {},
    filtersFailed: entryContext.signal_eval?.filters_failed ?? {},
    reasons: entryContext.signal_eval?.reasons ?? []
  };
}

function normalizePaperTrade(trade: HyperliquidPaperTrade): NormalizedTrade {
  const pnl = trade.status === 'closed' ? trade.realizedPnlUsd : trade.unrealizedPnlUsd;
  return {
    id: `paper:${trade.id}`,
    source: 'paper',
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status,
    entryTime: trade.createdAt,
    exitTime: trade.closedAt,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    sizeUsd: trade.sizeUsd,
    grossPnl: pnl,
    netPnl: pnl,
    returnPct: trade.pnlPct,
    fees: null,
    exitReason: trade.review?.closeReason ?? null,
    thesis: trade.thesis,
    triggerPlan: trade.triggerPlan ?? null,
    invalidationPlan: trade.invalidationPlan ?? null,
    filtersPassed: {},
    filtersFailed: {},
    reasons: trade.review?.notes ? [trade.review.notes] : []
  };
}

function summarizeTrades(trades: NormalizedTrade[]) {
  const closed = trades.filter((trade) => trade.netPnl !== null);
  const wins = closed.filter((trade) => (trade.netPnl ?? 0) > 0).length;
  const losses = closed.filter((trade) => (trade.netPnl ?? 0) < 0).length;
  const netPnl = closed.reduce((sum, trade) => sum + (trade.netPnl ?? 0), 0);
  const fees = trades.reduce((sum, trade) => sum + (trade.fees ?? 0), 0);
  const sorted = [...closed].sort((a, b) => (a.netPnl ?? 0) - (b.netPnl ?? 0));
  return {
    total: trades.length,
    wins,
    losses,
    netPnl,
    fees,
    best: sorted[sorted.length - 1] ?? null,
    worst: sorted[0] ?? null
  };
}

function buildTradeChartData(trades: NormalizedTrade[]): TradeChartPoint[] {
  const ordered = [...trades]
    .filter((trade) => trade.netPnl !== null)
    .sort((a, b) => parseTradeTime(a.entryTime) - parseTradeTime(b.entryTime));
  let cumulativePnl = 0;
  let peakPnl = 0;
  return ordered.map((trade, index) => {
    const pnl = trade.netPnl ?? 0;
    cumulativePnl += pnl;
    peakPnl = Math.max(peakPnl, cumulativePnl);
    return {
      index: index + 1,
      label: formatTradeTime(trade.entryTime),
      symbol: trade.symbol,
      side: trade.side,
      pnl,
      cumulativePnl,
      returnPct: trade.returnPct,
      drawdown: cumulativePnl - peakPnl,
      source: trade.source
    };
  });
}

function TradesSection({
  trades,
  expectedTrades,
  artifactPath,
  artifactError,
  loadingEvidence,
  emptyAction
}: {
  trades: NormalizedTrade[];
  expectedTrades: number | null;
  artifactPath: string | null;
  artifactError: string | null;
  loadingEvidence: boolean;
  emptyAction: string;
}) {
  const [filter, setFilter] = useState<TradeFilter>('all');
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const summary = useMemo(() => summarizeTrades(trades), [trades]);
  const chartData = useMemo(() => buildTradeChartData(trades), [trades]);
  const filteredTrades = useMemo(() => {
    if (filter === 'winners') return trades.filter((trade) => (trade.netPnl ?? 0) > 0);
    if (filter === 'losers') return trades.filter((trade) => (trade.netPnl ?? 0) < 0);
    if (filter === 'open-paper') return trades.filter((trade) => trade.source === 'paper' && trade.status === 'open');
    return trades;
  }, [filter, trades]);
  const filters: Array<{ id: TradeFilter; label: string }> = [
    { id: 'all', label: `All ${trades.length}` },
    { id: 'winners', label: `Winners ${summary.wins}` },
    { id: 'losers', label: `Losers ${summary.losses}` },
    { id: 'open-paper', label: `Open/Paper ${trades.filter((trade) => trade.source === 'paper' && trade.status === 'open').length}` }
  ];

  return (
    <Panel title="Trades Ledger">
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-6">
          <MiniMetric label="Rows" value={String(summary.total)} detail={expectedTrades === null ? 'backend evidence' : `${expectedTrades} expected`} />
          <MiniMetric label="Wins" value={String(summary.wins)} detail={`${summary.losses} losses`} />
          <MiniMetric label="Net PnL" value={formatCurrency(summary.netPnl)} detail={`${formatCurrency(summary.fees)} fees`} tone={pnlTone(summary.netPnl)} />
          <MiniMetric label="Best" value={summary.best ? formatCurrency(summary.best.netPnl ?? 0) : 'N/D'} detail={summary.best?.symbol ?? 'no trade'} tone={pnlTone(summary.best?.netPnl ?? null)} />
          <MiniMetric label="Worst" value={summary.worst ? formatCurrency(summary.worst.netPnl ?? 0) : 'N/D'} detail={summary.worst?.symbol ?? 'no trade'} tone={pnlTone(summary.worst?.netPnl ?? null)} />
          <MiniMetric label="Source" value={loadingEvidence ? 'Generating' : trades.some((trade) => trade.source === 'backtest') ? 'Artifact' : 'Ledger'} detail={loadingEvidence ? 'auto backtest running' : artifactPath ? 'backtest loaded' : 'paper/runtime only'} />
        </div>

        <TradeHistoryChart data={chartData} />

        {loadingEvidence ? (
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm text-cyan-50">
            Generating backtest evidence automatically. Trades and chart will load here when the backend finishes.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                  filter === item.id ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.08]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {artifactPath ? <div className="max-w-full truncate text-xs text-white/35">{artifactPath}</div> : null}
        </div>

        {trades.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm text-white/60">
            {artifactError || emptyAction}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.04] text-[10px] uppercase tracking-[0.16em] text-white/40">
                  <tr>
                    <th className="px-3 py-3">Time</th>
                    <th className="px-3 py-3">Symbol</th>
                    <th className="px-3 py-3">Side</th>
                    <th className="px-3 py-3">Entry</th>
                    <th className="px-3 py-3">Exit</th>
                    <th className="px-3 py-3 text-right">Size</th>
                    <th className="px-3 py-3 text-right">Net PnL</th>
                    <th className="px-3 py-3 text-right">Return</th>
                    <th className="px-3 py-3">Exit Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((trade) => (
                    <TradeRow
                      key={trade.id}
                      trade={trade}
                      expanded={expandedTradeId === trade.id}
                      onToggle={() => setExpandedTradeId((current) => current === trade.id ? null : trade.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {filteredTrades.length === 0 ? <div className="border-t border-white/10 p-4 text-sm text-white/55">No trades match this filter.</div> : null}
          </div>
        )}
      </div>
    </Panel>
  );
}

function TradeHistoryChart({ data }: { data: TradeChartPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-sm text-white/45">
        No closed trade history to chart yet.
      </div>
    );
  }

  const last = data[data.length - 1];
  const bestPoint = data.reduce((best, point) => point.pnl > best.pnl ? point : best, data[0]);
  const worstPoint = data.reduce((worst, point) => point.pnl < worst.pnl ? point : worst, data[0]);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Trade History</div>
          <div className="mt-1 text-xs text-white/45">Cumulative PnL curve with each trade's PnL as bars.</div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-right">
          <TinyChartStat label="Final" value={formatCurrency(last.cumulativePnl)} tone={pnlTone(last.cumulativePnl)} />
          <TinyChartStat label="Best Trade" value={formatCurrency(bestPoint.pnl)} tone="text-emerald-300" />
          <TinyChartStat label="Worst Trade" value={formatCurrency(worstPoint.pnl)} tone="text-rose-300" />
        </div>
      </div>
      <div className="mt-3 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: 4, right: 12, top: 12, bottom: 0 }}>
            <defs>
              <linearGradient id="tradeHistoryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
            <XAxis
              dataKey="index"
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={18}
            />
            <YAxis
              yAxisId="pnl"
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
              tickLine={false}
              axisLine={false}
              width={58}
            />
            <YAxis
              yAxisId="trade"
              orientation="right"
              tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
              tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip content={<TradeHistoryTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar yAxisId="trade" dataKey="pnl" fill="#64748b" radius={[3, 3, 0, 0]} opacity={0.52} />
            <Area
              yAxisId="pnl"
              type="monotone"
              dataKey="cumulativePnl"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#tradeHistoryFill)"
              dot={{ r: 2, fill: '#22d3ee', strokeWidth: 0 }}
              activeDot={{ r: 4, fill: '#67e8f9', strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TradeHistoryTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: TradeChartPoint }> }) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/95 p-3 text-xs shadow-xl">
      <div className="font-semibold text-white">Trade #{point.index} | {point.symbol} {point.side.toUpperCase()}</div>
      <div className="mt-1 text-white/45">{point.label} | {point.source}</div>
      <div className={`mt-2 font-semibold ${pnlTone(point.pnl)}`}>Trade PnL: {formatCurrency(point.pnl)}</div>
      <div className={`mt-1 font-semibold ${pnlTone(point.cumulativePnl)}`}>Cumulative: {formatCurrency(point.cumulativePnl)}</div>
      <div className="mt-1 text-white/60">Drawdown: {formatCurrency(point.drawdown)}</div>
      {point.returnPct !== null ? <div className="mt-1 text-white/60">Return: {formatOptionalPercent(point.returnPct)}</div> : null}
    </div>
  );
}

function TradeRow({ trade, expanded, onToggle }: { trade: NormalizedTrade; expanded: boolean; onToggle: () => void }) {
  const hasDetails = Boolean(trade.thesis || trade.triggerPlan || trade.invalidationPlan || trade.reasons.length || Object.keys(trade.filtersPassed).length || Object.keys(trade.filtersFailed).length);
  return (
    <>
      <tr className="border-b border-white/10 bg-black/10 align-top hover:bg-white/[0.03]">
        <td className="px-3 py-3 text-white/70">
          <button type="button" onClick={onToggle} className="text-left hover:text-cyan-100" disabled={!hasDetails}>
            <span className="block text-white/80">{formatTradeTime(trade.entryTime)}</span>
            <span className="text-xs text-white/35">{trade.source} | {trade.status}</span>
          </button>
        </td>
        <td className="px-3 py-3 font-semibold text-white">{trade.symbol}</td>
        <td className="px-3 py-3 uppercase text-white/60">{trade.side}</td>
        <td className="px-3 py-3 text-white/70">{formatPrice(trade.entryPrice)}</td>
        <td className="px-3 py-3 text-white/70">{formatPrice(trade.exitPrice)}</td>
        <td className="px-3 py-3 text-right text-white/70">{formatOptionalCurrency(trade.sizeUsd)}</td>
        <td className={`px-3 py-3 text-right font-semibold ${pnlTone(trade.netPnl)}`}>{formatOptionalCurrency(trade.netPnl)}</td>
        <td className={`px-3 py-3 text-right font-semibold ${pnlTone(trade.returnPct)}`}>{formatOptionalPercent(trade.returnPct)}</td>
        <td className="px-3 py-3 text-white/60">{trade.exitReason ?? 'N/D'}</td>
      </tr>
      {expanded ? (
        <tr className="border-b border-white/10 bg-cyan-500/[0.04]">
          <td colSpan={9} className="px-3 py-3">
            <TradeDetails trade={trade} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function TradeDetails({ trade }: { trade: NormalizedTrade }) {
  return (
    <div className="grid gap-3 rounded-lg border border-cyan-400/15 bg-black/25 p-3 text-sm">
      <div className="grid gap-2 md:grid-cols-3">
        <DetailBlock label="Thesis" value={trade.thesis} />
        <DetailBlock label="Trigger" value={trade.triggerPlan} />
        <DetailBlock label="Invalidation" value={trade.invalidationPlan} />
      </div>
      {trade.reasons.length > 0 ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Reasons</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {trade.reasons.map((reason, index) => (
              <span key={`${reason}-${index}`} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white/65">{reason}</span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <FilterMap title="Filters Passed" items={trade.filtersPassed} tone="text-emerald-200" />
        <FilterMap title="Filters Failed" items={trade.filtersFailed} tone="text-rose-200" />
      </div>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-2 text-sm text-white/65">{value || 'N/D'}</div>
    </div>
  );
}

function FilterMap({ title, items, tone }: { title: string; items: Record<string, string>; tone: string }) {
  const entries = Object.entries(items);
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{title}</div>
      <div className="mt-2 grid gap-1">
        {entries.length === 0 ? <div className="text-xs text-white/40">N/D</div> : entries.map(([key, value]) => (
          <div key={key} className="text-xs text-white/60">
            <span className={`font-semibold ${tone}`}>{key.replace(/_/g, ' ')}</span>: {value}
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, detail, tone = 'text-white' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className={`mt-1 truncate text-sm font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-white/40">{detail}</div>
    </div>
  );
}

function TinyChartStat({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</div>
      <div className={`mt-1 text-xs font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function BacktestAction({
  strategyId,
  running,
  message,
  onRun
}: {
  strategyId: string;
  running: boolean;
  message: string | null;
  onRun: () => void;
}) {
  const disabled = running || strategyId.startsWith('runtime:');
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.06] p-3">
      <div>
        <div className="text-sm font-semibold text-cyan-100">Backend backtest API</div>
        <div className="mt-1 text-xs text-cyan-100/65">
          {disabled && strategyId.startsWith('runtime:') ? 'Runtime setup: seed paper evidence desde Paper Lab.' : `Strategy ID: ${strategyId}`}
        </div>
        {message ? <div className="mt-2 text-xs text-white/70">{message}</div> : null}
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={disabled}
        className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {running ? 'Running...' : 'Run Backtest'}
      </button>
    </div>
  );
}

function AgenticResearchSummary({
  latest,
  running,
  message,
  onRun
}: {
  latest: HyperliquidLatestAgentRunResponse | null;
  running: boolean;
  message: string | null;
  onRun: () => void;
}) {
  const decision = latest?.agentRun.decision;
  return (
    <section className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200/75">Agentic Research OS</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {decision ? `${decision.recommendation} | confidence ${decision.confidence}` : 'No agentic decision yet'}
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-300">
            {decision?.executive_summary ?? 'Run Research OS to attach debate, validation gaps, blockers, and recommended hf:* commands.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="rounded-md border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/25 disabled:opacity-55"
        >
          {running ? 'Running...' : 'Run Research OS'}
        </button>
      </div>
      {message ? <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2 text-sm text-white/75">{message}</div> : null}
      {latest ? (
        <div className="mt-3 grid gap-2 text-xs text-white/60 md:grid-cols-3">
          <div>Runtime: {latest.agentRun.ai?.runtime_mode ?? 'unknown'}</div>
          <div>Blockers: {decision?.blockers.length ?? 0}</div>
          <div className="truncate">Run: {latest.agentRun.run_id}</div>
          {(decision?.recommended_commands ?? []).slice(0, 3).map((command) => (
            <code key={command} className="rounded bg-white/[0.05] px-2 py-1 text-cyan-100 md:col-span-3">{command}</code>
          ))}
        </div>
      ) : null}
    </section>
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
