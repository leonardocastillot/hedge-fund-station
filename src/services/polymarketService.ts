/**
 * Polymarket Service - API client para Polymarket arbitrage
 */

import { ALPHA_ENGINE_HTTP_URL } from './backendConfig';

const DEFAULT_POLYMARKET_BACKEND_URL = 'http://127.0.0.1:18500';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = trimTrailingSlash(value);
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}

const POLYMARKET_PRIMARY_API_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_POLYMARKET_API_URL ||
  import.meta.env.VITE_POLYMARKET_BACKEND_URL ||
  DEFAULT_POLYMARKET_BACKEND_URL
);
const POLYMARKET_FALLBACK_API_URL = normalizeApiBaseUrl(ALPHA_ENGINE_HTTP_URL);
const POLYMARKET_API_URLS = Array.from(new Set([POLYMARKET_PRIMARY_API_URL, POLYMARKET_FALLBACK_API_URL]));
const API_URL = trimTrailingSlash(ALPHA_ENGINE_HTTP_URL);

async function fetchJsonWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs: number = 20_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchPolymarketJson(path: string, init?: RequestInit, timeoutMs = 20_000) {
  let lastError: Error | null = null;
  for (const baseUrl of POLYMARKET_API_URLS) {
    const response = await fetchJsonWithTimeout(`${trimTrailingSlash(baseUrl)}${path}`, init, timeoutMs);
    if (response.ok) {
      return { response, baseUrl };
    }
    if (response.status !== 404) {
      return { response, baseUrl };
    }
    lastError = new Error(`HTTP error! status: ${response.status}`);
  }
  throw lastError || new Error('Unable to reach a Polymarket backend');
}

function blockedAuditMutation(operation: string): never {
  const message = `${operation} is blocked by the desktop read-only audit guard. Use the backend/VM directly after security review.`;
  console.warn(`[Audit Guard] ${message}`);
  throw new Error(message);
}

export interface PolymarketStats {
  is_running: boolean;
  start_time: string | null;
  runtime_hours: number;
  parameters: {
    min_diff_pct: number;
    base_execution_cost_pct: number;
    min_actionable_net_edge_pct: number;
    trade_size_usd: number;
    signal_cooldown_seconds: number;
  };
  current_prices: {
    consensus: number | null;
    chainlink: number | null;
    exchanges: Record<string, number>;
    spread_pct: number | null;
    diff_pct: number;
  };
  updates: {
    consensus: number;
    chainlink_polls: number;
    chainlink_updates: number;
    outliers_detected: number;
  };
  opportunities: {
    total: number;
    high: number;
    medium: number;
    low: number;
    up: number;
    down: number;
    actionable: number;
    ignored_low_edge: number;
  };
  opportunities_per_hour: number;
  estimated_daily: number;
  performance: {
    starting_balance: number;
    current_balance: number;
    total_pnl_usd: number;
    total_return_pct: number;
    actionable_trades: number;
    ignored_low_edge: number;
    avg_net_edge_pct: number;
    avg_pnl_per_trade_usd: number;
    projected_daily_pnl_usd: number;
    actionable_rate_pct: number;
    equity_points: number;
  };
}

export interface Opportunity {
  id: number;
  timestamp: string;
  consensus_price: number;
  chainlink_price: number;
  exchange_prices: Record<string, number>;
  spread_pct: number | null;
  diff_usd: number;
  diff_pct: number;
  direction: 'UP' | 'DOWN';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  capture_ratio: number;
  estimated_cost_pct: number;
  gross_edge_pct: number;
  net_edge_pct: number;
  modeled_pnl_usd: number;
  trade_size_usd: number;
  actionable: boolean;
  rejection_reason: string | null;
}

export interface PricePoint {
  timestamp: string;
  consensus: number;
  weighted: number;
  chainlink: number | null;
  spread_pct: number | null;
  exchanges: Record<string, number>;
}

export interface ChainlinkUpdate {
  timestamp: string;
  old_price: number;
  new_price: number;
  change_pct: number;
  round_id: number;
}

export interface EquityPoint {
  timestamp: string;
  balance: number;
  pnl_delta_usd: number;
  event: string;
  opportunity_id: number | null;
  total_pnl_usd: number;
}

