import { invalidateRequestCache, withRequestCache } from './requestCache';
import { GATEWAY_HTTP_URL } from './backendConfig';

const API_URL = GATEWAY_HTTP_URL;
const REQUEST_TIMEOUT_MS = 35_000;

function normalizeRequestError(error: unknown, label: string): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Check the Hyperliquid gateway on ${API_URL}.`);
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

class HyperliquidService {
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
}
