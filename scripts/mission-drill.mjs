import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function resolveArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }
    args.set(key, next);
    i += 1;
  }
  return args;
}

async function resolveCommand(command) {
  const isWindows = os.platform() === 'win32';
  try {
    if (isWindows) {
      const { stdout } = await execFileAsync('where.exe', [command], { windowsHide: true });
      return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
    }

    const { stdout } = await execFileAsync('which', [command], { windowsHide: true });
    return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
  } catch {
    return null;
  }
}

async function shellSmokeTest(shell, cwd) {
  const normalized = shell.toLowerCase();
  try {
    if (normalized.includes('powershell') || normalized.endsWith('pwsh.exe') || normalized === 'pwsh') {
      const { stdout } = await execFileAsync(shell, ['-NoLogo', '-Command', 'Write-Output HEDGE_STATION_SHELL_OK'], { cwd, windowsHide: true });
      return { success: stdout.includes('HEDGE_STATION_SHELL_OK'), output: stdout.trim(), error: '' };
    }

    if (normalized.includes('cmd.exe') || normalized === 'cmd') {
      const { stdout } = await execFileAsync(shell, ['/C', 'echo HEDGE_STATION_SHELL_OK'], { cwd, windowsHide: true });
      return { success: stdout.includes('HEDGE_STATION_SHELL_OK'), output: stdout.trim(), error: '' };
    }

    const { stdout } = await execFileAsync(shell, ['-lc', 'echo HEDGE_STATION_SHELL_OK'], { cwd, windowsHide: true });
    return { success: stdout.includes('HEDGE_STATION_SHELL_OK'), output: stdout.trim(), error: '' };
  } catch (error) {
    return {
      success: false,
      output: `${error.stdout || ''}${error.stderr || ''}`.trim(),
      error: error.message || 'Shell smoke test failed'
    };
  }
}

function resolveVaultPath(workspacePath, explicitVaultPath) {
  const candidate = (explicitVaultPath || workspacePath || '').trim();
  if (!candidate) {
    return null;
  }

  const configPath = path.join(candidate, '.obsidian');
  if (fs.existsSync(configPath) && fs.statSync(configPath).isDirectory()) {
    return candidate;
  }

  return null;
}

function resolveVaultFromWorkspaceConfig(workspacePath) {
  const configPath = path.join(os.homedir(), '.hedge-station', 'workspaces.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const normalizedWorkspace = path.resolve(workspacePath).toLowerCase();
    const match = Array.isArray(parsed.workspaces)
      ? parsed.workspaces.find((item) => typeof item.path === 'string' && path.resolve(item.path).toLowerCase() === normalizedWorkspace)
      : null;
    return typeof match?.obsidian_vault_path === 'string' ? match.obsidian_vault_path : null;
  } catch {
    return null;
  }
}

function writeDrillNote({ workspaceName, workspacePath, vaultPath, summary, shellResult, commands, checkedAt, errors }) {
  const notesPath = path.join(vaultPath, 'hedge-station');
  fs.mkdirSync(notesPath, { recursive: true });
  const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
  const fileName = `${checkedAt.replace(/[:]/g, '-').slice(0, 19)}-mission-drill-${slug}.md`;
  const filePath = path.join(notesPath, fileName);
  const content = [
    '---',
    'type: mission-run',
    `workspace: [${slug}]`,
    'agent: system-diagnostics',
    'runtime: mission-drill',
    'tags: [mission, hedge-station, diagnostics]',
    `exported_at: ${checkedAt}`,
    '---',
    '',
    `# Mission Drill - ${workspaceName}`,
    '',
    `- Workspace Path: ${workspacePath}`,
    `- Exported: ${checkedAt}`,
    '',
    '## Goal',
    'Validate mission launch prerequisites before live use.',
    '',
    '## Summary',
    summary,
    '',
    '## Shell',
    `- Result: ${shellResult.success ? 'ok' : 'fail'}`,
    `- Output: ${shellResult.output || 'no output'}`,
    shellResult.error ? `- Error: ${shellResult.error}` : '',
    '',
    '## Runtime Commands',
    ...commands.map((item) => `- ${item.command}: ${item.available ? `ok (${item.resolvedPath || 'resolved'})` : 'missing'}`),
    '',
    '## Errors',
    ...(errors.length ? errors.map((item) => `- ${item}`) : ['- none']),
    ''
  ].filter(Boolean).join('\n');

  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

async function main() {
  const args = resolveArgs(process.argv.slice(2));
  const workspacePath = path.resolve(args.get('workspace') || process.cwd());
  const workspaceName = args.get('name') || path.basename(workspacePath);
  const shell = args.get('shell') || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash');
  const configuredVaultPath = args.get('vault') || resolveVaultFromWorkspaceConfig(workspacePath);
  const vaultPath = resolveVaultPath(workspacePath, configuredVaultPath);
  const commands = os.platform() === 'win32'
    ? ['codex.cmd', 'claude.exe', 'gemini.cmd']
    : ['codex', 'claude', 'gemini'];

  const commandStatuses = (await Promise.all(commands.map(async (command) => ({
    command,
    resolvedPath: await resolveCommand(command)
  })))).map((item) => ({
    ...item,
    available: Boolean(item.resolvedPath)
  }));

  const shellResult = await shellSmokeTest(shell, workspacePath);
  const checkedAt = new Date().toISOString();
  const errors = [];

  if (!vaultPath) {
    errors.push('No Obsidian vault detected for the selected workspace or --vault path.');
  }
  if (!shellResult.success) {
    errors.push(shellResult.error || 'Shell smoke test failed');
  }

  const missingCommands = commandStatuses.filter((item) => !item.available);
  if (missingCommands.length) {
    errors.push(`Missing runtime commands: ${missingCommands.map((item) => item.command).join(', ')}`);
  }

  const summary = errors.length === 0
    ? `Mission drill passed. ${commandStatuses.length} runtime command(s) resolved and the shell responded cleanly.`
    : `Mission drill found ${errors.length} issue(s). Review shell, vault, and runtime commands before launching live missions.`;

  let notePath = '';
  if (vaultPath) {
    notePath = writeDrillNote({
      workspaceName,
      workspacePath,
      vaultPath,
      summary,
      shellResult,
      commands: commandStatuses,
      checkedAt,
      errors
    });
  }

  const result = {
    success: errors.length === 0,
    checkedAt,
    workspaceName,
    workspacePath,
    vaultPath,
    notePath,
    summary,
    shell: shellResult,
    commandStatuses,
    errors
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(errors.length === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
