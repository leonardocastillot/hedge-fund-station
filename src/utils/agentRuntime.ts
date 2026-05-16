import type { AgentProvider, AgentRole } from '../types/agents';
import { isWindowsTerminalShell, resolveTerminalShell } from './terminalShell';

export interface ProviderMeta {
  id: AgentProvider;
  label: string;
  shortLabel: string;
  accent: string;
  glow: string;
}

export const AGENT_PROVIDERS: AgentProvider[] = ['codex', 'opencode', 'claude', 'gemini'];
export const OPENCODE_DEFAULT_MODEL = 'opencode/deepseek-v4-flash-free';

const PROVIDER_META: Record<AgentProvider, ProviderMeta> = {
  claude: {
    id: 'claude',
    label: 'Claude',
    shortLabel: 'CL',
    accent: '#f97316',
    glow: 'rgba(249, 115, 22, 0.18)'
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    shortLabel: 'CX',
    accent: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.18)'
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    shortLabel: 'OC',
    accent: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.18)'
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    shortLabel: 'GM',
    accent: '#10b981',
    glow: 'rgba(16, 185, 129, 0.18)'
  }
};

const PROVIDER_ALIASES = new Set([
  'agent',
  'agent-runtime',
  'ai-agent',
  'claude',
  'claude.exe',
  'codex',
  'codex.cmd',
  'gemini',
  'gemini.cmd',
  'opencode',
  'opencode.cmd'
]);

export function getDefaultProviderForRole(role: AgentRole): AgentProvider {
  switch (role) {
    default:
      return 'codex';
  }
}

export function inferRequestedProvider(goal: string): AgentProvider | null {
  const normalized = goal.toLowerCase();

  if (/\bcodex\b/.test(normalized)) {
    return 'codex';
  }

  if (/\bgemini\b/.test(normalized)) {
    return 'gemini';
  }

  if (/\b(open\s*code|opencode|deepseek)\b/.test(normalized)) {
    return 'opencode';
  }

  if (/\bclaude\b/.test(normalized)) {
    return 'claude';
  }

  return null;
}

export function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'claude' || value === 'codex' || value === 'gemini' || value === 'opencode';
}

export function getProviderMeta(provider?: AgentProvider | null): ProviderMeta {
  return PROVIDER_META[provider && isAgentProvider(provider) ? provider : 'claude'];
}

export function resolveAgentRuntimeCommand(provider: AgentProvider, shell?: string): string {
  const windowsShell = isWindowsTerminalShell(shell);

  if (provider === 'codex') {
    return windowsShell ? 'codex.cmd' : 'codex';
  }

  if (provider === 'gemini') {
    return windowsShell ? 'gemini.cmd' : 'gemini';
  }

  if (provider === 'opencode') {
    const command = windowsShell ? 'opencode.cmd' : 'opencode';
    return `${command} --model ${OPENCODE_DEFAULT_MODEL}`;
  }

  return windowsShell ? 'claude.exe' : 'claude';
}

export function resolveAgentRuntimeShell(shell?: string): string | undefined {
  return resolveTerminalShell(shell).shell;
}

export function resolveAgentAwareCommand(
  command: string,
  provider: AgentProvider,
  shell?: string
): string {
  const trimmed = command.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (!PROVIDER_ALIASES.has(trimmed.toLowerCase())) {
    return trimmed;
  }

  return resolveAgentRuntimeCommand(provider, shell);
}
