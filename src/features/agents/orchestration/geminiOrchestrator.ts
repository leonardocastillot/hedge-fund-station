import { Type, type FunctionCall, type Tool } from '@google/genai';

export type GeminiOrchestratorActionKind =
  | 'mission'
  | 'agent_run'
  | 'terminal_command'
  | 'backend_action'
  | 'send_to_terminal';

export type GeminiLiveProposalType =
  | 'propose_mission'
  | 'propose_agent_run'
  | 'propose_terminal_command'
  | 'propose_backend_action'
  | 'propose_send_to_terminal';

export type GeminiLiveProposalStatus = 'pending' | 'approved' | 'dismissed' | 'failed';

export interface GeminiLiveProposal {
  id: string;
  callId?: string;
  type: GeminiLiveProposalType;
  kind: GeminiOrchestratorActionKind;
  title: string;
  goal: string;
  command?: string;
  text?: string;
  actionKey?: string;
  target?: string;
  surface?: string;
  reason?: string;
  agentRole?: string;
  status: GeminiLiveProposalStatus;
  createdAt: number;
  args: Record<string, unknown>;
}

export interface GeminiOrchestratorBackendAction {
  actionKey: string;
  label: string;
  description: string;
  effect: 'read_only' | 'research_compute' | 'paper_simulation';
  modeHints: string[];
}

export interface GeminiOrchestratorCapabilityContext {
  appName: string;
  workspace?: {
    id: string;
    name: string;
    path: string;
    shell?: string;
  };
  runtime?: {
    codexConnected: boolean;
    claudeAvailable: boolean;
    apiProviderAvailable: boolean;
    runtimeMode?: string;
    defaultModel?: string | null;
  };
  missionModes: Array<{
    id: string;
    label: string;
    description: string;
    routeRoles: string[];
    appSurfaces: string[];
    backendCapabilities: string[];
  }>;
  agents: Array<{
    id: string;
    name: string;
    role: string;
    provider: string;
    objective?: string;
  }>;
  runtimes: Array<{
    id: string;
    label: string;
    available: boolean;
    status: string;
  }>;
  safeTerminalCommands: Array<{
    command: string;
    purpose: string;
  }>;
  backendActions: GeminiOrchestratorBackendAction[];
  appSurfaces: Array<{
    name: string;
    purpose?: string;
  }>;
  terminal: {
    terminalCount: number;
    activeTerminalId?: string;
    activeLabel?: string;
    activeCwd?: string;
    activeCommand?: string;
    available: boolean;
  };
  recentDrafts: Array<{
    id: string;
    title: string;
    mode: string;
    status: string;
  }>;
  recentRuns: Array<{
    id: string;
    summary: string;
    status: string;
    runtimeProvider: string;
  }>;
  guardrails: string[];
}

export const GEMINI_STABLE_TERMINAL_COMMANDS: Array<{ command: string; purpose: string }> = [
  { command: 'npm run hf:doctor', purpose: 'Inspect hedge fund repo and backend health.' },
  { command: 'npm run hf:status', purpose: 'Fetch the backend operating status.' },
  { command: 'npm run hf:backtest', purpose: 'Run the stable backtest entrypoint.' },
  { command: 'npm run hf:validate', purpose: 'Run the stable validation entrypoint.' },
  { command: 'npm run hf:paper', purpose: 'Inspect or operate the paper workflow entrypoint.' },
  { command: 'npm run hf:agent:status', purpose: 'Inspect Research OS agent runtime status.' },
  { command: 'npm run backend:health', purpose: 'Check local backend health endpoints.' },
  { command: 'npm run gateway:probe', purpose: 'Probe gateway surfaces used by the cockpit.' },
  { command: 'npm run build', purpose: 'Build the Electron app.' }
];

