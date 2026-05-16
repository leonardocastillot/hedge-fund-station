export interface TerminalShellResolution {
  shell: string;
  normalizedShell: boolean;
  platform: string;
}

const WINDOWS_SHELL_PATTERN = /(^|[/\\])(powershell(?:\.exe)?|pwsh(?:\.exe)?|cmd(?:\.exe)?)$/i;

function getProcessPlatform(): string | undefined {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { platform?: string; env?: Record<string, string | undefined> };
  };
  return maybeProcess.process?.platform;
}

function getProcessShell(): string | undefined {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return maybeProcess.process?.env?.SHELL;
}

export function detectTerminalPlatform(): string {
  const processPlatform = getProcessPlatform();
  if (processPlatform) {
    return processPlatform;
  }

  if (typeof navigator !== 'undefined') {
    const platform = navigator.platform.toLowerCase();
    const userAgent = navigator.userAgent.toLowerCase();
    if (platform.includes('mac') || userAgent.includes('mac os')) return 'darwin';
    if (platform.includes('win') || userAgent.includes('windows')) return 'win32';
    if (platform.includes('linux') || userAgent.includes('linux')) return 'linux';
  }

  return 'darwin';
}

export function isWindowsTerminalShell(shell?: string | null): boolean {
  const trimmed = shell?.trim();
  return Boolean(trimmed && WINDOWS_SHELL_PATTERN.test(trimmed));
}

export function getDefaultTerminalShell(platform = detectTerminalPlatform(), fallback?: string | null): string {
  const trimmedFallback = fallback?.trim();

  if (platform === 'win32') {
    return trimmedFallback && !trimmedFallback.startsWith('/') ? trimmedFallback : 'powershell.exe';
  }

  if (trimmedFallback && !isWindowsTerminalShell(trimmedFallback)) {
    return trimmedFallback;
  }

  if (platform === 'darwin') {
    return getProcessShell() || '/bin/zsh';
  }

  return getProcessShell() || '/bin/bash';
}

export function resolveTerminalShell(
  shell?: string | null,
  fallback?: string | null,
  platform = detectTerminalPlatform()
): TerminalShellResolution {
  const trimmed = shell?.trim();
  const fallbackShell = getDefaultTerminalShell(platform, fallback);

  if (platform === 'win32') {
    return {
      shell: trimmed || fallbackShell,
      normalizedShell: !trimmed,
      platform
    };
  }

  if (!trimmed || isWindowsTerminalShell(trimmed)) {
    return {
      shell: fallbackShell,
      normalizedShell: trimmed !== fallbackShell,
      platform
    };
  }

  return {
    shell: trimmed,
    normalizedShell: false,
    platform
  };
}

export function getTerminalShellOptions(platform = detectTerminalPlatform()): Array<{ value: string; label: string }> {
  if (platform === 'win32') {
    return [
      { value: 'powershell.exe', label: 'PowerShell' },
      { value: 'cmd.exe', label: 'Command Prompt' }
    ];
  }

  if (platform === 'darwin') {
    return [
      { value: '/bin/zsh', label: 'Zsh' },
      { value: '/bin/bash', label: 'Bash' }
    ];
  }

  return [
    { value: '/bin/bash', label: 'Bash' },
    { value: '/bin/zsh', label: 'Zsh' },
    { value: '/bin/sh', label: 'sh' }
  ];
}

export function normalizeRuntimeCommandForShell(command: string | undefined, shell?: string): string | undefined {
  if (!command) {
    return undefined;
  }

  const normalizedCommand = command.trim().toLowerCase();
  const windowsShell = isWindowsTerminalShell(shell);

  if (normalizedCommand === 'codex.cmd') return windowsShell ? 'codex.cmd' : 'codex';
  if (normalizedCommand.startsWith('codex.cmd ')) {
    return windowsShell ? command : `codex ${command.trim().slice('codex.cmd'.length).trimStart()}`;
  }
  if (normalizedCommand === 'claude.exe') return windowsShell ? 'claude.exe' : 'claude';
  if (normalizedCommand.startsWith('claude.exe ')) {
    return windowsShell ? command : `claude ${command.trim().slice('claude.exe'.length).trimStart()}`;
  }
  if (normalizedCommand === 'gemini.cmd') return windowsShell ? 'gemini.cmd' : 'gemini';
  if (normalizedCommand.startsWith('gemini.cmd ')) {
    return windowsShell ? command : `gemini ${command.trim().slice('gemini.cmd'.length).trimStart()}`;
  }
  if (normalizedCommand === 'opencode.cmd') return windowsShell ? 'opencode.cmd' : 'opencode';
  if (normalizedCommand.startsWith('opencode.cmd ')) {
    return windowsShell ? command : `opencode ${command.trim().slice('opencode.cmd'.length).trimStart()}`;
  }

  return command;
}
