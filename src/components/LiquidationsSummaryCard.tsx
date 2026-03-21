/**
 * Liquidations Summary Card - Card compacta para mostrar en Dashboard u otras páginas
 */
import { Activity, TrendingUp, TrendingDown, AlertTriangle, ExternalLink } from 'lucide-react';
import { useLiquidations } from '../contexts/LiquidationsContext';
import { Link } from 'react-router-dom';

export default function LiquidationsSummaryCard() {
  const { stats, insights, recentAlerts } = useLiquidations();

  if (!stats || !insights) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">Liquidations Monitor</h3>
        </div>
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  // Helper para formatear
  const formatLargeNumber = (num: number): string => {
    if (num >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(1)}M`;
    } else if (num >= 1_000) {
      return `$${(num / 1_000).toFixed(0)}K`;
    }
    return `$${num.toFixed(0)}`;
  };

  // Helper para color de señal
  const getSignalColor = (signal: string): string => {
    if (signal === 'long') return 'text-green-400 bg-green-500/10 border-green-500/30';
    if (signal === 'short') return 'text-red-400 bg-red-500/10 border-red-500/30';
    return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-purple-700/30 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">Liquidations Monitor</h3>
        </div>
        <Link
          to="/liquidations"
          className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          <span>View Full</span>
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Trading Signal - Destacado */}
      <div className={`border rounded-lg p-4 mb-4 ${getSignalColor(insights.trading_signal)}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Trading Signal</span>
          <span className={`text-xs px-2 py-1 rounded ${
            insights.confidence === 'high' ? 'bg-green-500/20 text-green-400' :
            insights.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {insights.confidence.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-2">
          {insights.trading_signal === 'long' && <TrendingUp className="w-6 h-6" />}
          {insights.trading_signal === 'short' && <TrendingDown className="w-6 h-6" />}
          {insights.trading_signal === 'neutral' && <Activity className="w-6 h-6" />}
          <span className="text-2xl font-bold">{insights.trading_signal.toUpperCase()}</span>
        </div>

        {insights.reasoning.length > 0 && (
          <div className="text-xs opacity-80">
            {insights.reasoning[0]}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-700/30 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Total Liquidations (1h)</div>
          <div className="text-lg font-bold text-white">
            {formatLargeNumber(stats.liquidations_1h.total_usd)}
          </div>
        </div>

        <div className="bg-gray-700/30 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Ratio L/S</div>
          <div className="text-lg font-bold text-white">
            {stats.liquidations_1h.ratio_long_short.toFixed(2)}
          </div>
        </div>

        <div className="bg-gray-700/30 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Sentiment</div>
          <div className={`text-sm font-bold ${
            stats.current_sentiment.includes('bullish') ? 'text-green-400' :
            stats.current_sentiment.includes('bearish') ? 'text-red-400' :
            'text-gray-400'
          }`}>
            {stats.current_sentiment.toUpperCase()}
          </div>
        </div>

        <div className="bg-gray-700/30 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Cascade Risk</div>
          <div className={`text-sm font-bold ${
            stats.cascade_risk === 'high' ? 'text-red-400' :
            stats.cascade_risk === 'medium' ? 'text-yellow-400' :
            'text-green-400'
          }`}>
            {stats.cascade_risk.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Recent Alert */}
      {recentAlerts.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400 font-medium">Recent Alert</span>
          </div>
          <div className="text-xs text-red-300">
            {recentAlerts[0].message}
          </div>
        </div>
      )}
    </div>
  );
}
