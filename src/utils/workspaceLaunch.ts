import type { LaunchProfile, Workspace } from '../types/electron';
import type { AgentProvider } from '../types/agents';
import { getProviderMeta, resolveAgentAwareCommand } from './agentRuntime';

export function buildTerminalLabel(workspace: Workspace, command?: string): string {
  if (!command) {
    return `${workspace.name} Shell`;
  }

  const compact = command.trim().replace(/\s+/g, ' ');
  const suffix = compact.length > 30 ? `${compact.slice(0, 30)}...` : compact;
  return `${workspace.name}: ${suffix}`;
}

export function getLaunchProfileCommandSummary(profile: LaunchProfile): string {
  if (profile.steps.length === 1) {
    return profile.steps[0].command;
  }

  return `${profile.steps.length} terminals`;
}

export function createDefaultLaunchProfiles(workspaceName: string): LaunchProfile[] {
  const normalizedName = workspaceName.toLowerCase();
  const isTrading = normalizedName.includes('trade') || normalizedName.includes('btc') || normalizedName.includes('market');

  if (isTrading) {
    return [
      {
        id: 'ai-work-desk',
        name: 'AI Work Desk',
        steps: [
          { command: 'agent-runtime', delayMs: 0 },
          { command: 'docker compose ps', delayMs: 300 },
          { command: 'git status', delayMs: 600 }
        ]
      },
      {
        id: 'market-ops',
        name: 'Market Ops',
        steps: [
          { command: 'python -V', delayMs: 0 },
          { command: 'docker compose logs --tail 80', delayMs: 300 },
          { command: 'git status', delayMs: 600 }
        ]
      }
    ];
  }

  return [
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
        id: 'review-and-tests',
        name: 'Review and Tests',
        steps: [
          { command: 'agent-runtime', delayMs: 0 },
          { command: 'git diff --stat', delayMs: 300 },
          { command: 'npm test', delayMs: 700 }
        ]
    }
  ];
}

export interface LaunchDeskRecord {
  id: string;
  workspaceId: string;
  workspaceName: string;
  profileId: string;
  profileName: string;
  runtimeProvider?: AgentProvider;
  launchedAt: number;
  commands: string[];
}

export function launchProfileSequence(
  workspace: Workspace,
  profile: LaunchProfile,
  createTerminal: (
    cwd: string,
    shell?: string,
    label?: string,
    autoCommand?: string,
    metadata?: { agentId?: string; agentName?: string; terminalPurpose?: string; runtimeProvider?: AgentProvider }
  ) => string,
  terminalMetadata?: { agentId?: string; agentName?: string; terminalPurpose?: string; runtimeProvider?: AgentProvider },
  onLaunched?: (record: LaunchDeskRecord) => void,
  onTerminalCreated?: (terminalId: string) => void
) {
  const runtimeProvider = terminalMetadata?.runtimeProvider;
  const commands = profile.steps.map((step) => resolveAgentAwareCommand(step.command, runtimeProvider || 'claude', workspace.shell));

  profile.steps.forEach((step, index) => {
    window.setTimeout(() => {
      const resolvedCommand = commands[index];
      const runtimeMeta = runtimeProvider ? getProviderMeta(runtimeProvider) : null;
      const terminalId = createTerminal(
        workspace.path,
        workspace.shell,
        runtimeMeta && index === 0
          ? `${workspace.name}: ${runtimeMeta.label}`
          : buildTerminalLabel(workspace, resolvedCommand),
        resolvedCommand,
        terminalMetadata
      );
      onTerminalCreated?.(terminalId);
    }, step.delayMs);
  });

  onLaunched?.({
    id: `${workspace.id}:${profile.id}:${Date.now()}`,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    profileId: profile.id,
    profileName: profile.name,
    runtimeProvider,
    launchedAt: Date.now(),
    commands
  });
}
