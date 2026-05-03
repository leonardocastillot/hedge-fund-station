import { type ReactNode, useEffect, useState } from 'react';
import { AlertTriangle, Brain, CalendarDays, Newspaper, RefreshCw, Landmark } from 'lucide-react';
import {
  alphaEngineApi,
  type BankHolidays,
  type CalendarAnalysis,
  type CalendarWeek,
  type MacroNews,
  type WeeklyBrief
} from '@/services/alphaEngineApi';

type MacroState = {
  calendar: CalendarWeek | null;
  analysis: CalendarAnalysis | null;
  news: MacroNews | null;
  holidays: BankHolidays | null;
  brief: WeeklyBrief | null;
  moduleErrors: string[];
};

const emptyState: MacroState = {
  calendar: null,
  analysis: null,
  news: null,
  holidays: null,
  brief: null,
  moduleErrors: []
};

function impactTone(impact: string): string {
  if (impact === 'HIGH') return 'border-rose-500/25 bg-rose-500/10 text-rose-100';
  if (impact === 'MEDIUM') return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
  return 'border-white/10 bg-white/[0.03] text-white/70';
}

function providerLabel(brief: WeeklyBrief | null, analysis: CalendarAnalysis | null): string {
  const ai = brief?.ai ?? analysis?.ai;
  if (!ai) return 'deterministic';
  if (ai.provider === 'deepseek') return ai.fallbackUsed ? 'DeepSeek fallback chain' : 'DeepSeek';
  if (ai.provider === 'openai') return ai.fallbackUsed ? 'OpenAI fallback' : 'OpenAI';
  return 'deterministic';
}

