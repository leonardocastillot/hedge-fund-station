import { type ReactNode } from 'react';
import { Activity, TrendingDown, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLiquidations } from '../contexts/LiquidationsContext';

function formatUsd(value: number) {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatAxis(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(0)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return String(Math.round(value));
}

function formatPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`;
}

export default function LiquidationsChart() {
  const { snapshots } = useLiquidations();

  const chartData = snapshots
    .slice(0, 36)
    .reverse()
    .map((snapshot) => {
      const total = snapshot.total_usd || 0;
      const imbalance = total === 0 ? 0 : ((snapshot.shorts_usd - snapshot.longs_usd) / total) * 100;
      return {
        time: new Date(snapshot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        total,
        longs: snapshot.longs_usd,
        shorts: snapshot.shorts_usd,
        imbalance
      };
    });

  const latest = chartData[chartData.length - 1];
  const previous = chartData[chartData.length - 2];
  const delta = latest && previous ? latest.total - previous.total : 0;
  const dominantSide = !latest ? 'Balanceado' : latest.imbalance >= 12 ? 'Shorts en riesgo' : latest.imbalance <= -12 ? 'Longs en riesgo' : 'Balanceado';
  const pressureRegime = !latest ? 'Construyendose' : latest.total >= 120_000_000 ? 'Riesgo de cascada alto' : latest.total >= 60_000_000 ? 'Presion en aumento' : 'Presion contenida';

  if (chartData.length < 2) {
    return (
      <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Curva de Presion</div>
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-white/55">
          Esperando suficientes snapshots de liquidaciones para construir la curva de presion.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Curva de Presion</div>
          <div className="mt-1 text-sm text-white/65">Presion total mas desbalance entre lados. Sirve para ver si el crowding esta creciendo o descargandose.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill icon={<Activity className="h-3.5 w-3.5" />} label={pressureRegime} tone="neutral" />
          <Pill icon={latest.imbalance >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />} label={dominantSide} tone={latest.imbalance >= 0 ? 'long' : 'short'} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <MetricCard label="Total Actual" value={formatUsd(latest.total)} />
        <MetricCard label="Presion Long" value={formatUsd(latest.longs)} tone="short" />
        <MetricCard label="Presion Short" value={formatUsd(latest.shorts)} tone="long" />
        <MetricCard label="Cambio" value={`${delta >= 0 ? '+' : ''}${formatUsd(Math.abs(delta))}`} tone={delta >= 0 ? 'amber' : 'neutral'} />
      </div>

      <div className="mt-4 h-[270px] rounded-2xl border border-white/10 bg-white/[0.02] p-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="pressureTotal" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#fb7185" stopOpacity={0.34} />
                <stop offset="100%" stopColor="#fb7185" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="pressureImbalance" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              yAxisId="pressure"
              tickFormatter={formatAxis}
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <YAxis
              yAxisId="imbalance"
              orientation="right"
              domain={[-100, 100]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(2,6,23,0.96)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                color: '#fff'
              }}
              formatter={(value: number, name: string) => {
                if (name === 'Presion Total') {
                  return [formatUsd(value), name];
                }
                return [formatPct(value), name];
              }}
            />
            <Area yAxisId="pressure" type="monotone" dataKey="total" name="Presion Total" stroke="#fb7185" strokeWidth={2.4} fill="url(#pressureTotal)" />
            <Area yAxisId="imbalance" type="monotone" dataKey="imbalance" name="Desbalance" stroke="#38bdf8" strokeWidth={2} fill="url(#pressureImbalance)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <ActionHint
          title="Si la presion sube"
          copy="Busca continuacion o squeeze solo si el lado atrapado sigue sufriendo mientras el precio todavia se expande."
        />
        <ActionHint
          title="Si el desbalance se revierte"
          copy="Un retorno rapido desde un extremo hacia cero suele marcar descarga de presion o agotamiento."
        />
        <ActionHint
          title="Si la presion sigue alta"
          copy="Mira primero los simbolos con mas presion. Ahi suelen aparecer cascadas y breakouts fallidos."
        />
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'long' | 'short' | 'amber' }) {
  const toneClass =
    tone === 'long'
      ? 'text-emerald-200'
      : tone === 'short'
        ? 'text-rose-200'
        : tone === 'amber'
          ? 'text-amber-200'
          : 'text-white';
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{label}</div>
      <div className={`mt-2 text-base font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function Pill({ icon, label, tone }: { icon: ReactNode; label: string; tone: 'neutral' | 'long' | 'short' }) {
  const toneClass =
    tone === 'long'
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
      : tone === 'short'
        ? 'border-rose-500/25 bg-rose-500/10 text-rose-100'
        : 'border-white/10 bg-white/[0.03] text-white/70';
  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${toneClass}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

function ActionHint({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{title}</div>
      <div className="mt-2 text-sm text-white/68">{copy}</div>
    </div>
  );
}
