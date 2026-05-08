import { execFile, spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { ObsidianManager } from './obsidian-manager';
import type {
  DiagnosticsCheckCommandsParams,
  DiagnosticsCommandStatus,
  DiagnosticsShellSmokeTestParams,
  DiagnosticsShellSmokeTestResult,
  DiagnosticsMissionDrillParams,
  DiagnosticsMissionDrillResult
} from '../../types/ipc.types';

const PATH_PREFIX = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin'
];

function buildEnv(): NodeJS.ProcessEnv {
  const existing = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return {
    ...process.env,
    PATH: Array.from(new Set([...PATH_PREFIX, ...existing])).join(path.delimiter)
  };
}

function execFileAsync(file: string, args: string[], options: { cwd?: string } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd: options.cwd, windowsHide: true, env: buildEnv() }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function getExecutable(command: string): string {
  return command.trim().split(/\s+/)[0] || command.trim();
}

export class DiagnosticsManager {
  constructor(private readonly obsidianManager = new ObsidianManager()) {}

  async checkCommands(params: DiagnosticsCheckCommandsParams): Promise<DiagnosticsCommandStatus[]> {
    const unique = Array.from(new Set(params.commands.map((command) => command.trim()).filter(Boolean)));
    const isWindows = os.platform() === 'win32';
    const shell = params.shell || (isWindows ? 'powershell.exe' : process.env.SHELL || '/bin/bash');

    return Promise.all(unique.map(async (command) => {
      const executable = getExecutable(command);

      try {
        let resolvedPath: string | undefined;

        if (isWindows) {
          try {
            const { stdout } = await execFileAsync('where.exe', [executable], { cwd: params.cwd });
            resolvedPath = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
          } catch {
            resolvedPath = undefined;
          }

          if (!resolvedPath) {
            const psCommand = `(Get-Command '${executable.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)`;
            const powerShell = shell.toLowerCase().includes('powershell') || shell.toLowerCase().endsWith('pwsh.exe') || shell.toLowerCase() === 'pwsh'
              ? shell
              : 'powershell.exe';
            const { stdout } = await execFileAsync(powerShell, ['-NoLogo', '-Command', psCommand], { cwd: params.cwd });
            resolvedPath = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
          }
        } else {
          const { stdout } = await execFileAsync(
            shell,
            ['-lc', `command -v -- ${shellQuote(executable)}`],
            { cwd: params.cwd }
          );
          resolvedPath = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
        }

        return {
          command,
          available: Boolean(resolvedPath),
          resolvedPath
        };
      } catch {
        return {
          command,
          available: false
        };
      }
    }));
  }

  async shellSmokeTest(params: DiagnosticsShellSmokeTestParams): Promise<DiagnosticsShellSmokeTestResult> {
    const shell = params.shell || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash');
    const normalized = shell.toLowerCase();

    try {
      if (normalized.includes('powershell') || normalized.endsWith('pwsh.exe') || normalized === 'pwsh') {
        const { stdout } = await execFileAsync(shell, ['-NoLogo', '-Command', 'Write-Output HEDGE_STATION_SHELL_OK'], { cwd: params.cwd });
        return { success: stdout.includes('HEDGE_STATION_SHELL_OK'), output: stdout.trim() };
      }

      if (normalized.includes('cmd.exe') || normalized === 'cmd') {
        const { stdout } = await execFileAsync(shell, ['/C', 'echo HEDGE_STATION_SHELL_OK'], { cwd: params.cwd });
        return { success: stdout.includes('HEDGE_STATION_SHELL_OK'), output: stdout.trim() };
      }

      const { stdout } = await execFileAsync(shell, ['-lc', 'echo HEDGE_STATION_SHELL_OK'], { cwd: params.cwd });
      return { success: stdout.includes('HEDGE_STATION_SHELL_OK'), output: stdout.trim() };
    } catch (caught) {
      const error = caught as { error?: Error; stdout?: string; stderr?: string };
      return {
        success: false,
        output: `${error.stdout || ''}${error.stderr || ''}`.trim(),
        error: error.error?.message || 'Shell smoke test failed'
      };
    }
  }

  async runMissionDrill(params: DiagnosticsMissionDrillParams): Promise<DiagnosticsMissionDrillResult> {
    const commandStatuses = await this.checkCommands({
      commands: params.commands,
      cwd: params.workspacePath,
      shell: params.shell
    });
    const shell = await this.shellSmokeTest({ cwd: params.workspacePath, shell: params.shell });
    const checkedAt = new Date().toISOString();
    const errors: string[] = [];

    const missingCommands = commandStatuses.filter((item) => !item.available);
    if (missingCommands.length > 0) {
      errors.push(`Missing runtime commands: ${missingCommands.map((item) => item.command).join(', ')}`);
    }
    if (!shell.success) {
      errors.push(shell.error || 'Shell smoke test failed');
    }

    let success = errors.length === 0;
    let summary = success
      ? `Mission drill passed. ${commandStatuses.length} runtime command(s) resolved and the shell responded cleanly.`
      : `Mission drill found ${errors.length} issue(s). Review shell and runtime command availability before launching live missions.`;

    let notePath: string | undefined;
    try {
      const details = [
        '## Drill Results',
        `- Status: ${success ? 'pass' : 'fail'}`,
        `- Checked At: ${checkedAt}`,
        '',
        '## Shell',
        `- Result: ${shell.success ? 'ok' : 'fail'}`,
        `- Output: ${shell.output || 'no output'}`,
        shell.error ? `- Error: ${shell.error}` : '',
        '',
        '## Runtime Commands',
        ...commandStatuses.map((item) => `- ${item.command}: ${item.available ? `ok (${item.resolvedPath || 'resolved'})` : 'missing'}`),
        '',
        '## Errors',
        ...(errors.length > 0 ? errors.map((item) => `- ${item}`) : ['- none'])
      ].filter(Boolean).join('\n');

      notePath = this.obsidianManager.exportMission({
        workspaceName: params.workspaceName,
        workspacePath: params.workspacePath,
        vaultPath: params.vaultPath,
        title: `Mission Drill - ${params.workspaceName}`,
        goal: 'Validate mission launch prerequisites before live use.',
        summary,
        details,
        agentName: 'System Diagnostics',
        runtimeProvider: params.commands.join(', ')
      }).filePath;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Could not export drill result to Obsidian');
      success = false;
      summary = `Mission drill found ${errors.length} issue(s). Review shell, Obsidian export, and runtime command availability before launching live missions.`;
    }

    return {
      success,
      checkedAt,
      summary,
      commandStatuses,
      shell,
      notePath,
      errors
    };
  }

  launchCodexLogin(): { success: boolean; command: string; error?: string } {
    try {
      const isWindows = os.platform() === 'win32';
      if (isWindows) {
        spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', 'codex login'], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      } else if (os.platform() === 'darwin') {
        spawn('osascript', [
          '-e',
          'tell application "Terminal" to do script "codex login"',
          '-e',
          'tell application "Terminal" to activate'
        ], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      } else {
        spawn('sh', ['-lc', 'codex login'], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      }
      return { success: true, command: 'codex login' };
    } catch (error) {
      return {
        success: false,
        command: 'codex login',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
