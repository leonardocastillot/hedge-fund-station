import React, { Suspense, useMemo } from 'react';
import { Bot, Code2, ExternalLink, Play, RefreshCw, Server, Terminal, Wifi } from 'lucide-react';
import { DeskBrowserPanel } from '../components/DeskBrowserPanel';
import { useDeskSpaceContext, type DeskSpaceView } from '../DeskSpaceContext';
import { useAgentProfilesContext } from '@/contexts/AgentProfilesContext';
import { useCommanderTasksContext } from '@/contexts/CommanderTasksContext';
import { useTerminalContext } from '@/contexts/TerminalContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { hyperliquidService, type HyperliquidAppReadiness, type HyperliquidHedgeFundStationSnapshot, type HyperliquidStrategyAuditRow } from '@/services/hyperliquidService';
import { useMarketPolling } from '@/hooks/useMarketPolling';
import { buildTerminalLabel } from '@/utils/workspaceLaunch';
import { resolveTerminalShell } from '@/utils/terminalShell';
import type { Workspace } from '@/types/electron';

const AgentsPanel = React.lazy(() => import('@/features/agents/panels/AgentsPanel').then((module) => ({ default: module.AgentsPanel })));
const TerminalGrid = React.lazy(() => import('@/components/electron/TerminalGrid').then((module) => ({ default: module.TerminalGrid })));

function formatKind(kind: Workspace['kind']): string {
  if (kind === 'hedge-fund') return 'Hedge Fund Desk';
  if (kind === 'command-hub') return 'Command Hub';
  if (kind === 'ops') return 'Ops Desk';
  return 'Project Desk';
}

function countStage(strategies: HyperliquidStrategyAuditRow[], stage: HyperliquidStrategyAuditRow['pipelineStage']): number {
  return strategies.filter((strategy) => strategy.pipelineStage === stage).length;
}

function getDeskCopy(workspace: Workspace): string {
  if (workspace.kind === 'hedge-fund') {
    return 'Strategy agents, terminal evidence, browser dashboards, and hedge fund readiness stay inside this desk.';
  }
  if (workspace.kind === 'command-hub') {
    return 'Global shells, AI runtime probes, tunnels, and quick operational commands live here.';
  }
  if (workspace.kind === 'ops') {
    return 'Service health, logs, tunnels, diagnostics, and process work stay scoped to this ops desk.';
  }
  return 'Project agents, browser tabs, commands, and terminals stay scoped to this local workspace.';
}

function StatTile({ label, value, detail, tone = '#e2e8f0' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div style={statTileStyle}>
      <div style={statLabelStyle}>{label}</div>
      <div style={{ color: tone, fontSize: '22px', fontWeight: 850, marginTop: '7px' }}>{value}</div>
      <div style={statDetailStyle}>{detail}</div>
    </div>
  );
}

function EmptyDesk() {
  return (
    <div style={emptyPageStyle}>
      <div style={emptyCardStyle}>
        <div style={emptyTitleStyle}>No active desk</div>
        <div style={emptyCopyStyle}>Select Command Hub, a hedge fund desk, ops desk, or project desk from the left panel.</div>
      </div>
    </div>
  );
}

