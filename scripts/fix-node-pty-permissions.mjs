#!/usr/bin/env node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const NODE_PTY_DIR = path.join(ROOT_DIR, 'node_modules', 'node-pty');
const PATH_PREFIX = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin'
];
const SMOKE_MARKER = 'HEDGE_STATION_PTY_OK';

function hasExecuteBit(filePath) {
  try {
    return (fs.statSync(filePath).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function listSpawnHelpers() {
  if (!fs.existsSync(NODE_PTY_DIR)) {
    return [];
  }

  const candidates = [];
  const prebuildsDir = path.join(NODE_PTY_DIR, 'prebuilds');
  const releaseHelper = path.join(NODE_PTY_DIR, 'build', 'Release', 'spawn-helper');

  if (fs.existsSync(prebuildsDir)) {
    for (const entry of fs.readdirSync(prebuildsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        candidates.push(path.join(prebuildsDir, entry.name, 'spawn-helper'));
      }
    }
  }

  candidates.push(releaseHelper);
  return candidates.filter((candidate) => fs.existsSync(candidate));
}

function repairSpawnHelpers() {
  const helpers = listSpawnHelpers();
  const changed = [];
  const alreadyExecutable = [];

  for (const helper of helpers) {
    const stat = fs.statSync(helper);
    if (hasExecuteBit(helper)) {
      alreadyExecutable.push(path.relative(ROOT_DIR, helper));
      continue;
    }

    fs.chmodSync(helper, stat.mode | 0o111);
    changed.push(path.relative(ROOT_DIR, helper));
  }

  return {
    helpers: helpers.map((helper) => path.relative(ROOT_DIR, helper)),
    changed,
    alreadyExecutable
  };
}

function getDefaultShell() {
  if (os.platform() === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }

  return process.env.SHELL || '/bin/zsh';
}

function getPathEnv() {
  const existing = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return Array.from(new Set([...PATH_PREFIX, ...existing])).join(path.delimiter);
}

function getShellLaunch(shellPath) {
  const normalized = shellPath.toLowerCase();

  if (normalized.includes('powershell') || normalized.endsWith('pwsh.exe') || normalized === 'pwsh') {
    return { file: shellPath, args: ['-NoLogo'] };
  }

  if (normalized.includes('cmd.exe') || normalized === 'cmd') {
    return { file: shellPath, args: ['/Q'] };
  }

  if (normalized.includes('zsh') || normalized.includes('bash')) {
    return { file: shellPath, args: ['-l'] };
  }

  if (normalized.includes('fish')) {
    return { file: shellPath, args: ['--login'] };
  }

  return { file: shellPath, args: [] };
}

function getSmokeCommand(shellPath) {
  const normalized = shellPath.toLowerCase();

  if (normalized.includes('powershell') || normalized.endsWith('pwsh.exe') || normalized === 'pwsh') {
    return `Write-Output ${SMOKE_MARKER}; Get-Location; exit\r`;
  }

  if (normalized.includes('cmd.exe') || normalized === 'cmd') {
    return `echo ${SMOKE_MARKER} && cd && exit\r`;
  }

  return [
    `echo ${SMOKE_MARKER}`,
    'pwd',
    'command -v npm || true',
    'command -v git || true',
    'command -v codex || true',
    'exit'
  ].join('; ') + '\r';
}

function stripAnsi(value) {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\r/g, '');
}

async function runPtySmokeTest(options = {}) {
  const shellPath = options.shell || getDefaultShell();
  const cwd = path.resolve(options.cwd || ROOT_DIR);
  const pty = require('node-pty');
  const launch = getShellLaunch(shellPath);

  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    return {
      success: false,
      shell: shellPath,
      cwd,
      output: '',
      error: `Smoke-test cwd is not a directory: ${cwd}`
    };
  }

  return new Promise((resolve) => {
    let buffer = '';
    let settled = false;
    let terminal;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        terminal.kill();
      } catch {
        // Ignore cleanup failures from an already-exited smoke PTY.
      }
      resolve({
        success: false,
        shell: shellPath,
        cwd,
        output: stripAnsi(buffer).trim(),
        error: 'PTY smoke test timed out before the shell responded.'
      });
    }, 7000);

    try {
      terminal = pty.spawn(launch.file, launch.args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: {
          ...process.env,
          PATH: getPathEnv(),
          TERM: 'xterm-256color',
          PWD: cwd
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      settled = true;
      resolve({
        success: false,
        shell: shellPath,
        cwd,
        output: '',
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    terminal.onData((data) => {
      buffer += data;
    });

    terminal.onExit(({ exitCode }) => {
      if (settled) {
        return;
      }
      clearTimeout(timeout);
      settled = true;
      const output = stripAnsi(buffer).trim();
      const hasMarker = output.includes(SMOKE_MARKER);
      resolve({
        success: exitCode === 0 && hasMarker,
        shell: shellPath,
        cwd,
        output,
        error: exitCode === 0 && hasMarker
          ? undefined
          : hasMarker
            ? `PTY smoke command exited with code ${exitCode}.`
            : `PTY exited without ${SMOKE_MARKER}.`
      });
    });

    setTimeout(() => {
      terminal.write(getSmokeCommand(shellPath));
    }, 100);
  });
}

async function main() {
  const smoke = process.argv.includes('--smoke');
  const repair = repairSpawnHelpers();

  if (repair.helpers.length === 0 && os.platform() !== 'win32') {
    console.warn('[terminal:doctor] No node-pty spawn-helper files found.');
  }

  for (const helper of repair.changed) {
    console.log(`[terminal:doctor] chmod +x ${helper}`);
  }

  if (repair.changed.length === 0 && repair.helpers.length > 0) {
    console.log('[terminal:doctor] node-pty spawn-helper permissions already executable.');
  }

  if (!smoke) {
    return;
  }

  const result = await runPtySmokeTest();
  if (result.output) {
    console.log(result.output);
  }

  if (!result.success) {
    console.error(`[terminal:doctor] PTY smoke failed: ${result.error || 'unknown error'}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[terminal:doctor] PTY smoke passed for ${result.shell} in ${result.cwd}`);
}

await main();
