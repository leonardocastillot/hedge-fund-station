import type { AgentProvider, AgentRole } from '../types/agents';

export interface ProviderMeta {
  id: AgentProvider;
  label: string;
  shortLabel: string;
  accent: string;
  glow: string;
}

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
  'gemini.cmd'
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

  if (/\bclaude\b/.test(normalized)) {
    return 'claude';
  }

  return null;
}

export function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'claude' || value === 'codex' || value === 'gemini';
}

export function getProviderMeta(provider?: AgentProvider | null): ProviderMeta {
  return PROVIDER_META[provider && isAgentProvider(provider) ? provider : 'claude'];
}

function isWindowsShell(shell?: string): boolean {
  const normalizedShell = shell?.toLowerCase() ?? '';
  return normalizedShell.includes('powershell')
    || normalizedShell.endsWith('pwsh.exe')
    || normalizedShell === 'pwsh'
    || normalizedShell.includes('cmd.exe')
    || normalizedShell === 'cmd';
}

export function resolveAgentRuntimeCommand(provider: AgentProvider, shell?: string): string {
  const windowsShell = isWindowsShell(shell);

  if (provider === 'codex') {
    return windowsShell ? 'codex.cmd' : 'codex';
  }

  if (provider === 'gemini') {
    return windowsShell ? 'gemini.cmd' : 'gemini';
  }

  return windowsShell ? 'claude.exe' : 'claude';
}

export function resolveAgentRuntimeShell(shell?: string): string | undefined {
  const normalizedShell = shell?.toLowerCase() ?? '';
  const windowsShell = isWindowsShell(shell);

  if (shell?.trim()) {
    return shell;
  }

  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')) {
    return 'powershell.exe';
  }

  return windowsShell ? shell : shell;
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
