import type { AgentProfile } from '../types/agents';
import type { Workspace } from '../types/electron';
import type { ApprovedMission, CommanderTask, TaskRun } from '../types/tasks';
import { getProviderMeta, resolveAgentRuntimeCommand, resolveAgentRuntimeShell } from './agentRuntime';
import { formatRoleLabel, getRoleOperatingBrief } from './missionControl';
import { launchProfileSequence } from './workspaceLaunch';

interface LaunchAgentRunDependencies {
  workspace: Workspace;
  createTerminal: (
    cwd: string,
    shell?: string,
    label?: string,
    autoCommand?: string,
    metadata?: {
      agentId?: string;
      agentName?: string;
      terminalPurpose?: string;
      workspaceId?: string;
      runtimeProvider?: AgentProfile['provider'];
      missionPrompt?: string;
      runId?: string;
    }
  ) => string;
  createRun: (params: Omit<TaskRun, 'id' | 'startedAt' | 'updatedAt'> & { startedAt?: number }) => TaskRun;
  updateRun: (runId: string, updates: Partial<TaskRun>) => void;
}

function getRoleOutputContract(agent: AgentProfile): string {
  switch (agent.role) {
    case 'researcher':
      return 'Return: hypothesis, regime, signal logic, invalidation, and the smallest next research step.';
    case 'backtester':
      return 'Return: exact repo or API path to validate, required metrics, known gaps, and whether the strategy is ready for backtest or paper.';
    case 'risk':
      return 'Return: reject or advance decision, failure modes, risk conditions, and the next gate.';
    case 'market-structure':
      return 'Return: regime, levels, scenario tree, invalidation, and what price action matters next.';
    case 'derivatives':
      return 'Return: funding, OI, liquidation stress, crowding read, and whether positioning confirms or rejects the setup.';
    case 'execution':
      return 'Return: trigger, stop, target, sizing, no-trade condition, and operator checklist.';
    case 'developer':
      return 'Return: root cause, change made, verification, and residual risk.';
    case 'data-engineer':
      return 'Return: data path checked, trust issues found, and validation result.';
    case 'ops':
      return 'Return: runtime status, operational blockers, mitigation, and the next operational action.';
    default:
      return 'Return only concrete findings, blockers, and the next action.';
  }
}

function buildMissionPrompt(task: CommanderTask, agent: AgentProfile, workspace: Workspace): string {
  const workflowStep = task.mission?.workflow.find((step) => step.role === agent.role);
  const missionMetadata = task.mission
    ? [
        `Mode: ${task.mission.mode}.`,
        `Depth: ${task.mission.depth}.`,
        `Execution: ${task.mission.executionMode}.`,
        `Deliverables: ${task.mission.deliverables.slice(0, 3).join('; ')}.`,
        `Data: ${task.mission.datasets.slice(0, 4).join('; ')}.`,
        `Success: ${task.mission.successCriteria.slice(0, 3).join('; ')}.`
      ].join(' ')
    : '';
  const workflowMetadata = workflowStep
    ? [
        `Stage: ${workflowStep.label}.`,
        `Stage objective: ${workflowStep.objective}.`,
        `Expected output: ${workflowStep.output}.`,
        workflowStep.handoff ? `Handoff: ${workflowStep.handoff}.` : ''
      ].join(' ')
    : '';
  const guardrails = task.mission?.guardrails.length
    ? `Guardrails: ${task.mission.guardrails.slice(0, 3).join('; ')}.`
    : '';
  const workspaceCommands = workspace.default_commands?.slice(0, 6).join('; ') || 'No saved commands.';
  const workspaceProfiles = workspace.launch_profiles?.slice(0, 4).map((profile) => (
    `${profile.name}: ${profile.steps.map((step) => step.command).join(' -> ')}`
  )).join(' | ') || 'No launch profiles.';
  const hedgeFundGuardrail = /hedge|fund|hyperliquid|trading|market/i.test(`${workspace.name} ${workspace.path}`)
    ? 'Hedge Fund Station boundary: keep trading logic, validation, replay, persistence, paper execution, and evidence in backend/docs. React and Electron are cockpit surfaces only. Do not promote live trading or change credentials.'
    : '';

  return [
    `You are ${agent.name}, the ${formatRoleLabel(agent.role)} agent for workspace "${workspace.name}".`,
    'Mission Console workspace capsule:',
    `Workspace name: ${workspace.name}.`,
    `Workspace path: ${workspace.path}.`,
    `Saved commands: ${workspaceCommands}.`,
    `Launch profiles: ${workspaceProfiles}.`,
    'Read AGENTS.md first when it exists. If strategy-related, inspect only the minimum relevant docs and backend files before acting.',
    agent.promptTemplate ? `Role instructions: ${agent.promptTemplate}` : '',
    `Role objective: ${agent.objective || getRoleOperatingBrief(agent.role)}`,
    `Operating brief: ${getRoleOperatingBrief(agent.role)}`,
    `Mission: ${task.goal.trim()}.`,
    missionMetadata,
    workflowMetadata,
    guardrails,
    hedgeFundGuardrail,
    `Output contract: ${getRoleOutputContract(agent)}`,
    'Operator approval rule: do not run destructive commands, credential changes, live trading, large migrations, or broad rewrites without explicit human approval.',
    'Mission Console handoff: end with outcome, important files or artifact paths, commands run, verification status or skipped reason, risks, and next concrete action.',
    'Stay scoped to your role. Do not paste large blocks of prior context. Use short summaries, concrete findings, and exact file or data references.'
  ].join(' ');
}

