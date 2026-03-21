import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { useChartData } from '../hooks/useChartData';

export default function Chart() {
  const [timeframe, setTimeframe] = useState('15m');
  const { data, isLoading } = useChartData(timeframe);

  const timeframes = [
    { value: '5m', label: '5m' },
    { value: '15m', label: '15m' },
    { value: '1h', label: '1h' },
    { value: '4h', label: '4h' },
  ];

  const chartData = useMemo(() => data.map((candle) => {
    const date = new Date(candle.timestamp);
    const timeLabel = timeframe === '4h' || timeframe === '1h'
      ? format(date, 'MM/dd HH:mm')
      : format(date, 'HH:mm');

    return {
      time: timeLabel,
      price: candle.close,
      high: candle.high,
      low: candle.low,
    };
  }), [data, timeframe]);

  const priceChange = data.length > 1
    ? ((data[data.length - 1].close - data[0].close) / data[0].close * 100).toFixed(2)
    : '0.00';
  const isPositive = parseFloat(priceChange) >= 0;

  return (
    <div className="glass-panel p-6 shadow-xl relative overflow-hidden group">
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-500"></div>

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div>
          <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400">
            Live Price Action
          </h2>
          {data.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold text-white">
                ${data[data.length - 1]?.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className={`text-sm font-mono ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {isPositive ? '▲' : '▼'} {priceChange}%
              </span>
            </div>
          )}
        </div>

        <div className="flex space-x-2 bg-black/20 p-1 rounded-lg backdrop-blur-sm border border-white/5">
          {timeframes.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all duration-300 ${
                timeframe === tf.value
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-[0_0_10px_rgba(0,243,255,0.3)]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-80 flex items-center justify-center relative z-10">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mb-4 shadow-[0_0_15px_rgba(0,243,255,0.5)]"></div>
            <div className="text-cyan-400/70 font-mono text-sm tracking-widest uppercase animate-pulse">
              Loading...
            </div>
          </div>
        </div>
      ) : data.length === 0 ? (
        <div className="h-80 flex items-center justify-center relative z-10">
          <div className="text-gray-500 font-mono text-sm">No data available</div>
        </div>
      ) : (
        <div className="relative z-10">
          <ResponsiveContainer width="100%" height={380}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f3ff" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#00f3ff" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="rgba(255,255,255,0.2)"
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                tickMargin={10}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                stroke="rgba(255,255,255,0.2)"
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                domain={['dataMin - 100', 'dataMax + 100']}
                tickMargin={10}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(6, 9, 19, 0.9)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(0, 243, 255, 0.2)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
                itemStyle={{ color: '#00f3ff', fontSize: 12 }}
                labelStyle={{ color: '#fff', fontSize: 11, marginBottom: 4 }}
                formatter={(value: number | undefined) => [`$${(value ?? 0).toLocaleString()}`, 'Price']}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#00f3ff"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPrice)"
                animationDuration={300}
              />
            </AreaChart>
          </ResponsiveContainer>

          <div className="mt-3 flex items-center justify-center text-xs font-mono text-gray-500">
            <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full border border-white/5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span>Live • {data.length} candles • {
                timeframe === '5m' ? '~10 hours' :
                timeframe === '15m' ? '~30 hours' :
                timeframe === '1h' ? '~1 week' :
                '~1 month'
              } history</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
