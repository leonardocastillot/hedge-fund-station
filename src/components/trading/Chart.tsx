import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { useChartData } from '../../hooks';
import { GlassPanel, Button, LoadingSpinner } from '../ui';

const TIMEFRAMES = [
  { value: '5m', label: '5m', period: '~10 hours' },
  { value: '15m', label: '15m', period: '~30 hours' },
  { value: '1h', label: '1h', period: '~1 week' },
  { value: '4h', label: '4h', period: '~1 month' }
];

export default function Chart() {
  const [timeframe, setTimeframe] = useState('15m');
  const { data, isLoading, error } = useChartData(timeframe);

  const chartData = useMemo(() => data.map((candle) => {
    const date = new Date(candle.timestamp);
    const timeLabel = timeframe === '4h' || timeframe === '1h'
      ? format(date, 'MM/dd HH:mm')
      : format(date, 'HH:mm');

    return {
      time: timeLabel,
      price: candle.close,
      high: candle.high,
      low: candle.low
    };
  }), [data, timeframe]);

  const priceChange = data.length > 1
    ? ((data[data.length - 1].close - data[0].close) / data[0].close * 100).toFixed(2)
    : '0.00';
  const isPositive = parseFloat(priceChange) >= 0;
  const currentTimeframe = TIMEFRAMES.find((tf) => tf.value === timeframe);

  return (
    <GlassPanel hover glow="cyan">
      <div className="flex items-center justify-between mb-4">
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
                {isPositive ? 'UP' : 'DOWN'} {priceChange}%
              </span>
            </div>
          )}
        </div>

        <div className="flex space-x-2 bg-black/20 p-1 rounded-lg backdrop-blur-sm border border-white/5">
          {TIMEFRAMES.map((tf) => (
            <Button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              variant={timeframe === tf.value ? 'primary' : 'glass'}
              size="sm"
            >
              {tf.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-80 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="h-80 flex items-center justify-center text-red-400">
          Failed to load chart data
        </div>
      ) : data.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-gray-500">
          No data available
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorPriceTrading" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f3ff" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#00f3ff" stopOpacity={0.02} />
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
                tickMargin={10}
                domain={['dataMin - 100', 'dataMax + 100']}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(6, 9, 19, 0.9)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(0, 243, 255, 0.2)',
                  borderRadius: '8px',
                  padding: '8px 12px'
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
                fill="url(#colorPriceTrading)"
                animationDuration={250}
              />
            </AreaChart>
          </ResponsiveContainer>

          <div className="mt-3 flex items-center justify-center text-xs font-mono text-gray-500">
            <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full border border-white/5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>
                Live | {data.length} candles | {currentTimeframe?.period ?? ''}
              </span>
            </div>
          </div>
        </>
      )}
    </GlassPanel>
  );
}
