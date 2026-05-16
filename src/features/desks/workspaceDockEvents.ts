export type WorkspaceDockMode = 'inspector' | 'code' | 'browser' | 'runs';

export const WORKSPACE_DOCK_MODE_EVENT = 'hedge-station:workspace-dock-mode';

export interface WorkspaceDockModeDetail {
  mode: WorkspaceDockMode;
  workspaceId?: string;
}

export function isWorkspaceDockMode(value: unknown): value is WorkspaceDockMode {
  return value === 'inspector' || value === 'code' || value === 'browser' || value === 'runs';
}

export function publishWorkspaceDockMode(mode: WorkspaceDockMode, workspaceId?: string): void {
  window.dispatchEvent(new CustomEvent<WorkspaceDockModeDetail>(WORKSPACE_DOCK_MODE_EVENT, {
    detail: { mode, workspaceId }
  }));
}
