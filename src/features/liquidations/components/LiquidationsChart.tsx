import { type ReactNode } from 'react';
import { Activity, Database } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLiquidations } from '@/contexts/LiquidationsContext';

const WINDOW_OPTIONS = [1, 4, 24, 72];

function formatUsd(value: number | null | undefined) {
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

function formatAxis(value: number) {
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(0)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return String(Math.round(value));
}

function formatTime(value: string, hours: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Invalid';
  }
  if (hours >= 24) {
    return date.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function coverageCopy(label: string | undefined, pointCount: number | undefined) {
  if (label === 'good') {
    return `${pointCount ?? 0} points`;
  }
  if (label === 'thin') {
    return `Thin: ${pointCount ?? 0} points`;
  }
  return `Insufficient: ${pointCount ?? 0} points`;
}

export default function LiquidationsChart() {
  const { chartData, chartHours, setChartHours } = useLiquidations();
  const metadata = chartData?.metadata;
  const pointCount = metadata?.pointCount ?? chartData?.timestamps.length ?? 0;

  const chartRows = (chartData?.timestamps || []).map((timestamp, index) => ({
    timestamp,
    time: formatTime(timestamp, chartHours),
    total: chartData?.total[index] ?? 0,
    longs: chartData?.longs[index] ?? 0,
    shorts: chartData?.shorts[index] ?? 0
  }));

  const latest = chartRows[chartRows.length - 1];
  const previous = chartRows[chartRows.length - 2];
  const delta = latest && previous ? latest.total - previous.total : null;
  const peak = chartRows.reduce((max, row) => Math.max(max, row.total), 0);
  const imbalance = latest && latest.total > 0 ? ((latest.shorts - latest.longs) / latest.total) * 100 : 0;
  const dominantSide = !latest ? 'Balanced' : imbalance >= 12 ? 'Shorts at risk' : imbalance <= -12 ? 'Longs at risk' : 'Balanced';
  const coverageLabel = metadata?.coverageLabel ?? 'insufficient';
  const coverageTone = coverageLabel === 'good' ? 'long' : coverageLabel === 'thin' ? 'warn' : 'short';

  if (chartRows.length < 2) {
    return (
      <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <ChartHeader chartHours={chartHours} coverageLabel={coverageLabel} pointCount={pointCount} setChartHours={setChartHours} />
        <div className="mt-4 rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-panel-muted)] p-5 text-sm leading-6 text-[var(--app-muted)]">
          Need at least two SQLite aggregate snapshots inside the selected {chartHours}h window to draw a useful pressure curve. This keeps the chart honest when the gateway has not collected enough history yet.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
      <ChartHeader chartHours={chartHours} coverageLabel={coverageLabel} pointCount={pointCount} setChartHours={setChartHours} />

      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Current estimate" value={formatUsd(latest.total)} />
        <MetricCard label="Longs at risk" value={formatUsd(latest.longs)} tone="short" />
        <MetricCard label="Shorts at risk" value={formatUsd(latest.shorts)} tone="long" />
        <MetricCard label="Last change" value={delta === null ? 'N/A' : `${delta >= 0 ? '+' : '-'}${formatUsd(Math.abs(delta))}`} tone={delta !== null && delta >= 0 ? 'amber' : 'neutral'} />
        <MetricCard label="Peak pressure" value={formatUsd(peak)} />
        <MetricCard label="Data coverage" value={coverageCopy(coverageLabel, pointCount)} tone={coverageTone} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="h-[310px] rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pressureTotal" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--app-accent)" stopOpacity={0.24} />
                  <stop offset="100%" stopColor="var(--app-accent)" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="pressureLongs" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--app-negative)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--app-negative)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="pressureShorts" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--app-positive)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--app-positive)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={22} />
              <YAxis tickFormatter={formatAxis} tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                contentStyle={{
                  background: 'var(--app-surface)',
                  border: '1px solid var(--app-border)',
                  borderRadius: 8,
                  color: '#fff'
                }}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { timestamp?: string } | undefined;
                  return row?.timestamp ? formatTime(row.timestamp, 72) : '';
                }}
                formatter={(value, name) => [formatUsd(Number(value ?? 0)), name]}
              />
              <Area type="monotone" dataKey="total" name="Total pressure" stroke="var(--app-accent)" strokeWidth={2.2} fill="url(#pressureTotal)" />
              <Area type="monotone" dataKey="longs" name="Longs at risk" stroke="var(--app-negative)" strokeWidth={1.8} fill="url(#pressureLongs)" />
              <Area type="monotone" dataKey="shorts" name="Shorts at risk" stroke="var(--app-positive)" strokeWidth={1.8} fill="url(#pressureShorts)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-subtle)]">Side imbalance</div>
          <div className={`mt-2 text-2xl font-semibold ${imbalance >= 12 ? 'text-emerald-200' : imbalance <= -12 ? 'text-rose-200' : 'text-[var(--app-text)]'}`}>
            {imbalance >= 0 ? '+' : ''}{imbalance.toFixed(0)}%
          </div>
          <div className="mt-1 text-sm text-[var(--app-muted)]">{dominantSide}</div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${imbalance >= 0 ? 'bg-[var(--app-positive)]' : 'bg-[var(--app-negative)]'}`}
              style={{ width: `${Math.min(100, Math.max(4, Math.abs(imbalance)))}%` }}
            />
          </div>
          <div className="mt-4 text-xs leading-5 text-[var(--app-muted)]">
            Estimated pressure from gateway market state, not confirmed liquidation prints.
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-subtle)]">
            <Database className="h-3.5 w-3.5" />
            {metadata?.source || 'sqlite_aggregate_snapshots'}
          </div>
        </div>
      </div>
    </section>
  );
}

function ChartHeader({ chartHours, coverageLabel, pointCount, setChartHours }: { chartHours: number; coverageLabel: string; pointCount: number; setChartHours: (hours: number) => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-subtle)]">Pressure curve</div>
        <div className="mt-1 max-w-2xl text-xs leading-5 text-[var(--app-muted)]">
          Longs, shorts, and total estimated pressure from SQLite aggregate history. Estimated pressure from gateway market state, not confirmed liquidation prints.
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Pill icon={<Activity className="h-3.5 w-3.5" />} label={coverageCopy(coverageLabel, pointCount)} tone={coverageLabel === 'good' ? 'long' : coverageLabel === 'thin' ? 'warn' : 'short'} />
        <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)]">
          {WINDOW_OPTIONS.map((hours) => (
            <button
              key={hours}
              type="button"
              className={`h-8 min-w-11 px-3 text-xs font-semibold transition ${chartHours === hours ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]' : 'text-[var(--app-muted)] hover:bg-white/5 hover:text-[var(--app-text)]'}`}
              onClick={() => setChartHours(hours)}
            >
              {hours}h
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'long' | 'short' | 'amber' | 'warn' }) {
  const toneClass =
    tone === 'long'
      ? 'text-emerald-200'
      : tone === 'short'
        ? 'text-rose-200'
        : tone === 'amber' || tone === 'warn'
          ? 'text-amber-200'
          : 'text-[var(--app-text)]';
  return (
    <div className="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-2.5">
      <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-subtle)]">{label}</div>
      <div className={`mt-2 truncate text-base font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function Pill({ icon, label, tone }: { icon: ReactNode; label: string; tone: 'neutral' | 'long' | 'short' | 'warn' }) {
  const toneClass =
    tone === 'long'
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
      : tone === 'short'
        ? 'border-rose-500/25 bg-rose-500/10 text-rose-100'
        : tone === 'warn'
          ? 'border-amber-500/25 bg-amber-500/10 text-amber-100'
          : 'border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[var(--app-muted)]';
  return (
    <div className={`flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${toneClass}`}>
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}
