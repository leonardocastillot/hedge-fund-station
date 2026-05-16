import React from 'react';
import { useTerminalContext } from '@/contexts/TerminalContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import type { AgentProvider } from '@/types/agents';
import type { Workspace } from '@/types/electron';
import type { MissionConsoleMissionKind, MissionConsoleRun } from '@/types/missionConsole';
import { getProviderMeta, resolveAgentRuntimeCommand, resolveAgentRuntimeShell } from '@/utils/agentRuntime';

interface MissionConsoleLauncherProps {
  workspaceId?: string;
}

const MISSION_KIND_LABELS: Record<MissionConsoleMissionKind, string> = {
  development: 'Development',
  research: 'Research',
  ops: 'Ops',
  review: 'Review',
  custom: 'Custom'
};

function createRunId(): string {
  return `mission-console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildWorkspaceCapsulePrompt(params: {
  workspace: Workspace;
  provider: AgentProvider;
  missionKind: MissionConsoleMissionKind;
  title: string;
  goal: string;
}): string {
  const { workspace, provider, missionKind, title, goal } = params;
  const savedCommands = workspace.default_commands?.length
    ? workspace.default_commands.slice(0, 8).map((command) => `- ${command}`).join('\n')
    : '- none saved';
  const launchProfiles = workspace.launch_profiles?.length
    ? workspace.launch_profiles.slice(0, 6).map((profile) => (
        `- ${profile.name}: ${profile.steps.map((step) => `${step.delayMs}ms>${step.command}`).join(' | ')}`
      )).join('\n')
    : '- none saved';
  const hedgeFundGuardrail = workspace.kind === 'hedge-fund'
    ? [
        '',
        'Hedge Fund Station guardrails:',
        '- Keep strategy logic, persistence, replay, validation, paper execution, and audit evidence in backend/docs.',
        '- Treat React and Electron as cockpit/review/launcher surfaces only.',
        '- Do not promote live trading, change credentials, or claim edge without validation and paper evidence.'
      ].join('\n')
    : '';

  return [
    '# Mission Console Capsule',
    '',
    `Provider runtime: ${provider}`,
    `Mission title: ${title}`,
    `Mission kind: ${MISSION_KIND_LABELS[missionKind]}`,
    `Desk name: ${workspace.name}`,
    `Desk path: ${workspace.path}`,
    `Desk kind: ${workspace.kind}`,
    `Preferred shell: ${workspace.shell}`,
    '',
    'Goal:',
    goal,
    '',
    'Desk operating rules:',
    '- Read AGENTS.md first if it exists.',
    '- Inspect before changing code.',
    '- Keep changes focused and reviewable.',
    '- Do not run destructive commands, credential changes, live trading, large migrations, or broad rewrites without explicit operator approval.',
    '- If a command may take a long time or mutate many files, ask before running it.',
    hedgeFundGuardrail,
    '',
    'Saved desk commands:',
    savedCommands,
    '',
    'Launch profiles:',
    launchProfiles,
    '',
    'Output contract:',
    '- State what you did or recommend.',
    '- Name important files, commands, artifacts, and risks.',
    '- Say whether verification ran or was intentionally skipped.',
    '- End with a section titled "Mission Console Handoff" and one concrete next action.'
  ].filter(Boolean).join('\n');
}

export const MissionConsoleLauncher: React.FC<MissionConsoleLauncherProps> = ({ workspaceId }) => {
  const { activeWorkspace, workspaces } = useWorkspaceContext();
  const { createTerminal, setActiveTerminal } = useTerminalContext();
  const [provider, setProvider] = React.useState<AgentProvider>('codex');
  const [missionKind, setMissionKind] = React.useState<MissionConsoleMissionKind>('development');
  const [title, setTitle] = React.useState('Desk mission');
  const [goal, setGoal] = React.useState('');
  const [recentRuns, setRecentRuns] = React.useState<MissionConsoleRun[]>([]);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [isLaunching, setIsLaunching] = React.useState(false);

  const workspace = React.useMemo(
    () => workspaces.find((item) => item.id === workspaceId) || activeWorkspace || null,
    [activeWorkspace, workspaceId, workspaces]
  );
  const providerMeta = getProviderMeta(provider);

  const refreshRuns = React.useCallback(async () => {
    if (!workspace || !window.electronAPI?.missionConsole) {
      setRecentRuns([]);
      return;
    }

    try {
      const runs = await window.electronAPI.missionConsole.listRuns(workspace.id);
      setRecentRuns(runs.slice(0, 4));
    } catch {
      setRecentRuns([]);
    }
  }, [workspace]);

  React.useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  const handleLaunch = React.useCallback(async () => {
    if (!workspace || !goal.trim() || isLaunching) {
      return;
    }

    setIsLaunching(true);
    setStatusMessage(null);

    const runtimeShell = resolveAgentRuntimeShell(workspace.shell);
    const runtimeCommand = resolveAgentRuntimeCommand(provider, runtimeShell);
    const commandStatus = await window.electronAPI.diagnostics.checkCommands([runtimeCommand], {
      cwd: workspace.path,
      shell: runtimeShell
    });
    const runtimeAvailable = commandStatus[0]?.available;
    const runId = createRunId();
    const prompt = buildWorkspaceCapsulePrompt({
      workspace,
      provider,
      missionKind,
      title: title.trim() || goal.trim().slice(0, 72),
      goal: goal.trim()
    });
    const baseRun: MissionConsoleRun = {
      id: runId,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspacePath: workspace.path,
      title: title.trim() || goal.trim().slice(0, 72),
      goal: goal.trim(),
      provider,
      missionKind,
      prompt,
      status: runtimeAvailable ? 'launching' : 'failed',
      commands: workspace.default_commands?.slice(0, 12) || [],
      evidenceRefs: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (!runtimeAvailable) {
      await window.electronAPI.missionConsole.saveRun({
        ...baseRun,
        handoffSummary: `${providerMeta.label} CLI command was not found: ${runtimeCommand}`
      });
      setStatusMessage(`${providerMeta.label} CLI not found. Install or login to ${runtimeCommand}, then retry.`);
      setIsLaunching(false);
      await refreshRuns();
      return;
    }

    await window.electronAPI.missionConsole.saveRun(baseRun);
    const terminalId = createTerminal(
      workspace.path,
      runtimeShell,
      `${workspace.name}: ${providerMeta.label} Mission`,
      runtimeCommand,
      {
        workspaceId: workspace.id,
        missionTitle: baseRun.title,
        missionKind,
        terminalPurpose: 'mission-console',
        runtimeProvider: provider,
        missionPrompt: prompt,
        runId
      }
    );
    setActiveTerminal(terminalId);
    await window.electronAPI.missionConsole.saveRun({
      ...baseRun,
      terminalId
    });

    setGoal('');
    setStatusMessage(`${providerMeta.label} mission launched in terminal.`);
    setIsLaunching(false);
    await refreshRuns();
  }, [createTerminal, goal, isLaunching, missionKind, provider, providerMeta.label, refreshRuns, setActiveTerminal, title, workspace]);

  if (!workspace) {
    return null;
  }

  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Mission Console V1</div>
          <div style={titleStyle}>Useful CLI missions for this desk</div>
          <div style={copyStyle}>Launch Codex, OpenCode, Claude, or Gemini with desk context, guardrails, and an auditable handoff path.</div>
        </div>
        <div style={{ ...providerBadgeStyle, color: providerMeta.accent, background: providerMeta.glow }}>
          {providerMeta.label}
        </div>
      </div>

      <div style={formGridStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Provider</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value as AgentProvider)} style={inputStyle}>
            <option value="codex">Codex</option>
            <option value="opencode">OpenCode</option>
            <option value="claude">Claude</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Kind</span>
          <select value={missionKind} onChange={(event) => setMissionKind(event.target.value as MissionConsoleMissionKind)} style={inputStyle}>
            <option value="development">Development</option>
            <option value="research">Research</option>
            <option value="ops">Ops</option>
            <option value="review">Review</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} style={inputStyle} />
        </label>
      </div>

      <textarea
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder={`What should ${providerMeta.label} help with in ${workspace.name}?`}
        rows={4}
        style={textareaStyle}
      />

      <div style={actionsStyle}>
        <button type="button" onClick={handleLaunch} disabled={!goal.trim() || isLaunching} style={{
          ...primaryButtonStyle,
          opacity: !goal.trim() || isLaunching ? 0.45 : 1,
          cursor: !goal.trim() || isLaunching ? 'not-allowed' : 'pointer'
        }}>
          {isLaunching ? 'Launching...' : `Launch ${providerMeta.label}`}
        </button>
        <button type="button" onClick={refreshRuns} style={secondaryButtonStyle}>Refresh runs</button>
        {statusMessage ? <div style={statusStyle}>{statusMessage}</div> : null}
      </div>

      <div style={recentGridStyle}>
        {recentRuns.length === 0 ? (
          <div style={emptyStyle}>No Mission Console runs captured for this desk yet.</div>
        ) : recentRuns.map((run) => (
          <div key={run.id} style={runCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: '12px' }}>{run.title}</div>
              <div style={runStatusStyle}>{run.status}</div>
            </div>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px' }}>{run.provider} / {run.missionKind}</div>
            {run.handoffPath ? <div style={{ color: '#67e8f9', fontSize: '10px', marginTop: '6px' }}>{run.handoffPath}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
};

const shellStyle: React.CSSProperties = {
  border: '1px solid rgba(56, 189, 248, 0.16)',
  borderRadius: '22px',
  padding: '16px',
  background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.45), rgba(15, 23, 42, 0.82))',
  boxShadow: '0 24px 80px rgba(2, 6, 23, 0.45)',
  display: 'grid',
  gap: '12px'
};

const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start' };
const eyebrowStyle: React.CSSProperties = { color: '#67e8f9', fontSize: '10px', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase' };
const titleStyle: React.CSSProperties = { color: '#f8fafc', fontSize: '18px', fontWeight: 900, marginTop: '5px' };
const copyStyle: React.CSSProperties = { color: '#94a3b8', fontSize: '12px', marginTop: '6px', lineHeight: 1.5, maxWidth: '720px' };
const providerBadgeStyle: React.CSSProperties = { borderRadius: '999px', padding: '6px 10px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' };
const formGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' };
const fieldStyle: React.CSSProperties = { display: 'grid', gap: '5px' };
const labelStyle: React.CSSProperties = { color: '#64748b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' };
const inputStyle: React.CSSProperties = { background: 'rgba(2, 6, 23, 0.82)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '12px', color: '#e2e8f0', padding: '10px 12px', outline: 'none' };
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical', minHeight: '92px', lineHeight: 1.5 };
const actionsStyle: React.CSSProperties = { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' };
const primaryButtonStyle: React.CSSProperties = { border: '1px solid rgba(34, 211, 238, 0.28)', borderRadius: '12px', background: 'linear-gradient(135deg, #0891b2, #0f766e)', color: '#ecfeff', padding: '10px 14px', fontWeight: 900 };
const secondaryButtonStyle: React.CSSProperties = { border: '1px solid rgba(148, 163, 184, 0.16)', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.75)', color: '#cbd5e1', padding: '10px 14px', fontWeight: 800, cursor: 'pointer' };
const statusStyle: React.CSSProperties = { color: '#bae6fd', fontSize: '12px', fontWeight: 700 };
const recentGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px' };
const emptyStyle: React.CSSProperties = { color: '#64748b', fontSize: '12px', padding: '8px 0' };
const runCardStyle: React.CSSProperties = { border: '1px solid rgba(148, 163, 184, 0.12)', borderRadius: '14px', padding: '10px', background: 'rgba(2, 6, 23, 0.58)', minWidth: 0 };
const runStatusStyle: React.CSSProperties = { color: '#7dd3fc', background: 'rgba(8, 145, 178, 0.14)', borderRadius: '999px', padding: '3px 7px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' };