export interface PolymarketBtc5mStatus {
  strategyId: string;
  marketSlug: string;
  liveReadiness: {
    liveEnabled: boolean;
    checks: {
      clobClientInstalled: boolean;
      liveFlagConfigured: boolean;
      privateKeyConfigured: boolean;
      apiKeyConfigured: boolean;
      apiSecretConfigured: boolean;
      apiPassphraseConfigured: boolean;
      apiCredsReady: boolean;
      funderAddressConfigured: boolean;
      signatureTypeConfigured: boolean;
    };
    blockers: string[];
    warnings?: string[];
  };
  strategyAssessment?: {
    recommendedStrategy: string;
    dryRun: {
      allowed: boolean;
      reason: string;
    };
    livePilot: {
      allowed: boolean;
      reason: string;
      maxEntryPrice: number;
      minNetEdgePct: number;
      minConfidence: number;
    };
    entryProfile: {
      entryPrice: number;
      entryPriceBucket: string;
      netEdgePct: number;
      spreadPct: number;
      feesEnabled: boolean;
    };
    researchNotes: string[];
  } | null;
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
  performance: {
    startingBalance: number;
    currentBalance: number;
    totalPnlUsd: number;
    roiPct: number;
    closedTrades: number;
    openTrades: number;
    winRatePct: number;
  };
  sessionGuard: {
    should_pause: boolean;
    reason: string;
    pause_minutes: number;
  };
}

export interface PolymarketBtc5mRunResult {
  tradeId: number | null;
  snapshot: {
    slug: string;
    event_id: string;
    yes_price: number;
    best_bid: number;
    best_ask: number;
    spread_pct: number;
    basis_bps: number;
    seconds_to_expiry: number;
    fee_pct: number;
    slippage_pct: number;
  };
  signal: {
    signal: 'ENTER' | 'HOLD';
    side: 'BUY_YES' | 'BUY_NO' | null;
    confidence: number;
    modeled_prob_up: number;
    gross_edge_pct: number;
    net_edge_pct: number;
    reasons: string[];
    filters_passed: Record<string, string>;
    filters_failed: Record<string, string>;
  };
  positionSizing: {
    can_enter: boolean;
    block_reason: string | null;
    size_usd: number;
    size_pct: number;
    adjustments: string[];
  };
  sessionGuard: {
    should_pause: boolean;
    reason: string;
    pause_minutes: number;
  };
  allowed: {
    allowed: boolean;
    reason: string;
  };
  strategyAssessment?: PolymarketBtc5mStatus['strategyAssessment'];
  execution?: {
    tokenId: string;
    outcome: string;
    orderType: string;
    spentUsd: number;
    shares: number;
    avgPrice: number;
    orderId: string | null;
    exchangeStatus: string;
    transactionsHashes: string[];
    response: Record<string, unknown>;
  } | null;
}

export interface PolymarketBtc5mTrade {
  id: number;
  createdAt: number;
  mode: 'dry-run' | 'live';
  slug: string;
  eventId: string;
  side: 'BUY_YES' | 'BUY_NO';
  status: 'OPEN' | 'CLOSED';
  signalConfidence: number;
  entryPrice: number | null;
  exitPrice: number | null;
  sizeUsd: number;
  shares: number | null;
  entryFeeUsd: number | null;
  exitFeeUsd: number | null;
  grossPnlUsd: number | null;
  netPnlUsd: number | null;
  roiPct: number | null;
  notes: string | null;
  exchangeOrderId: string | null;
  exchangeStatus: string | null;
  outcome: string | null;
  tokenId: string | null;
  transactionsHashes: string[];
  closeExchangeOrderId: string | null;
  closeExchangeStatus: string | null;
  closeTransactionsHashes: string[];
}

export interface PolymarketWalletOverview {
  address: string;
  portfolioValue: number;
  cashBalance: number;
  cashBalanceSource: 'data-api' | 'clob' | 'none';
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
    redeemable: boolean | null;
  }>;
}

export interface PolymarketWalletDiagnostics {
  connected: boolean;
  address: string;
  cashBalance: number;
  portfolioValue: number;
  clobCashBalance: number;
  cashBalanceSource: 'data-api' | 'clob' | 'none';
  positionsCount: number;
  activityCount: number;
  hasFunds: boolean;
  apiReachable: boolean;
  dataApiReachable: boolean;
  clobApiReachable: boolean;
  apiKeyCount: number;
  dataApiErrors: string[];
  hints: string[];
  rawValue: Record<string, unknown>;
}

export interface PolymarketBtc5mAutoStatus {
  running: boolean;
  mode: 'dry-run' | 'live';
  intervalSeconds: number;
  balanceUsd: number;
  maxNotionalUsd: number;
  lastRunAt: string | null;
  lastError: string | null;
  lastResult: PolymarketBtc5mRunResult | null;
}

export interface PolymarketBtc5mStrategyCard {
  strategyId: string;
  title: string;
  rank: number;
  mode: string;
  status: string;
  thesis: string;
  whyNow: string;
  fit: 'best' | 'good' | 'watch';
  canExecute: boolean;
  recommended: boolean;
  rules: string[];
  riskControls: string[];
}

