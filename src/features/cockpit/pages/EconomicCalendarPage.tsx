import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CalendarDays,
  Clock3,
  DatabaseZap,
  Landmark,
  Newspaper,
  RefreshCw
} from 'lucide-react';
import {
  alphaEngineApi,
  type BankHolidays,
  type CalendarAnalysis,
  type CalendarIntelligence,
  type CalendarWeek,
  type MacroNews,
  type WeeklyBrief
} from '@/services/alphaEngineApi';

type CalendarEvent = CalendarWeek['events_by_day'][string][number];

type MacroState = {
  calendar: CalendarWeek | null;
  analysis: CalendarAnalysis | null;
  news: MacroNews | null;
  holidays: BankHolidays | null;
  brief: WeeklyBrief | null;
  intelligence: CalendarIntelligence | null;
  moduleErrors: string[];
};

const emptyState: MacroState = {
  calendar: null,
  analysis: null,
  news: null,
  holidays: null,
  brief: null,
  intelligence: null,
  moduleErrors: []
};

function impactTone(impact: string): string {
  if (impact === 'HIGH') return 'border-rose-500/25 bg-rose-500/10 text-rose-100';
  if (impact === 'MEDIUM') return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
  return 'border-white/10 bg-white/[0.03] text-white/70';
}

function riskTone(risk: string): string {
  if (risk === 'HIGH') return 'text-rose-100 border-rose-500/25 bg-rose-500/10';
  if (risk === 'MEDIUM') return 'text-amber-100 border-amber-500/25 bg-amber-500/10';
  if (risk === 'LOW') return 'text-emerald-100 border-emerald-500/25 bg-emerald-500/10';
  return 'text-white/70 border-white/10 bg-white/[0.03]';
}

function providerLabel(brief: WeeklyBrief | null, analysis: CalendarAnalysis | null): string {
  const ai = brief?.ai ?? analysis?.ai;
  if (!ai) return 'deterministic';
  if (ai.provider === 'deepseek') return ai.fallbackUsed ? 'DeepSeek fallback chain' : 'DeepSeek';
  if (ai.provider === 'openai') return ai.fallbackUsed ? 'OpenAI fallback' : 'OpenAI';
  return 'deterministic';
}

function calendarSourceMode(calendar: CalendarWeek | null): string {
  if (!calendar) return 'Unavailable';
  const source = calendar.source.toLowerCase();
  const warning = (calendar.warning ?? '').toLowerCase();
  if (source.includes('fallback')) return 'Fallback markers';
  if (warning.includes('saved') || warning.includes('snapshot')) return 'Saved cache';
  if (source.includes('forex factory')) return 'Forex Factory';
  return calendar.source;
}

function sourceStatusTone(status?: string): string {
  if (status === 'fresh') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100';
  if (status === 'cached') return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
  if (status === 'stale' || status === 'fallback') return 'border-rose-500/25 bg-rose-500/10 text-rose-100';
  return 'border-white/10 bg-white/[0.03] text-white/70';
}

