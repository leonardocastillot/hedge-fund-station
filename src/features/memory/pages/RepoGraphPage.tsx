import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink,
  FileText,
  GitBranch,
  Network,
  RefreshCw
} from 'lucide-react';
import {
  hyperliquidService,
  type HyperliquidGraphifyStatus
} from '@/services/hyperliquidService';

type GraphifyOpenPathMessage = {
  type: 'graphify:open-path';
  path: string;
  label?: string | null;
};

function isGraphifyOpenPathMessage(value: unknown): value is GraphifyOpenPathMessage {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return payload.type === 'graphify:open-path' && typeof payload.path === 'string' && payload.path.length > 0;
}

function formatGraphCount(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : 'N/A';
}

function formatGraphUpdatedAt(value: number | null): string {
  if (!value) return 'Not built';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatGraphCommit(value: string | null | undefined): string {
  return value?.trim() || 'N/A';
}

function formatGraphWorktree(value: boolean | null | undefined): string {
  if (typeof value !== 'boolean') return 'Unknown';
  return value ? 'Dirty' : 'Clean';
}

function graphFreshnessSummary(status: HyperliquidGraphifyStatus | null): { label: string; tone: string } {
  if (!status) {
    return { label: 'Checking Graphify', tone: 'text-white/60' };
  }
  if (!status.available) {
    return { label: 'Build pending', tone: 'text-amber-200' };
  }
  switch (status.freshness) {
    case 'fresh':
      return { label: 'Fresh', tone: 'text-emerald-200' };
    case 'dirty':
      return { label: 'Working tree changed', tone: 'text-amber-200' };
    case 'stale':
      return { label: 'Stale commit', tone: 'text-rose-200' };
    case 'missing':
      return { label: 'Build pending', tone: 'text-amber-200' };
    default:
      return { label: 'Freshness unknown', tone: 'text-white/60' };
  }
}

export default function RepoGraphPage() {
  const repoGraphIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [graphifyStatus, setGraphifyStatus] = useState<HyperliquidGraphifyStatus | null>(null);
  const [repoGraphExpanded, setRepoGraphExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadGraphify = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const status = await hyperliquidService.getGraphifyStatus();
      setGraphifyStatus(status);
    } catch (err) {
      setGraphifyStatus({
        available: false,
        updatedAt: null,
        outputDir: 'graphify-out',
        reportPath: 'graphify-out/GRAPH_REPORT.md',
        graphJsonPath: 'graphify-out/graph.json',
        htmlPath: 'graphify-out/graph.html',
        explorerUrl: '',
        htmlUrl: '',
        nodeCount: null,
        edgeCount: null,
        communityCount: null,
        warnings: [err instanceof Error ? err.message : 'Graphify status could not be loaded.']
      });
      setError(err instanceof Error ? err.message : 'Graphify status could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadGraphify(true);
  }, []);

  useEffect(() => {
    const handleGraphifyMessage = async (event: MessageEvent) => {
      const sourceWindow = repoGraphIframeRef.current?.contentWindow;
      if (!sourceWindow || event.source !== sourceWindow || !isGraphifyOpenPathMessage(event.data)) {
        return;
      }
      if (!window.electronAPI?.obsidian?.openPath) {
        setError('Opening Graphify source files is only available inside the Electron app.');
        return;
      }

      setError(null);
      setMessage(null);
      try {
        await window.electronAPI.obsidian.openPath(event.data.path);
        setMessage(`Opening Graphify source: ${event.data.label || event.data.path}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open Graphify source file.');
      }
    };

    window.addEventListener('message', handleGraphifyMessage);
    return () => window.removeEventListener('message', handleGraphifyMessage);
  }, []);

  const openGraphifyPath = async (targetPath: string | null | undefined) => {
    if (!targetPath) {
      setError('Graphify path is not available yet. Run npm run graph:build.');
      return;
    }
    if (!window.electronAPI?.obsidian?.openPath) {
      setError('Opening Graphify files is only available inside the Electron app.');
      return;
    }

    setError(null);
    setMessage(null);
    try {
      await window.electronAPI.obsidian.openPath(targetPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open Graphify artifact.');
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-7xl items-center justify-center px-4 py-8">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1560px] flex-col gap-4 px-4 py-5 sm:px-5">
      <section className="border-b border-white/10 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-[min(100%,46rem)]">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-cyan-300/80">
              <Network className="h-4 w-4" />
              Repo Graph
            </div>
            <h1 className="mt-1 text-xl font-semibold leading-tight text-white sm:text-2xl">Graphify Repository Map</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Use this route for repo topology and source navigation. Strategy memory stays on <Link to="/memory" className="font-semibold text-cyan-200 transition hover:text-cyan-100">/memory</Link>.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={() => void loadGraphify(false)}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-500/12 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/22 sm:flex-none"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>

        {message ? <div className="mt-4 rounded-md border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-50">{message}</div> : null}
        {error ? <div className="mt-4 rounded-md border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
      </section>

      <RepoGraphPanel
        status={graphifyStatus}
        canOpen={Boolean(window.electronAPI?.obsidian?.openPath)}
        expanded={repoGraphExpanded}
        iframeRef={repoGraphIframeRef}
        onToggleExpanded={() => setRepoGraphExpanded((value) => !value)}
        onOpenReport={() => void openGraphifyPath(graphifyStatus?.reportPath)}
        onOpenHtml={() => void openGraphifyPath(graphifyStatus?.htmlPath)}
      />
    </div>
  );
}

function RepoGraphPanel({
  status,
  canOpen,
  expanded,
  iframeRef,
  onToggleExpanded,
  onOpenReport,
  onOpenHtml
}: {
  status: HyperliquidGraphifyStatus | null;
  canOpen: boolean;
  expanded: boolean;
  iframeRef: RefObject<HTMLIFrameElement>;
  onToggleExpanded: () => void;
  onOpenReport: () => void;
  onOpenHtml: () => void;
}) {
  const available = Boolean(status?.available);
  const warnings = status?.warnings || [];
  const isLoading = status === null;
  const iframeSrc = available ? status?.explorerUrl || status?.htmlUrl || null : null;
  const freshness = graphFreshnessSummary(status);

  return (
    <section className="overflow-hidden rounded-md border border-white/10 bg-black/20">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Network className="h-4 w-4 text-cyan-200" />
              Repo Graph
            </div>
            <div className={`mt-1 text-xs font-semibold ${freshness.tone}`}>
              {freshness.label}
            </div>
            <div className="mt-1 truncate text-xs text-white/40">
              {status?.outputDir || 'graphify-out'}
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={onToggleExpanded}
              disabled={!available}
              className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md border border-fuchsia-400/25 bg-fuchsia-500/15 px-3 py-2 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-white/35 sm:flex-none"
            >
              <GitBranch className="h-4 w-4" />
              {expanded ? 'Hide Map' : 'Show Map'}
            </button>
            <button
              type="button"
              onClick={onOpenReport}
              disabled={!available || !canOpen}
              className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-white/35 sm:flex-none"
            >
              <FileText className="h-4 w-4" />
              Report
            </button>
            <button
              type="button"
              onClick={onOpenHtml}
              disabled={!available || !canOpen}
              className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-500/12 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/22 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-white/35 sm:flex-none"
            >
              <ExternalLink className="h-4 w-4" />
              HTML
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
          <TinyMetric label="Nodes" value={formatGraphCount(status?.nodeCount ?? null)} />
          <TinyMetric label="Edges" value={formatGraphCount(status?.edgeCount ?? null)} />
          <TinyMetric label="Communities" value={formatGraphCount(status?.communityCount ?? null)} />
          <TinyMetric label="Updated" value={formatGraphUpdatedAt(status?.updatedAt ?? null)} />
          <TinyMetric label="Built" value={formatGraphCommit(status?.builtCommit)} />
          <TinyMetric label="HEAD" value={formatGraphCommit(status?.currentCommit)} />
          <TinyMetric label="Tree" value={formatGraphWorktree(status?.hasUncommittedChanges)} />
          <TinyMetric label="Command" value={status?.recommendedCommand || (isLoading ? 'Checking' : 'N/A')} />
        </div>

        {warnings.length > 0 ? (
          <div className="mt-3 rounded-md border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            {warnings.join(' ')}
          </div>
        ) : null}
      </div>

      {expanded && iframeSrc ? (
        <div className="border-t border-white/10 bg-[#0f0f1a]">
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title="Interactive Graphify repository map"
            className="h-[min(78vh,880px)] w-full bg-[#0f0f1a]"
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : null}
    </section>
  );
}

function TinyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</div>
      <div className="mt-1 truncate text-xs font-semibold text-white" title={value}>{value}</div>
    </div>
  );
}
