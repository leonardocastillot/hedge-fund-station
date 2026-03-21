import { useState } from 'react';
import { TerminalProvider, useTerminalContext } from './contexts/TerminalContext';
import { WorkspaceProvider, useWorkspaceContext } from './contexts/WorkspaceContext';
import { ContextProvider } from './contexts/ContextContext';
import { DeskHistoryProvider } from './contexts/DeskHistoryContext';
import { AgentProfilesProvider } from './contexts/AgentProfilesContext';
import { CommanderTasksProvider } from './contexts/CommanderTasksContext';
import { ElectronLayout } from './components/electron/ElectronLayout';
import { UpdateNotification } from './components/electron/UpdateNotification';
import { BackendStatus } from './components/electron/BackendStatus';
import { CommandPalette } from './components/electron/CommandPalette';
import { PreloadApiNotice } from './components/electron/PreloadApiNotice';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function AppWithShortcuts() {
  const { createTerminal, closeTerminal, activeTerminalId } = useTerminalContext();
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspaceContext();
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Define keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrlKey: true,
      description: 'Command Palette',
      handler: () => {
        setIsCommandPaletteOpen(true);
      }
    },
    {
      key: 't',
      ctrlKey: true,
      description: 'New Terminal',
      handler: () => {
        if (activeWorkspace) {
          createTerminal(activeWorkspace.path, activeWorkspace.shell);
        }
      }
    },
    {
      key: 'w',
      ctrlKey: true,
      description: 'Close Terminal',
      handler: () => {
        if (activeTerminalId) {
          closeTerminal(activeTerminalId);
        }
      }
    },
    // Workspace switching (Ctrl+1 through Ctrl+9)
    ...Array.from({ length: 9 }, (_, i) => ({
      key: String(i + 1),
      ctrlKey: true,
      description: `Switch to Workspace ${i + 1}`,
      handler: () => {
        if (workspaces[i]) {
          setActiveWorkspace(workspaces[i].id);
        }
      }
    }))
  ]);

  return (
    <>
      <ElectronLayout />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </>
  );
}

function App() {
  return (
    <ContextProvider>
      <AgentProfilesProvider>
        <WorkspaceProvider>
          <CommanderTasksProvider>
            <DeskHistoryProvider>
              <TerminalProvider>
                <AppErrorBoundary>
                  <div
                    style={{
                      width: '100vw',
                      height: '100vh',
                      background: '#05070b',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 20px',
                        background: '#0b0f19',
                        borderBottom: '1px solid rgba(239, 68, 68, 0.18)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.28)',
                        position: 'relative',
                        zIndex: 10
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div
                            style={{
                              color: '#f9fafb',
                              fontSize: '14px',
                              fontWeight: 800,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase'
                            }}
                          >
                            Hedge Station
                          </div>
                          <div
                            style={{
                              color: '#6b7280',
                              fontSize: '10px',
                              letterSpacing: '0.12em',
                              textTransform: 'uppercase'
                            }}
                          >
                            Workstation Shell
                          </div>
                        </div>
                        <BackendStatus />
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {[
                          { key: 'Ctrl+K', label: 'Palette' },
                          { key: 'Ctrl+T', label: 'New Term' },
                          { key: 'Ctrl+W', label: 'Close Term' },
                          { key: 'Ctrl+1-9', label: 'Switch WS' }
                        ].map((shortcut, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '10px',
                              color: '#e5e7eb',
                              padding: '4px 8px',
                              background: 'rgba(255, 255, 255, 0.03)',
                              borderRadius: '4px',
                              border: '1px solid rgba(239, 68, 68, 0.15)',
                              fontFamily: 'monospace',
                              fontWeight: '500',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.15)';
                            }}
                          >
                            <span style={{ color: '#ef4444', fontWeight: '600' }}>{shortcut.key}</span>
                            <span style={{ color: '#9ca3af' }}>{shortcut.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <PreloadApiNotice />
                      <AppWithShortcuts />
                    </div>

                    <UpdateNotification />
                  </div>
                </AppErrorBoundary>
              </TerminalProvider>
            </DeskHistoryProvider>
          </CommanderTasksProvider>
        </WorkspaceProvider>
      </AgentProfilesProvider>
    </ContextProvider>
  );
}

export default App;
