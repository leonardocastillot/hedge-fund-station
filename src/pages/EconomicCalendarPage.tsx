import { type ReactNode, useEffect, useState } from 'react';
import legacyApi from '../services/legacyTradingApi';

type EconomicEvent = {
  id: number;
  time: string;
  date_time: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  event_name: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
};

type CalendarAnalysis = {
  overall_risk: string;
  critical_days: Array<{ date: string; risk_level: string; trading_recommendation: string; event_count: number }>;
  recommendations: string[];
  event_clusters: Array<{ date: string; time: string; event_count: number; risk: string }>;
};

function impactTone(impact: EconomicEvent['impact']): string {
  if (impact === 'HIGH') return 'border-rose-500/25 bg-rose-500/10 text-rose-100';
  if (impact === 'MEDIUM') return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
  return 'border-white/10 bg-white/[0.03] text-white/70';
}

export default function EconomicCalendarPage() {
  const [eventsByDay, setEventsByDay] = useState<Record<string, EconomicEvent[]>>({});
  const [analysis, setAnalysis] = useState<CalendarAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setError(null);
      const [calendarResponse, analysisResponse] = await Promise.all([
        legacyApi.get('/api/calendar/this-week', { params: { days: 5 } }),
        legacyApi.get('/api/calendar/analysis', { params: { days: 5 } })
      ]);
      setEventsByDay(calendarResponse.data?.events_by_day ?? {});
      setAnalysis(analysisResponse.data?.analysis ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load economic calendar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const triggerRefresh = async () => {
    setRefreshing(true);
    try {
      await legacyApi.post('/api/calendar/fetch');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh economic calendar.');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 flex min-h-[50vh] items-center justify-center">
        <div className="h-9 w-9 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <div className="rounded-[24px] border border-cyan-500/15 bg-[linear-gradient(135deg,rgba(6,182,212,0.16),rgba(15,23,42,0.92))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">Economic Calendar</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Forex Factory scraping and calendar analysis from the legacy trading backend.</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              This page is intentionally backed by the legacy trading API, not the Hyperliquid gateway.
            </p>
          </div>
          <button
            onClick={() => void triggerRefresh()}
            className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
          >
            {refreshing ? 'Refreshing...' : 'Sync Calendar'}
          </button>
        </div>
        {error ? <div className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
      </div>

      {analysis ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Overall Risk" value={analysis.overall_risk} />
          <Metric label="Critical Days" value={String(analysis.critical_days.length)} />
          <Metric label="Clusters" value={String(analysis.event_clusters.length)} />
        </div>
      ) : null}

      {analysis?.recommendations?.length ? (
        <Panel title="Recommendations">
          <div className="grid gap-2">
            {analysis.recommendations.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">{item}</div>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Upcoming Events">
          <div className="grid gap-3">
            {Object.entries(eventsByDay).map(([date, events]) => (
              <div key={date} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-semibold text-white">{date}</div>
                <div className="mt-3 grid gap-2">
                  {events.map((event) => (
                    <div key={event.id} className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 md:grid-cols-[72px_70px_minmax(0,1fr)_110px] md:items-center">
                      <div className="text-sm text-white/80">{new Date(event.date_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="text-sm font-semibold text-cyan-200">{event.currency}</div>
                      <div className="text-sm text-white/70">{event.event_name}</div>
                      <div className={`rounded-full border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${impactTone(event.impact)}`}>{event.impact}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Critical Days">
          <div className="grid gap-2">
            {(analysis?.critical_days ?? []).map((day) => (
              <div key={day.date} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{day.date}</div>
                  <div className="text-xs uppercase tracking-[0.16em] text-amber-200">{day.risk_level}</div>
                </div>
                <div className="mt-1 text-xs text-white/45">{day.event_count} events</div>
                <div className="mt-2 text-sm text-white/70">{day.trading_recommendation}</div>
              </div>
            ))}
          </div>
        </Panel>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}
