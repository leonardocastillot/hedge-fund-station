import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { Workspace, WorkspaceConfig } from '../types/ipc.types';

function normalizeLaunchProfiles(
  profiles: unknown[] | undefined
): Workspace['launch_profiles'] {
  if (!Array.isArray(profiles)) {
    return [];
  }

  return profiles
    .map((profile, index) => {
      const rawProfile = profile as {
        id?: string;
        name?: string;
        command?: string;
        commands?: string[];
        steps?: Array<{ command?: string; delayMs?: number }>;
      };

      const steps = Array.isArray(rawProfile.steps)
        ? rawProfile.steps
            .map((step) => ({
              command: typeof step.command === 'string' ? step.command.trim() : '',
              delayMs: typeof step.delayMs === 'number' && Number.isFinite(step.delayMs)
                ? Math.max(0, Math.round(step.delayMs))
                : 0
            }))
            .filter((step) => step.command.length > 0)
        : [];

      const migratedCommands = Array.isArray(rawProfile.commands)
        ? rawProfile.commands.filter(Boolean).map((command, commandIndex) => ({
            command: String(command).trim(),
            delayMs: commandIndex === 0 ? 0 : 400
          }))
        : typeof rawProfile.command === 'string' && rawProfile.command.trim()
          ? [{ command: rawProfile.command.trim(), delayMs: 0 }]
          : [];

      const normalizedSteps = steps.length > 0 ? steps : migratedCommands;

      if (normalizedSteps.length === 0) {
        return null;
      }

      return {
        id: rawProfile.id || `launch-profile-${index + 1}`,
        name: rawProfile.name || `Profile ${index + 1}`,
        steps: normalizedSteps
      };
    })
    .filter((profile): profile is NonNullable<typeof profile> => profile !== null);
}

export class WorkspaceManager {
  private configPath: string;
  private config: WorkspaceConfig | null = null;

  constructor() {
    // Config stored in ~/.hedge-station/workspaces.json
    const userDataPath = app.getPath('home');
    const configDir = path.join(userDataPath, '.hedge-station');
    this.configPath = path.join(configDir, 'workspaces.json');

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Load or create config
    this.loadConfig();
  }

  private loadConfig(): void {
    if (fs.existsSync(this.configPath)) {
      try {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(data) as WorkspaceConfig;
        this.config = {
          ...parsed,
          workspaces: (parsed.workspaces || []).map((workspace) => ({
            ...workspace,
            default_commands: Array.isArray(workspace.default_commands) ? workspace.default_commands : [],
            launch_profiles: normalizeLaunchProfiles(workspace.launch_profiles),
            obsidian_vault_path: typeof workspace.obsidian_vault_path === 'string' ? workspace.obsidian_vault_path : undefined
          }))
        };
      } catch (error) {
        console.error('Failed to load workspace config:', error);
        this.createDefaultConfig();
      }
    } else {
      this.createDefaultConfig();
    }
  }

  private createDefaultConfig(): void {
    // Create default workspace for the trading project
    const tradingPath = 'C:\\Users\\leonard\\Documents\\trading';

    const defaultWorkspace: Workspace = {
      id: 'hedge-fund-trading',
      name: 'Hedge Fund Trading',
      path: tradingPath,
      icon: 'briefcase',
      color: '#8b5cf6',
      default_commands: [],
      launch_profiles: [],
      shell: 'powershell.exe',
      obsidian_vault_path: undefined
    };

    this.config = {
      workspaces: [defaultWorkspace],
      active_workspace_id: 'hedge-fund-trading'
    };

    this.saveConfig();
  }

  private saveConfig(): void {
    if (!this.config) return;

    try {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save workspace config:', error);
      throw error;
    }
  }

  private validatePath(workspacePath: string): boolean {
    try {
      return fs.existsSync(workspacePath) && fs.statSync(workspacePath).isDirectory();
    } catch {
      return false;
    }
  }

  // Public API

  getAll(): Workspace[] {
    return this.config?.workspaces || [];
  }

  getActive(): Workspace | null {
    if (!this.config) return null;

    const workspace = this.config.workspaces.find(
      w => w.id === this.config!.active_workspace_id
    );

    return workspace || null;
  }

  setActive(id: string): void {
    if (!this.config) throw new Error('Config not loaded');

    const workspace = this.config.workspaces.find(w => w.id === id);
    if (!workspace) {
      throw new Error(`Workspace ${id} not found`);
    }

    this.config.active_workspace_id = id;
    this.saveConfig();
  }

  create(workspace: Workspace): void {
    if (!this.config) throw new Error('Config not loaded');

    // Validate workspace
    if (!workspace.id || !workspace.name || !workspace.path) {
      throw new Error('Invalid workspace: missing required fields');
    }

    workspace.default_commands = Array.isArray(workspace.default_commands) ? workspace.default_commands : [];
    workspace.launch_profiles = Array.isArray(workspace.launch_profiles) ? workspace.launch_profiles : [];
    workspace.obsidian_vault_path = typeof workspace.obsidian_vault_path === 'string' && workspace.obsidian_vault_path.trim()
      ? workspace.obsidian_vault_path.trim()
      : undefined;

    // Check if ID already exists
    if (this.config.workspaces.some(w => w.id === workspace.id)) {
      throw new Error(`Workspace with ID ${workspace.id} already exists`);
    }

    // Validate path exists
    if (!this.validatePath(workspace.path)) {
      throw new Error(`Workspace path does not exist or is not a directory: ${workspace.path}`);
    }

    // Add workspace
    this.config.workspaces.push(workspace);
    this.saveConfig();
  }

  update(id: string, updates: Partial<Workspace>): void {
    if (!this.config) throw new Error('Config not loaded');

    const index = this.config.workspaces.findIndex(w => w.id === id);
    if (index === -1) {
      throw new Error(`Workspace ${id} not found`);
    }

    // Don't allow changing ID
    if (updates.id && updates.id !== id) {
      throw new Error('Cannot change workspace ID');
    }

    // Validate path if it's being updated
    if (updates.path && !this.validatePath(updates.path)) {
      throw new Error(`Workspace path does not exist or is not a directory: ${updates.path}`);
    }

    // Update workspace
    this.config.workspaces[index] = {
      ...this.config.workspaces[index],
      ...updates,
      default_commands: Array.isArray(updates.default_commands)
        ? updates.default_commands
        : this.config.workspaces[index].default_commands,
      launch_profiles: Array.isArray(updates.launch_profiles)
        ? updates.launch_profiles
        : this.config.workspaces[index].launch_profiles,
      obsidian_vault_path: typeof updates.obsidian_vault_path === 'string'
        ? (updates.obsidian_vault_path.trim() || undefined)
        : this.config.workspaces[index].obsidian_vault_path,
      id // Ensure ID doesn't change
    };

    this.saveConfig();
  }

  delete(id: string): void {
    if (!this.config) throw new Error('Config not loaded');

    const index = this.config.workspaces.findIndex(w => w.id === id);
    if (index === -1) {
      throw new Error(`Workspace ${id} not found`);
    }

    // Don't allow deleting the active workspace if it's the only one
    if (this.config.workspaces.length === 1) {
      throw new Error('Cannot delete the only workspace');
    }

    // Remove workspace
    this.config.workspaces.splice(index, 1);

    // If deleted workspace was active, set first workspace as active
    if (this.config.active_workspace_id === id) {
      this.config.active_workspace_id = this.config.workspaces[0].id;
    }

    this.saveConfig();
  }

  getConfigPath(): string {
    return this.configPath;
  }
}
