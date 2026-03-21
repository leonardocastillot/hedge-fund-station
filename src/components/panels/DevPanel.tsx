import React from 'react';
import { useDeskHistoryContext } from '../../contexts/DeskHistoryContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { useTerminalContext } from '../../contexts/TerminalContext';
import { CommanderConsole } from '../agents/CommanderConsole';
import { AgentSupervisorBoard } from '../agents/AgentSupervisorBoard';
import { buildTerminalLabel, getLaunchProfileCommandSummary, launchProfileSequence } from '../../utils/workspaceLaunch';

const COMMAND_DRAFT_KEY = 'hedge-station:dev-command-draft';

function QuickActionButton({
  label,
  hint,
  tone = 'neutral',
  onClick,
  disabled = false
}: {
  label: string;
  hint: string;
  tone?: 'neutral' | 'accent' | 'success';
  onClick: () => void;
  disabled?: boolean;
}) {
  const toneStyles = {
    neutral: {
      background: 'rgba(255, 255, 255, 0.04)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      color: '#f3f4f6'
    },
    accent: {
      background: 'rgba(239, 68, 68, 0.12)',
      border: '1px solid rgba(239, 68, 68, 0.24)',
      color: '#fecaca'
    },
    success: {
      background: 'rgba(16, 185, 129, 0.12)',
      border: '1px solid rgba(16, 185, 129, 0.24)',
      color: '#d1fae5'
    }
  }[tone];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '14px 16px',
        borderRadius: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        opacity: disabled ? 0.45 : 1,
        textAlign: 'left',
        ...toneStyles
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: '11px', marginTop: '4px', color: 'rgba(255, 255, 255, 0.55)' }}>{hint}</div>
    </button>
  );
}