export default function DeskSpacePage() {
  const { activeWorkspace, updateWorkspace } = useWorkspaceContext();
  const { getDeskState, setDeskState } = useDeskSpaceContext();
  const { agents } = useAgentProfilesContext();
  const { tasks, runs } = useCommanderTasksContext();
  const { terminals, createTerminal } = useTerminalContext();
  const workspaceId = activeWorkspace?.id;
  const deskState = getDeskState(workspaceId);
  const isHedgeFundDesk = activeWorkspace?.kind === 'hedge-fund';

  const readinessPoll = useMarketPolling<HyperliquidAppReadiness>(
    `desk:${workspaceId || 'none'}:readiness`,
    () => hyperliquidService.getAppReadiness(500),
    { intervalMs: 30_000, staleAfterMs: 90_000, enabled: Boolean(isHedgeFundDesk) }
  );
  const stationPoll = useMarketPolling<HyperliquidHedgeFundStationSnapshot>(
    `desk:${workspaceId || 'none'}:station`,
    () => hyperliquidService.getHedgeFundStationSnapshot(500),
    { intervalMs: 30_000, staleAfterMs: 90_000, enabled: Boolean(isHedgeFundDesk) }
  );

  const scopedAgents = useMemo(
    () => agents.filter((agent) => agent.workspaceId === workspaceId),
    [agents, workspaceId]
  );
  const scopedTasks = useMemo(
    () => tasks.filter((task) => task.workspaceId === workspaceId),
    [tasks, workspaceId]
  );
  const scopedRuns = useMemo(
    () => runs.filter((run) => run.workspaceId === workspaceId),
    [runs, workspaceId]
  );
  const scopedTerminals = useMemo(() => {
    if (!activeWorkspace) {
      return [];
    }
    return terminals.filter((terminal) => (
      terminal.workspaceId === activeWorkspace.id
      || (!terminal.workspaceId && terminal.cwd === activeWorkspace.path)
    ));
  }, [activeWorkspace, terminals]);

  const ptyReady = scopedTerminals.filter((terminal) => terminal.ptyState === 'ready').length;
  const ptyFailed = scopedTerminals.filter((terminal) => terminal.ptyState === 'failed').length;
  const runningRuns = scopedRuns.filter((run) => run.status === 'running' || run.status === 'routing').length;
  const strategyRows = stationPoll.data?.audit?.strategies?.filter((strategy) => !strategy.strategyId.startsWith('runtime:')) ?? [];
  const openGaps = strategyRows.reduce((total, strategy) => total + (strategy.gateReasons.length || strategy.missingAuditItems.length), 0);
  const paperCount = countStage(strategyRows, 'paper');

  const launchCommand = (command?: string) => {
    if (!activeWorkspace) {
      return;
    }

    const shell = resolveTerminalShell(activeWorkspace.shell).shell;
    createTerminal(
      activeWorkspace.path,
      shell,
      buildTerminalLabel(activeWorkspace, command),
      command,
      { workspaceId: activeWorkspace.id }
    );
    setDeskState(activeWorkspace.id, { activeView: 'terminals' });
  };

  if (!activeWorkspace) {
    return <EmptyDesk />;
  }

  const activeView = deskState.activeView;
  const viewTabs: Array<{ id: DeskSpaceView; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'browser', label: 'Browser' },
    { id: 'agents', label: 'Agents' },
    { id: 'terminals', label: 'Terminals' }
  ];

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrowStyle}>{formatKind(activeWorkspace.kind)}</div>
          <h1 style={titleStyle}>{activeWorkspace.name}</h1>
          <div style={copyStyle}>{getDeskCopy(activeWorkspace)}</div>
          <div style={pathRowStyle}>
            <Code2 size={13} />
            <span style={pathTextStyle}>{activeWorkspace.path}</span>
          </div>
        </div>

        <div style={headerActionsStyle}>
          <button type="button" onClick={() => launchCommand()} style={actionButtonStyle}>
            <Terminal size={14} />
            Shell
          </button>
          <button type="button" onClick={() => launchCommand('codex')} style={actionButtonStyle}>
            <Bot size={14} />
            Codex
          </button>
          {activeWorkspace.browser_tabs[0]?.url ? (
            <button
              type="button"
              onClick={() => setDeskState(activeWorkspace.id, { activeView: 'browser', activeBrowserTabId: activeWorkspace.browser_tabs[0].id })}
              style={actionButtonStyle}
            >
              <ExternalLink size={14} />
              Browser
            </button>
          ) : null}
        </div>
      </header>

      <div style={tabsStyle}>
        {viewTabs.map((view) => {
          const selected = activeView === view.id;
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => setDeskState(activeWorkspace.id, { activeView: view.id })}
              style={{
                ...viewTabStyle,
                background: selected ? 'rgba(56, 189, 248, 0.14)' : 'rgba(15, 23, 42, 0.58)',
                borderColor: selected ? 'rgba(56, 189, 248, 0.32)' : 'rgba(148, 163, 184, 0.12)',
                color: selected ? '#bae6fd' : '#cbd5e1'
              }}
            >
              {view.label}
            </button>
          );
        })}
      </div>

      {activeView === 'overview' ? (
        <main style={overviewStyle}>
          <section style={statsGridStyle}>
            <StatTile label="Agents" value={String(scopedAgents.length)} detail={`${runningRuns} active runs`} tone="#bae6fd" />
            <StatTile label="Terminals" value={String(scopedTerminals.length)} detail={`${ptyReady} ready · ${ptyFailed} failed`} tone={ptyFailed ? '#fca5a5' : '#86efac'} />
            <StatTile label="Tasks" value={String(scopedTasks.length)} detail={`${scopedRuns.length} total runs`} tone="#e2e8f0" />
            <StatTile label="Browser" value={String(activeWorkspace.browser_tabs.length)} detail={`session ${activeWorkspace.id}`} tone="#c4b5fd" />
            {isHedgeFundDesk ? (
              <>
                <StatTile label="Readiness" value={readinessPoll.data?.overallStatus || 'N/A'} detail={readinessPoll.error || 'hedge fund station gate'} tone={readinessPoll.data?.overallStatus === 'ready' ? '#86efac' : '#fbbf24'} />
                <StatTile label="Strategies" value={String(strategyRows.length)} detail={`${paperCount} paper stage`} tone="#67e8f9" />
                <StatTile label="Open Gaps" value={String(openGaps)} detail="validation and audit blockers" tone={openGaps > 0 ? '#fbbf24' : '#86efac'} />
                <StatTile label="Review" value={`${Math.round(stationPoll.data?.audit?.summary?.reviewCoverage ?? 0)}%`} detail="paper review coverage" tone="#a7f3d0" />
              </>
            ) : null}
          </section>

          <section style={splitGridStyle}>
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>
                <div>
                  <div style={panelLabelStyle}>Saved Commands</div>
                  <div style={panelCopyStyle}>Launches stay attached to this desk.</div>
                </div>
                <button
                  type="button"
                  onClick={() => void readinessPoll.refresh()}
                  disabled={!isHedgeFundDesk}
                  style={{ ...iconOnlyButtonStyle, opacity: isHedgeFundDesk ? 1 : 0.45 }}
                  title="Refresh hedge stats"
                  aria-label="Refresh hedge stats"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div style={commandListStyle}>
                {activeWorkspace.default_commands.slice(0, 8).map((command) => (
                  <button key={command} type="button" onClick={() => launchCommand(command)} style={commandButtonStyle}>
                    <span style={commandTextStyle}>{command}</span>
                    <Play size={13} />
                  </button>
                ))}
                {activeWorkspace.default_commands.length === 0 ? (
                  <div style={emptyInlineStyle}>No saved commands for this desk.</div>
                ) : null}
              </div>
            </div>

            <div style={panelStyle}>
              <div style={panelHeaderStyle}>
                <div>
                  <div style={panelLabelStyle}>Desk Runtime</div>
                  <div style={panelCopyStyle}>Scope check for agents, PTY and browser isolation.</div>
                </div>
                <Wifi size={16} color="#67e8f9" />
              </div>
              <div style={runtimeListStyle}>
                <RuntimeLine icon={<Bot size={14} />} label="Agent scope" value={`${scopedAgents.length} agents bound to ${activeWorkspace.id}`} />
                <RuntimeLine icon={<Terminal size={14} />} label="PTY scope" value={`${ptyReady}/${scopedTerminals.length} ready in this desk`} />
                <RuntimeLine icon={<Server size={14} />} label="Kind" value={formatKind(activeWorkspace.kind)} />
                <RuntimeLine icon={<ExternalLink size={14} />} label="Browser partition" value={`persist:desk-${activeWorkspace.id}`} />
              </div>
            </div>
          </section>
        </main>
      ) : null}

      {activeView === 'browser' ? (
        <main style={workAreaStyle}>
          <DeskBrowserPanel workspace={activeWorkspace} updateWorkspace={updateWorkspace} />
        </main>
      ) : null}

      {activeView === 'agents' ? (
        <main style={workAreaStyle}>
          <Suspense fallback={<div style={loadingStyle}>Loading agents...</div>}>
            <AgentsPanel />
          </Suspense>
        </main>
      ) : null}

      {activeView === 'terminals' ? (
        <main style={workAreaStyle}>
          <Suspense fallback={<div style={loadingStyle}>Loading terminals...</div>}>
            <TerminalGrid defaultDeskFilter="active" embedded />
          </Suspense>
        </main>
      ) : null}
    </div>
  );
}

function RuntimeLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={runtimeLineStyle}>
      <span style={runtimeIconStyle}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={runtimeLabelStyle}>{label}</span>
        <span style={runtimeValueStyle}>{value}</span>
      </span>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.98) 0%, rgba(3, 7, 18, 0.98) 100%)',
  color: '#e2e8f0'
};

const headerStyle: React.CSSProperties = {
  padding: '18px 20px 14px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  alignItems: 'start',
  flexWrap: 'wrap'
};

const eyebrowStyle: React.CSSProperties = {
  color: '#67e8f9',
  fontSize: '11px',
  fontWeight: 850,
  textTransform: 'uppercase',
  letterSpacing: '0.16em'
};

const titleStyle: React.CSSProperties = {
  margin: '6px 0 4px',
  color: '#f8fafc',
  fontSize: '24px',
  fontWeight: 850,
  letterSpacing: 0
};

const copyStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '13px',
  lineHeight: 1.45
};

const pathRowStyle: React.CSSProperties = {
  marginTop: '10px',
  display: 'flex',
  gap: '7px',
  alignItems: 'center',
  color: '#64748b',
  minWidth: 0,
  fontSize: '11px'
};

const pathTextStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: "'JetBrains Mono', monospace"
};

const headerActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  justifyContent: 'flex-end'
};

