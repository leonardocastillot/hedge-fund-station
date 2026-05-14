import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { DeskBrowserTab, LaunchProfile, Workspace, WorkspaceConfig, WorkspaceKind } from '../../types/ipc.types';

const COMMAND_HUB_ID = 'command-hub';
const VALID_WORKSPACE_KINDS: WorkspaceKind[] = ['hedge-fund', 'command-hub', 'project', 'ops'];
const GENERATED_DESK_ROUTES = new Set(['/station/hedge-fund', '/terminals', '/diagnostics', '/workbench']);
const LEGACY_HEDGE_COMMANDS = [
  'git status',
  'npm run hf:doctor',
  'npm run backend:health',
  'npm run gateway:probe',
  'npm run dev'
];

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

function readPackageName(workspacePath: string): string | undefined {
  const packagePath = path.join(workspacePath, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf-8')) as { name?: string };
    return typeof parsed.name === 'string' ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

function isWorkspaceKind(value: unknown): value is WorkspaceKind {
  return typeof value === 'string' && VALID_WORKSPACE_KINDS.includes(value as WorkspaceKind);
}

function defaultIconForKind(kind: WorkspaceKind): string {
  if (kind === 'hedge-fund') return 'chart';
  if (kind === 'command-hub') return 'terminal';
  if (kind === 'ops') return 'server';
  return 'code';
}

function defaultColorForKind(kind: WorkspaceKind): string {
  if (kind === 'hedge-fund') return '#22d3ee';
  if (kind === 'command-hub') return '#06b6d4';
  if (kind === 'ops') return '#f97316';
  return '#3b82f6';
}

function defaultRouteForKind(kind: WorkspaceKind): string {
  void kind;
  return '/workbench';
}

function defaultDescriptionForKind(kind: WorkspaceKind): string {
  if (kind === 'hedge-fund') {
    return 'Primary hedge fund research, validation, paper review, and backend command desk.';
  }
  if (kind === 'command-hub') {
    return 'Global terminal hub for shells, AI runtimes, tunnels, and short operational commands.';
  }
  if (kind === 'ops') {
    return 'Operational desk for services, logs, tunnels, diagnostics, and runtime health.';
  }
  return 'Project desk for local code, agents, commands, terminals, and notes.';
}

function getCommandHubPath(): string {
  const documentsPath = app.getPath('documents');
  return fs.existsSync(documentsPath) ? documentsPath : app.getPath('home');
}

function hasRealHedgeFundMarkers(workspacePath: string): boolean {
  const packageName = readPackageName(workspacePath);

  return (
    packageName === 'hedge-fund-station'
    || hasPath(workspacePath, 'backend', 'hyperliquid_gateway')
    || hasPath(workspacePath, 'docs', 'operations', 'hedge-fund-company-constitution.md')
    || hasPath(workspacePath, 'docs', 'hyperliquid-strategy-roadmap.md')
  );
}

function inferWorkspaceKind(workspace: Pick<Workspace, 'id' | 'name' | 'path'> & Partial<Workspace>): WorkspaceKind {
  if (workspace.id === COMMAND_HUB_ID || workspace.name.toLowerCase() === 'command hub') {
    return 'command-hub';
  }

  if (isWorkspaceKind(workspace.kind)) {
    return workspace.kind;
  }

  if (hasRealHedgeFundMarkers(workspace.path) || path.basename(workspace.path) === 'New project 9') {
    return 'hedge-fund';
  }

  return 'project';
}

function createDefaultCommands(kind: WorkspaceKind, workspacePath: string): string[] {
  const scripts = readPackageScripts(workspacePath);
  const isNodeRepo = Object.keys(scripts).length > 0;

  if (kind === 'command-hub') {
    return ['pwd', 'ls -la', 'git status'];
  }

  if (kind === 'hedge-fund') {
    return [...LEGACY_HEDGE_COMMANDS];
  }

  if (kind === 'ops') {
    return [
      'pwd',
      'ps aux | head -20',
      'git status'
    ];
  }

  return [
    'git status',
    ...(isNodeRepo && scripts.dev ? ['npm run dev'] : []),
    ...(isNodeRepo && scripts.test ? ['npm test'] : []),
    ...(isNodeRepo && scripts.build ? ['npm run build'] : [])
  ];
}

function createDefaultLaunchProfiles(kind: WorkspaceKind, workspacePath: string): LaunchProfile[] {
  const scripts = readPackageScripts(workspacePath);
  const isNodeRepo = Object.keys(scripts).length > 0;

  if (kind === 'command-hub') {
    return [
      {
        id: 'ai-runtimes',
        name: 'AI Runtimes',
        steps: [
          { command: 'codex', delayMs: 0 },
          { command: 'claude', delayMs: 300 },
          { command: 'gemini', delayMs: 600 }
        ]
      },
      {
        id: 'shell-grid',
        name: 'Shell Grid',
        steps: [
          { command: 'pwd', delayMs: 0 },
          { command: 'ls -la', delayMs: 300 },
          { command: 'git status', delayMs: 600 }
        ]
      }
    ];
  }

  if (kind === 'hedge-fund') {
    return [
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
    ];
  }

  if (kind === 'ops') {
    return [
      {
        id: 'ops-console',
        name: 'Ops Console',
        steps: [
          { command: 'pwd', delayMs: 0 },
          { command: 'ps aux | head -20', delayMs: 300 },
          { command: 'git status', delayMs: 600 }
        ]
      }
    ];
  }

  const profiles: LaunchProfile[] = [
    {
      id: 'ai-work-desk',
      name: 'AI Work Desk',
      steps: [
        { command: 'agent-runtime', delayMs: 0 },
        { command: 'git status', delayMs: 300 },
        ...(isNodeRepo && scripts.dev ? [{ command: 'npm run dev', delayMs: 700 }] : [])
      ]
    }
  ];

  if (isNodeRepo && (scripts.test || scripts.build)) {
    profiles.push({
      id: 'review-and-tests',
      name: 'Review and Tests',
      steps: [
        { command: 'git diff --stat', delayMs: 0 },
        ...(scripts.test ? [{ command: 'npm test', delayMs: 300 }] : []),
        ...(scripts.build ? [{ command: 'npm run build', delayMs: scripts.test ? 700 : 300 }] : [])
      ]
    });
  }

  return profiles;
}

function isSafeBrowserUrl(url: string): boolean {
  if (url === 'about:blank') {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function createDefaultBrowserTabs(kind: WorkspaceKind): DeskBrowserTab[] {
  if (kind === 'hedge-fund') {
    return [
      {
        id: 'tradingview-btc',
        title: 'TradingView BTC',
        url: 'https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT'
      },
      {
        id: 'gateway-health',
        title: 'Gateway Health',
        url: 'http://127.0.0.1:18001/health'
      }
    ];
  }

  if (kind === 'ops') {
    return [
      {
        id: 'gateway-health',
        title: 'Gateway Health',
        url: 'http://127.0.0.1:18001/health'
      },
      {
        id: 'backend-health',
        title: 'Backend Health',
        url: 'http://127.0.0.1:18500/health'
      }
    ];
  }

  if (kind === 'command-hub') {
    return [
      {
        id: 'local-dev',
        title: 'Local Dev',
        url: 'http://localhost:5173'
      }
    ];
  }

  return [
    {
      id: 'local-app',
      title: 'Local App',
      url: 'http://localhost:3000'
    }
  ];
}

function normalizeBrowserTabs(tabs: unknown[] | undefined, kind: WorkspaceKind): DeskBrowserTab[] {
  if (!Array.isArray(tabs)) {
    return createDefaultBrowserTabs(kind);
  }

  const normalized = tabs
    .map((tab, index) => {
      const rawTab = tab as { id?: string; title?: string; url?: string };
      const url = typeof rawTab.url === 'string' ? rawTab.url.trim() : '';
      if (!isSafeBrowserUrl(url)) {
        return null;
      }

      const title = typeof rawTab.title === 'string' && rawTab.title.trim()
        ? rawTab.title.trim()
        : `Tab ${index + 1}`;

      return {
        id: typeof rawTab.id === 'string' && rawTab.id.trim()
          ? slugify(rawTab.id)
          : slugify(title),
        title,
        url
      };
    })
    .filter((tab): tab is DeskBrowserTab => tab !== null);

  return normalized.length > 0 ? normalized : createDefaultBrowserTabs(kind);
}

function normalizeDefaultRoute(route: unknown, kind: WorkspaceKind): string {
  const trimmed = typeof route === 'string' ? route.trim() : '';
  if (!trimmed || GENERATED_DESK_ROUTES.has(trimmed)) {
    return defaultRouteForKind(kind);
  }

  return trimmed;
}

function commandsMatch(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((command, index) => command === right[index]);
}

function looksLikeLegacyHedgeCommands(commands: string[]): boolean {
  return commandsMatch(commands, LEGACY_HEDGE_COMMANDS);
}

function looksLikeLegacyHedgeProfiles(profiles: LaunchProfile[]): boolean {
  if (profiles.length === 0) {
    return false;
  }

  const knownLegacyIds = new Set(['ai-work-desk', 'work-desk', 'health-check', 'dev-server']);
  const knownOnly = profiles.every((profile) => knownLegacyIds.has(profile.id) || /^launch-profile-\d+$/.test(profile.id));
  const hasHedgeCommand = profiles.some((profile) => (
    profile.steps.some((step) => /npm run hf:|gateway:probe|backend:health/.test(step.command))
  ));

  return knownOnly && hasHedgeCommand;
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

  private createCommandHubWorkspace(): Workspace {
    const commandHubPath = getCommandHubPath();
    const shell = process.env.SHELL || '/bin/zsh';

    return {
      id: COMMAND_HUB_ID,
      name: 'Command Hub',
      path: commandHubPath,
      kind: 'command-hub',
      description: defaultDescriptionForKind('command-hub'),
      pinned: true,
      default_route: defaultRouteForKind('command-hub'),
      icon: defaultIconForKind('command-hub'),
      color: defaultColorForKind('command-hub'),
      default_commands: createDefaultCommands('command-hub', commandHubPath),
      launch_profiles: createDefaultLaunchProfiles('command-hub', commandHubPath),
      browser_tabs: createDefaultBrowserTabs('command-hub'),
      shell,
      obsidian_vault_path: undefined
    };
  }

  private normalizeWorkspace(workspace: Partial<Workspace>, index = 0): Workspace {
    const fallbackPath = typeof workspace.path === 'string' && workspace.path.trim()
      ? workspace.path.trim()
      : getCommandHubPath();
    const fallbackName = typeof workspace.name === 'string' && workspace.name.trim()
      ? workspace.name.trim()
      : path.basename(fallbackPath) || `Desk ${index + 1}`;
    const fallbackId = typeof workspace.id === 'string' && workspace.id.trim()
      ? workspace.id.trim()
      : slugify(fallbackName);
    const kind = inferWorkspaceKind({
      ...workspace,
      id: fallbackId,
      name: fallbackName,
      path: fallbackPath
    });
    const defaultCommands = createDefaultCommands(kind, fallbackPath);
    const normalizedCommands = Array.isArray(workspace.default_commands)
      ? workspace.default_commands.filter(Boolean).map((command) => String(command).trim()).filter(Boolean)
      : [];
    const normalizedProfiles = normalizeLaunchProfiles(workspace.launch_profiles);
    const replaceLegacyDefaults = kind !== 'hedge-fund'
      && (
        looksLikeLegacyHedgeCommands(normalizedCommands)
        || looksLikeLegacyHedgeProfiles(normalizedProfiles)
      );

    return {
      id: fallbackId,
      name: fallbackName,
      path: fallbackPath,
      kind,
      description: typeof workspace.description === 'string' && workspace.description.trim()
        ? workspace.description.trim()
        : defaultDescriptionForKind(kind),
      pinned: typeof workspace.pinned === 'boolean'
        ? workspace.pinned
        : kind === 'command-hub' || kind === 'hedge-fund',
      default_route: normalizeDefaultRoute(workspace.default_route, kind),
      icon: typeof workspace.icon === 'string' && workspace.icon.trim()
        ? workspace.icon.trim()
        : defaultIconForKind(kind),
      color: typeof workspace.color === 'string' && workspace.color.trim()
        ? workspace.color.trim()
        : defaultColorForKind(kind),
      default_commands: replaceLegacyDefaults || normalizedCommands.length === 0
        ? defaultCommands
        : normalizedCommands,
      launch_profiles: replaceLegacyDefaults || normalizedProfiles.length === 0
        ? createDefaultLaunchProfiles(kind, fallbackPath)
        : normalizedProfiles,
      browser_tabs: normalizeBrowserTabs(workspace.browser_tabs, kind),
      shell: typeof workspace.shell === 'string' && workspace.shell.trim()
        ? workspace.shell.trim()
        : process.env.SHELL || '/bin/zsh',
      obsidian_vault_path: normalizeObsidianVaultPath(fallbackPath, workspace.obsidian_vault_path)
    };
  }

  private ensureCommandHub(workspaces: Workspace[]): Workspace[] {
    const hasCommandHub = workspaces.some((workspace) => workspace.kind === 'command-hub' || workspace.id === COMMAND_HUB_ID);
    if (hasCommandHub) {
      return workspaces.map((workspace) => (
        workspace.id === COMMAND_HUB_ID || workspace.kind === 'command-hub'
          ? {
              ...workspace,
              id: COMMAND_HUB_ID,
              name: workspace.name || 'Command Hub',
              kind: 'command-hub',
              description: workspace.description || defaultDescriptionForKind('command-hub'),
              pinned: true,
              default_route: normalizeDefaultRoute(workspace.default_route, 'command-hub'),
              icon: workspace.icon || defaultIconForKind('command-hub'),
              color: workspace.color || defaultColorForKind('command-hub'),
              browser_tabs: normalizeBrowserTabs(workspace.browser_tabs, 'command-hub')
            }
          : workspace
      ));
    }

    return [this.createCommandHubWorkspace(), ...workspaces];
  }

  private loadConfig(): void {
    if (fs.existsSync(this.configPath)) {
      try {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(data) as WorkspaceConfig;
        const normalizedWorkspaces = this.ensureCommandHub(
          (parsed.workspaces || []).map((workspace, index) => this.normalizeWorkspace(workspace, index))
        );
        const activeWorkspaceExists = normalizedWorkspaces.some((workspace) => workspace.id === parsed.active_workspace_id);
        this.config = {
          ...parsed,
          workspaces: normalizedWorkspaces,
          active_workspace_id: activeWorkspaceExists
            ? parsed.active_workspace_id
            : normalizedWorkspaces[0]?.id || COMMAND_HUB_ID
        };
        this.saveConfig();
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

    const hedgeFundWorkspace: Workspace = {
      id: 'new-project-9',
      name: 'New project 9',
      path: tradingPath,
      kind: 'hedge-fund',
      description: defaultDescriptionForKind('hedge-fund'),
      pinned: true,
      default_route: defaultRouteForKind('hedge-fund'),
      icon: 'chart',
      color: '#22d3ee',
      default_commands: createDefaultCommands('hedge-fund', tradingPath),
      launch_profiles: createDefaultLaunchProfiles('hedge-fund', tradingPath),
      browser_tabs: createDefaultBrowserTabs('hedge-fund'),
      shell,
      obsidian_vault_path: undefined
    };

    const commandHub = this.createCommandHubWorkspace();
    this.config = {
      workspaces: [commandHub, hedgeFundWorkspace],
      active_workspace_id: hedgeFundWorkspace.id
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

    workspace = this.normalizeWorkspace(workspace);

    // Validate workspace
    if (!workspace.id || !workspace.name || !workspace.path) {
      throw new Error('Invalid workspace: missing required fields');
    }

    // Check if ID already exists
    if (this.config.workspaces.some(w => w.id === workspace.id)) {
      throw new Error(`Workspace with ID ${workspace.id} already exists`);
    }

    // Validate path exists
    if (!this.validatePath(workspace.path)) {
      throw new Error(`Workspace path does not exist or is not a directory: ${workspace.path}`);
    }

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
    const kind = inferWorkspaceKind({
      id: this.createUniqueWorkspaceId(name),
      name,
      path: normalizedPath
    });
    const shell = process.env.SHELL || '/bin/zsh';
    const obsidianVaultPath = normalizeObsidianVaultPath(normalizedPath);

    if (kind === 'hedge-fund') {
      return {
        id: this.createUniqueWorkspaceId(name),
        name,
        path: normalizedPath,
        kind,
        description: defaultDescriptionForKind(kind),
        pinned: true,
        default_route: defaultRouteForKind(kind),
        icon: 'chart',
        color: '#22d3ee',
        shell,
        obsidian_vault_path: obsidianVaultPath,
        default_commands: createDefaultCommands(kind, normalizedPath),
        launch_profiles: createDefaultLaunchProfiles(kind, normalizedPath),
        browser_tabs: createDefaultBrowserTabs(kind)
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
      kind: 'project',
      description: defaultDescriptionForKind('project'),
      pinned: false,
      default_route: defaultRouteForKind('project'),
      icon: isNodeRepo ? 'code' : 'folder',
      color: defaultColorForKind('project'),
      shell,
      obsidian_vault_path: obsidianVaultPath,
      default_commands: defaultCommands,
      launch_profiles: launchProfiles,
      browser_tabs: createDefaultBrowserTabs('project')
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

    const merged = this.normalizeWorkspace({
      ...this.config.workspaces[index],
      ...updates,
      id
    }, index);

    this.config.workspaces[index] = merged;

    this.saveConfig();
  }

  delete(id: string): void {
    if (!this.config) throw new Error('Config not loaded');

    if (id === COMMAND_HUB_ID) {
      throw new Error('Command Hub is required and cannot be deleted');
    }

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
