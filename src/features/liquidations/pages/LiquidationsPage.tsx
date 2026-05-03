import { type CSSProperties, type ReactNode } from 'react';
import { Activity, AlertTriangle, Clock3, Database, Radar, Shield, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useLiquidations } from '@/contexts/LiquidationsContext';
import LiquidationsChart from '../components/LiquidationsChart';
import LiquidationsTimeline from '../components/LiquidationsTimeline';
import { buildSnapshotTrapDecisions, type TrapAction, type TrapSide } from '../trapDecisions';

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) {
    return 'No snapshot';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Invalid time';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function sideLabel(side: string | null | undefined) {
  if (side === 'longs' || side === 'longs-at-risk') {
    return 'Longs at risk';
  }
  if (side === 'shorts' || side === 'shorts-at-risk') {
    return 'Shorts at risk';
  }
  return 'Balanced';
}

function sideTone(side: string | null | undefined) {
  if (side === 'longs' || side === 'longs-at-risk') {
    return 'text-rose-200';
  }
  if (side === 'shorts' || side === 'shorts-at-risk') {
    return 'text-emerald-200';
  }
  return 'text-white';
}

function sideVarColor(side: TrapSide | string | null | undefined) {
  if (side === 'longs' || side === 'longs-at-risk') {
    return 'var(--app-negative)';
  }
  if (side === 'shorts' || side === 'shorts-at-risk') {
    return 'var(--app-positive)';
  }
  return 'var(--app-text)';
}

function riskTone(risk: string | null | undefined) {
  if (risk === 'high') {
    return 'text-rose-200';
  }
  if (risk === 'medium') {
    return 'text-amber-200';
  }
  return 'text-emerald-200';
}

function inferenceCopy(signal: string | undefined, dominantSide: string) {
  if (signal === 'long') {
    return 'Priority is short-squeeze confirmation: bid holding, breakout follow-through, and forced cover evidence.';
  }
  if (signal === 'short') {
    return 'Priority is long-flush confirmation: failed bounces, support loss, and sellers pressing lows.';
  }
  if (dominantSide === 'balanced') {
    return 'No side is concentrated enough for action. Keep this as context and wait for pressure to cluster.';
  }
  return 'Use the decision queue to decide what to watch first, then confirm structure before paper action.';
}

