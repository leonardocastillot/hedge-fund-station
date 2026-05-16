#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OLD_FOLDER_NAME = 'New project 9';
const WORKSPACE_CONFIG_PATH = join(homedir(), '.hedge-station', 'workspaces.json');

function requestUrl(url, timeoutMs = 2500) {
  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.request(parsed, { method: 'GET', timeout: timeoutMs }, (response) => {
      response.resume();
      response.once('end', () => {
        resolveResult({
          ok: response.statusCode >= 200 && response.statusCode < 500,
          statusCode: response.statusCode,
          url,
          latencyMs: Date.now() - startedAt
        });
      });
    });

    request.once('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.once('error', (error) => {
      resolveResult({
        ok: false,
        url,
        latencyMs: Date.now() - startedAt,
        error: error.message
      });
    });
    request.end();
  });
}

async function checkHttpAny(id, label, urls) {
  const results = await Promise.all(urls.map((url) => requestUrl(url)));
  const selected = results.find((result) => result.ok) || results[0];
  return {
    id,
    label,
    ok: Boolean(selected?.ok),
    detail: selected
      ? `${selected.url} -> ${selected.statusCode || selected.error || 'no response'} (${selected.latencyMs}ms)`
      : 'No URLs configured'
  };
}

function run(command, args, timeout = 2500) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout
    });
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || ''}`;
  }
}

function pathInside(childPath, parentPath) {
  const relativePath = relative(resolve(parentPath), resolve(childPath));
  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('/'));
}

function checkGatewayProcess() {
  if (process.platform === 'win32') {
    return {
      id: 'gateway-process',
      label: 'Gateway process path',
      ok: true,
      detail: 'Skipped on Windows.'
    };
  }

  const psOutput = run('ps', ['auxww']);
  const staleLine = psOutput
    .split('\n')
    .find((line) => (
      /hyperliquid-gateway|run-hyperliquid-gateway|uvicorn app:app/.test(line)
      && line.includes(OLD_FOLDER_NAME)
    ));

  if (staleLine) {
    return {
      id: 'gateway-process',
      label: 'Gateway process path',
      ok: false,
      detail: `stale old-folder process: ${staleLine.trim().slice(0, 220)}`
    };
  }

  const expectedGatewayPath = join(ROOT, 'backend', 'hyperliquid_gateway');
  const pids = run('lsof', ['-tiTCP:18001', '-sTCP:LISTEN'])
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((pid) => Number.isInteger(pid) && pid > 0);

  for (const pid of pids) {
    const cwdOutput = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
    const cwdLine = cwdOutput.split('\n').find((line) => line.startsWith('n'));
    const cwd = cwdLine?.slice(1);
    if (
      cwd
      && cwd.endsWith(join('backend', 'hyperliquid_gateway'))
      && !pathInside(cwd, expectedGatewayPath)
    ) {
      return {
        id: 'gateway-process',
        label: 'Gateway process path',
        ok: false,
        detail: `pid ${pid} cwd ${cwd}; expected ${expectedGatewayPath}`
      };
    }
  }

  return {
    id: 'gateway-process',
    label: 'Gateway process path',
    ok: pids.length > 0,
    detail: pids.length > 0
      ? `listening on 18001 with pid(s): ${pids.join(', ')}`
      : 'no process is listening on 18001'
  };
}

function checkWorkspaceConfig() {
  if (!existsSync(WORKSPACE_CONFIG_PATH)) {
    return {
      id: 'workspace-config',
      label: 'Workspace config',
      ok: false,
      detail: `${WORKSPACE_CONFIG_PATH} does not exist`
    };
  }

  const config = JSON.parse(readFileSync(WORKSPACE_CONFIG_PATH, 'utf8'));
  const workspaces = Array.isArray(config.workspaces) ? config.workspaces : [];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === config.active_workspace_id);
  const stalePaths = [];

  if (activeWorkspace?.path?.includes(OLD_FOLDER_NAME)) {
    stalePaths.push(`active path=${activeWorkspace.path}`);
  }
  if (activeWorkspace?.obsidian_vault_path?.includes(OLD_FOLDER_NAME)) {
    stalePaths.push(`active vault=${activeWorkspace.obsidian_vault_path}`);
  }
  if (
    typeof activeWorkspace?.obsidian_vault_path === 'string'
    && activeWorkspace.obsidian_vault_path
    && !existsSync(activeWorkspace.obsidian_vault_path)
  ) {
    stalePaths.push(`missing vault=${activeWorkspace.obsidian_vault_path}`);
  }

  return {
    id: 'workspace-config',
    label: 'Workspace config',
    ok: stalePaths.length === 0,
    detail: activeWorkspace
      ? stalePaths.length > 0
        ? stalePaths.join(' | ')
        : `active=${activeWorkspace.id} path=${activeWorkspace.path}`
      : `active workspace ${config.active_workspace_id || 'unknown'} not found`
  };
}

async function main() {
  const checks = [
    await checkHttpAny('vite', 'Vite renderer', ['http://localhost:5173', 'http://127.0.0.1:5173']),
    await checkHttpAny('gateway', 'Hyperliquid gateway', ['http://127.0.0.1:18001/health']),
    await checkHttpAny('backend', 'Alpha backend tunnel', ['http://127.0.0.1:18500/health']),
    await checkHttpAny('paper-signals', 'Paper signals endpoint', ['http://127.0.0.1:18001/api/hyperliquid/paper/signals?limit=5']),
    checkGatewayProcess(),
    checkWorkspaceConfig()
  ];

  for (const check of checks) {
    const prefix = check.ok ? '[OK]' : '[FAIL]';
    console.log(`${prefix} ${check.label}: ${check.detail}`);
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    console.error(`dev:doctor failed: ${failed.map((check) => check.id).join(', ')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
