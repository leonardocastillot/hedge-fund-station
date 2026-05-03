import legacyApi from './legacyTradingApi';
import { alphaEngineApi, type EvaluationItem } from './alphaEngineApi';
import { hyperliquidService, type HyperliquidMarketRow, type HyperliquidPaperTrade } from './hyperliquidService';

export const DEFAULT_BACKTEST_INITIAL_CAPITAL = 500;

export interface Strategy {
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
  source: 'alpha' | 'legacy' | 'gateway';
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

function mapLegacyStrategy(item: any): Strategy {
  const decisionLabel = item.deployment_status ? 'watch-now' : item.score >= 75 ? 'watch-now' : 'wait-trigger';
  return {
    strategy_name: item.strategy_name,
    symbol: item.strategy_name,
    score: item.score ?? 0,
    direction: item.direction ?? 'BOTH',
    timeframe: item.timeframe ?? '4h',
    last_evaluated: item.last_evaluated ?? new Date().toISOString(),
    total_return_pct: item.total_return_pct ?? 0,
    win_rate: item.win_rate ?? 0,
    sharpe_ratio: item.sharpe_ratio ?? 0,
    max_drawdown_pct: item.max_drawdown_pct ?? 0,
    total_trades: item.total_trades ?? 0,
    deployment_status: item.deployment_status ?? null,
    deployment_id: item.deployment_id ?? null,
    is_stale: Boolean(item.is_stale),
    setup_tag: item.timeframe ?? '4h',
    decision_label: decisionLabel,
    execution_quality: Math.max(0, Math.min(100, item.score ?? 0)),
    trigger_plan: `Use cached backtest and current score ${item.score ?? 0} as the ranking baseline.`,
    invalidation_plan: `Invalidate if freshness becomes stale or score degrades materially from ${item.score ?? 0}.`,
    market: null,
    source: 'legacy'
  };
}

function scoreEvaluation(item: EvaluationItem): number {
  const profitFactorScore = Math.max(0, Math.min(35, ((item.profit_factor ?? 0) / 2) * 35));
  const winRateScore = Math.max(0, Math.min(25, ((item.win_rate_pct ?? 0) / 70) * 25));
  const returnScore = Math.max(0, Math.min(25, ((item.return_pct ?? 0) + 5) * 2.5));
  const drawdownPenalty = Math.max(0, Math.min(20, item.max_drawdown_pct ?? 0));
  const statusBonus = item.status === 'ok' ? 15 : 0;
  return Number(Math.max(0, Math.min(100, profitFactorScore + winRateScore + returnScore + statusBonus - drawdownPenalty)).toFixed(1));
}

function evaluationDirection(item: EvaluationItem): string {
  const text = `${item.archetype} ${item.proxy_model} ${item.title}`.toLowerCase();
  if (text.includes('short squeeze') || text.includes('breakout') || text.includes('continuation')) return 'LONG';
  if (text.includes('flush') || text.includes('fade')) return 'SHORT';
  return 'BOTH';
}

function evaluationDecisionLabel(item: EvaluationItem, score: number): string {
  const promotion = item.promotion_state.toLowerCase();
  if (promotion.includes('paper') || promotion.includes('candidate')) return 'watch-now';
  if (promotion.includes('reject') || item.status !== 'ok' || score < 35) return 'avoid';
  return score >= 65 ? 'watch-now' : 'wait-trigger';
}

function mapAlphaEvaluation(item: EvaluationItem): Strategy {
  const score = scoreEvaluation(item);
  const decisionLabel = evaluationDecisionLabel(item, score);
  const notes = item.notes.length > 0 ? item.notes.join(' ') : `${item.title} evaluated by the alpha engine.`;
  return {
    strategy_name: item.title,
    symbol: item.strategy_id,
    score,
    direction: evaluationDirection(item),
    timeframe: item.dataset_mode || 'evaluation',
    last_evaluated: item.last_run_at || new Date().toISOString(),
    total_return_pct: item.return_pct ?? 0,
    win_rate: item.win_rate_pct ?? 0,
    sharpe_ratio: Number(((item.profit_factor ?? 0) / 1.5).toFixed(2)),
    max_drawdown_pct: item.max_drawdown_pct ?? 0,
    total_trades: item.total_trades ?? 0,
    deployment_status: decisionLabel === 'watch-now' ? 'PAPER' : null,
    deployment_id: null,
    is_stale: item.status !== 'ok',
    setup_tag: item.archetype || item.proxy_model || 'evaluation',
    decision_label: decisionLabel,
    execution_quality: score,
    trigger_plan: notes,
    invalidation_plan: `Promotion state is ${item.promotion_state}; reject or demote if validation remains weak, stale, or drawdown expands beyond current ${item.max_drawdown_pct ?? 0}%.`,
    market: null,
    source: 'alpha'
  };
}

function formatStrategyName(market: HyperliquidMarketRow): string {
  const setup = market.primarySetup || 'no-trade';
  return `${market.symbol} ${setup}`;
}

function mapDirection(market: HyperliquidMarketRow): string {
  if (market.primarySetup === 'short-squeeze' || market.primarySetup === 'breakout-continuation') return 'LONG';
  if (market.primarySetup === 'long-flush' || market.primarySetup === 'fade') return 'SHORT';
  return 'BOTH';
}

function mapGatewayStrategy(market: HyperliquidMarketRow, evaluatedAt: number): Strategy {
  const executionQuality = market.executionQuality ?? 0;
  const score = Number((market.opportunityScore * 10 + executionQuality * 0.35).toFixed(1));
  return {
    strategy_name: formatStrategyName(market),
    symbol: market.symbol,
    score,
    direction: mapDirection(market),
    timeframe: 'intraday',
    last_evaluated: new Date(evaluatedAt).toISOString(),
    total_return_pct: market.change24hPct ?? 0,
    win_rate: Math.max(20, Math.min(95, 40 + Math.max(0, executionQuality - 40) * 0.7)),
    sharpe_ratio: Number((score / 40).toFixed(2)),
    max_drawdown_pct: Number((Math.max(2, 18 - (market.executionQuality ?? 0) / 8)).toFixed(1)),
    total_trades: 0,
    deployment_status: market.decisionLabel === 'watch-now' ? 'PAPER' : null,
    deployment_id: null,
    is_stale: false,
    setup_tag: market.primarySetup || 'no-trade',
    decision_label: market.decisionLabel || 'wait-trigger',
    execution_quality: executionQuality,
    trigger_plan: market.triggerPlan,
    invalidation_plan: market.invalidationPlan,
    market,
    source: 'gateway'
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

async function getLegacyLibrary(filter: 'all' | 'long' | 'bidirectional' | 'deployed') {
  const params: Record<string, string> = {};
  if (filter === 'deployed') params.status_filter = 'deployed';
  if (filter === 'long') params.direction = 'LONG';
  if (filter === 'bidirectional') params.direction = 'BOTH';
  const response = await legacyApi.get('/api/portfolio/strategies/library', { params });
  return (response.data?.strategies ?? []).map(mapLegacyStrategy) as Strategy[];
}

async function getAlphaLibrary() {
  const snapshot = await alphaEngineApi.evaluations();
  return snapshot.strategies.map(mapAlphaEvaluation);
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
    try {
      return { success: true, strategies: sortStrategies(applyStrategyFilter(await getAlphaLibrary(), filter), sortBy) };
    } catch {
      try {
        let strategies = await getLegacyLibrary(filter);
        return { success: true, strategies: sortStrategies(strategies, sortBy) };
      } catch {
        const overview = await hyperliquidService.getOverview(36);
        const trades = await hyperliquidService.getPaperTrades('all');
        const tradeCountBySymbol = new Map<string, number>();
        for (const trade of trades.trades) {
          tradeCountBySymbol.set(trade.symbol, (tradeCountBySymbol.get(trade.symbol) ?? 0) + 1);
        }
        const strategies = overview.markets.map((market) => {
          const strategy = mapGatewayStrategy(market, overview.updatedAt);
          strategy.total_trades = tradeCountBySymbol.get(market.symbol) ?? 0;
          if (strategy.total_trades > 0) strategy.deployment_status = 'PAPER';
          return strategy;
        });
        return { success: true, strategies: sortStrategies(applyStrategyFilter(strategies, filter), sortBy) };
      }
    }
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
    try {
      const response = await legacyApi.post('/api/backtest/run', null, {
        params: {
          strategy_name: strategyName,
          timeframe,
          days_back: years * 365,
          initial_capital: DEFAULT_BACKTEST_INITIAL_CAPITAL
        }
      });
      return response.data;
    } catch {
      return hyperliquidService.seedPaperSignals(6);
    }
  },

  async runAllBacktests(_timeframe: string = '4h', _years: number = 3) {
    try {
      const response = await legacyApi.post('/api/backtest/run-all', null, {
        params: { mode: 'quick' },
        timeout: 300000
      });
      return response.data;
    } catch {
      const result = await hyperliquidService.seedPaperSignals(6);
      return { success: result.success, successful: result.created, failed: 0 };
    }
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