function postureLabel(value?: string): string {
  if (value === 'verify_calendar_first') return 'Verify calendar first';
  if (value === 'reduce_size_until_post_event') return 'Reduce size until post-event';
  if (value === 'selective_risk_only') return 'Selective risk only';
  if (value === 'normal') return 'Normal';
  return value || 'n/a';
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatUpdatedAt(value?: string): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function collectEvents(calendar: CalendarWeek | null): CalendarEvent[] {
  return Object.values(calendar?.events_by_day ?? {}).flat();
}

function eventDayKey(event: CalendarEvent): string {
  return String(event.date_time).slice(0, 10);
}

function formatEventWindow(event: CalendarEvent): string {
  return `${eventDayKey(event)} ${event.time} ${event.currency} ${event.event_name}`;
}

export default function EconomicCalendarPage() {
  const [state, setState] = useState<MacroState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setBriefLoading(false);

    const moduleErrors: string[] = [];

    try {
      setError(null);

      const results = await Promise.allSettled([
        loadModule('intelligence', () => alphaEngineApi.calendarIntelligence(force)),
        loadModule('calendar', () => alphaEngineApi.calendarWeek(force)),
        loadModule('analysis', () => alphaEngineApi.calendarAnalysis(force)),
        loadModule('news', () => alphaEngineApi.calendarNews(force)),
        loadModule('holidays', () => alphaEngineApi.calendarHolidays(force))
      ]);

      const nextState: MacroState = { ...emptyState, moduleErrors };
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.name === 'intelligence') {
            nextState.intelligence = result.value.data as CalendarIntelligence;
            nextState.calendar = nextState.intelligence.calendar;
            nextState.analysis = { analysis: nextState.intelligence.deterministic, ai: nextState.intelligence.ai, warning: nextState.intelligence.calendar.warning };
            nextState.news = nextState.intelligence.news;
            nextState.holidays = nextState.intelligence.holidays;
          }
          if (result.value.name === 'calendar') nextState.calendar = result.value.data as CalendarWeek;
          if (result.value.name === 'analysis') nextState.analysis = result.value.data as CalendarAnalysis;
          if (result.value.name === 'news') nextState.news = result.value.data as MacroNews;
          if (result.value.name === 'holidays') nextState.holidays = result.value.data as BankHolidays;
        } else {
          moduleErrors.push(result.reason instanceof Error ? result.reason.message : 'A macro module failed to load.');
        }
      }

      if (!nextState.intelligence && !nextState.calendar && !nextState.analysis && !nextState.news && !nextState.holidays) {
        setError('No macro modules are available from the active backend.');
      }

      setState(nextState);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    setBriefLoading(true);
    try {
      const brief = await alphaEngineApi.calendarWeeklyBrief(force);
      setState((current) => ({ ...current, brief }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unavailable';
      setState((current) => ({
        ...current,
        moduleErrors: [...current.moduleErrors, `brief: ${message}`]
      }));
    } finally {
      setBriefLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const calendarEvents = useMemo(() => collectEvents(state.calendar), [state.calendar]);
  const highImpactEvents = useMemo(
    () => calendarEvents.filter((event) => event.impact === 'HIGH'),
    [calendarEvents]
  );
  const intelligence = state.intelligence;
  const todayKey = formatDateKey(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrowDate);
  const todayEvents = state.calendar?.events_by_day[todayKey] ?? [];
  const tomorrowEvents = state.calendar?.events_by_day[tomorrowKey] ?? [];

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-7xl items-center justify-center px-4 py-8">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  const deterministicRisk = state.analysis?.analysis.overall_risk ?? 'UNKNOWN';
  const risk = intelligence?.today_desk.overall_risk ?? deterministicRisk;
  const aiRisk = state.brief?.brief.overall_risk;
  const warning = state.calendar?.warning || state.analysis?.warning || intelligence?.quality.warnings[0];
  const recommendations = intelligence?.model.operator_notes ?? state.analysis?.analysis.recommendations ?? state.brief?.brief.recommendations ?? [];
  const summary =
    intelligence?.model.headline ??
    intelligence?.today_desk.headline ??
    state.analysis?.analysis.recommendations?.[0] ??
    state.brief?.brief.executive_summary ??
    'Deterministic macro baseline loaded. Review high-impact windows before opening new risk.';
  const standAsideWindows = intelligence?.stand_aside_windows.map((window) => `${formatUpdatedAt(window.start)}-${formatUpdatedAt(window.end)} ${window.label}`) ?? [
    ...highImpactEvents.slice(0, 8).map(formatEventWindow),
    ...(state.brief?.brief.stand_aside_windows ?? []).slice(0, 4)
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <div className="rounded-lg border border-cyan-500/15 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase text-cyan-300/80">Macro Intelligence</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Macro calendar, risk windows and trading posture.</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Backend: <span className="font-mono text-cyan-100">{alphaEngineApi.baseUrl}</span> · Source:{' '}
              <span className="font-semibold text-white">{intelligence?.quality.provider ?? calendarSourceMode(state.calendar)}</span> · Updated:{' '}
              {formatUpdatedAt(state.calendar?.updated_at)} · Timezone: {state.calendar?.timezone ?? 'n/a'}.
            </p>
          </div>
          <button
            onClick={() => void load(true)}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing Core' : 'Refresh'}
          </button>
        </div>
        {error ? <Notice tone="rose">{error}</Notice> : null}
        {warning ? <Notice tone="amber">Source warning: {warning}</Notice> : null}
        {state.moduleErrors.length > 0 ? (
          <Notice tone="amber">
            Some macro modules are degraded: {state.moduleErrors.slice(0, 3).join(' | ')}
          </Notice>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Panel title="Today's Macro Desk" icon={<Brain size={16} />}>
          <div className="grid gap-3 md:grid-cols-3">
            <MiniStatus label="Source" value={intelligence?.quality.status ?? 'unknown'} tone={sourceStatusTone(intelligence?.quality.status)} />
            <MiniStatus label="Confidence" value={`${intelligence?.model.confidence ?? intelligence?.quality.confidence ?? 0}%`} tone={sourceStatusTone(intelligence?.quality.status)} />
            <MiniStatus label="Posture" value={postureLabel(intelligence?.model.posture ?? intelligence?.today_desk.posture)} tone={riskTone(risk)} />
          </div>
          <p className="mt-4 text-sm leading-6 text-white/75">{summary}</p>
          {intelligence?.today_desk.next_event ? (
            <div className="mt-3 rounded-md border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-cyan-50">
              Next checkpoint: {intelligence.today_desk.next_event.time} {intelligence.today_desk.next_event.currency} {intelligence.today_desk.next_event.event_name}
            </div>
          ) : null}
          {(intelligence?.quality.warnings ?? []).length > 0 ? (
            <div className="mt-3 grid gap-2">
              {intelligence?.quality.warnings.map((item) => (
                <div key={item} className="rounded-md border border-amber-500/25 bg-amber-500/10 p-2 text-xs text-amber-100">{item}</div>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel title="Model Checklist" icon={<DatabaseZap size={16} />}>
          <Checklist label="Before" items={intelligence?.model.watch_before ?? []} />
          <Checklist label="During" items={intelligence?.model.watch_during ?? []} />
          <Checklist label="After" items={intelligence?.model.watch_after ?? []} />
          {!intelligence ? <Empty text="Calendar intelligence endpoint unavailable; using basic calendar modules." /> : null}
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Deterministic Risk" value={risk} tone={riskTone(risk)} />
        <Metric label="Today" value={`${todayEvents.length} events`} helper={todayKey} />
        <Metric label="Tomorrow" value={`${tomorrowEvents.length} events`} helper={tomorrowKey} />
        <Metric label="This Week" value={`${state.calendar?.count ?? 0} events`} helper={`${intelligence?.today_desk.week_high_impact_count ?? highImpactEvents.length} high impact`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Stand-Aside Windows" icon={<Clock3 size={16} />}>
          <div className="grid gap-2">
            {standAsideWindows.map((item) => (
              <div key={item} className="rounded-md border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-100">
                {item}
              </div>
            ))}
            {standAsideWindows.length === 0 ? (
              <Empty text="No high-impact stand-aside windows returned in the current calendar window." />
            ) : null}
          </div>
        </Panel>

        <Panel title="Deterministic Posture" icon={<DatabaseZap size={16} />}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-3 py-1 text-xs font-bold uppercase ${riskTone(risk)}`}>{risk}</span>
            {aiRisk ? <span className="text-xs text-white/45">AI brief risk: {aiRisk}</span> : null}
            {intelligence?.ai.provider ? <span className="text-xs text-white/45">Model: {providerLabel(null, { analysis: intelligence.deterministic, ai: intelligence.ai })}</span> : null}
            {briefLoading ? <span className="text-xs text-cyan-200">AI brief loading separately...</span> : null}
          </div>
          <p className="mt-3 text-sm leading-6 text-white/75">{summary}</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {recommendations.slice(0, 6).map((item) => (
              <div key={item} className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">{item}</div>
            ))}
            {recommendations.length === 0 ? <Empty text="No deterministic recommendations returned yet." /> : null}
          </div>
        </Panel>
      </div>

      {(intelligence?.post_event_notes ?? []).length > 0 ? (
        <Panel title="Post-Event Reads" icon={<AlertTriangle size={16} />}>
          <div className="grid gap-2 md:grid-cols-2">
            {intelligence?.post_event_notes.map((note) => (
              <div key={note.event_id} className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                <div className="font-semibold text-white">{note.event_name}</div>
                <div className="mt-1">{note.read}</div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Upcoming Events" icon={<CalendarDays size={16} />}>
          <div className="grid gap-3">
            {Object.entries(state.calendar?.events_by_day ?? {}).map(([date, events]) => (
              <div key={date} className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">{date}</div>
                  <div className="text-xs text-white/45">{events.filter((event) => event.impact === 'HIGH').length} high impact</div>
                </div>
                <div className="mt-3 grid gap-2">
                  {events.map((event) => (
                    <div key={`${date}-${event.id}-${event.event_name}`} className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-3 md:grid-cols-[72px_70px_minmax(0,1fr)_110px] md:items-center">
                      <div className="text-sm text-white/80">{event.time}</div>
                      <div className="text-sm font-semibold text-cyan-200">{event.currency}</div>
                      <div className="min-w-0 text-sm text-white/70">
                        <span>{event.event_name}</span>
                        {event.is_fallback ? <span className="ml-2 text-xs text-amber-200">fallback</span> : null}
                      </div>
                      <div className={`rounded-md border px-2 py-1 text-center text-[11px] font-bold uppercase ${impactTone(event.impact)}`}>{event.impact}</div>
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
                  <div className={`rounded-md border px-2 py-1 text-xs font-bold uppercase ${riskTone(day.risk_level)}`}>{day.risk_level}</div>
                </div>
                <div className="mt-1 text-xs text-white/45">{day.event_count} events</div>
                <div className="mt-2 text-sm text-white/70">{day.trading_recommendation}</div>
              </div>
            ))}
            {(state.analysis?.analysis.critical_days ?? []).length === 0 ? <Empty text="No critical days in the deterministic baseline." /> : null}
          </div>
        </Panel>
      </div>

      <Panel title="AI Weekly Brief" icon={<Brain size={16} />}>
        {briefLoading ? (
          <div className="flex items-center gap-2 text-sm text-cyan-100">
            <RefreshCw size={14} className="animate-spin" />
            Loading AI brief without blocking the calendar.
          </div>
        ) : (
          <p className="text-sm leading-6 text-white/75">
            {state.brief?.brief.executive_summary ?? 'AI weekly brief unavailable. Deterministic risk and Forex Factory events remain the operating baseline.'}
          </p>
        )}
        <div className="mt-2 text-xs text-white/45">Provider: {providerLabel(state.brief, state.analysis)}</div>
      </Panel>

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

function Metric({ label, value, helper, tone }: { label: string; value: string; helper?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] font-bold uppercase text-white/35">{label}</div>
      <div className={`mt-2 inline-flex rounded-md border px-2 py-1 text-xl font-semibold ${tone ?? 'border-transparent text-white'}`}>{value}</div>
      {helper ? <div className="mt-2 text-xs text-white/45">{helper}</div> : null}
    </div>
  );
}

function MiniStatus({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase text-white/35">{label}</div>
      <div className={`mt-2 inline-flex rounded-md border px-2 py-1 text-sm font-semibold capitalize ${tone}`}>{value}</div>
    </div>
  );
}

function Checklist({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mb-3">
      <div className="mb-2 text-[10px] font-bold uppercase text-white/35">{label}</div>
      <div className="grid gap-2">
        {items.slice(0, 4).map((item) => (
          <div key={item} className="rounded-md border border-white/10 bg-white/[0.03] p-2 text-sm text-white/70">{item}</div>
        ))}
        {items.length === 0 ? <div className="text-sm text-white/40">No model notes returned.</div> : null}
      </div>
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
