import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Clock,
  FlaskConical,
  LockKeyhole,
  RefreshCw,
  Server,
  ShieldCheck,
  TrendingUp,
  Wallet
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  alphaEngineApi,
  type AlphaEngineStatus,
  type AutoRunnerStatus,
  type CalendarAnalysis,
  type CalendarWeek,
  type EquityPoint,
  type EvaluationSnapshot,
  type LabOverview,
  type MarketContext,
  type PolymarketBtcStatus,
  type PolymarketTrade,
  type RuntimeStatus,
  type WeeklyBrief,
  type WalletOverview
} from '@/services/alphaEngineApi';
import { useMarketPolling } from '@/hooks/useMarketPolling';

interface CockpitState {
  health: { status: string } | null;
  status: AlphaEngineStatus | null;
  runtime: RuntimeStatus | null;
  evaluations: EvaluationSnapshot | null;
  market: MarketContext | null;
  polymarket: PolymarketBtcStatus | null;
  trades: PolymarketTrade[];
  equity: EquityPoint[];
  autoRunner: AutoRunnerStatus | null;
  wallet: WalletOverview | null;
  lab: LabOverview | null;
  calendarAnalysis: CalendarAnalysis | null;
  calendarWeek: CalendarWeek | null;
  weeklyBrief: WeeklyBrief | null;
}

const emptyState: CockpitState = {
  health: null,
  status: null,
  runtime: null,
  evaluations: null,
  market: null,
  polymarket: null,
  trades: [],
  equity: [],
  autoRunner: null,
  wallet: null,
  lab: null,
  calendarAnalysis: null,
  calendarWeek: null,
  weeklyBrief: null
};

const valueFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2
});

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2
});

function fmt(value: number | null | undefined, prefix = '', suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `${prefix}${valueFormatter.format(value)}${suffix}`;
}

function compact(value: number | null | undefined, prefix = '', suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `${prefix}${compactFormatter.format(value)}${suffix}`;
}

function relativeTime(value: string | number | null | undefined): string {
  if (!value) {
    return 'n/a';
  }

  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'n/a';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function statusTone(value: string | null | undefined): string {
  const normalized = String(value || '').toLowerCase();
  if (['ok', 'running', 'healthy', 'allow', 'pass'].some((item) => normalized.includes(item))) {
    return 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20';
  }
  if (['reject', 'hold', 'dry-run', 'idle'].some((item) => normalized.includes(item))) {
    return 'text-amber-200 bg-amber-500/10 border-amber-300/20';
  }
  if (['error', 'live', 'open', 'block', 'fail'].some((item) => normalized.includes(item))) {
    return 'text-rose-200 bg-rose-500/10 border-rose-300/20';
  }
  return 'text-slate-300 bg-slate-500/10 border-slate-300/10';
}

function isLocalBackendUrl(value: string): boolean {
  return value.includes('127.0.0.1') || value.includes('localhost');
}

function formatFailures(items: Array<{ label: string; task: PromiseSettledResult<unknown> }>): string[] {
  return items
    .filter((item): item is { label: string; task: PromiseRejectedResult } => item.task.status === 'rejected')
    .map((item) => `${item.label}: ${item.task.reason instanceof Error ? item.task.reason.message : String(item.task.reason)}`);
}

const Shell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`glass-panel border-white/5 bg-white/[0.015] ${className}`}>
    {children}
  </section>
);

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}> = ({ icon, title, action }) => (
  <div className="flex min-h-[46px] items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/5 bg-white/[0.02] text-cyan-200">
        {icon}
      </span>
      <h2 className="truncate text-sm font-semibold text-slate-100">{title}</h2>
    </div>
    {action}
  </div>
);

const Stat: React.FC<{
  label: string;
  value: string;
  tone?: string;
}> = ({ label, value, tone = 'text-slate-100' }) => (
  <div className="min-w-0 rounded-md border border-white/5 bg-white/[0.015] p-3 transition-colors hover:bg-white/[0.03]">
    <div className="truncate text-[11px] font-medium text-slate-400">{label}</div>
    <div className={`mt-1 truncate text-base font-semibold ${tone}`}>{value}</div>
  </div>
);

const Badge: React.FC<{ children: React.ReactNode; tone?: string }> = ({ children, tone = '' }) => (
  <span className={`inline-flex max-w-full items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${tone}`}>
    <span className="truncate">{children}</span>
  </span>
);

