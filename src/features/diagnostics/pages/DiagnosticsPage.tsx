import { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import {
  clearTelemetryEvents,
  subscribeTelemetry,
  type TelemetryEvent
} from '@/services/performanceTelemetry';
import type { DevServiceStatus, DevStatus } from '@/types/electron';

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function DiagnosticsPage() {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [devStatus, setDevStatus] = useState<DevStatus | null>(null);
  const [devStatusError, setDevStatusError] = useState<string | null>(null);
  const [devActionMessage, setDevActionMessage] = useState<string | null>(null);
  const isDevBuild = import.meta.env.DEV;

  useEffect(() => subscribeTelemetry(setEvents), []);

  const refreshDevStatus = async () => {
    if (!isDevBuild || !window.electronAPI?.dev?.getStatus) {
      return;
    }

    try {
      const status = await window.electronAPI.dev.getStatus();
      setDevStatus(status);
      setDevStatusError(null);
    } catch (error) {
      setDevStatusError(error instanceof Error ? error.message : 'Unable to load dev status.');
    }
  };

  useEffect(() => {
    if (!isDevBuild) {
      return undefined;
    }

    void refreshDevStatus();
    const interval = window.setInterval(() => {
      void refreshDevStatus();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [isDevBuild]);

  const handleReloadRenderer = async () => {
    if (!window.electronAPI?.dev?.reloadRenderer) {
      setDevActionMessage('Dev bridge is not available in this build.');
      return;
    }

    setDevActionMessage('Reloading renderer.');
    await window.electronAPI.dev.reloadRenderer();
  };

  const handleRestartShell = async () => {
    if (!window.electronAPI?.dev?.restartShell) {
      setDevActionMessage('Dev bridge is not available in this build.');
      return;
    }

    setDevActionMessage('Restarting Electron shell.');
    await window.electronAPI.dev.restartShell();
  };

  const summary = useMemo(() => {
    const apiEvents = events.filter((event) => event.type === 'api');
    const staleEvents = events.filter((event) => event.type === 'stale');
    const errorEvents = events.filter((event) => event.type === 'error');
    const avgLatency = apiEvents.length
      ? Math.round(apiEvents.reduce((sum, event) => sum + (event.durationMs || 0), 0) / apiEvents.length)
      : 0;

    return { apiEvents: apiEvents.length, staleEvents: staleEvents.length, errorEvents: errorEvents.length, avgLatency };
  }, [events]);

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#020617_0%,#07111d_100%)] p-4 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        {isDevBuild ? (
          <section className="rounded-[8px] border border-emerald-500/20 bg-black/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/70">Development Shell</div>
                <div className="mt-1 text-xl font-semibold">Live reload and native restart control.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void refreshDevStatus()}
                  className="inline-flex items-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/70"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void handleReloadRenderer()}
                  className="inline-flex items-center gap-2 rounded-[8px] border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload renderer
                </button>
                <button
                  type="button"
                  onClick={() => void handleRestartShell()}
                  className="inline-flex items-center gap-2 rounded-[8px] border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restart Electron shell
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <Metric label="Renderer" value={devStatus?.rendererLive ? 'live' : 'offline'} />
              <Metric label="Native restart" value={devStatus?.nativeRestartRequired ? 'required' : 'clear'} />
              <ServiceMetric label="Vite" service={devStatus?.services.vite} />
              <ServiceMetric label="Gateway" service={devStatus?.services.gateway} />
              <ServiceMetric label="Backend" service={devStatus?.services.backend} />
            </div>

            {devStatus?.nativeChangedPaths.length ? (
              <div className="mt-4 rounded-[8px] border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                <div className="font-semibold">Native files changed</div>
                <div className="mt-2 font-mono text-xs text-amber-50/75">
                  {devStatus.nativeChangedPaths.join(' · ')}
                </div>
              </div>
            ) : null}

            {devStatusError ? (
              <div className="mt-4 rounded-[8px] border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100">{devStatusError}</div>
            ) : null}
            {devActionMessage ? (
              <div className="mt-4 rounded-[8px] border border-white/10 bg-white/[0.04] p-3 text-sm text-white/65">{devActionMessage}</div>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-[24px] border border-cyan-500/20 bg-black/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300/70">Runtime Diagnostics</div>
              <div className="mt-1 text-xl font-semibold">Frontend performance and crisis-state evidence.</div>
            </div>
            <button
              type="button"
              onClick={clearTelemetryEvents}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/70"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Metric label="API events" value={String(summary.apiEvents)} />
            <Metric label="Avg API latency" value={`${summary.avgLatency}ms`} />
            <Metric label="Stale events" value={String(summary.staleEvents)} />
            <Metric label="Render errors" value={String(summary.errorEvents)} />
          </div>
        </section>

        <section className="rounded-[24px] border border-white/10 bg-black/25 p-4">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
            <Activity className="h-4 w-4 text-cyan-300" />
            Recent events
          </div>

          <div className="mt-4 overflow-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm text-white/75">
              <thead className="bg-[#08111c] text-[10px] uppercase tracking-[0.18em] text-white/35">
                <tr>
                  <th className="px-3 py-3">Time</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Label</th>
                  <th className="px-3 py-3">Duration</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-white/40">No telemetry yet.</td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id} className="border-t border-white/5">
                      <td className="whitespace-nowrap px-3 py-3">{formatTime(event.timestamp)}</td>
                      <td className="px-3 py-3">{event.type}</td>
                      <td className="max-w-[280px] truncate px-3 py-3 text-white">{event.label}</td>
                      <td className="px-3 py-3">{typeof event.durationMs === 'number' ? `${event.durationMs}ms` : 'n/a'}</td>
                      <td className="px-3 py-3">{event.status || 'n/a'}</td>
                      <td className="max-w-[420px] truncate px-3 py-3 text-white/50">{event.detail || ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function ServiceMetric({ label, service }: { label: string; service?: DevServiceStatus }) {
  const value = service
    ? service.ok
      ? `${service.statusCode ?? 'ok'} · ${service.latencyMs ?? 0}ms`
      : service.error || 'offline'
    : 'checking';

  return <Metric label={label} value={value} />;
}
