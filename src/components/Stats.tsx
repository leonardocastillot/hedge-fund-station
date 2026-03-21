import { useEffect, useState } from 'react';
import { apiService } from '../services/api';

export default function Stats() {
  const [stats, setStats] = useState<any>(null);
  const [temporal, setTemporal] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);

    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [statsData, temporalData] = await Promise.all([
        apiService.getOverviewStats(),
        apiService.getTemporalAnalytics()
      ]);

      setStats(statsData);
      setTemporal(temporalData);
      setIsLoading(false);
    } catch (error) {
      console.error('❌ Stats: Error fetching stats:', error);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="glass-panel p-6 shadow-xl relative overflow-hidden">
        <div className="animate-pulse space-y-4 relative z-10">
          <div className="h-8 bg-white/10 rounded w-1/3"></div>
          <div className="h-20 bg-white/5 border border-white/5 rounded-xl"></div>
          <div className="h-20 bg-white/5 border border-white/5 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Database Stats */}
      <div className="glass-panel p-6 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl group-hover:bg-cyan-500/20 transition-all duration-700"></div>

        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400 mb-6 relative z-10 flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M12 12v9" /><path d="m8 17 4 4 4-4" /></svg>
          System Telemetry
        </h2>

        <div className="grid grid-cols-2 gap-4 relative z-10">
          <div className="bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-2xl p-5 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 group/item">
            <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-[0.2em] font-bold flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 mr-2 shadow-[0_0_8px_rgba(0,243,255,0.8)] group-hover/item:scale-125 transition-transform"></span>
              Processed Candles
            </div>
            <div className="text-3xl font-mono text-white mt-2 font-bold tracking-tighter">
              {stats?.total_candles?.toLocaleString() || '0'}
            </div>
          </div>

          <div className="bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-2xl p-5 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 group/item">
            <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-[0.2em] font-bold flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 mr-2 shadow-[0_0_8px_rgba(217,70,239,0.8)] group-hover/item:scale-125 transition-transform"></span>
              Compute Nodes
            </div>
            <div className="text-3xl font-mono text-white mt-2 font-bold tracking-tighter">
              {stats?.total_indicators?.toLocaleString() || '0'}
            </div>
          </div>

          <div className="bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-2xl p-5 col-span-2 flex justify-between items-center hover:bg-white/[0.05] transition-all duration-500">
            <div className="flex-1">
              <div className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-1 font-bold">Vector Start</div>
              <div className="text-sm text-gray-300 font-mono font-bold">
                {stats?.oldest_data ? new Date(stats.oldest_data).toLocaleDateString() : 'N/A'}
              </div>
            </div>
            <div className="flex flex-col items-center px-4 opacity-30">
              <div className="w-1 h-1 rounded-full bg-gray-500 mb-1"></div>
              <div className="w-px h-8 bg-gradient-to-b from-transparent via-gray-500 to-transparent"></div>
              <div className="w-1 h-1 rounded-full bg-gray-500 mt-1"></div>
            </div>
            <div className="flex-1 text-right">
              <div className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-1 font-bold">Vector Current</div>
              <div className="text-sm text-cyan-400 font-mono font-bold drop-shadow-[0_0_5px_rgba(0,243,255,0.3)]">
                {stats?.newest_data ? new Date(stats.newest_data).toLocaleDateString() : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Temporal Insights */}
      {temporal && temporal.insights && (
        <div className="glass-panel p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-700"></div>

          <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400 mb-6 relative z-10 flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><path d="M12 2v10" /><path d="M18.42 4.61a2.1 2.1 0 0 1 2.97 2.97L12 17.58 3.61 9.19a2.1 2.1 0 0 1 2.97-2.97L12 11.63z" /><path d="M12 17v5" /></svg>
            Temporal Intelligence
          </h2>

          <div className="space-y-3 relative z-10">
            {temporal.insights.map((insight: string, idx: number) => (
              <div
                key={idx}
                className="bg-indigo-500/[0.03] backdrop-blur-sm border border-indigo-500/10 rounded-2xl p-4 hover:bg-indigo-500/[0.08] hover:border-indigo-500/30 transition-all duration-500 flex gap-4 group/insight"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20 group-hover/insight:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>
                </div>
                <div className="text-sm text-gray-300 leading-relaxed font-medium">
                  {insight}
                </div>
              </div>
            ))}
          </div>

          {/* Best times to buy */}
          <div className="mt-6 grid grid-cols-2 gap-4 relative z-10">
            <div className="bg-emerald-500/[0.05] backdrop-blur-sm border border-emerald-500/20 rounded-2xl p-5 group/time hover:bg-emerald-500/[0.1] transition-all duration-500">
              <div className="text-[10px] text-emerald-400/60 uppercase tracking-[0.2em] mb-2 font-bold">Optimal Signal (Day)</div>
              <div className="text-2xl font-bold text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)] transition-all">
                {temporal.best_weekday}
              </div>
            </div>

            <div className="bg-emerald-500/[0.05] backdrop-blur-sm border border-emerald-500/20 rounded-2xl p-5 group/time hover:bg-emerald-500/[0.1] transition-all duration-500">
              <div className="text-[10px] text-emerald-400/60 uppercase tracking-[0.2em] mb-2 font-bold">Optimal Signal (Hr)</div>
              <div className="text-2xl font-mono font-bold text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)] transition-all">
                {temporal.best_hour}:00 <span className="text-[10px] text-emerald-500/50 uppercase ml-1">UTC</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
