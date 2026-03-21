import React from 'react';
import type { CommanderTask, TaskRun } from '../../types/tasks';
import type {
  Workspace,
  ObsidianNoteSummary,
  ObsidianRelevantNote,
  ObsidianVaultStatus,
  DiagnosticsMissionDrillResult
} from '../../types/electron';
import { resolveAgentRuntimeCommand, resolveAgentRuntimeShell } from '../../utils/agentRuntime';

function formatRelativeTime(timestamp: number): string {
  const deltaMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.round(deltaMs / 60000));
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.round(hours / 24)}d`;
}

export const KnowledgeDock: React.FC<{
  workspace: Workspace | null;
  tasks: CommanderTask[];
  runs: TaskRun[];
}> = ({ workspace, tasks, runs }) => {
  const [status, setStatus] = React.useState<ObsidianVaultStatus | null>(null);
  const [notes, setNotes] = React.useState<ObsidianNoteSummary[]>([]);
  const [pinnedNotes, setPinnedNotes] = React.useState<ObsidianRelevantNote[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [exportMessage, setExportMessage] = React.useState('');
  const [drillRunning, setDrillRunning] = React.useState(false);
  const [drillResult, setDrillResult] = React.useState<DiagnosticsMissionDrillResult | null>(null);

  const refresh = React.useCallback(async () => {
    if (!workspace) {
      setStatus(null);
      setNotes([]);
      return;
    }

    setIsLoading(true);
    try {
      const nextStatus = await window.electronAPI.obsidian.getStatus(workspace.path, workspace.obsidian_vault_path);
      setStatus(nextStatus);

      if (nextStatus.isAvailable) {
        const nextNotes = await window.electronAPI.obsidian.listNotes(workspace.path, workspace.obsidian_vault_path, 6);
        setNotes(nextNotes);
        if (typeof window.electronAPI.obsidian.listPinned === 'function') {
          const nextPinned = await window.electronAPI.obsidian.listPinned(
            workspace.path,
            workspace.obsidian_vault_path,
            workspace.id,
            workspace.name,
            4
          );
          setPinnedNotes(nextPinned);
        } else {
          setPinnedNotes([]);
        }
      } else {
        setNotes([]);
        setPinnedNotes([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [workspace]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const latestTask = tasks[0];
  const latestRun = runs[0];
  const latestFailedRun = runs.find((run) => run.status === 'failed' || run.launchState === 'attention');

  const buildMissionDetails = React.useCallback((task: CommanderTask, relatedRuns: TaskRun[]) => {
    const sections: string[] = [];

    if (task.mission) {
      sections.push('### Mission Blueprint');
      sections.push(`- Mode: ${task.mission.mode}`);
      sections.push(`- Execution: ${task.mission.executionMode}`);
      sections.push(`- App Surfaces: ${task.mission.appSurfaces.join(' | ') || 'N/A'}`);
      sections.push(`- Backend Capabilities: ${task.mission.backendCapabilities.join(' | ') || 'N/A'}`);
      sections.push(`- Completion Gate: ${task.mission.completionGate.join(' | ') || 'N/A'}`);
      sections.push('');
    }

    if (task.stageReviews?.length) {
      sections.push('### Stage Reviews');
      task.stageReviews.forEach((stage) => {
        sections.push(`#### ${stage.stageIndex + 1}. ${stage.label}`);
        sections.push(`- Role: ${stage.role}`);
        sections.push(`- Status: ${stage.status}`);
        sections.push(`- Summary: ${stage.summary || 'N/A'}`);
        if (stage.artifact) {
          sections.push('- Artifact:');
          sections.push('```text');
          sections.push(stage.artifact);
          sections.push('```');
        }
        sections.push('');
      });
    }

    if (task.actions?.length) {
      sections.push('### Mission Ops');
      task.actions.forEach((action) => {
        sections.push(`- ${action.label}: ${action.status} - ${action.summary}`);
      });
      sections.push('');
    }

    if (task.review) {
      sections.push('### Decision Gate');
      sections.push(`- Decision: ${task.review.decision}`);
      sections.push(`- Confidence: ${task.review.confidence}`);
      sections.push(`- Summary: ${task.review.summary || 'N/A'}`);
      sections.push(`- Next Action: ${task.review.nextAction || 'N/A'}`);
      sections.push('');
    }

    if (relatedRuns.length) {
      sections.push('### Run Artifacts');
      relatedRuns.forEach((run) => {
        sections.push(`#### ${run.agentName}${run.stageLabel ? ` - ${run.stageLabel}` : ''}`);
        sections.push(`- Status: ${run.status}`);
        sections.push(`- Summary: ${run.summary}`);
        if (run.outputExcerpt) {
          sections.push('```text');
          sections.push(run.outputExcerpt);
          sections.push('```');
        }
        sections.push('');
      });
    }

    return sections.join('\n').trim();
  }, []);

  const exportLatestMission = React.useCallback(async () => {
    if (!workspace || !latestTask || !latestRun) {
      return;
    }

    const relatedRuns = runs.filter((run) => run.taskId === latestTask.id);
    const details = buildMissionDetails(latestTask, relatedRuns);

    const result = await window.electronAPI.obsidian.exportMission(
      workspace.name,
      workspace.path,
      latestTask.title,
      latestTask.goal,
      latestRun.summary,
      details,
      workspace.obsidian_vault_path,
      latestRun.agentName,
      latestRun.runtimeProvider
    );
    setExportMessage(`Saved to ${result.filePath}`);
    void refresh();
  }, [buildMissionDetails, latestRun, latestTask, refresh, runs, workspace]);

  const exportFailedRun = React.useCallback(async () => {
    if (!workspace || !latestFailedRun) {
      return;
    }

    const sourceTask = tasks.find((task) => task.id === latestFailedRun.taskId);
    const relatedRuns = runs.filter((run) => run.taskId === latestFailedRun.taskId);
    const details = sourceTask ? buildMissionDetails(sourceTask, relatedRuns) : '';
    const result = await window.electronAPI.obsidian.exportMission(
      workspace.name,
      workspace.path,
      `Postmortem - ${latestFailedRun.agentName}`,
      sourceTask?.goal || latestFailedRun.summary,
      `Failure summary:\n${latestFailedRun.summary}`,
      details,
      workspace.obsidian_vault_path,
      latestFailedRun.agentName,
      latestFailedRun.runtimeProvider
    );
    setExportMessage(`Saved to ${result.filePath}`);
    void refresh();
  }, [buildMissionDetails, latestFailedRun, refresh, runs, tasks, workspace]);

  const runMissionDrill = React.useCallback(async () => {
    if (!workspace || typeof window.electronAPI.diagnostics?.runMissionDrill !== 'function') {
      return;
    }

    const runtimeShell = resolveAgentRuntimeShell(workspace.shell);
    const commands = ['codex', 'claude', 'gemini'].map((provider) => resolveAgentRuntimeCommand(provider as 'codex' | 'claude' | 'gemini', runtimeShell));

    setDrillRunning(true);
    setDrillResult(null);
    setExportMessage('');
    try {
      const result = await window.electronAPI.diagnostics.runMissionDrill(
        workspace.name,
        workspace.path,
        Array.from(new Set(commands)),
        workspace.obsidian_vault_path,
        workspace.shell
      );
      setDrillResult(result);
      if (result.notePath) {
        setExportMessage(`Mission drill saved to ${result.notePath}`);
      }
      void refresh();
    } finally {
      setDrillRunning(false);
    }
  }, [refresh, workspace]);

  return (
    <div style={dockStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={eyebrowStyle}>Knowledge Dock</div>
          <div style={titleStyle}>Obsidian memory for missions, playbooks, and decisions.</div>
        </div>
        <button type="button" onClick={() => void refresh()} style={smallButtonStyle}>
          Refresh
        </button>
      </div>

      <div style={gridStyle}>
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>Vault</div>
          <div style={{ color: status?.isAvailable ? '#34d399' : '#f59e0b', fontSize: '13px', fontWeight: 800, marginTop: '8px' }}>
            {isLoading ? 'Checking...' : status?.isAvailable ? 'Connected' : 'Not detected'}
          </div>
          <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '8px', lineHeight: 1.45, wordBreak: 'break-word' }}>
            {status?.vaultPath || workspace?.obsidian_vault_path || workspace?.path || 'No workspace selected'}
          </div>
          {status?.vaultPath ? (
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void window.electronAPI.obsidian.openPath(status.vaultPath as string)}
                style={actionButtonStyle}
              >
                Open Vault
              </button>
              {status.notesPath ? (
                <button
                  type="button"
                  onClick={() => void window.electronAPI.obsidian.openPath(status.notesPath as string)}
                  style={smallButtonStyle}
                >
                  Open Notes Folder
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={cardStyle}>
        <div style={sectionLabelStyle}>Mission Export</div>
        <div style={{ color: '#e2e8f0', fontSize: '12px', marginTop: '8px', lineHeight: 1.45 }}>
          Export the latest mission and run summary into Obsidian.
          </div>
          <button
            type="button"
            disabled={!status?.isAvailable || !latestTask || !latestRun}
            onClick={() => void exportLatestMission()}
            style={{
              ...actionButtonStyle,
              marginTop: '12px',
              opacity: !status?.isAvailable || !latestTask || !latestRun ? 0.5 : 1,
              cursor: !status?.isAvailable || !latestTask || !latestRun ? 'not-allowed' : 'pointer'
            }}
          >
            Export Latest Mission
          </button>
          {exportMessage ? (
            <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '8px', lineHeight: 1.45, wordBreak: 'break-word' }}>
              {exportMessage}
            </div>
          ) : null}
          {latestFailedRun ? (
            <button
              type="button"
              onClick={() => void exportFailedRun()}
              style={{ ...smallButtonStyle, marginTop: '10px' }}
            >
              Export Failed Run
            </button>
          ) : null}
          <button
            type="button"
            disabled={!workspace || drillRunning}
            onClick={() => void runMissionDrill()}
            style={{
              ...smallButtonStyle,
              marginTop: '10px',
              opacity: !workspace || drillRunning ? 0.5 : 1,
              cursor: !workspace || drillRunning ? 'not-allowed' : 'pointer'
            }}
          >
            {drillRunning ? 'Running Mission Drill...' : 'Run Mission Drill'}
          </button>
          {drillResult ? (
            <div style={{ marginTop: '10px', color: drillResult.success ? '#6ee7b7' : '#fbbf24', fontSize: '11px', lineHeight: 1.45 }}>
              {drillResult.summary}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: '14px' }}>
        <div style={sectionLabelStyle}>Pinned Memory</div>
        <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
          {pinnedNotes.length === 0 ? (
            <div style={emptyStyle}>Add `pinned: true` in Obsidian frontmatter to keep critical memory always visible.</div>
          ) : (
            pinnedNotes.map((note) => (
              <button
                key={note.path}
                type="button"
                onClick={() => void window.electronAPI.obsidian.openPath(note.path)}
                style={noteButtonStyle}
              >
                <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>{note.name}</div>
                <div style={{ color: '#a78bfa', fontSize: '10px', marginTop: '5px', fontWeight: 700 }}>
                  {(note.type || 'note')}{note.domain ? ` • ${note.domain}` : ''}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px', lineHeight: 1.4 }}>{note.snippet}</div>
              </button>
            ))
          )}
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: '14px' }}>
        <div style={sectionLabelStyle}>Recent Notes</div>
        <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
          {notes.length === 0 ? (
            <div style={emptyStyle}>No notes in `hedge-station` yet.</div>
          ) : (
            notes.map((note) => (
              <button
                key={note.path}
                type="button"
                onClick={() => void window.electronAPI.obsidian.openPath(note.path)}
                style={noteButtonStyle}
              >
                <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>{note.name}</div>
                <div style={{ color: '#64748b', fontSize: '10px', marginTop: '5px' }}>
                  Updated {formatRelativeTime(note.updatedAt)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const dockStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '22px',
  background: 'rgba(15, 23, 42, 0.58)',
  border: '1px solid rgba(148, 163, 184, 0.12)'
};

const eyebrowStyle: React.CSSProperties = {
  color: '#a78bfa',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.14em'
};

const titleStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '18px',
  fontWeight: 800,
  marginTop: '6px'
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: '14px',
  marginTop: '14px'
};

const cardStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '18px',
  background: 'rgba(2, 6, 23, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.12)'
};

const sectionLabelStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.12em'
};

const actionButtonStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: '12px',
  border: '1px solid rgba(167, 139, 250, 0.22)',
  background: 'rgba(167, 139, 250, 0.12)',
  color: '#ddd6fe',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer'
};

const smallButtonStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: '10px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'rgba(15, 23, 42, 0.72)',
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer'
};

const emptyStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '14px',
  background: 'rgba(15, 23, 42, 0.45)',
  border: '1px dashed rgba(148, 163, 184, 0.14)',
  color: '#64748b',
  fontSize: '12px'
};

const noteButtonStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: '14px',
  border: '1px solid rgba(148, 163, 184, 0.1)',
  background: 'rgba(15, 23, 42, 0.5)',
  textAlign: 'left',
  cursor: 'pointer'
};
