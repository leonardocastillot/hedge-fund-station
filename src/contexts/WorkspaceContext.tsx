import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Workspace } from '../types/electron';
import { useAgentProfilesContext } from './AgentProfilesContext';

const WORKSPACE_KINDS = new Set(['hedge-fund', 'command-hub', 'project', 'ops']);

function normalizeWorkspaces(workspaces: Workspace[]): Workspace[] {
  return workspaces.map((workspace) => ({
    ...workspace,
    kind: WORKSPACE_KINDS.has(workspace.kind) ? workspace.kind : 'project',
    description: typeof workspace.description === 'string' ? workspace.description : '',
    pinned: typeof workspace.pinned === 'boolean' ? workspace.pinned : false,
    default_route: typeof workspace.default_route === 'string' ? workspace.default_route : '/workbench',
    default_commands: Array.isArray(workspace.default_commands) ? workspace.default_commands : [],
    launch_profiles: Array.isArray(workspace.launch_profiles) ? workspace.launch_profiles : [],
    browser_tabs: Array.isArray(workspace.browser_tabs) ? workspace.browser_tabs : [],
    obsidian_vault_path: typeof workspace.obsidian_vault_path === 'string' ? workspace.obsidian_vault_path : undefined
  }));
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  setActiveWorkspace: (id: string) => Promise<void>;
  createWorkspace: (workspace: Workspace) => Promise<void>;
  inferWorkspaceFromPath: (workspacePath: string) => Promise<Workspace>;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { ensureWorkspaceAgents } = useAgentProfilesContext();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load workspaces on mount
  const refreshWorkspaces = useCallback(async () => {
    try {
      if (!window.electronAPI?.workspace) {
        setWorkspaces([]);
        setActiveWorkspaceState(null);
        ensureWorkspaceAgents([]);
        return;
      }

      const [allWorkspaces, active] = await Promise.all([
        window.electronAPI.workspace.getAll(),
        window.electronAPI.workspace.getActive()
      ]);

      const normalizedWorkspaces = normalizeWorkspaces(allWorkspaces);
      const normalizedActive = active
        ? normalizeWorkspaces([active])[0]
        : null;

      setWorkspaces(normalizedWorkspaces);
      setActiveWorkspaceState(normalizedActive);
      ensureWorkspaceAgents(normalizedWorkspaces);
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const setActiveWorkspace = useCallback(async (id: string) => {
    try {
      if (!window.electronAPI?.workspace) {
        return;
      }

      const workspace = workspaces.find(w => w.id === id);
      if (!workspace) {
        throw new Error(`Workspace not found: ${id}`);
      }

      await window.electronAPI.workspace.setActive(id);
      const active = await window.electronAPI.workspace.getActive();
      setActiveWorkspaceState(active ? normalizeWorkspaces([active])[0] : null);
    } catch (error) {
      console.error('❌ Failed to set active workspace:', error);
      throw error;
    }
  }, [workspaces]);

  const createWorkspace = useCallback(async (workspace: Workspace) => {
    try {
      if (!window.electronAPI?.workspace) {
        return;
      }

      await window.electronAPI.workspace.create(workspace);
      await refreshWorkspaces();
    } catch (error) {
      console.error('Failed to create workspace:', error);
      throw error;
    }
  }, [refreshWorkspaces]);

  const inferWorkspaceFromPath = useCallback(async (workspacePath: string) => {
    if (!window.electronAPI?.workspace) {
      throw new Error('Workspace API is not available.');
    }

    return window.electronAPI.workspace.inferFromPath(workspacePath);
  }, []);

  const updateWorkspace = useCallback(async (id: string, updates: Partial<Workspace>) => {
    try {
      if (!window.electronAPI?.workspace) {
        return;
      }

      await window.electronAPI.workspace.update(id, updates);
      await refreshWorkspaces();
    } catch (error) {
      console.error('Failed to update workspace:', error);
      throw error;
    }
  }, [refreshWorkspaces]);

  const deleteWorkspace = useCallback(async (id: string) => {
    try {
      if (!window.electronAPI?.workspace) {
        return;
      }

      await window.electronAPI.workspace.delete(id);
      await refreshWorkspaces();
    } catch (error) {
      console.error('Failed to delete workspace:', error);
      throw error;
    }
  }, [refreshWorkspaces]);

  const value: WorkspaceContextValue = {
    workspaces,
    activeWorkspace,
    isLoading,
    setActiveWorkspace,
    createWorkspace,
    inferWorkspaceFromPath,
    updateWorkspace,
    deleteWorkspace,
    refreshWorkspaces
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspaceContext = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspaceContext must be used within WorkspaceProvider');
  }
  return context;
};
