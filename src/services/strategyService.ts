import legacyApi from './legacyTradingApi';
import {
  hyperliquidService,
  type HyperliquidGateStatus,
  type HyperliquidMarketRow,
  type HyperliquidPipelineStage,
  type HyperliquidPaperTrade,
  type HyperliquidStrategyCatalogRow,
  type HyperliquidStrategyNextAction
} from './hyperliquidService';

export const DEFAULT_BACKTEST_INITIAL_CAPITAL = 500;

export interface Strategy {
  strategy_id?: string;
  strategy_name: string;
  symbol: string;
  score: number;
  direction: string;
  timeframe: string;
  last_evaluated: string;
  total_return_pct: number;
  win_rate: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  total_trades: number;
  deployment_status?: 'LIVE' | 'PAPER' | 'PAUSED' | 'STOPPED' | null;
  deployment_id?: number | null;
  is_stale: boolean;
  setup_tag: string;
  decision_label: string;
  execution_quality: number;
  trigger_plan?: string;
  invalidation_plan?: string;
  market?: HyperliquidMarketRow | null;
  stage?: HyperliquidStrategyCatalogRow['stage'];
  pipeline_stage?: HyperliquidPipelineStage;
  gate_status?: HyperliquidGateStatus;
  gate_reasons?: string[];
  next_action?: HyperliquidStrategyNextAction;
  registered_for_backtest?: boolean;
  source: 'backend' | 'alpha' | 'legacy' | 'gateway';
}

export interface DeployedStrategy {
  id: number;
  strategy_name: string;
  status: 'LIVE' | 'PAPER' | 'PAUSED' | 'STOPPED';
  timeframe: string;
  direction: string;
  allocation_pct: number;
  current_pnl: number;
  current_pnl_pct: number;
  trades_count: number;
  win_rate_live: number;
  sharpe_live: number;
  deployed_at: string;
}

export interface PortfolioStats {
  total_aum: number;
  initial_capital: number;
  total_pnl: number;
  total_pnl_pct: number;
  active_strategies: number;
  combined_sharpe: number;
  portfolio_drawdown: number;
  total_trades: number;
  strategies: DeployedStrategy[];
}

function backendDirection(item: HyperliquidStrategyCatalogRow): string {
  if (item.side === 'long') return 'LONG';
  if (item.side === 'short') return 'SHORT';
  const text = `${item.strategyId} ${item.displayName}`.toLowerCase();
  if (text.includes('short_squeeze') || text.includes('crowding_scalper') || text.includes('breakout')) return 'LONG';
  if (text.includes('flush') || text.includes('fade')) return 'SHORT';
  return 'BOTH';
}

function backendDecisionLabel(item: HyperliquidStrategyCatalogRow): string {
  if (item.robustAssessment?.status === 'passes' || item.validationStatus === 'ready-for-paper') return 'watch-now';
  if (item.stage === 'validation_blocked' || item.robustAssessment?.status === 'blocked') return 'avoid';
  return item.registeredForBacktest ? 'wait-trigger' : 'avoid';
}

function scoreBackendStrategy(item: HyperliquidStrategyCatalogRow): number {
  const summary = item.latestBacktestSummary;
  const stageScore: Record<HyperliquidStrategyCatalogRow['stage'], number> = {
    paper_runtime: 82,
    paper_candidate: 74,
    validated: 70,
    backtested: 58,
    validation_blocked: 36,
    registered: 48,
    runtime_setup: 44,
    research: 30,
    unknown: 12
  };
  const trades = Number(summary?.total_trades ?? item.tradeCount ?? 0);
  const returnPct = Number(summary?.return_pct ?? 0);
  const profitFactor = Number(summary?.profit_factor ?? 0);
  const drawdown = Number(summary?.max_drawdown_pct ?? 0);
  const robustBonus = item.robustAssessment?.status === 'passes' ? 12 : item.robustAssessment?.status === 'insufficient-sample' ? -4 : 0;
  const tradeScore = Math.min(14, trades / 6);
  const returnScore = Math.max(-10, Math.min(12, returnPct * 2));
  const pfScore = Math.max(0, Math.min(10, (profitFactor - 1) * 12));
  const drawdownPenalty = Math.max(0, Math.min(14, drawdown));
  return Number(Math.max(0, Math.min(100, (stageScore[item.stage] ?? 12) + tradeScore + returnScore + pfScore + robustBonus - drawdownPenalty)).toFixed(1));
}

