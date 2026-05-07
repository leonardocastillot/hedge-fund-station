import { invalidateRequestCache, withRequestCache } from './requestCache';
import { HYPERLIQUID_GATEWAY_HTTP_URL } from './backendConfig';

const API_URL = HYPERLIQUID_GATEWAY_HTTP_URL;
const BACKTEST_API_URL = API_URL;
const REQUEST_TIMEOUT_MS = 35_000;
const AGENT_RUN_TIMEOUT_MS = 240_000;
const DEFAULT_UI_BACKTEST_LOOKBACK_DAYS = 3;
const AGENT_ENDPOINT_404_HINT = `Research OS is not exposed by the Hyperliquid gateway at ${API_URL}. Restart the local gateway so it loads the current backend, then run npm run gateway:probe.`;
const STRATEGY_CATALOG_FALLBACK_WARNING = 'The local Hyperliquid gateway is missing the strategy catalog endpoint. Restart it so the Pipeline can use backend-derived gate fields; showing strategy-audit fallback data for now.';

class HyperliquidGatewayHttpError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    public readonly detail: string
  ) {
    super(`Hyperliquid gateway returned HTTP ${status}${detail ? `: ${detail}` : ''}.`);
    this.name = 'HyperliquidGatewayHttpError';
  }
}

function isAgentEndpoint(path: string): boolean {
  return path.includes('/api/hyperliquid/agent-runs') || path.includes('/api/hyperliquid/agent-runtime/');
}

function gatewayHttpError(path: string, status: number, detail = ''): Error {
  if (status === 404 && isAgentEndpoint(path)) {
    return new Error(`${AGENT_ENDPOINT_404_HINT} Missing endpoint: ${path}`);
  }
  return new HyperliquidGatewayHttpError(path, status, detail);
}

function isHttpStatus(error: unknown, status: number): boolean {
  return error instanceof HyperliquidGatewayHttpError && error.status === status;
}

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

export interface PineIndicatorGenerateRequest {
  request: string;
  symbol: string;
  interval: string;
  lookback_hours: number;
  indicator_type?: string | null;
}

export interface PineIndicatorPreviewPoint {
  time: number;
  value: number;
}

export interface PineIndicatorPreviewLine {
  name: string;
  color: string;
  points: PineIndicatorPreviewPoint[];
}

export interface PineIndicatorPreviewMarker {
  time: number;
  text: string;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  price?: number;
}

