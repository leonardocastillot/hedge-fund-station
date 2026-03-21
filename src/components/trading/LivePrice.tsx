import { useLivePrice } from '../../hooks';

export default function LivePrice() {
  const { price, change24h, volume24h, isLoading } = useLivePrice();
  const isPositive = change24h >= 0;

  return (
    <div className="glass-panel px-3 py-1.5 shadow-lg flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-white text-xs">BTC/USDT</span>
        <div className={`w-1 h-1 rounded-full ${isLoading ? 'bg-yellow-500' : 'bg-cyan-400'} animate-pulse`}></div>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex gap-2">
          <div className="h-5 bg-white/10 rounded w-20"></div>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-1 justify-center">
          <span className="text-xl font-bold text-white font-mono">
            ${price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>

          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold font-mono ${
            isPositive
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}>
            {isPositive ? '▲' : '▼'} {Math.abs(change24h).toFixed(2)}%
          </div>

          <div className="text-xs text-gray-400 flex items-center gap-1">
            <span className="text-gray-500">Vol:</span>
            <span className="text-white font-mono">${(volume24h / 1000000).toFixed(1)}M</span>
          </div>
        </div>
      )}

      <div className="text-[10px] text-gray-500 font-mono">
        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