function mapBackendStrategy(item: HyperliquidStrategyCatalogRow): Strategy {
  const summary = item.latestBacktestSummary;
  const score = scoreBackendStrategy(item);
  const decisionLabel = backendDecisionLabel(item);
  const blockers = item.robustAssessment?.blockers?.length
    ? item.robustAssessment.blockers.join(', ')
    : item.missingAuditItems.join(', ') || 'no blockers recorded';
  return {
    strategy_name: item.displayName,
    strategy_id: item.strategyId,
    symbol: item.strategyId,
    score,
    direction: backendDirection(item),
    timeframe: item.stage,
    last_evaluated: item.lastActivityAt ? new Date(item.lastActivityAt).toISOString() : new Date().toISOString(),
    total_return_pct: Number(summary?.return_pct ?? 0),
    win_rate: Number(summary?.win_rate_pct ?? item.winRate ?? 0),
    sharpe_ratio: Number((Number(summary?.profit_factor ?? 0) / 1.3).toFixed(2)),
    max_drawdown_pct: Number(summary?.max_drawdown_pct ?? 0),
    total_trades: Number(summary?.total_trades ?? item.tradeCount ?? 0),
    deployment_status: item.stage === 'paper_runtime' || item.stage === 'paper_candidate' ? 'PAPER' : null,
    deployment_id: null,
    is_stale: item.stage === 'unknown',
    setup_tag: item.setupTag || item.strategyId,
    decision_label: decisionLabel,
    execution_quality: score,
    trigger_plan: `${item.stage.replace(/_/g, ' ')} | sources: ${item.sourceTypes.join(', ') || 'none'} | registered: ${item.registeredForBacktest ? 'yes' : 'no'}.`,
    invalidation_plan: `Review blockers before promotion: ${blockers}.`,
    market: null,
    stage: item.stage,
    pipeline_stage: item.pipelineStage,
    gate_status: item.gateStatus,
    gate_reasons: item.gateReasons,
    next_action: item.nextAction,
    registered_for_backtest: item.registeredForBacktest,
    source: 'backend'
  };
}

function toGatewayDeployedTrade(trade: HyperliquidPaperTrade): DeployedStrategy {
  const pnlUsd = trade.realizedPnlUsd ?? trade.unrealizedPnlUsd ?? 0;
  const pnlPct = trade.pnlPct ?? (trade.entryPrice ? (pnlUsd / trade.sizeUsd) * 100 : 0);
  const reviewedScore = trade.review?.executionScore ?? 0;
  return {
    id: trade.id,
    strategy_name: `${trade.symbol} ${trade.setupTag}`,
    status: trade.status === 'open' ? 'PAPER' : 'STOPPED',
    timeframe: 'intraday',
    direction: trade.side.toUpperCase(),
    allocation_pct: 0,
    current_pnl: pnlUsd,
    current_pnl_pct: pnlPct,
    trades_count: 1,
    win_rate_live: pnlUsd > 0 ? 100 : 0,
    sharpe_live: Number((reviewedScore / 5).toFixed(2)),
    deployed_at: new Date(trade.createdAt).toISOString()
  };
}

async function getBackendLibrary() {
  const catalog = await hyperliquidService.getStrategyCatalog(500);
  return catalog.strategies.map(mapBackendStrategy);
}

function applyStrategyFilter(strategies: Strategy[], filter: 'all' | 'long' | 'bidirectional' | 'deployed') {
  if (filter === 'deployed') return strategies.filter((strategy) => strategy.total_trades > 0 || Boolean(strategy.deployment_status));
  if (filter === 'long') return strategies.filter((strategy) => strategy.direction === 'LONG');
  if (filter === 'bidirectional') return strategies.filter((strategy) => strategy.direction === 'BOTH');
  return strategies;
}

function sortStrategies(strategies: Strategy[], sortBy: 'score' | 'return' | 'sharpe' | 'win_rate') {
  strategies.sort((a, b) => {
    if (sortBy === 'return') return b.total_return_pct - a.total_return_pct;
    if (sortBy === 'sharpe') return b.sharpe_ratio - a.sharpe_ratio;
    if (sortBy === 'win_rate') return b.win_rate - a.win_rate;
    return b.score - a.score;
  });
  return strategies;
}

