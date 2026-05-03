import { Activity, AlertTriangle, Zap } from 'lucide-react';
import { useLiquidations } from '@/contexts/LiquidationsContext';

function formatType(type: string) {
  const mapping: Record<string, string> = {
    large_liquidation: 'Large pressure event',
    cascade_risk: 'Cascade risk',
    score_shift: 'Score shift',
    oi_expansion: 'OI expansion',
    price_impulse: 'Price impulse',
    funding_shift: 'Funding shift',
    crowding: 'Crowding',
    signal_change: 'Signal change',
    side_flip: 'Dominant side flip'
  };
  return mapping[type] || type.replace(/_/g, ' ');
}

function eventIcon(type: string) {
  if (type === 'cascade_risk' || type === 'large_liquidation') {
    return <AlertTriangle className="h-4 w-4" />;
  }
  if (type === 'signal_change' || type === 'score_shift') {
    return <Zap className="h-4 w-4" />;
  }
  return <Activity className="h-4 w-4" />;
}

function severityClass(severity: string) {
  if (severity === 'high') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
  }
  if (severity === 'medium') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  }
  return 'border-[var(--app-border)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]';
}

function formatValue(value: unknown) {
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

export default function LiquidationsTimeline() {
  const { recentAlerts } = useLiquidations();
  const events = recentAlerts.slice(0, 8);

  return (
    <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-subtle)]">Gateway alert timeline</div>
          <div className="mt-1 text-xs leading-5 text-[var(--app-muted)]">Recent backend alerts that explain why the pressure view changed.</div>
        </div>
        <div className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
          {events.length} events
        </div>
      </div>

      {events.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-panel-muted)] p-5 text-sm text-[var(--app-muted)]">
          No recent gateway alerts.
        </div>
      ) : (
        <div className="relative mt-4">
          <div className="absolute bottom-2 left-4 top-2 w-px bg-[var(--app-border)]" />
          <div className="space-y-4">
            {events.map((event) => {
              const value = formatValue(event.data?.value);
              const delta = formatValue(event.data?.delta);
              return (
                <div key={event.id} className="relative grid grid-cols-[34px_minmax(0,1fr)] gap-3">
                  <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border ${severityClass(event.severity)}`}>
                    {eventIcon(event.type)}
                  </div>
                  <div className="min-w-0 border-b border-[var(--app-border)] pb-4 last:border-b-0">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--app-text)]">{formatType(event.type)}</div>
                        <div className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--app-muted)]">{event.message}</div>
                      </div>
                      <div className="shrink-0 text-xs text-[var(--app-subtle)]">{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>

                    {event.data ? (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--app-subtle)]">
                        {event.data.symbol ? <span className="font-semibold text-[var(--app-muted)]">{event.data.symbol}</span> : null}
                        {event.data.total_usd ? <span>Total {`$${(event.data.total_usd / 1_000_000).toFixed(1)}M`}</span> : null}
                        {value && !event.data.total_usd ? <span>Value {value}</span> : null}
                        {delta ? <span>Delta {delta}</span> : null}
                        {event.data.ratio ? <span>Ratio {Number(event.data.ratio).toFixed(2)}</span> : null}
                        {event.data.side ? <span>{String(event.data.side)}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
