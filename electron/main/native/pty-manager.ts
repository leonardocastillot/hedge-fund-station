import { spawn, IPty } from 'node-pty';
import { app, BrowserWindow } from 'electron';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';
import type { TerminalCreateResult, TerminalSessionBackend, TerminalSnapshot, TerminalSmokeTestResult } from '../../types/ipc.types';
import { normalizeRuntimeCommandForShell, resolveTerminalShell } from '../../../src/utils/terminalShell';

const MAX_TERMINAL_BUFFER = 2_000_000;
const SMOKE_MARKER = 'HEDGE_STATION_PTY_OK';
const UNIX_PATH_PREFIX = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin'
];
const nodeRequire = createRequire(__filename);

interface TerminalRecord {
  pty: IPty;
  buffer: string;
  pendingData: string;
  flushTimer: NodeJS.Timeout | null;
  cwd: string;
  shell?: string;
  autoCommand?: string;
  sessionBackend: TerminalSessionBackend;
  screenSessionName?: string;
  screenLogPath?: string;
  cols: number;
  rows: number;
  exitCode?: number;
}

export class PTYManager {
  private terminals: Map<string, TerminalRecord> = new Map();
  private mainWindow: BrowserWindow | null = null;

  private getDataChannel(id: string): string {
    return `terminal:data:${id}`;
  }

  private getExitChannel(id: string): string {
    return `terminal:exit:${id}`;
  }

