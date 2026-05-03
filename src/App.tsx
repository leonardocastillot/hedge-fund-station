import { useEffect, useState } from 'react';
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
import {
  APP_SETTINGS_CHANGED_EVENT,
  applyAppTheme,
  loadAppSettings,
  type AppSettings
} from './utils/appSettings';
import lcLogo from './assets/logo-lc.jpeg';

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
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());

  useEffect(() => {
    applyAppTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    const syncSettings = (event?: Event) => {
      const nextSettings = event instanceof CustomEvent && event.detail
        ? event.detail as AppSettings
        : loadAppSettings();
      setSettings(nextSettings);
    };

    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, syncSettings);
    window.addEventListener('storage', syncSettings);

    return () => {
      window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, syncSettings);
      window.removeEventListener('storage', syncSettings);
    };
  }, []);

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
                      background: '#020408',
                      color: 'var(--app-text, #f0f2f5)',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 20px',
                        background: 'rgba(6, 10, 20, 0.4)',
                        backdropFilter: 'blur(32px) saturate(1.3)',
                        WebkitBackdropFilter: 'blur(32px) saturate(1.3)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                        position: 'relative',
                        zIndex: 10
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '38px',
                            height: '28px',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
                          }}
                        >
                          <img
                            src={lcLogo}
                            alt="LC"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                              opacity: 0.9
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          <div
                            style={{
                              color: 'var(--app-text)',
                              fontSize: '13px',
                              fontWeight: 700,
                              letterSpacing: '0.1em',
                              textTransform: 'uppercase'
                            }}
                          >
                            Hedge Fund Station
                          </div>
                          <div
                            style={{
                              color: 'var(--app-subtle)',
                              fontSize: '9px',
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              fontFamily: "'JetBrains Mono', monospace"
                            }}
                          >
                            Trading Operating System
                          </div>
                        </div>
                        <BackendStatus />
                      </div>

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {[
                          { key: '⌘K', label: 'Palette' },
                          { key: '⌘T', label: 'New Term' },
                          { key: '⌘W', label: 'Close' },
                          { key: '⌘1-9', label: 'WS' }
                        ].map((shortcut, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '9px',
                              color: 'var(--app-muted)',
                              padding: '3px 7px',
                              background: 'rgba(255, 255, 255, 0.02)',
                              borderRadius: '5px',
                              border: '1px solid rgba(255, 255, 255, 0.04)',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: '500',
                              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                              letterSpacing: '0.02em'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                              e.currentTarget.style.borderColor = 'var(--app-border-strong)';
                              e.currentTarget.style.boxShadow = '0 0 12px var(--app-glow)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            <span style={{ color: 'var(--app-accent)', fontWeight: '600', fontSize: '10px' }}>{shortcut.key}</span>
                            <span style={{ color: 'var(--app-subtle)' }}>{shortcut.label}</span>
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
