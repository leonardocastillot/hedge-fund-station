import React from 'react';
import { useDeskHistoryContext } from '../../contexts/DeskHistoryContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { useTerminalContext } from '../../contexts/TerminalContext';
import { useContextContext } from '../../contexts/ContextContext';
import type { Workspace } from '../../types/electron';
import { buildTerminalLabel, getLaunchProfileCommandSummary, launchProfileSequence } from '../../utils/workspaceLaunch';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PaletteAction {
  id: string;
  title: string;
  subtitle: string;
  keywords: string;
  run: () => void | Promise<void>;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspaceContext();
  const { activeContext, contexts, setActiveContext } = useContextContext();
  const { createTerminal, closeTerminal, activeTerminalId } = useTerminalContext();
  const { recordLaunch } = useDeskHistoryContext();
  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const runWorkspaceCommand = React.useCallback((workspace: Workspace, command?: string, switchWorkspace = true) => {
    if (switchWorkspace) {
      void setActiveWorkspace(workspace.id);
    }

    createTerminal(
      workspace.path,
      workspace.shell,
      buildTerminalLabel(workspace, command),
      command
    );
  }, [createTerminal, setActiveWorkspace]);

  const runWorkspaceProfile = React.useCallback((workspace: Workspace, profileId: string, switchWorkspace = true) => {
    const profile = workspace.launch_profiles.find((item) => item.id === profileId);
    if (switchWorkspace) {
      void setActiveWorkspace(workspace.id);
    }

    if (profile) {
      launchProfileSequence(workspace, profile, createTerminal, undefined, recordLaunch);
      return;
    }

    workspace.default_commands.forEach((command) => {
      createTerminal(
        workspace.path,
        workspace.shell,
        buildTerminalLabel(workspace, command),
        command
      );
    });
  }, [createTerminal, recordLaunch, setActiveWorkspace]);

  const actions = React.useMemo<PaletteAction[]>(() => {
    const next: PaletteAction[] = [];

    if (activeWorkspace) {
      next.push({
        id: 'active-open-shell',
        title: `Open shell in ${activeWorkspace.name}`,
        subtitle: activeWorkspace.path,
        keywords: `shell terminal ${activeWorkspace.name} ${activeWorkspace.path}`,
        run: () => runWorkspaceCommand(activeWorkspace)
      });

      next.push({
        id: 'active-claude',
        title: `Run claude in ${activeWorkspace.name}`,
        subtitle: 'Launches a new terminal with claude',
        keywords: `claude ${activeWorkspace.name}`,
        run: () => runWorkspaceCommand(activeWorkspace, 'claude')
      });

      activeWorkspace.launch_profiles.forEach((profile) => {
        next.push({
          id: `profile-${activeWorkspace.id}-${profile.id}`,
          title: `${profile.name}`,
          subtitle: `${activeWorkspace.name} - ${getLaunchProfileCommandSummary(profile)}`,
          keywords: `${profile.name} ${profile.steps.map((step) => step.command).join(' ')} ${activeWorkspace.name} launch profile agent desk`,
          run: () => runWorkspaceProfile(activeWorkspace, profile.id)
        });
      });

      activeWorkspace.default_commands.forEach((command) => {
        next.push({
          id: `command-${activeWorkspace.id}-${command}`,
          title: command,
          subtitle: `${activeWorkspace.name} saved command`,
          keywords: `${command} ${activeWorkspace.name} saved command`,
          run: () => runWorkspaceCommand(activeWorkspace, command)
        });
      });
    }

    workspaces.forEach((workspace) => {
      next.push({
        id: `workspace-switch-${workspace.id}`,
        title: `Switch to ${workspace.name}`,
        subtitle: workspace.path,
        keywords: `switch workspace ${workspace.name} ${workspace.path}`,
        run: async () => {
          await setActiveWorkspace(workspace.id);
        }
      });

      next.push({
        id: `workspace-shell-${workspace.id}`,
        title: `Open shell in ${workspace.name}`,
        subtitle: workspace.shell,
        keywords: `open shell terminal ${workspace.name} ${workspace.shell}`,
        run: () => runWorkspaceCommand(workspace)
      });
    });

    contexts.forEach((context) => {
      next.push({
        id: `context-${context.id}`,
        title: `Switch to ${context.name}`,
        subtitle: context.description,
        keywords: `context ${context.name} ${context.description}`,
        run: () => setActiveContext(context.id)
      });
    });

    next.push({
      id: 'close-active-terminal',
      title: 'Close active terminal',
      subtitle: activeTerminalId ? `Terminal ${activeTerminalId}` : 'No active terminal',
      keywords: 'close active terminal',
      run: () => {
        if (activeTerminalId) {
          window.electronAPI.terminal.kill(activeTerminalId);
          closeTerminal(activeTerminalId);
        }
      }
    });

    return next;
  }, [
    activeTerminalId,
    activeWorkspace,
    closeTerminal,
    contexts,
    createTerminal,
    runWorkspaceCommand,
    runWorkspaceProfile,
    setActiveContext,
    setActiveWorkspace,
    workspaces
  ]);

  const filteredActions = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return actions;
    }

    return actions.filter((action) => {
      const haystack = `${action.title} ${action.subtitle} ${action.keywords}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [actions, query]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery('');
    setSelectedIndex(0);

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, Math.max(filteredActions.length - 1, 0)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === 'Enter') {
        const action = filteredActions[selectedIndex];
        if (!action) {
          return;
        }

        event.preventDefault();
        void Promise.resolve(action.run()).finally(() => {
          onClose();
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredActions, isOpen, onClose, selectedIndex]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 9999,
        padding: '10vh 24px 24px'
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(720px, 100%)',
          margin: '0 auto',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          background: 'rgba(6, 10, 20, 0.7)',
          backdropFilter: 'blur(40px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
          boxShadow: '0 32px 100px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
          overflow: 'hidden'
        }}
      >
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.03)'
        }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands, workspaces, profiles, contexts..."
            style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              borderRadius: '10px',
              color: '#f0f2f5',
              padding: '12px 14px',
              fontSize: '13px',
              outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.01em'
            }}
          />
          <div style={{
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '8px',
            color: '#545e6e',
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace"
          }}>
            <span>Active context: {activeContext}</span>
            <span>Enter to run, Esc to close</span>
          </div>
        </div>

        <div style={{
          maxHeight: '60vh',
          overflowY: 'auto',
          padding: '8px'
        }}>
          {filteredActions.length === 0 ? (
            <div style={{
              padding: '18px',
              color: '#9ca3af',
              fontSize: '13px'
            }}>
              No actions match your search.
            </div>
          ) : (
            filteredActions.map((action, index) => (
              <button
                key={action.id}
                type="button"
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => {
                  void Promise.resolve(action.run()).finally(() => {
                    onClose();
                  });
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  textAlign: 'left',
                  borderRadius: '10px',
                  border: index === selectedIndex
                    ? '1px solid rgba(255, 255, 255, 0.06)'
                    : '1px solid transparent',
                  background: index === selectedIndex
                    ? 'rgba(255, 255, 255, 0.03)'
                    : 'transparent',
                  color: '#f0f2f5',
                  cursor: 'pointer',
                  boxShadow: index === selectedIndex
                    ? '0 0 12px var(--app-glow)'
                    : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700 }}>{action.title}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{action.subtitle}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
