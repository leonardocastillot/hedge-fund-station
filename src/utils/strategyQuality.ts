export type StrategyReadiness = 'approved' | 'caution' | 'blocked';

export interface StrategyQualityAssessment {
  readiness: StrategyReadiness;
  summary: string;
  reasons: string[];
}

interface LibraryStrategyMetrics {
  score: number;
  total_return_pct: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  total_trades: number;
  is_stale: boolean;
}

interface BacktestSummaryMetrics {
  total_trades: number;
  total_return_pct: number;
  profit_factor: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  period_start: string;
  period_end: string;
}

export function assessLibraryStrategy(metrics: LibraryStrategyMetrics): StrategyQualityAssessment {
  const reasons: string[] = [];

  if (metrics.is_stale) reasons.push('Backtest stale');
  if (metrics.total_trades < 100) reasons.push(`Only ${metrics.total_trades} trades`);
  if (metrics.sharpe_ratio < 1.2) reasons.push(`Sharpe ${metrics.sharpe_ratio.toFixed(2)} below 1.20`);
  if (metrics.max_drawdown_pct > 20) reasons.push(`Drawdown ${metrics.max_drawdown_pct.toFixed(1)}% above 20%`);
  if (metrics.total_return_pct <= 0) reasons.push('Non-positive total return');
  if (metrics.score < 70) reasons.push(`Score ${metrics.score.toFixed(1)} below 70`);

  if (reasons.length === 0) {
    return {
      readiness: 'approved',
      summary: 'Approved for paper deployment',
      reasons: ['Fresh metrics, sufficient sample, acceptable risk profile']
    };
  }

  const blockingReasons = reasons.filter((reason) =>
    reason.includes('stale') ||
    reason.includes('Only') ||
    reason.includes('Drawdown') ||
    reason.includes('Non-positive')
  );

  return {
    readiness: blockingReasons.length > 0 ? 'blocked' : 'caution',
    summary: blockingReasons.length > 0 ? 'Blocked until revalidated' : 'Caution: review before deployment',
    reasons
  };
}

export function assessBacktestSummary(metrics: BacktestSummaryMetrics): StrategyQualityAssessment {
  const reasons: string[] = [];
  const durationMs = new Date(metrics.period_end).getTime() - new Date(metrics.period_start).getTime();
  const durationDays = Math.max(0, Math.floor(durationMs / (1000 * 60 * 60 * 24)));

  if (metrics.total_trades < 100) reasons.push(`Only ${metrics.total_trades} trades in sample`);
  if (durationDays < 180) reasons.push(`Only ${durationDays} days of test history`);
  if (metrics.profit_factor < 1.3) reasons.push(`Profit factor ${metrics.profit_factor.toFixed(2)} below 1.30`);
  if (metrics.sharpe_ratio < 1.0) reasons.push(`Sharpe ${metrics.sharpe_ratio.toFixed(2)} below 1.00`);
  if (metrics.max_drawdown_pct > 25) reasons.push(`Drawdown ${metrics.max_drawdown_pct.toFixed(1)}% above 25%`);
  if (metrics.total_return_pct <= 0) reasons.push('Non-positive total return');

  if (reasons.length === 0) {
    return {
      readiness: 'approved',
      summary: 'Backtest quality acceptable for paper trading',
      reasons: ['Sample size, duration, return and risk profile are within current thresholds']
    };
  }

  const blockingReasons = reasons.filter((reason) =>
    reason.includes('Only') ||
    reason.includes('Drawdown') ||
    reason.includes('Non-positive')
  );

  return {
    readiness: blockingReasons.length > 0 ? 'blocked' : 'caution',
    summary: blockingReasons.length > 0 ? 'Backtest evidence insufficient' : 'Backtest needs tighter review',
    reasons
  };
}
