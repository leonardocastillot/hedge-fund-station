import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TerminalPane } from './TerminalPane';
import { useTerminalContext } from '../../contexts/TerminalContext';
import { useCommanderTasksContext } from '../../contexts/CommanderTasksContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { loadAppSettings } from '../../utils/appSettings';
import { getProviderMeta, resolveAgentRuntimeCommand } from '../../utils/agentRuntime';
import { resolveTerminalShell } from '../../utils/terminalShell';
import type { TaskStatus } from '../../types/tasks';
import type { TerminalSession } from '../../contexts/TerminalContext';
import type { AgentProvider } from '../../types/agents';

const MAX_TERMINALS = 12;
type QuickTerminalType = 'shell' | 'codex' | 'opencode' | 'claude' | 'gemini' | 'dev' | 'git' | 'python';
type AgentLauncherItem = {
  type: QuickTerminalType;
  label: string;
  provider?: AgentProvider;
  purpose: string;
  commandLabel: string;
};
export type TerminalDeskFilter = 'all' | 'command-hub' | 'active';

interface TerminalGridProps {
  defaultDeskFilter?: TerminalDeskFilter;
  embedded?: boolean;
  compact?: boolean;
}

function buildAgentLauncherItems(shell?: string): AgentLauncherItem[] {
  return [
    {
      type: 'codex',
      label: 'Codex',
      provider: 'codex',
      purpose: 'Primary code agent',
      commandLabel: resolveAgentRuntimeCommand('codex', shell)
    },
    {
      type: 'opencode',
      label: 'OpenCode',
      provider: 'opencode',
      purpose: 'DeepSeek strategy agent',
      commandLabel: resolveAgentRuntimeCommand('opencode', shell)
    },
    {
      type: 'claude',
      label: 'Claude',
      provider: 'claude',
      purpose: 'Reasoning and review',
      commandLabel: resolveAgentRuntimeCommand('claude', shell)
    },
    {
      type: 'gemini',
      label: 'Gemini',
      provider: 'gemini',
      purpose: 'Second opinion agent',
      commandLabel: resolveAgentRuntimeCommand('gemini', shell)
    },
    {
      type: 'shell',
      label: 'Shell',
      purpose: 'Workspace terminal',
      commandLabel: shell || 'system shell'
    },
    {
      type: 'dev',
      label: 'Dev',
      purpose: 'Local app process',
      commandLabel: 'npm run dev'
    }
  ];
}

function getLauncherStatus(item: AgentLauncherItem, terminals: TerminalSession[], limitReached: boolean): string {
  if (limitReached) {
    return 'limit reached';
  }

  const matching = terminals.filter((terminal) => {
    if (item.provider) {
      return terminal.runtimeProvider === item.provider;
    }

    if (item.type === 'dev') {
      return terminal.autoCommand === 'npm run dev' || terminal.terminalPurpose === 'dev-server';
    }

    if (item.type === 'shell') {
      return !terminal.runtimeProvider && !terminal.autoCommand;
    }

    return false;
  });

  if (matching.length === 0) {
    return 'ready';
  }

  const attentionCount = matching.filter((terminal) => (
    terminal.runtimeState === 'failed'
    || terminal.runtimeState === 'stalled'
    || terminal.ptyState === 'failed'
  )).length;
  if (attentionCount > 0) {
    return `${attentionCount} attention`;
  }

  const activeCount = matching.filter((terminal) => (
    terminal.runtimeState === 'running'
    || terminal.runtimeState === 'waiting-response'
    || terminal.runtimeState === 'handoff'
    || terminal.runtimeState === 'launching'
    || terminal.ptyState === 'creating'
  )).length;

  if (activeCount > 0) {
    return `${activeCount} active`;
  }

  return `${matching.length} open`;
}