export default function EconomicCalendarPage() {
  const [state, setState] = useState<MacroState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    const moduleErrors: string[] = [];

    try {
      setError(null);
      if (force) {
        try {
          await alphaEngineApi.calendarRefresh();
        } catch (err) {
          moduleErrors.push(`Refresh endpoint: ${err instanceof Error ? err.message : 'unavailable'}`);
        }
      }

      const results = await Promise.allSettled([
        loadModule('calendar', alphaEngineApi.calendarWeek),
        loadModule('analysis', alphaEngineApi.calendarAnalysis),
        loadModule('news', alphaEngineApi.calendarNews),
        loadModule('holidays', alphaEngineApi.calendarHolidays),
        loadModule('brief', alphaEngineApi.calendarWeeklyBrief)
      ]);

      const nextState: MacroState = { ...emptyState, moduleErrors };
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.name === 'calendar') nextState.calendar = result.value.data as CalendarWeek;
          if (result.value.name === 'analysis') nextState.analysis = result.value.data as CalendarAnalysis;
          if (result.value.name === 'news') nextState.news = result.value.data as MacroNews;
          if (result.value.name === 'holidays') nextState.holidays = result.value.data as BankHolidays;
          if (result.value.name === 'brief') nextState.brief = result.value.data as WeeklyBrief;
        } else {
          moduleErrors.push(result.reason instanceof Error ? result.reason.message : 'A macro module failed to load.');
        }
      }

      if (!nextState.calendar && !nextState.analysis && !nextState.news && !nextState.holidays && !nextState.brief) {
        setError('No macro modules are available from the active backend.');
      }

      setState(nextState);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-7xl items-center justify-center px-4 py-8">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  const risk = state.brief?.brief.overall_risk ?? state.analysis?.analysis.overall_risk ?? 'UNKNOWN';
  const warning = state.calendar?.warning || state.analysis?.warning;
  const recommendations = state.brief?.brief.recommendations ?? state.analysis?.analysis.recommendations ?? [];
  const summary =
    state.brief?.brief.executive_summary ??
    state.analysis?.analysis.recommendations?.[0] ??
    'Deterministic macro baseline loaded. AI weekly brief is waiting for the active backend to expose the AI provider endpoints.';

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <div className="rounded-lg border border-cyan-500/15 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase text-cyan-300/80">Macro Intelligence</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Weekly calendar, news, bank holidays and AI risk brief.</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Backend: <span className="font-mono text-cyan-100">{alphaEngineApi.baseUrl}</span> · IA: {providerLabel(state.brief, state.analysis)}.
              DeepSeek is the primary provider; OpenAI is only a fallback when configured.
            </p>
          </div>
          <button
            onClick={() => void load(true)}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
        {error ? <Notice tone="rose">{error}</Notice> : null}
        {warning ? <Notice tone="amber">Source warning: {warning}</Notice> : null}
        {state.moduleErrors.length > 0 ? (
          <Notice tone="amber">
            Some macro modules are not available on the active backend yet: {state.moduleErrors.slice(0, 3).join(' | ')}
          </Notice>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Overall Risk" value={risk} />
        <Metric label="Calendar Events" value={state.calendar ? String(state.calendar.count) : 'n/a'} />
        <Metric label="News Items" value={state.news ? String(state.news.count) : 'n/a'} />
        <Metric label="Bank Holidays" value={state.holidays ? String(state.holidays.count) : 'n/a'} />
      </div>

      <Panel title="AI Weekly Brief" icon={<Brain size={16} />}>
        <p className="text-sm leading-6 text-white/75">{summary}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {recommendations.slice(0, 6).map((item) => (
            <div key={item} className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">{item}</div>
          ))}
          {recommendations.length === 0 ? <Empty text="No AI or deterministic recommendations returned yet." /> : null}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Upcoming Events" icon={<CalendarDays size={16} />}>
          <div className="grid gap-3">
            {Object.entries(state.calendar?.events_by_day ?? {}).map(([date, events]) => (
              <div key={date} className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-semibold text-white">{date}</div>
                <div className="mt-3 grid gap-2">
                  {events.map((event) => (
                    <div key={event.id} className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-3 md:grid-cols-[72px_70px_minmax(0,1fr)_110px] md:items-center">
                      <div className="text-sm text-white/80">{event.time}</div>
                      <div className="text-sm font-semibold text-cyan-200">{event.currency}</div>
                      <div className="text-sm text-white/70">{event.event_name}</div>
                      <div className={`rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${impactTone(event.impact)}`}>{event.impact}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!state.calendar ? <Empty text="Calendar endpoint is not available on the active backend." /> : null}
            {state.calendar?.count === 0 ? <Empty text="No scheduled calendar events available from the current provider." /> : null}
          </div>
        </Panel>

        <Panel title="Critical Days" icon={<AlertTriangle size={16} />}>
          <div className="grid gap-2">
            {(state.analysis?.analysis.critical_days ?? []).map((day) => (
              <div key={day.date} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{day.date}</div>
                  <div className="text-xs uppercase text-amber-200">{day.risk_level}</div>
                </div>
                <div className="mt-1 text-xs text-white/45">{day.event_count} events</div>
                <div className="mt-2 text-sm text-white/70">{day.trading_recommendation}</div>
              </div>
            ))}
            {(state.analysis?.analysis.critical_days ?? []).length === 0 ? <Empty text="No critical days in the deterministic baseline." /> : null}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Panel title="News Catalysts" icon={<Newspaper size={16} />}>
          <div className="grid gap-2">
            {(state.news?.items ?? []).slice(0, 12).map((item) => (
              <a key={item.id} href={item.url ?? undefined} target="_blank" rel="noreferrer" className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-cyan-400/30">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${impactTone(item.impact)}`}>{item.impact}</span>
                  <span className="text-xs text-white/45">{item.source}</span>
                </div>
                <div className="mt-2 text-sm font-semibold text-white">{item.title}</div>
              </a>
            ))}
            {!state.news ? <Empty text="News endpoint is not available on the active backend yet." /> : null}
            {state.news && state.news.items.length === 0 ? <Empty text="No news feed items returned." /> : null}
          </div>
        </Panel>

        <Panel title="Bank Holidays" icon={<Landmark size={16} />}>
          <div className="grid gap-2">
            {(state.holidays?.holidays ?? []).map((holiday) => (
              <div key={`${holiday.country}-${holiday.date}-${holiday.name}`} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{holiday.date}</div>
                  <div className="text-xs text-cyan-200">{holiday.country}</div>
                </div>
                <div className="mt-1 text-sm text-white/70">{holiday.name}</div>
                <div className="mt-1 text-xs text-white/45">{holiday.country_name}</div>
              </div>
            ))}
            {!state.holidays ? <Empty text="Bank holiday endpoint is not available on the active backend yet." /> : null}
            {state.holidays && state.holidays.holidays.length === 0 ? <Empty text="No bank holidays detected in the selected window." /> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

async function loadModule<T>(name: string, loader: () => Promise<T>): Promise<{ name: string; data: T }> {
  try {
    return { name, data: await loader() };
  } catch (err) {
    throw new Error(`${name}: ${err instanceof Error ? err.message : 'unavailable'}`);
  }
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-white/40">
        {icon}
        {title}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] font-bold uppercase text-white/35">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone: 'amber' | 'rose' }) {
  const className = tone === 'amber'
    ? 'border-amber-500/25 bg-amber-500/10 text-amber-100'
    : 'border-rose-500/25 bg-rose-500/10 text-rose-100';
  return <div className={`mt-4 rounded-md border p-3 text-sm ${className}`}>{children}</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-5 text-center text-sm text-white/45">{text}</div>;
}