export default function LiquidationsPage() {
  const { stats, insights, snapshots, recentAlerts, error, isConnected, isLoading, isStale } = useLiquidations();
  const latestSnapshot = snapshots[0];
  const previousSnapshot = snapshots[1];
  const topMarkets = latestSnapshot?.top_markets || [];
  const dominantSide = stats?.liquidations_1h.dominant_side || 'balanced';
  const pressureDelta = latestSnapshot && previousSnapshot ? latestSnapshot.total_usd - previousSnapshot.total_usd : null;
  const hasData = Boolean(latestSnapshot || stats);
  const decisionQueue = buildSnapshotTrapDecisions(topMarkets, 8);

  if (isLoading && !hasData) {
    return (
      <Shell>
        <Panel title="Estimated liquidation pressure">
          <div className="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
            <div>
              <Activity className="mx-auto h-7 w-7 animate-pulse text-[var(--app-accent)]" />
              <div className="mt-4 text-sm font-semibold text-[var(--app-text)]">Loading gateway snapshot</div>
              <div className="mt-1 text-xs text-[var(--app-muted)]">Waiting for estimated pressure data from the Hyperliquid gateway.</div>
            </div>
          </div>
        </Panel>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4 shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-accent)]">Estimated liquidation pressure</div>
              <StatusPill tone={isConnected ? 'good' : isStale ? 'warn' : 'bad'}>
                {isConnected ? 'Gateway live' : isStale ? 'Stale snapshot' : 'Gateway offline'}
              </StatusPill>
            </div>
            <h1 className="mt-2 max-w-4xl text-2xl font-semibold leading-tight text-[var(--app-text)]">
              Review which side is at risk, where estimated pressure is concentrated, and what evidence supports it.
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--app-muted)]">
              These are gateway-derived pressure estimates from market state, not confirmed trade-by-trade liquidation prints. Use them as a review surface before checking structure, liquidity, and execution quality.
            </p>
          </div>
          <div className="grid min-w-[260px] gap-2 text-xs text-[var(--app-muted)] sm:grid-cols-2">
            <HeaderFact icon={<Clock3 className="h-3.5 w-3.5" />} label="Gateway snapshot" value={formatTime(latestSnapshot?.timestamp)} />
            <HeaderFact icon={<Database className="h-3.5 w-3.5" />} label="Snapshots" value={String(stats?.total_snapshots ?? snapshots.length)} />
            <HeaderFact icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Alerts" value={String(stats?.total_alerts ?? recentAlerts.length)} />
            <HeaderFact icon={<Radar className="h-3.5 w-3.5" />} label="Sentiment" value={stats?.current_sentiment || 'N/A'} />
          </div>
        </div>

        {error ? (
          <div className={`mt-4 rounded-lg border p-3 text-sm ${isStale ? 'border-amber-500/25 bg-amber-500/10 text-amber-100' : 'border-rose-500/25 bg-rose-500/10 text-rose-100'}`}>
            {isStale ? 'Refresh failed. Showing the last successful gateway snapshot. ' : ''}
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatCard label="Pressure estimate" value={formatUsd(stats?.liquidations_1h.total_usd ?? latestSnapshot?.total_usd)} icon={<Activity className="h-4 w-4" />} />
          <StatCard label="Longs at risk" value={formatUsd(stats?.liquidations_1h.longs_usd ?? latestSnapshot?.longs_usd)} icon={<TrendingDown className="h-4 w-4" />} tone="short" />
          <StatCard label="Shorts at risk" value={formatUsd(stats?.liquidations_1h.shorts_usd ?? latestSnapshot?.shorts_usd)} icon={<TrendingUp className="h-4 w-4" />} tone="long" />
          <StatCard label="Cascade risk" value={(stats?.cascade_risk || insights?.cascade_risk || 'N/A').toUpperCase()} icon={<Shield className="h-4 w-4" />} tone={stats?.cascade_risk === 'high' ? 'short' : stats?.cascade_risk === 'medium' ? 'warn' : 'long'} />
        </div>
      </section>

      <Panel
        title="Decision queue"
        subtitle="Ranked by pressure, matching bias, funding crowding, and price stress. Confirm before acting."
      >
        {decisionQueue.length === 0 ? (
          <EmptyState title="No concentrated pressure yet" copy="The latest gateway snapshot did not include reviewable top markets." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--app-border)]">
            <div className="hidden grid-cols-[84px_96px_128px_118px_minmax(180px,1fr)_minmax(210px,1.15fr)_minmax(190px,1fr)] gap-3 border-b border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-subtle)] lg:grid">
              <div>Market</div>
              <div>Action</div>
              <div>Side at risk</div>
              <div>Pressure</div>
              <div>Evidence</div>
              <div>Confirmation</div>
              <div>Risk</div>
            </div>
            <div className="divide-y divide-[var(--app-border)]">
              {decisionQueue.map((decision) => (
                <div key={`${decision.symbol}-${decision.sideAtRisk}`} className="grid min-w-0 gap-3 bg-[var(--app-panel-muted)] px-3 py-3 lg:grid-cols-[84px_96px_128px_118px_minmax(180px,1fr)_minmax(210px,1.15fr)_minmax(190px,1fr)] lg:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-[var(--app-text)]">{decision.symbol}</div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--app-subtle)]">score {Math.round(decision.priorityScore)}</div>
                  </div>
                  <ActionBadge action={decision.action} />
                  <LabeledValue label="Side" value={sideLabel(decision.sideAtRisk)} style={{ color: sideVarColor(decision.sideAtRisk) }} />
                  <LabeledValue label="Pressure" value={formatUsd(decision.pressureUsd)} />
                  <TextCell label="Evidence" value={decision.evidence} />
                  <TextCell label="Confirm" value={decision.confirmation} />
                  <TextCell label="Risk" value={decision.risk} />
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
        <div className="min-w-0">
          <LiquidationsChart />
        </div>
        <div className="grid min-w-0 gap-4">
          <Panel title="Facts vs inference" subtitle="Keep source data separate from interpretation.">
            <div className="grid gap-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-subtle)]">Backend facts</div>
                <div className="mt-3 grid gap-2 text-sm text-[var(--app-muted)]">
                  <FactLine label="Dominant side" value={sideLabel(dominantSide)} valueClassName={sideTone(dominantSide)} />
                  <FactLine label="Long/short ratio" value={stats ? stats.liquidations_1h.ratio_long_short.toFixed(2) : 'N/A'} />
                  <FactLine label="Pressure change" value={pressureDelta === null ? 'N/A' : `${pressureDelta >= 0 ? '+' : '-'}${formatUsd(Math.abs(pressureDelta))}`} valueClassName={pressureDelta !== null && pressureDelta >= 0 ? 'text-amber-200' : 'text-emerald-200'} />
                  <FactLine label="Markets long-risk" value={String(latestSnapshot?.num_longs ?? 'N/A')} />
                  <FactLine label="Markets short-risk" value={String(latestSnapshot?.num_shorts ?? 'N/A')} />
                </div>
              </div>

              <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-accent-soft)] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-accent)]">UI inference</div>
                <div className="mt-2 text-lg font-semibold text-[var(--app-text)]">{(insights?.trading_signal || 'neutral').toUpperCase()}</div>
                <div className="mt-1 text-sm leading-6 text-[var(--app-muted)]">{inferenceCopy(insights?.trading_signal, dominantSide)}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <MiniStat label="Confidence" value={(insights?.confidence || 'N/A').toUpperCase()} icon={<Target className="h-4 w-4" />} />
                <MiniStat label="Cascade risk" value={(insights?.cascade_risk || stats?.cascade_risk || 'N/A').toUpperCase()} icon={<AlertTriangle className={`h-4 w-4 ${riskTone(insights?.cascade_risk || stats?.cascade_risk)}`} />} />
              </div>

              <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-subtle)]">Why it reads this way</div>
                <div className="mt-3 grid gap-2">
                  {(insights?.reasoning.length ? insights.reasoning : ['No gateway inference available for the current snapshot.']).map((reason, index) => (
                    <div key={`${reason}-${index}`} className="text-sm leading-6 text-[var(--app-muted)]">
                      {reason}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <LiquidationsTimeline />
        </div>
      </div>

      {!error && recentAlerts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-panel-muted)] p-5 text-center text-sm text-[var(--app-muted)]">
          No recent gateway alerts.
        </div>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-[var(--app-bg)] p-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">{children}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-subtle)]">{title}</div>
          {subtitle ? <div className="mt-1 text-xs leading-5 text-[var(--app-muted)]">{subtitle}</div> : null}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatCard({ label, value, icon, tone = 'neutral' }: { label: string; value: string; icon: ReactNode; tone?: 'neutral' | 'long' | 'short' | 'warn' }) {
  const toneClass =
    tone === 'long' ? 'text-[var(--app-positive)]' : tone === 'short' ? 'text-[var(--app-negative)]' : tone === 'warn' ? 'text-[var(--app-warning)]' : 'text-[var(--app-text)]';
  return (
    <div className="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3">
      <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-subtle)]">
        <span className="truncate">{label}</span>
        <span className={toneClass}>{icon}</span>
      </div>
      <div className={`mt-2 truncate text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function HeaderFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-subtle)]">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-[var(--app-text)]" title={value}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: 'good' | 'warn' | 'bad'; children: ReactNode }) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
      : tone === 'warn'
        ? 'border-amber-500/25 bg-amber-500/10 text-amber-100'
        : 'border-rose-500/25 bg-rose-500/10 text-rose-100';
  return <div className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${toneClass}`}>{children}</div>;
}

function actionColor(action: TrapAction) {
  if (action === 'Confirm') return 'var(--app-positive)';
  if (action === 'Watch') return 'var(--app-warning)';
  return 'var(--app-subtle)';
}

function actionBackground(action: TrapAction) {
  if (action === 'Confirm') return 'var(--app-positive-soft)';
  if (action === 'Watch') return 'var(--app-warning-soft)';
  return 'var(--app-panel-muted)';
}

function LabeledValue({ label, value, className = 'text-[var(--app-text)]', style }: { label: string; value: string; className?: string; style?: CSSProperties }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-subtle)] lg:hidden">{label}</div>
      <div className={`truncate text-sm font-semibold ${className}`} style={style} title={value}>
        {value}
      </div>
    </div>
  );
}

function TextCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-subtle)] lg:hidden">{label}</div>
      <div className="text-sm leading-5 text-[var(--app-muted)] lg:line-clamp-2" title={value}>
        {value}
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: TrapAction }) {
  return (
    <div
      className="w-fit rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]"
      style={{
        borderColor: actionColor(action),
        background: actionBackground(action),
        color: actionColor(action)
      }}
    >
      {action}
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3">
      <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-subtle)]">
        <span className="truncate">{label}</span>
        <span className="text-[var(--app-muted)]">{icon}</span>
      </div>
      <div className="mt-2 truncate text-sm font-semibold text-[var(--app-text)]">{value}</div>
    </div>
  );
}

function FactLine({ label, value, valueClassName = 'text-white' }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate text-[var(--app-muted)]">{label}</span>
      <span className={`max-w-[60%] truncate text-right font-semibold ${valueClassName}`} title={value}>
        {value}
      </span>
    </div>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-panel-muted)] p-5">
      <div className="text-sm font-semibold text-[var(--app-text)]">{title}</div>
      <div className="mt-1 text-sm text-[var(--app-muted)]">{copy}</div>
    </div>
  );
}
