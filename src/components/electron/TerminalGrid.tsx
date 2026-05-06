import React from 'react';
import { TerminalPane } from './TerminalPane';
import { VoiceCommandBar } from './VoiceCommandBar';
import { useTerminalContext } from '../../contexts/TerminalContext';
import { useCommanderTasksContext } from '../../contexts/CommanderTasksContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { loadAppSettings } from '../../utils/appSettings';
import type { TaskStatus } from '../../types/tasks';
import type { TerminalSession } from '../../contexts/TerminalContext';

const MAX_TERMINALS = 6;

export const TerminalGrid: React.FC = () => {
  const {
    terminals,
    activeTerminalId,
    createTerminal,
    closeTerminal,
    setActiveTerminal,
    updateTerminalCwd,
    updateTerminalLabel,
    updateTerminalColor,
    updateTerminalRuntimeState,
    touchTerminalActivity,
    retryTerminalRuntime,
    toggleRainbowEffect,
    onLayoutUpdateNeeded
  } = useTerminalContext();
  const { runs, tasks, updateRun, updateTaskStatus } = useCommanderTasksContext();
  const { activeWorkspace } = useWorkspaceContext();
  const [layoutMode, setLayoutMode] = React.useState<'grid' | 'vertical'>('grid');
  const [handoffNotice, setHandoffNotice] = React.useState<string | null>(null);
  const missionTerminals = React.useMemo(
    () => terminals.filter((terminal) => Boolean(terminal.missionTitle || terminal.terminalPurpose === 'mission-console')),
    [terminals]
  );

  React.useEffect(() => {
    runs.forEach((run) => {
      const runtimeTerminal = terminals.find((terminal) => run.terminalIds.includes(terminal.id));
      if (!runtimeTerminal) {
        return;
      }

      const nextRunState = deriveRunState(run.status, runtimeTerminal);
      if (!nextRunState) {
        return;
      }

      const updates = {
        ...nextRunState,
        endedAt: nextRunState.status === 'completed' || nextRunState.status === 'failed'
          ? (run.endedAt ?? Date.now())
          : undefined
      };

      if (
        run.status !== updates.status
        || run.launchState !== updates.launchState
        || run.summary !== updates.summary
        || run.endedAt !== updates.endedAt
      ) {
        updateRun(run.id, updates);
      }
    });
  }, [runs, terminals, updateRun]);

  React.useEffect(() => {
    let cancelled = false;

    const normalizeOutputExcerpt = (buffer?: string | null) => {
      if (!buffer) {
        return '';
      }

      return buffer
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\u001b\][^\u0007]*\u0007/g, '')
        .replace(/\r/g, '')
        .trim()
        .slice(-3000);
    };

    const syncSnapshots = async () => {
      const candidateRuns = runs.filter((run) => run.terminalIds.length > 0);

      for (const run of candidateRuns) {
        const terminalId = run.terminalIds[0];
        if (!terminalId || typeof window.electronAPI.terminal.getSnapshot !== 'function') {
          continue;
        }

        try {
          // eslint-disable-next-line no-await-in-loop
          const snapshot = await window.electronAPI.terminal.getSnapshot(terminalId);
          if (cancelled || !snapshot) {
            continue;
          }

          const nextExcerpt = normalizeOutputExcerpt(snapshot.buffer);
          if (nextExcerpt && nextExcerpt !== run.outputExcerpt) {
            updateRun(run.id, {
              outputExcerpt: nextExcerpt,
              outputCapturedAt: Date.now()
            });
          }
        } catch {
          // Ignore snapshot failures; runtime state already covers hard failures.
        }
      }
    };

    void syncSnapshots();
    const interval = window.setInterval(() => {
      void syncSnapshots();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runs, updateRun]);

  React.useEffect(() => {
    let cancelled = false;

    const normalizeOutputExcerpt = (buffer?: string | null) => {
      if (!buffer) {
        return '';
      }

      return buffer
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\u001b\][^\u0007]*\u0007/g, '')
        .replace(/\r/g, '')
        .trim()
        .slice(-3000);
    };

    const syncMissionSnapshots = async () => {
      for (const terminal of terminals) {
        const getSnapshot = window.electronAPI.terminal.getSnapshot;
        if (
          !terminal.runId
          || !terminal.missionTitle
          || typeof getSnapshot !== 'function'
          || typeof window.electronAPI?.missionConsole?.appendSnapshot !== 'function'
        ) {
          continue;
        }

        try {
          // eslint-disable-next-line no-await-in-loop
          const snapshot = await getSnapshot(terminal.id);
          if (cancelled || !snapshot) {
            continue;
          }

          // eslint-disable-next-line no-await-in-loop
          await window.electronAPI.missionConsole.appendSnapshot({
            runId: terminal.runId,
            terminalId: terminal.id,
            status: terminal.runtimeState || (terminal.ptyState === 'failed' ? 'failed' : 'launching'),
            outputExcerpt: normalizeOutputExcerpt(snapshot.buffer),
            handoffSummary: terminal.handoffSummary || terminal.runtimeDetail,
            evidenceRefs: terminal.evidenceRefs
          });
        } catch {
          // Mission Console snapshots are opportunistic; terminal state remains visible even if persistence fails.
        }
      }
    };

    void syncMissionSnapshots();
    const interval = window.setInterval(() => {
      void syncMissionSnapshots();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [terminals]);

  React.useEffect(() => {
    tasks.forEach((task) => {
      const taskRuns = runs.filter((run) => run.taskId === task.id);
      if (taskRuns.length === 0) {
        return;
      }

      const nextStatus = deriveTaskStatus(task, taskRuns);
      if (task.status !== nextStatus) {
        updateTaskStatus(task.id, nextStatus);
      }
    });
  }, [runs, tasks, updateTaskStatus]);

  React.useEffect(() => {
    const handleExternalTerminalCreate = (_terminalId: string) => {};

    onLayoutUpdateNeeded(handleExternalTerminalCreate);
    return () => onLayoutUpdateNeeded(null);
  }, [onLayoutUpdateNeeded]);

  const handleNewTerminal = (type: 'cmd' | 'claude' | 'npm' | 'git' | 'python' = 'cmd') => {
    if (terminals.length >= MAX_TERMINALS) {
      alert(`Maximum ${MAX_TERMINALS} terminals reached. Close one before opening another.`);
      return;
    }

    const defaultCwd = activeWorkspace?.path || '/Users/optimus/Documents/New project 9';
    const shell = loadAppSettings().defaultShell || activeWorkspace?.shell || '/bin/zsh';

    let label = 'Terminal';
    let autoCommand: string | undefined;

    switch (type) {
      case 'claude':
        label = 'Claude AI';
        autoCommand = 'claude';
        break;
      case 'npm':
        label = 'NPM Dev';
        autoCommand = 'npm run dev';
        break;
      case 'git':
        label = 'Git';
        autoCommand = 'git status';
        break;
      case 'python':
        label = 'Python';
        autoCommand = 'python';
        break;
      case 'cmd':
      default:
        label = 'Shell';
        autoCommand = undefined;
        break;
    }

    createTerminal(defaultCwd, shell, label, autoCommand);
  };

  const handleCloseTerminal = (terminalId: string) => {
    window.electronAPI.terminal.kill(terminalId);
    closeTerminal(terminalId);
  };

  const handleExportMissionHandoff = async (terminal: TerminalSession) => {
    const getSnapshot = window.electronAPI.terminal.getSnapshot;
    if (!terminal.runId || typeof getSnapshot !== 'function' || typeof window.electronAPI?.missionConsole?.exportHandoff !== 'function') {
      return;
    }

    try {
      const snapshot = await getSnapshot(terminal.id);
      const outputExcerpt = snapshot?.buffer
        ?.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\u001b\][^\u0007]*\u0007/g, '')
        .replace(/\r/g, '')
        .trim()
        .slice(-6000);
      const result = await window.electronAPI.missionConsole.exportHandoff({
        runId: terminal.runId,
        workspacePath: terminal.cwd,
        summary: terminal.handoffSummary || terminal.runtimeDetail || terminal.missionTitle,
        outputExcerpt
      });
      setHandoffNotice(`Handoff exported: ${result.path}`);
    } catch (error) {
      setHandoffNotice(error instanceof Error ? error.message : 'Could not export Mission Console handoff.');
    }
  };

  const getGridLayout = (count: number) => {
    if (layoutMode === 'vertical') {
      return { cols: 1, rows: count };
    }

    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    return { cols: 2, rows: 3 };
  };

  const gridLayout = getGridLayout(terminals.length);

  if (terminals.length === 0) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--app-terminal-bg)',
        color: 'var(--app-muted)',
        padding: '40px'
      }}>
        <div style={{
          background: 'var(--app-panel)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          padding: '40px 60px',
          borderRadius: '16px',
          border: '1px solid var(--app-terminal-border)',
          boxShadow: '0 8px 32px var(--app-glow)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '8px', fontFamily: "'JetBrains Mono', monospace" }}>CLI</div>
          <div style={{ fontSize: '20px', color: 'var(--app-text)', fontWeight: '600', marginBottom: '8px' }}>
            No terminal sessions running
          </div>
          <div style={{ fontSize: '14px', color: 'var(--app-muted)', textAlign: 'center', maxWidth: '340px', lineHeight: '1.6' }}>
            This is the Hedge Fund Station command hub for your primary hedge fund desk and bot/dev/side project workspaces.
            Launch saved commands and profiles here so output stays visible in the center panel.
          </div>
          <button
            onClick={() => handleNewTerminal()}
            style={{
              padding: '14px 32px',
              background: 'linear-gradient(135deg, var(--app-accent) 0%, var(--app-accent-2) 100%)',
              color: '#fff',
              border: '1px solid var(--app-border-strong)',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              boxShadow: '0 4px 16px var(--app-glow)',
              transition: 'all 0.2s ease',
              marginTop: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px var(--app-glow)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 16px var(--app-glow)';
            }}
          >
            + New Console
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'var(--app-bg)',
      padding: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: 'var(--app-panel)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: '8px',
        border: '1px solid var(--app-border)',
        boxShadow: '0 2px 12px var(--app-glow), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
        gap: '12px'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          flex: 1,
          minWidth: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--app-accent)', fontSize: '13px', fontWeight: '600' }}>Terminales / CLI</span>
            <div style={{
              background: terminals.length >= MAX_TERMINALS ? 'var(--app-negative-soft)' : 'var(--app-accent-soft)',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '10px',
              color: terminals.length >= MAX_TERMINALS ? 'var(--app-negative)' : 'var(--app-accent)',
              fontWeight: '600',
              border: `1px solid ${terminals.length >= MAX_TERMINALS ? 'var(--app-negative)' : 'var(--app-border-strong)'}`
            }}>
              {terminals.length}/{MAX_TERMINALS}
            </div>

            <button
              onClick={() => setLayoutMode(layoutMode === 'grid' ? 'vertical' : 'grid')}
              title={layoutMode === 'grid' ? 'Switch to vertical layout' : 'Switch to grid layout'}
              style={{
                padding: '2px 6px',
                background: 'var(--app-accent-soft)',
                border: '1px solid var(--app-border-strong)',
                borderRadius: '4px',
                color: 'var(--app-accent)',
                fontSize: '10px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--app-focus)';
                e.currentTarget.style.borderColor = 'var(--app-border-strong)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--app-accent-soft)';
                e.currentTarget.style.borderColor = 'var(--app-border-strong)';
              }}
            >
              {layoutMode === 'grid' ? 'Grid' : 'Vertical'}
            </button>
          </div>

          <VoiceCommandBar activeTerminalId={activeTerminalId} />
        </div>

        <button
          onClick={() => handleNewTerminal()}
          disabled={terminals.length >= MAX_TERMINALS}
          style={{
            padding: '4px 10px',
            background: terminals.length >= MAX_TERMINALS
              ? 'var(--app-panel-muted)'
              : 'linear-gradient(135deg, var(--app-positive) 0%, var(--app-accent) 100%)',
            color: terminals.length >= MAX_TERMINALS ? 'var(--app-subtle)' : '#fff',
            border: `1px solid ${terminals.length >= MAX_TERMINALS ? 'var(--app-border)' : 'var(--app-terminal-border)'}`,
            borderRadius: '6px',
            cursor: terminals.length >= MAX_TERMINALS ? 'not-allowed' : 'pointer',
            fontSize: '10px',
            fontWeight: '600',
            boxShadow: terminals.length >= MAX_TERMINALS ? 'none' : '0 2px 8px var(--app-glow)',
            transition: 'all 0.15s ease',
            opacity: terminals.length >= MAX_TERMINALS ? 0.5 : 1
          }}
          onMouseEnter={(e) => {
            if (terminals.length < MAX_TERMINALS) {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 12px var(--app-glow)';
            }
          }}
          onMouseLeave={(e) => {
            if (terminals.length < MAX_TERMINALS) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px var(--app-glow)';
            }
          }}
          title={terminals.length >= MAX_TERMINALS ? `Terminal limit ${MAX_TERMINALS} reached` : 'Add CLI console'}
        >
          + New Shell
        </button>
      </div>

      {missionTerminals.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '8px',
          padding: '0 2px'
        }}>
          {missionTerminals.map((terminal) => (
            <div key={`mission-${terminal.id}`} style={{
              border: '1px solid rgba(56, 189, 248, 0.14)',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.36), rgba(2, 6, 23, 0.82))',
              padding: '10px',
              display: 'grid',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#e0f2fe', fontSize: '12px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {terminal.missionTitle || terminal.label}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginTop: '4px' }}>
                    {terminal.runtimeProvider || 'shell'} / {terminal.missionKind || 'mission'} / {terminal.runtimeState || terminal.ptyState}
                  </div>
                </div>
                <button type="button" onClick={() => setActiveTerminal(terminal.id)} style={missionTinyButtonStyle}>Focus</button>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '10px', lineHeight: 1.4, minHeight: '28px' }}>
                {terminal.runtimeDetail || terminal.ptyDetail || 'Mission terminal is active.'}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void handleExportMissionHandoff(terminal)} style={missionTinyButtonStyle}>Export handoff</button>
                {terminal.lastOutputAt ? (
                  <span style={{ color: '#64748b', fontSize: '10px', alignSelf: 'center' }}>
                    output {Math.max(0, Math.round((Date.now() - terminal.lastOutputAt) / 1000))}s ago
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {handoffNotice ? (
            <div style={{
              gridColumn: '1 / -1',
              color: handoffNotice.startsWith('Handoff exported') ? '#67e8f9' : '#fca5a5',
              fontSize: '11px',
              padding: '2px 4px'
            }}>{handoffNotice}</div>
          ) : null}
        </div>
      ) : null}

      <div style={{
        flex: 1,
        display: layoutMode === 'vertical' ? 'flex' : 'grid',
        flexDirection: layoutMode === 'vertical' ? 'column' : undefined,
        gridTemplateColumns: layoutMode === 'grid' ? `repeat(${gridLayout.cols}, 1fr)` : undefined,
        gridTemplateRows: layoutMode === 'grid' ? `repeat(${gridLayout.rows}, 1fr)` : undefined,
        gap: '6px',
        overflow: layoutMode === 'vertical' ? 'auto' : 'hidden'
      }}>
        {terminals.map((terminal) => (
          <div
            key={terminal.id}
            style={{
              position: 'relative',
              minHeight: layoutMode === 'vertical' ? '300px' : undefined,
              overflow: 'hidden'
            }}
            onClick={() => setActiveTerminal(terminal.id)}
          >
            <div style={{ width: '100%', height: '100%' }}>
              <TerminalPane
                id={terminal.id}
                cwd={terminal.cwd}
                shell={terminal.shell}
                label={terminal.label}
                color={terminal.color}
                rainbowEffect={terminal.rainbowEffect}
                autoCommand={terminal.autoCommand}
                missionPrompt={terminal.missionPrompt}
                currentCommand={terminal.currentCommand}
                runtimeProvider={terminal.runtimeProvider}
                runtimeState={terminal.runtimeState}
                runtimeDetail={terminal.runtimeDetail}
                runtimeAttempts={terminal.runtimeAttempts}
                ptyState={terminal.ptyState}
                ptyDetail={terminal.ptyDetail}
                onClose={() => handleCloseTerminal(terminal.id)}
                onTitleChange={(nextTitle) => updateTerminalCwd(terminal.id, nextTitle)}
                onLabelChange={(newLabel) => updateTerminalLabel(terminal.id, newLabel)}
                onColorChange={(newColor) => updateTerminalColor(terminal.id, newColor)}
                onToggleRainbow={() => toggleRainbowEffect(terminal.id)}
                onRuntimeStateChange={(state, detail) => updateTerminalRuntimeState(terminal.id, state, detail)}
                onActivity={() => touchTerminalActivity(terminal.id)}
                onRuntimeRetry={(detail) => retryTerminalRuntime(terminal.id, detail)}
                isActive={activeTerminalId === terminal.id}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const missionTinyButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(125, 211, 252, 0.18)',
  borderRadius: '8px',
  background: 'rgba(8, 47, 73, 0.48)',
  color: '#bae6fd',
  padding: '5px 8px',
  fontSize: '10px',
  fontWeight: 800,
  cursor: 'pointer'
};

function deriveRunState(
  currentStatus: TaskStatus,
  terminal: TerminalSession
): { status: TaskStatus; launchState: 'launching' | 'ready' | 'attention'; summary: string } | null {
  const now = Date.now();
  const staleRuntime = (terminal.runtimeState === 'running' || terminal.runtimeState === 'waiting-response')
    && typeof terminal.lastOutputAt === 'number'
    && now - terminal.lastOutputAt > 90_000;

  if (terminal.ptyState === 'failed') {
    return {
      status: 'failed',
      launchState: 'attention',
      summary: terminal.ptyDetail || 'Terminal process failed before mission launch'
    };
  }

  if (terminal.runtimeState === 'failed') {
    return {
      status: 'failed',
      launchState: 'attention',
      summary: terminal.runtimeDetail || 'AI runtime failed'
    };
  }

  if (terminal.runtimeState === 'completed') {
    return {
      status: 'completed',
      launchState: 'ready',
      summary: terminal.runtimeDetail || 'Mission runtime completed'
    };
  }

  if (terminal.runtimeState === 'ready' || terminal.runtimeState === 'handoff' || terminal.runtimeState === 'waiting-response' || terminal.runtimeState === 'running') {
    return {
      status: 'running',
      launchState: staleRuntime ? 'attention' : 'ready',
      summary: staleRuntime
        ? `No runtime output for ${Math.round((now - (terminal.lastOutputAt || now)) / 1000)}s`
        : terminal.runtimeDetail || (terminal.runtimeState === 'waiting-response'
        ? 'Mission dispatched, waiting for agent response'
        : terminal.runtimeState === 'handoff'
          ? 'Runtime handshake detected'
        : 'Mission running in terminal')
    };
  }

  if (terminal.runtimeState === 'stalled') {
    return {
      status: currentStatus === 'queued' ? 'queued' : 'running',
      launchState: 'attention',
      summary: terminal.runtimeDetail || 'Runtime stalled before producing output'
    };
  }

  if (terminal.runtimeState === 'awaiting-approval') {
    return {
      status: currentStatus === 'queued' ? 'queued' : 'running',
      launchState: 'attention',
      summary: terminal.runtimeDetail || 'Runtime waiting for approval'
    };
  }

  if (terminal.runtimeState === 'launching' || terminal.ptyState === 'creating') {
    return {
      status: 'running',
      launchState: 'launching',
      summary: terminal.runtimeDetail || terminal.ptyDetail || 'Launching runtime'
    };
  }

  return null;
}

function deriveTaskStatus(
  task: { mission?: { executionMode?: string; workflow?: Array<{ role: string }> } },
  taskRuns: Array<{ status: TaskStatus; stageIndex?: number }>
): TaskStatus {
  if (taskRuns.some((run) => run.status === 'failed')) {
    return 'failed';
  }

  if (task.mission?.executionMode === 'pipeline' && Array.isArray(task.mission.workflow) && task.mission.workflow.length > 0) {
    const completedStages = new Set(
      taskRuns
        .filter((run) => run.status === 'completed' && typeof run.stageIndex === 'number')
        .map((run) => run.stageIndex as number)
    );

    if (completedStages.size >= task.mission.workflow.length) {
      return 'completed';
    }

    return 'running';
  }

  if (taskRuns.every((run) => run.status === 'completed')) {
    return 'completed';
  }

  if (taskRuns.some((run) => run.status === 'running' || run.status === 'routing' || run.status === 'queued')) {
    return 'running';
  }

  return 'running';
}
