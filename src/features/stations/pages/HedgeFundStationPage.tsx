import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Bot,
  Database,
  FlaskConical,
  HeartPulse,
  ListChecks,
  Play,
  RefreshCw,
  ShieldCheck,
  Terminal,
  TriangleAlert,
  XCircle
} from 'lucide-react';
import {
  hyperliquidService,
  type HyperliquidAppReadiness,
  type HyperliquidHedgeFundStationSnapshot,
  type HyperliquidReadinessCheck,
  type HyperliquidStrategyAuditRow
} from '@/services/hyperliquidService';
import { useTerminalContext } from '@/contexts/TerminalContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useDeskSpaceContext } from '@/features/desks/DeskSpaceContext';
import { useMarketPolling } from '@/hooks/useMarketPolling';
import { navigateCenterPanel } from '@/utils/centerNavigation';

const COMMANDS = [
  'npm run hf:doctor',
  'npm run hf:status',
  'npm run hf:backtest',
  'npm run hf:validate',
  'npm run gateway:probe'
];

const MODULE_LINKS = [
  { label: 'Strategy Pipeline', to: '/strategies', icon: FlaskConical },
  { label: 'Audit Focus', to: '/strategy-audit', icon: ShieldCheck },
  { label: 'Paper', to: '/paper', icon: ListChecks },
  { label: 'Desk Space', to: '/workbench', icon: Bot },
  { label: 'Data', to: '/data', icon: Database },
  { label: 'Terminals', to: '/terminals', icon: Terminal }
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatTime(value: number | null | undefined): string {
  if (!value) {
    return 'N/D';
  }
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function countStage(strategies: HyperliquidStrategyAuditRow[], stage: HyperliquidStrategyAuditRow['pipelineStage']): number {
  return strategies.filter((strategy) => strategy.pipelineStage === stage).length;
}

function readinessLabel(readiness: HyperliquidAppReadiness | null | undefined): string {
  if (!readiness) {
    return 'Readiness unknown';
  }
  if (readiness.overallStatus === 'ready') {
    return 'Daily ready';
  }
  if (readiness.overallStatus === 'blocked') {
    return 'Blocked';
  }
  return 'Needs attention';
}

export default function HedgeFundStationPage() {
  const { activeWorkspace } = useWorkspaceContext();
  const { createTerminal } = useTerminalContext();
  const { setDeskState } = useDeskSpaceContext();
  const stationPoll = useMarketPolling(
    'station:hedge-fund',
    (): Promise<HyperliquidHedgeFundStationSnapshot> => hyperliquidService.getHedgeFundStationSnapshot(500),
    { intervalMs: 30_000, staleAfterMs: 90_000 }
  );
  const readinessPoll = useMarketPolling(
    'station:hedge-fund:readiness',
    (): Promise<HyperliquidAppReadiness> => hyperliquidService.getAppReadiness(500),
    { intervalMs: 30_000, staleAfterMs: 90_000 }
  );

  const snapshot = stationPoll.data;
  const readiness = readinessPoll.data;
  const audit = snapshot?.audit ?? null;
  const health = snapshot?.health ?? null;
  const strategies = audit?.strategies ?? [];
  const realStrategies = useMemo(() => (
    strategies.filter((strategy) => !strategy.strategyId.startsWith('runtime:'))
  ), [strategies]);
  const summary = audit?.summary;

  const stageCounts = useMemo(() => ({
    research: countStage(realStrategies, 'research'),
    backtested: countStage(realStrategies, 'backtesting'),
    validated: countStage(realStrategies, 'audit'),
    paper: countStage(realStrategies, 'paper'),
    blocked: countStage(realStrategies, 'blocked')
  }), [realStrategies]);

  const openGaps = useMemo(() => {
    return realStrategies.reduce((total, strategy) => total + (strategy.gateReasons.length || strategy.missingAuditItems.length), 0);
  }, [realStrategies]);

  const topGaps = useMemo(() => {
    return realStrategies
      .filter((strategy) => strategy.gateReasons.length > 0 || strategy.missingAuditItems.length > 0)
      .slice()
      .sort((a, b) => (b.gateReasons.length || b.missingAuditItems.length) - (a.gateReasons.length || a.missingAuditItems.length))
      .slice(0, 5);
  }, [realStrategies]);

  const launchCommand = (command: string) => {
    const cwd = activeWorkspace?.path || '/Users/optimus/Documents/New project 9';
    const shell = activeWorkspace?.shell || '/bin/zsh';
    createTerminal(cwd, shell, `HF: ${command}`, command, { workspaceId: activeWorkspace?.id });
    if (activeWorkspace?.id) {
      setDeskState(activeWorkspace.id, { activeView: 'terminals' });
    }
    navigateCenterPanel('/workbench');
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5">
      <section className="border-b border-white/10 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">Fixed Trading Station</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Hedge Fund Station</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Research OS for strategies, validation evidence, paper readiness, agents, and stable backend commands.
            </p>
          </div>
          <div className={`rounded-md border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] ${
            readiness?.overallStatus === 'ready'
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
              : readiness?.overallStatus === 'blocked'
                ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
          }`}>
            {readinessLabel(readiness)}
          </div>
        </div>
        {stationPoll.error || readinessPoll.error || snapshot?.errors.length || readiness?.errors.length ? (
          <div className="mt-4 rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
            {[
              stationPoll.error,
              readinessPoll.error,
              ...(snapshot?.errors || []),
              ...(readiness?.errors || [])
            ].filter(Boolean).join(' | ')}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title="Daily Pre-Flight"
          action={
            <button
              type="button"
              onClick={() => void readinessPoll.refresh()}
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/[0.08]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          }
        >
          <div className="grid gap-2 md:grid-cols-2">
            {(readiness?.checks || []).slice(0, 8).map((check) => (
              <ReadinessRow key={check.id} check={check} onCommand={launchCommand} />
            ))}
            {!readiness && readinessPoll.status === 'loading' ? (
              <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
                Loading daily readiness...
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Daily Commands">
          <div className="grid gap-2">
            {(readiness?.dailyCommands.length ? readiness.dailyCommands : COMMANDS.map((command) => ({ label: command, command }))).map((item) => (
              <button
                key={item.command}
                type="button"
                onClick={() => launchCommand(item.command)}
                className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-3 text-left text-sm text-white transition hover:border-emerald-400/30 hover:bg-emerald-500/10"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-white/80">{item.label}</span>
                  <span className="mt-1 block truncate font-mono text-xs text-slate-400">{item.command}</span>
                </span>
                <Play className="h-4 w-4 shrink-0 text-emerald-300" />
              </button>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Strategies" value={String(readiness?.summary.strategyCount ?? realStrategies.length)} detail={`${stageCounts.validated} audit eligible`} icon={<FlaskConical className="h-4 w-4" />} />
        <Metric label="Paper Runtime" value={String(stageCounts.paper)} detail={`${summary?.openTrades ?? 0} open paper trades`} icon={<Activity className="h-4 w-4" />} tone="text-emerald-200" />
        <Metric label="Open Gaps" value={formatCompact(openGaps)} detail={`${stageCounts.blocked} validation blocked`} icon={<XCircle className="h-4 w-4" />} tone={openGaps > 0 ? 'text-amber-200' : 'text-emerald-200'} />
        <Metric label="Review Coverage" value={`${Math.round(summary?.reviewCoverage ?? 0)}%`} detail={`${summary?.reviewedTrades ?? 0}/${summary?.reviewableClosedTrades ?? 0} closed reviewed`} icon={<CheckCircle2 className="h-4 w-4" />} tone="text-cyan-200" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="grid gap-4">
          <Panel title="Lifecycle Board" action={<LinkButton to="/strategy-audit" label="Open audit" />}>
            <div className="grid gap-3 md:grid-cols-5">
              <StagePill label="Research" value={stageCounts.research} />
              <StagePill label="Backtesting" value={stageCounts.backtested} />
              <StagePill label="Audit" value={stageCounts.validated} />
              <StagePill label="Paper" value={stageCounts.paper} />
              <StagePill label="Blocked" value={stageCounts.blocked} tone="warning" />
            </div>
          </Panel>

          <Panel title="Stable Commands">
            <div className="grid gap-2 md:grid-cols-2">
              {COMMANDS.map((command) => (
                <button
                  key={command}
                  type="button"
                  onClick={() => launchCommand(command)}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-3 text-left text-sm text-white transition hover:border-emerald-400/30 hover:bg-emerald-500/10"
                >
                  <span className="truncate font-mono text-xs text-slate-200">{command}</span>
                  <Play className="h-4 w-4 shrink-0 text-emerald-300" />
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div className="grid gap-4">
          <Panel title="Modules">
            <div className="grid gap-2">
              {MODULE_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white/80 transition hover:border-cyan-400/30 hover:bg-cyan-500/10"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <item.icon className="h-4 w-4 shrink-0 text-cyan-200" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-white/40" />
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="Open Validation Gaps">
            {topGaps.length === 0 ? (
              <div className="rounded-md border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                No missing audit items in the current snapshot.
              </div>
            ) : (
              <div className="grid gap-2">
                {topGaps.map((strategy) => (
                  <div key={strategy.strategyKey} className="rounded-md border border-white/10 bg-black/25 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-semibold text-white">{strategy.displayName}</div>
                      <div className="shrink-0 rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-100">
                        {strategy.gateReasons.length || strategy.missingAuditItems.length}
                      </div>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-slate-400">
                      {(strategy.gateReasons.length ? strategy.gateReasons : strategy.missingAuditItems).slice(0, 3).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric label="Gateway Cache" value={health?.cacheWarm ? 'Warm' : 'Cold'} detail={`Updated ${formatTime(health?.cacheUpdatedAt)}`} icon={<HeartPulse className="h-4 w-4" />} />
        <Metric label="Evidence Trades" value={formatCompact(summary?.tradeCount ?? 0)} detail={`${summary?.backtestTrades ?? 0} backtest | ${summary?.paperTrades ?? 0} paper`} icon={<Database className="h-4 w-4" />} />
        <Metric label="Total PnL" value={formatCurrency(summary?.totalPnlUsd ?? 0)} detail={`${formatCurrency(summary?.openRiskUsd ?? 0)} open paper risk`} icon={<Activity className="h-4 w-4" />} tone={(summary?.totalPnlUsd ?? 0) >= 0 ? 'text-emerald-200' : 'text-rose-200'} />
      </section>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md border border-white/10 bg-black/25 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">{title}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  tone = 'text-white'
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
        <span>{label}</span>
        <span className="text-white/35">{icon}</span>
      </div>
      <div className={`mt-3 text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-slate-400">{detail}</div>
    </div>
  );
}

function readinessTone(status: string): string {
  if (status === 'ready') {
    return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100';
  }
  if (status === 'blocked') {
    return 'border-rose-400/20 bg-rose-500/10 text-rose-100';
  }
  return 'border-amber-400/20 bg-amber-500/10 text-amber-100';
}

function ReadinessRow({ check, onCommand }: { check: HyperliquidReadinessCheck; onCommand: (command: string) => void }) {
  return (
    <div className={`rounded-md border p-3 ${readinessTone(check.status)}`}>
      <div className="flex items-start gap-3">
        {check.status === 'ready'
          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-white">{check.label}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">{check.status}</div>
          </div>
          <div className="mt-1 text-xs leading-5 text-white/65">{check.detail}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {check.route && check.actionLabel ? (
              <Link to={check.route} className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-white/80 transition hover:bg-white/[0.1]">
                {check.actionLabel}
              </Link>
            ) : null}
            {check.command ? (
              <button
                type="button"
                onClick={() => onCommand(check.command || '')}
                className="rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-xs text-white/70 transition hover:bg-white/[0.08]"
              >
                {check.command}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StagePill({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warning' }) {
  return (
    <div className={`rounded-md border p-3 ${
      tone === 'warning'
        ? 'border-amber-400/25 bg-amber-500/10'
        : 'border-white/10 bg-white/[0.03]'
    }`}>
      <div className="text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 truncate text-[11px] font-bold uppercase tracking-[0.12em] text-white/45">{label}</div>
    </div>
  );
}

function LinkButton({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/[0.08]">
      {label}
    </Link>
  );
}
