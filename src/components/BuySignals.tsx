import { useEffect, useState } from 'react';
import { apiService } from '../services/api';

export default function BuySignals() {
  const [signals, setSignals] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 30000); // Actualizar cada 30 segundos

    return () => clearInterval(interval);
  }, []);

  const fetchSignals = async () => {
    try {
      const data = await apiService.getBuySignals();
      setSignals(data);
      setIsLoading(false);
    } catch (error) {
      console.error('❌ BuySignals: Error fetching signals:', error);
      setIsLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 60) return 'text-green-400';
    if (score >= 40) return 'text-yellow-400';
    return 'text-gray-400';
  };

  return (
    <div className="glass-panel p-6 shadow-xl relative overflow-hidden group">
      <div className="absolute -top-32 -right-32 w-64 h-64 bg-fuchsia-500/10 rounded-full blur-3xl group-hover:bg-fuchsia-500/20 transition-all duration-700"></div>

      <div className="flex items-center space-x-3 mb-6 relative z-10">
        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400">Trade Signals Matrix</h2>
        <div className="h-4 w-[1px] bg-white/20"></div>
        <div className="flex items-center space-x-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></div>
          <span className="text-[10px] text-cyan-400/70 font-mono tracking-widest uppercase">Auto-Analysis Active</span>
        </div>
      </div>

      {isLoading || !signals ? (
        <div className="animate-pulse space-y-4 relative z-10">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-white/5 border border-white/5 rounded-xl"></div>
          ))}
        </div>
      ) : (
        <div className="relative z-10">
          {/* Score General */}
          <div className="relative p-6 mb-6 rounded-2xl overflow-hidden border border-white/10 shadow-2xl group/score">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 to-fuchsia-900/40 backdrop-blur-md"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>

            <div className="relative z-10 flex items-center justify-between">
              <div>
                <div className="text-xs text-indigo-200/70 uppercase tracking-widest mb-1 font-semibold">General Confidence Matrix</div>
                <div className={`text-6xl font-bold tracking-tighter ${signals.general_score >= 60 ? 'neon-text-emerald text-emerald-400' :
                    signals.general_score >= 40 ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' :
                      'text-gray-400'
                  } group-hover/score:scale-105 transition-transform origin-left`}>
                  {signals.general_score}
                  <span className="text-2xl text-white/20 font-light ml-1">/100</span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2 font-mono">System Recommendation</div>
                <div className={`px-6 py-2.5 rounded-xl ${signals.recommendation === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)]' :
                    signals.recommendation === 'WAIT' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' :
                      'bg-white/10 text-gray-300 border border-white/20'
                  } font-bold text-xl tracking-wider`}>
                  {signals.recommendation}
                </div>
              </div>
            </div>
          </div>

          {/* Signals por timeframe */}
          <div className="space-y-3">
            {Object.entries(signals.signals).map(([timeframe, signal]: [string, any]) => (
              <div
                key={timeframe}
                className="bg-black/20 backdrop-blur-sm border border-white/5 rounded-xl p-4 hover:bg-black/40 hover:border-white/10 transition-all duration-300 group/tf"
              >
                <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                  <div className="flex items-center space-x-4">
                    <div className="text-sm font-bold text-white bg-white/10 px-2 py-0.5 rounded shadow-inner uppercase tracking-wider">
                      {timeframe}
                    </div>
                    <div className={`text-lg font-mono ${getScoreColor(signal.score)}`}>
                      {signal.score}<span className="text-xs text-white/30 ml-1">/100</span>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-md text-xs font-bold tracking-wider ${signal.signal.includes('STRONG') ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]' :
                      signal.signal === 'BUY' ? 'bg-emerald-500/80 text-white' :
                        signal.signal === 'WEAK BUY' ? 'bg-yellow-500 text-black' :
                          'bg-white/10 text-gray-300'
                    }`}>
                    {signal.signal}
                  </div>
                </div>

                {signal.reasons && signal.reasons.length > 0 ? (
                  <div className="text-xs text-gray-400 space-y-1.5 mt-1">
                    {signal.reasons.map((reason: string, idx: number) => (
                      <div key={idx} className="flex items-start group-hover/tf:text-gray-300 transition-colors">
                        <span className="mr-2 text-cyan-500 opacity-70 mt-0.5">⯈</span>
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-white/20 italic mt-1">No significant signals detected</div>
                )}
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <div className="mt-6 p-4 bg-[#0a0f1c] border border-white/5 rounded-xl shadow-inner relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500/50"></div>
            <div className="text-[10px] uppercase font-mono tracking-widest text-yellow-500/80 leading-relaxed pl-2">
              <span className="text-yellow-400 font-bold mr-1">⚠️ SYSTEM WARNING:</span> Matrices provide heuristic estimations based on market algorithms. These models are strictly non-deterministic and DO NOT constitute financial advice. Proceed with autonomous verification.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