export const TerminalGrid: React.FC<TerminalGridProps> = ({ defaultDeskFilter = 'all', embedded = false, compact = false }) => {
  const navigate = useNavigate();
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
  const { activeWorkspace, workspaces } = useWorkspaceContext();
  const [layoutMode, setLayoutMode] = React.useState<'grid' | 'vertical'>(compact ? 'vertical' : 'grid');
  const [deskFilter, setDeskFilter] = React.useState<TerminalDeskFilter>(defaultDeskFilter);
  const [handoffNotice, setHandoffNotice] = React.useState<string | null>(null);
  const minimalCodeChrome = embedded && compact;
  const terminalLimitReached = terminals.length >= MAX_TERMINALS;
  const settings = React.useMemo(() => loadAppSettings(), []);
  const activeShell = React.useMemo(
    () => resolveTerminalShell(activeWorkspace?.shell, settings.defaultShell).shell,
    [activeWorkspace?.shell, settings.defaultShell]
  );
  const agentLaunches = React.useMemo(() => buildAgentLauncherItems(activeShell), [activeShell]);
  const handleOpenDiagnostics = React.useCallback(() => {
    navigate('/diagnostics');
  }, [navigate]);
  const commandHubWorkspace = React.useMemo(
    () => workspaces.find((workspace) => workspace.kind === 'command-hub') || null,
    [workspaces]
  );
  const workspaceVisibleTerminals = React.useMemo(() => {
    if (deskFilter === 'command-hub') {
      return terminals.filter((terminal) => (
        terminal.workspaceId === commandHubWorkspace?.id
        || (!terminal.workspaceId && commandHubWorkspace?.path && terminal.cwd === commandHubWorkspace.path)
      ));
    }

    if (deskFilter === 'active') {
      return terminals.filter((terminal) => (
        terminal.workspaceId === activeWorkspace?.id
        || (!terminal.workspaceId && activeWorkspace?.path && terminal.cwd === activeWorkspace.path)
      ));
    }

    return terminals;
  }, [activeWorkspace?.id, activeWorkspace?.path, commandHubWorkspace?.id, commandHubWorkspace?.path, deskFilter, terminals]);
  const visibleTerminals = workspaceVisibleTerminals;
  const missionTerminals = React.useMemo(
    () => visibleTerminals.filter((terminal) => Boolean(terminal.missionTitle || terminal.terminalPurpose === 'mission-console')),
    [visibleTerminals]
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

  const handleNewTerminal = (type: QuickTerminalType = 'shell') => {
    if (terminalLimitReached) {
      alert(`Maximum ${MAX_TERMINALS} terminals reached. Close one before opening another.`);
      return;
    }

    const defaultCwd = activeWorkspace?.path || '/Users/optimus/Documents/New project 9';
    const shell = activeShell;

    let label = 'Terminal';
    let autoCommand: string | undefined;
    let runtimeProvider: AgentProvider | undefined;
    let terminalPurpose = 'workspace-shell';

    switch (type) {
      case 'codex':
        label = 'Codex';
        runtimeProvider = 'codex';
        autoCommand = resolveAgentRuntimeCommand('codex', shell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'opencode':
        label = 'OpenCode';
        runtimeProvider = 'opencode';
        autoCommand = resolveAgentRuntimeCommand('opencode', shell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'claude':
        label = 'Claude';
        runtimeProvider = 'claude';
        autoCommand = resolveAgentRuntimeCommand('claude', shell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'gemini':
        label = 'Gemini';
        runtimeProvider = 'gemini';
        autoCommand = resolveAgentRuntimeCommand('gemini', shell);
        terminalPurpose = 'agent-runtime';
        break;
      case 'dev':
        label = 'NPM Dev';
        autoCommand = 'npm run dev';
        terminalPurpose = 'dev-server';
        break;
      case 'git':
        label = 'Git';
        autoCommand = 'git status';
        break;
      case 'python':
        label = 'Python';
        autoCommand = 'python';
        break;
      case 'shell':
      default:
        label = 'Shell';
        autoCommand = undefined;
        break;
    }

    createTerminal(
      defaultCwd,
      shell,
      label,
      autoCommand,
      {
        workspaceId: activeWorkspace?.id,
        terminalPurpose,
        ...(runtimeProvider ? { runtimeProvider, agentName: `${label} Agent` } : {})
      }
    );
  };

  const handleCloseTerminal = (terminalId: string) => {
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

  const gridLayout = getGridLayout(visibleTerminals.length);
  const compactGridColumns = 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))';
  const compactGridRows = visibleTerminals.length <= 2 ? 'minmax(0, 1fr)' : 'minmax(180px, 1fr)';
  const useStackLayout = !minimalCodeChrome && layoutMode === 'vertical';

  if (visibleTerminals.length === 0 && minimalCodeChrome) {
    return (
      <div style={minimalTerminalEmptyStyle}>
        <span style={{ color: 'var(--app-subtle)', fontSize: '11px', fontWeight: 800 }}>
          No terminals
        </span>
      </div>
    );
  }

  if (visibleTerminals.length === 0) {
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
        padding: compact ? '12px' : embedded ? '0' : '40px'
      }}>
        <div style={{
          background: 'var(--app-panel)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          padding: compact ? '18px' : '40px 60px',
          width: compact ? '100%' : undefined,
          maxWidth: compact ? '100%' : undefined,
          borderRadius: embedded ? '8px' : '16px',
          border: '1px solid var(--app-terminal-border)',
          boxShadow: '0 8px 32px var(--app-glow)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px'
        }}>
          <div style={{ fontSize: compact ? '30px' : '48px', marginBottom: '8px', fontFamily: "'JetBrains Mono', monospace" }}>CLI</div>
          <div style={{ fontSize: compact ? '15px' : '20px', color: 'var(--app-text)', fontWeight: '600', marginBottom: '8px', textAlign: 'center' }}>
            {terminals.length === 0 ? 'No terminal sessions running' : 'No terminals match this workspace filter'}
          </div>
          <div style={{ fontSize: compact ? '12px' : '14px', color: 'var(--app-muted)', textAlign: 'center', maxWidth: compact ? '260px' : '340px', lineHeight: '1.5' }}>
            Launch a shell or agent runtime for this workspace.
          </div>
          <div style={{ width: '100%', display: 'grid', gap: '10px' }}>
            <TerminalDeskFilterBar
              value={deskFilter}
              onChange={setDeskFilter}
              activeDeskName={activeWorkspace?.name}
              commandHubName={commandHubWorkspace?.name}
            />
            <AgentLauncher
              items={agentLaunches}
              terminals={visibleTerminals}
              terminalLimitReached={terminalLimitReached}
              onLaunch={handleNewTerminal}
              compact={compact}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      minHeight: 0,
      background: 'var(--app-bg)',
      padding: embedded ? '0' : '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: minimalCodeChrome ? '0' : '8px'
    }}>
      {!minimalCodeChrome ? (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexDirection: 'column',
          padding: '6px 8px',
          background: 'var(--app-panel)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: embedded ? '8px' : '8px',
          border: '1px solid var(--app-border)',
          boxShadow: '0 2px 12px var(--app-glow), inset 0 1px 1px rgba(255, 255, 255, 0.03)',
          gap: '6px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            minWidth: 0,
            width: '100%'
          }}>
            <span style={{ color: 'var(--app-accent)', fontSize: '12px', fontWeight: '800', whiteSpace: 'nowrap' }}>Code</span>
            <div style={{
              background: terminalLimitReached ? 'var(--app-negative-soft)' : 'var(--app-accent-soft)',
              padding: '2px 7px',
              borderRadius: '999px',
              fontSize: '10px',
              color: terminalLimitReached ? 'var(--app-negative)' : 'var(--app-accent)',
              fontWeight: '700',
              border: `1px solid ${terminalLimitReached ? 'var(--app-negative)' : 'var(--app-border-strong)'}`
            }}>
              {visibleTerminals.length}/{MAX_TERMINALS}
            </div>

            <button
              onClick={() => setLayoutMode(layoutMode === 'grid' ? 'vertical' : 'grid')}
              title={layoutMode === 'grid' ? 'Switch to vertical layout' : 'Switch to grid layout'}
              style={{
                height: '24px',
                padding: '2px 7px',
                background: 'var(--app-panel-muted)',
                border: '1px solid var(--app-border)',
                borderRadius: '6px',
                color: 'var(--app-subtle)',
                fontSize: '10px',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
            >
              {layoutMode === 'grid' ? 'Grid' : 'Vertical'}
            </button>

            <TerminalDeskFilterBar
              value={deskFilter}
              onChange={setDeskFilter}
              activeDeskName={activeWorkspace?.name}
              commandHubName={commandHubWorkspace?.name}
            />
          </div>

          <AgentLauncher
            items={agentLaunches}
            terminals={visibleTerminals}
            terminalLimitReached={terminalLimitReached}
            onLaunch={handleNewTerminal}
            compact={compact}
          />
        </div>
      ) : null}

      {!minimalCodeChrome && missionTerminals.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '8px',
          padding: '0 2px'
        }}>
          {missionTerminals.map((terminal) => (
            <div key={`mission-${terminal.id}`} style={{
              border: '1px solid var(--app-border-strong)',
              borderRadius: '12px',
              background: 'var(--app-panel)',
              padding: '10px',
              display: 'grid',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--app-text)', fontSize: '12px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {terminal.missionTitle || terminal.label}
                  </div>
                  <div style={{ color: 'var(--app-subtle)', fontSize: '10px', marginTop: '4px' }}>
                    {terminal.runtimeProvider || 'shell'} / {terminal.missionKind || 'mission'} / {terminal.runtimeState || terminal.ptyState}
                  </div>
                </div>
                <button type="button" onClick={() => setActiveTerminal(terminal.id)} style={missionTinyButtonStyle}>Focus</button>
              </div>
              <div style={{ color: 'var(--app-muted)', fontSize: '10px', lineHeight: 1.4, minHeight: '28px' }}>
                {terminal.runtimeDetail || terminal.ptyDetail || 'Mission terminal is active.'}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void handleExportMissionHandoff(terminal)} style={missionTinyButtonStyle}>Export handoff</button>
                {terminal.lastOutputAt ? (
                  <span style={{ color: 'var(--app-subtle)', fontSize: '10px', alignSelf: 'center' }}>
                    output {Math.max(0, Math.round((Date.now() - terminal.lastOutputAt) / 1000))}s ago
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {handoffNotice ? (
            <div style={{
              gridColumn: '1 / -1',
              color: handoffNotice.startsWith('Handoff exported') ? 'var(--app-accent)' : 'var(--app-negative)',
              fontSize: '11px',
              padding: '2px 4px'
            }}>{handoffNotice}</div>
          ) : null}
        </div>
      ) : null}

      <div style={{
        flex: 1,
        minHeight: 0,
        display: useStackLayout ? 'flex' : 'grid',
        flexDirection: useStackLayout ? 'column' : undefined,
        gridTemplateColumns: !useStackLayout
          ? (minimalCodeChrome ? compactGridColumns : `repeat(${gridLayout.cols}, 1fr)`)
          : undefined,
        gridTemplateRows: !useStackLayout && !minimalCodeChrome ? `repeat(${gridLayout.rows}, 1fr)` : undefined,
        gridAutoRows: !useStackLayout && minimalCodeChrome ? compactGridRows : undefined,
        gap: minimalCodeChrome ? '5px' : '6px',
        overflow: useStackLayout || (minimalCodeChrome && visibleTerminals.length > 2) ? 'auto' : 'hidden'
      }}>
        {visibleTerminals.map((terminal) => (
          <div
            key={terminal.id}
            style={{
              position: 'relative',
              minWidth: 0,
              height: '100%',
              flex: layoutMode === 'vertical'
                ? '0 0 auto'
                : undefined,
              minHeight: !minimalCodeChrome && layoutMode === 'vertical'
                ? (compact ? '260px' : '300px')
                : 0,
              overflow: 'hidden',
              contain: 'layout paint'
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
                missionTitle={terminal.missionTitle}
                agentName={terminal.agentName}
                terminalPurpose={terminal.terminalPurpose}
                runId={terminal.runId}
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
                onOpenDiagnostics={handleOpenDiagnostics}
                isActive={activeTerminalId === terminal.id}
                compactChrome={minimalCodeChrome}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const missionTinyButtonStyle: React.CSSProperties = {
  border: '1px solid var(--app-border-strong)',
  borderRadius: '8px',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-accent)',
  padding: '5px 8px',
  fontSize: '10px',
  fontWeight: 800,
  cursor: 'pointer'
};

const minimalTerminalEmptyStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  background: 'var(--app-terminal-bg)',
  color: 'var(--app-muted)'
};

function AgentLauncher({
  items,
  terminals,
  terminalLimitReached,
  onLaunch,
  compact
}: {
  items: AgentLauncherItem[];
  terminals: TerminalSession[];
  terminalLimitReached: boolean;
  onLaunch: (type: QuickTerminalType) => void;
  compact?: boolean;
}) {
  return (
    <div style={agentLauncherShellStyle} aria-label="Agent launcher">
      <span style={agentLauncherTitleStyle}>Agents</span>
      <div style={{
        ...agentLauncherGridStyle,
        gridTemplateColumns: compact
          ? 'repeat(auto-fit, minmax(74px, 1fr))'
          : 'repeat(6, minmax(70px, 1fr))'
      }}>
        {items.map((item) => {
          const providerMeta = item.provider ? getProviderMeta(item.provider) : null;
          const status = getLauncherStatus(item, terminals, terminalLimitReached);
          const accent = providerMeta?.accent || (item.type === 'dev' ? '#f59e0b' : '#94a3b8');
          const isAttention = status.includes('attention');
          const statusDotColor = isAttention
            ? 'var(--app-negative)'
            : status === 'ready'
              ? 'var(--app-subtle)'
              : accent;
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => onLaunch(item.type)}
              disabled={terminalLimitReached}
              title={terminalLimitReached ? `Terminal limit ${MAX_TERMINALS} reached` : `${item.label} - ${item.purpose} - ${item.commandLabel} - ${status}`}
              aria-label={`Launch ${item.label}`}
              style={{
                ...agentLauncherCardStyle,
                opacity: terminalLimitReached ? 0.52 : 1,
                cursor: terminalLimitReached ? 'not-allowed' : 'pointer',
                borderColor: status === 'ready' ? 'var(--app-border)' : `${accent}40`
              }}
            >
              <span style={{
                ...agentProviderBadgeStyle,
                color: accent,
                background: `${accent}12`,
                borderColor: `${accent}30`
              }}>
                {providerMeta?.shortLabel || (item.type === 'dev' ? 'DV' : 'SH')}
              </span>
              <span style={agentLauncherNameStyle}>{item.label}</span>
              <span title={status} style={{ ...agentLauncherStatusDotStyle, background: statusDotColor }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const agentLauncherShellStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '7px'
};

const agentLauncherTitleStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: 'uppercase',
  flexShrink: 0
};

const agentLauncherGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '5px',
  minWidth: 0,
  flex: 1
};

const agentLauncherCardStyle: React.CSSProperties = {
  minWidth: 0,
  height: '30px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
  padding: '4px 6px',
  borderRadius: '7px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-text)',
  textAlign: 'left',
  transition: 'border-color 0.15s ease, background 0.15s ease'
};

const agentProviderBadgeStyle: React.CSSProperties = {
  minWidth: '24px',
  height: '18px',
  padding: '1px 5px',
  borderRadius: '999px',
  border: '1px solid var(--app-border)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '8px',
  fontWeight: 900,
  letterSpacing: 0,
  flexShrink: 0
};

const agentLauncherNameStyle: React.CSSProperties = {
  minWidth: 0,
  color: 'var(--app-text)',
  fontSize: '10px',
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const agentLauncherStatusDotStyle: React.CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '999px',
  flexShrink: 0,
  opacity: 0.85
};

function TerminalDeskFilterBar({
  value,
  onChange,
  activeDeskName,
  commandHubName
}: {
  value: TerminalDeskFilter;
  onChange: (value: TerminalDeskFilter) => void;
  activeDeskName?: string;
  commandHubName?: string;
}) {
  const filters: Array<{ value: TerminalDeskFilter; label: string; title: string }> = [
    { value: 'all', label: 'All', title: 'Show all terminal sessions' },
    { value: 'command-hub', label: commandHubName || 'Command Hub', title: 'Show global command hub terminals' },
    { value: 'active', label: activeDeskName || 'Active Workspace', title: 'Show terminals for the active workspace' }
  ];

  return (
    <div style={deskFilterBarStyle} aria-label="Terminal workspace filter">
      {filters.map((filter) => {
        const selected = filter.value === value;
        return (
          <button
            key={filter.value}
            type="button"
            title={filter.title}
            onClick={() => onChange(filter.value)}
            style={{
              ...deskFilterButtonStyle,
              background: selected ? 'var(--app-focus)' : 'var(--app-panel-muted)',
              borderColor: selected ? 'var(--app-border-strong)' : 'var(--app-border)',
              color: selected ? 'var(--app-text)' : 'var(--app-subtle)'
            }}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

const deskFilterBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap'
};

const deskFilterButtonStyle: React.CSSProperties = {
  height: '26px',
  minWidth: '44px',
  maxWidth: '150px',
  padding: '4px 9px',
  border: '1px solid var(--app-border)',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '10px',
  fontWeight: 800,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
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