export interface PolymarketBtc5mStrategyDesk {
  recommendedStrategy: string;
  marketContext: {
    slug: string | null;
    secondsToExpiry: number;
    entryPrice: number;
    netEdgePct: number;
    spreadPct: number;
    priceToBeat: number | null;
    performance: {
      startingBalance: number;
      currentBalance: number;
      totalPnlUsd: number;
      roiPct: number;
      closedTrades: number;
      openTrades: number;
      winRatePct: number;
    };
  };
  strategies: PolymarketBtc5mStrategyCard[];
  notes: string[];
}

export interface PolymarketBtc5mStrategiesResponse {
  strategyId: string | null;
  marketSlug: string | null;
  strategyDesk: PolymarketBtc5mStrategyDesk;
  strategyAssessment: PolymarketBtc5mStatus['strategyAssessment'] | null;
  liveReadiness: PolymarketBtc5mStatus['liveReadiness'];
  latestSnapshot: PolymarketBtc5mStatus['latestSnapshot'];
}

class PolymarketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private reconnectTimeout: number | null = null;
  private shouldReconnect = false;

  async startValidation(durationHours: number = 24): Promise<any> {
    void durationHours;
    blockedAuditMutation('Polymarket validation start');
    const response = await fetch(`${API_URL}/api/polymarket/start?duration_hours=${durationHours}`, {
      method: 'POST'
    });
    return response.json();
  }

  async stopValidation(): Promise<any> {
    blockedAuditMutation('Polymarket validation stop');
    const response = await fetch(`${API_URL}/api/polymarket/stop`, {
      method: 'POST'
    });
    return response.json();
  }

  async getStatus(): Promise<PolymarketStats> {
    const response = await fetch(`${API_URL}/api/polymarket/status`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success || !result.data) {
      throw new Error('Backend returned invalid data');
    }

    return result.data;
  }

  async getOpportunities(limit: number = 50): Promise<Opportunity[]> {
    try {
      const response = await fetch(`${API_URL}/api/polymarket/opportunities?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error('Backend returned error');
      }

      return result.data || [];
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      return [];
    }
  }

  async getPriceHistory(limit: number = 100): Promise<PricePoint[]> {
    try {
      const response = await fetch(`${API_URL}/api/polymarket/price-history?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error('Backend returned error');
      }

      return result.data || [];
    } catch (error) {
      console.error('Error fetching price history:', error);
      return [];
    }
  }

  async getChainlinkUpdates(limit: number = 20): Promise<ChainlinkUpdate[]> {
    try {
      const response = await fetch(`${API_URL}/api/polymarket/chainlink-updates?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error('Backend returned error');
      }

      return result.data || [];
    } catch (error) {
      console.error('Error fetching chainlink updates:', error);
      return [];
    }
  }

  async getEquityCurve(limit: number = 200): Promise<EquityPoint[]> {
    try {
      const response = await fetch(`${API_URL}/api/polymarket/equity-curve?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error('Backend returned error');
      }

      return result.data || [];
    } catch (error) {
      console.error('Error fetching equity curve:', error);
      return [];
    }
  }

  async getBtc5mStatus(balanceUsd?: number | null): Promise<PolymarketBtc5mStatus> {
    const query = balanceUsd && balanceUsd > 0 ? `?balance_usd=${balanceUsd}` : '';
    const { response } = await fetchPolymarketJson(`/api/polymarket/btc-5m/status${query}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success || !result.data) {
      throw new Error('Backend returned invalid BTC 5m status');
    }

    return result.data;
  }

  async getBtc5mTrades(limit: number = 100): Promise<PolymarketBtc5mTrade[]> {
    const { response } = await fetchPolymarketJson(`/api/polymarket/btc-5m/trades?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error('Backend returned invalid BTC 5m trades');
    }

    return result.data || [];
  }

  async getBtc5mEquityCurve(balanceUsd?: number | null): Promise<EquityPoint[]> {
    const query = balanceUsd && balanceUsd > 0 ? `?balance_usd=${balanceUsd}` : '';
    const { response } = await fetchPolymarketJson(`/api/polymarket/btc-5m/equity-curve${query}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error('Backend returned invalid BTC 5m equity curve');
    }

    return result.data || [];
  }

  async runBtc5mOnce(payload: {
    slug: string;
    mode: 'dry-run' | 'live';
    basis_bps: number | null;
    balance_usd: number;
    stake_pct: number;
    max_notional_usd: number;
    safety_margin_pct: number;
    max_spread_pct: number;
    min_seconds_to_expiry: number;
    max_seconds_to_expiry: number;
    require_full_fill?: boolean;
  }): Promise<PolymarketBtc5mRunResult> {
    void payload;
    blockedAuditMutation('Polymarket BTC 5m run-once');
    const { response } = await fetchPolymarketJson(`/api/polymarket/btc-5m/run-once`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 25_000);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.detail || result.message || `HTTP error! status: ${response.status}`);
    }
    return result.data;
  }

  async closeBtc5mTrade(tradeId: number, settlementPrice?: number | null): Promise<any> {
    void tradeId;
    void settlementPrice;
    blockedAuditMutation('Polymarket BTC 5m trade close');
    const { response } = await fetchPolymarketJson(`/api/polymarket/btc-5m/trades/${tradeId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlement_price: settlementPrice ?? null }),
    }, 20_000);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.detail || result.message || `HTTP error! status: ${response.status}`);
    }
    return result;
  }

  async getWalletOverview(): Promise<PolymarketWalletOverview> {
    const { response } = await fetchPolymarketJson(`/api/polymarket/wallet/overview`, undefined, 20_000);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.detail || result.message || `HTTP error! status: ${response.status}`);
    }
    return result.data;
  }

  async getWalletEquityCurve(): Promise<EquityPoint[]> {
    const { response } = await fetchPolymarketJson(`/api/polymarket/wallet/equity-curve`, undefined, 20_000);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.detail || result.message || `HTTP error! status: ${response.status}`);
    }
    return result.data || [];
  }

  async getWalletDiagnostics(): Promise<PolymarketWalletDiagnostics> {
    const { response } = await fetchPolymarketJson(`/api/polymarket/wallet/diagnostics`, undefined, 20_000);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.detail || result.message || `HTTP error! status: ${response.status}`);
    }
    return result.data;
  }

  async getBtc5mAutoStatus(): Promise<PolymarketBtc5mAutoStatus> {
    const { response } = await fetchPolymarketJson(`/api/polymarket/btc-5m/auto/status`, undefined, 15_000);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.detail || result.message || `HTTP error! status: ${response.status}`);
    }
    return result.data;
  }

  async getBtc5mStrategies(balanceUsd?: number | null): Promise<PolymarketBtc5mStrategiesResponse> {
    const query = balanceUsd && balanceUsd > 0 ? `?balance_usd=${balanceUsd}` : '';
    const { response } = await fetchPolymarketJson(`/api/polymarket/btc-5m/strategies${query}`, undefined, 15_000);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.detail || result.message || `HTTP error! status: ${response.status}`);
    }
    return result.data;
  }

  async startBtc5mAuto(payload: {
    mode: 'dry-run' | 'live';
    balance_usd: number;
    stake_pct: number;
    max_notional_usd: number;
    safety_margin_pct: number;
    max_spread_pct: number;
    min_seconds_to_expiry: number;
    max_seconds_to_expiry: number;
    interval_seconds: number;
    require_full_fill?: boolean;
  }): Promise<PolymarketBtc5mAutoStatus> {
    void payload;
    blockedAuditMutation('Polymarket BTC 5m auto-start');
    const { response } = await fetchPolymarketJson(`/api/polymarket/btc-5m/auto/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 20_000);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.detail || result.message || `HTTP error! status: ${response.status}`);
    }
    return result.data;
  }

  async stopBtc5mAuto(): Promise<PolymarketBtc5mAutoStatus> {
    blockedAuditMutation('Polymarket BTC 5m auto-stop');
    const { response } = await fetchPolymarketJson(`/api/polymarket/btc-5m/auto/stop`, {
      method: 'POST',
    }, 15_000);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.detail || result.message || `HTTP error! status: ${response.status}`);
    }
    return result.data;
  }

  connectWebSocket(
    onPrice: (data: PricePoint) => void,
    onOpportunity: (data: Opportunity) => void,
    onChainlinkUpdate: (data: ChainlinkUpdate) => void,
    onStats: (data: PolymarketStats) => void,
    onEquityUpdate: (data: EquityPoint) => void
  ): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.shouldReconnect = true;
    const wsUrl = API_URL.replace('http://', 'ws://').replace('https://', 'wss://');
    this.ws = new WebSocket(`${wsUrl}/ws/polymarket`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.reconnectTimeout !== null) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'initial':
          case 'stats_update':
            onStats(message.data);
            break;
          case 'price':
            onPrice(message.data);
            break;
          case 'opportunity':
            onOpportunity(message.data);
            break;
          case 'chainlink_update':
            onChainlinkUpdate(message.data);
            break;
          case 'equity_update':
            onEquityUpdate(message.data);
            break;
        }
      } catch (error) {
        console.error('[Polymarket WS] Error parsing message:', error);
      }
    };

    this.ws.onclose = () => {
      this.ws = null;

      if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;

        this.reconnectTimeout = window.setTimeout(() => {
          this.connectWebSocket(onPrice, onOpportunity, onChainlinkUpdate, onStats, onEquityUpdate);
        }, this.reconnectDelay * this.reconnectAttempts);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[Polymarket WS] Error:', error);
    };
  }

  disconnectWebSocket(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = this.maxReconnectAttempts;

    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const polymarketService = new PolymarketService();
