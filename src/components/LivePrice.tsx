import { useLivePrice } from '../hooks';

export default function LivePrice() {
  const { price, change24h, volume24h, isLoading } = useLivePrice();
  const isPositive = change24h >= 0;

  return (
    <div className="glass-panel p-6 shadow-xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl group-hover:bg-cyan-500/20 transition-all duration-700"></div>

      <div className="flex items-center justify-between mb-4 relative z-10">
        <h2 className="text-xl font-bold flex items-center">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-400">BTC</span>
          <span className="text-gray-500 mx-2 text-sm opacity-50">/</span>
          <span className="text-gray-400 font-medium text-sm tracking-wider">USDT</span>
        </h2>
        <div className="flex items-center space-x-2 bg-black/50 px-3 py-1 rounded-full border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
          <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]' : 'bg-cyan-400 shadow-[0_0_8px_rgba(0,243,255,0.8)]'} animate-pulse`}></div>
          <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-cyan-200/70 font-bold">Live Data</span>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse relative z-10">
          <div className="h-10 bg-white/10 rounded-xl w-3/4 mb-3"></div>
          <div className="h-6 bg-white/5 rounded-lg w-1/2"></div>
        </div>
      ) : (
        <div className="relative z-10">
          <div className="mb-4">
            <div className="text-5xl font-bold text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] bg-clip-text">
              ${price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <div className={`flex items-center px-3 py-1 rounded-xl backdrop-blur-md border ${isPositive
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_4px_15px_rgba(16,185,129,0.1)]'
              : 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_4px_15px_rgba(239,68,68,0.1)]'
              } transition-all duration-300`}>
              <span className="flex items-center font-bold font-mono">
                {isPositive ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
                )}
                {Math.abs(change24h).toFixed(2)}%
              </span>
              <span className="text-[10px] text-gray-500/70 ml-2 font-mono uppercase tracking-widest font-bold">24h Change</span>
            </div>

            <div className="space-y-0.5">
              <div className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold">Volume (24h)</div>
              <div className="text-base text-gray-200 font-mono tracking-tight flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50"></span>
                ${(volume24h / 1000000).toFixed(2)}M
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
