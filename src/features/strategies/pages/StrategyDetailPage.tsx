import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { alphaEngineApi, type EvaluationItem } from '@/services/alphaEngineApi';
import legacyApi from '@/services/legacyTradingApi';
import {
  BacktestAction,
  BacktestArtifactSelector,
  TradesSection,
  type NormalizedTrade
} from '../components/BacktestEvidencePanels';
import { PaperBaselinePanel } from '../components/PaperBaselinePanel';
import {
  hyperliquidService,
  type HyperliquidBacktestArtifactSummary,
  type HyperliquidBacktestTrade,
  type HyperliquidDetailResponse,
  type HyperliquidLatestAgentRunResponse,
  type HyperliquidLatestBacktestResponse,
  type HyperliquidPaperReadinessResponse,
  type HyperliquidPaperRuntimeSupervisorResponse,
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
  const [backtestArtifacts, setBacktestArtifacts] = useState<HyperliquidBacktestArtifactSummary[]>([]);
  const [selectedBacktestArtifactId, setSelectedBacktestArtifactId] = useState<string | null>(null);
  const [loadingBacktestArtifacts, setLoadingBacktestArtifacts] = useState(false);
  const [backtestArtifactError, setBacktestArtifactError] = useState<string | null>(null);
  const [ensuringBacktest, setEnsuringBacktest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [backtestMessage, setBacktestMessage] = useState<string | null>(null);
  const [latestAgentRun, setLatestAgentRun] = useState<HyperliquidLatestAgentRunResponse | null>(null);
  const [paperReadiness, setPaperReadiness] = useState<HyperliquidPaperReadinessResponse | null>(null);
  const [paperReadinessError, setPaperReadinessError] = useState<string | null>(null);
  const [paperSupervisor, setPaperSupervisor] = useState<HyperliquidPaperRuntimeSupervisorResponse | null>(null);
  const [paperSupervisorError, setPaperSupervisorError] = useState<string | null>(null);
  const [runningAgentRun, setRunningAgentRun] = useState(false);
  const [agentRunMessage, setAgentRunMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshLatestBacktest = async (strategyId: string, registeredForBacktest = false) => {
    setBacktestArtifactError(null);
    try {
      const latest = await hyperliquidService.getLatestBacktest(strategyId);
      setLatestBacktest(latest);
      setSelectedBacktestArtifactId(latest.report?.artifact_id ?? null);
    } catch (err) {
      setLatestBacktest(null);
      setSelectedBacktestArtifactId(null);
      const fallbackMessage = registeredForBacktest
        ? 'No backtest trade artifact found yet. Use Run Backtest to generate bounded local evidence.'
        : 'No backtest trade artifact found for this strategy.';
      setBacktestArtifactError(err instanceof Error ? err.message : fallbackMessage);
    }
  };

  const loadBacktestArtifacts = async (strategyId: string) => {
    if (!strategyId || strategyId.startsWith('runtime:')) {
      setBacktestArtifacts([]);
      setSelectedBacktestArtifactId(null);
      return;
    }
    setLoadingBacktestArtifacts(true);
    try {
      const response = await hyperliquidService.getBacktestArtifacts(strategyId, 20);
      setBacktestArtifacts(response.artifacts);
      setSelectedBacktestArtifactId((current) => current ?? response.artifacts[0]?.artifactId ?? null);
    } catch {
      setBacktestArtifacts([]);
    } finally {
      setLoadingBacktestArtifacts(false);
    }
  };

  const selectBacktestArtifact = async (strategyId: string, artifactId: string) => {
    setLoadingBacktestArtifacts(true);
    setBacktestArtifactError(null);
    try {
      const artifact = await hyperliquidService.getBacktestArtifact(strategyId, artifactId);
      setLatestBacktest(artifact);
      setSelectedBacktestArtifactId(artifact.report?.artifact_id ?? artifactId);
      setBacktestMessage('Backtest artifact loaded.');
    } catch (err) {
      setBacktestArtifactError(err instanceof Error ? err.message : 'No se pudo cargar este artifact de backtest.');
    } finally {
      setLoadingBacktestArtifacts(false);
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
      setBacktestArtifacts([]);
      setSelectedBacktestArtifactId(null);
      setBacktestArtifactError(null);
      setPaperReadiness(null);
      setPaperReadinessError(null);
      setPaperSupervisor(null);
      setPaperSupervisorError(null);
      setEnsuringBacktest(false);

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
          void loadBacktestArtifacts(evidence.strategyId);
          void refreshLatestBacktest(evidence.strategyId, evidence.registeredForBacktest);
          setLoading(false);
          return;
        }
      } catch {
        // Hyperliquid catalog/audit is primary for strategy pipeline routes; fallbacks below keep legacy screens usable.
      }

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
          let canAutoEnsureBacktest = false;
          try {
            const audit = await hyperliquidService.getStrategyAudit(500);
            const normalizedEvaluationId = normalizeIdentifier(evaluation.strategy_id);
            const evidence = audit.strategies.find((item) => normalizeIdentifier(item.strategyId) === normalizedEvaluationId);
            setAuditDetail(evidence ?? null);
            canAutoEnsureBacktest = Boolean(evidence?.registeredForBacktest);
          } catch {
            setAuditDetail(null);
          }
          void loadBacktestArtifacts(evaluation.strategy_id);
          void refreshLatestBacktest(evaluation.strategy_id, canAutoEnsureBacktest);
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
          void loadBacktestArtifacts(evidence.strategyId);
          void refreshLatestBacktest(evidence.strategyId, evidence.registeredForBacktest);
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

  useEffect(() => {
    const strategyId = auditDetail?.strategyId || alphaDetail?.strategy_id;
    if (!strategyId || strategyId.startsWith('runtime:')) {
      setPaperReadiness(null);
      setPaperReadinessError(null);
      return;
    }
    let cancelled = false;
    hyperliquidService.getPaperReadiness(strategyId)
      .then((response) => {
        if (!cancelled) {
          setPaperReadiness(response);
          setPaperReadinessError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPaperReadiness(null);
          setPaperReadinessError(err instanceof Error ? err.message : 'Paper readiness unavailable.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [alphaDetail?.strategy_id, auditDetail?.strategyId, latestBacktest?.paperPath]);

  useEffect(() => {
    const strategyId = auditDetail?.strategyId || alphaDetail?.strategy_id;
    if (!strategyId || strategyId.startsWith('runtime:')) {
      setPaperSupervisor(null);
      setPaperSupervisorError(null);
      return;
    }
    let cancelled = false;
    hyperliquidService.getPaperRuntimeSupervisor(strategyId)
      .then((response) => {
        if (!cancelled) {
          setPaperSupervisor(response);
          setPaperSupervisorError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPaperSupervisor(null);
          setPaperSupervisorError(err instanceof Error ? err.message : 'Paper runtime supervisor unavailable.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [alphaDetail?.strategy_id, auditDetail?.strategyId]);

  const runBackendBacktest = async (strategyId: string) => {
    setRunningBacktest(true);
    setBacktestMessage(null);
    try {
      const result = await hyperliquidService.runBacktest(strategyId, {
        lookbackDays: 3,
        runValidation: true,
        buildPaperCandidate: false
      });
      const windowText = result.datasetStart && result.datasetEnd ? ` (${result.datasetStart.slice(0, 10)} -> ${result.datasetEnd.slice(0, 10)})` : '';
      setBacktestMessage(`Backtest listo${windowText}: ${result.summary.total_trades} trades, retorno ${formatPercent(result.summary.return_pct)}, validacion ${result.validation?.status ?? 'N/D'}. Paper candidate queda como accion separada despues del gate.`);
      await refreshLatestBacktest(strategyId);
      await loadBacktestArtifacts(strategyId);
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
        // Local gateway audit refresh is optional; the generated artifact is enough for this view.
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
          canRun={Boolean(auditDetail?.registeredForBacktest)}
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
        <BacktestArtifactSelector
          strategyId={alphaDetail.strategy_id}
          artifacts={backtestArtifacts}
          selectedArtifactId={selectedBacktestArtifactId}
          loading={loadingBacktestArtifacts}
          onSelect={(artifactId) => void selectBacktestArtifact(alphaDetail.strategy_id, artifactId)}
        />
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
          canRun={auditDetail.registeredForBacktest}
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
          <Metric label="Fees" value={formatCurrency(Number(auditDetail.latestBacktestSummary?.fees_paid ?? 0))} />
          <Metric label="Robust" value={auditDetail.robustAssessment?.status ?? 'N/D'} />
          <Metric label="PnL" value={formatCurrency(auditDetail.totalPnlUsd)} tone={auditDetail.totalPnlUsd >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
        </div>
        <BacktestArtifactSelector
          strategyId={auditDetail.strategyId}
          artifacts={backtestArtifacts}
          selectedArtifactId={selectedBacktestArtifactId}
          loading={loadingBacktestArtifacts}
          onSelect={(artifactId) => void selectBacktestArtifact(auditDetail.strategyId, artifactId)}
        />
        <TradesSection
          trades={normalizedTrades}
          expectedTrades={auditDetail.tradeCount}
          artifactPath={latestBacktest?.reportPath ?? auditDetail.latestArtifactPaths.backtest}
          artifactError={backtestArtifactError}
          loadingEvidence={ensuringBacktest}
          emptyAction="No backtest trade artifact found for this strategy. Run Backtest to generate inspectable trade evidence."
        />
        <Panel title="Backend Artifacts">
          <div className="grid gap-3 text-sm text-white/70 md:grid-cols-2">
            <DetailBlock label="Strategy ID" value={auditDetail.strategyId} />
            <DetailBlock label="Registered for Backtest" value={auditDetail.registeredForBacktest ? 'yes' : 'no'} />
            <DetailBlock
              label="Doubling Stability"
              value={auditDetail.doublingStability?.status ?? 'N/D'}
              detail={
                auditDetail.doublingStability
                  ? `${formatOptionalPercent(auditDetail.doublingStability.positiveSliceRatioPct)} positive slices | ${formatOptionalPercent(auditDetail.doublingStability.largestPositiveSlicePnlSharePct)} concentration`
                  : undefined
              }
            />
            <DetailBlock
              label="BTC Optimizer"
              value={auditDetail.btcOptimization?.topVariantId ?? auditDetail.btcOptimization?.status ?? 'N/D'}
              detail={
                auditDetail.btcOptimization
                  ? `${auditDetail.btcOptimization.topReviewStatus ?? auditDetail.btcOptimization.status} | ${formatOptionalPercent(auditDetail.btcOptimization.topReturnPct)} | ${auditDetail.btcOptimization.topProjectedDaysToDouble ?? 'N/D'}d 2x`
                  : undefined
              }
            />
            <PathList title="Docs" paths={auditDetail.documentationPaths.length ? auditDetail.documentationPaths : [auditDetail.latestArtifactPaths.docs].filter(Boolean) as string[]} />
            <PathList title="Artifacts" paths={[
              auditDetail.latestArtifactPaths.spec,
              auditDetail.latestArtifactPaths.backtest,
              auditDetail.latestArtifactPaths.validation,
              auditDetail.latestArtifactPaths.paper,
              auditDetail.latestArtifactPaths.doublingStability,
              auditDetail.latestArtifactPaths.btcOptimization
            ].filter(Boolean) as string[]} />
          </div>
        </Panel>
        <Panel title="Robust Gate">
          <div className="grid gap-3 md:grid-cols-2">
            <DetailBlock label="Status" value={auditDetail.robustAssessment?.status ?? auditDetail.validationStatus ?? 'N/D'} />
            <DetailBlock label="Policy" value={auditDetail.validationPolicy ? JSON.stringify(auditDetail.validationPolicy) : 'N/D'} />
            <PathList title="Blockers" paths={auditDetail.robustAssessment?.blockers?.length ? auditDetail.robustAssessment.blockers : auditDetail.missingAuditItems} />
            <PathList title="Exit Reasons" paths={Object.entries(auditDetail.exitReasonCounts).map(([reason, count]) => `${reason}: ${count}`)} />
          </div>
        </Panel>
        <PaperBaselinePanel
          paper={latestBacktest?.paper ?? null}
          paperPath={latestBacktest?.paperPath ?? auditDetail.latestArtifactPaths.paper}
          readiness={paperReadiness}
          readinessError={paperReadinessError}
          supervisor={paperSupervisor}
          supervisorError={paperSupervisorError}
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

function formatOptionalPercent(value: number | null): string {
  return value === null ? 'N/D' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function parseTradeTime(value: string | number | null): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function DetailBlock({ label, value, detail }: { label: string; value: string | null; detail?: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-2 text-sm text-white/65">{value || 'N/D'}</div>
      {detail ? <div className="mt-1 text-xs text-white/40">{detail}</div> : null}
    </div>
  );
}

function PathList({ title, paths }: { title: string; paths: string[] }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{title}</div>
      <div className="mt-2 grid gap-1">
        {paths.length === 0 ? <div className="text-sm text-white/45">N/D</div> : paths.map((path) => (
          <div key={path} className="break-all text-xs text-white/60">{path}</div>
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
