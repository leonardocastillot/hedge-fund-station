import axios from 'axios';
import { withRequestCache } from './requestCache';
import { GATEWAY_HTTP_URL, GATEWAY_WS_URL } from './backendConfig';

export const API_URL = GATEWAY_HTTP_URL;
export const WS_URL = GATEWAY_WS_URL;

const api = axios.create({
  baseURL: API_URL,
  timeout: 120000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error(`API Error: ${error.config?.url}`, error.message);
    if (error.response) {
      console.error('Status:', error.response.status, 'Data:', error.response.data);
    }
    return Promise.reject(error);
  }
);

export interface PriceData {
  timestamp: string;
  last_price: number;
  volume_24h: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_pct_24h: number;
  bid_price: number;
  ask_price: number;
  spread: number;
  funding_rate: number | null;
}

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Indicators {
  timestamp: string;
  rsi_14: number;
  rsi_7: number;
  macd: number;
  macd_signal: number;
  macd_histogram: number;
  bb_upper: number;
  bb_middle: number;
  bb_lower: number;
  sma_20: number;
  sma_50: number;
  sma_200: number;
  ema_9: number;
  ema_21: number;
  stoch_k: number;
  stoch_d: number;
  atr: number;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const factor = 2 / (period + 1);
  return values.slice(1).reduce((prev, value) => prev + factor * (value - prev), values[0]);
}

