import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  CandlestickChart,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  History,
  Loader2,
  MoreHorizontal,
  Terminal
} from 'lucide-react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  hyperliquidService,
  type HyperliquidStrategyLabResponse
} from '@/services/hyperliquidService';
import { publishWorkspaceDockMode } from '../workspaceDockEvents';

const WorkspaceAgentView = React.lazy(() => import('@/features/agents/components/WorkspaceAgentView').then((module) => ({ default: module.WorkspaceAgentView })));

function compactCommand(command?: string | null): string {
  if (!command) return 'rtk npm run hf:status';
  return command.length > 54 ? `${command.slice(0, 51)}...` : command;
}

function compactPath(path?: string | null): string {
  if (!path) return 'repo-native';
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join('/')}`;
}

export default function DeskSpacePage() {
  const { activeWorkspace } = useWorkspaceContext();
  const activeStrategyPod = activeWorkspace?.kind === 'strategy-pod' ? activeWorkspace : null;
  const [lab, setLab] = useState<HyperliquidStrategyLabResponse | null>(null);
  const [labLoading, setLabLoading] = useState(false);
  const [podActionsOpen, setPodActionsOpen] = useState(false);
  const assetSymbol = activeStrategyPod?.asset_symbol || activeStrategyPod?.strategy_symbol || 'BTC';
  const assetDisplayName = activeStrategyPod?.asset_display_name || assetSymbol;
  const activeStrategyId = activeStrategyPod?.active_strategy_id || activeStrategyPod?.strategy_id;
  const assetWorkspaceDir = activeStrategyPod?.asset_workspace_dir || (activeStrategyPod ? `${activeStrategyPod.path.replace(/\/$/, '')}/docs/assets/${assetSymbol}` : null);
  const strategyIdeasDir = activeStrategyPod?.strategy_ideas_dir || (activeStrategyPod ? `${activeStrategyPod.path.replace(/\/$/, '')}/docs/assets/${assetSymbol}/ideas` : null);

  useEffect(() => {
    let cancelled = false;
    const strategyId = activeStrategyId;
    if (!strategyId) {
      setLab(null);
      return;
    }

    setLabLoading(true);
    hyperliquidService.getStrategyLab(strategyId, { artifactId: 'latest', interval: '1d' })
      .then((response) => {
        if (!cancelled) {
          setLab(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLab(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLabLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeStrategyId]);

  const suggestedCommands = useMemo(() => {
    const nextAction = lab?.nextAction.command || activeStrategyPod?.default_commands?.[1] || 'rtk npm run hf:status';
    const commands = [
      'rtk npm run agent:brief',
      nextAction,
      activeStrategyPod?.default_commands?.[2]
    ].filter((command): command is string => Boolean(command));
    return Array.from(new Set(commands)).slice(0, 3);
  }, [activeStrategyPod?.default_commands, lab?.nextAction.command]);

  const openDock = React.useCallback((dockMode: 'inspector' | 'code' | 'browser' | 'runs') => {
    if (activeStrategyPod) {
      publishWorkspaceDockMode(dockMode, activeStrategyPod.id);
    }
  }, [activeStrategyPod]);

  if (!activeStrategyPod) {
    return (
      <div className="grid h-full min-h-0 place-items-center bg-[var(--app-bg)] p-6 text-[var(--app-text)]">
        <div className="max-w-md rounded-md border border-dashed border-[var(--app-border)] bg-white/[0.025] p-5 text-center">
          <div className="text-sm font-black text-white">No active asset pod</div>
          <div className="mt-2 text-xs leading-5 text-[var(--app-subtle)]">
            Create or select a ticker from the left rail. Agent sessions and strategy inspection stay scoped to that asset.
          </div>
        </div>
      </div>
    );
  }

  const podStatus = activeStrategyPod.strategy_pod_status || (activeStrategyId ? 'catalog' : 'draft');
  const strategyLabel = activeStrategyPod.strategy_display_name || lab?.catalogRow.displayName || activeStrategyId || 'Designing a new strategy';
  const gateLabel = lab?.catalogRow.gateStatus || (podStatus === 'draft' ? 'draft' : 'gate pending');

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)]">
      <header className="shrink-0 border-b border-[var(--app-border)] px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">
                Asset Pod
              </span>
              <span className="truncate text-xs font-bold text-[var(--app-subtle)]">{assetSymbol}</span>
              <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-300">
                {podStatus}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-black tracking-[0] text-white">{assetDisplayName}</h1>
              <span className="inline-flex h-6 max-w-[280px] items-center rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] font-bold text-slate-300">
                <span className="truncate">Active: {strategyLabel}</span>
              </span>
              <span className="inline-flex h-6 items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] font-bold text-slate-300">
                {labLoading ? <Loader2 size={12} className="animate-spin text-cyan-300" /> : <CheckCircle2 size={12} className="text-cyan-300" />}
                {gateLabel.replace(/-/g, ' ')}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <IconTextButton onClick={() => openDock('inspector')} icon={<CandlestickChart size={14} />} label="Inspector" />
            <IconTextButton onClick={() => openDock('code')} icon={<Terminal size={14} />} label="Agent CLI" />
            <button
              type="button"
              onClick={() => setPodActionsOpen((open) => !open)}
              aria-expanded={podActionsOpen}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.07]"
            >
              <MoreHorizontal size={14} />
              Pod actions
              <ChevronDown size={13} className={podActionsOpen ? 'rotate-180 transition' : 'transition'} />
            </button>
          </div>
        </div>

        {podActionsOpen ? (
          <div className="mt-2 grid min-w-0 gap-2 rounded-md border border-white/10 bg-white/[0.025] p-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--app-subtle)]">Suggested</span>
              {suggestedCommands.map((command) => (
                <button
                  key={command}
                  type="button"
                  onClick={() => openDock('code')}
                  title={command}
                  className="inline-flex h-7 max-w-[240px] items-center gap-1 rounded-md border border-white/10 bg-white/[0.035] px-2 font-mono text-[11px] text-slate-300 transition hover:bg-white/[0.07]"
                >
                  <Terminal size={12} />
                  <span className="truncate">{compactCommand(command)}</span>
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 md:justify-end">
              <button type="button" onClick={() => openDock('inspector')} className="inline-flex h-7 items-center gap-1 rounded-md border border-cyan-300/25 bg-cyan-400/12 px-2 text-[11px] font-bold text-cyan-50 transition hover:bg-cyan-400/18">
                <FlaskConical size={12} />
                Create/Improve
              </button>
              <button type="button" onClick={() => openDock('runs')} className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/[0.035] px-2 text-[11px] font-bold text-slate-300 transition hover:bg-white/[0.07]">
                <History size={12} />
                Evidence
              </button>
              <span className="inline-flex h-7 max-w-[220px] items-center rounded-md border border-white/10 bg-white/[0.025] px-2 text-[11px] font-bold text-slate-500" title={assetWorkspaceDir || activeStrategyPod.path}>
                Asset: {compactPath(assetWorkspaceDir || activeStrategyPod.path)}
              </span>
              <span className="inline-flex h-7 max-w-[220px] items-center rounded-md border border-white/10 bg-white/[0.025] px-2 text-[11px] font-bold text-slate-500" title={strategyIdeasDir || activeStrategyPod.path}>
                Ideas: {compactPath(strategyIdeasDir || activeStrategyPod.path)}
              </span>
            </div>
          </div>
        ) : null}
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<LoadingState />}>
          <WorkspaceAgentView workspaceId={activeStrategyPod.id} />
        </Suspense>
      </main>
    </div>
  );
}

function IconTextButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.07]"
    >
      {icon}
      {label}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="grid h-full place-items-center text-xs font-bold text-[var(--app-subtle)]">
      Loading agentic command surface...
    </div>
  );
}
