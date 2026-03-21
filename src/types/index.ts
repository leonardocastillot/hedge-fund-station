export type Tab = 'dashboard' | 'backtest' | 'insights' | 'polymarket';

export interface PriceData {
  price: number;
  change24h: number;
  volume24h: number;
  timestamp: number;
}

export interface ChartConfig {
  timeframe: string;
  label: string;
  period: string;
}
