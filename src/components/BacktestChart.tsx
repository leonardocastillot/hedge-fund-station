import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Scatter,
  ReferenceLine
} from 'recharts';
import { format } from 'date-fns';

interface Trade {
  entry_time: string;
  entry_price: number;
  exit_time: string | null;
  exit_price: number | null;
  pnl: number;
  pnl_pct: number;
  status?: string;
  entry_reason?: string;
  exit_reason?: string;
  mae?: number;
  mfe?: number;
  duration_hours?: number;
  market_regime?: string;
  entry_rsi?: number;
  entry_macd?: number;
}

interface BacktestChartProps {
  equityCurve: Array<{ timestamp: string; equity: number; price: number }>;
  trades: Trade[];
}

export default function BacktestChart({ equityCurve, trades }: BacktestChartProps) {
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [hoveredTrade, setHoveredTrade] = useState<number | null>(null);

  if (!equityCurve || equityCurve.length === 0) {
    return (
      <div className="glass-panel p-6 text-center text-gray-400">
        <p>No hay datos de equity curve disponibles</p>
      </div>
    );
  }

  // Preparar datos del gráfico
  const chartData = useMemo(() =>
    equityCurve.map((point) => ({
      time: new Date(point.timestamp).getTime(),
      timeLabel: format(new Date(point.timestamp), 'MMM dd'),
      equity: point.equity,
      price: point.price,
    })), [equityCurve]
  );

  // OPTIMIZACIÓN: Reducir cantidad de marcadores cuando hay muchos trades
  const shouldDownsample = trades.length > 50;
  const downsampleRate = trades.length > 100 ? 3 : trades.length > 50 ? 2 : 1;

  // Función para mapear trade a punto del gráfico
  const mapTradeToChart = (tradeTime: string, tradePrice: number, tradeData: any) => {
    const time = new Date(tradeTime).getTime();
    const closestPoint = chartData.reduce((prev, curr) =>
      Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev
    );
    return {
      ...closestPoint,
      tradePrice,
      ...tradeData
    };
  };

  // Buy markers - con downsampling si hay muchos
  const buyMarkers = useMemo(() => {
    const markers = trades
      .filter((t) => t.entry_time)
      .map((t, idx) => mapTradeToChart(t.entry_time, t.entry_price, {
        type: 'BUY',
        pnl: t.pnl,
        tradeIndex: idx + 1,
        entry_reason: t.entry_reason || 'Strategy signal',
        market_regime: t.market_regime || 'unknown',
        entry_rsi: t.entry_rsi,
        entry_macd: t.entry_macd,
      }));

    // Downsampling: mostrar solo cada N trades
    return shouldDownsample
      ? markers.filter((_, idx) => idx % downsampleRate === 0)
      : markers;
  }, [trades, chartData, shouldDownsample, downsampleRate]);

  // Sell markers - con downsampling
  const sellMarkers = useMemo(() => {
    const markers = trades
      .filter((t) => t.exit_time && t.exit_price)
      .map((t, idx) => mapTradeToChart(t.exit_time!, t.exit_price!, {
        type: 'SELL',
        pnl: t.pnl,
        pnl_pct: t.pnl_pct,
        tradeIndex: idx + 1,
        exit_reason: t.exit_reason || 'Strategy signal',
        duration_hours: t.duration_hours,
        mae: t.mae,
        mfe: t.mfe,
      }));

    return shouldDownsample
      ? markers.filter((_, idx) => idx % downsampleRate === 0)
      : markers;
  }, [trades, chartData, shouldDownsample, downsampleRate]);

  // Custom tooltip mejorado
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-panel border-white/10 rounded-lg p-4 shadow-2xl backdrop-blur-xl max-w-md">
          <p className="text-[10px] uppercase font-mono tracking-widest text-gray-400 mb-2 border-b border-white/10 pb-2">
            {format(new Date(data.time), 'MMM dd, yyyy HH:mm')}
          </p>
          <div className="space-y-1">
            <p className="text-sm">
              <span className="text-gray-500 font-mono text-xs uppercase tracking-widest">Price:</span>{' '}
              <span className="font-bold text-white">${data.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </p>
            <p className="text-sm">
              <span className="text-gray-500 font-mono text-xs uppercase tracking-widest">Equity:</span>{' '}
              <span className="font-bold text-emerald-400">${data.equity?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </p>

            {data.type && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`font-bold text-lg ${data.type === 'BUY' ? 'text-emerald-400' : data.pnl > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.type} #{data.tradeIndex}
                  </span>
                  <span className="font-bold text-white">
                    ${data.tradePrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {data.type === 'BUY' && data.entry_reason && (
                  <div className="text-xs text-gray-300">{data.entry_reason}</div>
                )}

                {data.type === 'SELL' && (
                  <div className={`font-bold ${data.pnl > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.pnl > 0 ? '+' : ''}${data.pnl?.toFixed(2)} ({data.pnl_pct > 0 ? '+' : ''}{data.pnl_pct?.toFixed(2)}%)
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Marcadores más pequeños cuando hay muchos trades
  const dotSize = trades.length > 100 ? 6 : trades.length > 50 ? 8 : 10;
  const labelSize = trades.length > 100 ? 8 : trades.length > 50 ? 10 : 12;

  const CustomBuyDot = (props: any) => {
    const { cx, cy } = props;
    if (!cx || !cy) return null;
    return (
      <g>
        <circle cx={cx} cy={cy} r={dotSize + 4} fill="rgba(16, 185, 129, 0.2)" style={{ filter: "blur(2px)" }} />
        <circle cx={cx} cy={cy} r={dotSize} fill="#10b981" stroke="#fff" strokeWidth={2} />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#fff" fontSize={labelSize} fontWeight="bold">
          E
        </text>
      </g>
    );
  };

  const CustomSellDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;
    const isProfit = payload?.pnl > 0;
    const color = isProfit ? '#10b981' : '#ef4444';
    return (
      <g>
        <circle cx={cx} cy={cy} r={dotSize + 4} fill={isProfit ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'} style={{ filter: "blur(2px)" }} />
        <circle cx={cx} cy={cy} r={dotSize} fill={color} stroke="#fff" strokeWidth={2} />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#fff" fontSize={labelSize} fontWeight="bold">
          S
        </text>
      </g>
    );
  };

  // Paginación de trades - mostrar solo primeros 20 por defecto
  const displayedTrades = showAllTrades ? trades : trades.slice(0, 20);
  const hasMoreTrades = trades.length > 20;

  // Stats de trades
  const winningTrades = trades.filter(t => t.pnl > 0).length;
  const losingTrades = trades.filter(t => t.pnl < 0).length;
  const winRate = ((winningTrades / trades.length) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Price Chart with Trades - OPTIMIZADO */}
      <div className="glass-panel p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

        {/* Header con stats */}
        <div className="flex items-center justify-between mb-6 relative z-10">
          <h3 className="text-lg font-bold flex items-center">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400">
              BTC Price & Executions
            </span>
            <span className="ml-3 text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]">📈</span>
          </h3>

          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
              <span className="text-gray-500 uppercase">Total Trades:</span>{' '}
              <span className="text-white font-bold">{trades.length}</span>
            </div>
            <div className="bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/30">
              <span className="text-gray-400 uppercase">Win Rate:</span>{' '}
              <span className="text-emerald-400 font-bold">{winRate}%</span>
            </div>
            {shouldDownsample && (
              <div className="bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/30">
                <span className="text-yellow-400 text-[10px] uppercase">Showing 1/{downsampleRate} trades</span>
              </div>
            )}
          </div>
        </div>

        {/* Gráfico mejorado - MÁS ALTO */}
        <ResponsiveContainer width="100%" height={500} className="relative z-10">
          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="timeLabel"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              height={50}
            />
            <YAxis
              yAxisId="price"
              stroke="#3b82f6"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
            />

            {/* Price Area - MÁS VISIBLE */}
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              fill="url(#priceGradient)"
              strokeWidth={3}
                name="BTC Price"
              animationDuration={800}
            />

            {/* Buy markers */}
            {buyMarkers.length > 0 && (
              <Scatter
                yAxisId="price"
                data={buyMarkers}
                dataKey="tradePrice"
                fill="#10b981"
                shape={<CustomBuyDot />}
                name="Entry"
              />
            )}

            {/* Sell markers */}
            {sellMarkers.length > 0 && (
              <Scatter
                yAxisId="price"
                data={sellMarkers}
                dataKey="tradePrice"
                fill="#ef4444"
                shape={<CustomSellDot />}
                name="Exit"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legend mejorado */}
        <div className="flex items-center justify-center space-x-6 mt-6 text-sm relative z-10 font-mono">
          <div className="flex items-center bg-black/20 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-sm">
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500 mr-2 flex items-center justify-center">
          <span className="text-emerald-400 text-[10px] font-bold">E</span>
            </div>
            <span className="text-gray-400 text-xs uppercase tracking-widest">Entries ({winningTrades + losingTrades})</span>
          </div>
          <div className="flex items-center bg-black/20 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-sm">
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500 mr-2 flex items-center justify-center">
              <span className="text-emerald-400 text-[10px] font-bold">S</span>
            </div>
            <span className="text-gray-400 text-xs uppercase tracking-widest">Winning exits ({winningTrades})</span>
          </div>
          <div className="flex items-center bg-black/20 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-sm">
            <div className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500 mr-2 flex items-center justify-center">
              <span className="text-red-400 text-[10px] font-bold">S</span>
            </div>
            <span className="text-gray-400 text-xs uppercase tracking-widest">Losing exits ({losingTrades})</span>
          </div>
        </div>
      </div>

      {/* Equity Curve - SIN CAMBIOS */}
      <div className="glass-panel p-6 shadow-xl relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
        <h3 className="text-lg font-bold flex items-center mb-6 relative z-10">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400">Equity Curve</span>
          <span className="ml-3 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]">💰</span>
        </h3>
        <ResponsiveContainer width="100%" height={300} className="relative z-10">
          <ComposedChart data={chartData}>
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="timeLabel" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(1)}K`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
              labelFormatter={(label) => `Fecha: ${label}`}
              formatter={(value: any) => [`$${value.toLocaleString()}`, 'Capital']}
            />
            <ReferenceLine y={chartData[0]?.equity} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="#10b981"
              fill="url(#equityGradient)"
              strokeWidth={3}
              animationDuration={800}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Trades List - CON PAGINACIÓN */}
      <div className="glass-panel p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-6 relative z-10">
          <h3 className="text-lg font-bold flex items-center">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400">
              Trade Execution Log
            </span>
            <span className="ml-3 text-fuchsia-400">📋</span>
          </h3>

          {hasMoreTrades && !showAllTrades && (
            <button
              onClick={() => setShowAllTrades(true)}
              className="glass-button px-4 py-2 text-sm font-semibold uppercase tracking-wider"
            >
              Show All {trades.length} Trades
            </button>
          )}

          {showAllTrades && (
            <button
              onClick={() => setShowAllTrades(false)}
              className="glass-button px-4 py-2 text-sm font-semibold uppercase tracking-wider"
            >
              Show Less
            </button>
          )}
        </div>

        <div className="space-y-3 relative z-10 max-h-[600px] overflow-y-auto pr-2">
          {displayedTrades.map((trade, idx) => (
            <div
              key={idx}
              onMouseEnter={() => setHoveredTrade(idx)}
              onMouseLeave={() => setHoveredTrade(null)}
              className={`bg-black/20 backdrop-blur-sm rounded-lg border p-4 transition-all cursor-pointer ${
                hoveredTrade === idx ? 'scale-[1.02] shadow-xl' : ''
              } ${
                trade.pnl > 0
                  ? 'border-emerald-500/20 hover:border-emerald-500/40'
                  : 'border-red-500/20 hover:border-red-500/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className={`text-lg font-bold ${trade.pnl > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    #{idx + 1}
                  </span>
                  <div className="text-sm font-mono text-gray-400">
                    {format(new Date(trade.entry_time), 'MMM dd, HH:mm')}
                  </div>
                  <div className="text-sm text-white">
                    ${trade.entry_price.toLocaleString()} → ${trade.exit_price?.toLocaleString() || '...'}
                  </div>
                </div>
                <div className={`text-xl font-bold font-mono ${trade.pnl > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                  <span className="text-sm ml-2">({trade.pnl_pct > 0 ? '+' : ''}{trade.pnl_pct.toFixed(2)}%)</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {hasMoreTrades && !showAllTrades && (
          <div className="mt-4 text-center text-sm text-gray-500">
            Showing {displayedTrades.length} of {trades.length} trades
          </div>
        )}
      </div>
    </div>
  );
}
