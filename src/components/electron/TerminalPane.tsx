import React, { memo, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from '../../hooks/useTerminal';
import { TerminalColor } from '@/contexts/TerminalContext';
import type { TerminalRuntimeState } from '@/contexts/TerminalContext';
import type { TerminalPtyState } from '@/contexts/TerminalContext';
import type { AgentProvider } from '../../types/agents';
import { COLOR_SCHEMES } from './TerminalColorSchemes';
import { loadAppSettings } from '../../utils/appSettings';

function normalizeTerminalTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    return '';
  }

  const windowsPathMatch = trimmed.match(/[A-Za-z]:\\[^|]+/);
  if (windowsPathMatch) {
    return windowsPathMatch[0].trim();
  }

  const unixPathMatch = trimmed.match(/\/[^\]|]+/);
  if (unixPathMatch) {
    return unixPathMatch[0].trim();
  }

  return trimmed;
}

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\r/g, '');
}

function getNormalizedLines(value: string): string[] {
  return stripAnsi(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isApprovalPrompt(value: string): boolean {
  return /(approve|approval|allow|continue\?|confirm|trust|permission|y\/n|\[y\/n\]|\[y\/N\]|\[Y\/n\]|yes\/no)/i.test(value);
}

function isRuntimeFailure(value: string): boolean {
  return /(not recognized|command not found|no se puede cargar el archivo|execution of scripts is disabled|unauthorizedaccess|not found|no such file|cannot find)/i.test(value);
}

function isLikelyShellPrompt(value: string): boolean {
  return getNormalizedLines(value).slice(-5).some((line) => (
    /^PS [A-Za-z]:\\.+>\s*$/.test(line)
    || /^[A-Za-z]:\\.+>\s*$/.test(line)
    || /^Microsoft PowerShell/i.test(line)
    || /^PowerShell \d/i.test(line)
    || isLikelyUnixShellPromptLine(line)
  ));
}

function isLikelyUnixShellPromptLine(line: string): boolean {
  if (line.length > 180) {
    return false;
  }

  return /^➜\s+/.test(line)
    || /^[\w.-]+@[\w.-]+(?:\s|:).+[%$#]\s*$/.test(line)
    || /(?:^|[\s:])(?:~|\/|\.{1,2}\/)[^\n]*[%$#]\s*$/.test(line)
    || /(?:^|\s)git:\([^)]+\).*(?:[%$#]|[✗*+])\s*$/.test(line)
    || /^(?:bash|zsh|sh|fish)(?:[-\w. ]*)?[%$#>]\s*$/.test(line)
    || /^[%$#>]\s*$/.test(line);
}

function isLikelyCommandEcho(value: string, command?: string): boolean {
  if (!command?.trim()) {
    return false;
  }

  const normalizedCommand = command.trim().toLowerCase();
  return getNormalizedLines(value).every((line) => line.toLowerCase() === normalizedCommand);
}

interface TerminalPaneProps {
  id: string;
  cwd: string;
  shell?: string;
  label?: string;
  color?: TerminalColor;
  rainbowEffect?: boolean;
  autoCommand?: string;
  missionPrompt?: string;
  currentCommand?: string;
  runtimeProvider?: AgentProvider;
  runtimeState?: TerminalRuntimeState;
  runtimeDetail?: string;
  runtimeAttempts?: number;
  ptyState?: TerminalPtyState;
  ptyDetail?: string;
  onClose?: () => void;
  onTitleChange?: (title: string) => void;
  onLabelChange?: (label: string) => void;
  onColorChange?: (color: TerminalColor) => void;
  onToggleRainbow?: () => void;
  onRuntimeStateChange?: (state: TerminalRuntimeState, detail?: string) => void;
  onActivity?: () => void;
  onRuntimeRetry?: (detail?: string) => void;
  onOpenDiagnostics?: () => void;
  isActive?: boolean;
}

const TerminalPaneComponent: React.FC<TerminalPaneProps> = ({
  id,
  cwd,
  label = 'Terminal',
  color = 'red',
  rainbowEffect = false,
  autoCommand,
  missionPrompt,
  currentCommand,
  runtimeProvider,
  runtimeState = 'shell',
  runtimeDetail,
  runtimeAttempts = 0,
  ptyState = 'creating',
  ptyDetail,
  onClose,
  onTitleChange,
  onLabelChange,
  onColorChange,
  onToggleRainbow,
  onRuntimeStateChange,
  onActivity,
  onRuntimeRetry,
  onOpenDiagnostics,
  isActive = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const hasExitedRef = useRef(false);
  const onTitleChangeRef = useRef(onTitleChange);
  const resizeTimeoutRef = useRef<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasExited, setHasExited] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editLabel, setEditLabel] = useState(label);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef(loadAppSettings());
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const runtimeMonitorRef = useRef<{ armedAt: number; resolved: boolean; timeoutId: number | null }>({
    armedAt: 0,
    resolved: false,
    timeoutId: null
  });
  const runtimeIdleTimerRef = useRef<number | null>(null);
  const bootFallbackTimerRef = useRef<number | null>(null);
  const missionResponseTimerRef = useRef<number | null>(null);
  const autoRetryRef = useRef(false);
  const missionDispatchRef = useRef(false);
  const approvalPendingRef = useRef(false);
  const sawRuntimeOutputRef = useRef(false);
  const sawShellPromptRef = useRef(false);
  const outputQueueRef = useRef('');
  const outputFrameRef = useRef<number | null>(null);
  const runtimeStateCacheRef = useRef<{ state?: TerminalRuntimeState; detail?: string; updatedAt: number }>({
    updatedAt: 0
  });

  // Get color scheme
  const colorScheme = COLOR_SCHEMES[color];

  useEffect(() => {
    hasExitedRef.current = hasExited;
  }, [hasExited]);

  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);

  useEffect(() => {
    return () => {
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
      }
      if (runtimeMonitorRef.current.timeoutId !== null) {
        window.clearTimeout(runtimeMonitorRef.current.timeoutId);
      }
      if (runtimeIdleTimerRef.current !== null) {
        window.clearTimeout(runtimeIdleTimerRef.current);
      }
      if (bootFallbackTimerRef.current !== null) {
        window.clearTimeout(bootFallbackTimerRef.current);
      }
      if (missionResponseTimerRef.current !== null) {
        window.clearTimeout(missionResponseTimerRef.current);
      }
      if (outputFrameRef.current !== null) {
        window.cancelAnimationFrame(outputFrameRef.current);
      }
    };
  }, []);

  const resolveRuntimeState = React.useCallback((state: TerminalRuntimeState, detail?: string) => {
    if (!runtimeProvider || !onRuntimeStateChange) {
      return;
    }

    const previous = runtimeStateCacheRef.current;
    const now = Date.now();
    const normalizedDetail = detail?.trim();
    const shouldSuppress =
      previous.state === state
      && previous.detail === normalizedDetail
      && now - previous.updatedAt < 1200;

    if (shouldSuppress) {
      return;
    }

    runtimeStateCacheRef.current = {
      state,
      detail: normalizedDetail,
      updatedAt: now
    };

    if (runtimeMonitorRef.current.timeoutId !== null) {
      window.clearTimeout(runtimeMonitorRef.current.timeoutId);
      runtimeMonitorRef.current.timeoutId = null;
    }
    if (runtimeIdleTimerRef.current !== null) {
      window.clearTimeout(runtimeIdleTimerRef.current);
      runtimeIdleTimerRef.current = null;
    }
    if (bootFallbackTimerRef.current !== null) {
      window.clearTimeout(bootFallbackTimerRef.current);
      bootFallbackTimerRef.current = null;
    }
    if (missionResponseTimerRef.current !== null) {
      window.clearTimeout(missionResponseTimerRef.current);
      missionResponseTimerRef.current = null;
    }

    runtimeMonitorRef.current.resolved = state === 'completed' || state === 'failed';
    onRuntimeStateChange(state, detail);
  }, [onRuntimeStateChange, runtimeProvider]);

  const dispatchMissionPrompt = React.useCallback(() => {
    if (!runtimeProvider || !missionPrompt || missionDispatchRef.current || approvalPendingRef.current) {
      return;
    }

    missionDispatchRef.current = true;
    resolveRuntimeState('waiting-response', 'Mission prompt dispatched');
    window.electronAPI.terminal.write(id, missionPrompt);
    if (missionResponseTimerRef.current !== null) {
      window.clearTimeout(missionResponseTimerRef.current);
    }
    missionResponseTimerRef.current = window.setTimeout(() => {
      if (missionDispatchRef.current && !approvalPendingRef.current) {
        resolveRuntimeState('stalled', 'Mission sent but the runtime has not produced output yet');
      }
      missionResponseTimerRef.current = null;
    }, 20000);
    window.setTimeout(() => {
      window.electronAPI.terminal.write(id, '\r');
    }, 80);
  }, [id, missionPrompt, resolveRuntimeState, runtimeProvider]);

  const startRuntimeAttempt = React.useCallback((detail: string) => {
    if (!runtimeProvider || !autoCommand || !onRuntimeStateChange) {
      return;
    }

    missionDispatchRef.current = false;
    approvalPendingRef.current = false;
    sawRuntimeOutputRef.current = false;
    sawShellPromptRef.current = false;

    if (runtimeMonitorRef.current.timeoutId !== null) {
      window.clearTimeout(runtimeMonitorRef.current.timeoutId);
    }
    if (runtimeIdleTimerRef.current !== null) {
      window.clearTimeout(runtimeIdleTimerRef.current);
    }
    if (bootFallbackTimerRef.current !== null) {
      window.clearTimeout(bootFallbackTimerRef.current);
    }
    if (missionResponseTimerRef.current !== null) {
      window.clearTimeout(missionResponseTimerRef.current);
      missionResponseTimerRef.current = null;
    }

    runtimeMonitorRef.current = {
      armedAt: Date.now(),
      resolved: false,
      timeoutId: null
    };

    onRuntimeStateChange('launching', detail);

    bootFallbackTimerRef.current = window.setTimeout(() => {
      if (!approvalPendingRef.current && !missionDispatchRef.current && sawRuntimeOutputRef.current && !sawShellPromptRef.current) {
        resolveRuntimeState('ready', `Runtime opened for ${autoCommand}`);
        dispatchMissionPrompt();
      } else if (!approvalPendingRef.current && !missionDispatchRef.current && !sawRuntimeOutputRef.current) {
        resolveRuntimeState('stalled', `Waiting for ${autoCommand} to confirm runtime handoff`);
      }
      bootFallbackTimerRef.current = null;
    }, 8000);
  }, [autoCommand, dispatchMissionPrompt, onRuntimeStateChange, resolveRuntimeState, runtimeProvider]);

  const triggerAutoRetry = React.useCallback((reason: string) => {
    if (!runtimeProvider || !autoCommand || !onRuntimeRetry || autoRetryRef.current || runtimeAttempts >= 2) {
      return;
    }

    autoRetryRef.current = true;
    onRuntimeRetry(`Auto-retrying ${autoCommand}: ${reason}`);

    window.setTimeout(() => {
      startRuntimeAttempt(`Retrying ${autoCommand}`);
      window.electronAPI.terminal.write(id, `${autoCommand}\r`);
    }, 450);
  }, [autoCommand, id, onRuntimeRetry, runtimeAttempts, runtimeProvider, startRuntimeAttempt]);

  const armRuntimeMonitor = React.useCallback(() => {
    startRuntimeAttempt(`Launching ${autoCommand}`);
  }, [autoCommand, startRuntimeAttempt]);

  const queueTerminalWrite = React.useCallback((data: string) => {
    outputQueueRef.current += data;

    if (outputFrameRef.current !== null) {
      return;
    }

    outputFrameRef.current = window.requestAnimationFrame(() => {
      outputFrameRef.current = null;
      if (!terminalRef.current || !outputQueueRef.current) {
        outputQueueRef.current = '';
        return;
      }

      terminalRef.current.write(outputQueueRef.current);
      outputQueueRef.current = '';
    });
  }, []);

  const inspectRuntimeOutput = React.useCallback((data: string) => {
    if (!runtimeProvider || !autoCommand) {
      return;
    }

    const normalized = stripAnsi(data).trim();

    if (!normalized) {
      return;
    }

    if (isRuntimeFailure(normalized)) {
      resolveRuntimeState('failed', normalized.slice(0, 180));
      triggerAutoRetry(normalized.slice(0, 120));
      return;
    }

    if (isLikelyCommandEcho(normalized, autoCommand)) {
      return;
    }

    if (isLikelyShellPrompt(normalized)) {
      sawShellPromptRef.current = true;

      if (!missionDispatchRef.current && Date.now() - runtimeMonitorRef.current.armedAt > 1500) {
        resolveRuntimeState('failed', 'Runtime returned control to the shell before accepting the mission');
        triggerAutoRetry('runtime returned to shell prompt');
      }
      return;
    }

    if (isApprovalPrompt(normalized)) {
      approvalPendingRef.current = true;
      resolveRuntimeState('awaiting-approval', normalized.slice(0, 180));
      return;
    }

    if (approvalPendingRef.current) {
      return;
    }

    if (runtimeIdleTimerRef.current !== null) {
      window.clearTimeout(runtimeIdleTimerRef.current);
    }
    if (missionResponseTimerRef.current !== null) {
      window.clearTimeout(missionResponseTimerRef.current);
      missionResponseTimerRef.current = null;
    }

    sawRuntimeOutputRef.current = true;

    if (!missionDispatchRef.current) {
      if (!missionPrompt) {
        resolveRuntimeState('ready', normalized.slice(0, 180));
      } else {
        resolveRuntimeState('handoff', 'Runtime handshake detected, dispatching mission');
      }
      runtimeIdleTimerRef.current = window.setTimeout(() => {
        if (!approvalPendingRef.current && !missionDispatchRef.current) {
          dispatchMissionPrompt();
        }
        runtimeIdleTimerRef.current = null;
      }, missionPrompt ? 1200 : 900);
      return;
    }

    resolveRuntimeState('running', normalized.slice(0, 180));
  }, [autoCommand, dispatchMissionPrompt, missionPrompt, resolveRuntimeState, runtimeProvider, triggerAutoRetry]);

  // Terminal communication hook
  const { write, resize, getSnapshot } = useTerminal(id, {
    onData: (data) => {
      onActivity?.();
      inspectRuntimeOutput(data);
      queueTerminalWrite(data);
    },
    onExit: (exitCode) => {
      setHasExited(true);

      if (runtimeProvider) {
        if (exitCode === 0) {
          resolveRuntimeState('completed', 'Process exited successfully');
        } else {
          resolveRuntimeState('failed', `Process exited with code ${exitCode}`);
          triggerAutoRetry(`process exited with code ${exitCode}`);
        }
      }

      queueTerminalWrite(`\r\n\r\n[Process exited with code ${exitCode}]\r\n`);
    }
  });

  const handleManualRuntimeRetry = React.useCallback(() => {
    if (!runtimeProvider || !autoCommand || hasExitedRef.current) {
      return;
    }

    autoRetryRef.current = false;
    missionDispatchRef.current = false;
    approvalPendingRef.current = false;
    onRuntimeRetry?.(`Manual retrying ${autoCommand}`);

    window.setTimeout(() => {
      startRuntimeAttempt(`Retrying ${autoCommand}`);
      write(`${autoCommand}\r`);
    }, 120);
  }, [autoCommand, onRuntimeRetry, runtimeProvider, startRuntimeAttempt, write]);

  useEffect(() => {
    if (runtimeAttempts <= 1) {
      autoRetryRef.current = false;
    }
  }, [runtimeAttempts]);

  // Initialize xterm once for this PTY. Runtime and PTY status props can change
  // often, so this effect must not depend on those values or typing will remount
  // the terminal surface.
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    // Use conservative terminal settings for CLI stability.
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: Math.max(10, Math.min(settingsRef.current.fontSize, 18)),
      fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
      fontWeight: '400',
      fontWeightBold: '700',
      letterSpacing: 0,
      lineHeight: 1.2,
      theme: {
        background: '#05070b',
        foreground: '#e5e7eb',
        cursor: '#ef4444',
        cursorAccent: '#05070b',
        selectionBackground: '#ef444480',
        selectionForeground: '#ffffff',
        black: '#2e3440',
        red: '#ff6b6b',
        green: '#51cf66',
        yellow: '#ffd93d',
        blue: '#74c0fc',
        magenta: '#d0bfff',
        cyan: '#66d9ef',
        white: '#e5e7eb',
        // Bright colors - neon-like
        brightBlack: '#6c7a89',
        brightRed: '#ff8787',
        brightGreen: '#69db7c',
        brightYellow: '#ffe066',
        brightBlue: '#91d7ff',
        brightMagenta: '#e599f7',
        brightCyan: '#7fdbff',
        brightWhite: '#ffffff'
      },
      scrollback: Math.max(200, Math.min(settingsRef.current.scrollbackLines, 5000)),
      allowProposedApi: false,
      allowTransparency: false,
      customGlyphs: true,
      smoothScrollDuration: 0
    });

    // Create fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in container
    terminal.open(containerRef.current);

    // Fit terminal to container
    fitAddon.fit();

    // CRITICAL: Focus terminal immediately
    if (isActive) {
      terminal.focus();
    }

    // Handle user input
    terminal.onData((data) => {
      if (!hasExitedRef.current) {
        if (approvalPendingRef.current) {
          approvalPendingRef.current = false;
          resolveRuntimeState('launching', 'Approval submitted, waiting for runtime response');
        }
        write(data);
      }
    });

    // Handle title changes
    terminal.onTitleChange((title) => {
      if (!runtimeProvider && onTitleChangeRef.current) {
        onTitleChangeRef.current(normalizeTerminalTitle(title));
      }
    });

    // Store refs
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    void getSnapshot().then((snapshot) => {
      if (!snapshot || terminalRef.current !== terminal) {
        return;
      }

      if (snapshot.buffer) {
        terminal.write(snapshot.buffer);
      }

      if (typeof snapshot.exitCode === 'number') {
        setHasExited(true);
      }
    }).catch(() => undefined);

    if (runtimeProvider && autoCommand) {
      armRuntimeMonitor();
    }
    setIsInitialized(true);

    // Cleanup - CRITICAL: NO matar PTY durante hot reload
    return () => {
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      // NO llamar kill() aquí - los PTY deben sobrevivir hot reload
      // Solo se matan cuando el usuario cierra explícitamente (ver onClose)
    };
  }, [id, write, getSnapshot]);

  // Handle resize
  useEffect(() => {
    if (!fitAddonRef.current || !terminalRef.current || !isInitialized) return;

    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalRef.current;
        const lastSize = lastSizeRef.current;
        if (lastSize?.cols === cols && lastSize?.rows === rows) {
          return;
        }

        lastSizeRef.current = { cols, rows };
        resize(cols, rows);
      }
    };

    const scheduleResize = () => {
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
      }

      resizeTimeoutRef.current = window.setTimeout(() => {
        resizeTimeoutRef.current = null;
        handleResize();
      }, 75);
    };

    // Initial resize
    handleResize();

    // Listen for window resize
    const resizeObserver = new ResizeObserver(() => {
      scheduleResize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      resizeObserver.disconnect();
    };
  }, [isInitialized, resize]);

  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  // Focus label input when editing starts
  useEffect(() => {
    if (isEditingLabel && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [isEditingLabel]);

  // Close color picker when clicking outside
  useEffect(() => {
    if (!showColorPicker) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-color-picker]')) {
        setShowColorPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker]);

  // Handle label editing
  const handleLabelDoubleClick = () => {
    setIsEditingLabel(true);
    setEditLabel(label);
  };

  const handleLabelSave = () => {
    const newLabel = editLabel.trim();
    if (newLabel && newLabel !== label && onLabelChange) {
      onLabelChange(newLabel);
    }
    setIsEditingLabel(false);
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleLabelSave();
    } else if (e.key === 'Escape') {
      setIsEditingLabel(false);
      setEditLabel(label);
    }
  };

  const hasRuntimeAttention = Boolean(runtimeProvider && (runtimeState === 'failed' || runtimeState === 'stalled'));
  const statusDetail = ptyState !== 'ready' ? (ptyDetail || runtimeDetail) : runtimeDetail;
  const shouldShowStatusFooter = Boolean(
    hasRuntimeAttention
    || (runtimeProvider && runtimeDetail && !hasExited)
    || (!hasExited && ptyDetail && ptyState !== 'ready')
  );
  const footerButtonStyle: React.CSSProperties = {
    height: '22px',
    padding: '2px 8px',
    borderRadius: '5px',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(15, 23, 42, 0.92)',
    color: '#cbd5e1',
    fontSize: '10px',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--app-terminal-bg)',
      border: isActive
        ? `1.5px solid ${colorScheme.primary}`
        : `1px solid ${colorScheme.border}`,
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: isActive
        ? `0 0 20px ${colorScheme.glow}25`
        : colorScheme.shadow,
      position: 'relative',
      zIndex: isActive ? 100 : 1,
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      // Remove transform scale which causes blurriness
      transform: 'none'
    }}>
      {/* Rainbow Effect - manual only to avoid constant GPU work */}
      {rainbowEffect && (
        <>
          <div style={{
            position: 'absolute',
            inset: '-100%',
            width: '300%',
            height: '300%',
            background: `
              conic-gradient(
                from 0deg,
                transparent,
                rgba(239, 68, 68, 0.015),
                rgba(249, 115, 22, 0.015),
                rgba(234, 179, 8, 0.015),
                rgba(16, 185, 129, 0.015),
                rgba(6, 182, 212, 0.015),
                rgba(59, 130, 246, 0.015),
                rgba(168, 85, 247, 0.015),
                rgba(236, 72, 153, 0.015),
                rgba(239, 68, 68, 0.015),
                transparent
              )
            `,
            pointerEvents: 'none',
            zIndex: 5,
            animation: 'rainbowRotate 16s linear infinite',
            filter: 'blur(56px)',
            opacity: 0.55,
            mixBlendMode: 'screen',
            transformOrigin: '50% 50%'
          }} />

          <div style={{
            position: 'absolute',
            inset: '-1px',
            borderRadius: '13px',
            background: `
              linear-gradient(
                90deg,
                #ef4444,
                #f97316,
                #eab308,
                #10b981,
                #06b6d4,
                #3b82f6,
                #a855f7,
                #ec4899,
                #ef4444
              )
            `,
            backgroundSize: '400% 100%',
            pointerEvents: 'none',
            zIndex: 4,
            animation: 'borderFlow 8s linear infinite',
            filter: 'blur(4px)',
            opacity: 0.12
          }} />
        </>
      )}

      <style>
        {`
          @keyframes rainbowRotate {
            0% {
              transform: translate(-50%, -50%) rotate(0deg);
            }
            100% {
              transform: translate(-50%, -50%) rotate(360deg);
            }
          }

          @keyframes borderFlow {
            0% {
              background-position: 0% 50%;
            }
            100% {
              background-position: 400% 50%;
            }
          }
        `}
      </style>

      {/* Terminal header - ultra compact */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 10px',
        background: isActive
          ? 'var(--app-surface-raised)'
          : 'var(--app-surface)',
        borderBottom: isActive ? '1px solid var(--app-border-strong)' : '1px solid var(--app-terminal-border)',
        fontSize: '10px',
        color: isActive ? 'var(--app-text)' : 'var(--app-muted)',
        fontWeight: isActive ? '700' : '500',
        position: 'relative',
        zIndex: 10,
        boxShadow: isActive ? '0 2px 10px var(--app-glow)' : 'inset 0 1px 1px rgba(255, 255, 255, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          {/* Color Picker Button */}
          <div style={{ position: 'relative', zIndex: 2000 }} data-color-picker>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowColorPicker(!showColorPicker);
              }}
              style={{
                background: colorScheme.badge,
                border: `1px solid ${colorScheme.badgeBorder}`,
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease',
                boxShadow: `0 0 10px ${colorScheme.glow}`,
                position: 'relative',
                zIndex: 2001
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colorScheme.primary + '40';
                e.currentTarget.style.borderColor = colorScheme.borderActive;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = colorScheme.badge;
                e.currentTarget.style.borderColor = colorScheme.badgeBorder;
              }}
              title="Change terminal color"
            >
              <span>{colorScheme.icon}</span>
            </button>

            {/* Color Picker Dropdown */}
            {showColorPicker && (
              <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(0, 0, 0, 0.95)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                padding: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '12px',
                zIndex: 99999,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
              }}>
                {Object.entries(COLOR_SCHEMES).map(([colorKey, scheme]) => (
                  <button
                    key={colorKey}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onColorChange) {
                        onColorChange(colorKey as TerminalColor);
                      }
                      setShowColorPicker(false);
                    }}
                    style={{
                      background: scheme.badge,
                      border: `2px solid ${color === colorKey ? scheme.primary : scheme.badgeBorder}`,
                      borderRadius: '8px',
                      padding: '12px',
                      cursor: 'pointer',
                      fontSize: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                      boxShadow: color === colorKey ? `0 0 20px ${scheme.glow}` : 'none'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.15)';
                      e.currentTarget.style.boxShadow = `0 0 20px ${scheme.glow}`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = color === colorKey ? `0 0 20px ${scheme.glow}` : 'none';
                    }}
                    title={scheme.name}
                  >
                    {scheme.icon}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Rainbow Effect Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleRainbow) onToggleRainbow();
            }}
            style={{
              background: rainbowEffect ? 'linear-gradient(90deg, #ef4444, #f97316, #eab308, #10b981, #06b6d4, #3b82f6, #a855f7, #ec4899)' : 'rgba(100, 100, 100, 0.2)',
              backgroundSize: '400% 100%',
              animation: rainbowEffect ? 'borderFlow 3s linear infinite' : 'none',
              border: `1px solid ${rainbowEffect ? 'rgba(255, 255, 255, 0.3)' : 'rgba(100, 100, 100, 0.3)'}`,
              borderRadius: '6px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease',
              color: rainbowEffect ? '#fff' : '#888',
              fontWeight: '600',
              boxShadow: rainbowEffect ? '0 0 15px rgba(255, 255, 255, 0.3)' : 'none',
              opacity: isActive && !rainbowEffect ? 0.7 : 1
            }}
            onMouseEnter={(e) => {
              if (!rainbowEffect && !isActive) {
                e.currentTarget.style.background = 'rgba(100, 100, 100, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (!rainbowEffect && !isActive) {
                e.currentTarget.style.background = 'rgba(100, 100, 100, 0.2)';
              }
            }}
            title={isActive ? "Rainbow active (In Use)" : (rainbowEffect ? "Disable rainbow effect" : "Enable rainbow effect")}
          >
            <span>*</span>
          </button>

          {/* Editable Label */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: 0,
            flex: 1
          }}>
            {isEditingLabel ? (
              <input
                ref={labelInputRef}
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onBlur={handleLabelSave}
                onKeyDown={handleLabelKeyDown}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  color: '#ffffff',
                  fontWeight: '600',
                  outline: 'none',
                  minWidth: '100px',
                  maxWidth: '200px'
                }}
              />
            ) : (
              <span
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleLabelDoubleClick();
                }}
                style={{
                  fontSize: '11px',
                  color: colorScheme.primary,
                  fontWeight: '700',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: colorScheme.badge,
                  border: `1px solid ${colorScheme.badgeBorder}`,
                  transition: 'all 0.15s ease',
                  userSelect: 'none',
                  boxShadow: `0 0 8px ${colorScheme.glow}`,
                  textShadow: `0 0 10px ${colorScheme.glow}`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colorScheme.primary + '40';
                  e.currentTarget.style.borderColor = colorScheme.borderActive;
                  e.currentTarget.style.boxShadow = `0 0 15px ${colorScheme.glow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colorScheme.badge;
                  e.currentTarget.style.borderColor = colorScheme.badgeBorder;
                  e.currentTarget.style.boxShadow = `0 0 8px ${colorScheme.glow}`;
                }}
                title="Double-click to edit label"
              >
                {label}
              </span>
            )}

            <span style={{ opacity: 0.4, fontSize: '8px' }}>•</span>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '9px',
              color: isActive ? '#ffffff' : '#8b9dc3',
              maxWidth: '300px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              opacity: isActive ? 0.9 : 0.6
            }}>{cwd}</span>

            {ptyState && !hasExited ? (
              <>
                <span style={{ opacity: 0.4, fontSize: '8px' }}>•</span>
                <span style={{
                  fontSize: '9px',
                  fontWeight: '700',
                  color: ptyState === 'ready'
                    ? '#67e8f9'
                    : ptyState === 'failed'
                      ? '#fca5a5'
                      : '#fbbf24',
                  background: ptyState === 'ready'
                    ? 'rgba(6, 182, 212, 0.12)'
                    : ptyState === 'failed'
                      ? 'rgba(239, 68, 68, 0.12)'
                      : 'rgba(245, 158, 11, 0.12)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  whiteSpace: 'nowrap'
                }}>
                  pty: {ptyState}
                </span>
              </>
            ) : null}

            {/* Show current command if available */}
            {currentCommand && !hasExited && (
              <>
                <span style={{ opacity: 0.4, fontSize: '8px' }}>•</span>
                <span style={{
                  fontFamily: 'monospace',
                  fontSize: '9px',
                  color: '#10b981',
                  fontWeight: '600',
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  textShadow: '0 0 8px rgba(16, 185, 129, 0.4)',
                  maxWidth: '150px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>▶ {currentCommand}</span>
              </>
            )}

            {runtimeProvider && !hasExited && (
              <>
                <span style={{ opacity: 0.4, fontSize: '8px' }}>•</span>
                <span style={{
                  fontSize: '9px',
                  fontWeight: '700',
                  color: runtimeState === 'ready' || runtimeState === 'waiting-response' || runtimeState === 'running' || runtimeState === 'completed'
                    ? '#34d399'
                    : runtimeState === 'failed'
                      ? '#fca5a5'
                      : runtimeState === 'launching' || runtimeState === 'handoff' || runtimeState === 'awaiting-approval' || runtimeState === 'stalled'
                        ? '#fbbf24'
                        : '#cbd5e1',
                  background: runtimeState === 'ready' || runtimeState === 'waiting-response' || runtimeState === 'running' || runtimeState === 'completed'
                    ? 'rgba(16, 185, 129, 0.12)'
                    : runtimeState === 'failed'
                      ? 'rgba(239, 68, 68, 0.12)'
                      : runtimeState === 'launching' || runtimeState === 'handoff' || runtimeState === 'awaiting-approval' || runtimeState === 'stalled'
                        ? 'rgba(245, 158, 11, 0.12)'
                        : 'rgba(148, 163, 184, 0.12)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  maxWidth: '220px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>{runtimeState}</span>
              </>
            )}

            {runtimeProvider && runtimeAttempts > 1 && !hasExited ? (
              <>
                <span style={{ opacity: 0.4, fontSize: '8px' }}>•</span>
                <span style={{
                  fontSize: '9px',
                  fontWeight: '700',
                  color: '#93c5fd',
                  background: 'rgba(59, 130, 246, 0.12)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(59, 130, 246, 0.18)'
                }}>
                  retry {runtimeAttempts - 1}
                </span>
              </>
            ) : null}

            {hasExited && (
              <>
                <span style={{ opacity: 0.4, fontSize: '8px' }}>•</span>
                <span style={{
                  color: '#ff6b6b',
                  fontSize: '9px',
                  fontWeight: '600',
                  textShadow: '0 0 8px rgba(255, 107, 107, 0.4)'
                }}>● Exit</span>
              </>
            )}
          </div>
        </div>
        {onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              background: 'rgba(255, 107, 107, 0.15)',
              border: '1px solid rgba(255, 107, 107, 0.25)',
              color: '#ff8787',
              cursor: 'pointer',
              padding: '2px 6px',
              fontSize: '11px',
              borderRadius: '4px',
              transition: 'all 0.15s ease',
              fontWeight: '600'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 107, 107, 0.3)';
              e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 107, 107, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(255, 107, 107, 0.25)';
            }}
            title="Close terminal"
          >
            ×
          </button>
        )}
      </div>

      {/* Terminal container - ultra translucent pro background */}
      <div
        ref={containerRef}
        onMouseDown={() => {
          if (terminalRef.current) {
            terminalRef.current.focus();
          }
        }}
        style={{
          flex: 1,
          width: '100%',
          overflow: 'hidden',
          padding: 0,
          background: '#05070b',
          position: 'relative',
          cursor: 'text',
          zIndex: 1
        }}
        tabIndex={0}
      />

      {shouldShowStatusFooter ? (
        <div style={{
          padding: '4px 10px',
          borderTop: '1px solid rgba(148, 163, 184, 0.08)',
          color: '#94a3b8',
          fontSize: '10px',
          background: 'rgba(2, 6, 23, 0.95)',
          minHeight: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{
            minWidth: 0,
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {statusDetail || 'Runtime needs attention'}
          </span>
          {hasRuntimeAttention ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleManualRuntimeRetry();
                }}
                disabled={hasExited || !autoCommand}
                title={hasExited ? 'Terminal process exited; open a new console to retry' : 'Retry runtime in this terminal'}
                style={{
                  ...footerButtonStyle,
                  opacity: hasExited || !autoCommand ? 0.45 : 1,
                  cursor: hasExited || !autoCommand ? 'not-allowed' : 'pointer'
                }}
              >
                Retry runtime
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDiagnostics?.();
                }}
                style={footerButtonStyle}
              >
                Diagnostics
              </button>
              {onClose ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                  }}
                  style={{
                    ...footerButtonStyle,
                    border: '1px solid rgba(248, 113, 113, 0.24)',
                    color: '#fca5a5'
                  }}
                >
                  Close
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}

    </div>
  );
};

export const TerminalPane = memo(TerminalPaneComponent, (prev, next) => (
  prev.id === next.id &&
  prev.cwd === next.cwd &&
  prev.shell === next.shell &&
  prev.label === next.label &&
  prev.color === next.color &&
  prev.rainbowEffect === next.rainbowEffect &&
  prev.autoCommand === next.autoCommand &&
  prev.missionPrompt === next.missionPrompt &&
  prev.currentCommand === next.currentCommand &&
  prev.runtimeProvider === next.runtimeProvider &&
  prev.ptyState === next.ptyState &&
  prev.ptyDetail === next.ptyDetail &&
  prev.runtimeState === next.runtimeState &&
  prev.runtimeDetail === next.runtimeDetail &&
  prev.runtimeAttempts === next.runtimeAttempts &&
  prev.onOpenDiagnostics === next.onOpenDiagnostics &&
  prev.isActive === next.isActive
));
