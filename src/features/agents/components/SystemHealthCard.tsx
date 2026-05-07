import React from 'react';
import type { AgentProvider } from '@/types/agents';
import type { Workspace, DiagnosticsCommandStatus, DiagnosticsShellSmokeTestResult, TerminalSmokeTestResult } from '@/types/electron';
import { getProviderMeta, resolveAgentRuntimeCommand, resolveAgentRuntimeShell } from '@/utils/agentRuntime';

type CheckState = 'idle' | 'running' | 'done' | 'error';

interface SystemHealthCardProps {
  workspace: Workspace | null;
  providers: AgentProvider[];
  onOpenProbe: (provider: AgentProvider) => void;
}

function getCommandTone(available: boolean): React.CSSProperties {
  return {
    padding: '3px 8px',
    borderRadius: '999px',
    background: available ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
    color: available ? '#6ee7b7' : '#fca5a5',
    fontSize: '10px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.08em'
  };
}

export const SystemHealthCard: React.FC<SystemHealthCardProps> = ({ workspace, providers, onOpenProbe }) => {
  const [checkState, setCheckState] = React.useState<CheckState>('idle');
  const [commands, setCommands] = React.useState<DiagnosticsCommandStatus[]>([]);
  const [shellResult, setShellResult] = React.useState<DiagnosticsShellSmokeTestResult | null>(null);
  const [ptyResult, setPtyResult] = React.useState<TerminalSmokeTestResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const runtimeShell = React.useMemo(
    () => workspace ? resolveAgentRuntimeShell(workspace.shell) : undefined,
    [workspace]
  );

  const runtimeCommands = React.useMemo(() => {
    if (!workspace) {
      return [];
    }

    return Array.from(new Set(providers.map((provider) => resolveAgentRuntimeCommand(provider, runtimeShell))));
  }, [providers, runtimeShell, workspace]);

  const runCheck = React.useCallback(async () => {
    if (!workspace) {
      return;
    }

    if (typeof window.electronAPI.diagnostics?.checkCommands !== 'function'
      || typeof window.electronAPI.diagnostics?.shellSmokeTest !== 'function'
      || typeof window.electronAPI.terminal?.smokeTest !== 'function') {
      setCheckState('error');
      setError('Preload diagnostics or terminal smoke API not available. Restart the Electron shell.');
      return;
    }

    setCheckState('running');
    setError(null);

    try {
      const [commandStatuses, shellSmoke] = await Promise.all([
        window.electronAPI.diagnostics.checkCommands(runtimeCommands, { cwd: workspace.path, shell: runtimeShell }),
        window.electronAPI.diagnostics.shellSmokeTest(workspace.path, runtimeShell)
      ]);
      const ptySmoke = await window.electronAPI.terminal.smokeTest(workspace.path, runtimeShell);

      setCommands(commandStatuses);
      setShellResult(shellSmoke);
      setPtyResult(ptySmoke);
      const hasMissingCommand = commandStatuses.some((item) => !item.available);
      setCheckState(shellSmoke.success && ptySmoke.success && !hasMissingCommand ? 'done' : 'error');
      if (!shellSmoke.success || !ptySmoke.success || hasMissingCommand) {
        setError(shellSmoke.error || ptySmoke.error || (hasMissingCommand ? 'One or more runtime commands are missing.' : 'Shell or PTY check failed'));
      }
    } catch (caught) {
      setCheckState('error');
      setError(caught instanceof Error ? caught.message : 'Diagnostics failed');
    }
  }, [runtimeCommands, runtimeShell, workspace]);

  const missingCommands = commands.filter((item) => !item.available);
  const ready = commands.length > 0 && missingCommands.length === 0 && shellResult?.success && ptyResult?.success;

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div>
          <div style={labelStyle}>System Check</div>
          <div style={copyStyle}>Verify shell and runtimes before launching a mission.</div>
        </div>
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={!workspace || checkState === 'running'}
          style={{
            ...primaryButtonStyle,
            opacity: !workspace || checkState === 'running' ? 0.55 : 1,
            cursor: !workspace || checkState === 'running' ? 'not-allowed' : 'pointer'
          }}
        >
          {checkState === 'running' ? 'Checking...' : 'Run Check'}
        </button>
      </div>

      <div style={statusRowStyle}>
        <div style={statusPillStyle(ready ? 'ready' : checkState === 'error' ? 'attention' : 'launching')}>
          {ready ? 'Ready' : checkState === 'error' ? 'Needs Attention' : checkState === 'running' ? 'Running' : 'Idle'}
        </div>
        <div style={{ color: '#64748b', fontSize: '11px' }}>
          {workspace ? workspace.path : 'No active workspace'}
        </div>
      </div>

      <div style={sectionBlockStyle}>
        <div style={subLabelStyle}>Runtime Commands</div>
        <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
          {runtimeCommands.length === 0 ? (
            <div style={emptyStyle}>No provider commands in this workspace.</div>
          ) : runtimeCommands.map((command) => {
            const status = commands.find((item) => item.command === command);
            return (
              <div key={command} style={rowStyle}>
                <div>
                  <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>{command}</div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                    {status?.resolvedPath || 'Path unknown until check runs'}
                  </div>
                </div>
                <div style={getCommandTone(Boolean(status?.available))}>
                  {status ? (status.available ? 'available' : 'missing') : 'unknown'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={sectionBlockStyle}>
        <div style={subLabelStyle}>Shell Probe</div>
        <div style={probeBoxStyle}>
          <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>
            {workspace?.shell || 'No shell configured'}
          </div>
          <div style={{ color: shellResult?.success ? '#6ee7b7' : '#94a3b8', fontSize: '11px', marginTop: '6px', lineHeight: 1.4 }}>
            {shellResult
              ? (shellResult.output || shellResult.error || 'No shell output')
              : 'Runs a smoke test in the same shell and cwd used by missions.'}
          </div>
        </div>
      </div>

      <div style={sectionBlockStyle}>
        <div style={subLabelStyle}>PTY Probe</div>
        <div style={probeBoxStyle}>
          <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>
            {runtimeShell || workspace?.shell || 'No shell configured'}
          </div>
          <div style={{ color: ptyResult?.success ? '#6ee7b7' : '#94a3b8', fontSize: '11px', marginTop: '6px', lineHeight: 1.4 }}>
            {ptyResult
              ? (ptyResult.success
                  ? 'node-pty spawned a real shell and returned output.'
                  : ptyResult.error || ptyResult.output || 'PTY smoke failed')
              : 'Runs an invisible node-pty smoke test before mission launch.'}
          </div>
        </div>
      </div>

      <div style={sectionBlockStyle}>
        <div style={subLabelStyle}>Launch Probe</div>
        <div style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.45 }}>
          Open a real terminal using the same runtime command path the agent launch flow uses.
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          {providers.map((provider) => {
            const meta = getProviderMeta(provider);
            return (
              <button
                key={provider}
                type="button"
                onClick={() => onOpenProbe(provider)}
                disabled={!workspace}
                style={{
                  ...probeButtonStyle,
                  border: `1px solid ${meta.accent}33`,
                  background: meta.glow,
                  color: meta.accent,
                  opacity: workspace ? 1 : 0.5,
                  cursor: workspace ? 'pointer' : 'not-allowed'
                }}
              >
                Probe {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div style={errorStyle}>{error}</div>
      ) : null}

      {missingCommands.length > 0 ? (
        <div style={warningStyle}>
          Missing commands will leave a mission opened without an AI runtime. Install or fix the PATH before launching.
        </div>
      ) : null}

      {ptyResult && !ptyResult.success ? (
        <div style={warningStyle}>
          In-app terminals need a working node-pty helper. Run `npm run terminal:doctor`, then restart the Electron shell.
        </div>
      ) : null}
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '22px',
  background: 'rgba(15, 23, 42, 0.58)',
  border: '1px solid rgba(148, 163, 184, 0.12)'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center',
  flexWrap: 'wrap'
};

const labelStyle: React.CSSProperties = {
  color: '#e2e8f0',
  fontSize: '14px',
  fontWeight: 800
};

const copyStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '12px',
  marginTop: '4px'
};

const subLabelStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.12em'
};

const statusRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center',
  marginTop: '14px',
  flexWrap: 'wrap'
};

const sectionBlockStyle: React.CSSProperties = {
  marginTop: '14px'
};

const rowStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: '14px',
  background: 'rgba(2, 6, 23, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.1)',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center'
};

const probeBoxStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '14px',
  background: 'rgba(2, 6, 23, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.1)',
  marginTop: '8px'
};

const emptyStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '14px',
  background: 'rgba(15, 23, 42, 0.45)',
  border: '1px dashed rgba(148, 163, 184, 0.14)',
  color: '#64748b',
  fontSize: '12px'
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: '12px',
  border: '1px solid rgba(56, 189, 248, 0.24)',
  background: 'rgba(56, 189, 248, 0.12)',
  color: '#bae6fd',
  fontSize: '11px',
  fontWeight: 800
};

const probeButtonStyle: React.CSSProperties = {
  padding: '8px 11px',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: 800
};

const errorStyle: React.CSSProperties = {
  marginTop: '14px',
  padding: '10px 12px',
  borderRadius: '14px',
  background: 'rgba(127, 29, 29, 0.32)',
  border: '1px solid rgba(239, 68, 68, 0.22)',
  color: '#fecaca',
  fontSize: '11px'
};

const warningStyle: React.CSSProperties = {
  marginTop: '14px',
  padding: '10px 12px',
  borderRadius: '14px',
  background: 'rgba(120, 53, 15, 0.28)',
  border: '1px solid rgba(245, 158, 11, 0.2)',
  color: '#fde68a',
  fontSize: '11px',
  lineHeight: 1.4
};

function statusPillStyle(state: 'launching' | 'ready' | 'attention'): React.CSSProperties {
  const tone = {
    launching: { background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24' },
    ready: { background: 'rgba(16, 185, 129, 0.16)', color: '#34d399' },
    attention: { background: 'rgba(239, 68, 68, 0.16)', color: '#f87171' }
  }[state];

  return {
    padding: '4px 8px',
    borderRadius: '999px',
    background: tone.background,
    color: tone.color,
    fontSize: '10px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.08em'
  };
}
