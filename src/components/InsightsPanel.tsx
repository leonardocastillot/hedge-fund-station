import { useEffect, useState } from 'react';
import { apiService } from '../services/api';

interface Insight {
  category: string;
  title: string;
  description: string;
  confidence: number;
  action: string | null;
  priority: string;
}

interface InsightsReport {
  timeframe: string;
  total_insights: number;
  insights: Insight[];
  overall_sentiment: string;
  buy_score: number;
  sell_score: number;
  by_action: {
    BUY: number;
    SELL: number;
    HOLD: number;
    WAIT: number;
  };
}

export default function InsightsPanel() {
  const [reports, setReports] = useState<{ [key: string]: InsightsReport } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState('4h');

  useEffect(() => {
    fetchInsights();
    const interval = setInterval(fetchInsights, 300000); // Actualizar cada 5 min

    return () => clearInterval(interval);
  }, []);

  const fetchInsights = async () => {
    try {
      const data = await apiService.getAllInsights();
      setReports(data.data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching insights:', error);
      setIsLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return 'border-red-500 bg-red-900/10 shadow-[inset_4px_0_0_rgba(239,68,68,1)]';
      case 'MEDIUM':
        return 'border-yellow-500 bg-yellow-900/10 shadow-[inset_4px_0_0_rgba(234,179,8,1)]';
      case 'LOW':
        return 'border-gray-500 bg-gray-900/10 shadow-[inset_4px_0_0_rgba(156,163,175,1)]';
      default:
        return 'border-gray-600';
    }
  };

  const getActionBadge = (action: string | null) => {
    if (!action) return null;

    const colors = {
      BUY: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]',
      SELL: 'bg-red-500/20 text-red-400 border border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.3)]',
      HOLD: 'bg-blue-500/20 text-blue-400 border border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.3)]',
      WAIT: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.3)]',
    };

    return (
      <span className={`px-2.5 py-0.5 rounded text-xs font-mono tracking-wider uppercase ${colors[action as keyof typeof colors]}`}>
        {action}
      </span>
    );
  };

  const getSentimentEmoji = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH':
        return '🟢';
      case 'BEARISH':
        return '🔴';
      case 'NEUTRAL':
        return '⚪';
      default:
        return '⚪';
    }
  };

  if (isLoading) {
    return (
      <div className="glass-panel p-6 shadow-xl relative overflow-hidden">
        <div className="animate-pulse space-y-4 relative z-10">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white/5 border border-white/5 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!reports) {
    return (
      <div className="glass-panel p-6 shadow-xl flex items-center justify-center p-12">
        <div className="text-gray-400 font-mono text-sm tracking-widest uppercase">No insights available</div>
      </div>
    );
  }

  const currentReport = reports[selectedTimeframe];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 shadow-xl relative overflow-hidden group">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-fuchsia-500/10 rounded-full blur-3xl group-hover:bg-fuchsia-500/20 transition-all duration-700"></div>

        <div className="flex items-center justify-between mb-6 relative z-10">
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400 flex items-center">
            <span className="text-fuchsia-400 drop-shadow-[0_0_8px_rgba(217,70,239,0.8)] mr-3">✦</span>
            AI Insights
          </h2>

          {/* Timeframe Selector */}
          <div className="flex space-x-2 bg-black/40 p-1 rounded-lg backdrop-blur-sm border border-white/5">
            {['4h', '1d'].map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-300 ${selectedTimeframe === tf
                  ? 'bg-fuchsia-500/20 text-fuchsia-300 shadow-[0_0_10px_rgba(217,70,239,0.2)]'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Overall Sentiment */}
        {currentReport && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2 relative z-10">
            <div className="bg-black/20 backdrop-blur-md border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Market Sentiment</div>
              <div className="text-2xl font-bold text-white flex items-center">
                <span className="mr-3 drop-shadow-lg">{getSentimentEmoji(currentReport.overall_sentiment)}</span>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-300">{currentReport.overall_sentiment}</span>
              </div>
            </div>

            <div className="bg-black/20 backdrop-blur-md border border-emerald-500/10 rounded-xl p-4 hover:border-emerald-500/30 transition-colors">
              <div className="text-[10px] text-emerald-500/70 uppercase tracking-widest font-mono mb-2">Buy Vector Score</div>
              <div className="text-3xl font-mono text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                {currentReport.buy_score.toFixed(0)}
              </div>
              <div className="text-xs text-gray-500 mt-1 font-mono">
                {currentReport.by_action.BUY} buying signals
              </div>
            </div>

            <div className="bg-black/20 backdrop-blur-md border border-red-500/10 rounded-xl p-4 hover:border-red-500/30 transition-colors">
              <div className="text-[10px] text-red-500/70 uppercase tracking-widest font-mono mb-2">Sell Vector Score</div>
              <div className="text-3xl font-mono text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                {currentReport.sell_score.toFixed(0)}
              </div>
              <div className="text-xs text-gray-500 mt-1 font-mono">
                {currentReport.by_action.SELL} selling signals
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Insights List */}
      {currentReport && currentReport.insights.length > 0 ? (
        <div className="space-y-4">
          {currentReport.insights.map((insight, idx) => (
            <div
              key={idx}
              className={`backdrop-blur-md rounded-xl p-5 border ${getPriorityColor(insight.priority)} transition-all duration-300 hover:-translate-y-1 hover:shadow-lg`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-bold text-white tracking-wide">{insight.title}</h3>
                    {insight.action && getActionBadge(insight.action)}
                  </div>
                  <p className="text-sm text-gray-300/90 leading-relaxed font-light">{insight.description}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/5">
                <div className="flex items-center space-x-6 text-xs text-gray-400 font-mono tracking-wider uppercase">
                  <span className="flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-2 ${insight.priority === 'HIGH' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' :
                      insight.priority === 'MEDIUM' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]' :
                        'bg-gray-500 shadow-[0_0_8px_rgba(156,163,175,0.8)]'
                      }`}></span>
                    {insight.priority}
                  </span>
                  <span className="flex items-center bg-white/5 px-2 py-1 rounded-md">
                    <svg className="w-3.5 h-3.5 mr-1.5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                      <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                    </svg>
                    {insight.category}
                  </span>
                </div>

                <div className="flex items-center space-x-2 bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
                  <div className="text-[10px] text-gray-500 uppercase font-mono tracking-widest">Confidence</div>
                  <div className={`text-sm font-mono font-bold ${insight.confidence >= 80 ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' :
                    insight.confidence >= 60 ? 'text-yellow-400 drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]' :
                      'text-gray-400'
                    }`}>
                    {insight.confidence}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-panel p-10 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4 border border-blue-500/20">
            <span className="text-2xl opacity-50">📡</span>
          </div>
          <div className="text-gray-300 font-semibold mb-2">No insights available for this timeframe</div>
          <div className="text-sm text-gray-500 font-mono">
            Awaiting further telemetry data or try alternative timeframe
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="glass-panel p-6 bg-blue-900/5 border-blue-500/10">
        <h4 className="font-semibold text-gray-300 mb-3 flex items-center">
          <span className="text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,0.8)] mr-2">ℹ️</span>
          About Telemetry Insights
        </h4>
        <div className="text-sm text-gray-400 space-y-3 font-light">
          <p>
            The <strong>automated insights engine</strong> parses multi-layered technical indicators and temporal patterns
            to identify high-probability trading vectors and potential system risks.
          </p>
          <div className="bg-black/20 p-3 rounded-lg border border-white/5 inline-block w-full">
            <p className="text-[10px] uppercase font-mono tracking-widest text-gray-500 mb-2">Priority Levels</p>
            <ul className="space-y-1.5 font-mono text-xs">
              <li className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)] mr-2"></div><span className="text-red-400 w-16">HIGH</span> <span>Immediate attention required</span></li>
              <li className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.8)] mr-2"></div><span className="text-yellow-400 w-16">MEDIUM</span> <span>Significant vector, monitor closely</span></li>
              <li className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-500 shadow-[0_0_5px_rgba(156,163,175,0.8)] mr-2"></div><span className="text-gray-400 w-16">LOW</span> <span>Informational telemetry</span></li>
            </ul>
          </div>
          <p className="text-fuchsia-400/90 mt-4 bg-fuchsia-500/5 p-3 rounded border border-fuchsia-500/10">
            <span className="drop-shadow-[0_0_5px_rgba(217,70,239,0.8)]">💡</span> <strong>Pro-Tip:</strong> Aggregate multiple high-priority insights to
            identify optimal entry vectors with maximum signal confluence.
          </p>
        </div>
      </div>
    </div>
  );
}
