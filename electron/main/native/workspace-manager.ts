import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { Workspace, WorkspaceConfig } from '../../types/ipc.types';

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

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'workspace';
}

function hasPath(...segments: string[]): boolean {
  return fs.existsSync(path.join(...segments));
}

function readPackageScripts(workspacePath: string): Record<string, string> {
  const packagePath = path.join(workspacePath, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf-8')) as { scripts?: Record<string, string> };
    return parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
  } catch {
    return {};
  }
}

function findObsidianVaultPath(workspacePath: string): string | undefined {
  const curatedVaultPath = path.join(workspacePath, 'hedge-station');
  if (hasPath(curatedVaultPath, '.obsidian')) {
    return curatedVaultPath;
  }

  if (hasPath(workspacePath, '.obsidian')) {
    return workspacePath;
  }

  try {
    const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
    const vault = entries.find((entry) => (
      entry.isDirectory()
      && !entry.name.startsWith('.')
      && hasPath(workspacePath, entry.name, '.obsidian')
    ));

    return vault ? path.join(workspacePath, vault.name) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeObsidianVaultPath(workspacePath: string, vaultPath?: string): string | undefined {
  const curatedVaultPath = path.join(workspacePath, 'hedge-station');
  const trimmedVaultPath = typeof vaultPath === 'string' && vaultPath.trim()
    ? vaultPath.trim()
    : undefined;

  if (
    trimmedVaultPath
    && path.resolve(trimmedVaultPath) === path.resolve(workspacePath)
    && (
      hasPath(curatedVaultPath, '.obsidian')
      || hasPath(curatedVaultPath, 'Workspace Home.md')
    )
  ) {
    return curatedVaultPath;
  }

  return trimmedVaultPath || findObsidianVaultPath(workspacePath);
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
            obsidian_vault_path: normalizeObsidianVaultPath(workspace.path, workspace.obsidian_vault_path)
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
    const documentsPath = app.getPath('documents');
    const projectPath = path.join(documentsPath, 'New project 9');
    const tradingPath = fs.existsSync(projectPath) ? projectPath : documentsPath;
    const shell = process.env.SHELL || '/bin/zsh';

    const defaultWorkspace: Workspace = {
      id: 'hedge-fund-trading',
      name: 'Hedge Fund Station',
      path: tradingPath,
      icon: 'chart',
      color: '#22d3ee',
      default_commands: [
        'git status',
        'npm run hf:doctor',
        'npm run backend:health',
        'npm run gateway:probe',
        'npm run dev'
      ],
      launch_profiles: [
        {
          id: 'ai-work-desk',
          name: 'AI Work Desk',
          steps: [
            { command: 'agent-runtime', delayMs: 0 },
            { command: 'git status', delayMs: 300 },
            { command: 'npm run dev', delayMs: 700 }
          ]
        },
        {
          id: 'health-check',
          name: 'Health Check',
          steps: [
            { command: 'npm run hf:doctor', delayMs: 0 }
          ]
        },
        {
          id: 'dev-server',
          name: 'Dev Server',
          steps: [
            { command: 'npm run dev', delayMs: 0 }
          ]
        }
      ],
      shell,
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

  private createUniqueWorkspaceId(name: string): string {
    if (!this.config) {
      return slugify(name);
    }

    const baseId = slugify(name);
    const existingIds = new Set(this.config.workspaces.map((workspace) => workspace.id));
    if (!existingIds.has(baseId)) {
      return baseId;
    }

    let suffix = 2;
    while (existingIds.has(`${baseId}-${suffix}`)) {
      suffix += 1;
    }

    return `${baseId}-${suffix}`;
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
    workspace.obsidian_vault_path = normalizeObsidianVaultPath(workspace.path, workspace.obsidian_vault_path);

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

  inferFromPath(workspacePath: string): Workspace {
    if (!this.config) throw new Error('Config not loaded');

    const normalizedPath = workspacePath.trim();
    if (!this.validatePath(normalizedPath)) {
      throw new Error(`Workspace path does not exist or is not a directory: ${normalizedPath}`);
    }

    const name = path.basename(normalizedPath) || 'Workspace';
    const scripts = readPackageScripts(normalizedPath);
    const isNodeRepo = Object.keys(scripts).length > 0;
    const isHedgeFundStation = hasPath(normalizedPath, 'AGENTS.md')
      || hasPath(normalizedPath, 'docs', 'project-architecture.md')
      || hasPath(normalizedPath, 'backend', 'hyperliquid_gateway');
    const shell = process.env.SHELL || '/bin/zsh';
    const obsidianVaultPath = normalizeObsidianVaultPath(normalizedPath);

    if (isHedgeFundStation) {
      return {
        id: this.createUniqueWorkspaceId(name),
        name,
        path: normalizedPath,
        icon: 'chart',
        color: '#22d3ee',
        shell,
        obsidian_vault_path: obsidianVaultPath,
        default_commands: [
          'git status',
          'npm run hf:doctor',
          'npm run backend:health',
          'npm run gateway:probe',
          'npm run dev'
        ],
        launch_profiles: [
          {
            id: 'ai-work-desk',
            name: 'AI Work Desk',
            steps: [
              { command: 'agent-runtime', delayMs: 0 },
              { command: 'git status', delayMs: 300 },
              { command: 'npm run hf:status', delayMs: 700 }
            ]
          },
          {
            id: 'health-check',
            name: 'Health Check',
            steps: [
              { command: 'npm run hf:doctor', delayMs: 0 }
            ]
          },
          {
            id: 'dev-server',
            name: 'Dev Server',
            steps: [
              { command: 'npm run dev', delayMs: 0 }
            ]
          }
        ]
      };
    }

    const defaultCommands = [
      'git status',
      ...(isNodeRepo && scripts.dev ? ['npm run dev'] : []),
      ...(isNodeRepo && scripts.test ? ['npm test'] : []),
      ...(isNodeRepo && scripts.build ? ['npm run build'] : [])
    ];

    const launchProfiles: Workspace['launch_profiles'] = [
      {
        id: 'ai-work-desk',
        name: 'AI Work Desk',
        steps: [
          { command: 'agent-runtime', delayMs: 0 },
          { command: 'git status', delayMs: 300 },
          ...(isNodeRepo && scripts.dev ? [{ command: 'npm run dev', delayMs: 700 }] : []),
          ...(isNodeRepo && scripts.test ? [{ command: 'npm test', delayMs: 1000 }] : []),
          ...(isNodeRepo && scripts.build ? [{ command: 'npm run build', delayMs: 1300 }] : [])
        ]
      }
    ];

    if (isNodeRepo && scripts.dev) {
      launchProfiles.push({
        id: 'dev',
        name: 'Dev',
        steps: [
          { command: 'npm run dev', delayMs: 0 }
        ]
      });
    }

    return {
      id: this.createUniqueWorkspaceId(name),
      name,
      path: normalizedPath,
      icon: isNodeRepo ? 'code' : 'folder',
      color: '#3b82f6',
      shell,
      obsidian_vault_path: obsidianVaultPath,
      default_commands: defaultCommands,
      launch_profiles: launchProfiles
    };
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
      obsidian_vault_path: normalizeObsidianVaultPath(
        updates.path || this.config.workspaces[index].path,
        typeof updates.obsidian_vault_path === 'string'
          ? updates.obsidian_vault_path
          : this.config.workspaces[index].obsidian_vault_path
      ),
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
