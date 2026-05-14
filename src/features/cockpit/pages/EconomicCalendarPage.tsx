import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Brain,
  CalendarDays,
  Clock3,
  DatabaseZap,
  Landmark,
  Newspaper,
  RefreshCw,
  Search,
  XCircle
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
type ImpactFilter = 'FOCUS' | 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';
type SideTab = 'brief' | 'checklist' | 'news' | 'holidays';
type TimeSelection = { date: string; bucketStart: number | null } | null;
type QualityIssue = {
  id: string;
  label: string;
  detail: string;
  tone: 'amber' | 'rose';
};

type DeskEvent = CalendarEvent & {
  dateKey: string;
  bucketStart: number;
  timestamp: number;
  timeLabel: string;
  isUpcoming: boolean;
  searchText: string;
};

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

const bucketStarts = Array.from({ length: 12 }, (_, index) => index * 2);
const defaultTimeZone = 'America/Santiago';
const timeZoneStorageKey = 'hedge-fund-station:calendar-time-zone';
const impactFilters: Array<{ id: ImpactFilter; label: string }> = [
  { id: 'FOCUS', label: 'Focus' },
  { id: 'ALL', label: 'All' },
  { id: 'HIGH', label: 'High' },
  { id: 'MEDIUM', label: 'Med' },
  { id: 'LOW', label: 'Low' }
];
const baseTimeZoneOptions = [
  { value: 'America/Santiago', label: 'Chile' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Asia/Tokyo', label: 'Tokyo' }
];

function impactRank(impact: string): number {
  if (impact === 'HIGH') return 3;
  if (impact === 'MEDIUM') return 2;
  if (impact === 'LOW') return 1;
  return 0;
}

function impactTone(impact: string): string {
  if (impact === 'HIGH') return 'border-rose-500/25 bg-rose-500/10 text-rose-100';
  if (impact === 'MEDIUM') return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
  if (impact === 'LOW') return 'border-slate-500/20 bg-slate-500/10 text-slate-300';
  return 'border-white/10 bg-white/[0.03] text-white/70';
}

function cellTone(impact: string | null, count: number, selected: boolean): string {
  const selectedClass = selected ? 'ring-2 ring-cyan-300/60' : '';
  const densityClass = count >= 4 ? 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : '';
  if (impact === 'HIGH') return `border-rose-400/40 bg-rose-500/20 text-rose-50 ${densityClass} ${selectedClass}`;
  if (impact === 'MEDIUM') return `border-amber-400/35 bg-amber-500/20 text-amber-50 ${densityClass} ${selectedClass}`;
  if (impact === 'LOW') return `border-white/10 bg-white/[0.05] text-white/55 ${densityClass} ${selectedClass}`;
  return `border-white/[0.04] bg-white/[0.015] text-white/25 ${selectedClass}`;
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

function compactSourceStatus(sourceMode: string): string {
  if (sourceMode === 'Saved cache') return 'Cache';
  if (sourceMode === 'Fallback markers') return 'Fallback';
  if (sourceMode === 'Forex Factory') return 'Live';
  return sourceMode;
}

function postureLabel(value?: string): string {
  if (value === 'verify_calendar_first') return 'Verify first';
  if (value === 'reduce_size_until_post_event') return 'Reduce size';
  if (value === 'selective_risk_only') return 'Selective';
  if (value === 'normal') return 'Normal';
  return value || 'n/a';
}

function formatUpdatedAt(value?: string, timeZone?: string): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString([], {
    timeZone,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function browserTimeZone(): string {
  if (typeof Intl === 'undefined') return defaultTimeZone;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZone && isValidTimeZone(timeZone) ? timeZone : defaultTimeZone;
}

function readTimeZonePreference(): string {
  if (typeof window === 'undefined') return defaultTimeZone;
  try {
    const stored = window.localStorage.getItem(timeZoneStorageKey);
    if (stored && isValidTimeZone(stored)) return stored;
  } catch {
    return browserTimeZone();
  }
  return browserTimeZone();
}

function persistTimeZonePreference(timeZone: string) {
  if (typeof window === 'undefined' || !isValidTimeZone(timeZone)) return;
  try {
    window.localStorage.setItem(timeZoneStorageKey, timeZone);
  } catch {
    // Local storage can be unavailable in restricted browser contexts.
  }
}

function timeZoneOptions(activeTimeZone: string) {
  if (baseTimeZoneOptions.some((option) => option.value === activeTimeZone)) return baseTimeZoneOptions;
  return [{ value: activeTimeZone, label: activeTimeZone }, ...baseTimeZoneOptions];
}

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour') === '24' ? '00' : value('hour'),
    minute: value('minute')
  };
}

function formatDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = datePartsInTimeZone(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatTimeInTimeZone(date: Date, timeZone: string): string {
  const parts = datePartsInTimeZone(date, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

function formatDayLabel(dateKey: string, _timeZone?: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: '2-digit' });
}

function formatBucketLabel(start: number): string {
  const end = start + 2;
  return `${String(start).padStart(2, '0')}:00-${end === 24 ? '24' : String(end).padStart(2, '0')}:00`;
}

function collectEvents(calendar: CalendarWeek | null): CalendarEvent[] {
  return Object.values(calendar?.events_by_day ?? {}).flat();
}

function eventDate(event: CalendarEvent): Date {
  const parsed = new Date(event.date_time);
  return Number.isNaN(parsed.getTime()) ? new Date(`${String(event.date_time).slice(0, 10)}T${event.time}:00`) : parsed;
}

function parseTimeHour(value: string): number {
  const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return 0;

  const meridiem = match[3]?.toLowerCase();
  let hour = Number(match[1]);
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return Math.max(0, Math.min(23, hour));
}

function eventTimestamp(event: CalendarEvent): number {
  const parsed = eventDate(event);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function normalizeDeskEvents(calendar: CalendarWeek | null, timeZone: string): DeskEvent[] {
  const now = Date.now();
  return collectEvents(calendar)
    .map((event) => {
      const parsed = eventDate(event);
      const dateKey = formatDateKeyInTimeZone(parsed, timeZone);
      const timeLabel = formatTimeInTimeZone(parsed, timeZone);
      const bucketStart = Math.floor(parseTimeHour(timeLabel) / 2) * 2;
      const timestamp = eventTimestamp(event);
      return {
        ...event,
        dateKey,
        bucketStart,
        timestamp,
        timeLabel,
        isUpcoming: timestamp >= now,
        searchText: [
          dateKey,
          timeLabel,
          event.time,
          event.currency,
          event.impact,
          event.event_name,
          event.forecast,
          event.previous,
          event.actual
        ].filter(Boolean).join(' ').toLowerCase()
      };
    })
    .sort((left, right) => left.timestamp - right.timestamp || impactRank(right.impact) - impactRank(left.impact));
}

function buildBucketMap(events: DeskEvent[]): Map<string, DeskEvent[]> {
  const map = new Map<string, DeskEvent[]>();
  events.forEach((event) => {
    const key = `${event.dateKey}|${event.bucketStart}`;
    map.set(key, [...(map.get(key) ?? []), event]);
  });
  return map;
}

function maxImpact(events: DeskEvent[]): string | null {
  return events.reduce<string | null>((current, event) => {
    if (!current || impactRank(event.impact) > impactRank(current)) return event.impact;
    return current;
  }, null);
}

function formatDataPoint(value: string | null): string {
  if (!value || !value.trim()) return '-';
  return value;
}

function isWarningRecommendation(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized.includes('source warning')
    || normalized.includes('forex factory unavailable')
    || normalized.includes('do not treat an empty calendar')
    || normalized.includes('degraded module');
}

function readableModuleIssue(message: string, index: number): QualityIssue {
  const normalized = message.toLowerCase();
  if (normalized.includes('intelligence')) {
    return {
      id: `module-${index}`,
      label: 'AI offline',
      detail: 'AI calendar intelligence is unavailable; base calendar modules are still being used.',
      tone: 'amber'
    };
  }
  if (normalized.includes('brief')) {
    return {
      id: `module-${index}`,
      label: 'Brief offline',
      detail: 'Weekly AI brief is unavailable; deterministic risk and calendar events remain visible.',
      tone: 'amber'
    };
  }
  return {
    id: `module-${index}`,
    label: 'Module issue',
    detail: message,
    tone: 'amber'
  };
}

function buildQualityIssues(params: {
  error: string | null;
  warning?: string;
  moduleErrors: string[];
  sourceMode: string;
}): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (params.error) {
    issues.push({
      id: 'load-error',
      label: 'Calendar down',
      detail: params.error,
      tone: 'rose'
    });
  }
  if (params.warning) {
    issues.push({
      id: 'source-warning',
      label: params.sourceMode === 'Saved cache' ? 'Saved cache' : 'Source issue',
      detail: params.warning,
      tone: 'amber'
    });
  }
  params.moduleErrors.forEach((message, index) => {
    issues.push(readableModuleIssue(message, index));
  });
  return issues;
}

function issueSummary(issues: QualityIssue[]): string {
  if (issues.length === 0) return 'OK';
  if (issues.length === 1) return issues[0].label;
  return `${issues.length} issues`;
}

function selectionLabel(selection: TimeSelection, timeZone: string): string | null {
  if (!selection) return null;
  if (selection.bucketStart === null) return formatDayLabel(selection.date, timeZone);
  return `${formatDayLabel(selection.date, timeZone)} ${formatBucketLabel(selection.bucketStart)}`;
}

export default function EconomicCalendarPage() {
  const [state, setState] = useState<MacroState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>('FOCUS');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [timeSelection, setTimeSelection] = useState<TimeSelection>(null);
  const [sideTab, setSideTab] = useState<SideTab>('brief');
  const [displayTimeZone, setDisplayTimeZone] = useState(readTimeZonePreference);

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

  useEffect(() => {
    persistTimeZonePreference(displayTimeZone);
  }, [displayTimeZone]);

  const deskEvents = useMemo(() => normalizeDeskEvents(state.calendar, displayTimeZone), [displayTimeZone, state.calendar]);
  const bucketMap = useMemo(() => buildBucketMap(deskEvents), [deskEvents]);
  const dayEntries = useMemo(() => {
    const grouped = new Map<string, DeskEvent[]>();
    deskEvents.forEach((event) => {
      grouped.set(event.dateKey, [...(grouped.get(event.dateKey) ?? []), event]);
    });
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [deskEvents]);
  const currencies = useMemo(
    () => Array.from(new Set(deskEvents.map((event) => event.currency).filter(Boolean))).sort(),
    [deskEvents]
  );
  const nextEventIds = useMemo(() => {
    const ids = new Set<string>();
    deskEvents
      .filter((event) => event.isUpcoming)
      .slice(0, 6)
      .forEach((event) => ids.add(`${event.dateKey}-${event.id}-${event.event_name}`));
    return ids;
  }, [deskEvents]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = deskEvents.filter((event) => {
      if (timeSelection?.date && event.dateKey !== timeSelection.date) return false;
      if (timeSelection?.bucketStart !== null && timeSelection?.bucketStart !== undefined && event.bucketStart !== timeSelection.bucketStart) return false;
      if (currencyFilter !== 'ALL' && event.currency !== currencyFilter) return false;
      if (normalizedQuery && !event.searchText.includes(normalizedQuery)) return false;

      if (impactFilter === 'FOCUS') {
        const eventKey = `${event.dateKey}-${event.id}-${event.event_name}`;
        return event.impact === 'HIGH' || event.impact === 'MEDIUM' || nextEventIds.has(eventKey);
      }
      if (impactFilter === 'ALL') return true;
      return event.impact === impactFilter;
    });

    return matches.sort((left, right) => {
      if (impactFilter === 'FOCUS') {
        return impactRank(right.impact) - impactRank(left.impact) || left.timestamp - right.timestamp;
      }
      return left.timestamp - right.timestamp || impactRank(right.impact) - impactRank(left.impact);
    });
  }, [currencyFilter, deskEvents, impactFilter, nextEventIds, query, timeSelection]);

  const calendarEvents = useMemo(() => collectEvents(state.calendar), [state.calendar]);
  const highImpactEvents = useMemo(
    () => deskEvents.filter((event) => event.impact === 'HIGH'),
    [deskEvents]
  );
  const mediumImpactEvents = useMemo(
    () => deskEvents.filter((event) => event.impact === 'MEDIUM'),
    [deskEvents]
  );
  const intelligence = state.intelligence;
  const todayKey = formatDateKeyInTimeZone(new Date(), displayTimeZone);
  const tomorrowDate = new Date(Date.now() + 86_400_000);
  const tomorrowKey = formatDateKeyInTimeZone(tomorrowDate, displayTimeZone);
  const todayEvents = deskEvents.filter((event) => event.dateKey === todayKey);
  const tomorrowEvents = deskEvents.filter((event) => event.dateKey === tomorrowKey);

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
  const rawRecommendations = intelligence?.model.operator_notes ?? state.analysis?.analysis.recommendations ?? state.brief?.brief.recommendations ?? [];
  const recommendations = rawRecommendations.filter((item) => !isWarningRecommendation(item));
  const activeSource = intelligence?.quality.provider ?? calendarSourceMode(state.calendar);
  const qualityIssues = buildQualityIssues({
    error,
    warning: warning ?? undefined,
    moduleErrors: state.moduleErrors,
    sourceMode: activeSource
  });
  const summary =
    intelligence?.model.headline ??
    intelligence?.today_desk.headline ??
    recommendations[0] ??
    (state.brief?.brief.executive_summary && !isWarningRecommendation(state.brief.brief.executive_summary) ? state.brief.brief.executive_summary : null) ??
    `${highImpactEvents.length} high-impact and ${mediumImpactEvents.length} medium-impact events this week.`;
  const standAsideWindows = intelligence?.stand_aside_windows.map((window) => `${formatUpdatedAt(window.start, displayTimeZone)}-${formatUpdatedAt(window.end, displayTimeZone)} ${window.label}`) ?? [
    ...highImpactEvents.slice(0, 8).map((event) => `${event.dateKey} ${event.timeLabel} ${event.currency} ${event.event_name}`),
    ...(state.brief?.brief.stand_aside_windows ?? []).slice(0, 4)
  ];
  const criticalDays = state.analysis?.analysis.critical_days ?? [];
  const selectedLabel = selectionLabel(timeSelection, displayTimeZone);

  const clearFilters = () => {
    setImpactFilter('FOCUS');
    setCurrencyFilter('ALL');
    setQuery('');
    setTimeSelection(null);
  };

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-3 py-3 lg:px-4">
      <div className="sticky top-0 z-20 rounded-lg border border-white/10 bg-[#050914]/95 p-2.5 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase text-cyan-200/90">
                <CalendarDays size={14} />
                Macro Calendar
              </div>
              <span className={`rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${riskTone(risk)}`}>{risk}</span>
              <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${sourceStatusTone(intelligence?.quality.status)}`}>
                {compactSourceStatus(activeSource)}
              </span>
              <CompactIssuePills issues={qualityIssues} />
              <span className="truncate text-xs text-white/40">Updated {formatUpdatedAt(state.calendar?.updated_at, displayTimeZone)}</span>
            </div>
            <div className="mt-1 line-clamp-1 text-sm leading-5 text-white/70">{summary}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 text-[10px] font-bold uppercase text-cyan-100">
              Time
              <select
                value={displayTimeZone}
                onChange={(event) => {
                  setDisplayTimeZone(event.target.value);
                  setTimeSelection(null);
                }}
                className="h-7 max-w-[150px] rounded border border-white/10 bg-black/40 px-1.5 text-xs font-semibold normal-case text-white outline-none"
                title="Display calendar events in this timezone"
              >
                {timeZoneOptions(displayTimeZone).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <TopMetric label="Today" value={String(todayEvents.length)} helper={`${todayEvents.filter((event) => event.impact === 'HIGH').length}H`} />
            <TopMetric label="Tomorrow" value={String(tomorrowEvents.length)} helper={`${tomorrowEvents.filter((event) => event.impact === 'HIGH').length}H`} />
            <TopMetric label="Week" value={String(state.calendar?.count ?? 0)} helper={`${highImpactEvents.length}H ${mediumImpactEvents.length}M`} />
            <TopMetric label="Posture" value={postureLabel(intelligence?.model.posture ?? intelligence?.today_desk.posture)} />
            <button
              type="button"
              onClick={() => void load(true)}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-white transition hover:bg-white/[0.12]"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>

      </div>

      <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-3">
          <DeskPanel
            title="Week / Hour Map"
            icon={<Clock3 size={15} />}
            action={selectedLabel ? (
              <button
                type="button"
                onClick={() => setTimeSelection(null)}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[11px] font-semibold text-cyan-100"
              >
                <XCircle size={12} />
                {selectedLabel}
              </button>
            ) : null}
          >
            <WeekHourMap
              dayEntries={dayEntries}
              bucketMap={bucketMap}
              selection={timeSelection}
              timeZone={displayTimeZone}
              onSelect={setTimeSelection}
            />
          </DeskPanel>

          <DeskPanel
            title="Events"
            icon={<CalendarDays size={15} />}
            action={<span className="text-[11px] text-white/40">{filteredEvents.length} shown / {calendarEvents.length} total</span>}
          >
            <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_140px_auto]">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {impactFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setImpactFilter(filter.id)}
                    className={`rounded-md border px-2.5 py-1.5 text-[11px] font-bold uppercase transition ${
                      impactFilter === filter.id
                        ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-50'
                        : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-white'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <select
                value={currencyFilter}
                onChange={(event) => setCurrencyFilter(event.target.value)}
                className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-white outline-none transition focus:border-cyan-300/40"
              >
                <option value="ALL">All CCY</option>
                {currencies.map((currency) => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 text-xs font-semibold text-white/60 transition hover:text-white"
              >
                <XCircle size={13} />
                Clear
              </button>
            </div>

            <label className="mb-3 flex h-9 items-center gap-2 rounded-md border border-white/10 bg-black/25 px-2 text-xs text-white/45 focus-within:border-cyan-300/40">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search event, currency, forecast..."
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
            </label>

            <EventTable events={filteredEvents} selection={timeSelection} timeZone={displayTimeZone} />
          </DeskPanel>
        </main>

        <aside className="min-w-0 xl:sticky xl:top-[124px] xl:self-start">
          <RightRail
            activeTab={sideTab}
            onTabChange={setSideTab}
              recommendations={recommendations}
              standAsideWindows={standAsideWindows}
              criticalDays={criticalDays}
              qualityIssues={qualityIssues}
              sourceMode={activeSource}
              updatedAt={formatUpdatedAt(state.calendar?.updated_at, displayTimeZone)}
              sourceTimeZone={state.calendar?.timezone ?? 'n/a'}
              intelligence={intelligence}
            brief={state.brief}
            briefLoading={briefLoading}
            analysis={state.analysis}
            news={state.news}
            holidays={state.holidays}
            aiRisk={aiRisk}
          />
        </aside>
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

function WeekHourMap({
  dayEntries,
  bucketMap,
  selection,
  timeZone,
  onSelect
}: {
  dayEntries: Array<[string, DeskEvent[]]>;
  bucketMap: Map<string, DeskEvent[]>;
  selection: TimeSelection;
  timeZone: string;
  onSelect: (selection: TimeSelection) => void;
}) {
  if (dayEntries.length === 0) {
    return <Empty text="Calendar endpoint is not available on the active backend." />;
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[760px] gap-1"
        style={{ gridTemplateColumns: `54px repeat(${dayEntries.length}, minmax(98px, 1fr))` }}
      >
        <div />
        {dayEntries.map(([date, events]) => (
          <button
            key={date}
            type="button"
            onClick={() => onSelect({ date, bucketStart: null })}
            className={`rounded-md border px-2 py-1.5 text-left transition ${
              selection?.date === date && selection.bucketStart === null
                ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-50'
                : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white'
            }`}
          >
            <div className="truncate text-[11px] font-bold uppercase">{formatDayLabel(date, timeZone)}</div>
            <div className="mt-0.5 text-[10px] text-white/35">
              {events.length} events / {events.filter((event) => event.impact === 'HIGH').length}H
            </div>
          </button>
        ))}

        {bucketStarts.map((start) => (
          <Fragment key={start}>
            <div key={`label-${start}`} className="flex h-8 items-center justify-end pr-1 text-[10px] font-semibold text-white/30">
              {String(start).padStart(2, '0')}
            </div>
            {dayEntries.map(([date]) => {
              const events = bucketMap.get(`${date}|${start}`) ?? [];
              const strongest = maxImpact(events);
              const selected = selection?.date === date && selection.bucketStart === start;
              return (
                <button
                  key={`${date}-${start}`}
                  type="button"
                  onClick={() => events.length > 0 && onSelect({ date, bucketStart: start })}
                  disabled={events.length === 0}
                  className={`h-8 rounded-md border px-1 text-center text-[11px] font-bold transition disabled:cursor-default ${cellTone(strongest, events.length, selected)}`}
                  title={`${formatDayLabel(date, timeZone)} ${formatBucketLabel(start)}: ${events.length} event(s)`}
                >
                  {events.length > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <span>{events.length}</span>
                      {strongest ? <span className="text-[9px] uppercase opacity-70">{strongest.slice(0, 1)}</span> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function EventTable({ events, selection, timeZone }: { events: DeskEvent[]; selection: TimeSelection; timeZone: string }) {
  if (events.length === 0) {
    return <Empty text={selection ? 'No events match the active time and filters.' : 'No calendar events match the active filters.'} />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-white/10">
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#070b15] text-[10px] uppercase text-white/35">
            <tr>
              <th className="w-[88px] px-2 py-2 font-bold">Day</th>
              <th className="w-[70px] px-2 py-2 font-bold">Time</th>
              <th className="w-[64px] px-2 py-2 font-bold">CCY</th>
              <th className="w-[82px] px-2 py-2 font-bold">Impact</th>
              <th className="px-2 py-2 font-bold">Event</th>
              <th className="w-[86px] px-2 py-2 font-bold">Forecast</th>
              <th className="w-[86px] px-2 py-2 font-bold">Previous</th>
              <th className="w-[78px] px-2 py-2 font-bold">Actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] text-sm">
            {events.map((event) => {
              const selected = selection?.date === event.dateKey && (selection.bucketStart === null || selection.bucketStart === event.bucketStart);
              return (
                <tr key={`${event.dateKey}-${event.id}-${event.event_name}`} className={selected ? 'bg-cyan-300/[0.05]' : 'bg-white/[0.015] odd:bg-transparent'}>
                  <td className="whitespace-nowrap px-2 py-2 text-xs font-semibold text-white/55">{formatDayLabel(event.dateKey, timeZone)}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-white/70">{event.timeLabel}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs font-bold text-cyan-100">{event.currency}</td>
                  <td className="px-2 py-2"><ImpactBadge impact={event.impact} /></td>
                  <td className="min-w-0 px-2 py-2">
                    <div className="line-clamp-2 text-white/80">{event.event_name}</div>
                    {event.is_fallback ? <div className="mt-0.5 text-[10px] font-semibold uppercase text-amber-200/80">fallback</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs text-white/50">{formatDataPoint(event.forecast)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs text-white/50">{formatDataPoint(event.previous)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs text-white/50">{formatDataPoint(event.actual)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RightRail({
  activeTab,
  onTabChange,
  recommendations,
  standAsideWindows,
  criticalDays,
  qualityIssues,
  sourceMode,
  updatedAt,
  sourceTimeZone,
  intelligence,
  brief,
  briefLoading,
  analysis,
  news,
  holidays,
  aiRisk
}: {
  activeTab: SideTab;
  onTabChange: (tab: SideTab) => void;
  recommendations: string[];
  standAsideWindows: string[];
  criticalDays: CalendarAnalysis['analysis']['critical_days'];
  qualityIssues: QualityIssue[];
  sourceMode: string;
  updatedAt: string;
  sourceTimeZone: string;
  intelligence: CalendarIntelligence | null;
  brief: WeeklyBrief | null;
  briefLoading: boolean;
  analysis: CalendarAnalysis | null;
  news: MacroNews | null;
  holidays: BankHolidays | null;
  aiRisk?: string;
}) {
  const tabs: Array<{ id: SideTab; label: string; icon: ReactNode }> = [
    { id: 'brief', label: 'Brief', icon: <Brain size={13} /> },
    { id: 'checklist', label: 'Checks', icon: <DatabaseZap size={13} /> },
    { id: 'news', label: 'News', icon: <Newspaper size={13} /> },
    { id: 'holidays', label: 'Holidays', icon: <Landmark size={13} /> }
  ];

  return (
    <DeskPanel title="Macro Rail" icon={<Brain size={15} />}>
      <div className="mb-3 grid grid-cols-4 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[11px] font-bold transition ${
              activeTab === tab.id
                ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-50'
                : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'brief' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="Risk" value={aiRisk ?? analysis?.analysis.overall_risk ?? 'n/a'} />
            <MiniMetric label="Status" value={issueSummary(qualityIssues)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="Source" value={compactSourceStatus(sourceMode)} />
            <MiniMetric label="Updated" value={updatedAt} />
          </div>
          <QualityIssueList issues={qualityIssues} sourceTimeZone={sourceTimeZone} provider={providerLabel(brief, analysis)} />
          {briefLoading ? (
            <div className="flex items-center gap-2 rounded-md border border-cyan-400/20 bg-cyan-400/10 p-2 text-xs text-cyan-100">
              <RefreshCw size={13} className="animate-spin" />
              Loading brief
            </div>
          ) : null}
          <RailList
            title="Critical Days"
            items={criticalDays.slice(0, 5).map((day) => `${day.date} ${day.risk_level}: ${day.trading_recommendation}`)}
            empty="No critical days returned."
            tone="rose"
          />
          <RailList title="Stand Aside" items={standAsideWindows.slice(0, 6)} empty="No stand-aside windows." tone="rose" />
          <RailList title="Recommendations" items={recommendations.slice(0, 7)} empty="No recommendations returned." />
        </div>
      ) : null}

      {activeTab === 'checklist' ? (
        <div className="space-y-3">
          <Checklist label="Before" items={intelligence?.model.watch_before ?? []} />
          <Checklist label="During" items={intelligence?.model.watch_during ?? []} />
          <Checklist label="After" items={intelligence?.model.watch_after ?? []} />
          {!intelligence ? <Empty text="Calendar intelligence endpoint unavailable; using basic modules." /> : null}
        </div>
      ) : null}

      {activeTab === 'news' ? (
        <div className="grid gap-2">
          {(news?.items ?? []).slice(0, 12).map((item) => (
            <a key={item.id} href={item.url ?? undefined} target="_blank" rel="noreferrer" className="rounded-md border border-white/10 bg-white/[0.03] p-2 transition hover:border-cyan-400/30">
              <div className="flex items-center gap-2">
                <ImpactBadge impact={item.impact} />
                <span className="truncate text-[11px] text-white/40">{item.source}</span>
              </div>
              <div className="mt-1 line-clamp-2 text-sm font-semibold text-white/80">{item.title}</div>
            </a>
          ))}
          {!news ? <Empty text="News endpoint is not available on the active backend yet." /> : null}
          {news && news.items.length === 0 ? <Empty text="No news feed items returned." /> : null}
        </div>
      ) : null}

      {activeTab === 'holidays' ? (
        <div className="grid gap-2">
          {(holidays?.holidays ?? []).map((holiday) => (
            <div key={`${holiday.country}-${holiday.date}-${holiday.name}`} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-white">{holiday.date}</div>
                <div className="text-[11px] font-bold text-cyan-200">{holiday.country}</div>
              </div>
              <div className="mt-1 line-clamp-2 text-sm text-white/70">{holiday.name}</div>
              <div className="mt-0.5 text-[11px] text-white/40">{holiday.country_name}</div>
            </div>
          ))}
          {!holidays ? <Empty text="Bank holiday endpoint is not available on the active backend yet." /> : null}
          {holidays && holidays.holidays.length === 0 ? <Empty text="No bank holidays detected in the selected window." /> : null}
        </div>
      ) : null}
    </DeskPanel>
  );
}

function DeskPanel({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/25 p-3">
      <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase text-white/45">
          {icon}
          {title}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function TopMetric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="h-10 min-w-[70px] rounded-md border border-white/10 bg-white/[0.03] px-2 py-1">
      <div className="text-[9px] font-bold uppercase text-white/35">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="truncate text-sm font-semibold text-white">{value}</span>
        {helper ? <span className="text-[10px] text-white/35">{helper}</span> : null}
      </div>
    </div>
  );
}

function CompactIssuePills({ issues }: { issues: QualityIssue[] }) {
  if (issues.length === 0) {
    return <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100">OK</span>;
  }

  return (
    <>
      {issues.slice(0, 2).map((issue) => (
        <span
          key={issue.id}
          title={issue.detail}
          className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
            issue.tone === 'rose'
              ? 'border-rose-500/25 bg-rose-500/10 text-rose-100'
              : 'border-amber-500/25 bg-amber-500/10 text-amber-100'
          }`}
        >
          {issue.label}
        </span>
      ))}
      {issues.length > 2 ? (
        <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-100">
          +{issues.length - 2}
        </span>
      ) : null}
    </>
  );
}

function QualityIssueList({ issues, sourceTimeZone, provider }: { issues: QualityIssue[]; sourceTimeZone: string; provider: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.025] p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase text-white/35">Data Status</div>
        <div className="truncate text-[10px] text-white/35">{provider} / {sourceTimeZone}</div>
      </div>
      <div className="mt-2 grid gap-1.5">
        {issues.length === 0 ? (
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-100">Calendar source is clean.</div>
        ) : (
          issues.map((issue) => (
            <div
              key={issue.id}
              className={`rounded-md border px-2 py-1.5 text-xs ${
                issue.tone === 'rose'
                  ? 'border-rose-500/20 bg-rose-500/10 text-rose-100'
                  : 'border-amber-500/20 bg-amber-500/10 text-amber-100'
              }`}
            >
              <div className="font-semibold">{issue.label}</div>
              <div className="mt-0.5 line-clamp-2 opacity-80">{issue.detail}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-2">
      <div className="text-[10px] font-bold uppercase text-white/35">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-white/80">{value}</div>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  return <span className={`inline-flex min-w-[54px] justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${impactTone(impact)}`}>{impact}</span>;
}

function Checklist({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-bold uppercase text-white/35">{label}</div>
      <div className="grid gap-1.5">
        {items.slice(0, 5).map((item) => (
          <div key={item} className="rounded-md border border-white/10 bg-white/[0.03] p-2 text-sm leading-5 text-white/70">{item}</div>
        ))}
        {items.length === 0 ? <div className="text-sm text-white/40">No model notes returned.</div> : null}
      </div>
    </div>
  );
}

function RailList({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone?: 'rose' }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-bold uppercase text-white/35">{title}</div>
      <div className="grid gap-1.5">
        {items.map((item) => (
          <div
            key={item}
            className={`rounded-md border p-2 text-sm leading-5 ${
              tone === 'rose'
                ? 'border-rose-500/20 bg-rose-500/10 text-rose-100'
                : 'border-white/10 bg-white/[0.03] text-white/70'
            }`}
          >
            {item}
          </div>
        ))}
        {items.length === 0 ? <div className="text-sm text-white/40">{empty}</div> : null}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-4 text-center text-sm text-white/45">{text}</div>;
}
