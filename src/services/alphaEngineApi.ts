import { ALPHA_ENGINE_HTTP_URL } from './backendConfig';

const API_BASE_URL = ALPHA_ENGINE_HTTP_URL;

export interface AlphaEngineStatus {
  engine: string;
  hyperliquid_api_url: string;
  btc_dataset_path: string | null;
  default_symbols: string[];
  strategy_count: number;
  evaluation_interval_seconds: number;
}

export interface RuntimeStatus {
  status: string;
  started_at: string | null;
  last_cycle_at: string | null;
  interval_seconds: number;
  strategy_count: number;
}

export interface EvaluationItem {
  strategy_id: string;
  title: string;
  stage: string;
  archetype: string;
  proxy_model: string;
  status: string;
  promotion_state: string;
  last_run_at: string | null;
  dataset_mode: string | null;
  dataset_rows: number;
  return_pct: number | null;
  profit_factor: number | null;
  win_rate_pct: number | null;
  max_drawdown_pct: number | null;
  total_trades: number | null;
  notes: string[];
  summary: Record<string, unknown>;
  equity_curve_preview: Array<{ timestamp: string; equity: number }>;
}

export interface EvaluationSnapshot {
  status: string;
  started_at: string | null;
  last_cycle_at: string | null;
  interval_seconds: number;
  strategies: EvaluationItem[];
  leaders: EvaluationItem[];
}

export interface MarketContext {
  coin: string;
  funding: number | null;
  premium: number | null;
  mark_px: number | null;
  mid_px: number | null;
  oracle_px: number | null;
  open_interest: number | null;
  day_ntl_vlm: number | null;
  impact_pxs: string[];
}

export interface MarketCandleRow {
  t: number;
  T?: number;
  s?: string;
  i?: string;
  o: string | number;
  c: string | number;
  h: string | number;
  l: string | number;
  v?: string | number;
  n?: number;
}

export interface MarketCandlesResponse {
  coin: string;
  interval: string;
  lookback_days: number;
  rows: MarketCandleRow[];
}

export interface PolymarketBtcStatus {
  strategyId: string;
  marketSlug: string;
  latestSnapshot: {
    timestamp: string;
    slug: string;
    eventId: string;
    yesPrice: number;
    bestBid: number;
    bestAsk: number;
    spreadPct: number;
    basisBps: number;
    secondsToExpiry: number;
  } | null;
  liveReadiness: {
    liveEnabled: boolean;
    checks: Record<string, boolean>;
    blockers: string[];
    warnings?: string[];
    circuitBreaker?: {
      is_open: boolean;
      failure_count: number;
      timeout: number;
    };
  };
  strategyAssessment?: {
    recommendedStrategy: string;
    dryRun: {
      allowed: boolean;
      reason: string;
    };
    makerRun?: {
      allowed: boolean;
      reason: string;
    };
    livePilot: {
      allowed: boolean;
      reason: string;
      maxEntryPrice: number;
      minNetEdgePct: number;
      minConfidence: number;
      allowedEntryBuckets?: string[];
    };
    makerEvaluation?: {
      signal: string;
      side: string | null;
      confidence: number;
      entry_price: number;
      target_exit_price: number;
      modeled_prob_up: number;
      net_edge_pct: number;
      entry_price_bucket: string | null;
      filters_passed: Record<string, string>;
      filters_failed: Record<string, string>;
      reasons: string[];
    };
    entryProfile?: {
      entryPrice: number;
      entryPriceBucket: string | null;
      netEdgePct: number;
      spreadPct: number;
      feesEnabled: boolean;
    };
    researchNotes: string[];
    portfolioPolicy?: {
      name: string;
      maxRiskPerTradePct: number;
      maxTotalOpenExposurePct: number;
      maxDailyDrawdownPct: number;
      maxOpenPositions: number;
      minExpectedEdgePct: number;
      minConfidence: number;
      maxEntryPrice: number;
      preferMaker: boolean;
      coreThesis: string;
    };
  } | null;
  performance: {
    startingBalance: number;
    currentBalance: number;
    totalPnlUsd: number;
    roiPct: number;
    closedTrades: number;
    openTrades: number;
    winRatePct: number;
  };
  sessionGuard?: {
    should_pause: boolean;
    reason: string;
    pause_minutes: number;
  };
}

export interface PolymarketTrade {
  id: number;
  createdAt: number;
  mode: 'dry-run' | 'live';
  slug: string;
  side: 'BUY_YES' | 'BUY_NO';
  status: 'OPEN' | 'CLOSED';
  signalConfidence: number;
  entryPrice: number | null;
  exitPrice: number | null;
  sizeUsd: number;
  netPnlUsd: number | null;
  roiPct: number | null;
  notes: string | null;
}

export interface EquityPoint {
  timestamp: string;
  balance?: number;
  equity?: number;
  total_pnl_usd?: number;
  pnl_delta_usd?: number;
  event?: string;
}

