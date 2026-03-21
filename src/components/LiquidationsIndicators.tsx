/**
 * Liquidations Indicators - Indicadores compactos para el header
 * Muestra sentiment y cascade risk siempre visibles
 */
import { Activity, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { useLiquidations } from '../contexts/LiquidationsContext';

export default function LiquidationsIndicators() {
  const { stats, insights, isConnected } = useLiquidations();

  if (!stats || !insights) {
    return null;
  }

  // Helper para color de sentiment
  const getSentimentColor = (sentiment: string): string => {
    if (sentiment?.includes('bullish')) return 'text-green-400 border-green-500/30 bg-green-500/10';
    if (sentiment?.includes('bearish')) return 'text-red-400 border-red-500/30 bg-red-500/10';
    return 'text-gray-400 border-gray-500/30 bg-gray-500/10';
  };

  // Helper para color de cascade risk
  const getRiskColor = (risk: string): string => {
    if (risk === 'high') return 'text-red-400 border-red-500/30 bg-red-500/10';
    if (risk === 'medium') return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
    return 'text-green-400 border-green-500/30 bg-green-500/10';
  };

  // Helper para icono de señal
  const getSignalIcon = () => {
    if (insights.trading_signal === 'long') {
      return <TrendingUp className="w-3 h-3" />;
    } else if (insights.trading_signal === 'short') {
      return <TrendingDown className="w-3 h-3" />;
    }
    return <Activity className="w-3 h-3" />;
  };

  return (
    <div className="flex items-center gap-2">
      {/* Connection Status */}
      {isConnected && (
        <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
      )}

      {/* Trading Signal */}
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-medium ${
        insights.trading_signal === 'long' ? 'text-green-400 border-green-500/30 bg-green-500/10' :
        insights.trading_signal === 'short' ? 'text-red-400 border-red-500/30 bg-red-500/10' :
        'text-gray-400 border-gray-500/30 bg-gray-500/10'
      }`}>
        {getSignalIcon()}
        <span className="uppercase tracking-wide">{insights.trading_signal}</span>
      </div>

      {/* Sentiment */}
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-medium ${getSentimentColor(stats.current_sentiment)}`}>
        <Activity className="w-3 h-3" />
        <span className="uppercase tracking-wide">
          {stats.current_sentiment.split('_')[0]}
        </span>
      </div>

      {/* Cascade Risk */}
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-medium ${getRiskColor(stats.cascade_risk)}`}>
        <AlertTriangle className="w-3 h-3" />
        <span className="uppercase tracking-wide">Risk: {stats.cascade_risk}</span>
      </div>

      {/* Liquidations Amount (hover para ver detalles) */}
      <div
        className="px-2 py-1 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs font-medium cursor-help"
        title={`Longs: $${(stats.liquidations_1h.longs_usd / 1_000_000).toFixed(1)}M | Shorts: $${(stats.liquidations_1h.shorts_usd / 1_000_000).toFixed(1)}M`}
      >
        ${(stats.liquidations_1h.total_usd / 1_000_000).toFixed(1)}M
      </div>
    </div>
  );
}