export interface PineIndicatorGenerateResponse {
  symbol: string;
  interval: string;
  lookbackHours: number;
  generatedAt: number;
  title: string;
  description: string;
  pineCode: string;
  inputs: string[];
  plots: string[];
  alerts: string[];
  warnings: string[];
  previewRecipe: Record<string, unknown>;
  ai?: Record<string, unknown>;
  candles: HyperliquidCandlesResponse;
  preview: {
    supported: boolean;
    reason: string | null;
    overlays: PineIndicatorPreviewLine[];
    oscillators: PineIndicatorPreviewLine[];
    markers: PineIndicatorPreviewMarker[];
  };
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

export interface HyperliquidPaperReadinessResponse {
  strategyId: string;
  paperPath: string;
  paperArtifactId: string | null;
  paperGeneratedAt: string | null;
  paperBaseline: Record<string, unknown>;
  tradeMatch: Record<string, unknown>;
  readiness: {
    status: string;
    nextAction: string;
    baselineStatus: string | null;
    sampleProgress: {
      calendarDays: number;
      requiredCalendarDays: number;
      closedTrades: number;
      requiredClosedTrades: number;
      openTrades: number;
      reviewedTrades: number;
      reviewCoveragePct: number;
      requiredReviewCoveragePct: number;
      checks: Record<string, boolean>;
    };
    paperMetrics: {
      grossProfitUsd: number;
      grossLossUsd: number;
      netPnlAfterFeesUsd: number;
      estimatedFeesUsd: number;
      totalNotionalUsd: number;
      paperNetReturnPct: number;
      paperProfitFactor: number;
      paperAvgNetTradeReturnPct: number;
      paperMaxDrawdownPct: number;
      winsAfterFees: number;
      lossesAfterFees: number;
    };
    driftChecks: Array<{
      key: string | null;
      metric: string;
      operator: string | null;
      threshold: number;
      value: number | null;
      passed: boolean;
    }>;
    blockers: string[];
    matchingTradeIds: Array<number | string | null>;
    closedTradeSamples: Array<Record<string, unknown>>;
  };
}

export interface HyperliquidPaperRuntimeTickResponse {
  success: boolean;
  strategyId: string;
  dryRun: boolean;
  status: string;
  closedTradeIds: number[];
  openedTradeId: number | null;
  createdSignalId: number | null;
  skippedEntryReason: string | null;
  plan: {
    status: string;
    market: Record<string, unknown> | null;
    signalEval: Record<string, unknown>;
    setupScore: Record<string, unknown> | null;
    openTradeCount?: number;
    exitActions: Array<Record<string, unknown>>;
    entry: {
      shouldOpen: boolean;
      blockReason: string | null;
      tradePayload: Record<string, unknown> | null;
      signalPayload: Record<string, unknown> | null;
    };
  };
}

export interface HyperliquidPaperRuntimeSupervisorResponse {
  strategyId: string;
  supported: boolean;
  running: boolean;
  healthStatus: 'healthy' | 'degraded' | 'stale' | 'stopped' | 'unsupported' | string;
  healthBlockers: string[];
  healthChecks: Record<string, boolean>;
  mode: 'screen' | 'pid' | 'stopped' | string;
  screenSession: string;
  pid: string | null;
  pidFileValue: string | null;
  strategyMatches: boolean;
  metadata: Record<string, string>;
  gatewayUrl: string | null;
  intervalSeconds: number | null;
  maxTicks: number | null;
  dryRun: boolean | null;
  failFast: boolean | null;
  portfolioValue: number | null;
  startedAt: string | null;
  logPath: string;
  logExists: boolean;
  lastLogAtMs: number | null;
  lastLogAt: string | null;
  lastLogAgeSeconds: number | null;
  staleAfterSeconds: number;
  logTail: string[];
  lastEvent: Record<string, unknown> | null;
  lastTick: Record<string, unknown> | null;
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

export type HyperliquidPipelineStage = 'research' | 'backtesting' | 'audit' | 'paper' | 'blocked';
export type HyperliquidGateStatus =
  | 'backtest-required'
  | 'backtest-running-eligible'
  | 'audit-eligible'
  | 'audit-blocked'
  | 'ready-for-paper'
  | 'paper-active';

export interface HyperliquidStrategyNextAction {
  label: string;
  command: string;
  enabled: boolean;
  targetStage: HyperliquidPipelineStage;
}

export interface HyperliquidDoublingEstimate {
  status: 'candidate' | 'unvalidated' | 'blocked' | 'no-positive-return' | 'insufficient-window' | 'insufficient-trades' | string;
  candidate: boolean;
  strategyId: string | null;
  artifactId: string | null;
  reportPath: string | null;
  sampleStart: string | null;
  sampleEnd: string | null;
  sampleDays: number | null;
  returnPct: number;
  geometricDailyReturnPct: number | null;
  projectedDaysToDouble: number | null;
  projectedTradesToDouble: number | null;
  periodsToDouble: number | null;
  totalTrades: number;
  feeModel: string | null;
  riskFraction: number | null;
  robustStatus: string | null;
  validationStatus: string | null;
  blockers: string[];
}

export interface HyperliquidDoublingStability {
  status: 'stable' | 'fragile' | 'insufficient-sample' | 'insufficient-window' | string;
  artifactId: string | null;
  reportArtifactId: string | null;
  validationArtifactId: string | null;
  positiveSliceRatioPct: number | null;
  largestPositiveSlicePnlSharePct: number | null;
  activeSliceCount: number;
  sliceCount: number;
  blockers: string[];
}

export interface HyperliquidBtcOptimization {
  status: string;
  artifactId: string | null;
  variantCount: number;
  stableCandidateCount: number;
  fragileCandidateCount: number;
  topVariantId: string | null;
  topReviewStatus: string | null;
  topProjectedDaysToDouble: number | null;
  topReturnPct: number | null;
  topTotalTrades: number | null;
  topStabilityStatus: string | null;
  topStabilityBlockers: string[];
  topLargestPositiveSlicePnlSharePct: number | null;
}

export interface HyperliquidStrategyAuditRow {
  strategyKey: string;
  strategyId: string;
  displayName: string;
  stage: 'research' | 'registered' | 'backtested' | 'validated' | 'validation_blocked' | 'paper_candidate' | 'paper_runtime' | 'runtime_setup' | 'unknown';
  pipelineStage: HyperliquidPipelineStage;
  gateStatus: HyperliquidGateStatus;
  gateReasons: string[];
  nextAction: HyperliquidStrategyNextAction;
  sourceTypes: string[];
  registeredForBacktest: boolean;
  canBacktest: boolean;
  symbol: string | null;
  setupTag: string | null;
  side: 'long' | 'short' | 'neutral' | 'binary' | 'n/a';
  validationPolicy: Record<string, number> | null;
  doublingEstimate: HyperliquidDoublingEstimate | null;
  doublingStability: HyperliquidDoublingStability | null;
  btcOptimization: HyperliquidBtcOptimization | null;
  latestBacktestSummary: (HyperliquidBacktestRunResponse['summary'] & Record<string, unknown>) | null;
  latestBacktestConfig: Record<string, unknown> | null;
  robustAssessment: {
    status?: string;
    blockers?: string[];
    checks?: Record<string, boolean>;
    notes?: string[];
  } | null;
  exitReasonCounts: Record<string, number>;
  documentationPaths: string[];
  latestArtifactPaths: {
    docs: string | null;
    spec: string | null;
    backtest: string | null;
    validation: string | null;
    paper: string | null;
    doublingStability: string | null;
    btcOptimization: string | null;
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
    type: 'backtest_trade' | 'validation_report' | 'paper_candidate' | 'paper_signal' | 'paper_trade' | 'polymarket_trade' | 'runtime_setup' | 'doubling_stability_audit' | 'btc_variant_optimizer';
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
    tableCountMode?: 'exact' | 'skipped';
    tables: Record<string, number | null>;
    indexes: Record<string, boolean>;
    recommendation: string;
    migrationTrigger: string;
  };
  runtimeError: string | null;
  strategies: HyperliquidStrategyAuditRow[];
}

export type HyperliquidStrategyCatalogRow = Omit<HyperliquidStrategyAuditRow, 'timeline' | 'trades'>;

export interface HyperliquidStrategyCatalogResponse {
  updatedAt: number;
  summary: HyperliquidStrategyAuditResponse['summary'];
  runtimeError: string | null;
  catalogSource?: 'catalog' | 'strategy-audit-fallback';
  catalogWarning?: string | null;
  strategies: HyperliquidStrategyCatalogRow[];
}

export type HyperliquidStrategyLearningKind = 'hypothesis' | 'decision' | 'lesson' | 'postmortem' | 'rule_change';
export type HyperliquidStrategyLearningOutcome = 'win' | 'loss' | 'mixed' | 'unknown';

export interface HyperliquidStrategyLearningEvent {
  eventId: string;
  strategyId: string;
  kind: HyperliquidStrategyLearningKind;
  outcome: HyperliquidStrategyLearningOutcome;
  stage: string | null;
  title: string;
  summary: string;
  evidencePaths: string[];
  lesson: string | null;
  ruleChange: string | null;
  nextAction: string | null;
  generatedAt: string | null;
  updatedAt: string | null;
  path: string | null;
}

export interface HyperliquidStrategyLearningResponse {
  updatedAt: number;
  strategyId: string | null;
  count: number;
  events: HyperliquidStrategyLearningEvent[];
}

export interface HyperliquidStrategyLearningCreate {
  strategyId: string;
  kind: HyperliquidStrategyLearningKind;
  outcome: HyperliquidStrategyLearningOutcome;
  stage?: string | null;
  title: string;
  summary?: string;
  evidencePaths?: string[];
  lesson?: string | null;
  ruleChange?: string | null;
  nextAction?: string | null;
}

export interface HyperliquidStrategyLearningCreateResponse {
  created: boolean;
  event: HyperliquidStrategyLearningEvent;
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

export interface HyperliquidBacktestRunOptions {
  lookbackDays?: number;
  runValidation?: boolean;
  buildPaperCandidate?: boolean;
  symbol?: string;
  symbols?: string[] | string;
  universe?: string;
  start?: string;
  end?: string;
  feeModel?: 'taker' | 'maker' | 'mixed';
  makerRatio?: number;
}

export interface HyperliquidBacktestArtifactSummary {
  artifactId: string;
  reportPath: string;
  validationPath: string | null;
  generatedAt: number;
  summary: Partial<HyperliquidBacktestRunResponse['summary']> & Record<string, unknown>;
  robustAssessment: {
    status?: string;
    blockers?: string[];
    checks?: Record<string, boolean>;
    notes?: string[];
  } | null;
  validationStatus: string | null;
  doublingEstimate: HyperliquidDoublingEstimate | null;
}

export interface HyperliquidBacktestArtifactsResponse {
  strategyId: string;
  artifacts: HyperliquidBacktestArtifactSummary[];
}

export interface HyperliquidValidationRunResponse {
  success: boolean;
  strategyId: string;
  reportPath: string;
  validationPath: string;
  validation: Record<string, unknown>;
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

export interface HyperliquidPaperCandidateBuildResponse {
  success: boolean;
  strategyId: string;
  reportPath: string;
  validationPath: string | null;
  paperPath: string;
  paper: Record<string, unknown>;
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
      const detail = await response.text().catch(() => '');
      throw gatewayHttpError(path, response.status, detail);
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
      throw gatewayHttpError(path, response.status, detail);
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
      throw gatewayHttpError(path, response.status, detail);
    }
    return response.json();
  } catch (error) {
    throw normalizeRequestError(error, 'Hyperliquid backtest request');
  } finally {
    window.clearTimeout(timeout);
  }
}

const PIPELINE_STAGES: HyperliquidPipelineStage[] = ['research', 'backtesting', 'audit', 'paper', 'blocked'];
const GATE_STATUSES: HyperliquidGateStatus[] = [
  'backtest-required',
  'backtest-running-eligible',
  'audit-eligible',
  'audit-blocked',
  'ready-for-paper',
  'paper-active'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPipelineStage(value: unknown): value is HyperliquidPipelineStage {
  return typeof value === 'string' && PIPELINE_STAGES.includes(value as HyperliquidPipelineStage);
}

function isGateStatus(value: unknown): value is HyperliquidGateStatus {
  return typeof value === 'string' && GATE_STATUSES.includes(value as HyperliquidGateStatus);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberOrDefault(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanOrDefault(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeLearningKind(value: unknown): HyperliquidStrategyLearningKind {
  const normalized = typeof value === 'string' ? value : 'lesson';
  return ['hypothesis', 'decision', 'lesson', 'postmortem', 'rule_change'].includes(normalized)
    ? normalized as HyperliquidStrategyLearningKind
    : 'lesson';
}

function normalizeLearningOutcome(value: unknown): HyperliquidStrategyLearningOutcome {
  const normalized = typeof value === 'string' ? value : 'unknown';
  return ['win', 'loss', 'mixed', 'unknown'].includes(normalized)
    ? normalized as HyperliquidStrategyLearningOutcome
    : 'unknown';
}

function recordAt(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = raw[key];
  return isRecord(value) ? value : {};
}

function displayNameFromStrategyId(strategyId: string): string {
  return strategyId
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Strategy';
}

function normalizeArtifactPaths(raw: Record<string, unknown>) {
  const artifacts = recordAt(raw, 'latestArtifactPaths');
  return {
    docs: stringOrNull(artifacts.docs),
    spec: stringOrNull(artifacts.spec),
    backtest: stringOrNull(artifacts.backtest),
    validation: stringOrNull(artifacts.validation),
    paper: stringOrNull(artifacts.paper),
    doublingStability: stringOrNull(artifacts.doublingStability),
    btcOptimization: stringOrNull(artifacts.btcOptimization)
  };
}

function normalizeChecklist(raw: Record<string, unknown>) {
  const checklist = recordAt(raw, 'checklist');
  return {
    docsExists: booleanOrDefault(checklist.docsExists),
    specExists: booleanOrDefault(checklist.specExists),
    backendModuleExists: booleanOrDefault(checklist.backendModuleExists),
    backtestExists: booleanOrDefault(checklist.backtestExists),
    validationExists: booleanOrDefault(checklist.validationExists),
    paperCandidateExists: booleanOrDefault(checklist.paperCandidateExists),
    paperLedgerExists: booleanOrDefault(checklist.paperLedgerExists),
    reviewsComplete: booleanOrDefault(checklist.reviewsComplete)
  };
}

function normalizeEvidenceCounts(raw: Record<string, unknown>) {
  const counts = recordAt(raw, 'evidenceCounts');
  return {
    backtestTrades: numberOrDefault(counts.backtestTrades),
    paperCandidates: numberOrDefault(counts.paperCandidates),
    paperSignals: numberOrDefault(counts.paperSignals),
    paperTrades: numberOrDefault(counts.paperTrades),
    polymarketTrades: numberOrDefault(counts.polymarketTrades),
    runtimeSetups: numberOrDefault(counts.runtimeSetups)
  };
}

function normalizeDoublingEstimate(value: unknown): HyperliquidDoublingEstimate | null {
  if (!isRecord(value)) return null;
  return {
    status: stringOrNull(value.status) ?? 'blocked',
    candidate: booleanOrDefault(value.candidate),
    strategyId: stringOrNull(value.strategyId),
    artifactId: stringOrNull(value.artifactId),
    reportPath: stringOrNull(value.reportPath),
    sampleStart: stringOrNull(value.sampleStart),
    sampleEnd: stringOrNull(value.sampleEnd),
    sampleDays: numberOrNull(value.sampleDays),
    returnPct: numberOrDefault(value.returnPct),
    geometricDailyReturnPct: numberOrNull(value.geometricDailyReturnPct),
    projectedDaysToDouble: numberOrNull(value.projectedDaysToDouble),
    projectedTradesToDouble: numberOrNull(value.projectedTradesToDouble),
    periodsToDouble: numberOrNull(value.periodsToDouble),
    totalTrades: numberOrDefault(value.totalTrades),
    feeModel: stringOrNull(value.feeModel),
    riskFraction: numberOrNull(value.riskFraction),
    robustStatus: stringOrNull(value.robustStatus),
    validationStatus: stringOrNull(value.validationStatus),
    blockers: stringArray(value.blockers)
  };
}

function normalizeDoublingStability(value: unknown): HyperliquidDoublingStability | null {
  if (!isRecord(value)) return null;
  return {
    status: stringOrNull(value.status) ?? 'fragile',
    artifactId: stringOrNull(value.artifactId),
    reportArtifactId: stringOrNull(value.reportArtifactId),
    validationArtifactId: stringOrNull(value.validationArtifactId),
    positiveSliceRatioPct: numberOrNull(value.positiveSliceRatioPct),
    largestPositiveSlicePnlSharePct: numberOrNull(value.largestPositiveSlicePnlSharePct),
    activeSliceCount: numberOrDefault(value.activeSliceCount),
    sliceCount: numberOrDefault(value.sliceCount),
    blockers: stringArray(value.blockers)
  };
}

function normalizeBtcOptimization(value: unknown): HyperliquidBtcOptimization | null {
  if (!isRecord(value)) return null;
  return {
    status: stringOrNull(value.status) ?? 'unknown',
    artifactId: stringOrNull(value.artifactId),
    variantCount: numberOrDefault(value.variantCount),
    stableCandidateCount: numberOrDefault(value.stableCandidateCount),
    fragileCandidateCount: numberOrDefault(value.fragileCandidateCount),
    topVariantId: stringOrNull(value.topVariantId),
    topReviewStatus: stringOrNull(value.topReviewStatus),
    topProjectedDaysToDouble: numberOrNull(value.topProjectedDaysToDouble),
    topReturnPct: numberOrNull(value.topReturnPct),
    topTotalTrades: numberOrNull(value.topTotalTrades),
    topStabilityStatus: stringOrNull(value.topStabilityStatus),
    topStabilityBlockers: stringArray(value.topStabilityBlockers),
    topLargestPositiveSlicePnlSharePct: numberOrNull(value.topLargestPositiveSlicePnlSharePct)
  };
}

function robustStatus(raw: Record<string, unknown>): string | null {
  const robust = recordAt(raw, 'robustAssessment');
  return stringOrNull(robust.status)?.toLowerCase() ?? null;
}

function deriveFallbackPipelineStage(raw: Record<string, unknown>): HyperliquidPipelineStage {
  if (isPipelineStage(raw.pipelineStage)) {
    return raw.pipelineStage;
  }

  const legacyStage = stringOrNull(raw.stage);
  const validationStatus = stringOrNull(raw.validationStatus)?.toLowerCase() ?? null;
  const status = robustStatus(raw);
  const artifacts = normalizeArtifactPaths(raw);
  const checklist = normalizeChecklist(raw);
  const counts = normalizeEvidenceCounts(raw);

  if (
    artifacts.paper ||
    checklist.paperCandidateExists ||
    checklist.paperLedgerExists ||
    validationStatus === 'ready-for-paper' ||
    legacyStage === 'paper_candidate' ||
    legacyStage === 'paper_runtime' ||
    counts.paperCandidates > 0 ||
    counts.paperSignals > 0 ||
    counts.paperTrades > 0
  ) {
    return 'paper';
  }

  if (
    validationStatus === 'blocked' ||
    validationStatus === 'validation_blocked' ||
    validationStatus === 'failed' ||
    legacyStage === 'validation_blocked' ||
    status === 'fails' ||
    status === 'failed' ||
    status === 'blocked'
  ) {
    return 'blocked';
  }

  if (status === 'passes' || status === 'pass') {
    return 'audit';
  }

  if (artifacts.backtest || checklist.backtestExists) {
    return 'blocked';
  }

  if (booleanOrDefault(raw.registeredForBacktest) || booleanOrDefault(raw.canBacktest) || legacyStage === 'registered') {
    return 'backtesting';
  }

  return 'research';
}

function deriveFallbackGateStatus(raw: Record<string, unknown>, pipelineStage: HyperliquidPipelineStage): HyperliquidGateStatus {
  if (isGateStatus(raw.gateStatus)) {
    return raw.gateStatus;
  }

  const legacyStage = stringOrNull(raw.stage);
  const validationStatus = stringOrNull(raw.validationStatus)?.toLowerCase() ?? null;
  const counts = normalizeEvidenceCounts(raw);

  if (pipelineStage === 'paper') {
    return legacyStage === 'paper_runtime' || counts.paperTrades > 0 || counts.paperSignals > 0
      ? 'paper-active'
      : 'ready-for-paper';
  }
  if (pipelineStage === 'audit') return 'audit-eligible';
  if (pipelineStage === 'blocked') return 'audit-blocked';
  if (pipelineStage === 'backtesting') return 'backtest-running-eligible';
  if (validationStatus === 'ready-for-paper') return 'ready-for-paper';
  return 'backtest-required';
}

function deriveFallbackGateReasons(raw: Record<string, unknown>, pipelineStage: HyperliquidPipelineStage): string[] {
  const existing = stringArray(raw.gateReasons);
  if (existing.length > 0) return existing;

  const robust = recordAt(raw, 'robustAssessment');
  const artifacts = normalizeArtifactPaths(raw);
  const checklist = normalizeChecklist(raw);
  const validationStatus = stringOrNull(raw.validationStatus);
  const reasons = [
    ...stringArray(robust.blockers),
    ...stringArray(raw.missingAuditItems)
  ];

  if (pipelineStage === 'blocked' && (artifacts.backtest || checklist.backtestExists) && !stringOrNull(robust.status)) {
    reasons.push('Latest backtest is missing a robust assessment after costs.');
  }
  if (pipelineStage === 'blocked' && validationStatus && validationStatus !== 'ready-for-paper') {
    reasons.push(`Validation status is ${validationStatus}.`);
  }
  if (pipelineStage === 'backtesting') {
    reasons.push('Backtest required before audit.');
  }
  if (pipelineStage === 'research') {
    reasons.push('Backend strategy package or registered backtest evidence is required before audit.');
  }
  if (pipelineStage === 'blocked' && reasons.length === 0) {
    reasons.push('Pipeline gate fields were missing from the gateway response.');
  }

  return uniqueStrings(reasons);
}

function normalizeNextAction(raw: Record<string, unknown>, strategyId: string, gateStatus: HyperliquidGateStatus, targetStage: HyperliquidPipelineStage): HyperliquidStrategyNextAction {
  const action = recordAt(raw, 'nextAction');
  const label = stringOrNull(action.label);
  const command = stringOrNull(action.command);
  const actionTargetStage = isPipelineStage(action.targetStage) ? action.targetStage : targetStage;
  if (label && command && typeof action.enabled === 'boolean') {
    return {
      label,
      command,
      enabled: action.enabled,
      targetStage: actionTargetStage
    };
  }

  if (gateStatus === 'backtest-running-eligible') {
    return {
      label: 'Run Backtest',
      command: `npm run hf:backtest -- --strategy ${strategyId}`,
      enabled: true,
      targetStage: 'audit'
    };
  }
  if (gateStatus === 'audit-eligible') {
    return {
      label: 'Run Audit',
      command: `npm run hf:agent:audit -- --strategy ${strategyId}`,
      enabled: true,
      targetStage: 'audit'
    };
  }
  if (gateStatus === 'ready-for-paper') {
    return {
      label: 'Create Paper Candidate',
      command: `npm run hf:paper -- --strategy ${strategyId}`,
      enabled: true,
      targetStage: 'paper'
    };
  }
  if (gateStatus === 'paper-active') {
    return {
      label: 'Review Paper Lab',
      command: `npm run hf:paper -- --strategy ${strategyId}`,
      enabled: true,
      targetStage: 'paper'
    };
  }
  if (gateStatus === 'audit-blocked') {
    return {
      label: 'Retry Backtest',
      command: `npm run hf:backtest -- --strategy ${strategyId}`,
      enabled: booleanOrDefault(raw.canBacktest) || booleanOrDefault(raw.registeredForBacktest),
      targetStage: 'backtesting'
    };
  }
  return {
    label: 'Create Strategy Spec',
    command: `npm run hf:strategy:new -- --strategy-id ${strategyId}`,
    enabled: false,
    targetStage: 'backtesting'
  };
}

function normalizeCatalogRowForPipeline(row: HyperliquidStrategyAuditRow | HyperliquidStrategyCatalogRow): HyperliquidStrategyCatalogRow {
  const raw = row as unknown as Record<string, unknown>;
  const strategyId = stringOrNull(raw.strategyId) ?? stringOrNull(raw.strategyKey) ?? 'unknown_strategy';
  const pipelineStage = deriveFallbackPipelineStage(raw);
  const gateStatus = deriveFallbackGateStatus(raw, pipelineStage);
  const latestArtifactPaths = normalizeArtifactPaths(raw);
  const checklist = normalizeChecklist(raw);
  const evidenceCounts = normalizeEvidenceCounts(raw);
  const gateReasons = deriveFallbackGateReasons(raw, pipelineStage);

  return {
    ...(row as HyperliquidStrategyCatalogRow),
    strategyKey: stringOrNull(raw.strategyKey) ?? strategyId,
    strategyId,
    displayName: stringOrNull(raw.displayName) ?? displayNameFromStrategyId(strategyId),
    stage: (stringOrNull(raw.stage) as HyperliquidStrategyAuditRow['stage'] | null) ?? 'unknown',
    pipelineStage,
    gateStatus,
    gateReasons,
    nextAction: normalizeNextAction(raw, strategyId, gateStatus, pipelineStage),
    sourceTypes: stringArray(raw.sourceTypes),
    registeredForBacktest: booleanOrDefault(raw.registeredForBacktest),
    canBacktest: booleanOrDefault(raw.canBacktest),
    symbol: stringOrNull(raw.symbol),
    setupTag: stringOrNull(raw.setupTag),
    side: (stringOrNull(raw.side) as HyperliquidStrategyCatalogRow['side'] | null) ?? 'n/a',
    validationPolicy: isRecord(raw.validationPolicy) ? raw.validationPolicy as Record<string, number> : null,
    doublingEstimate: normalizeDoublingEstimate(raw.doublingEstimate),
    doublingStability: normalizeDoublingStability(raw.doublingStability),
    btcOptimization: normalizeBtcOptimization(raw.btcOptimization),
    latestBacktestSummary: isRecord(raw.latestBacktestSummary)
      ? raw.latestBacktestSummary as HyperliquidStrategyCatalogRow['latestBacktestSummary']
      : null,
    latestBacktestConfig: isRecord(raw.latestBacktestConfig) ? raw.latestBacktestConfig : null,
    robustAssessment: isRecord(raw.robustAssessment)
      ? raw.robustAssessment as HyperliquidStrategyCatalogRow['robustAssessment']
      : null,
    exitReasonCounts: isRecord(raw.exitReasonCounts) ? raw.exitReasonCounts as Record<string, number> : {},
    documentationPaths: stringArray(raw.documentationPaths),
    latestArtifactPaths,
    validationStatus: stringOrNull(raw.validationStatus),
    evidenceCounts,
    tradeCount: numberOrDefault(raw.tradeCount),
    openTrades: numberOrDefault(raw.openTrades),
    closedTrades: numberOrDefault(raw.closedTrades),
    reviewableClosedTrades: numberOrDefault(raw.reviewableClosedTrades),
    reviewedTrades: numberOrDefault(raw.reviewedTrades),
    wins: numberOrDefault(raw.wins),
    notionalUsd: numberOrDefault(raw.notionalUsd),
    realizedPnlUsd: numberOrDefault(raw.realizedPnlUsd),
    unrealizedPnlUsd: numberOrDefault(raw.unrealizedPnlUsd),
    totalPnlUsd: numberOrDefault(raw.totalPnlUsd),
    avgExecutionQuality: typeof raw.avgExecutionQuality === 'number' ? raw.avgExecutionQuality : null,
    decisionLabels: isRecord(raw.decisionLabels) ? raw.decisionLabels as Record<string, number> : {},
    openRiskUsd: numberOrDefault(raw.openRiskUsd),
    winRate: numberOrDefault(raw.winRate),
    reviewCoverage: numberOrDefault(raw.reviewCoverage),
    lastActivityAt: typeof raw.lastActivityAt === 'number' ? raw.lastActivityAt : null,
    lastActivityLabel: stringOrNull(raw.lastActivityLabel),
    checklist,
    missingAuditItems: stringArray(raw.missingAuditItems)
  };
}

function normalizeStrategyLearningEvent(rawEvent: unknown): HyperliquidStrategyLearningEvent {
  const raw = isRecord(rawEvent) ? rawEvent : {};
  const eventId = stringOrNull(raw.eventId) ?? stringOrNull(raw.event_id) ?? 'learning-event';
  const strategyId = stringOrNull(raw.strategyId) ?? stringOrNull(raw.strategy_id) ?? 'unknown_strategy';
  return {
    eventId,
    strategyId,
    kind: normalizeLearningKind(raw.kind),
    outcome: normalizeLearningOutcome(raw.outcome),
    stage: stringOrNull(raw.stage),
    title: stringOrNull(raw.title) ?? 'Strategy learning event',
    summary: stringOrNull(raw.summary) ?? '',
    evidencePaths: uniqueStrings([
      ...stringArray(raw.evidencePaths),
      ...stringArray(raw.evidence_paths)
    ]),
    lesson: stringOrNull(raw.lesson),
    ruleChange: stringOrNull(raw.ruleChange) ?? stringOrNull(raw.rule_change),
    nextAction: stringOrNull(raw.nextAction) ?? stringOrNull(raw.next_action),
    generatedAt: stringOrNull(raw.generatedAt) ?? stringOrNull(raw.generated_at),
    updatedAt: stringOrNull(raw.updatedAt) ?? stringOrNull(raw.updated_at),
    path: stringOrNull(raw.path)
  };
}

function learningCreatePayload(input: HyperliquidStrategyLearningCreate) {
  return {
    strategy_id: input.strategyId,
    kind: input.kind,
    outcome: input.outcome,
    stage: input.stage ?? null,
    title: input.title,
    summary: input.summary ?? '',
    evidence_paths: input.evidencePaths ?? [],
    lesson: input.lesson ?? null,
    rule_change: input.ruleChange ?? null,
    next_action: input.nextAction ?? null
  };
}

function normalizeBacktestRunOptions(options: HyperliquidBacktestRunOptions | boolean = {}) {
  const rawOptions = typeof options === 'boolean' ? { buildPaperCandidate: options } : options;
  return {
    ...rawOptions,
    lookbackDays: rawOptions.lookbackDays ?? DEFAULT_UI_BACKTEST_LOOKBACK_DAYS,
    runValidation: rawOptions.runValidation ?? true,
    buildPaperCandidate: rawOptions.buildPaperCandidate ?? false,
    universe: rawOptions.universe ?? 'default'
  };
}

function backtestRunPayload(strategyId: string, options: HyperliquidBacktestRunOptions | boolean = {}) {
  const normalized = normalizeBacktestRunOptions(options);
  return {
    strategy_id: strategyId,
    lookback_days: normalized.lookbackDays,
    run_validation: normalized.runValidation,
    build_paper_candidate: normalized.buildPaperCandidate,
    symbol: normalized.symbol,
    symbols: normalized.symbols,
    universe: normalized.universe,
    start: normalized.start,
    end: normalized.end,
    fee_model: normalized.feeModel,
    maker_ratio: normalized.makerRatio
  };
}

function ensureBacktestQuery(options: HyperliquidBacktestRunOptions | boolean = {}): string {
  const normalized = normalizeBacktestRunOptions(options);
  const params = new URLSearchParams({
    run_validation: String(normalized.runValidation),
    build_paper_candidate: String(normalized.buildPaperCandidate),
    lookback_days: String(normalized.lookbackDays),
    universe: normalized.universe
  });
  if (normalized.symbol) params.set('symbol', normalized.symbol);
  if (normalized.symbols) params.set('symbols', Array.isArray(normalized.symbols) ? normalized.symbols.join(',') : normalized.symbols);
  if (normalized.start) params.set('start', normalized.start);
  if (normalized.end) params.set('end', normalized.end);
  if (normalized.feeModel) params.set('fee_model', normalized.feeModel);
  if (normalized.makerRatio !== undefined) params.set('maker_ratio', String(normalized.makerRatio));
  return params.toString();
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

  async generatePineIndicator(payload: PineIndicatorGenerateRequest): Promise<PineIndicatorGenerateResponse> {
    return postJson<PineIndicatorGenerateResponse>('/api/hyperliquid/pine/indicators/generate', payload, API_URL, AGENT_RUN_TIMEOUT_MS);
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

  async getStrategyCatalog(limit = 500): Promise<HyperliquidStrategyCatalogResponse> {
    return withRequestCache(`hyperliquid:strategy-catalog:${limit}`, 5_000, async () => {
      try {
        const response = await fetchJson<HyperliquidStrategyCatalogResponse>(`/api/hyperliquid/strategies/catalog?limit=${limit}`);
        return {
          ...response,
          catalogSource: response.catalogSource ?? 'catalog',
          catalogWarning: response.catalogWarning ?? null,
          strategies: response.strategies.map(normalizeCatalogRowForPipeline)
        };
      } catch (error) {
        if (!isHttpStatus(error, 404)) {
          throw error;
        }
        const auditLimit = Math.min(Math.max(limit, 20), 500);
        const fallback = await fetchJson<HyperliquidStrategyAuditResponse>(`/api/hyperliquid/strategy-audit?limit=${auditLimit}`);
        return {
          updatedAt: fallback.updatedAt,
          summary: fallback.summary,
          runtimeError: fallback.runtimeError,
          catalogSource: 'strategy-audit-fallback',
          catalogWarning: STRATEGY_CATALOG_FALLBACK_WARNING,
          strategies: fallback.strategies.map(normalizeCatalogRowForPipeline)
        };
      }
    });
  }

  async getStrategyLearning(strategyId?: string, limit = 200): Promise<HyperliquidStrategyLearningResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (strategyId) {
      params.set('strategy_id', strategyId);
    }
    return withRequestCache(`hyperliquid:strategy-learning:${strategyId || 'all'}:${limit}`, 5_000, async () => {
      const response = await fetchJson<{
        updatedAt: number;
        strategyId?: string | null;
        strategy_id?: string | null;
        count: number;
        events: unknown[];
      }>(`/api/hyperliquid/strategies/learning?${params.toString()}`);
      return {
        updatedAt: response.updatedAt,
        strategyId: response.strategyId ?? response.strategy_id ?? null,
        count: response.count,
        events: (response.events || []).map(normalizeStrategyLearningEvent)
      };
    });
  }

  async createStrategyLearningEvent(input: HyperliquidStrategyLearningCreate): Promise<HyperliquidStrategyLearningCreateResponse> {
    const response = await postJson<{ created: boolean; event: unknown }>(
      '/api/hyperliquid/strategies/learning',
      learningCreatePayload(input)
    );
    invalidateRequestCache('hyperliquid:strategy-learning:');
    invalidateRequestCache('hyperliquid:strategy-catalog:');
    return {
      created: response.created,
      event: normalizeStrategyLearningEvent(response.event)
    };
  }

  async runBacktest(strategyId: string, options: HyperliquidBacktestRunOptions | boolean = {}): Promise<HyperliquidBacktestRunResponse> {
    const response = await postJson<HyperliquidBacktestRunResponse>(
      '/api/hyperliquid/backtests/run',
      backtestRunPayload(strategyId, options),
      BACKTEST_API_URL
    );
    invalidateRequestCache('hyperliquid:strategy-audit:');
    invalidateRequestCache('hyperliquid:strategy-catalog:');
    invalidateRequestCache(`hyperliquid:latest-backtest:${strategyId}`);
    invalidateRequestCache(`hyperliquid:backtest-artifacts:${strategyId}`);
    invalidateRequestCache(`hyperliquid:backtest-artifact:${strategyId}:`);
    return response;
  }

  async buildPaperCandidate(strategyId: string): Promise<HyperliquidPaperCandidateBuildResponse> {
    const response = await postJson<HyperliquidPaperCandidateBuildResponse>('/api/hyperliquid/paper/candidates/build', {
      strategy_id: strategyId
    }, BACKTEST_API_URL);
    invalidateRequestCache('hyperliquid:strategy-audit:');
    invalidateRequestCache('hyperliquid:strategy-catalog:');
    invalidateRequestCache(`hyperliquid:latest-backtest:${strategyId}`);
    invalidateRequestCache(`hyperliquid:backtest-artifacts:${strategyId}`);
    invalidateRequestCache(`hyperliquid:backtest-artifact:${strategyId}:`);
    return response;
  }

  async runValidation(strategyId: string, reportPath?: string): Promise<HyperliquidValidationRunResponse> {
    const params = new URLSearchParams();
    if (reportPath) {
      params.set('report_path', reportPath);
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await postJson<HyperliquidValidationRunResponse>(
      `/api/hyperliquid/validations/${encodeURIComponent(strategyId)}/run${suffix}`,
      undefined,
      BACKTEST_API_URL
    );
    invalidateRequestCache('hyperliquid:strategy-audit:');
    invalidateRequestCache('hyperliquid:strategy-catalog:');
    invalidateRequestCache(`hyperliquid:latest-backtest:${strategyId}`);
    invalidateRequestCache(`hyperliquid:backtest-artifacts:${strategyId}`);
    invalidateRequestCache(`hyperliquid:backtest-artifact:${strategyId}:`);
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

  async getBacktestArtifacts(strategyId: string, limit = 20): Promise<HyperliquidBacktestArtifactsResponse> {
    return withRequestCache(`hyperliquid:backtest-artifacts:${strategyId}:${limit}`, 10_000, async () => {
      return fetchJsonFrom<HyperliquidBacktestArtifactsResponse>(
        BACKTEST_API_URL,
        `/api/hyperliquid/backtests/${encodeURIComponent(strategyId)}/artifacts?limit=${limit}`
      );
    });
  }

  async getBacktestArtifact(strategyId: string, artifactId: string): Promise<HyperliquidLatestBacktestResponse> {
    return withRequestCache(`hyperliquid:backtest-artifact:${strategyId}:${artifactId}`, 10_000, async () => {
      return fetchJsonFrom<HyperliquidLatestBacktestResponse>(
        BACKTEST_API_URL,
        `/api/hyperliquid/backtests/${encodeURIComponent(strategyId)}/artifacts/${encodeURIComponent(artifactId)}`
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

  async ensureBacktest(strategyId: string, options: HyperliquidBacktestRunOptions | boolean = {}): Promise<HyperliquidLatestBacktestResponse> {
    const query = ensureBacktestQuery(options);
    const response = await postJson<HyperliquidLatestBacktestResponse>(
      `/api/hyperliquid/backtests/${encodeURIComponent(strategyId)}/ensure?${query}`,
      undefined,
      BACKTEST_API_URL
    );
    invalidateRequestCache(`hyperliquid:latest-backtest:${strategyId}`);
    invalidateRequestCache('hyperliquid:strategy-audit:');
    invalidateRequestCache('hyperliquid:strategy-catalog:');
    invalidateRequestCache(`hyperliquid:backtest-artifacts:${strategyId}`);
    invalidateRequestCache(`hyperliquid:backtest-artifact:${strategyId}:`);
    return response;
  }

  async runAllBacktests(buildPaperCandidate = false): Promise<{ success: boolean; results: HyperliquidBacktestRunResponse[] }> {
    const response = await postJson<{ success: boolean; results: HyperliquidBacktestRunResponse[] }>(
      `/api/hyperliquid/backtests/run-all?run_validation=true&build_paper_candidate=${buildPaperCandidate ? 'true' : 'false'}`,
      undefined,
      BACKTEST_API_URL
    );
    invalidateRequestCache('hyperliquid:strategy-audit:');
    invalidateRequestCache('hyperliquid:strategy-catalog:');
    invalidateRequestCache('hyperliquid:latest-backtest:');
    invalidateRequestCache('hyperliquid:backtest-artifacts:');
    invalidateRequestCache('hyperliquid:backtest-artifact:');
    return response;
  }

  async getPaperSessionAnalytics(): Promise<HyperliquidPaperSessionAnalyticsResponse> {
    return withRequestCache('hyperliquid:paper-session-analytics', 10_000, async () => {
      return fetchJson<HyperliquidPaperSessionAnalyticsResponse>('/api/hyperliquid/paper/session-analytics');
    });
  }

  async getPaperReadiness(strategyId: string): Promise<HyperliquidPaperReadinessResponse> {
    return withRequestCache(`hyperliquid:paper-readiness:${strategyId}`, 5_000, async () => {
      return fetchJson<HyperliquidPaperReadinessResponse>(
        `/api/hyperliquid/paper/readiness/${encodeURIComponent(strategyId)}`
      );
    });
  }

  async runPaperRuntimeTick(strategyId = 'btc_failed_impulse_reversal', dryRun = false): Promise<HyperliquidPaperRuntimeTickResponse> {
    const response = await postJson<HyperliquidPaperRuntimeTickResponse>(
      `/api/hyperliquid/paper/runtime/${encodeURIComponent(strategyId)}/tick?dry_run=${dryRun ? 'true' : 'false'}`,
      undefined,
      API_URL
    );
    invalidatePaperCaches();
    return response;
  }

  async getPaperRuntimeSupervisor(strategyId = 'btc_failed_impulse_reversal'): Promise<HyperliquidPaperRuntimeSupervisorResponse> {
    return withRequestCache(`hyperliquid:paper-runtime-supervisor:${strategyId}`, 5_000, async () => {
      return fetchJson<HyperliquidPaperRuntimeSupervisorResponse>(
        `/api/hyperliquid/paper/runtime/${encodeURIComponent(strategyId)}/supervisor`
      );
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
  invalidateRequestCache('hyperliquid:paper-readiness:');
  invalidateRequestCache('hyperliquid:strategy-audit:');
  invalidateRequestCache('hyperliquid:strategy-catalog:');
}