export const DevPanel: React.FC = () => {
  const { activeWorkspace, workspaces } = useWorkspaceContext();
  const { terminals, createTerminal } = useTerminalContext();
  const { history, recordLaunch } = useDeskHistoryContext();
  const [commandDraft, setCommandDraft] = React.useState(() => localStorage.getItem(COMMAND_DRAFT_KEY) || '');

  React.useEffect(() => {
    localStorage.setItem(COMMAND_DRAFT_KEY, commandDraft);
  }, [commandDraft]);

  const runInActiveWorkspace = React.useCallback((command?: string) => {
    if (!activeWorkspace) {
      return;
    }

    createTerminal(
      activeWorkspace.path,
      activeWorkspace.shell,
      buildTerminalLabel(activeWorkspace, command),
      command
    );
  }, [activeWorkspace, createTerminal]);

  const runProfileInActiveWorkspace = React.useCallback((profileId: string) => {
    if (!activeWorkspace) {
      return;
    }

    const profile = activeWorkspace.launch_profiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    launchProfileSequence(activeWorkspace, profile, createTerminal, undefined, recordLaunch);
  }, [activeWorkspace, createTerminal, recordLaunch]);

  const defaultCommands = activeWorkspace?.default_commands ?? [];
  const launchProfiles = activeWorkspace?.launch_profiles ?? [];
  const workspaceHistory = React.useMemo(
    () => history.filter((item) => item.workspaceId === activeWorkspace?.id).slice(0, 6),
    [activeWorkspace?.id, history]
  );
  const activeWorkspaceTerminals = React.useMemo(
    () => terminals.filter((terminal) => terminal.cwd === activeWorkspace?.path),
    [activeWorkspace?.path, terminals]
  );

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#05070b',
      overflow: 'auto'
    }}>
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid rgba(239, 68, 68, 0.16)',
        background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.06) 0%, rgba(5, 7, 11, 0.95) 100%)'
      }}>
        <div style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 700 }}>
          Productivity App
        </div>
        <h2 style={{ color: '#f9fafb', fontSize: '24px', fontWeight: 700, margin: '10px 0 6px 0' }}>
          AI Workstation
        </h2>
        <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0, maxWidth: '760px', lineHeight: 1.6 }}>
          Supervise agents, launch desks, inspect runtime terminals and keep your workspace operational from one screen.
        </p>
      </div>

      <div style={{ padding: '20px 24px', display: 'grid', gap: '18px' }}>
        <div style={{
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          background: 'rgba(0, 0, 0, 0.35)',
          padding: '18px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700 }}>
                Active Workspace
              </div>
              <div style={{ marginTop: '8px', color: '#f3f4f6', fontSize: '20px', fontWeight: 700 }}>
                {activeWorkspace?.name || 'No workspace selected'}
              </div>
              <div style={{ marginTop: '6px', color: '#9ca3af', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {activeWorkspace?.path || 'Selecciona un workspace en la sidebar para empezar.'}
              </div>
            </div>

            <div style={{
              padding: '8px 12px',
              borderRadius: '999px',
              background: activeWorkspace ? 'rgba(16, 185, 129, 0.12)' : 'rgba(107, 114, 128, 0.14)',
              border: activeWorkspace ? '1px solid rgba(16, 185, 129, 0.24)' : '1px solid rgba(107, 114, 128, 0.22)',
              color: activeWorkspace ? '#a7f3d0' : '#9ca3af',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em'
            }}>
              {activeWorkspace ? activeWorkspace.shell : `${workspaces.length} workspaces`}
            </div>
          </div>
        </div>

        <AgentSupervisorBoard workspaceId={activeWorkspace?.id} />

        <CommanderConsole workspaceId={activeWorkspace?.id} />

        <div style={{
          display: 'grid',
          gap: '18px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'
        }}>
          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>Quick Launch</div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px'
            }}>
              <QuickActionButton
                label="Open Shell"
                hint="Terminal limpia en el workspace activo"
                tone="accent"
                disabled={!activeWorkspace}
                onClick={() => runInActiveWorkspace()}
              />
              <QuickActionButton
                label="Claude"
                hint="Nueva terminal ejecutando claude"
                disabled={!activeWorkspace}
                onClick={() => runInActiveWorkspace('claude')}
              />
              <QuickActionButton
                label="Git Status"
                hint="Revision rapida del repo actual"
                disabled={!activeWorkspace}
                onClick={() => runInActiveWorkspace('git status')}
              />
              <QuickActionButton
                label="NPM Dev"
                hint="Lanza npm run dev en una terminal nueva"
                tone="success"
                disabled={!activeWorkspace}
                onClick={() => runInActiveWorkspace('npm run dev')}
              />
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>Launch Profiles</div>
            <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '12px' }}>
              Desks secuenciales del workspace activo.
            </div>
            {launchProfiles.length === 0 ? (
              <div style={emptyStateStyle}>No hay launch profiles guardados para este workspace.</div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {launchProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    disabled={!activeWorkspace}
                    onClick={() => runProfileInActiveWorkspace(profile.id)}
                    style={actionCardStyle}
                  >
                    <div style={actionHeaderStyle}>{profile.name}</div>
                    <div style={actionCommandStyle}>{getLaunchProfileCommandSummary(profile)}</div>
                    <div style={actionMetaStyle}>
                      {profile.steps.map((step) => `${step.delayMs}ms>${step.command}`).join(' | ')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{
          display: 'grid',
          gap: '18px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'
        }}>
          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>Jobs and Desks</div>
            <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '12px' }}>
              Terminales activas y desks recientes en este workspace.
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <div style={subTitleStyle}>Active Terminals</div>
                {activeWorkspaceTerminals.length === 0 ? (
                  <div style={emptyStateStyle}>No hay terminales activas en este workspace.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {activeWorkspaceTerminals.map((terminal) => (
                      <div key={terminal.id} style={jobCardStyle}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#f3f4f6' }}>{terminal.label}</div>
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px', fontFamily: 'Consolas, monospace' }}>
                          {terminal.currentCommand || terminal.terminalPurpose || 'Interactive shell'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={subTitleStyle}>Recent Desks</div>
                {workspaceHistory.length === 0 ? (
                  <div style={emptyStateStyle}>Aun no has lanzado desks desde este workspace.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {workspaceHistory.map((entry) => {
                      const profile = launchProfiles.find((item) => item.id === entry.profileId);
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            if (profile) {
                              runProfileInActiveWorkspace(profile.id);
                            }
                          }}
                          style={{ ...jobCardStyle, cursor: profile ? 'pointer' : 'default', textAlign: 'left' }}
                        >
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#f3f4f6' }}>{entry.profileName}</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                            {new Date(entry.launchedAt).toLocaleString()}
                          </div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px', lineHeight: 1.45 }}>
                            {entry.commands.join(' | ')}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>Command Composer</div>
            <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '12px' }}>
              Open a new runtime terminal from a free-form command.
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={commandDraft}
                onChange={(event) => setCommandDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && activeWorkspace && commandDraft.trim()) {
                    runInActiveWorkspace(commandDraft.trim());
                  }
                }}
                placeholder={activeWorkspace ? 'python -m pytest' : 'Selecciona un workspace primero'}
                disabled={!activeWorkspace}
                style={{
                  flex: '1 1 420px',
                  padding: '12px 14px',
                  background: '#0b0f19',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  color: '#f9fafb',
                  fontSize: '13px',
                  fontFamily: 'Consolas, monospace'
                }}
              />
              <button
                type="button"
                disabled={!activeWorkspace || !commandDraft.trim()}
                onClick={() => runInActiveWorkspace(commandDraft.trim())}
                style={{
                  padding: '12px 18px',
                  background: !activeWorkspace || !commandDraft.trim()
                    ? 'rgba(75, 85, 99, 0.35)'
                    : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: !activeWorkspace || !commandDraft.trim() ? 'not-allowed' : 'pointer',
                  opacity: !activeWorkspace || !commandDraft.trim() ? 0.55 : 1
                }}
              >
                Run in New Terminal
              </button>
            </div>

            <div style={{ marginTop: '16px' }}>
              <div style={subTitleStyle}>Saved Workspace Commands</div>
              {defaultCommands.length === 0 ? (
                <div style={emptyStateStyle}>No hay comandos guardados para este workspace todavia.</div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {defaultCommands.map((command) => (
                    <button
                      key={command}
                      type="button"
                      disabled={!activeWorkspace}
                      onClick={() => runInActiveWorkspace(command)}
                      style={actionCardStyle}
                    >
                      <div style={actionHeaderStyle}>Launch</div>
                      <div style={actionCommandStyle}>{command}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const sectionCardStyle: React.CSSProperties = {
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '16px',
  background: 'rgba(0, 0, 0, 0.3)',
  padding: '18px'
};

const sectionTitleStyle: React.CSSProperties = {
  color: '#f3f4f6',
  fontSize: '15px',
  fontWeight: 700,
  marginBottom: '6px'
};

const subTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 700,
  marginBottom: '8px'
};

const emptyStateStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '12px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px dashed rgba(255, 255, 255, 0.12)',
  color: '#9ca3af',
  fontSize: '12px'
};

const jobCardStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: '12px',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)'
};

const actionCardStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: '12px',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  color: '#f3f4f6',
  cursor: 'pointer',
  textAlign: 'left'
};

const actionHeaderStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 700
};

const actionCommandStyle: React.CSSProperties = {
  fontSize: '13px',
  marginTop: '6px',
  fontFamily: 'Consolas, monospace',
  wordBreak: 'break-word'
};

const actionMetaStyle: React.CSSProperties = {
  fontSize: '11px',
  marginTop: '6px',
  color: '#9ca3af',
  lineHeight: 1.5
};
