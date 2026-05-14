import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type DeskSpaceView = 'overview' | 'browser' | 'agents' | 'terminals';

export interface DeskSpaceState {
  activeView: DeskSpaceView;
  activeBrowserTabId?: string;
  terminalLayout: 'grid' | 'vertical';
}

interface DeskSpaceContextValue {
  getDeskState: (workspaceId?: string | null) => DeskSpaceState;
  setDeskState: (workspaceId: string, updates: Partial<DeskSpaceState>) => void;
}

const STORAGE_KEY = 'hedge-station:desk-space-state:v1';

const defaultDeskState: DeskSpaceState = {
  activeView: 'overview',
  activeBrowserTabId: undefined,
  terminalLayout: 'grid'
};

const DeskSpaceContext = createContext<DeskSpaceContextValue | undefined>(undefined);

function normalizeDeskState(state?: Partial<DeskSpaceState>): DeskSpaceState {
  const activeView = state?.activeView === 'browser'
    || state?.activeView === 'agents'
    || state?.activeView === 'terminals'
    || state?.activeView === 'overview'
    ? state.activeView
    : defaultDeskState.activeView;

  return {
    activeView,
    activeBrowserTabId: typeof state?.activeBrowserTabId === 'string' ? state.activeBrowserTabId : undefined,
    terminalLayout: state?.terminalLayout === 'vertical' ? 'vertical' : 'grid'
  };
}

function loadStateMap(): Record<string, DeskSpaceState> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, Partial<DeskSpaceState>>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([workspaceId, state]) => [workspaceId, normalizeDeskState(state)])
    );
  } catch {
    return {};
  }
}

export const DeskSpaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stateByWorkspace, setStateByWorkspace] = useState<Record<string, DeskSpaceState>>(() => loadStateMap());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateByWorkspace));
  }, [stateByWorkspace]);

  const value = useMemo<DeskSpaceContextValue>(() => ({
    getDeskState: (workspaceId) => (
      workspaceId && stateByWorkspace[workspaceId]
        ? stateByWorkspace[workspaceId]
        : defaultDeskState
    ),
    setDeskState: (workspaceId, updates) => {
      setStateByWorkspace((current) => ({
        ...current,
        [workspaceId]: normalizeDeskState({
          ...(current[workspaceId] || defaultDeskState),
          ...updates
        })
      }));
    }
  }), [stateByWorkspace]);

  return (
    <DeskSpaceContext.Provider value={value}>
      {children}
    </DeskSpaceContext.Provider>
  );
};

export function useDeskSpaceContext() {
  const context = useContext(DeskSpaceContext);
  if (!context) {
    throw new Error('useDeskSpaceContext must be used within DeskSpaceProvider');
  }
  return context;
}
