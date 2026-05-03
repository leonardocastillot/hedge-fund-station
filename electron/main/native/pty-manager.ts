import { spawn, IPty } from 'node-pty';
import { BrowserWindow } from 'electron';
import * as os from 'os';
import type { TerminalSnapshot } from '../../types/ipc.types';

const MAX_TERMINAL_BUFFER = 200_000;

interface TerminalRecord {
  pty: IPty;
  buffer: string;
  pendingData: string;
  flushTimer: NodeJS.Timeout | null;
  cwd: string;
  shell?: string;
  autoCommand?: string;
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

  private getShellInitCommand(shellPath: string): string | null {
    const normalizedShell = shellPath.toLowerCase();

    if (normalizedShell.includes('powershell') || normalizedShell.endsWith('pwsh.exe') || normalizedShell === 'pwsh') {
      return '$Host.UI.RawUI.WindowTitle=(Get-Location).Path; function global:prompt { $loc=(Get-Location).Path; $Host.UI.RawUI.WindowTitle=$loc; "PS $loc$(\'>\' * ($nestedPromptLevel + 1)) " }';
    }

    if (normalizedShell.includes('cmd.exe') || normalizedShell === 'cmd') {
      return null;
    }

    if (normalizedShell.includes('bash') || normalizedShell.includes('zsh') || normalizedShell.includes('sh')) {
      return "PROMPT_COMMAND='printf \"\\033]0;%s\\007\" \"$PWD\"'";
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

    return {
      file: shellPath,
      args: []
    };
  }

  createTerminal(id: string, cwd: string, shell?: string, autoCommand?: string): void {
    if (this.terminals.has(id)) {
      console.warn(`Terminal ${id} already exists`);
      return;
    }

    // Determine shell
    const defaultShell = os.platform() === 'win32'
      ? process.env.COMSPEC || 'powershell.exe'
      : process.env.SHELL || '/bin/bash';

    const shellPath = shell || defaultShell;
    const launch = this.getShellLaunch(shellPath);

    try {
      // Spawn PTY
      const ptyProcess = spawn(launch.file, launch.args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: cwd,
        env: process.env as { [key: string]: string }
      });

      // Store terminal
      this.terminals.set(id, {
        pty: ptyProcess,
        buffer: '',
        pendingData: '',
        flushTimer: null,
        cwd,
        shell: shellPath,
        autoCommand,
        cols: 80,
        rows: 24
      });

      // Forward data to renderer
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

      // Handle exit
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

      console.log(`Terminal ${id} created with shell: ${shellPath} in ${cwd}`);

      if (!autoCommand) {
        this.initializeShellPrompt(id, ptyProcess, shellPath);
      }

      // Auto-execute command if provided (after a small delay to ensure terminal is ready)
      if (autoCommand) {
        setTimeout(() => {
          if (!this.terminals.has(id)) {
            return;
          }
          ptyProcess.write(`${autoCommand}\r`);
        }, 500); // 500ms delay to ensure terminal is ready
      }
    } catch (error) {
      console.error(`Failed to create terminal ${id}:`, error);
      throw error;
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

    return {
      id,
      buffer: terminal.buffer,
      cwd: terminal.cwd,
      shell: terminal.shell,
      autoCommand: terminal.autoCommand,
      cols: terminal.cols,
      rows: terminal.rows,
      exitCode: terminal.exitCode
    };
  }
}
