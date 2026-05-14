import { Suspense, lazy, useEffect, useState, type CSSProperties } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { TerminalProvider, useTerminalContext } from './contexts/TerminalContext';
import { WorkspaceProvider, useWorkspaceContext } from './contexts/WorkspaceContext';
import { ContextProvider } from './contexts/ContextContext';
import { DeskHistoryProvider } from './contexts/DeskHistoryContext';
import { AgentProfilesProvider } from './contexts/AgentProfilesContext';
import { CommanderTasksProvider } from './contexts/CommanderTasksContext';
import { DeskSpaceProvider } from './features/desks/DeskSpaceContext';
import { ElectronLayout } from './components/electron/ElectronLayout';
import { AppNavRail } from './components/electron/AppNavRail';
import { UpdateNotification } from './components/electron/UpdateNotification';
import { PreloadApiNotice } from './components/electron/PreloadApiNotice';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useDeskSpaceContext } from './features/desks/DeskSpaceContext';
import {
  APP_SETTINGS_CHANGED_EVENT,
  applyAppTheme,
  loadAppSettings,
  type AppSettings
} from './utils/appSettings';
import { navigateCenterPanel } from './utils/centerNavigation';

const BackendStatus = lazy(() => import('./components/electron/BackendStatus').then((module) => ({ default: module.BackendStatus })));
const CommandPalette = lazy(() => import('./components/electron/CommandPalette').then((module) => ({ default: module.CommandPalette })));

function AppWithShortcuts() {
  const { createTerminal, closeTerminal, activeTerminalId } = useTerminalContext();
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspaceContext();
  const { setDeskState } = useDeskSpaceContext();
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
          createTerminal(activeWorkspace.path, activeWorkspace.shell, undefined, undefined, { workspaceId: activeWorkspace.id });
          setDeskState(activeWorkspace.id, { activeView: 'terminals' });
          navigateCenterPanel('/workbench');
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
    // Desk switching (Ctrl+1 through Ctrl+9)
    ...Array.from({ length: 9 }, (_, i) => ({
      key: String(i + 1),
      ctrlKey: true,
      description: `Switch to Desk ${i + 1}`,
      handler: () => {
        if (workspaces[i]) {
          setActiveWorkspace(workspaces[i].id);
          setDeskState(workspaces[i].id, { activeView: 'overview' });
          navigateCenterPanel('/workbench');
        }
      }
    }))
  ]);

  return (
    <BrowserRouter>
      <ElectronLayout navigationRail={<AppNavRail />} />
      {isCommandPaletteOpen ? (
        <Suspense fallback={null}>
          <CommandPalette
            isOpen={isCommandPaletteOpen}
            onClose={() => setIsCommandPaletteOpen(false)}
          />
        </Suspense>
      ) : null}
    </BrowserRouter>
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
              <DeskSpaceProvider>
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
                      <div style={statusStripStyle}>
                        <div style={statusStripLeftStyle}>
                          <div style={compactTitleStyle}>Hedge Fund Station</div>
                          <Suspense fallback={<BackendStatusFallback />}>
                            <BackendStatus />
                          </Suspense>
                        </div>

                        <div style={shortcutListStyle}>
                          {[
                            { key: '⌘K', label: 'Palette' },
                            { key: '⌘T', label: 'New Term' },
                            { key: '⌘W', label: 'Close' },
                            { key: '⌘1-9', label: 'Desks' }
                          ].map((shortcut, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '9px',
                                color: 'var(--app-muted)',
                                padding: '2px 6px',
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
                              <span className="hidden sm:inline" style={{ color: 'var(--app-subtle)' }}>{shortcut.label}</span>
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
              </DeskSpaceProvider>
            </DeskHistoryProvider>
          </CommanderTasksProvider>
        </WorkspaceProvider>
      </AgentProfilesProvider>
    </ContextProvider>
  );
}

export default App;

const statusStripStyle: CSSProperties = {
  height: '34px',
  flex: '0 0 34px',
  padding: '3px 12px',
  background: 'rgba(6, 10, 20, 0.52)',
  backdropFilter: 'blur(24px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.045)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  boxShadow: '0 2px 14px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.025)',
  position: 'relative',
  zIndex: 10
};

const statusStripLeftStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '9px'
};

const compactTitleStyle: CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap'
};

const shortcutListStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  gap: '5px',
  alignItems: 'center',
  justifyContent: 'flex-end',
  overflow: 'hidden'
};

function BackendStatusFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        padding: '2px 8px',
        borderRadius: '5px',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        background: 'rgba(100, 116, 139, 0.1)',
        color: '#94a3b8',
        fontSize: '9px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}
    >
      Status
    </div>
  );
}