const actionButtonStyle: React.CSSProperties = {
  height: '34px',
  borderRadius: '7px',
  border: '1px solid rgba(56, 189, 248, 0.22)',
  background: 'rgba(8, 47, 73, 0.58)',
  color: '#bae6fd',
  padding: '0 11px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 800
};

const tabsStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap'
};

const viewTabStyle: React.CSSProperties = {
  height: '32px',
  borderRadius: '999px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  padding: '0 12px',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 850,
  textTransform: 'uppercase',
  letterSpacing: '0.08em'
};

const overviewStyle: React.CSSProperties = {
  padding: '18px 20px 24px',
  display: 'grid',
  gap: '16px'
};

const statsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '10px'
};

const statTileStyle: React.CSSProperties = {
  minHeight: '104px',
  borderRadius: '8px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'rgba(15, 23, 42, 0.58)',
  padding: '13px'
};

const statLabelStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '10px',
  fontWeight: 850,
  textTransform: 'uppercase',
  letterSpacing: '0.1em'
};

const statDetailStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '11px',
  marginTop: '7px',
  lineHeight: 1.35
};

const splitGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '14px'
};

const panelStyle: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'rgba(15, 23, 42, 0.5)',
  padding: '14px'
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'start',
  gap: '10px'
};

const panelLabelStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '13px',
  fontWeight: 850
};

const panelCopyStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '11px',
  marginTop: '4px'
};

const iconOnlyButtonStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '7px',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'rgba(15, 23, 42, 0.7)',
  color: '#cbd5e1',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer'
};

const commandListStyle: React.CSSProperties = {
  marginTop: '12px',
  display: 'grid',
  gap: '8px'
};

const commandButtonStyle: React.CSSProperties = {
  minHeight: '38px',
  borderRadius: '7px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'rgba(2, 6, 23, 0.6)',
  color: '#e2e8f0',
  padding: '8px 10px',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  alignItems: 'center',
  cursor: 'pointer',
  textAlign: 'left'
};

const commandTextStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '11px'
};

const runtimeListStyle: React.CSSProperties = {
  marginTop: '12px',
  display: 'grid',
  gap: '10px'
};

const runtimeLineStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '28px minmax(0, 1fr)',
  gap: '9px',
  alignItems: 'center'
};

const runtimeIconStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '7px',
  border: '1px solid rgba(56, 189, 248, 0.18)',
  background: 'rgba(8, 47, 73, 0.42)',
  color: '#7dd3fc',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const runtimeLabelStyle: React.CSSProperties = {
  display: 'block',
  color: '#94a3b8',
  fontSize: '10px',
  fontWeight: 850,
  textTransform: 'uppercase',
  letterSpacing: '0.08em'
};

const runtimeValueStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '3px',
  color: '#e2e8f0',
  fontSize: '12px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const emptyInlineStyle: React.CSSProperties = {
  borderRadius: '7px',
  border: '1px dashed rgba(148, 163, 184, 0.14)',
  color: '#64748b',
  padding: '12px',
  fontSize: '12px'
};

const workAreaStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: '14px 20px 20px',
  overflow: 'auto'
};

const loadingStyle: React.CSSProperties = {
  minHeight: '360px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#64748b',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em'
};

const emptyPageStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#020617'
};

const emptyCardStyle: React.CSSProperties = {
  maxWidth: '360px',
  borderRadius: '8px',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'rgba(15, 23, 42, 0.62)',
  padding: '22px',
  textAlign: 'center'
};

const emptyTitleStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '17px',
  fontWeight: 850
};

const emptyCopyStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '13px',
  lineHeight: 1.45,
  marginTop: '8px'
};
