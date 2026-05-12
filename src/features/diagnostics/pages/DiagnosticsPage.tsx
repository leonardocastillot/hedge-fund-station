import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, ExternalLink, RefreshCw, RotateCcw, Terminal, Trash2, TriangleAlert } from 'lucide-react';
import {
  clearTelemetryEvents,
  subscribeTelemetry,
  type TelemetryEvent
} from '@/services/performanceTelemetry';
import { hyperliquidService, type HyperliquidReadinessCheck } from '@/services/hyperliquidService';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useMarketPolling } from '@/hooks/useMarketPolling';
import type { DevServiceStatus, DevStatus, DiagnosticsDataFootprintResult, DiagnosticsPerformanceSnapshotResult } from '@/types/electron';

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatBytes(bytes: number | null) {
  if (bytes === null) {
    return 'missing';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

type LocalPreflightCheck = {
  id: string;
  label: string;
  status: 'ready' | 'attention';
  detail: string;
};

export default function DiagnosticsPage() {
  const { activeWorkspace } = useWorkspaceContext();
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [devStatus, setDevStatus] = useState<DevStatus | null>(null);
  const [devStatusError, setDevStatusError] = useState<string | null>(null);
  const [devActionMessage, setDevActionMessage] = useState<string | null>(null);
  const [localChecks, setLocalChecks] = useState<LocalPreflightCheck[]>([]);
  const [localCheckError, setLocalCheckError] = useState<string | null>(null);
  const [localCheckLoading, setLocalCheckLoading] = useState(false);
  const [dataFootprint, setDataFootprint] = useState<DiagnosticsDataFootprintResult | null>(null);
  const [performanceSnapshot, setPerformanceSnapshot] = useState<DiagnosticsPerformanceSnapshotResult | null>(null);
  const isDevBuild = import.meta.env.DEV;

  useEffect(() => subscribeTelemetry(setEvents), []);

  const readinessPoll = useMarketPolling(
    'diagnostics:app-readiness',
    () => hyperliquidService.getAppReadiness(500),
    { intervalMs: 30_000, staleAfterMs: 90_000 }
  );

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

  const refreshLocalPreflight = async () => {
    if (!activeWorkspace) {
      setDataFootprint(null);
      setPerformanceSnapshot(null);
      setLocalChecks([{
        id: 'workspace',
        label: 'Workspace',
        status: 'attention',
        detail: 'No active workspace is loaded.'
      }]);
      return;
    }

    setLocalCheckLoading(true);
    setLocalCheckError(null);
    const nextChecks: LocalPreflightCheck[] = [];
    try {
      if (window.electronAPI?.diagnostics?.checkCommands) {
        const commandStatuses = await window.electronAPI.diagnostics.checkCommands(
          ['npm', 'git', 'codex'],
          { cwd: activeWorkspace.path, shell: activeWorkspace.shell }
        );
        const missing = commandStatuses.filter((item) => !item.available).map((item) => item.command);
        nextChecks.push({
          id: 'runtime_commands',
          label: 'Runtime commands',
          status: missing.length === 0 ? 'ready' : 'attention',
          detail: missing.length === 0
            ? commandStatuses.map((item) => `${item.command}${item.resolvedPath ? `:${item.resolvedPath}` : ''}`).join(' · ')
            : `Missing commands: ${missing.join(', ')}`
        });
      } else {
        nextChecks.push({
          id: 'runtime_commands',
          label: 'Runtime commands',
          status: 'attention',
          detail: 'Diagnostics command bridge is not available in this build.'
        });
      }

      if (window.electronAPI?.diagnostics?.shellSmokeTest) {
        const shell = await window.electronAPI.diagnostics.shellSmokeTest(activeWorkspace.path, activeWorkspace.shell);
        nextChecks.push({
          id: 'shell_smoke',
          label: 'Workspace shell',
          status: shell.success ? 'ready' : 'attention',
          detail: shell.success ? shell.output.trim().slice(0, 180) : shell.error || 'Shell smoke failed.'
        });
      }

      if (window.electronAPI?.terminal?.smokeTest) {
        const pty = await window.electronAPI.terminal.smokeTest(activeWorkspace.path, activeWorkspace.shell);
        nextChecks.push({
          id: 'pty_smoke',
          label: 'Terminal PTY',
          status: pty.success ? 'ready' : 'attention',
          detail: pty.success ? `PTY ok in ${pty.cwd} using ${pty.shell}.` : pty.error || 'PTY smoke failed.'
        });
      } else {
        nextChecks.push({
          id: 'pty_smoke',
          label: 'Terminal PTY',
          status: 'attention',
          detail: 'Terminal smoke bridge is not available.'
        });
      }

      if (window.electronAPI?.obsidian?.getStatus) {
        const obsidian = await window.electronAPI.obsidian.getStatus(activeWorkspace.path, activeWorkspace.obsidian_vault_path);
        nextChecks.push({
          id: 'obsidian_vault',
          label: 'Obsidian vault',
          status: obsidian.isAvailable && Boolean(obsidian.vaultPath) ? 'ready' : 'attention',
          detail: obsidian.vaultPath ? `Vault: ${obsidian.vaultPath}` : 'No curated vault is available yet.'
        });
      }

      if (window.electronAPI?.diagnostics?.getDataFootprint) {
        const footprint = await window.electronAPI.diagnostics.getDataFootprint(activeWorkspace.path);
        setDataFootprint(footprint);
        nextChecks.push({
          id: 'data_footprint',
          label: 'Local data footprint',
          status: footprint.isHeavy ? 'attention' : 'ready',
          detail: `data ${formatBytes(footprint.dataDirBytes)} · db ${formatBytes(footprint.dbBytes)}`
        });
      } else {
        setDataFootprint(null);
      }

      if (window.electronAPI?.diagnostics?.getPerformanceSnapshot) {
        const snapshot = await window.electronAPI.diagnostics.getPerformanceSnapshot();
        setPerformanceSnapshot(snapshot);
        nextChecks.push({
          id: 'electron_processes',
          label: 'Electron processes',
          status: snapshot.totals.rendererCount > 6 ? 'attention' : 'ready',
          detail: `${snapshot.processes.length} processes · ${snapshot.totals.rendererCount} renderers · ${snapshot.totals.cpuPercent.toFixed(1)}% CPU sample`
        });
      } else {
        setPerformanceSnapshot(null);
      }

      nextChecks.push({
        id: 'workbench_bridge',
        label: 'Workbench bridge',
        status: window.electronAPI?.missionConsole && window.electronAPI?.diagnostics ? 'ready' : 'attention',
        detail: window.electronAPI?.missionConsole && window.electronAPI?.diagnostics
          ? 'Mission Console and diagnostics bridges are available.'
          : 'Workbench bridge is not fully available in this runtime.'
      });
      setLocalChecks(nextChecks);
    } catch (error) {
      setLocalCheckError(error instanceof Error ? error.message : 'Unable to run local pre-flight.');
      setLocalChecks(nextChecks);
    } finally {
      setLocalCheckLoading(false);
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

  useEffect(() => {
    void refreshLocalPreflight();
  }, [activeWorkspace?.id]);

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
        <section className="rounded-[8px] border border-emerald-500/20 bg-black/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/70">Daily Pre-Flight</div>
              <div className="mt-1 text-xl font-semibold">Operator readiness before a full work session.</div>
              <div className="mt-1 text-sm text-white/50">
                Gateway, paper runtime, strategy evidence, terminal bridge, Workbench, and memory vault.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void readinessPoll.refresh()}
                className="inline-flex items-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/70"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh backend
              </button>
              <button
                type="button"
                onClick={() => void refreshLocalPreflight()}
                className="inline-flex items-center gap-2 rounded-[8px] border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100"
              >
                <Terminal className="h-4 w-4" />
                Run local smoke
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Metric label="Overall" value={readinessPoll.data?.overallStatus || (readinessPoll.status === 'loading' ? 'checking' : 'unknown')} />
            <Metric label="Ready checks" value={String(readinessPoll.data?.summary.readyChecks ?? 0)} />
            <Metric label="Attention" value={String((readinessPoll.data?.summary.attentionChecks ?? 0) + localChecks.filter((item) => item.status === 'attention').length)} />
            <Metric label="Live execution" value={readinessPoll.data?.summary.liveExecutionLocked ? 'locked' : 'check'} />
          </div>

          {readinessPoll.error || localCheckError ? (
            <div className="mt-4 rounded-[8px] border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
              {[readinessPoll.error, localCheckError].filter(Boolean).join(' | ')}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
            <div className="grid gap-2">
              {(readinessPoll.data?.checks || []).map((check) => (
                <ReadinessCheckRow key={check.id} check={check} />
              ))}
              {readinessPoll.status === 'loading' && !readinessPoll.data ? (
                <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3 text-sm text-white/50">Loading backend readiness...</div>
              ) : null}
            </div>
            <div className="grid content-start gap-2">
              {localChecks.map((check) => (
                <LocalCheckRow key={check.id} check={check} />
              ))}
              {localCheckLoading ? (
                <div className="rounded-[8px] border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-cyan-100">Running local smoke checks...</div>
              ) : null}
              {dataFootprint ? <DataFootprintCard footprint={dataFootprint} /> : null}
              {performanceSnapshot ? <PerformanceSnapshotCard snapshot={performanceSnapshot} /> : null}
              <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Daily commands</div>
                <div className="mt-2 grid gap-1 font-mono text-xs text-white/70">
                  {(readinessPoll.data?.dailyCommands || []).map((item) => (
                    <div key={item.command}>{item.command}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

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

function statusTone(status: string) {
  if (status === 'ready') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100';
  }
  if (status === 'blocked') {
    return 'border-rose-400/25 bg-rose-400/10 text-rose-100';
  }
  return 'border-amber-400/25 bg-amber-400/10 text-amber-100';
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'ready') {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />;
  }
  return <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />;
}

function ReadinessCheckRow({ check }: { check: HyperliquidReadinessCheck }) {
  return (
    <div className={`rounded-[8px] border p-3 ${statusTone(check.status)}`}>
      <div className="flex items-start gap-3">
        <StatusIcon status={check.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-white">{check.label}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">{check.status}</div>
          </div>
          <div className="mt-1 text-xs leading-5 text-white/65">{check.detail}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {check.route && check.actionLabel ? (
              <Link to={check.route} className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-white/80">
                {check.actionLabel}
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
            {check.command ? (
              <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-xs text-white/70">{check.command}</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function LocalCheckRow({ check }: { check: LocalPreflightCheck }) {
  return (
    <div className={`rounded-[8px] border p-3 ${statusTone(check.status)}`}>
      <div className="flex items-start gap-3">
        <StatusIcon status={check.status} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{check.label}</div>
          <div className="mt-1 break-words text-xs leading-5 text-white/65">{check.detail}</div>
        </div>
      </div>
    </div>
  );
}

function DataFootprintCard({ footprint }: { footprint: DiagnosticsDataFootprintResult }) {
  const tone = footprint.isHeavy
    ? 'border-amber-400/25 bg-amber-400/10 text-amber-100'
    : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100';

  return (
    <div className={`rounded-[8px] border p-3 ${tone}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">Backend data footprint</div>
      <div className="mt-2 grid gap-1 text-xs leading-5">
        <div>Data dir: {formatBytes(footprint.dataDirBytes)}</div>
        <div>SQLite: {formatBytes(footprint.dbBytes)}</div>
        <div className="text-white/60">{footprint.detail}</div>
      </div>
      {footprint.isHeavy ? (
        <div className="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-[11px] text-white/70">
          Verify /data mirror, then clean manually if local evidence is no longer needed.
        </div>
      ) : null}
    </div>
  );
}

function PerformanceSnapshotCard({ snapshot }: { snapshot: DiagnosticsPerformanceSnapshotResult }) {
  const topProcesses = snapshot.processes.slice(0, 5);

  return (
    <div className="rounded-[8px] border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-100">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">Electron process load</div>
      <div className="mt-2 grid gap-1 text-xs leading-5">
        <div>Total CPU sample: {snapshot.totals.cpuPercent.toFixed(1)}%</div>
        <div>Working set: {formatBytes(snapshot.totals.workingSetBytes)}</div>
        <div>Renderers: {snapshot.totals.rendererCount} · GPU: {snapshot.totals.gpuCount}</div>
      </div>
      <div className="mt-2 grid gap-1 font-mono text-[11px] text-white/70">
        {topProcesses.map((process) => (
          <div key={`${process.pid}-${process.type}`} className="flex justify-between gap-3">
            <span className="truncate">{process.type}{process.serviceName ? `:${process.serviceName}` : ''} #{process.pid}</span>
            <span>{process.cpuPercent.toFixed(1)}% · {formatBytes(process.workingSetBytes)}</span>
          </div>
        ))}
      </div>
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