export const strategyService = {
  async getLibrary(
    filter: 'all' | 'long' | 'bidirectional' | 'deployed' = 'all',
    sortBy: 'score' | 'return' | 'sharpe' | 'win_rate' = 'score'
  ) {
    const backendStrategies = await getBackendLibrary();
    return { success: true, strategies: sortStrategies(applyStrategyFilter(backendStrategies, filter), sortBy) };
  },

  async deploy(strategyName: string, mode: 'LIVE' | 'PAPER', allocationPct: number, timeframe = '4h') {
    try {
      const response = await legacyApi.post('/api/portfolio/deploy', {
        strategy_name: strategyName,
        timeframe,
        allocation_pct: allocationPct,
        mode: mode.toLowerCase(),
        max_drawdown_limit: 25.0
      });
      return response.data;
    } catch {
      const symbol = strategyName.split(' ')[0]?.toUpperCase();
      const overview = await hyperliquidService.getOverview(48);
      const market = overview.markets.find((item) => item.symbol === symbol);
      if (!market) throw new Error(`Market ${symbol} not found in Hyperliquid overview.`);
      const result = await hyperliquidService.createPaperTrade({
        symbol: market.symbol,
        side: market.primarySetup === 'fade' || market.primarySetup === 'long-flush' ? 'short' : 'long',
        setup_tag: market.primarySetup || 'manual-review',
        thesis: market.triggerPlan || `Paper trade created from ${market.signalLabel}.`,
        entry_price: market.price || 0,
        size_usd: Math.max(50, allocationPct * 10),
        stop_loss_pct: 0.8,
        take_profit_pct: 1.6,
        decision_label: market.decisionLabel,
        trigger_plan: market.triggerPlan,
        invalidation_plan: market.invalidationPlan,
        execution_quality: market.executionQuality
      });
      return { success: true, deployment_id: result.id };
    }
  },

  async runBacktest(strategyName: string, timeframe: string = '4h', years: number = 3) {
    void timeframe;
    void years;
    return hyperliquidService.runBacktest(strategyName);
  },

  async runAllBacktests(_timeframe: string = '4h', _years: number = 3) {
    const result = await hyperliquidService.runAllBacktests(false);
    const successful = result.results.filter((item) => item.success).length;
    return {
      success: result.success,
      successful,
      failed: result.results.length - successful,
      results: result.results
    };
  },

  async getDeployed(): Promise<DeployedStrategy[]> {
    try {
      const response = await legacyApi.get('/api/portfolio/deployments', { params: { status: 'PAPER,LIVE,PAUSED' } });
      return response.data?.deployments ?? [];
    } catch {
      const result = await hyperliquidService.getPaperTrades('all');
      return result.trades.map(toGatewayDeployedTrade);
    }
  },

  async pause(deploymentId: number) {
    return legacyApi.patch(`/api/portfolio/deployments/${deploymentId}`, { status: 'PAUSED' }).then((response) => response.data);
  },

  async resume(deploymentId: number, mode: 'LIVE' | 'PAPER' = 'PAPER') {
    return legacyApi.patch(`/api/portfolio/deployments/${deploymentId}`, { status: mode }).then((response) => response.data);
  },

  async stop(deploymentId: number) {
    try {
      const response = await legacyApi.patch(`/api/portfolio/deployments/${deploymentId}`, { status: 'STOPPED' });
      return response.data;
    } catch {
      return hyperliquidService.closePaperTrade(deploymentId);
    }
  },

  async getPortfolioStats(): Promise<PortfolioStats> {
    try {
      const response = await legacyApi.get('/api/portfolio/overview');
      return response.data;
    } catch {
      const result = await hyperliquidService.getPaperTrades('all');
      const trades = result.trades;
      const totalAum = trades.reduce((sum, trade) => sum + trade.sizeUsd, 0);
      const totalPnl = trades.reduce((sum, trade) => sum + (trade.realizedPnlUsd ?? trade.unrealizedPnlUsd ?? 0), 0);
      const closedTrades = trades.filter((trade) => trade.status === 'closed');
      const winningTrades = closedTrades.filter((trade) => (trade.realizedPnlUsd ?? 0) > 0);
      const worstClosedTrade = closedTrades.reduce((worst, trade) => {
        const pnl = trade.realizedPnlUsd ?? 0;
        return pnl < worst ? pnl : worst;
      }, 0);
      return {
        total_aum: totalAum,
        initial_capital: DEFAULT_BACKTEST_INITIAL_CAPITAL,
        total_pnl: totalPnl,
        total_pnl_pct: totalAum > 0 ? (totalPnl / totalAum) * 100 : 0,
        active_strategies: trades.filter((trade) => trade.status === 'open').length,
        combined_sharpe: closedTrades.length > 0 ? winningTrades.length / Math.max(1, closedTrades.length / 2) : 0,
        portfolio_drawdown: Math.abs(worstClosedTrade),
        total_trades: trades.length,
        strategies: trades.map(toGatewayDeployedTrade)
      };
    }
  }
};