export const GEMINI_BACKEND_ACTIONS: GeminiOrchestratorBackendAction[] = [
  {
    actionKey: 'load-overview',
    label: 'Load Hyperliquid Overview',
    description: 'Fetch current market overview and top opportunity data.',
    effect: 'read_only',
    modeHints: ['market-scan', 'flow-radar']
  },
  {
    actionKey: 'load-alerts',
    label: 'Load Alerts',
    description: 'Fetch recent Hyperliquid alert events.',
    effect: 'read_only',
    modeHints: ['risk-watch', 'market-scan']
  },
  {
    actionKey: 'load-watchlist',
    label: 'Load Watchlist',
    description: 'Fetch current watchlist buckets from the gateway.',
    effect: 'read_only',
    modeHints: ['flow-radar', 'execution-prep']
  },
  {
    actionKey: 'load-strategy-library',
    label: 'Load Strategy Library',
    description: 'Fetch the ranked strategy library from the backend.',
    effect: 'read_only',
    modeHints: ['strategy-lab']
  },
  {
    actionKey: 'load-paper-signals',
    label: 'Load Paper Signals',
    description: 'Inspect current paper signals.',
    effect: 'read_only',
    modeHints: ['execution-prep']
  },
  {
    actionKey: 'load-paper-trades',
    label: 'Load Paper Trades',
    description: 'Inspect current paper-trade results.',
    effect: 'read_only',
    modeHints: ['risk-watch', 'strategy-lab']
  },
  {
    actionKey: 'run-all-backtests',
    label: 'Run All Backtests',
    description: 'Run the controlled backend backtest refresh for the strategy set.',
    effect: 'research_compute',
    modeHints: ['strategy-lab']
  },
  {
    actionKey: 'seed-paper-signals',
    label: 'Seed Paper Signals',
    description: 'Create fresh paper-simulation signals from the gateway.',
    effect: 'paper_simulation',
    modeHints: ['flow-radar', 'strategy-lab', 'execution-prep']
  }
];

const KNOWN_PROPOSAL_TYPES: GeminiLiveProposalType[] = [
  'propose_mission',
  'propose_agent_run',
  'propose_terminal_command',
  'propose_backend_action',
  'propose_send_to_terminal'
];

function getStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : '';
}

function getProposalKind(type: GeminiLiveProposalType): GeminiOrchestratorActionKind {
  switch (type) {
    case 'propose_agent_run':
      return 'agent_run';
    case 'propose_terminal_command':
      return 'terminal_command';
    case 'propose_backend_action':
      return 'backend_action';
    case 'propose_send_to_terminal':
      return 'send_to_terminal';
    case 'propose_mission':
    default:
      return 'mission';
  }
}

function titleForProposal(type: GeminiLiveProposalType, args: Record<string, unknown>): string {
  const explicitTitle = getStringArg(args, 'title');
  if (explicitTitle) {
    return explicitTitle;
  }

  if (type === 'propose_terminal_command') {
    return `Review command: ${getStringArg(args, 'command') || 'terminal command'}`;
  }

  if (type === 'propose_agent_run') {
    return `Proposed ${getStringArg(args, 'agentRole') || 'agent'} run`;
  }

  if (type === 'propose_backend_action') {
    const actionKey = getStringArg(args, 'actionKey') || getStringArg(args, 'backendAction') || getStringArg(args, 'key');
    const action = GEMINI_BACKEND_ACTIONS.find((item) => item.actionKey === actionKey);
    return action ? `Run backend action: ${action.label}` : 'Proposed backend action';
  }

  if (type === 'propose_send_to_terminal') {
    return 'Send text to terminal';
  }

  return 'Proposed mission';
}

export function normalizeGeminiLiveProposal(call: FunctionCall): GeminiLiveProposal | null {
  const type = call.name as GeminiLiveProposalType | undefined;
  if (!type || !KNOWN_PROPOSAL_TYPES.includes(type)) {
    return null;
  }

  const args = (call.args || {}) as Record<string, unknown>;
  const reason = getStringArg(args, 'reason');
  const command = getStringArg(args, 'command');
  const text = getStringArg(args, 'text') || getStringArg(args, 'content');
  const actionKey = getStringArg(args, 'actionKey') || getStringArg(args, 'backendAction') || getStringArg(args, 'key');
  const agentRole = getStringArg(args, 'agentRole') || getStringArg(args, 'role');
  const target = getStringArg(args, 'target');
  const surface = getStringArg(args, 'surface');
  const rawGoal = getStringArg(args, 'goal') || getStringArg(args, 'brief');
  const title = titleForProposal(type, args);
  const goal = rawGoal || [
    title,
    actionKey ? `Backend action: ${actionKey}` : '',
    command ? `Command: ${command}` : '',
    text ? `Terminal text: ${text}` : '',
    agentRole ? `Agent role: ${agentRole}` : '',
    surface ? `Surface: ${surface}` : '',
    reason ? `Reason: ${reason}` : ''
  ].filter(Boolean).join('\n');

  return {
    id: call.id || window.crypto?.randomUUID?.() || `proposal-${Date.now()}`,
    callId: call.id,
    type,
    kind: getProposalKind(type),
    title,
    goal,
    command,
    text,
    actionKey,
    target,
    surface,
    reason,
    agentRole,
    status: 'pending',
    createdAt: Date.now(),
    args
  };
}

