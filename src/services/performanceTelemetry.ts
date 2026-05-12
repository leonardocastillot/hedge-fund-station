export type TelemetryEventType = 'route' | 'api' | 'polling' | 'stale' | 'error' | 'webview' | 'fps';

export interface TelemetryEvent {
  id: string;
  type: TelemetryEventType;
  label: string;
  timestamp: number;
  durationMs?: number | null;
  status?: string;
  detail?: string | null;
}

type Listener = (events: TelemetryEvent[]) => void;

const MAX_EVENTS = 160;
const listeners = new Set<Listener>();
let events: TelemetryEvent[] = [];

function notify() {
  const snapshot = [...events];
  listeners.forEach((listener) => listener(snapshot));
}

export function recordTelemetry(event: Omit<TelemetryEvent, 'id' | 'timestamp'> & { timestamp?: number }) {
  const nextEvent: TelemetryEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: event.timestamp ?? Date.now(),
    ...event
  };

  events = [nextEvent, ...events].slice(0, MAX_EVENTS);

  if (import.meta.env.DEV) {
    const duration = typeof nextEvent.durationMs === 'number' ? ` ${nextEvent.durationMs}ms` : '';
    console.debug(`[perf:${nextEvent.type}] ${nextEvent.label}${duration}`, nextEvent);
  }

  notify();
}

export function getTelemetryEvents() {
  return [...events];
}

export function clearTelemetryEvents() {
  events = [];
  notify();
}

export function subscribeTelemetry(listener: Listener) {
  listeners.add(listener);
  listener(getTelemetryEvents());
  return () => {
    listeners.delete(listener);
  };
}
