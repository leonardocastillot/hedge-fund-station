import { invalidateRequestCache, withRequestCache } from './requestCache';
import { ALPHA_ENGINE_HTTP_URL, HYPERLIQUID_GATEWAY_HTTP_URL } from './backendConfig';

const API_URL = HYPERLIQUID_GATEWAY_HTTP_URL;
const BACKTEST_API_URL = ALPHA_ENGINE_HTTP_URL;
const REQUEST_TIMEOUT_MS = 35_000;
const AGENT_RUN_TIMEOUT_MS = 240_000;

function normalizeRequestError(error: unknown, label: string): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Check the Hyperliquid gateway on ${API_URL}.`);
  }
  if (error instanceof TypeError) {
    return new Error(`${label} could not reach the Hyperliquid gateway at ${API_URL}. Start the local gateway or set VITE_HYPERLIQUID_GATEWAY_API_URL to the running service.`);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(`${label} failed.`);
}

export interface HyperliquidMarketRow {
  symbol: string;
  price: number | null;
  prevDayPx: number | null;
  change24hPct: number;
  openInterest: number | null;
  openInterestUsd: number | null;
  volume24h: number | null;
  fundingRate: number | null;
  premium: number | null;
  maxLeverage: number | null;
  sizeDecimals: number | null;
  opportunityScore: number;
  scoreBreakdown: {
    volume: number;
    openInterest: number;
    funding: number;
    change: number;
  };
  signalLabel: 'momentum-expansion' | 'crowded-trend' | 'mean-reversion-watch' | 'neutral';
  riskLabel: 'high-crowding' | 'expanding' | 'balanced';
  estimatedLongLiquidationUsd?: number;
  estimatedShortLiquidationUsd?: number;
  estimatedTotalLiquidationUsd?: number;
  pressureImbalance?: number;
  crowdingBias?: 'longs-at-risk' | 'shorts-at-risk' | 'balanced';
  setupScores?: {
    breakoutContinuation: number;
    shortSqueeze: number;
    longFlush: number;
    fade: number;
    noTrade: number;
  };
  primarySetup?: 'breakout-continuation' | 'short-squeeze' | 'long-flush' | 'fade' | 'no-trade';
  executionQuality?: number;
  decisionLabel?: 'watch-now' | 'wait-trigger' | 'avoid';
  triggerPlan?: string;
  invalidationPlan?: string;
}

export interface HyperliquidOverviewResponse {
  updatedAt: number;
  markets: HyperliquidMarketRow[];
  leaders: {
    topOpportunity: string | null;
    topVolume: string | null;
    topOpenInterest: string | null;
  };
}

export interface HyperliquidOrderbookStats {
  bestBid: number | null;
  bestAsk: number | null;
  bidDepth: number;
  askDepth: number;
  imbalance: number;
}

export interface HyperliquidOrderbookLevel {
  price: number | null;
  size: number | null;
  count?: number;
}

export interface HyperliquidTradesResponse {
  symbol: string;
  trades: Array<{
    time: number;
    price: number | null;
    size: number | null;
    side: 'buy' | 'sell';
    notional: number;
  }>;
  stats: {
    buyNotional: number;
    sellNotional: number;
    imbalance: number;
  };
}

export interface HyperliquidCandlesResponse {
  symbol: string;
  interval: string;
  candles: Array<{
    time: number;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
  }>;
}

export interface HyperliquidDetailResponse {
  market: HyperliquidMarketRow;
  orderbook: {
    symbol: string;
    bids: HyperliquidOrderbookLevel[];
    asks: HyperliquidOrderbookLevel[];
    stats: HyperliquidOrderbookStats;
  };
  candles: HyperliquidCandlesResponse;
  trades: HyperliquidTradesResponse;
}

export interface HyperliquidHistoryPoint {
  time: number;
  price: number | null;
  change24hPct: number;
  openInterestUsd: number | null;
  volume24h: number | null;
  fundingRate: number | null;
  opportunityScore: number;
  signalLabel: HyperliquidMarketRow['signalLabel'];
  riskLabel: HyperliquidMarketRow['riskLabel'];
}

export interface HyperliquidHistoryResponse {
  symbol: string;
  updatedAt: number;
  points: HyperliquidHistoryPoint[];
}

export interface HyperliquidAlert {
  id: string;
  symbol: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  value: number | null;
  delta: number | null;
  createdAt: number;
}

export interface HyperliquidAlertsResponse {
  updatedAt: number;
  alerts: HyperliquidAlert[];
}

export interface HyperliquidWatchlistResponse {
  updatedAt: number;
  watchNow: HyperliquidMarketRow[];
  waitTrigger: HyperliquidMarketRow[];
  avoid: HyperliquidMarketRow[];
  squeezeWatch: HyperliquidMarketRow[];
  breakoutWatch: HyperliquidMarketRow[];
  fadeWatch: HyperliquidMarketRow[];
}

export interface HyperliquidPaperSessionHour {
  hour: string;
  trades: number;
  wins: number;
  winRate: number;
  pnlUsd: number;
}

export interface HyperliquidPaperSessionAnalyticsResponse {
  bestHours: HyperliquidPaperSessionHour[];
}

export interface HyperliquidPaperSignal {
  id: number;
  createdAt: number;
  symbol: string;
  setupTag: string;
  decisionLabel?: 'watch-now' | 'wait-trigger' | 'avoid' | null;
  triggerPlan?: string | null;
  executionQuality?: number | null;
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  thesis: string;
  entryPrice: number | null;
  invalidation: string | null;
  status: 'open' | 'closed';
}

export interface HyperliquidPaperTrade {
  id: number;
  createdAt: number;
  symbol: string;
  side: 'long' | 'short';
  setupTag: string;
  decisionLabel?: 'watch-now' | 'wait-trigger' | 'avoid' | null;
  triggerPlan?: string | null;
  invalidationPlan?: string | null;
  executionQuality?: number | null;
  thesis: string;
  entryPrice: number;
  sizeUsd: number;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  status: 'open' | 'closed';
  closedAt: number | null;
  exitPrice: number | null;
  realizedPnlUsd: number | null;
  markPrice: number | null;
  unrealizedPnlUsd: number | null;
  pnlPct: number | null;
  review?: {
    reviewedAt: number;
    closeReason: string;
    outcomeTag: string;
    executionScore: number;
    notes: string | null;
  } | null;
}

export interface HyperliquidStrategyAuditRow {
  strategyKey: string;
  strategyId: string;
  displayName: string;
  stage: 'research' | 'backtested' | 'validated' | 'validation_blocked' | 'paper_candidate' | 'paper_runtime' | 'runtime_setup' | 'unknown';
  sourceTypes: string[];
  symbol: string | null;
  setupTag: string | null;
  side: 'long' | 'short' | 'neutral' | 'binary' | 'n/a';
  latestArtifactPaths: {
    docs: string | null;
    spec: string | null;
    backtest: string | null;
    validation: string | null;
    paper: string | null;
  };
  validationStatus: string | null;
  evidenceCounts: {
    backtestTrades: number;
    paperCandidates: number;
    paperSignals: number;
    paperTrades: number;
    polymarketTrades: number;
    runtimeSetups: number;
  };
  tradeCount: number;
  openTrades: number;
  closedTrades: number;
  reviewableClosedTrades: number;
  reviewedTrades: number;
  wins: number;
  notionalUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  avgExecutionQuality: number | null;
  decisionLabels: Record<string, number>;
  openRiskUsd: number;
  winRate: number;
  reviewCoverage: number;
  lastActivityAt: number | null;
  lastActivityLabel: string | null;
  checklist: {
    docsExists: boolean;
    specExists: boolean;
    backendModuleExists: boolean;
    backtestExists: boolean;
    validationExists: boolean;
    paperCandidateExists: boolean;
    paperLedgerExists: boolean;
    reviewsComplete: boolean;
  };
  missingAuditItems: string[];
  timeline: Array<{
    id: string;
    type: 'backtest_trade' | 'validation_report' | 'paper_candidate' | 'paper_signal' | 'paper_trade' | 'polymarket_trade' | 'runtime_setup';
    source: string;
    timestampMs: number | null;
    title: string;
    subtitle?: string | null;
    status?: string | null;
    pnlUsd?: number | null;
    entryPrice?: number | null;
    exitPrice?: number | null;
    executionQuality?: number | null;
    path?: string | null;
    review?: HyperliquidPaperTrade['review'];
  }>;
  trades: HyperliquidPaperTrade[];
}

export interface HyperliquidStrategyAuditResponse {
  updatedAt: number;
  summary: {
    strategyCount: number;
    tradeCount: number;
    openTrades: number;
    closedTrades: number;
    reviewableClosedTrades: number;
    reviewedTrades: number;
    reviewCoverage: number;
    totalPnlUsd: number;
    openRiskUsd: number;
    backtestTrades: number;
    paperSignals: number;
    paperTrades: number;
    polymarketTrades: number;
    runtimeSetups: number;
  };
  database: {
    path: string;
    exists: boolean;
    sizeBytes: number;
    journalMode: string | null;
    tables: Record<string, number | null>;
    indexes: Record<string, boolean>;
    recommendation: string;
    migrationTrigger: string;
  };
  runtimeError: string | null;
  strategies: HyperliquidStrategyAuditRow[];
}

export interface HyperliquidGatewayHealth {
  ok: boolean;
  upstream: string;
  cacheWarm: boolean;
  cacheUpdatedAt: number | null;
  cacheAgeMs: number | null;
  lastRefreshAttemptAt: number | null;
  lastRefreshOkAt: number | null;
  lastRefreshError: string | null;
  refreshLoopSeconds: number;
}

export interface HyperliquidBacktestRunResponse {
  success: boolean;
  strategyId: string;
  reportPath: string;
  validationPath: string | null;
  paperPath: string | null;
  summary: {
    initial_equity: number;
    final_equity: number;
    net_profit: number;
    return_pct: number;
    total_trades: number;
    wins: number;
    losses: number;
    win_rate_pct: number;
    profit_factor: number;
    max_drawdown_pct: number;
    fees_paid: number;
  };
  requestedLookbackDays?: number;
  datasetMode?: string;
  datasetStart?: string;
  datasetEnd?: string;
  datasetRows?: number;
  validation?: {
    status: string;
    blocking_reasons: string[];
  } | null;
}

export interface HyperliquidBacktestTrade {
  strategy_id?: string;
  symbol?: string;
  side?: string;
  status?: string;
  entry_timestamp?: string | number | null;
  exit_timestamp?: string | number | null;
  entry_time?: string | number | null;
  exit_time?: string | number | null;
  entry_price?: number | null;
  exit_price?: number | null;
  size_usd?: number | null;
  gross_pnl?: number | null;
  net_pnl?: number | null;
  return_pct?: number | null;
  fees?: number | null;
  exit_reason?: string | null;
  entry_context?: {
    thesis?: string | null;
    trigger_plan?: string | null;
    invalidation_plan?: string | null;
    signal_eval?: {
      reasons?: string[];
      filters_passed?: Record<string, string>;
      filters_failed?: Record<string, string>;
    };
    setup_score?: {
      reasons?: string[];
      filters_passed?: number;
      filters_total?: number;
      watchlist_label?: string;
      priority?: string;
    };
  } | Record<string, unknown> | null;
}

export interface HyperliquidLatestBacktestResponse {
  strategyId: string;
  reportPath: string;
  validationPath: string | null;
  paperPath: string | null;
  created?: boolean;
  report: {
    artifact_id?: string;
    generated_at?: string;
    dataset?: Record<string, unknown>;
    summary?: HyperliquidBacktestRunResponse['summary'] & Record<string, unknown>;
    trades?: HyperliquidBacktestTrade[];
    equity_curve?: Array<Record<string, unknown>>;
  } | null;
  validation: Record<string, unknown> | null;
  paper: Record<string, unknown> | null;
}

export interface HyperliquidAgentRunSummary {
  run_id: string;
  strategy_id: string;
  mode: 'research' | 'audit';
  generated_at: string;
  path: string;
  graph_runtime: 'langgraph' | 'sequential';
  recommendation: 'research_only' | 'backtest_next' | 'validation_next' | 'paper_candidate_review' | 'blocked';
  confidence: number;
  promotion_allowed: boolean;
  runtime_mode?: string;
  runtime_provider?: string;
  blocker_count: number;
  recommended_commands: string[];
}

export interface HyperliquidAgentRuntimeStatus {
  codexAvailable: boolean;
  codexPath: string | null;
  codexAuthenticated: boolean;
  codexStatus: {
    available: boolean;
    authenticated: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
  };
  defaultModel: string | null;
  runtimeMode: 'codex-local' | 'api-provider' | 'deterministic';
  apiProviderAvailable: boolean;
  apiProviderStatus: {
    providerOrder: string[];
    activeProvider: string;
    activeModel: string | null;
    deepseek: { configured: boolean; baseUrl: string; model: string };
    openai: { configured: boolean; model: string };
  };
}

export interface HyperliquidAgentRunDetail {
  artifact_id: string;
  artifact_type: 'agent_research_run';
  generated_at: string;
  run_id: string;
  mode: 'research' | 'audit';
  strategy_id: string;
  graph_runtime: 'langgraph' | 'sequential';
  source_inspiration: Record<string, string>;
  research: Record<string, unknown>;
  evidence: Record<string, unknown>;
  reports: Array<{
    role: string;
    title: string;
    thesis: string;
    evidence: string[];
    concerns: string[];
    recommended_actions: string[];
  }>;
  debate: Array<{ speaker: string; message: string }>;
  decision: {
    recommendation: HyperliquidAgentRunSummary['recommendation'];
    confidence: number;
    promotion_allowed: boolean;
    executive_summary: string;
    thesis: string;
    blockers: string[];
    validation_gaps: Array<{
      key: string;
      severity: 'info' | 'warning' | 'blocker';
      description: string;
      recommended_command: string | null;
    }>;
    recommended_commands: string[];
    next_human_review: string;
  };
  ai: {
    enabled?: boolean;
    runtime_mode?: string;
    requested_runtime?: string;
    provider_status?: Record<string, unknown>;
    provider?: string | null;
    model?: string | null;
    fallback_used?: boolean;
    errors?: Array<{ provider: string; message: string }>;
    synthesis_applied?: boolean;
  };
  checkpoints: Record<string, unknown>;
  lineage: Record<string, unknown>;
}

export interface HyperliquidAgentRunsResponse {
  updatedAt: number;
  strategyId: string | null;
  count: number;
  runs: HyperliquidAgentRunSummary[];
}

export interface HyperliquidLatestAgentRunResponse {
  strategyId: string;
  agentRun: HyperliquidAgentRunDetail;
  strategyStatus: Record<string, unknown> | null;
  comparison: {
    agentRecommendation: HyperliquidAgentRunSummary['recommendation'];
    agentPromotionAllowed: boolean;
    backendPromotionStage: string;
    recommendedCommands: string[];
    validationGaps: HyperliquidAgentRunDetail['decision']['validation_gaps'];
  };
}

export interface HyperliquidAgentRunCreateRequest {
  strategy_id: string;
  runtime?: 'auto' | 'codex-local' | 'api-provider' | 'deterministic';
  model?: string | null;
  codex_profile?: string | null;
  provider_order?: string | null;
  mission_id?: string | null;
}

export interface HyperliquidAgentRunCreateResponse {
  created: boolean;
  missionId: string | null;
  runPath: string;
  runId: string;
  strategyId: string;
  mode: 'research' | 'audit';
  runtimeMode: string;
  runtimeProvider: string;
  recommendation: HyperliquidAgentRunSummary['recommendation'];
  promotionAllowed: boolean;
  blockerCount: number;
  recommendedCommands: string[];
  agentRun: HyperliquidAgentRunDetail;
}

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}${path}`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Hyperliquid gateway returned HTTP ${response.status}.`);
    }
    return response.json();
  } catch (error) {
    throw normalizeRequestError(error, 'Hyperliquid request');
  } finally {
    window.clearTimeout(timeout);
  }
}

async function postJson<T>(path: string, payload?: unknown, baseUrl = API_URL, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Hyperliquid gateway returned HTTP ${response.status}${detail ? `: ${detail}` : ''}.`);
    }
    return response.json();
  } catch (error) {
    throw normalizeRequestError(error, 'Hyperliquid mutation');
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchJsonFrom<T>(baseUrl: string, path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Hyperliquid gateway returned HTTP ${response.status}${detail ? `: ${detail}` : ''}.`);
    }
    return response.json();
  } catch (error) {
    throw normalizeRequestError(error, 'Hyperliquid backtest request');
  } finally {
    window.clearTimeout(timeout);
  }
}

class HyperliquidService {
  async health(): Promise<HyperliquidGatewayHealth> {
    return withRequestCache('hyperliquid:health', 5_000, async () => {
      return fetchJson<HyperliquidGatewayHealth>('/health');
    });
  }

  async getOverview(limit = 40): Promise<HyperliquidOverviewResponse> {
    return withRequestCache(`hyperliquid:overview:${limit}`, 10_000, async () => {
      return fetchJson<HyperliquidOverviewResponse>(`/api/hyperliquid/overview?limit=${limit}`);
    });
  }

  async getDetail(symbol: string, interval = '1h', lookbackHours = 24): Promise<HyperliquidDetailResponse> {
    return withRequestCache(`hyperliquid:detail:${symbol}:${interval}:${lookbackHours}`, 8_000, async () => {
      return fetchJson<HyperliquidDetailResponse>(
        `/api/hyperliquid/detail/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&lookback_hours=${lookbackHours}`
      );
    });
  }

  async getHistory(symbol: string, limit = 60): Promise<HyperliquidHistoryResponse> {
    return withRequestCache(`hyperliquid:history:${symbol}:${limit}`, 8_000, async () => {
      return fetchJson<HyperliquidHistoryResponse>(`/api/hyperliquid/history/${encodeURIComponent(symbol)}?limit=${limit}`);
    });
  }

  async getAlerts(limit = 24): Promise<HyperliquidAlertsResponse> {
    return withRequestCache(`hyperliquid:alerts:${limit}`, 8_000, async () => {
      return fetchJson<HyperliquidAlertsResponse>(`/api/hyperliquid/alerts?limit=${limit}`);
    });
  }

  async getWatchlist(limit = 18): Promise<HyperliquidWatchlistResponse> {
    return withRequestCache(`hyperliquid:watchlist:${limit}`, 8_000, async () => {
      return fetchJson<HyperliquidWatchlistResponse>(`/api/hyperliquid/watchlist?limit=${limit}`);
    });
  }

  async getPaperSignals(limit = 20): Promise<{ signals: HyperliquidPaperSignal[] }> {
    return withRequestCache(`hyperliquid:paper-signals:${limit}`, 5_000, async () => {
      return fetchJson<{ signals: HyperliquidPaperSignal[] }>(`/api/hyperliquid/paper/signals?limit=${limit}`);
    });
  }

  async seedPaperSignals(limit = 6): Promise<{ success: boolean; created: number }> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_URL}/api/hyperliquid/paper/signals/seed?limit=${limit}`, {
        method: 'POST',
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Hyperliquid gateway returned HTTP ${response.status}.`);
      }
      invalidatePaperCaches();
      return response.json();
    } catch (error) {
      throw normalizeRequestError(error, 'Seed paper signals');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async getPaperTrades(status: 'all' | 'open' | 'closed' = 'all'): Promise<{ trades: HyperliquidPaperTrade[] }> {
    return withRequestCache(`hyperliquid:paper-trades:${status}`, 5_000, async () => {
      return fetchJson<{ trades: HyperliquidPaperTrade[] }>(`/api/hyperliquid/paper/trades?status=${status}`);
    });
  }

  async getStrategyAudit(limit = 200): Promise<HyperliquidStrategyAuditResponse> {
    return withRequestCache(`hyperliquid:strategy-audit:${limit}`, 5_000, async () => {
      return fetchJson<HyperliquidStrategyAuditResponse>(`/api/hyperliquid/strategy-audit?limit=${limit}`);
    });
  }

  async runBacktest(strategyId: string, buildPaperCandidate = false): Promise<HyperliquidBacktestRunResponse> {
    const response = await postJson<HyperliquidBacktestRunResponse>('/api/hyperliquid/backtests/run', {
      strategy_id: strategyId,
      lookback_days: 3650,
      run_validation: true,
      build_paper_candidate: buildPaperCandidate
    }, BACKTEST_API_URL);
    invalidateRequestCache('hyperliquid:strategy-audit:');
    invalidateRequestCache(`hyperliquid:latest-backtest:${strategyId}`);
    return response;
  }

  async getLatestBacktest(strategyId: string): Promise<HyperliquidLatestBacktestResponse> {
    return withRequestCache(`hyperliquid:latest-backtest:${strategyId}`, 5_000, async () => {
      return fetchJsonFrom<HyperliquidLatestBacktestResponse>(
        BACKTEST_API_URL,
        `/api/hyperliquid/backtests/${encodeURIComponent(strategyId)}/latest`
      );
    });
  }

  async getAgentRuns(strategyId?: string, limit = 50): Promise<HyperliquidAgentRunsResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (strategyId) {
      params.set('strategy', strategyId);
    }
    return withRequestCache(`hyperliquid:agent-runs:${strategyId || 'all'}:${limit}`, 5_000, async () => {
      return fetchJson<HyperliquidAgentRunsResponse>(`/api/hyperliquid/agent-runs?${params.toString()}`);
    });
  }

  async getAgentRuntimeStatus(): Promise<HyperliquidAgentRuntimeStatus> {
    return withRequestCache('hyperliquid:agent-runtime-status', 5_000, async () => {
      return fetchJson<HyperliquidAgentRuntimeStatus>('/api/hyperliquid/agent-runtime/status');
    });
  }

  async getAgentRun(runId: string): Promise<HyperliquidAgentRunDetail> {
    return withRequestCache(`hyperliquid:agent-run:${runId}`, 5_000, async () => {
      return fetchJson<HyperliquidAgentRunDetail>(`/api/hyperliquid/agent-runs/${encodeURIComponent(runId)}`);
    });
  }

  async getLatestAgentRun(strategyId: string): Promise<HyperliquidLatestAgentRunResponse> {
    return withRequestCache(`hyperliquid:agent-run-latest:${strategyId}`, 5_000, async () => {
      return fetchJson<HyperliquidLatestAgentRunResponse>(
        `/api/hyperliquid/agent-runs/strategy/${encodeURIComponent(strategyId)}/latest`
      );
    });
  }

  async runAgentResearch(request: HyperliquidAgentRunCreateRequest): Promise<HyperliquidAgentRunCreateResponse> {
    const response = await postJson<HyperliquidAgentRunCreateResponse>('/api/hyperliquid/agent-runs/research', request, API_URL, AGENT_RUN_TIMEOUT_MS);
    invalidateRequestCache('hyperliquid:agent-runs:');
    invalidateRequestCache(`hyperliquid:agent-run-latest:${response.strategyId}`);
    invalidateRequestCache(`hyperliquid:agent-run:${response.runId}`);
    return response;
  }

  async runAgentAudit(request: HyperliquidAgentRunCreateRequest): Promise<HyperliquidAgentRunCreateResponse> {
    const response = await postJson<HyperliquidAgentRunCreateResponse>('/api/hyperliquid/agent-runs/audit', request, API_URL, AGENT_RUN_TIMEOUT_MS);
    invalidateRequestCache('hyperliquid:agent-runs:');
    invalidateRequestCache(`hyperliquid:agent-run-latest:${response.strategyId}`);
    invalidateRequestCache(`hyperliquid:agent-run:${response.runId}`);
    return response;
  }

  async ensureBacktest(strategyId: string): Promise<HyperliquidLatestBacktestResponse> {
    const response = await postJson<HyperliquidLatestBacktestResponse>(
      `/api/hyperliquid/backtests/${encodeURIComponent(strategyId)}/ensure?run_validation=true&build_paper_candidate=true`,
      undefined,
      BACKTEST_API_URL
    );
    invalidateRequestCache(`hyperliquid:latest-backtest:${strategyId}`);
    invalidateRequestCache('hyperliquid:strategy-audit:');
    return response;
  }

  async runAllBacktests(buildPaperCandidate = false): Promise<{ success: boolean; results: HyperliquidBacktestRunResponse[] }> {
    const response = await postJson<{ success: boolean; results: HyperliquidBacktestRunResponse[] }>(
      `/api/hyperliquid/backtests/run-all?run_validation=true&build_paper_candidate=${buildPaperCandidate ? 'true' : 'false'}`,
      undefined,
      BACKTEST_API_URL
    );
    invalidateRequestCache('hyperliquid:strategy-audit:');
    return response;
  }

  async getPaperSessionAnalytics(): Promise<HyperliquidPaperSessionAnalyticsResponse> {
    return withRequestCache('hyperliquid:paper-session-analytics', 10_000, async () => {
      return fetchJson<HyperliquidPaperSessionAnalyticsResponse>('/api/hyperliquid/paper/session-analytics');
    });
  }

  async createPaperTrade(payload: {
    symbol: string;
    side: 'long' | 'short';
    setup_tag: string;
    thesis: string;
    entry_price: number;
    size_usd: number;
    stop_loss_pct?: number;
    take_profit_pct?: number;
    decision_label?: 'watch-now' | 'wait-trigger' | 'avoid';
    trigger_plan?: string;
    invalidation_plan?: string;
    execution_quality?: number;
  }): Promise<{ success: boolean; id: number }> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_URL}/api/hyperliquid/paper/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Hyperliquid gateway returned HTTP ${response.status}.`);
      }
      invalidatePaperCaches();
      return response.json();
    } catch (error) {
      throw normalizeRequestError(error, 'Create paper trade');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async closePaperTrade(tradeId: number): Promise<{ success: boolean; id: number }> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_URL}/api/hyperliquid/paper/trades/${tradeId}/close`, {
        method: 'POST',
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Hyperliquid gateway returned HTTP ${response.status}.`);
      }
      invalidatePaperCaches();
      return response.json();
    } catch (error) {
      throw normalizeRequestError(error, 'Close paper trade');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async reviewPaperTrade(
    tradeId: number,
    payload: { close_reason: string; outcome_tag: string; execution_score: number; notes?: string }
  ): Promise<{ success: boolean; id: number }> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_URL}/api/hyperliquid/paper/trades/${tradeId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Hyperliquid gateway returned HTTP ${response.status}.`);
      }
      invalidatePaperCaches();
      return response.json();
    } catch (error) {
      throw normalizeRequestError(error, 'Review paper trade');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async getRaw(path: string): Promise<unknown> {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return withRequestCache(`hyperliquid:raw:${normalized}`, 5_000, async () => fetchJson<unknown>(normalized));
  }

  getConfigState() {
    return {
      apiUrlConfigured: Boolean(API_URL),
      apiUrl: API_URL
    };
  }
}

export const hyperliquidService = new HyperliquidService();

function invalidatePaperCaches() {
  invalidateRequestCache('hyperliquid:paper-trades:');
  invalidateRequestCache('hyperliquid:paper-signals:');
  invalidateRequestCache('hyperliquid:strategy-audit:');
}
