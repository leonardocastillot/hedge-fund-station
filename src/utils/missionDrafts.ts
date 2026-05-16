import type { AgentProvider, AgentRole } from '@/types/agents';
import type { MissionBackendAction, MissionDraft, MissionPacket } from '@/types/tasks';
import type { HyperliquidAgentRuntimeStatus } from '@/services/hyperliquidService';
import { getProviderMeta, inferRequestedProvider } from './agentRuntime';
import {
  formatRoleLabel,
  inferAgentRoles,
  inferMissionMode,
  MISSION_MODE_CONFIG,
  type MissionMode
} from './missionControl';

export type MissionDraftInput = Omit<MissionDraft, 'id' | 'createdAt' | 'updatedAt'>;

export function getProposedCommands(mode: MissionMode): string[] {
  switch (mode) {
    case 'strategy-lab':
      return [
        'rtk npm run hf:status',
        'rtk npm run hf:agent:research -- --strategy <strategy_id>',
        'rtk npm run hf:backtest',
        'rtk npm run hf:validate'
      ];
    case 'flow-radar':
      return ['rtk npm run gateway:probe', 'rtk npm run hf:status'];
    case 'risk-watch':
      return ['rtk npm run backend:health', 'rtk npm run gateway:probe'];
    case 'execution-prep':
      return ['rtk npm run hf:status', 'rtk npm run gateway:health'];
    case 'build-fix':
      return ['rtk git status --short', 'rtk npx tsc --noEmit', 'rtk npm run build'];
    case 'market-scan':
    default:
      return ['rtk npm run backend:health', 'rtk npm run gateway:probe'];
  }
}

export function extractStrategyId(goal: string): string | undefined {
  const patterns = [
    /--strategy\s+([a-zA-Z0-9_-]+)/,
    /\bstrategy(?:\s+id)?[:=]\s*([a-zA-Z0-9_-]+)/i,
    /\bestrategia(?:\s+id)?[:=]?\s+([a-zA-Z0-9_-]+)/i
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/-/g, '_').toLowerCase();
    }
  }
  return undefined;
}

export function buildBackendActions(mode: MissionMode, strategyId?: string): MissionBackendAction[] {
  if (!strategyId || !['strategy-lab', 'risk-watch', 'flow-radar', 'market-scan'].includes(mode)) {
    return [];
  }
  const kind = mode === 'risk-watch' ? 'agent-audit' : 'agent-research';
  const subcommand = kind === 'agent-audit' ? 'audit' : 'research';
  return [{
    id: `${kind}:${strategyId}`,
    kind,
    label: kind === 'agent-audit' ? 'Research OS audit preflight' : 'Research OS research preflight',
    command: `rtk npm run hf:agent:${subcommand} -- --strategy ${strategyId} --runtime auto`,
    strategyId,
    status: 'proposed'
  }];
}

export function buildRuntimePlan(params: {
  preferredRuntime: AgentProvider;
  runtimeStatus: HyperliquidAgentRuntimeStatus | null;
  claudeAvailable: boolean;
}): MissionPacket['runtimePlan'] {
  const backendRuntime = params.runtimeStatus?.runtimeMode || 'auto';
  const codexConnected = Boolean(params.runtimeStatus?.codexAuthenticated);
  const apiProviderAvailable = Boolean(params.runtimeStatus?.apiProviderAvailable);
  const parts = [
    `Frontier: ${getProviderMeta(params.preferredRuntime).label}`,
    `Research OS: ${backendRuntime}`,
    codexConnected ? 'Codex connected' : 'Codex login pending',
    params.claudeAvailable ? 'Claude CLI available' : 'Claude CLI not detected'
  ];
  return {
    preferredRuntime: params.preferredRuntime,
    backendRuntime,
    codexConnected,
    claudeAvailable: params.claudeAvailable,
    apiProviderAvailable,
    defaultModel: params.runtimeStatus?.defaultModel || null,
    summary: parts.join(' | ')
  };
}

export function getRiskNotes(mode: MissionMode): string[] {
  const base = [
    'Do not place live trades, route orders, or change credentials.',
    'Ask before mutating source files, services, data, or long-running processes.'
  ];

  if (mode === 'strategy-lab') {
    return [
      ...base,
      'Do not claim edge without backtest, replay, validation, or paper evidence.',
      'Live promotion stays blocked until research, backtest, validation, paper evidence, risk review, runbook, and operator sign-off are inspectable.'
    ];
  }

  if (mode === 'execution-prep') {
    return [...base, 'Treat output as operator planning only; no order routing.'];
  }

  return [...base, 'Prefer read-only inspection until the operator approves a concrete action.'];
}