export interface AutoRunnerStatus {
  running: boolean;
  mode: 'dry-run' | 'live';
  intervalSeconds: number;
  balanceUsd: number;
  maxNotionalUsd: number;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface CalendarAnalysis {
  analysis: {
    overall_risk: string;
    critical_days: Array<{
      date: string;
      risk_level: string;
      trading_recommendation: string;
      event_count: number;
    }>;
    recommendations: string[];
    event_clusters: Array<{
      date: string;
      time: string;
      event_count: number;
      risk: string;
    }>;
  };
  ai?: AiMeta;
  warning?: string | null;
}

export interface CalendarWeek {
  source: string;
  timezone: string;
  events_by_day: Record<string, Array<{
    id: number;
    time: string;
    date_time: string;
    currency: string;
    impact: string;
    event_name: string;
    forecast: string | null;
    previous: string | null;
    actual: string | null;
  }>>;
  count: number;
  warning?: string | null;
  updated_at?: string;
}

export interface AiMeta {
  provider: string;
  model: string | null;
  fallbackUsed: boolean;
  errors: Array<{ provider: string; message: string }>;
}

export interface AiStatus {
  providerOrder: string[];
  activeProvider: string;
  activeModel: string | null;
  deepseek: {
    configured: boolean;
    baseUrl: string;
    model: string;
  };
  openai: {
    configured: boolean;
    model: string;
  };
}

export interface AiTestResult {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  provider?: string;
  ai?: AiMeta;
  status: AiStatus;
}

export interface MacroNews {
  source: string;
  timezone: string;
  items: Array<{
    id: string;
    source: string;
    title: string;
    url: string | null;
    summary: string | null;
    published_at: string;
    impact: string;
    tags: string[];
    rank: number;
  }>;
  count: number;
  warnings: string[];
  updated_at: string;
}

export interface BankHolidays {
  source: string;
  timezone: string;
  holidays: Array<{
    date: string;
    country: string;
    country_name: string;
    name: string;
    local_name: string;
    global: boolean;
    types: string[];
  }>;
  count: number;
  warnings: string[];
  updated_at: string;
}

export interface WeeklyBrief {
  brief: {
    overall_risk: string;
    executive_summary: string;
    critical_days: Array<Record<string, unknown>>;
    watch_items: string[];
    stand_aside_windows: string[];
    bank_holiday_notes: string[];
    news_catalysts: string[];
    recommendations: string[];
  };
  ai: AiMeta;
  calendar: CalendarWeek;
  news: MacroNews;
  holidays: BankHolidays;
  updated_at: string;
}

export interface WalletOverview {
  address: string;
  portfolioValue: number;
  cashBalance: number;
  cashBalanceSource: string;
  clobCashBalance: number;
  unrealizedPnlUsd: number;
  openPositions: Array<{
    market: string;
    slug: string | null;
    outcome: string | null;
    size: number;
    avgPrice: number | null;
    curPrice: number | null;
    cashPnl: number;
    percentPnl: number | null;
  }>;
}

export interface LabOverview {
  thesis: string;
  familyHistogram: Array<{ family: string; count: number; priority: number }>;
  sampleMarkets: Array<{
    slug: string;
    question: string;
    family: string;
    bestBid: number;
    bestAsk: number;
    spreadPct: number;
    liquidityHint: string;
  }>;
}

async function requestJson<T>(path: string, timeoutMs = 20_000, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.text();
        detail = payload ? `: ${payload.slice(0, 180)}` : '';
      } catch {
        detail = '';
      }
      throw new Error(`${path} -> ${response.status} ${response.statusText}${detail}`);
    }

    return await response.json() as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestWrappedData<T>(path: string, timeoutMs = 20_000): Promise<T> {
  const result = await requestJson<{ success: boolean; data: T; detail?: string; message?: string }>(path, timeoutMs);
  if (!result.success) {
    throw new Error(result.detail || result.message || `Backend returned success=false for ${path}`);
  }
  return result.data;
}

export const alphaEngineApi = {
  baseUrl: API_BASE_URL,
  health: () => requestJson<{ status: string }>('/health', 8_000),
  status: () => requestJson<AlphaEngineStatus>('/status', 12_000),
  runtime: () => requestJson<RuntimeStatus>('/runtime/status', 12_000),
  evaluations: () => requestJson<EvaluationSnapshot>('/evaluations', 25_000),
  marketContext: (coin = 'BTC') => requestJson<MarketContext>(`/market/context/${encodeURIComponent(coin)}`, 12_000),
  marketCandles: (coin = 'BTC', interval = '1h') => requestJson<MarketCandlesResponse>(`/market/candles/${encodeURIComponent(coin)}?interval=${encodeURIComponent(interval)}`, 20_000),
  polymarketBtcStatus: () => requestWrappedData<PolymarketBtcStatus>('/api/polymarket/btc-5m/status', 20_000),
  polymarketBtcTrades: (limit = 20) => requestWrappedData<PolymarketTrade[]>(`/api/polymarket/btc-5m/trades?limit=${limit}`, 20_000),
  polymarketBtcEquity: () => requestWrappedData<EquityPoint[]>('/api/polymarket/btc-5m/equity-curve', 20_000),
  polymarketAutoStatus: () => requestWrappedData<AutoRunnerStatus>('/api/polymarket/btc-5m/auto/status', 15_000),
  walletOverview: () => requestWrappedData<WalletOverview>('/api/polymarket/wallet/overview', 20_000),
  labOverview: () => requestWrappedData<LabOverview>('/api/polymarket/lab/overview', 20_000),
  aiStatus: () => requestJson<AiStatus>('/api/ai/status', 10_000),
  aiTest: () => requestJson<AiTestResult>('/api/ai/test', 35_000, 'POST'),
  calendarAnalysis: () => requestJson<CalendarAnalysis>('/calendar/analysis', 15_000),
  calendarWeek: () => requestJson<CalendarWeek>('/calendar/this-week', 15_000),
  calendarNews: () => requestJson<MacroNews>('/calendar/news', 15_000),
  calendarHolidays: () => requestJson<BankHolidays>('/calendar/holidays', 15_000),
  calendarWeeklyBrief: () => requestJson<WeeklyBrief>('/calendar/weekly-brief', 40_000),
  calendarRefresh: () => requestJson<{ success: boolean }>('/calendar/refresh', 45_000, 'POST')
};