function buildIndicators(candles: Candle[]): Indicators {
  const closes = candles.map((item) => item.close);
  const highs = candles.map((item) => item.high);
  const lows = candles.map((item) => item.low);
  const deltas = closes.slice(1).map((value, index) => value - closes[index]);
  const gains = deltas.map((value) => (value > 0 ? value : 0));
  const losses = deltas.map((value) => (value < 0 ? Math.abs(value) : 0));

  const avgGain14 = average(gains.slice(-14));
  const avgLoss14 = average(losses.slice(-14));
  const avgGain7 = average(gains.slice(-7));
  const avgLoss7 = average(losses.slice(-7));
  const rs14 = avgLoss14 === 0 ? 100 : avgGain14 / avgLoss14;
  const rs7 = avgLoss7 === 0 ? 100 : avgGain7 / avgLoss7;

  const sma20 = average(closes.slice(-20));
  const sma50 = average(closes.slice(-50));
  const sma200 = average(closes.slice(-Math.min(200, closes.length)));
  const ema9 = ema(closes.slice(-40), 9);
  const ema21 = ema(closes.slice(-60), 21);
  const ema12 = ema(closes.slice(-60), 12);
  const ema26 = ema(closes.slice(-80), 26);
  const macd = ema12 - ema26;
  const macdSignal = ema(closes.slice(-40).map((_value, index, values) => ema(values.slice(0, index + 1), 12) - ema(values.slice(0, index + 1), 26)), 9);
  const macdHistogram = macd - macdSignal;
  const window20 = closes.slice(-20);
  const variance = average(window20.map((value) => (value - sma20) ** 2));
  const deviation = Math.sqrt(variance);
  const highestHigh = Math.max(...highs.slice(-14));
  const lowestLow = Math.min(...lows.slice(-14));
  const latestClose = closes.at(-1) ?? 0;
  const latestHigh = highs.at(-1) ?? latestClose;
  const latestLow = lows.at(-1) ?? latestClose;

  const atrSeries = candles.slice(-14).map((candle, index, subset) => {
    const previousClose = subset[index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  return {
    timestamp: candles.at(-1)?.timestamp ?? new Date().toISOString(),
    rsi_14: clamp(100 - 100 / (1 + rs14), 0, 100),
    rsi_7: clamp(100 - 100 / (1 + rs7), 0, 100),
    macd,
    macd_signal: macdSignal,
    macd_histogram: macdHistogram,
    bb_upper: sma20 + deviation * 2,
    bb_middle: sma20,
    bb_lower: sma20 - deviation * 2,
    sma_20: sma20,
    sma_50: sma50,
    sma_200: sma200,
    ema_9: ema9,
    ema_21: ema21,
    stoch_k: highestHigh === lowestLow ? 50 : clamp(((latestClose - lowestLow) / (highestHigh - lowestLow)) * 100, 0, 100),
    stoch_d: highestHigh === lowestLow ? 50 : clamp((((latestHigh + latestLow + latestClose) / 3 - lowestLow) / (highestHigh - lowestLow)) * 100, 0, 100),
    atr: average(atrSeries)
  };
}

async function getLeadMarket() {
  const response = await api.get('/api/hyperliquid/overview', { params: { limit: 24 } });
  const markets = response.data?.markets ?? [];
  return markets.find((item: { symbol: string }) => item.symbol === 'BTC') ?? markets[0];
}

function candlesLookbackForTimeframe(timeframe: string): { interval: string; lookback_hours: number } {
  if (timeframe === '15m') return { interval: '15m', lookback_hours: 48 };
  if (timeframe === '4h') return { interval: '4h', lookback_hours: 24 * 21 };
  if (timeframe === '1d') return { interval: '1d', lookback_hours: 24 * 120 };
  return { interval: '1h', lookback_hours: 24 * 14 };
}

async function fetchCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]> {
  const settings = candlesLookbackForTimeframe(timeframe);
  const response = await api.get(`/api/hyperliquid/candles/${encodeURIComponent(symbol)}`, {
    params: settings
  });

  return (response.data?.candles ?? []).slice(-limit).map((item: { time: number; open: number; high: number; low: number; close: number; volume: number }) => ({
    timestamp: new Date(item.time).toISOString(),
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume
  }));
}

function signalForIndicators(indicators: Indicators) {
  const reasons: string[] = [];
  let score = 45;

  if (indicators.rsi_14 < 38) {
    score += 12;
    reasons.push('RSI is in a compressed zone with room for mean reversion.');
  } else if (indicators.rsi_14 > 70) {
    score -= 10;
    reasons.push('RSI is extended; chase risk is higher.');
  }

  if (indicators.macd_histogram > 0) {
    score += 10;
    reasons.push('MACD histogram is positive.');
  } else {
    score -= 8;
    reasons.push('MACD histogram remains negative.');
  }

  if (indicators.ema_9 > indicators.ema_21) {
    score += 8;
    reasons.push('Short EMA is leading above medium EMA.');
  }

  if (indicators.stoch_k < 25) {
    score += 6;
    reasons.push('Stochastic is near a washed-out zone.');
  }

  const recommendation = score >= 68 ? 'BUY' : score >= 55 ? 'WEAK BUY' : score <= 35 ? 'WAIT' : 'HOLD';
  return { score: clamp(score, 0, 100), recommendation, reasons };
}

async function buildInsightReport(timeframe: '4h' | '1d') {
  const [insightsResponse, alertsResponse] = await Promise.all([
    api.get('/api/liquidations/insights'),
    api.get('/api/hyperliquid/alerts', { params: { limit: 20 } })
  ]);

  const insightData = insightsResponse.data?.data;
  const alerts = alertsResponse.data?.alerts ?? [];
  const severityHigh = alerts.filter((alert: { severity: string }) => alert.severity === 'high').length;
  const sellScore = insightData?.trading_signal === 'short' ? 74 : severityHigh * 8;
  const buyScore = insightData?.trading_signal === 'long' ? 74 : Math.max(20, 60 - severityHigh * 6);

  return {
    timeframe,
    total_insights: 3,
    insights: [
      {
        category: 'liquidations',
        title: `Cascade risk ${String(insightData?.cascade_risk || 'unknown').toUpperCase()}`,
        description: (insightData?.reasoning ?? []).join(' ') || 'No liquidation commentary returned by the gateway.',
        confidence: insightData?.confidence === 'high' ? 82 : 64,
        action: insightData?.trading_signal?.toUpperCase?.() ?? 'WAIT',
        priority: severityHigh > 0 ? 'HIGH' : 'MEDIUM'
      },
      {
        category: 'alerts',
        title: `${severityHigh} high-severity gateway alerts`,
        description: alerts.slice(0, 3).map((alert: { message: string }) => alert.message).join(' ') || 'No major alerts in the recent buffer.',
        confidence: severityHigh > 0 ? 76 : 58,
        action: severityHigh > 0 ? 'WAIT' : 'HOLD',
        priority: severityHigh > 0 ? 'HIGH' : 'LOW'
      },
      {
        category: 'execution',
        title: 'Use paper flow to validate timing',
        description: 'This workspace currently has live paper-trade and Hyperliquid intelligence contracts, not the old backtest endpoints.',
        confidence: 70,
        action: 'HOLD',
        priority: 'LOW'
      }
    ],
    overall_sentiment: insightData?.market_condition?.toUpperCase?.() || 'NEUTRAL',
    buy_score: buyScore,
    sell_score: sellScore,
    by_action: {
      BUY: buyScore > sellScore ? 1 : 0,
      SELL: sellScore > buyScore ? 1 : 0,
      HOLD: 1,
      WAIT: severityHigh > 0 ? 1 : 0
    }
  };
}

export const apiService = {
  async getCurrentPrice(): Promise<PriceData> {
    return withRequestCache('price:current', 5_000, async () => {
      const market = await getLeadMarket();
      return {
        timestamp: new Date().toISOString(),
        last_price: market?.price ?? 0,
        volume_24h: market?.volume24h ?? 0,
        high_24h: market?.price ?? 0,
        low_24h: market?.price ?? 0,
        price_change_24h: ((market?.price ?? 0) * (market?.change24hPct ?? 0)) / 100,
        price_change_pct_24h: market?.change24hPct ?? 0,
        bid_price: market?.price ?? 0,
        ask_price: market?.price ?? 0,
        spread: 0,
        funding_rate: market?.fundingRate ?? null
      };
    });
  },

  async getPriceHistory(timeframe: string = '1h', limit: number = 100): Promise<Candle[]> {
    return withRequestCache(`price:history:${timeframe}:${limit}`, 20_000, async () => {
      const market = await getLeadMarket();
      return fetchCandles(market?.symbol ?? 'BTC', timeframe, limit);
    });
  },

  async getCurrentIndicators(timeframe: string = '1h'): Promise<Indicators> {
    return withRequestCache(`indicators:current:${timeframe}`, 15_000, async () => {
      const candles = await this.getPriceHistory(timeframe, 220);
      return buildIndicators(candles);
    });
  },

  async getAllIndicators(): Promise<Record<string, Indicators>> {
    return withRequestCache('indicators:all', 15_000, async () => {
      const timeframes = ['15m', '1h', '4h', '1d'] as const;
      const entries = await Promise.all(timeframes.map(async (timeframe) => [timeframe, await this.getCurrentIndicators(timeframe)] as const));
      return Object.fromEntries(entries);
    });
  },

  async getBuySignals(): Promise<any> {
    return withRequestCache('signals:buy', 15_000, async () => {
      const indicators = await this.getAllIndicators();
      const signals = Object.fromEntries(
        Object.entries(indicators).map(([timeframe, values]) => {
          const signal = signalForIndicators(values);
          return [timeframe, { score: signal.score, signal: signal.recommendation, reasons: signal.reasons }];
        })
      );
      const generalScore = average(Object.values(signals).map((item: { score: number }) => item.score));
      return {
        general_score: Number(generalScore.toFixed(0)),
        recommendation: generalScore >= 65 ? 'BUY' : generalScore >= 50 ? 'HOLD' : 'WAIT',
        signals
      };
    });
  },

  async getTemporalAnalytics(): Promise<any> {
    return withRequestCache('stats:temporal', 30_000, async () => {
      const tradesResponse = await api.get('/api/hyperliquid/paper/trades', { params: { status: 'all' } });
      const trades = tradesResponse.data?.trades ?? [];
      const weekdays = new Map<string, number>();
      const hours = new Map<number, number>();

      for (const trade of trades) {
        const date = new Date(trade.createdAt);
        const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
        weekdays.set(weekday, (weekdays.get(weekday) ?? 0) + (trade.realizedPnlUsd ?? trade.unrealizedPnlUsd ?? 0));
        hours.set(date.getUTCHours(), (hours.get(date.getUTCHours()) ?? 0) + (trade.realizedPnlUsd ?? trade.unrealizedPnlUsd ?? 0));
      }

      const bestWeekday = Array.from(weekdays.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'No sample';
      const bestHour = Array.from(hours.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 0;

      return {
        insights: [
          'Temporal analytics are derived from paper-trade timestamps in the Hyperliquid gateway.',
          'Use this as an operator-quality timing read, not as a historical backtest claim.'
        ],
        best_weekday: bestWeekday,
        best_hour: bestHour
      };
    });
  },

  async getOverviewStats(): Promise<any> {
    return withRequestCache('stats:overview', 30_000, async () => {
      const [alertsResponse, tradesResponse, overviewResponse] = await Promise.all([
        api.get('/api/hyperliquid/alerts', { params: { limit: 40 } }),
        api.get('/api/hyperliquid/paper/trades', { params: { status: 'all' } }),
        api.get('/api/hyperliquid/overview', { params: { limit: 40 } })
      ]);

      const markets = overviewResponse.data?.markets ?? [];
      const trades = tradesResponse.data?.trades ?? [];

      return {
        total_candles: markets.length,
        total_indicators: alertsResponse.data?.alerts?.length ?? 0,
        oldest_data: trades.at(-1)?.createdAt ? new Date(trades.at(-1).createdAt).toISOString() : null,
        newest_data: trades[0]?.createdAt ? new Date(trades[0].createdAt).toISOString() : new Date().toISOString()
      };
    });
  },

  async runBacktest(
    _strategy: string,
    _timeframe: string,
    _daysBack: number,
    _initialCapital: number
  ): Promise<any> {
    throw new Error('Legacy backtest endpoint is not exposed by the running Hyperliquid gateway.');
  },

  async compareStrategies(_timeframe: string, _daysBack: number): Promise<any> {
    throw new Error('Legacy compare endpoint is not exposed by the running Hyperliquid gateway.');
  },

  async runDetailedBacktest(
    _strategy: string,
    _timeframe: string,
    _years: number,
    _initialCapital: number
  ): Promise<any> {
    throw new Error('Legacy detailed backtest endpoint is not exposed by the running Hyperliquid gateway.');
  },

  async getInsights(timeframe: string): Promise<any> {
    const report = await buildInsightReport(timeframe === '1d' ? '1d' : '4h');
    return { success: true, data: report };
  },

  async getAllInsights(): Promise<any> {
    return withRequestCache('insights:all', 60_000, async () => {
      const [report4h, report1d] = await Promise.all([buildInsightReport('4h'), buildInsightReport('1d')]);
      return { data: { '4h': report4h, '1d': report1d } };
    });
  },

  connectWebSocket(_onMessage: (data: any) => void): WebSocket {
    throw new Error(`WebSocket feed is not configured on ${WS_URL}; polling fallback remains active.`);
  }
};

export default api;