export function buildCodexPrompt(params: {
  goal: string;
  mode: MissionMode;
  suggestedRoles: AgentRole[];
  proposedCommands: string[];
  risks: string[];
  missionPacket?: MissionPacket;
}): string {
  const config = MISSION_MODE_CONFIG[params.mode];

  return [
    `You are ${params.missionPacket ? getProviderMeta(params.missionPacket.frontierRuntime).label : 'Codex'} inside Hedge Fund Station.`,
    'Read AGENTS.md first and follow the hedge fund workspace constitution.',
    '',
    `Mission mode: ${config.title}`,
    `Goal: ${params.goal}`,
    `Suggested specialist lens: ${params.suggestedRoles.map(formatRoleLabel).join(', ') || 'Commander'}`,
    params.missionPacket?.strategyId ? `Strategy ID: ${params.missionPacket.strategyId}` : '',
    params.missionPacket ? `Runtime plan: ${params.missionPacket.runtimePlan.summary}` : '',
    '',
    params.missionPacket?.evidenceRefs.length ? 'Evidence refs:' : '',
    ...(params.missionPacket?.evidenceRefs.map((ref) => `- ${ref.label}: ${ref.path || ref.runId || ref.summary || ref.id}`) || []),
    params.missionPacket?.backendActions.length ? 'Research OS backend actions:' : '',
    ...(params.missionPacket?.backendActions.map((action) => `- ${action.label}: ${action.command} (${action.status})${action.path ? ` -> ${action.path}` : ''}`) || []),
    '',
    'Guardrails:',
    ...params.risks.map((risk) => `- ${risk}`),
    '- Keep heavy market logic, replay, validation, and paper evidence in backend/scripts, not React.',
    '- Use stable hf:* commands and documented backend probes before ad hoc commands.',
    '',
    'Operator-approved command shortlist:',
    ...params.proposedCommands.map((command) => `- ${command}`),
    '',
    'Deliverable:',
    `- ${config.deliverables.join('\n- ')}`,
    '',
    'Return a concise operator brief with files inspected, commands run, evidence found, blockers, and next action.'
  ].join('\n');
}

function normalizeCommands(commands: string[]): string[] {
  return commands
    .map((command) => command.trim())
    .filter((command, index, allCommands) => command.length > 0 && !command.includes('<strategy_id>') && allCommands.indexOf(command) === index);
}

export function buildMissionDraftInput(params: {
  workspaceId: string;
  conversationId?: string;
  goal: string;
  runtimeStatus: HyperliquidAgentRuntimeStatus | null;
  claudeAvailable: boolean;
  mode?: MissionMode;
  preferredRuntime?: AgentProvider;
  strategyId?: string;
  title?: string;
  suggestedRoles?: AgentRole[];
  backendActions?: MissionBackendAction[];
  evidenceRefs?: MissionPacket['evidenceRefs'];
  outputs?: MissionPacket['outputs'];
  proposedCommands?: string[];
  risks?: string[];
  missionPacket?: MissionPacket;
  finalPrompt?: string;
  approvalStatus?: MissionDraft['approvalStatus'];
}): MissionDraftInput {
  const mode = params.mode || inferMissionMode(params.goal);
  const strategyId = params.strategyId ?? extractStrategyId(params.goal);
  const preferredRuntime = params.preferredRuntime || inferRequestedProvider(params.goal) || 'codex';
  const suggestedRoles = params.suggestedRoles || Array.from(new Set([...MISSION_MODE_CONFIG[mode].routeRoles, ...inferAgentRoles(params.goal)]));
  const backendActions = params.backendActions ?? buildBackendActions(mode, strategyId);
  const proposedCommands = normalizeCommands(params.proposedCommands || [
    ...backendActions.map((action) => action.command),
    ...getProposedCommands(mode).map((command) => strategyId ? command.replace('<strategy_id>', strategyId) : command)
  ]);
  const risks = params.risks || getRiskNotes(mode);
  const title = params.title || `${MISSION_MODE_CONFIG[mode].title}: ${params.goal.slice(0, 56)}`;
  const missionPacket = params.missionPacket || {
    missionId: `mission-${Date.now()}`,
    workspaceId: params.workspaceId,
    mode,
    goal: params.goal,
    strategyId,
    runtimePlan: buildRuntimePlan({
      preferredRuntime,
      runtimeStatus: params.runtimeStatus,
      claudeAvailable: params.claudeAvailable
    }),
    frontierRuntime: preferredRuntime,
    backendActions,
    evidenceRefs: params.evidenceRefs || [],
    guardrails: risks,
    approvalState: 'awaiting-approval',
    outputs: params.outputs || []
  };
  const finalPrompt = params.finalPrompt || buildCodexPrompt({
    goal: params.goal,
    mode,
    suggestedRoles,
    proposedCommands,
    risks,
    missionPacket
  });

  return {
    workspaceId: params.workspaceId,
    conversationId: params.conversationId,
    title,
    goal: params.goal,
    mode,
    suggestedRoles,
    proposedCommands,
    risks,
    finalPrompt,
    missionPacket,
    approvalStatus: params.approvalStatus || 'awaiting-approval'
  };
}
