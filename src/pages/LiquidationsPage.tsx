import { type ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, DollarSign, Shield, Target, TrendingDown, TrendingUp, Waves } from 'lucide-react';
import { useLiquidations } from '../contexts/LiquidationsContext';
import LiquidationsChart from '../components/LiquidationsChart';
import LiquidationsTimeline from '../components/LiquidationsTimeline';

function formatUsd(value: number): string {
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

function formatFunding(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'N/D';
  }
  return `${(value * 100).toFixed(4)}%`;
}

function toneForRisk(risk: string) {
  if (risk === 'high') {
    return 'text-rose-300';
  }
  if (risk === 'medium') {
    return 'text-amber-300';
  }
  return 'text-emerald-300';
}

function toneForSignal(signal: string) {
  if (signal === 'long') {
    return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100';
  }
  if (signal === 'short') {
    return 'border-rose-500/25 bg-rose-500/10 text-rose-100';
  }
  return 'border-white/10 bg-white/[0.03] text-white/70';
}

function marketLabelForBias(bias: string) {
  if (bias === 'longs-at-risk') {
    return 'Longs en riesgo';
  }
  if (bias === 'shorts-at-risk') {
    return 'Shorts en riesgo';
  }
  return 'Balanceado';
}

function nextCheckForMarket(market: { bias: string; price_change_pct: number; funding_rate: number | null }) {
  if (market.bias === 'longs-at-risk') {
    return 'Busca rebotes fallidos y continuidad bajista rapida.';
  }
  if (market.bias === 'shorts-at-risk') {
    return 'Mira si siguen levantando ofertas y el precio se niega a revertir.';
  }
  if (market.funding_rate && Math.abs(market.funding_rate) > 0.0006) {
    return 'Revisa si el funding ya esta demasiado cargado para continuar.';
  }
  if (Math.abs(market.price_change_pct) >= 4) {
    return 'Revisa si el desplazamiento sigue limpio o ya se esta agotando.';
  }
  return 'Usalo como contexto, no como prioridad inmediata de trade.';
}