  private sendTerminalData(id: string, data: string): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    this.mainWindow.webContents.send(this.getDataChannel(id), { id, data });
  }

  private flushTerminalData(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal || !terminal.pendingData) {
      if (terminal) {
        terminal.flushTimer = null;
      }
      return;
    }

    const data = terminal.pendingData;
    terminal.pendingData = '';
    terminal.flushTimer = null;
    this.sendTerminalData(id, data);
  }

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  private getDefaultShell(): string {
    if (os.platform() === 'win32') {
      return process.env.COMSPEC || 'powershell.exe';
    }

    return process.env.SHELL || (os.platform() === 'darwin' ? '/bin/zsh' : '/bin/bash');
  }

  private getPathEnv(): string {
    const existing = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    return Array.from(new Set([...UNIX_PATH_PREFIX, ...existing])).join(path.delimiter);
  }

  private buildPtyEnv(cwd: string): { [key: string]: string } {
    const env: { [key: string]: string } = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') {
        env[key] = value;
      }
    }

    env.PATH = this.getPathEnv();
    env.PWD = cwd;
    env.TERM = 'xterm-256color';

    return env;
  }

  private validateCwd(cwd: string): string {
    const resolved = path.resolve(cwd || os.homedir());

    if (!fs.existsSync(resolved)) {
      throw new Error(`Terminal cwd does not exist: ${resolved}`);
    }

    if (!fs.statSync(resolved).isDirectory()) {
      throw new Error(`Terminal cwd is not a directory: ${resolved}`);
    }

    return resolved;
  }

  private getNodePtyHelperCandidates(): string[] {
    if (os.platform() === 'win32') {
      return [];
    }

    try {
      const nodePtyEntry = nodeRequire.resolve('node-pty');
      const nodePtyRoot = path.resolve(path.dirname(nodePtyEntry), '..');
      const platformArch = `${os.platform()}-${process.arch}`;
      const candidates = [
        path.join(nodePtyRoot, 'prebuilds', platformArch, 'spawn-helper'),
        path.join(nodePtyRoot, 'build', 'Release', 'spawn-helper')
      ];

      return candidates.map((candidate) => (
        candidate
          .replace('app.asar', 'app.asar.unpacked')
          .replace('node_modules.asar', 'node_modules.asar.unpacked')
      ));
    } catch {
      return [];
    }
  }

  private ensureNodePtyHelperExecutable(): void {
    if (os.platform() === 'win32') {
      return;
    }

    const helper = this.getNodePtyHelperCandidates().find((candidate) => fs.existsSync(candidate));

    if (!helper) {
      throw new Error('node-pty spawn-helper was not found. Run npm install, then npm run terminal:doctor.');
    }

    const stat = fs.statSync(helper);
    if ((stat.mode & 0o111) !== 0) {
      return;
    }

    try {
      fs.chmodSync(helper, stat.mode | 0o111);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`node-pty spawn-helper is not executable: ${helper}. Run npm run terminal:doctor. ${detail}`);
    }
  }

  private normalizeSpawnError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (/posix_spawnp/i.test(message)) {
      return new Error(`${message}. The node-pty helper may be missing execute permission; run npm run terminal:doctor and restart the Electron shell.`);
    }

    return new Error(message);
  }

  private appendToBuffer(id: string, chunk: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal || !chunk) {
      return;
    }

    terminal.buffer += chunk;
    if (terminal.buffer.length > MAX_TERMINAL_BUFFER) {
      terminal.buffer = terminal.buffer.slice(-MAX_TERMINAL_BUFFER);
    }
  }

  private getScreenBinary(): string | null {
    if (fs.existsSync('/usr/bin/screen')) {
      return '/usr/bin/screen';
    }

    const result = spawnSync('screen', ['-v'], { encoding: 'utf8' });
    return result.error ? null : 'screen';
  }

  private sanitizeScreenSessionName(value: string): string {
    const safe = value
      .trim()
      .replace(/[^A-Za-z0-9_.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96);

    return safe || `hedge-cli-${Date.now()}`;
  }

  private getDefaultScreenLogPath(sessionName: string): string {
    return path.join(
      app.getPath('userData'),
      'terminal-sessions',
      `${this.sanitizeScreenSessionName(sessionName)}.log`
    );
  }

  private screenSessionExists(sessionName: string): boolean {
    const screen = this.getScreenBinary();
    if (!screen) {
      return false;
    }

    const result = spawnSync(screen, ['-ls'], { encoding: 'utf8' });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    return output.split('\n').some((line) => line.includes(`.${sessionName}`) || line.includes(`\t${sessionName}`));
  }

  private runScreenCommand(sessionName: string, command: string, value?: string): void {
    const screen = this.getScreenBinary();
    if (!screen) {
      throw new Error('screen is not available. Install screen or use an ephemeral terminal.');
    }

    const args = ['-S', sessionName, '-X', command];
    if (value !== undefined) {
      args.push(value);
    }
    spawnSync(screen, args, { encoding: 'utf8' });
  }

  private readScreenLog(logPath?: string): string {
    if (!logPath || !fs.existsSync(logPath)) {
      return '';
    }

    try {
      const stat = fs.statSync(logPath);
      const start = Math.max(0, stat.size - MAX_TERMINAL_BUFFER);
      const fd = fs.openSync(logPath, 'r');
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      fs.closeSync(fd);
      return buffer.toString('utf8');
    } catch {
      return '';
    }
  }

  private getShellInitCommand(shellPath: string): string | null {
    const normalizedShell = shellPath.toLowerCase();

    if (normalizedShell.includes('powershell') || normalizedShell.endsWith('pwsh.exe') || normalizedShell === 'pwsh') {
      return '$Host.UI.RawUI.WindowTitle=(Get-Location).Path; function global:prompt { $loc=(Get-Location).Path; $Host.UI.RawUI.WindowTitle=$loc; "PS $loc$(\'>\' * ($nestedPromptLevel + 1)) " }';
    }

    if (normalizedShell.includes('cmd.exe') || normalizedShell === 'cmd') {
      return null;
    }

    if (normalizedShell.includes('zsh')) {
      return 'precmd() { printf "\\033]0;%s\\007" "$PWD"; }';
    }

    if (normalizedShell.includes('bash') || normalizedShell.includes('sh')) {
      return "export PROMPT_COMMAND='printf \"\\033]0;%s\\007\" \"$PWD\"'";
    }

    return null;
  }

  private initializeShellPrompt(id: string, ptyProcess: IPty, shellPath: string): void {
    const initCommand = this.getShellInitCommand(shellPath);
    if (!initCommand) {
      return;
    }

    setTimeout(() => {
      if (!this.terminals.has(id)) {
        return;
      }

      ptyProcess.write(`${initCommand}\r`);
    }, 150);
  }

  private getShellLaunch(shellPath: string): { file: string; args: string[] } {
    const normalizedShell = shellPath.toLowerCase();

    if (normalizedShell.includes('powershell') || normalizedShell.endsWith('pwsh.exe') || normalizedShell === 'pwsh') {
      return {
        file: shellPath,
        args: ['-NoLogo']
      };
    }

    if (normalizedShell.includes('cmd.exe') || normalizedShell === 'cmd') {
      return {
        file: shellPath,
        args: ['/Q']
      };
    }

    if (normalizedShell.includes('zsh') || normalizedShell.includes('bash')) {
      return {
        file: shellPath,
        args: ['-l']
      };
    }

    if (normalizedShell.includes('fish')) {
      return {
        file: shellPath,
        args: ['--login']
      };
    }

    return {
      file: shellPath,
      args: []
    };
  }

  createTerminal(
    id: string,
    cwd: string,
    shell?: string,
    autoCommand?: string,
    options: {
      sessionBackend?: TerminalSessionBackend;
      sessionName?: string;
      logPath?: string;
      attachExisting?: boolean;
    } = {}
  ): TerminalCreateResult {
    if (this.terminals.has(id)) {
      console.warn(`Terminal ${id} already exists`);
      const existing = this.terminals.get(id);
      return {
        success: true,
        shell: existing?.shell,
        cwd: existing?.cwd,
        normalizedShell: false,
        sessionBackend: existing?.sessionBackend,
        sessionName: existing?.screenSessionName,
        logPath: existing?.screenLogPath,
        attachedExisting: true,
        autoCommandDispatched: true
      };
    }

    if (options.sessionBackend === 'screen') {
      return this.createScreenTerminal(id, cwd, shell, autoCommand, options);
    }

    const shellResolution = resolveTerminalShell(shell, this.getDefaultShell(), os.platform());
    const shellPath = shellResolution.shell;
    const normalizedAutoCommand = normalizeRuntimeCommandForShell(autoCommand, shellPath);
    const launch = this.getShellLaunch(shellPath);

    try {
      this.ensureNodePtyHelperExecutable();
      const validatedCwd = this.validateCwd(cwd);

      const ptyProcess = spawn(launch.file, launch.args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: validatedCwd,
        env: this.buildPtyEnv(validatedCwd)
      });

      this.terminals.set(id, {
        pty: ptyProcess,
        buffer: '',
        pendingData: '',
        flushTimer: null,
        cwd: validatedCwd,
        shell: shellPath,
        autoCommand: normalizedAutoCommand,
        sessionBackend: 'pty',
        cols: 80,
        rows: 24
      });

      ptyProcess.onData((data: string) => {
        this.appendToBuffer(id, data);
        const terminal = this.terminals.get(id);
        if (!terminal) {
          return;
        }

        terminal.pendingData += data;
        if (!terminal.flushTimer) {
          terminal.flushTimer = setTimeout(() => this.flushTerminalData(id), 16);
        }
      });

      ptyProcess.onExit(({ exitCode }) => {
        const terminal = this.terminals.get(id);
        if (terminal) {
          if (terminal.flushTimer) {
            clearTimeout(terminal.flushTimer);
            terminal.flushTimer = null;
          }
          if (terminal.pendingData) {
            this.sendTerminalData(id, terminal.pendingData);
            terminal.pendingData = '';
          }
          terminal.exitCode = exitCode;
        }
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send(this.getExitChannel(id), { id, exitCode });
        }
      });

      console.log(`Terminal ${id} created with shell: ${shellPath} in ${validatedCwd}`);

      if (!normalizedAutoCommand) {
        this.initializeShellPrompt(id, ptyProcess, shellPath);
      }

      if (normalizedAutoCommand) {
        setTimeout(() => {
          if (!this.terminals.has(id)) {
            return;
          }
          ptyProcess.write(`${normalizedAutoCommand}\r`);
        }, 500);
      }

      return {
        success: true,
        shell: shellPath,
        cwd: validatedCwd,
        normalizedShell: shellResolution.normalizedShell,
        sessionBackend: 'pty',
        autoCommandDispatched: Boolean(normalizedAutoCommand)
      };
    } catch (error) {
      console.error(`Failed to create terminal ${id}:`, error);
      throw this.normalizeSpawnError(error);
    }
  }

  private createScreenTerminal(
    id: string,
    cwd: string,
    shell?: string,
    autoCommand?: string,
    options: {
      sessionName?: string;
      logPath?: string;
      attachExisting?: boolean;
    } = {}
  ): TerminalCreateResult {
    const screen = this.getScreenBinary();
    if (!screen) {
      throw new Error('Persistent CLI sessions require /usr/bin/screen, but screen was not found.');
    }

    const shellResolution = resolveTerminalShell(shell, this.getDefaultShell(), os.platform());
    const shellPath = shellResolution.shell;
    const normalizedAutoCommand = normalizeRuntimeCommandForShell(autoCommand, shellPath);
    const launch = this.getShellLaunch(shellPath);
    const validatedCwd = this.validateCwd(cwd);
    const sessionName = this.sanitizeScreenSessionName(options.sessionName || id);
    const logPath = options.logPath || this.getDefaultScreenLogPath(sessionName);
    const existed = this.screenSessionExists(sessionName);

    if (!existed) {
      if (options.attachExisting) {
        throw new Error(`Persistent screen session is not running: ${sessionName}`);
      }

      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      const start = spawnSync(screen, ['-dmS', sessionName, launch.file, ...launch.args], {
        cwd: validatedCwd,
        env: this.buildPtyEnv(validatedCwd),
        encoding: 'utf8'
      });

      if (start.status !== 0) {
        throw new Error(start.stderr || start.stdout || `Failed to start screen session ${sessionName}`);
      }

      this.runScreenCommand(sessionName, 'logfile', logPath);
      this.runScreenCommand(sessionName, 'log', 'on');

      if (normalizedAutoCommand) {
        setTimeout(() => {
          if (this.screenSessionExists(sessionName)) {
            this.runScreenCommand(sessionName, 'stuff', `${normalizedAutoCommand}\r`);
          }
        }, 600);
      } else {
        setTimeout(() => {
          if (this.screenSessionExists(sessionName)) {
            this.runScreenCommand(sessionName, 'stuff', 'printf "\\033]0;%s\\007" "$PWD"\r');
          }
        }, 250);
      }
    }

    const attachProcess = spawn(screen, ['-x', sessionName], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: validatedCwd,
      env: this.buildPtyEnv(validatedCwd)
    });

    const initialBuffer = this.readScreenLog(logPath).slice(-MAX_TERMINAL_BUFFER);
    this.terminals.set(id, {
      pty: attachProcess,
      buffer: initialBuffer,
      pendingData: '',
      flushTimer: null,
      cwd: validatedCwd,
      shell: shellPath,
      autoCommand: normalizedAutoCommand,
      sessionBackend: 'screen',
      screenSessionName: sessionName,
      screenLogPath: logPath,
      cols: 80,
      rows: 24
    });

    attachProcess.onData((data: string) => {
      this.appendToBuffer(id, data);
      const terminal = this.terminals.get(id);
      if (!terminal) {
        return;
      }

      terminal.pendingData += data;
      if (!terminal.flushTimer) {
        terminal.flushTimer = setTimeout(() => this.flushTerminalData(id), 16);
      }
    });

    attachProcess.onExit(({ exitCode }) => {
      const terminal = this.terminals.get(id);
      if (terminal) {
        if (terminal.flushTimer) {
          clearTimeout(terminal.flushTimer);
          terminal.flushTimer = null;
        }
        if (terminal.pendingData) {
          this.sendTerminalData(id, terminal.pendingData);
          terminal.pendingData = '';
        }
        terminal.exitCode = exitCode;
      }
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(this.getExitChannel(id), { id, exitCode });
      }
    });

    return {
      success: true,
      shell: shellPath,
      cwd: validatedCwd,
      normalizedShell: shellResolution.normalizedShell,
      sessionBackend: 'screen',
      sessionName,
      logPath,
      attachedExisting: existed,
      autoCommandDispatched: Boolean(normalizedAutoCommand && !existed)
    };
  }

  private getSmokeCommand(shellPath: string): string {
    const normalizedShell = shellPath.toLowerCase();

    if (normalizedShell.includes('powershell') || normalizedShell.endsWith('pwsh.exe') || normalizedShell === 'pwsh') {
      return `Write-Output ${SMOKE_MARKER}; Get-Location; exit\r`;
    }

    if (normalizedShell.includes('cmd.exe') || normalizedShell === 'cmd') {
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

  private stripAnsi(value: string): string {
    return value
      .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
      .replace(/\r/g, '');
  }

  async smokeTest(cwd: string, shell?: string): Promise<TerminalSmokeTestResult> {
    const shellPath = resolveTerminalShell(shell, this.getDefaultShell(), os.platform()).shell;

    try {
      this.ensureNodePtyHelperExecutable();
      const validatedCwd = this.validateCwd(cwd);
      const launch = this.getShellLaunch(shellPath);

      return await new Promise<TerminalSmokeTestResult>((resolve) => {
        let buffer = '';
        let settled = false;
        let ptyProcess: IPty | null = null;
        const timeout = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          if (ptyProcess) {
            try {
              ptyProcess.kill();
            } catch {
              // Ignore cleanup failures from an already-exited smoke PTY.
            }
          }
          resolve({
            success: false,
            shell: shellPath,
            cwd: validatedCwd,
            output: this.stripAnsi(buffer).trim(),
            error: 'PTY smoke test timed out before the shell responded.'
          });
        }, 7000);

        try {
          ptyProcess = spawn(launch.file, launch.args, {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: validatedCwd,
            env: this.buildPtyEnv(validatedCwd)
          });
        } catch (error) {
          clearTimeout(timeout);
          settled = true;
          const normalized = this.normalizeSpawnError(error);
          resolve({
            success: false,
            shell: shellPath,
            cwd: validatedCwd,
            output: '',
            error: normalized.message
          });
          return;
        }

        ptyProcess.onData((data: string) => {
          buffer += data;
        });

        ptyProcess.onExit(({ exitCode }) => {
          if (settled) {
            return;
          }
          clearTimeout(timeout);
          settled = true;
          const output = this.stripAnsi(buffer).trim();
          const hasMarker = output.includes(SMOKE_MARKER);
          resolve({
            success: exitCode === 0 && hasMarker,
            shell: shellPath,
            cwd: validatedCwd,
            output,
            error: exitCode === 0 && hasMarker
              ? undefined
              : hasMarker
                ? `PTY smoke command exited with code ${exitCode}.`
                : `PTY exited without ${SMOKE_MARKER}.`
          });
        });

        setTimeout(() => {
          ptyProcess?.write(this.getSmokeCommand(shellPath));
        }, 100);
      });
    } catch (error) {
      const normalized = this.normalizeSpawnError(error);
      return {
        success: false,
        shell: shellPath,
        cwd: path.resolve(cwd || os.homedir()),
        output: '',
        error: normalized.message
      };
    }
  }

  writeToTerminal(id: string, data: string): void {
    const terminalRecord = this.terminals.get(id);
    if (!terminalRecord) {
      console.warn(`Terminal ${id} not found`);
      return;
    }

    try {
      terminalRecord.pty.write(data);
    } catch (error) {
      console.error(`Failed to write to terminal ${id}:`, error);
    }
  }

  resizeTerminal(id: string, cols: number, rows: number): void {
    const terminalRecord = this.terminals.get(id);
    if (!terminalRecord) {
      console.warn(`Terminal ${id} not found`);
      return;
    }

    try {
      terminalRecord.cols = cols;
      terminalRecord.rows = rows;
      terminalRecord.pty.resize(cols, rows);
    } catch (error) {
      console.error(`Failed to resize terminal ${id}:`, error);
    }
  }

  killTerminal(id: string): void {
    const terminalRecord = this.terminals.get(id);
    if (!terminalRecord) {
      console.warn(`Terminal ${id} not found`);
      return;
    }

    try {
      if (terminalRecord.flushTimer) {
        clearTimeout(terminalRecord.flushTimer);
      }
      terminalRecord.pty.kill();
      this.terminals.delete(id);
    } catch (error) {
      console.error(`Failed to kill terminal ${id}:`, error);
    }
  }

  stopTerminalSession(id: string, sessionName?: string): void {
    const terminalRecord = this.terminals.get(id);
    const targetSessionName = sessionName || terminalRecord?.screenSessionName;
    if (!targetSessionName) {
      this.killTerminal(id);
      return;
    }

    this.runScreenCommand(targetSessionName, 'quit');
    if (terminalRecord) {
      try {
        if (terminalRecord.flushTimer) {
          clearTimeout(terminalRecord.flushTimer);
        }
        terminalRecord.pty.kill();
      } catch {
        // The screen client may already have exited after the session quit.
      }
      this.terminals.delete(id);
    }
  }

  killAllTerminals(): void {
    for (const [id, terminal] of this.terminals) {
      try {
        if (terminal.flushTimer) {
          clearTimeout(terminal.flushTimer);
        }
        terminal.pty.kill();
      } catch (error) {
        console.error(`Failed to kill terminal ${id}:`, error);
      }
    }
    this.terminals.clear();
  }

  terminalExists(id: string): boolean {
    return this.terminals.has(id);
  }

  getAllTerminalIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  getTerminalSnapshot(id: string): TerminalSnapshot | null {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return null;
    }

    const screenLog = terminal.sessionBackend === 'screen'
      ? this.readScreenLog(terminal.screenLogPath)
      : '';

    return {
      id,
      buffer: screenLog || terminal.buffer,
      cwd: terminal.cwd,
      shell: terminal.shell,
      autoCommand: terminal.autoCommand,
      sessionBackend: terminal.sessionBackend,
      sessionName: terminal.screenSessionName,
      logPath: terminal.screenLogPath,
      cols: terminal.cols,
      rows: terminal.rows,
      exitCode: terminal.exitCode
    };
  }
}
