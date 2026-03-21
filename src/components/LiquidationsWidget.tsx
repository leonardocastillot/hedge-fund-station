/**
 * Liquidations Widget - Widget flotante global siempre visible
 * Muestra datos clave de liquidaciones en toda la app
 */
import { useState, useEffect } from 'react';
import { Activity, ChevronDown, ChevronUp, TrendingUp, TrendingDown, AlertTriangle, X } from 'lucide-react';
import { useLiquidations } from '../contexts/LiquidationsContext';
import MiniLiquidationsChart from './MiniLiquidationsChart';

export default function LiquidationsWidget() {
  const { stats, insights, recentAlerts, isConnected } = useLiquidations();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [chartData, setChartData] = useState<Array<{ longs: number; shorts: number }>>([]);

  // Recopilar datos para el mini-chart
  useEffect(() => {
    if (stats?.liquidations_1h) {
      setChartData(prev => {
        const newData = [...prev, {
          longs: stats.liquidations_1h.longs_usd,
          shorts: stats.liquidations_1h.shorts_usd
        }];
        return newData.slice(-20); // Últimos 20 puntos
      });
    }
  }, [stats?.liquidations_1h]);

  // Si está minimizado, solo mostrar un pequeño indicador
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 cursor-pointer"
        onClick={() => setIsMinimized(false)}
      >
        <div className="bg-gradient-to-br from-purple-600 to-blue-600 rounded-full p-3 shadow-lg hover:shadow-xl transition-all animate-pulse">
          <Activity className="w-6 h-6 text-white" />
          {recentAlerts.length > 0 && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {recentAlerts.length}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Helper para formatear valores grandes
  const formatLargeNumber = (num: number): string => {
    if (num >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(1)}M`;
    } else if (num >= 1_000) {
      return `$${(num / 1_000).toFixed(0)}K`;
    }
    return `$${num.toFixed(0)}`;
  };

  // Helper para color de sentiment
  const getSentimentColor = (sentiment: string): string => {
    if (sentiment?.includes('bullish')) return 'text-green-400';
    if (sentiment?.includes('bearish')) return 'text-red-400';
    return 'text-gray-400';
  };

  // Helper para color de señal
  const getSignalColor = (signal: string): string => {
    if (signal === 'long') return 'text-green-400';
    if (signal === 'short') return 'text-red-400';
    return 'text-gray-400';
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-gray-900/95 backdrop-blur-md border border-purple-500/30 rounded-xl shadow-2xl w-80">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" />
            <span className="font-bold text-white text-sm">Liquidations Monitor</span>
            {isConnected && (
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              )}
            </button>
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-3">
          {/* Quick Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-800/50 rounded-lg p-2">
                <div className="text-xs text-gray-400">Total (1h)</div>
                <div className="text-sm font-bold text-white">
                  {formatLargeNumber(stats.liquidations_1h.total_usd)}
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-2">
                <div className="text-xs text-gray-400">Ratio L/S</div>
                <div className="text-sm font-bold text-white">
                  {stats.liquidations_1h.ratio_long_short.toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Trading Signal */}
          {insights && (
            <div className={`border rounded-lg p-2 ${
              insights.trading_signal === 'long' ? 'bg-green-500/10 border-green-500/30' :
              insights.trading_signal === 'short' ? 'bg-red-500/10 border-red-500/30' :
              'bg-gray-500/10 border-gray-500/30'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-gray-400">Trading Signal</div>
                <div className={`text-xs px-2 py-0.5 rounded ${
                  insights.confidence === 'high' ? 'bg-green-500/20 text-green-400' :
                  insights.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {insights.confidence.toUpperCase()}
                </div>
              </div>

              <div className={`flex items-center gap-2 ${getSignalColor(insights.trading_signal)}`}>
                {insights.trading_signal === 'long' && <TrendingUp className="w-5 h-5" />}
                {insights.trading_signal === 'short' && <TrendingDown className="w-5 h-5" />}
                <span className="text-lg font-bold">{insights.trading_signal.toUpperCase()}</span>
              </div>
            </div>
          )}

          {/* Expanded Details */}
          {isExpanded && stats && insights && (
            <>
              {/* Market Condition & Risk */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-800/50 rounded p-2">
                  <div className="text-gray-400 mb-1">Sentiment</div>
                  <div className={`font-bold ${getSentimentColor(stats.current_sentiment)}`}>
                    {stats.current_sentiment.toUpperCase()}
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded p-2">
                  <div className="text-gray-400 mb-1">Cascade Risk</div>
                  <div className={`font-bold ${
                    stats.cascade_risk === 'high' ? 'text-red-400' :
                    stats.cascade_risk === 'medium' ? 'text-yellow-400' :
                    'text-green-400'
                  }`}>
                    {stats.cascade_risk.toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Mini Chart */}
              {chartData.length >= 2 && (
                <div className="bg-gray-800/50 rounded p-2">
                  <div className="text-xs text-gray-400 mb-2">Trend (Last 20 updates)</div>
                  <MiniLiquidationsChart data={chartData} />
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-red-400">■ Longs</span>
                    <span className="text-green-400">■ Shorts</span>
                  </div>
                </div>
              )}

              {/* Longs vs Shorts */}
              <div className="bg-gray-800/50 rounded p-2">
                <div className="text-xs text-gray-400 mb-2">Liquidations Breakdown</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-red-400">Longs:</span>
                    <span className="text-white font-medium">
                      {formatLargeNumber(stats.liquidations_1h.longs_usd)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-400">Shorts:</span>
                    <span className="text-white font-medium">
                      {formatLargeNumber(stats.liquidations_1h.shorts_usd)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              {insights.reasoning.length > 0 && (
                <div className="bg-gray-800/50 rounded p-2">
                  <div className="text-xs text-gray-400 mb-1">Analysis</div>
                  <div className="text-xs text-gray-300 space-y-1">
                    {insights.reasoning.slice(0, 2).map((reason, idx) => (
                      <div key={idx} className="flex items-start gap-1">
                        <span className="text-purple-400 mt-0.5">•</span>
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Alerts */}
              {recentAlerts.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3 text-red-400" />
                    <span className="text-xs text-red-400 font-medium">
                      {recentAlerts.length} Recent Alert{recentAlerts.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-xs text-red-300">
                    {recentAlerts[0].message}
                  </div>
                </div>
              )}
            </>
          )}

          {/* View Full Details Link */}
          <a
            href="/liquidations"
            className="block text-center text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            View Full Details →
          </a>
        </div>
      </div>
    </div>
  );
}
