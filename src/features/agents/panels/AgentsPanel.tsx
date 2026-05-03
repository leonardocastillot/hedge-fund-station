import React from 'react';
import { useAgentProfilesContext } from '@/contexts/AgentProfilesContext';
import { useCommanderTasksContext } from '@/contexts/CommanderTasksContext';
import { useTerminalContext } from '@/contexts/TerminalContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import type { TaskStatus } from '@/types/tasks';
import { AgentSupervisorBoard } from '../components/AgentSupervisorBoard';
import { MissionChatWorkbench } from '../components/MissionChatWorkbench';
import { KnowledgeDock } from '../components/KnowledgeDock';
import { SystemHealthCard } from '../components/SystemHealthCard';
import { LaunchSignalStrip } from '../components/LaunchSignalStrip';
import { getProviderMeta, resolveAgentRuntimeCommand, resolveAgentRuntimeShell } from '@/utils/agentRuntime';
import { launchAgentRun } from '@/utils/agentOrchestration';
import type { AgentProvider } from '@/types/agents';
import type { TerminalRuntimeState } from '@/contexts/TerminalContext';
import { TerminalGrid } from '@/components/electron/TerminalGrid';

type RunFilter = 'all' | TaskStatus;
type PanelView = 'chat' | 'fleet' | 'runs' | 'evidence' | 'intel';

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) {
    return 'No activity';
  }

  const deltaMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.round(deltaMs / 60000));
  if (minutes < 1) {
    return 'Now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.round(hours / 24)}d`;
}