export function createGeminiOrchestratorTools(): Tool[] {
  return [{
    functionDeclarations: [
      {
        name: 'propose_mission',
        description: 'Create a pending human-approved mission draft. This must not execute anything.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            goal: { type: Type.STRING },
            reason: { type: Type.STRING }
          },
          required: ['title', 'goal']
        }
      },
      {
        name: 'propose_agent_run',
        description: 'Create a pending proposal to route a mission to another agent. This must not launch the agent.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            agentRole: { type: Type.STRING },
            goal: { type: Type.STRING },
            reason: { type: Type.STRING }
          },
          required: ['title', 'goal']
        }
      },
      {
        name: 'propose_terminal_command',
        description: 'Create a pending terminal command proposal for human approval. Never run the command.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            command: { type: Type.STRING },
            reason: { type: Type.STRING }
          },
          required: ['command', 'reason']
        }
      },
      {
        name: 'propose_backend_action',
        description: 'Create a pending proposal for one registered backend action by actionKey. This must not run the action.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            actionKey: { type: Type.STRING },
            goal: { type: Type.STRING },
            surface: { type: Type.STRING },
            reason: { type: Type.STRING }
          },
          required: ['actionKey', 'reason']
        }
      },
      {
        name: 'propose_send_to_terminal',
        description: 'Create a pending proposal to send text to the active terminal. This must not write to the terminal.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            text: { type: Type.STRING },
            target: { type: Type.STRING },
            reason: { type: Type.STRING }
          },
          required: ['text', 'reason']
        }
      }
    ]
  }];
}

export function buildGeminiOrchestratorSystemContext(context?: GeminiOrchestratorCapabilityContext): string {
  const compactContext = context
    ? JSON.stringify(context)
    : JSON.stringify({
        appName: 'Hedge Fund Station',
        guardrails: [
          'Conversation is free; app actions require human approval.',
          'Never place live trades, change credentials, or claim execution.',
          'Keep trading logic in backend or stable scripts, not the renderer.'
        ],
        backendActions: GEMINI_BACKEND_ACTIONS,
        safeTerminalCommands: GEMINI_STABLE_TERMINAL_COMMANDS
      });

  return [
    'You are Gemini Live, the conversational voice and orchestrator for Hedge Fund Station.',
    'Speak naturally in Spanish unless the operator uses English.',
    'Your job is to help the operator think, plan, and prepare auditable actions across the app.',
    'You understand the app capability map below: mission drafts, specialist agents, terminal/consola, Direct Loop style agent work, stable hf commands, backend inspection/actions, and app review surfaces.',
    'Hard rule: conversation does not need approval, but every app action does.',
    'Hard rule: your tools only create Pending approval cards in the UI. They never execute commands, launch agents, write terminals, run backtests, mutate files, or place trades.',
    'Do not claim that an action has been executed until the UI or operator confirms it after approval.',
    'No live trading, credential changes, hidden automation, or strategy promotion. Backtests, paper signals, alerts, and overview actions are research/ops workflows only.',
    'Use propose_mission for mission drafts, propose_agent_run for specialist routing, propose_terminal_command for commands, propose_backend_action for registered backend actions, and propose_send_to_terminal for terminal text.',
    'When asked what you can do, explain the relevant capabilities from the context instead of generic Gemini abilities.',
    'Keep responses concise, operational, and clear about what needs approval.',
    '',
    'Capability context JSON:',
    compactContext
  ].join('\n');
}