export default function TradingCockpitPage() {
  const [state, setState] = useState<CockpitState>(emptyState);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeferredRefreshing, setIsDeferredRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = async () => {
    setIsRefreshing(true);
    const criticalRequests = [
      { label: 'Health', run: alphaEngineApi.health },
      { label: 'Status', run: alphaEngineApi.status },
      { label: 'Runtime', run: alphaEngineApi.runtime },
      { label: 'Strategies', run: alphaEngineApi.evaluations },
      { label: 'BTC market', run: () => alphaEngineApi.marketContext('BTC') }
    ] as const;
    const deferredRequests = [
      { label: 'Polymarket status', run: alphaEngineApi.polymarketBtcStatus },
      { label: 'Polymarket trades', run: () => alphaEngineApi.polymarketBtcTrades(30) },
      { label: 'Equity curve', run: alphaEngineApi.polymarketBtcEquity },
      { label: 'Auto runner', run: alphaEngineApi.polymarketAutoStatus },
      { label: 'Wallet', run: alphaEngineApi.walletOverview },
      { label: 'Strategy lab', run: alphaEngineApi.labOverview },
      { label: 'Macro analysis', run: alphaEngineApi.calendarAnalysis },
      { label: 'Macro calendar', run: alphaEngineApi.calendarWeek },
      { label: 'Macro AI brief', run: alphaEngineApi.calendarWeeklyBrief }
    ] as const;
    const criticalTasks = await Promise.allSettled(criticalRequests.map((request) => request.run()));

    const criticalFailures = formatFailures(criticalTasks.map((task, index) => ({ task, label: criticalRequests[index].label })));

    setState((current) => ({
      ...current,
      health: criticalTasks[0].status === 'fulfilled' ? criticalTasks[0].value as { status: string } : current.health,
      status: criticalTasks[1].status === 'fulfilled' ? criticalTasks[1].value as AlphaEngineStatus : current.status,
      runtime: criticalTasks[2].status === 'fulfilled' ? criticalTasks[2].value as RuntimeStatus : current.runtime,
      evaluations: criticalTasks[3].status === 'fulfilled' ? criticalTasks[3].value as EvaluationSnapshot : current.evaluations,
      market: criticalTasks[4].status === 'fulfilled' ? criticalTasks[4].value as MarketContext : current.market
    }));

    setError(criticalFailures.length > 0 ? criticalFailures.slice(0, 3).join(' | ') : null);
    setUpdatedAt(new Date());
    setIsLoading(false);
    setIsRefreshing(false);

    setIsDeferredRefreshing(true);
    const deferredTasks = await Promise.allSettled(deferredRequests.map((request) => request.run()));
    const deferredFailures = formatFailures(deferredTasks.map((task, index) => ({ task, label: deferredRequests[index].label })));

    setState((current) => ({
      ...current,
      polymarket: deferredTasks[0].status === 'fulfilled' ? deferredTasks[0].value as PolymarketBtcStatus : current.polymarket,
      trades: deferredTasks[1].status === 'fulfilled' ? deferredTasks[1].value as PolymarketTrade[] : current.trades,
      equity: deferredTasks[2].status === 'fulfilled' ? deferredTasks[2].value as EquityPoint[] : current.equity,
      autoRunner: deferredTasks[3].status === 'fulfilled' ? deferredTasks[3].value as AutoRunnerStatus : current.autoRunner,
      wallet: deferredTasks[4].status === 'fulfilled' ? deferredTasks[4].value as WalletOverview : current.wallet,
      lab: deferredTasks[5].status === 'fulfilled' ? deferredTasks[5].value as LabOverview : current.lab,
      calendarAnalysis: deferredTasks[6].status === 'fulfilled' ? deferredTasks[6].value as CalendarAnalysis : current.calendarAnalysis,
      calendarWeek: deferredTasks[7].status === 'fulfilled' ? deferredTasks[7].value as CalendarWeek : current.calendarWeek,
      weeklyBrief: deferredTasks[8].status === 'fulfilled' ? deferredTasks[8].value as WeeklyBrief : current.weeklyBrief
    }));

    if (criticalFailures.length === 0) {
      setError(deferredFailures.length > 0 ? deferredFailures.slice(0, 3).join(' | ') : null);
    }
    setUpdatedAt(new Date());
    setIsDeferredRefreshing(false);
    return { updatedAt: Date.now() };
  };

  const cockpitPoll = useMarketPolling(
    'trading-cockpit:core',
    load,
    { intervalMs: 30_000, staleAfterMs: 75_000 }
  );

  useEffect(() => {
    if (cockpitPoll.status === 'stale' && cockpitPoll.error) {
      setError(cockpitPoll.error);
    }
  }, [cockpitPoll.error, cockpitPoll.status]);

  const equityData = useMemo(() => {
    const points = state.equity.length > 0
      ? state.equity
      : state.evaluations?.leaders?.[0]?.equity_curve_preview ?? [];

    return points.map((point) => {
      const equityPoint = point as EquityPoint;
      return {
        time: relativeTime(point.timestamp),
        value: Number(equityPoint.balance ?? equityPoint.equity ?? equityPoint.total_pnl_usd ?? 0)
      };
    });
  }, [state.equity, state.evaluations]);

  const leaders = state.evaluations?.leaders ?? [];
  const liveEnabled = Boolean(state.polymarket?.liveReadiness.liveEnabled);
  const openTradeCount = state.trades.filter((trade) => trade.status === 'OPEN').length;
  const calendarRisk = state.calendarAnalysis?.analysis.overall_risk ?? 'UNKNOWN';
  const macroAi = state.weeklyBrief?.ai ?? state.calendarAnalysis?.ai;
  const macroProvider = macroAi?.provider === 'deepseek'
    ? 'DeepSeek'
    : macroAi?.provider === 'openai'
      ? 'OpenAI fallback'
      : 'deterministic';
  const usingSecureTunnel = isLocalBackendUrl(alphaEngineApi.baseUrl);
  const tunnelHealthy = usingSecureTunnel && state.health?.status === 'ok';
  const tunnelLabel = usingSecureTunnel
    ? `secure tunnel ${tunnelHealthy ? 'connected' : 'disconnected'}`
    : 'public endpoint';
  const coreOnline = state.health?.status === 'ok' && Boolean(state.status);

  return (
    <div className="min-h-full bg-transparent text-slate-100">
      <div className="glass-header sticky top-0 z-20 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-white">Trading Cockpit</h1>
              <Badge tone={statusTone(state.health?.status)}>{state.health?.status ?? 'connecting'}</Badge>
              <Badge tone={statusTone(liveEnabled ? 'live' : 'audit')}>{liveEnabled ? 'live backend' : 'audit mode'}</Badge>
              <Badge tone={tunnelHealthy ? 'text-cyan-200 bg-cyan-500/10 border-cyan-300/20' : 'text-amber-200 bg-amber-500/10 border-amber-300/20'}>
                {tunnelLabel}
              </Badge>
            </div>
            <div className="mt-1 truncate text-xs text-slate-400">
              {alphaEngineApi.baseUrl} · hf-backend-01 · leonard-489819 · us-central1-a
            </div>
          </div>

          <button
            type="button"
            onClick={() => void cockpitPoll.refresh()}
            disabled={isRefreshing || isDeferredRefreshing}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-400/10 px-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw size={15} className={isRefreshing || isDeferredRefreshing ? 'animate-spin' : ''} />
            {cockpitPoll.status === 'stale' ? 'Refresh Stale' : isDeferredRefreshing && !isRefreshing ? 'Finishing' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {liveEnabled && (
          <div className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0" size={18} />
              <div>
                <div className="font-semibold">Live credentials are enabled on the backend. Desktop execution is locked read-only.</div>
                <div className="mt-1 text-amber-100/80">
                  {usingSecureTunnel
                    ? 'You are connected through the local SSH tunnel. Credentials stay on the VM; the app receives only API responses.'
                    : 'This app is using the public backend endpoint. Switch to the local SSH tunnel before enabling UI execution.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${coreOnline ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-rose-300/25 bg-rose-500/10 text-rose-100'}`}>
            {coreOnline ? 'Partial module load' : 'Backend connection issue'}: {error}
            {!coreOnline && usingSecureTunnel && (
              <div className="mt-2 text-rose-100/80">
                Restart the secure tunnel with <span className="font-mono">npm run backend:tunnel:start</span>, or open <span className="font-mono">open-hedge-fund-station.command</span>, then refresh this cockpit.
              </div>
            )}
            {coreOnline && (
              <div className="mt-2 text-amber-100/80">
                Core trading, BTC context, Polymarket, strategies, and wallet are online. The unavailable module is isolated.
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Shell>
            <SectionHeader
              icon={<Server size={17} />}
              title="Backend Runtime"
              action={<span className="text-xs text-slate-400">{isLoading ? 'Loading core' : isDeferredRefreshing ? 'Loading modules' : `Updated ${relativeTime(updatedAt?.toISOString())}`}</span>}
            />
            <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
              <Stat label="Engine" value={state.status?.engine ?? 'n/a'} />
              <Stat label="Runtime" value={state.runtime?.status ?? 'n/a'} tone="text-emerald-200" />
              <Stat label="Interval" value={fmt(state.runtime?.interval_seconds, '', 's')} />
              <Stat label="Strategies" value={fmt(state.status?.strategy_count)} />
            </div>
          </Shell>

          <Shell>
            <SectionHeader icon={<LockKeyhole size={17} />} title="Execution Guardrails" />
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
              <Stat label="UI execution" value="Blocked" tone="text-rose-200" />
              <Stat label="Auto runner" value={state.autoRunner?.running ? 'Running' : 'Stopped'} tone={state.autoRunner?.running ? 'text-amber-200' : 'text-emerald-200'} />
              <Stat label="Runner mode" value={state.autoRunner?.mode ?? 'n/a'} />
            </div>
          </Shell>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Shell className="xl:col-span-2">
            <SectionHeader icon={<TrendingUp size={17} />} title="BTC Market Context" />
            <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-5">
              <Stat label="Mark" value={fmt(state.market?.mark_px, '$')} tone="text-cyan-100" />
              <Stat label="Mid" value={fmt(state.market?.mid_px, '$')} />
              <Stat label="Oracle" value={fmt(state.market?.oracle_px, '$')} />
              <Stat label="Funding" value={fmt((state.market?.funding ?? 0) * 100, '', '%')} tone={(state.market?.funding ?? 0) >= 0 ? 'text-emerald-200' : 'text-rose-200'} />
              <Stat label="24h notional" value={compact(state.market?.day_ntl_vlm, '$')} />
            </div>
          </Shell>

          <Shell>
            <SectionHeader
              icon={<CalendarDays size={17} />}
              title="Macro Calendar"
              action={
                <Link
                  to="/calendar"
                  className="inline-flex h-8 items-center rounded-md border border-cyan-300/20 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/15"
                >
                  Open Macro
                </Link>
              }
            />
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-300">Risk</span>
                <Badge tone={statusTone(calendarRisk)}>{calendarRisk}</Badge>
              </div>
              <div className="text-sm text-slate-400">
                {state.calendarWeek?.count ?? 0} events · {state.calendarWeek?.timezone ?? 'America/Santiago'} · {macroProvider}
              </div>
              <div className="text-sm text-slate-300">
                {state.weeklyBrief?.brief.executive_summary ?? state.calendarAnalysis?.analysis.recommendations?.[0] ?? 'Calendar unavailable.'}
              </div>
              {state.calendarWeek?.warning && (
                <div className="rounded-md border border-amber-300/20 bg-amber-500/10 p-2 text-xs text-amber-100">
                  {state.calendarWeek.warning}
                </div>
              )}
            </div>
          </Shell>
        </div>

        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[0.9fr_1.1fr]">
          <Shell>
            <SectionHeader icon={<Activity size={17} />} title="Polymarket BTC 5m" />
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Signal" value={state.polymarket?.strategyAssessment?.makerEvaluation?.signal ?? 'n/a'} />
                <Stat label="Confidence" value={fmt(state.polymarket?.strategyAssessment?.makerEvaluation?.confidence, '', '%')} />
                <Stat label="Best bid" value={fmt(state.polymarket?.latestSnapshot?.bestBid)} />
                <Stat label="Best ask" value={fmt(state.polymarket?.latestSnapshot?.bestAsk)} />
              </div>
              <div className="rounded-md border border-white/5 bg-white/[0.015] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-300">Live readiness</span>
                  <Badge tone={statusTone(liveEnabled ? 'live' : 'ok')}>
                    {liveEnabled ? 'backend live-enabled' : 'not live'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                  {Object.entries(state.polymarket?.liveReadiness.checks ?? {}).slice(0, 8).map(([key, value]) => (
                    <div key={key} className="flex min-w-0 items-center justify-between gap-2 rounded border border-white/5 bg-black/20 px-2 py-1.5">
                      <span className="truncate">{key}</span>
                      <span className={value ? 'text-emerald-300' : 'text-slate-500'}>{value ? 'yes' : 'no'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-white/5 bg-white/[0.015] p-3 text-sm text-slate-300">
                {state.polymarket?.strategyAssessment?.researchNotes?.[0] ?? 'No research notes returned.'}
              </div>
            </div>
          </Shell>

          <Shell>
            <SectionHeader icon={<BarChart3 size={17} />} title="Equity / Strategy Curve" />
            <div className="h-[300px] p-4">
              {equityData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityData} margin={{ left: 4, right: 8, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                    <Tooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        color: '#e2e8f0'
                      }}
                    />
                    <Area type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={2} fill="url(#equityFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed border-white/15 text-sm text-slate-500">
                  Waiting for equity data
                </div>
              )}
            </div>
          </Shell>
        </div>

        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.1fr_0.9fr]">
          <Shell>
            <SectionHeader icon={<FlaskConical size={17} />} title="Strategy Ranking" />
            <div className="divide-y divide-white/10">
              {leaders.map((item) => (
                <div key={item.strategy_id} className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[1fr_90px_90px_90px_90px]">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">{item.title}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      <Badge tone={statusTone(item.promotion_state)}>{item.promotion_state}</Badge>
                      <Badge tone="border-slate-400/15 bg-slate-500/10 text-slate-300">{item.dataset_mode ?? 'dataset n/a'}</Badge>
                    </div>
                  </div>
                  <MiniMetric label="Return" value={fmt(item.return_pct, '', '%')} />
                  <MiniMetric label="PF" value={fmt(item.profit_factor)} />
                  <MiniMetric label="Win" value={fmt(item.win_rate_pct, '', '%')} />
                  <MiniMetric label="Trades" value={fmt(item.total_trades)} />
                </div>
              ))}
              {leaders.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">No evaluations returned.</div>
              )}
            </div>
          </Shell>

          <Shell>
            <SectionHeader icon={<Wallet size={17} />} title="Trades / Wallet" />
            <div className="grid grid-cols-2 gap-3 p-4">
              <Stat label="Portfolio" value={fmt(state.wallet?.portfolioValue, '$')} />
              <Stat label="Cash" value={fmt(state.wallet?.cashBalance, '$')} />
              <Stat label="Open trades" value={fmt(openTradeCount)} />
              <Stat label="Total trades" value={fmt(state.trades.length)} />
            </div>
            <div className="max-h-[280px] overflow-auto border-t border-white/10">
              <table className="w-full table-fixed text-left text-xs">
                <thead className="sticky top-0 bg-slate-950 text-slate-400">
                  <tr>
                    <th className="w-[82px] px-4 py-2 font-semibold">Time</th>
                    <th className="px-4 py-2 font-semibold">Market</th>
                    <th className="w-[84px] px-4 py-2 font-semibold">Side</th>
                    <th className="w-[84px] px-4 py-2 font-semibold">Mode</th>
                    <th className="w-[84px] px-4 py-2 text-right font-semibold">PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {state.trades.map((trade) => (
                    <tr key={trade.id} className="text-slate-300">
                      <td className="px-4 py-2">{relativeTime(trade.createdAt)}</td>
                      <td className="truncate px-4 py-2">{trade.slug}</td>
                      <td className="px-4 py-2">{trade.side}</td>
                      <td className="px-4 py-2">
                        <Badge tone={statusTone(trade.mode)}>{trade.mode}</Badge>
                      </td>
                      <td className={`px-4 py-2 text-right ${(trade.netPnlUsd ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {fmt(trade.netPnlUsd, '$')}
                      </td>
                    </tr>
                  ))}
                  {state.trades.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        No persisted BTC 5m trades yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Shell>
        </div>

        <Shell>
          <SectionHeader icon={<ShieldCheck size={17} />} title="Audit Notes" />
          <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-3">
            <AuditItem icon={<LockKeyhole size={16} />} title="Desktop mutators blocked" text="Run-once, auto-start, auto-stop, close-trade, runner-start and promote are disabled in the client." />
            <AuditItem icon={<AlertTriangle size={16} />} title="Credential boundary" text="Secrets stay on hf-backend-01. The desktop app should connect through 127.0.0.1:18500 via SSH tunnel." />
            <AuditItem icon={<Clock size={16} />} title="Cloud compute first" text="Backtests and recurring evaluations stay on hf-backend-01; this Mac app is the control surface." />
          </div>
        </Shell>
      </div>
    </div>
  );
}

const MiniMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className="truncate text-sm font-semibold text-slate-200">{value}</div>
  </div>
);

const AuditItem: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({ icon, title, text }) => (
  <div className="rounded-md border border-white/5 bg-white/[0.015] p-3 transition-colors hover:bg-white/[0.03]">
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
      <span className="text-cyan-200">{icon}</span>
      <span>{title}</span>
    </div>
    <div className="mt-2 text-sm leading-5 text-slate-400">{text}</div>
  </div>
);