export default function LiquidationsPage() {
  const { stats, insights, snapshots, recentAlerts, error, isConnected } = useLiquidations();
  const latestSnapshot = snapshots[0];
  const previousSnapshot = snapshots[1];
  const topMarkets = latestSnapshot?.top_markets || [];
  const dominantSide = stats?.liquidations_1h.dominant_side || 'balanced';
  const imbalanceRatio = stats?.liquidations_1h.ratio_long_short || 1;
  const pressureDelta = latestSnapshot && previousSnapshot ? latestSnapshot.total_usd - previousSnapshot.total_usd : 0;

  const reviewQueue = topMarkets.slice(0, 3).map((market, index) => ({
    id: `${market.symbol}-${index}`,
    symbol: market.symbol,
    label: marketLabelForBias(market.bias),
    pressure: market.pressure_usd,
    copy: nextCheckForMarket(market)
  }));

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(248,113,113,0.12),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.10),_transparent_26%),linear-gradient(180deg,#020617_0%,#111827_100%)] p-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="rounded-[24px] border border-rose-500/15 bg-black/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-300/70">Radar de Presion</div>
              <div className="mt-1 text-xl font-semibold text-white">Que lado esta atrapado, donde se concentra la presion y que conviene revisar primero.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{isConnected ? 'Gateway activo' : 'Reconectando gateway'}</Badge>
              <Badge>{stats?.current_sentiment || 'Cargando'}</Badge>
              <Badge>{stats ? `${stats.total_alerts} alertas` : 'Sin alertas'}</Badge>
            </div>
          </div>

          {error ? <div className="mt-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <StatCard label="Presion 1h" value={stats ? formatUsd(stats.liquidations_1h.total_usd) : 'N/D'} icon={<DollarSign className="h-4 w-4" />} />
            <StatCard label="Longs En Riesgo" value={stats ? formatUsd(stats.liquidations_1h.longs_usd) : 'N/D'} icon={<TrendingDown className="h-4 w-4" />} />
            <StatCard label="Shorts En Riesgo" value={stats ? formatUsd(stats.liquidations_1h.shorts_usd) : 'N/D'} icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard label="Riesgo De Cascada" value={stats?.cascade_risk.toUpperCase() || 'N/D'} icon={<Shield className="h-4 w-4" />} />
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
            <InsightCard label="Lado Dominante" value={String(dominantSide).toUpperCase()} tone={dominantSide === 'shorts' ? 'emerald' : dominantSide === 'longs' ? 'rose' : 'neutral'} />
            <InsightCard
              label="Que Revisar Ahora"
              value={
                reviewQueue[0]
                  ? `${reviewQueue[0].symbol}: ${reviewQueue[0].copy}`
                  : 'Espera a que la presion se concentre en simbolos concretos antes de actuar.'
              }
              tone="sky"
            />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="grid gap-4">
            <Panel title="Cola De Revision">
              {reviewQueue.length === 0 ? (
                <EmptyState copy="Esperando una concentracion clara de presion. Cuando un lado quede atrapado, aqui apareceran los primeros simbolos a revisar." />
              ) : (
                <div className="grid gap-2">
                  {reviewQueue.map((item) => (
                    <div key={item.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[112px_minmax(0,1fr)_auto] md:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-white">{item.symbol}</div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">{item.label}</div>
                      </div>
                      <div className="text-sm text-white/68">{item.copy}</div>
                      <div className="text-sm font-semibold text-white md:text-right">{formatUsd(item.pressure)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Mapa De Presion">
              {topMarkets.length === 0 ? (
                <EmptyState copy="Esperando snapshot de presion para construir el mapa." />
              ) : (
                <div className="grid gap-2">
                  {topMarkets.slice(0, 8).map((market) => (
                    <div key={market.symbol} className="grid min-w-0 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 lg:grid-cols-[88px_minmax(0,1fr)_minmax(190px,auto)] lg:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-white">{market.symbol}</div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">{marketLabelForBias(market.bias)}</div>
                      </div>
                      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                        <Metric label="Presion" value={formatUsd(market.pressure_usd)} />
                        <Metric label="24h" value={`${market.price_change_pct >= 0 ? '+' : ''}${market.price_change_pct.toFixed(2)}%`} positive={market.price_change_pct >= 0} />
                        <Metric label="OI" value={formatUsd(market.open_interest_usd || 0)} />
                        <Metric label="Funding" value={formatFunding(market.funding_rate)} />
                      </div>
                      <div className="text-xs text-white/48 lg:text-right">{nextCheckForMarket(market)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <LiquidationsChart />
          </div>

          <div className="grid gap-4">
            <Panel title="Regimen">
              {!insights ? (
                <EmptyState copy="Esperando insights de presion y crowding." />
              ) : (
                <div className="grid gap-4">
                  <div className={`rounded-2xl border p-4 ${toneForSignal(insights.trading_signal)}`}>
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70">Sesgo</div>
                    <div className="mt-2 text-2xl font-semibold">{insights.trading_signal.toUpperCase()}</div>
                    <div className="mt-1 text-sm opacity-80">{insights.market_condition}</div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <MiniStat label="Confianza" value={insights.confidence.toUpperCase()} icon={<Target className="h-4 w-4" />} />
                    <MiniStat label="Riesgo De Cascada" value={insights.cascade_risk.toUpperCase()} icon={<AlertTriangle className={`h-4 w-4 ${toneForRisk(insights.cascade_risk)}`} />} />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <MiniStat label="Ratio Long/Short" value={imbalanceRatio.toFixed(2)} icon={<Waves className="h-4 w-4" />} />
                    <MiniStat label="Cambio De Presion" value={`${pressureDelta >= 0 ? '+' : ''}${formatUsd(Math.abs(pressureDelta))}`} icon={<ArrowUpRight className={`h-4 w-4 ${pressureDelta >= 0 ? 'text-amber-300' : 'text-emerald-300'}`} />} />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Como Leerlo</div>
                    <div className="mt-3 grid gap-2">
                      {insights.reasoning.map((reason, index) => (
                        <div key={`${reason}-${index}`} className="text-sm text-white/70">
                          {reason}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Panel>

            <LiquidationsTimeline />
          </div>
        </div>

        {latestSnapshot ? (
          <Panel title="Ultimo Snapshot">
            <div className="grid gap-3 md:grid-cols-4">
              <MiniStat label="Hora" value={new Date(latestSnapshot.timestamp).toLocaleTimeString()} icon={<Activity className="h-4 w-4" />} />
              <MiniStat label="Lado Dominante" value={stats?.liquidations_1h.dominant_side || 'N/D'} icon={<Waves className="h-4 w-4" />} />
              <MiniStat label="Mercados Long" value={String(latestSnapshot.num_longs)} icon={<TrendingDown className="h-4 w-4" />} />
              <MiniStat label="Mercados Short" value={String(latestSnapshot.num_shorts)} icon={<TrendingUp className="h-4 w-4" />} />
            </div>
          </Panel>
        ) : null}

        {recentAlerts.length === 0 && !error ? (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-white/55">
            Todavia no hay alertas relevantes. El feed se llena cuando cambia la presion de mercado, el OI o el crowding.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
        <span>{label}</span>
        <span className="text-rose-300">{icon}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
        <span>{label}</span>
        <span className="text-white/45">{icon}</span>
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${positive === undefined ? 'text-white' : positive ? 'text-emerald-300' : 'text-rose-300'}`}>{value}</div>
    </div>
  );
}

function InsightCard({ label, value, tone }: { label: string; value: string; tone: 'neutral' | 'sky' | 'emerald' | 'rose' }) {
  const toneClass =
    tone === 'sky'
      ? 'border-sky-500/20 bg-sky-500/10 text-sky-50'
      : tone === 'emerald'
        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-50'
        : tone === 'rose'
          ? 'border-rose-500/20 bg-rose-500/10 text-rose-50'
          : 'border-white/10 bg-white/[0.03] text-white';
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-65">{label}</div>
      <div className="mt-2 text-sm font-semibold">{value}</div>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">{copy}</div>;
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
      {children}
    </div>
  );
}
