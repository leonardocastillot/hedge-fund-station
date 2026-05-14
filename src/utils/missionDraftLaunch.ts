import type { AgentProfile } from '@/types/agents';
import type { Workspace } from '@/types/electron';
import type { ApprovedMission, CommanderTask, MissionDraft, MissionTaskMetadata, TaskRun, TaskStatus } from '@/types/tasks';
import { inferRequestedProvider } from './agentRuntime';
import { launchAgentRun } from './agentOrchestration';
import { buildMissionMetadata, inferMissionMode } from './missionControl';

interface LaunchMissionDraftDependencies {
  workspace: Workspace;
  workspaceAgents: AgentProfile[];
  createTask: (goal: string, workspaceId: string, title?: string, mission?: MissionTaskMetadata) => CommanderTask;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  createTerminal: (
    cwd: string,
    shell?: string,
    label?: string,
    autoCommand?: string,
    metadata?: {
      agentId?: string;
      agentName?: string;
      terminalPurpose?: string;
      runtimeProvider?: AgentProfile['provider'];
      missionPrompt?: string;
      runId?: string;
    }
  ) => string;
  createRun: (params: Omit<TaskRun, 'id' | 'startedAt' | 'updatedAt'> & { startedAt?: number }) => TaskRun;
  updateRun: (runId: string, updates: Partial<TaskRun>) => void;
}

export type LaunchApprovedMissionDraftResult =
  | {
      ok: true;
      task: CommanderTask;
      run: TaskRun;
      agent: AgentProfile;
      approvedMission: ApprovedMission;
    }
  | {
      ok: false;
      task: CommanderTask;
      error: string;
    };

export function buildMissionTaskMetadataForDraft(draft: MissionDraft): MissionTaskMetadata {
  const missionMode = inferMissionMode(draft.goal);
  return buildMissionMetadata({
    goal: draft.goal,
    missionMode,
    missionDepth: 'focused',
    pinnedNotes: [],
    memoryNotes: []
  });
}

export function resolveMissionFrontierAgent(params: {
  workspace: Workspace;
  workspaceAgents: AgentProfile[];
  draft: MissionDraft;
}): AgentProfile {
  const preferredRole = params.draft.suggestedRoles[0] || 'commander';
  const provider = params.draft.missionPacket?.frontierRuntime || inferRequestedProvider(params.draft.goal) || 'codex';
  const existing = params.workspaceAgents.find((agent) => agent.role === preferredRole)
    || params.workspaceAgents.find((agent) => agent.role === 'commander')
    || params.workspaceAgents[0];

  if (existing) {
    return { ...existing, provider };
  }

  return {
    id: `${params.workspace.id}:${provider}-mission-draft`,
    name: `${params.workspace.name} Mission Draft`,
    role: preferredRole,
    provider,
    workspaceId: params.workspace.id,
    promptTemplate: 'Frontier mission runtime for the trading workbench.',
    objective: 'Turn approved mission drafts into auditable terminal execution.',
    accentColor: '#38bdf8',
    autoAssignTerminalPurpose: 'mission-draft'
  };
}

export function launchApprovedMissionDraft(
  dependencies: LaunchMissionDraftDependencies,
  params: {
    draft: MissionDraft;
    task?: CommanderTask;
    summaryPrefix?: string;
  }
): LaunchApprovedMissionDraftResult {
  const task = params.task || dependencies.createTask(
    params.draft.goal,
    dependencies.workspace.id,
    params.draft.title,
    buildMissionTaskMetadataForDraft(params.draft)
  );
  dependencies.updateTaskStatus(task.id, 'routing');

  const approvedMission: ApprovedMission = {
    draftId: params.draft.id,
    workspaceId: dependencies.workspace.id,
    title: params.draft.title,
    goal: params.draft.goal,
    finalPrompt: params.draft.finalPrompt,
    suggestedRoles: params.draft.suggestedRoles,
    proposedCommands: params.draft.proposedCommands
  };
  const agent = resolveMissionFrontierAgent({
    workspace: dependencies.workspace,
    workspaceAgents: dependencies.workspaceAgents,
    draft: params.draft
  });

  try {
    const run = launchAgentRun(
      {
        workspace: dependencies.workspace,
        createTerminal: dependencies.createTerminal,
        createRun: dependencies.createRun,
        updateRun: dependencies.updateRun
      },
      {
        task,
        agent,
        approvedMission,
        summaryPrefix: params.summaryPrefix || 'Approved mission launching',
        forceDirectLaunch: true
      }
    );

    dependencies.updateTaskStatus(task.id, 'running');
    return {
      ok: true,
      task,
      run,
      agent,
      approvedMission
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mission launch failed.';
    dependencies.updateTaskStatus(task.id, 'failed');
    return {
      ok: false,
      task,
      error: message
    };
  }
}