function getRunTone(status: string): { background: string; color: string } {
  const palette: Record<string, { background: string; color: string }> = {
    queued: { background: 'rgba(100, 116, 139, 0.16)', color: '#cbd5e1' },
    routing: { background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24' },
    running: { background: 'rgba(16, 185, 129, 0.16)', color: '#34d399' },
    completed: { background: 'rgba(59, 130, 246, 0.16)', color: '#93c5fd' },
    failed: { background: 'rgba(239, 68, 68, 0.16)', color: '#fca5a5' }
  };

  return palette[status] || palette.queued;
}

function getRuntimeTone(state?: TerminalRuntimeState): { background: string; color: string; label: string } {
  switch (state) {
    case 'handoff':
      return { background: 'rgba(56, 189, 248, 0.16)', color: '#7dd3fc', label: 'runtime handoff' };
    case 'ready':
      return { background: 'rgba(16, 185, 129, 0.16)', color: '#6ee7b7', label: 'runtime ready' };
    case 'waiting-response':
      return { background: 'rgba(8, 145, 178, 0.16)', color: '#67e8f9', label: 'waiting response' };
    case 'awaiting-approval':
      return { background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24', label: 'awaiting approval' };
    case 'running':
      return { background: 'rgba(14, 165, 233, 0.16)', color: '#7dd3fc', label: 'mission running' };
    case 'stalled':
      return { background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24', label: 'runtime stalled' };
    case 'completed':
      return { background: 'rgba(59, 130, 246, 0.16)', color: '#93c5fd', label: 'completed' };
    case 'failed':
      return { background: 'rgba(239, 68, 68, 0.16)', color: '#fca5a5', label: 'boot failed' };
    case 'launching':
      return { background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24', label: 'launching runtime' };
    case 'shell':
      return { background: 'rgba(148, 163, 184, 0.16)', color: '#cbd5e1', label: 'shell only' };
    default:
      return { background: 'rgba(100, 116, 139, 0.16)', color: '#cbd5e1', label: 'blocked before launch' };
  }
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={{ color: accent, fontSize: '26px', fontWeight: 800, marginTop: '6px' }}>{value}</div>
    </div>
  );
}

export const AgentsPanel: React.FC = () => {
  const { activeWorkspace } = useWorkspaceContext();
  const { agents } = useAgentProfilesContext();
  const { tasks, runs, createTask, createRun, updateRun, updateTaskStatus } = useCommanderTasksContext();
  const { terminals, setActiveTerminal, activeTerminalId, createTerminal, closeAllTerminals } = useTerminalContext();
  const [runFilter, setRunFilter] = React.useState<RunFilter>('all');
  const [activeView, setActiveView] = React.useState<PanelView>('chat');

  const workspaceId = activeWorkspace?.id;

  const scopedAgents = React.useMemo(
    () => agents.filter((agent) => agent.workspaceId === workspaceId),
    [agents, workspaceId]
  );

  const scopedTasks = React.useMemo(
    () => tasks.filter((task) => task.workspaceId === workspaceId),
    [tasks, workspaceId]
  );

  const scopedRuns = React.useMemo(
    () => runs.filter((run) => run.workspaceId === workspaceId),
    [runs, workspaceId]
  );

  const filteredRuns = React.useMemo(
    () => scopedRuns.filter((run) => runFilter === 'all' || run.status === runFilter).slice(0, 8),
    [runFilter, scopedRuns]
  );

  const summary = React.useMemo(() => ({
    agents: scopedAgents.length,
    tasks: scopedTasks.length,
    live: terminals.filter((terminal) => terminal.agentId && scopedAgents.some((agent) => agent.id === terminal.agentId)).length,
    running: scopedRuns.filter((run) => run.status === 'running').length
  }), [scopedAgents, scopedRuns, scopedTasks.length, terminals]);

  const activeRuntimes = React.useMemo(
    () => scopedAgents
      .map((agent) => ({
        agent,
        terminals: terminals.filter((terminal) => terminal.agentId === agent.id)
      }))
      .filter((row) => row.terminals.length > 0)
      .slice(0, 6),
    [scopedAgents, terminals]
  );

  const workspaceProviders = React.useMemo(
    () => Array.from(new Set(scopedAgents.map((agent) => agent.provider))) as AgentProvider[],
    [scopedAgents]
  );

  const handleStopAll = React.useCallback(() => {
    const activeRunIds = new Set<string>();
    const directLoopRunIds: string[] = [];

    closeAllTerminals((terminal) => {
      const belongsToWorkspace = !workspaceId || scopedAgents.some((agent) => agent.id === terminal.agentId);
      if (belongsToWorkspace && terminal.runId) {
        activeRunIds.add(terminal.runId);
      }
      return belongsToWorkspace;
    });

    scopedRuns
      .filter((run) => activeRunIds.has(run.id) || run.status === 'running' || run.status === 'routing' || run.status === 'queued')
      .forEach((run) => {
        if (run.launchMode === 'loop' && run.loopRunId) {
          directLoopRunIds.push(run.loopRunId);
        }
        updateRun(run.id, {
          status: 'failed',
          launchState: 'attention',
          summary: 'Stopped manually from Agent Control',
          endedAt: run.endedAt ?? Date.now()
        });
      });

    scopedTasks
      .filter((task) => task.status === 'running' || task.status === 'routing' || task.status === 'queued')
      .forEach((task) => {
        updateTaskStatus(task.id, 'failed');
      });

    directLoopRunIds.forEach((runId) => {
      void window.electronAPI.agentLoop.cancelRun(runId);
    });
  }, [closeAllTerminals, scopedAgents, scopedRuns, scopedTasks, updateRun, updateTaskStatus, workspaceId]);

  const retryRun = React.useCallback((runId: string) => {
    if (!activeWorkspace) {
      return;
    }

    const run = scopedRuns.find((item) => item.id === runId);
    if (!run) {
      return;
    }

    const agent = scopedAgents.find((item) => item.id === run.agentId);
    if (!agent) {
      return;
    }

    const sourceTask = scopedTasks.find((item) => item.id === run.taskId);
    const retryTask = createTask(
      sourceTask?.goal || run.summary,
      activeWorkspace.id,
      sourceTask?.title || `Retry: ${run.agentName}`
    );

    updateTaskStatus(retryTask.id, 'routing');
    updateTaskStatus(retryTask.id, 'running');

    launchAgentRun(
      {
        workspace: activeWorkspace,
        createTerminal,
        createRun,
        updateRun
      },
      {
        task: retryTask,
        agent,
        summaryPrefix: 'Retrying',
        forceDirectLaunch: true
      }
    );
  }, [
    activeWorkspace,
    createRun,
    createTask,
    createTerminal,
    scopedAgents,
    scopedRuns,
    scopedTasks,
    updateTaskStatus
  ]);

  const openRuntimeProbe = React.useCallback((provider: AgentProvider) => {
    if (!activeWorkspace) {
      return;
    }

    const runtimeShell = resolveAgentRuntimeShell(activeWorkspace.shell);
    const command = resolveAgentRuntimeCommand(provider, runtimeShell);
    const terminalId = createTerminal(
      activeWorkspace.path,
      runtimeShell,
      `Probe: ${getProviderMeta(provider).label}`,
      command,
      {
        agentName: 'System Probe',
        terminalPurpose: 'runtime-probe',
        runtimeProvider: provider
      }
    );
    setActiveTerminal(terminalId);
  }, [activeWorkspace, createTerminal, setActiveTerminal]);

  return (
    <div style={pageStyle}>
      <div style={heroStyle}>
        <div>
          <div style={heroEyebrowStyle}>AI Trading Workbench</div>
          <h2 style={heroTitleStyle}>Codex Mission Control</h2>
          <p style={heroCopyStyle}>Chat by voice or text, approve the mission, then run Codex CLI with terminal evidence.</p>
        </div>

        <div style={heroActionsStyle}>
          <button
            type="button"
            onClick={handleStopAll}
            disabled={summary.live === 0 && summary.running === 0}
            style={{
              ...panicButtonStyle,
              opacity: summary.live === 0 && summary.running === 0 ? 0.45 : 1,
              cursor: summary.live === 0 && summary.running === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            Stop All Agents
          </button>
          <div style={summaryGridStyle}>
            <SummaryCard label="Agents" value={summary.agents} accent="#f8fafc" />
            <SummaryCard label="Tasks" value={summary.tasks} accent="#ef4444" />
            <SummaryCard label="Running" value={summary.running} accent="#fca5a5" />
            <SummaryCard label="Live" value={summary.live} accent="#b91c1c" />
          </div>
        </div>
      </div>

      <div style={bodyStyle}>
        <div style={viewTabsStyle}>
          {([
            { id: 'chat', label: 'Chat' },
            { id: 'runs', label: 'Runs' },
            { id: 'fleet', label: 'Fleet' },
            { id: 'evidence', label: 'Evidence' },
            { id: 'intel', label: 'Intel' }
          ] as Array<{ id: PanelView; label: string }>).map((view) => {
            const active = activeView === view.id;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => setActiveView(view.id)}
                style={{
                  ...viewTabButtonStyle,
                  border: active ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(148, 163, 184, 0.12)',
                  background: active ? 'rgba(56, 189, 248, 0.12)' : 'rgba(15, 23, 42, 0.45)',
                  color: active ? '#bae6fd' : '#cbd5e1'
                }}
              >
                {view.label}
              </button>
            );
          })}
        </div>

        {activeView === 'chat' ? (
          <MissionChatWorkbench workspaceId={workspaceId} />
        ) : null}

        {activeView === 'fleet' ? (
          <AgentSupervisorBoard workspaceId={workspaceId} />
        ) : null}

        {activeView === 'evidence' ? (
          <div style={evidenceShellStyle}>
            <TerminalGrid />
          </div>
        ) : null}

        {activeView === 'runs' ? (
          <div style={bottomGridStyle}>
            <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <div style={sectionLabelStyle}>Run Deck</div>
                <div style={sectionCopyStyle}>Compact queue of mission state and selected engine.</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['all', 'queued', 'routing', 'running', 'completed', 'failed'] as RunFilter[]).map((status) => {
                  const active = runFilter === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setRunFilter(status)}
                      style={{
                        padding: '7px 10px',
                        borderRadius: '999px',
                        border: active ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(148, 163, 184, 0.12)',
                        background: active ? 'rgba(56, 189, 248, 0.14)' : 'rgba(15, 23, 42, 0.5)',
                        color: active ? '#bae6fd' : '#cbd5e1',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase'
                      }}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
              {filteredRuns.length === 0 ? (
                <div style={emptyStyle}>No runs for this filter.</div>
              ) : (
                filteredRuns.map((run) => {
                  const provider = getProviderMeta(run.runtimeProvider);
                  const tone = getRunTone(run.status);
                  const runtimeTerminal = terminals.find((terminal) => run.terminalIds.includes(terminal.id));
                  const runtimeTone = run.launchMode === 'loop'
                    ? {
                        background: 'rgba(34, 197, 94, 0.16)',
                        color: '#86efac',
                        label: `direct loop ${run.loopIteration ?? 0}/${run.loopMaxIterations ?? 0}`
                      }
                    : getRuntimeTone(runtimeTerminal?.runtimeState);
                  return (
                    <div key={run.id} style={rowCardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ color: '#f8fafc', fontSize: '13px', fontWeight: 800 }}>{run.agentName}</div>
                          <div style={{ color: provider.accent, fontSize: '10px', fontWeight: 800, marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            {provider.label} • {run.launchMode}
                          </div>
                        </div>
                        <div style={{
                          padding: '4px 8px',
                          borderRadius: '999px',
                          background: tone.background,
                          color: tone.color,
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase'
                        }}>
                          {run.status}
                        </div>
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '8px', lineHeight: 1.45 }}>
                        {run.summary}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '10px', marginTop: '8px' }}>
                        {run.terminalIds.length} terminals • updated {formatRelativeTime(run.updatedAt)} • state {run.launchState}
                      </div>
                      <LaunchSignalStrip run={run} terminal={runtimeTerminal} />
                      <div style={{
                        display: 'inline-flex',
                        marginTop: '8px',
                        padding: '4px 8px',
                        borderRadius: '999px',
                        background: runtimeTone.background,
                        color: runtimeTone.color,
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em'
                      }}>
                        {runtimeTone.label}
                      </div>
                      {run.launchMode === 'loop' && run.verificationSummary ? (
                        <div style={{ color: '#86efac', fontSize: '10px', marginTop: '6px', lineHeight: 1.4 }}>
                          {run.verificationSummary}
                        </div>
                      ) : null}
                      {runtimeTerminal?.runtimeDetail ? (
                        <div style={{ color: '#64748b', fontSize: '10px', marginTop: '6px', lineHeight: 1.4 }}>
                          {runtimeTerminal.runtimeDetail}
                        </div>
                      ) : null}
                      {runtimeTerminal && (runtimeTerminal.runtimeAttempts ?? 0) > 1 ? (
                        <div style={{ color: '#93c5fd', fontSize: '10px', marginTop: '4px', fontWeight: 700 }}>
                          auto-retry {runtimeTerminal.runtimeAttempts! - 1}
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => retryRun(run.id)}
                          disabled={run.launchMode === 'loop'}
                          style={actionButtonStyle}
                        >
                          {run.launchMode === 'loop' ? 'Retry In Launch' : 'Try Again'}
                        </button>
                        {run.terminalIds[0] ? (
                          <button
                            type="button"
                            onClick={() => setActiveTerminal(run.terminalIds[0])}
                            style={secondaryActionButtonStyle}
                          >
                            Focus
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            </div>
            <div style={sectionStyle}>
              <div style={sectionLabelStyle}>Focused Runtimes</div>
              <div style={sectionCopyStyle}>One click to jump into the terminal that is actually doing the work.</div>

              <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
                {activeRuntimes.length === 0 ? (
                  <div style={emptyStyle}>No active runtimes.</div>
                ) : (
                  activeRuntimes.map(({ agent, terminals: agentTerminals }) => {
                    const provider = getProviderMeta(agent.provider);
                    return (
                      <div key={agent.id} style={rowCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ color: '#f8fafc', fontSize: '13px', fontWeight: 800 }}>{agent.name}</div>
                            <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '5px' }}>
                              {provider.label} • {agentTerminals.length} terminals
                            </div>
                          </div>
                          <div style={{
                            padding: '4px 8px',
                            borderRadius: '999px',
                            background: provider.glow,
                            color: provider.accent,
                            fontSize: '10px',
                            fontWeight: 800,
                            textTransform: 'uppercase'
                          }}>
                            {provider.shortLabel}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                          {agentTerminals.map((terminal) => (
                            <button
                              key={terminal.id}
                              type="button"
                              onClick={() => setActiveTerminal(terminal.id)}
                              style={{
                                padding: '10px 12px',
                                borderRadius: '14px',
                                border: activeTerminalId === terminal.id ? `1px solid ${provider.accent}55` : '1px solid rgba(148, 163, 184, 0.12)',
                                background: activeTerminalId === terminal.id ? provider.glow : 'rgba(2, 6, 23, 0.72)',
                                color: '#f8fafc',
                                textAlign: 'left',
                                cursor: 'pointer'
                              }}
                            >
                              <div style={{ fontSize: '12px', fontWeight: 700 }}>{terminal.label}</div>
                              <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '5px' }}>
                                {terminal.currentCommand || 'interactive shell'}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeView === 'intel' ? (
          <div style={bottomGridStyle}>
            <KnowledgeDock workspace={activeWorkspace} tasks={scopedTasks} runs={scopedRuns} />
            <SystemHealthCard
              workspace={activeWorkspace}
              providers={workspaceProviders}
              onOpenProbe={openRuntimeProbe}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'radial-gradient(circle at top left, rgba(220, 38, 38, 0.05), transparent 28%), radial-gradient(circle at top right, rgba(255, 255, 255, 0.03), transparent 24%), #020617',
  overflow: 'auto'
};

const heroStyle: React.CSSProperties = {
  padding: '22px 24px 16px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  flexWrap: 'wrap',
  alignItems: 'end'
};

const heroEyebrowStyle: React.CSSProperties = {
  color: '#ef4444',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.16em'
};

const heroTitleStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '28px',
  fontWeight: 800,
  margin: '10px 0 4px 0'
};

const heroCopyStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '13px',
  margin: 0
};

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(110px, 1fr))',
  gap: '10px',
  minWidth: 'min(100%, 520px)'
};

const heroActionsStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  justifyItems: 'end'
};

const panicButtonStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '14px',
  border: '1px solid rgba(248, 113, 113, 0.32)',
  background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.92) 0%, rgba(220, 38, 38, 0.86) 100%)',
  color: '#fee2e2',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.08em'
};

const summaryCardStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '18px',
  background: 'rgba(15, 23, 42, 0.7)',
  border: '1px solid rgba(148, 163, 184, 0.12)'
};

const summaryLabelStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '10px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.08em'
};

const bodyStyle: React.CSSProperties = {
  padding: '18px 24px 24px',
  display: 'grid',
  gap: '18px'
};

const viewTabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap'
};

const viewTabButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '999px',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.08em'
};

const bottomGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
  gap: '18px'
};

const evidenceShellStyle: React.CSSProperties = {
  height: '720px',
  minHeight: 'min(720px, calc(100vh - 220px))',
  overflow: 'hidden',
  borderRadius: '8px',
  border: '1px solid rgba(148, 163, 184, 0.12)'
};

const sectionStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '22px',
  background: 'rgba(15, 23, 42, 0.58)',
  border: '1px solid rgba(148, 163, 184, 0.12)'
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
  alignItems: 'center'
};

const sectionLabelStyle: React.CSSProperties = {
  color: '#e2e8f0',
  fontSize: '14px',
  fontWeight: 800
};

const sectionCopyStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '12px',
  marginTop: '4px'
};

const rowCardStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '16px',
  background: 'rgba(2, 6, 23, 0.75)',
  border: '1px solid rgba(148, 163, 184, 0.12)'
};

const emptyStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '16px',
  background: 'rgba(15, 23, 42, 0.45)',
  border: '1px dashed rgba(148, 163, 184, 0.14)',
  color: '#64748b',
  fontSize: '12px'
};

const actionButtonStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: '10px',
  border: '1px solid rgba(56, 189, 248, 0.24)',
  background: 'rgba(56, 189, 248, 0.12)',
  color: '#bae6fd',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer'
};

const secondaryActionButtonStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: '10px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.72)',
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer'
};
