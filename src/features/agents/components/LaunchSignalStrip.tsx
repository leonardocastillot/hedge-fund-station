import React from 'react';
import type { TaskRun } from '@/types/tasks';
import type { TerminalRuntimeState, TerminalSession } from '@/contexts/TerminalContext';

function getRuntimeLabel(state?: TerminalRuntimeState): string {
  switch (state) {
    case 'handoff':
      return 'Runtime handoff';
    case 'ready':
      return 'Runtime ready';
    case 'waiting-response':
      return 'Waiting response';
    case 'awaiting-approval':
      return 'Waiting approval';
    case 'running':
      return 'Mission running';
    case 'stalled':
      return 'Runtime stalled';
    case 'completed':
      return 'Mission completed';
    case 'failed':
      return 'Runtime failed';
    case 'launching':
      return 'Launching runtime';
    case 'shell':
      return 'Shell only';
    default:
      return 'No runtime signal';
  }
}

function getPtyLabel(state?: TerminalSession['ptyState']): string {
  switch (state) {
    case 'ready':
      return 'Terminal ready';
    case 'failed':
      return 'Terminal failed';
    case 'creating':
      return 'Creating terminal';
    default:
      return 'No terminal process';
  }
}

function signalStyle(active: boolean, tone: 'neutral' | 'good' | 'warn' | 'bad'): React.CSSProperties {
  const palette = {
    neutral: { bg: 'rgba(148, 163, 184, 0.18)', border: 'rgba(148, 163, 184, 0.2)', glow: 'transparent' },
    good: { bg: 'rgba(16, 185, 129, 0.9)', border: 'rgba(16, 185, 129, 0.35)', glow: 'rgba(16, 185, 129, 0.35)' },
    warn: { bg: 'rgba(245, 158, 11, 0.9)', border: 'rgba(245, 158, 11, 0.35)', glow: 'rgba(245, 158, 11, 0.35)' },
    bad: { bg: 'rgba(239, 68, 68, 0.9)', border: 'rgba(239, 68, 68, 0.35)', glow: 'rgba(239, 68, 68, 0.35)' }
  }[tone];

  return {
    width: '10px',
    height: '10px',
    borderRadius: '999px',
    background: active ? palette.bg : 'rgba(51, 65, 85, 0.7)',
    border: `1px solid ${active ? palette.border : 'rgba(51, 65, 85, 0.8)'}`,
    boxShadow: active ? `0 0 12px ${palette.glow}` : 'none'
  };
}

export function LaunchSignalStrip({
  run,
  terminal
}: {
  run: TaskRun;
  terminal?: TerminalSession;
}) {
  const stalled = (terminal?.runtimeState === 'running' || terminal?.runtimeState === 'waiting-response' || terminal?.runtimeState === 'stalled')
    && typeof terminal.lastOutputAt === 'number'
    && Date.now() - terminal.lastOutputAt > 90_000;
  const signals: Array<{ label: string; active: boolean; tone: 'neutral' | 'good' | 'warn' | 'bad' }> = [
    {
      label: 'Run',
      active: true,
      tone: run.status === 'failed' ? 'bad' : 'good' as const
    },
    {
      label: 'Terminal',
      active: Boolean(terminal?.ptyState),
      tone: terminal?.ptyState === 'ready'
        ? 'good'
        : terminal?.ptyState === 'failed'
          ? 'bad'
          : terminal?.ptyState === 'creating'
            ? 'warn'
            : 'bad'
    },
    {
      label: 'Runtime',
      active: Boolean(terminal?.runtimeState),
      tone: stalled
        ? 'warn'
        : terminal?.runtimeState === 'ready' || terminal?.runtimeState === 'handoff' || terminal?.runtimeState === 'waiting-response' || terminal?.runtimeState === 'running' || terminal?.runtimeState === 'completed'
        ? 'good'
        : terminal?.runtimeState === 'failed'
          ? 'bad'
          : terminal?.runtimeState === 'launching' || terminal?.runtimeState === 'awaiting-approval' || terminal?.runtimeState === 'stalled'
            ? 'warn'
            : terminal?.runtimeState === 'shell'
              ? 'warn'
              : 'neutral'
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
        {signals.map((signal) => (
          <div key={signal.label} title={signal.label} style={signalStyle(signal.active, signal.tone)} />
        ))}
      </div>
      <div style={{ color: '#64748b', fontSize: '10px', marginTop: '6px' }}>
        {terminal?.ptyState && terminal.ptyState !== 'ready'
          ? getPtyLabel(terminal.ptyState)
          : stalled
            ? `No output for ${Math.round((Date.now() - (terminal?.lastOutputAt || Date.now())) / 1000)}s`
          : run.terminalIds.length === 0
            ? 'Blocked before terminal creation'
            : getRuntimeLabel(terminal?.runtimeState)}
      </div>
    </div>
  );
}
