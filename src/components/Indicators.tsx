import { useCallback, useState } from 'react';
import { apiService, Indicators as IndicatorsType } from '../services/api';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';

export default function Indicators() {
  const [indicators, setIndicators] = useState<Record<string, IndicatorsType>>({});
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  const [isLoading, setIsLoading] = useState(true);

  const fetchIndicators = useCallback(async () => {
    try {
      const data = await apiService.getAllIndicators();
      setIndicators(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch indicators:', error);
      setIsLoading(false);
    }
  }, []);

  useVisibilityPolling(fetchIndicators, 30_000);

  const currentIndicators = indicators[selectedTimeframe];

  const getColorForRSI = (rsi: number) => {
    if (rsi < 30) return 'text-green-400';
    if (rsi > 70) return 'text-red-400';
    return 'text-yellow-400';
  };

  const getColorForStoch = (stoch: number) => {
    if (stoch < 20) return 'text-green-400';
    if (stoch > 80) return 'text-red-400';
    return 'text-yellow-400';
  };

  const timeframes = ['15m', '1h', '4h', '1d'];

  return (
    <div className="glass-panel p-6 shadow-xl relative overflow-hidden group">
      <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-all duration-700" />

      <div className="flex items-center justify-between mb-6 relative z-10">
        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400">
          Quantum Indicators
        </h2>

        <div className="flex space-x-2 bg-black/20 p-1 rounded-lg backdrop-blur-sm border border-white/5">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all duration-300 ${
                selectedTimeframe === tf
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !currentIndicators ? (
        <div className="animate-pulse space-y-4 relative z-10">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-white/5 border border-white/5 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
          <div className="bg-black/20 backdrop-blur-md border border-white/5 rounded-xl p-4 hover:border-white/10 hover:bg-black/30 transition-all duration-300 group/item">
            <div className="text-sm text-gray-400 mb-2">RSI (14)</div>
            <div className={`text-2xl font-bold ${getColorForRSI(currentIndicators.rsi_14)} group-hover/item:scale-105 origin-left transition-transform`}>
              {currentIndicators.rsi_14?.toFixed(2) || 'N/A'}
            </div>
            <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">
              {currentIndicators.rsi_14 < 30 && <span className="text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">Oversold</span>}
              {currentIndicators.rsi_14 > 70 && <span className="text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]">Overbought</span>}
              {currentIndicators.rsi_14 >= 30 && currentIndicators.rsi_14 <= 70 && 'Neutral'}
            </div>
          </div>

          <div className="bg-black/20 backdrop-blur-md border border-white/5 rounded-xl p-4 hover:border-white/10 hover:bg-black/30 transition-all duration-300 group/item">
            <div className="text-sm font-medium text-gray-400 mb-2">Stochastic Oscillator</div>
            <div className={`text-2xl font-bold ${getColorForStoch(currentIndicators.stoch_k)} group-hover/item:scale-105 origin-left transition-transform`}>
              {currentIndicators.stoch_k?.toFixed(2) || 'N/A'}
            </div>
            <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">
              {currentIndicators.stoch_k < 20 && <span className="text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">Oversold</span>}
              {currentIndicators.stoch_k > 80 && <span className="text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]">Overbought</span>}
              {currentIndicators.stoch_k >= 20 && currentIndicators.stoch_k <= 80 && 'Neutral'}
            </div>
          </div>

          <div className="bg-black/20 backdrop-blur-md border border-white/5 rounded-xl p-4 hover:border-white/10 hover:bg-black/30 transition-all duration-300 group/item">
            <div className="text-sm font-medium text-gray-400 mb-2">MACD Histogram</div>
            <div className={`text-2xl font-bold group-hover/item:scale-105 origin-left transition-transform ${currentIndicators.macd_histogram > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {currentIndicators.macd_histogram?.toFixed(2) || 'N/A'}
            </div>
            <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">
              {currentIndicators.macd_histogram > 0 ? (
                <span className="text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">Bullish</span>
              ) : (
                <span className="text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]">Bearish</span>
              )}
            </div>
          </div>

          <div className="bg-black/20 backdrop-blur-md border border-white/5 rounded-xl p-4 hover:border-white/10 hover:bg-black/30 transition-all duration-300">
            <div className="text-sm font-medium text-gray-400 mb-3">Bollinger Bands</div>
            <div className="text-sm space-y-2">
              <div className="flex justify-between items-center group/bb">
                <span className="text-gray-500 text-xs uppercase tracking-wider">Upper Band</span>
                <span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded group-hover/bb:text-cyan-400 transition-colors">
                  ${currentIndicators.bb_upper?.toFixed(0) || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center group/bb">
                <span className="text-gray-500 text-xs uppercase tracking-wider">Basis</span>
                <span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded group-hover/bb:text-cyan-400 transition-colors">
                  ${currentIndicators.bb_middle?.toFixed(0) || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center group/bb">
                <span className="text-gray-500 text-xs uppercase tracking-wider">Lower Band</span>
                <span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded group-hover/bb:text-red-400 transition-colors">
                  ${currentIndicators.bb_lower?.toFixed(0) || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-black/20 backdrop-blur-md border border-white/5 rounded-xl p-5 col-span-1 md:col-span-2 relative overflow-hidden group">
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-cyan-500/5 to-transparent" />
            <div className="text-sm font-medium text-gray-400 mb-4 relative z-10">Moving Averages (SMA)</div>
            <div className="grid grid-cols-3 gap-6 relative z-10">
              <div className="text-center group/sma">
                <div className="text-xs text-gray-500 uppercase tracking-widest mb-1 group-hover/sma:text-cyan-400 transition-colors">20 Periods</div>
                <div className="text-xl font-mono text-white group-hover/sma:scale-110 transition-transform origin-center">
                  ${currentIndicators.sma_20?.toFixed(0) || 'N/A'}
                </div>
              </div>
              <div className="text-center group/sma border-x border-white/5 px-2">
                <div className="text-xs text-gray-500 uppercase tracking-widest mb-1 group-hover/sma:text-emerald-400 transition-colors">50 Periods</div>
                <div className="text-xl font-mono text-white group-hover/sma:scale-110 transition-transform origin-center">
                  ${currentIndicators.sma_50?.toFixed(0) || 'N/A'}
                </div>
              </div>
              <div className="text-center group/sma">
                <div className="text-xs text-gray-500 uppercase tracking-widest mb-1 group-hover/sma:text-fuchsia-400 transition-colors">200 Periods</div>
                <div className="text-xl font-mono text-white group-hover/sma:scale-110 transition-transform origin-center">
                  ${currentIndicators.sma_200?.toFixed(0) || 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
