/**
 * Liquidations Service - API client para monitoreo de liquidaciones
 */
import { withRequestCache } from './requestCache';
import { HYPERLIQUID_GATEWAY_HTTP_URL } from './backendConfig';

const API_URL = HYPERLIQUID_GATEWAY_HTTP_URL;
const REQUEST_TIMEOUT_MS = 35_000;

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

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    throw normalizeRequestError(error, 'Liquidations request');
  } finally {
    window.clearTimeout(timeout);
  }
}

export interface LiquidationsStats {
  is_running: boolean;
  start_time: string | null;
  runtime_hours: number;
  current_sentiment: string;
  cascade_risk: string;
  liquidations_1h: {
    total_usd: number;
    longs_usd: number;
    shorts_usd: number;
    ratio_long_short: number;
    dominant_side: string;
  };
  total_snapshots: number;
  total_alerts: number;
}

export interface LiquidationSnapshot {
  timestamp: string;
  timeframe: string;
  total_usd: number;
  longs_usd: number;
  shorts_usd: number;
  num_longs: number;
  num_shorts: number;
  exchanges: {
    [key: string]: number;
  };
  top_markets?: Array<{
    symbol: string;
    pressure_usd: number | null;
    bias: string | null;
    price_change_pct: number | null;
    funding_rate: number | null;
    open_interest_usd: number | null;
  }>;
}

export interface LiquidationAlert {
  id: number;
  timestamp: string;
  type: string;
  severity: string;
  message: string;
  data: any;
}

export interface LiquidationChartData {
  timestamps: string[];
  longs: number[];
  shorts: number[];
  total: number[];
  metadata?: {
    windowHours: number;
    pointCount: number;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
    source: string;
    isEstimate: boolean;
    coverageLabel: 'good' | 'thin' | 'insufficient' | string;
  };
}

export interface HedgeFundInsights {
  market_condition: string;
  cascade_risk: string;
  trading_signal: string;
  confidence: string;
  reasoning: string[];
}

export interface LiquidationsSummary {
  status: LiquidationsStats;
  insights: HedgeFundInsights | null;
  snapshots: LiquidationSnapshot[];
  alerts: LiquidationAlert[];
  chart: LiquidationChartData | null;
  fetchedAt: number;
}

class LiquidationsService {
  async startMonitoring(): Promise<any> {
    const response = await fetchWithTimeout(`${API_URL}/api/liquidations/start`, {
      method: 'POST'
    });
    return response.json();
  }

  async stopMonitoring(): Promise<any> {
    const response = await fetchWithTimeout(`${API_URL}/api/liquidations/stop`, {
      method: 'POST'
    });
    return response.json();
  }

  async getStatus(): Promise<LiquidationsStats> {
    try {
      return withRequestCache('liquidations:status', 10_000, async () => {
        const response = await fetchWithTimeout(`${API_URL}/api/liquidations/status`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (!result.success || !result.data) {
          throw new Error('Backend returned invalid data');
        }
        return result.data;
      });
    } catch (error) {
      console.error('Error fetching liquidations status:', error);
      throw error;
    }
  }

  async getSnapshots(limit: number = 50): Promise<LiquidationSnapshot[]> {
    try {
      return withRequestCache(`liquidations:snapshots:${limit}`, 15_000, async () => {
        const response = await fetchWithTimeout(`${API_URL}/api/liquidations/snapshots?limit=${limit}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (!result.success) {
          throw new Error('Backend returned error');
        }
        return result.data || [];
      });
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      return [];
    }
  }

  async getAlerts(limit: number = 20): Promise<LiquidationAlert[]> {
    try {
      return withRequestCache(`liquidations:alerts:${limit}`, 15_000, async () => {
        const response = await fetchWithTimeout(`${API_URL}/api/liquidations/alerts?limit=${limit}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (!result.success) {
          throw new Error('Backend returned error');
        }
        return result.data || [];
      });
    } catch (error) {
      console.error('Error fetching alerts:', error);
      return [];
    }
  }

  async getChartData(hours: number = 24): Promise<LiquidationChartData | null> {
    try {
      return withRequestCache(`liquidations:chart:${hours}`, 20_000, async () => {
        const response = await fetchWithTimeout(`${API_URL}/api/liquidations/chart-data?hours=${hours}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (!result.success) {
          throw new Error('Backend returned error');
        }
        return result.data;
      });
    } catch (error) {
      console.error('Error fetching chart data:', error);
      return null;
    }
  }

  async getInsights(): Promise<HedgeFundInsights | null> {
    try {
      return withRequestCache('liquidations:insights', 30_000, async () => {
        const response = await fetchWithTimeout(`${API_URL}/api/liquidations/insights`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (!result.success) {
          throw new Error('Backend returned error');
        }
        return result.data;
      });
    } catch (error) {
      console.error('Error fetching insights:', error);
      return null;
    }
  }

  async getSummary(hours: number = 24, limits: { snapshots?: number; alerts?: number } = {}): Promise<LiquidationsSummary> {
    const snapshotsLimit = limits.snapshots ?? 20;
    const alertsLimit = limits.alerts ?? 10;
    return withRequestCache(`liquidations:summary:${hours}:${snapshotsLimit}:${alertsLimit}`, 20_000, async () => {
      const params = new URLSearchParams({
        hours: String(hours),
        snapshots_limit: String(snapshotsLimit),
        alerts_limit: String(alertsLimit)
      });
      const response = await fetchWithTimeout(`${API_URL}/api/liquidations/summary?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (!result.success || !result.data) {
        throw new Error('Backend returned invalid summary data');
      }
      return result.data;
    });
  }

  connectWebSocket(
    _onSnapshot: (data: LiquidationSnapshot) => void,
    _onAlert: (data: LiquidationAlert) => void,
    _onStats: (data: LiquidationsStats) => void
  ): void {
    // This view is now driven by polling against the Hyperliquid gateway.
  }

  disconnectWebSocket(): void {
    // No-op. Polling is managed in the context layer.
  }
}

export const liquidationsService = new LiquidationsService();