export function launchAgentRun(
  dependencies: LaunchAgentRunDependencies,
  params: {
    task: CommanderTask;
    agent: AgentProfile;
    approvedMission?: ApprovedMission;
    summaryPrefix?: string;
    forceDirectLaunch?: boolean;
    stageIndex?: number;
    stageLabel?: string;
  }
): TaskRun {
  const { workspace, createTerminal, createRun, updateRun } = dependencies;
  const { task, agent, approvedMission, summaryPrefix, forceDirectLaunch = false, stageIndex, stageLabel } = params;
  const providerMeta = getProviderMeta(agent.provider);
  const runtimeShell = resolveAgentRuntimeShell(workspace.shell);
  const runtimeCommand = resolveAgentRuntimeCommand(agent.provider, runtimeShell);
  const missionPrompt = approvedMission?.finalPrompt || buildMissionPrompt(task, agent, workspace);

  const run = createRun({
    taskId: task.id,
    agentId: agent.id,
    agentName: agent.name,
    agentRole: agent.role,
    stageIndex,
    stageLabel,
    runtimeProvider: agent.provider,
    workspaceId: workspace.id,
    status: 'running',
    launchMode: !forceDirectLaunch && agent.defaultLaunchProfileId ? 'profile' : 'direct',
    launchState: 'launching',
    summary: summaryPrefix
      ? `${summaryPrefix} ${providerMeta.label} for ${agent.name}`
      : approvedMission
        ? `${providerMeta.label} approved for ${approvedMission.title}`
        : `${providerMeta.label} selected for ${agent.name}`,
    terminalIds: []
  });

  const metadata = {
    agentId: agent.id,
    agentName: agent.name,
    terminalPurpose: agent.autoAssignTerminalPurpose,
    workspaceId: workspace.id,
    runtimeProvider: agent.provider,
    missionPrompt,
    runId: run.id
  };

  const launchProfile = forceDirectLaunch
    ? undefined
    : workspace.launch_profiles.find((profile) => profile.id === agent.defaultLaunchProfileId);
  const continueLaunch = () => {
    if (launchProfile) {
      const terminalIds: string[] = [];
      launchProfileSequence(
        workspace,
        launchProfile,
        createTerminal,
        metadata,
        undefined,
        (terminalId) => {
          terminalIds.push(terminalId);
        }
      );

      window.setTimeout(() => {
        if (terminalIds.length === 0) {
          const fallbackTerminalId = createTerminal(
            workspace.path,
            runtimeShell,
            `${agent.name}: ${providerMeta.label}`,
            runtimeCommand,
            metadata
          );

          updateRun(run.id, {
            terminalIds: [fallbackTerminalId],
            launchMode: 'direct',
            launchState: 'attention',
            summary: `${providerMeta.label} profile fallback opened directly for ${agent.name}`
          });
          return;
        }

        updateRun(run.id, {
          terminalIds,
          launchState: terminalIds.length > 0 ? 'ready' : 'attention',
          summary: summaryPrefix
            ? `${summaryPrefix} via ${launchProfile.name}`
            : `${providerMeta.label} launched via ${launchProfile.name}`
        });
      }, Math.max(...launchProfile.steps.map((step) => step.delayMs), 0) + 120);

      return;
    }

      const terminalId = createTerminal(
        workspace.path,
        runtimeShell,
        `${agent.name}: ${providerMeta.label}`,
        runtimeCommand,
      metadata
    );

    updateRun(run.id, {
      terminalIds: [terminalId],
      launchMode: 'direct',
      launchState: 'ready',
      summary: summaryPrefix ? `${summaryPrefix} directly` : `${providerMeta.label} launched directly for ${agent.name}`
    });
  };

  continueLaunch();

  return run;
}
