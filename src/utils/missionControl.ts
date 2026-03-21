import type { AgentRole } from '../types/agents';
import type { ObsidianRelevantNote } from '../types/electron';
import type { MissionDepth, MissionExecutionMode, MissionTaskMetadata, MissionWorkflowStep } from '../types/tasks';

export type MissionMode =
  | 'market-scan'
  | 'flow-radar'
  | 'strategy-lab'
  | 'risk-watch'
  | 'execution-prep'
  | 'build-fix';

export interface MissionModeConfig {
  id: MissionMode;
  label: string;
  title: string;
  description: string;
  placeholder: string;
  quickPrompt: string;
  guidedInput: string;
  deliverables: string[];
  datasets: string[];
  successCriteria: string[];
  guardrails: string[];
  appSurfaces: string[];
  backendCapabilities: string[];
  completionGate: string[];
  workflow: MissionWorkflowStep[];
  routeRoles: AgentRole[];
  recommendedExecutionMode: MissionExecutionMode;
  accent: string;
}

export const MISSION_MODE_CONFIG: Record<MissionMode, MissionModeConfig> = {
  'market-scan': {
    id: 'market-scan',
    label: 'Market Scan',
    title: 'Market Scan',
    description: 'Read the tape, separate noise from signal, and leave a tradable map.',
    placeholder: 'Objective, market, timeframes, key datasets, and what decision you need before the session.',
    quickPrompt: 'Analyze BTC, macro, liquidity, and positioning to leave an actionable market scan with scenarios, levels, and risks for today.',
    guidedInput: [
      'Objective: Build today\'s market scan for BTC or the active focus market.',
      'Scope: define dominant regime, scenario tree, key levels, and main risks.',
      'Timeframes: 1D, 4H, 1H.',
      'Data to use: price structure, macro calendar, open interest, funding, liquidations.',
      'Deliverable: base case, alternate case, invalidation, and what to monitor next.',
      'Constraint: keep it actionable and concise; no generic market commentary.'
    ].join('\n'),
    deliverables: ['Market bias', 'Macro drivers', 'Levels and scenarios'],
    datasets: ['Macro calendar', 'Liquidations', 'Open interest', 'Price structure'],
    successCriteria: ['Base and alternate case', 'Concrete levels', 'Dominant risk identified'],
    guardrails: ['No edge claims without levels', 'Separate base case from alternate case', 'End with what changes the bias'],
    appSurfaces: ['Economic Calendar', 'Hyperliquid Intelligence', 'Hyperliquid Data'],
    backendCapabilities: ['Hyperliquid overview', 'alerts', 'watchlist snapshots'],
    completionGate: ['Bias documented', 'Invalidation documented', 'Next market trigger documented'],
    workflow: [
      {
        role: 'market-structure',
        label: 'Map Structure',
        objective: 'Classify regime, map levels, and define the scenario tree.',
        output: 'Bias, levels, timeframes, and structural invalidation.',
        handoff: 'Pass the regime map to derivatives and researcher.'
      },
      {
        role: 'derivatives',
        label: 'Check Positioning',
        objective: 'Confirm whether positioning supports or contradicts the structure map.',
        output: 'Funding, OI, liquidation stress, and crowding summary.',
        handoff: 'Pass positioning confirmation or contradiction to the final scan.'
      },
      {
        role: 'researcher',
        label: 'Context Filter',
        objective: 'Bring in only the most relevant prior notes, catalysts, and regime reminders.',
        output: 'Short context notes that sharpen the market read.',
        handoff: 'End with the one thing the desk should monitor next.'
      }
    ],
    routeRoles: ['market-structure', 'derivatives', 'researcher'],
    recommendedExecutionMode: 'squad',
    accent: '#38bdf8'
  },
  'flow-radar': {
    id: 'flow-radar',
    label: 'Flow Radar',
    title: 'Flow Radar',
    description: 'Rank crowding, stress, and abnormal positioning across the universe.',
    placeholder: 'Universe, ranking criteria, flow signals to scan, and the expected output format.',
    quickPrompt: 'Scan Hyperliquid for abnormal volume, extreme open interest, imbalanced funding, and smart-money activity.',
    guidedInput: [
      'Objective: Scan the Hyperliquid universe for positioning stress and asymmetric flow.',
      'Universe: BTC, ETH, majors, or full perp watchlist.',
      'Rank by: abnormal volume, OI expansion, funding extreme, liquidation pressure, trade-flow imbalance.',
      'Deliverable: top opportunities, reason for rank, trigger to watch, and no-trade cases.',
      'Constraint: prioritize quality over count; ignore symbols without clear follow-through.'
    ].join('\n'),
    deliverables: ['Opportunity ranking', 'Flow explanation', 'Setups to monitor'],
    datasets: ['Hyperliquid prices', 'Funding', 'Open interest', 'Whales / smart money'],
    successCriteria: ['Top opportunities prioritized', 'Reason for score', 'Monitoring triggers defined'],
    guardrails: ['Rank only symbols with explicit reasons', 'Flag no-trade symbols', 'Keep triggers concrete'],
    appSurfaces: ['Hyperliquid Intelligence', 'Hyperliquid Data', 'Hyperliquid Paper Lab'],
    backendCapabilities: ['Hyperliquid overview', 'watchlist', 'paper signal seeding'],
    completionGate: ['Ranked watchlist exists', 'No-trade list exists', 'Triggers are concrete'],
    workflow: [
      {
        role: 'derivatives',
        label: 'Rank Stress',
        objective: 'Find where positioning stress or crowding is building.',
        output: 'Top ranked symbols with crowding and stress explanation.',
        handoff: 'Pass only top candidates to market-structure and risk.'
      },
      {
        role: 'market-structure',
        label: 'Validate Structure',
        objective: 'Check if the ranked symbols have structure that supports a tradable setup.',
        output: 'Levels, trigger zones, and symbols to ignore.',
        handoff: 'Pass supported setups to risk.'
      },
      {
        role: 'risk',
        label: 'Reject Weak Setups',
        objective: 'Kill low-quality ideas and isolate unsafe crowding.',
        output: 'Do-not-trade conditions and the top safe watchlist.',
        handoff: 'End with a ranked monitor list.'
      }
    ],
    routeRoles: ['derivatives', 'market-structure', 'risk'],
    recommendedExecutionMode: 'pipeline',
    accent: '#22c55e'
  },
  'strategy-lab': {
    id: 'strategy-lab',
    label: 'Strategy Lab',
    title: 'Strategy Research',
    description: 'Turn an insight into a testable strategy and a real validation path.',
    placeholder: 'Market, horizon, available data, hypothetical edge, and the validation gate you want to decide.',
    quickPrompt: 'Find one strategy idea with edge, define the hypothesis, rules, filters, invalidations, and the backtest plan.',
    guidedInput: [
      'Objective: find or refine one short-horizon strategy idea worth validating in this repo.',
      'Market: specify BTC, ETH, Hyperliquid perp universe, or another market.',
      'Edge hypothesis: describe the crowding, regime, or trigger you want investigated.',
      'Rules needed: entry, filters, invalidation, exit, sizing assumptions, fee/slippage assumptions.',
      'Validation path: use this repo\'s real strategy library, backtest endpoint, replay flow, and paper lab. Do not invent results.',
      'Decision gate: reject | needs-more-data | ready-for-backtest | ready-for-paper.'
    ].join('\n'),
    deliverables: ['Edge hypothesis', 'Operable rules', 'Backtest and paper plan'],
    datasets: ['Research memory', 'Liquidations', 'Open interest', 'Historical candles', 'Strategy library', 'Paper lab'],
    successCriteria: ['Falsifiable hypothesis', 'Unambiguous rules', 'Real validation path mapped'],
    guardrails: ['One strategy idea per mission', 'No invented validation results', 'Reference real repo backtest and paper capabilities'],
    appSurfaces: ['Strategy Library', 'Strategy Detail', 'Hyperliquid Paper Lab', 'Portfolio Dashboard'],
    backendCapabilities: ['Strategy library API', 'runAllBacktests', 'paper signals', 'paper trades', 'strategy detail backtests'],
    completionGate: ['Hypothesis is explicit', 'Validation evidence exists', 'Decision gate is saved'],
    workflow: [
      {
        role: 'researcher',
        label: 'Define Hypothesis',
        objective: 'Convert the idea into a falsifiable setup with explicit market regime and data dependencies.',
        output: 'Hypothesis, regime, trigger logic, invalidation, and failure modes.',
        handoff: 'Pass only a testable spec to the backtester.'
      },
      {
        role: 'backtester',
        label: 'Map Validation',
        objective: 'Map the strategy to the real backtest, replay, strategy library, and paper workflow in this repo.',
        output: 'Backtest plan, repo/API mapping, metrics to inspect, and what cannot yet be validated.',
        handoff: 'Pass validation evidence and gaps to risk.'
      },
      {
        role: 'risk',
        label: 'Decision Gate',
        objective: 'Decide whether the idea should be rejected, researched further, backtested, or moved to paper.',
        output: 'Decision gate, failure cases, and next validation step.',
        handoff: 'End with one explicit next action.'
      }
    ],
    routeRoles: ['researcher', 'backtester', 'risk'],
    recommendedExecutionMode: 'pipeline',
    accent: '#a78bfa'
  },
  'risk-watch': {
    id: 'risk-watch',
    label: 'Risk Watch',
    title: 'Risk Watch',
    description: 'Surface the market and infrastructure risks that can break the session.',
    placeholder: 'Session or period, risks to watch, stack to review, and the preventive action you expect.',
    quickPrompt: 'Run a market and operational risk review with alerts, defensive triggers, and preventive actions.',
    guidedInput: [
      'Objective: identify the highest-impact market and infrastructure risks before or during the session.',
      'Scope: macro events, positioning stress, liquidity, backend/runtime health, and operator constraints.',
      'Deliverable: ranked alerts, invalidation triggers, defensive actions, and kill-switch conditions.',
      'Constraint: focus on what can materially hurt the desk today or this week.'
    ].join('\n'),
    deliverables: ['Priority alerts', 'Detected risks', 'Preventive actions'],
    datasets: ['Liquidations', 'Funding', 'Open interest', 'Runtime health'],
    successCriteria: ['Main risk identified', 'Invalidation conditions', 'Actionable mitigation'],
    guardrails: ['Rank risks by impact', 'Include infrastructure risks when relevant', 'End with defensive triggers'],
    appSurfaces: ['Economic Calendar', 'Hyperliquid Data', 'Hyperliquid Paper Lab'],
    backendCapabilities: ['Hyperliquid alerts', 'paper session analytics', 'paper trades'],
    completionGate: ['Main risk ranked', 'Kill-switch written', 'Preventive action assigned'],
    workflow: [
      {
        role: 'risk',
        label: 'Rank Risk',
        objective: 'List the highest-impact market risks and what would invalidate current assumptions.',
        output: 'Top risks, impact, and invalidation triggers.',
        handoff: 'Pass the risk map to derivatives and ops.'
      },
      {
        role: 'derivatives',
        label: 'Stress Check',
        objective: 'Check whether positioning stress and crowding amplify those risks.',
        output: 'Funding, OI, and liquidation context that changes risk severity.',
        handoff: 'Pass the flow-stress assessment to ops.'
      },
      {
        role: 'ops',
        label: 'Operational Guard',
        objective: 'Verify if services, data feeds, or terminals can fail the session.',
        output: 'Operational blockers and preventive actions.',
        handoff: 'End with the kill-switch checklist.'
      }
    ],
    routeRoles: ['risk', 'derivatives', 'ops'],
    recommendedExecutionMode: 'squad',
    accent: '#f59e0b'
  },
  'execution-prep': {
    id: 'execution-prep',
    label: 'Execution Prep',
    title: 'Execution Prep',
    description: 'Turn the thesis into triggers, invalidation, sizing, and a clean checklist.',
    placeholder: 'Asset, thesis, scenarios, expected trigger, and sizing or invalidation rules.',
    quickPrompt: 'Prepare the session execution plan with triggers, invalidations, sizing, and a checklist before entering the market.',
    guidedInput: [
      'Objective: turn the thesis into an executable plan for the current session.',
      'Asset and setup: specify the market and long or short thesis.',
      'Need: entry trigger, invalidation, stop logic, take-profit logic, sizing, and no-trade conditions.',
      'Deliverable: exact checklist the desk can execute without ambiguity.',
      'Constraint: if the trigger is vague, reject the setup.'
    ].join('\n'),
    deliverables: ['Entry plan', 'Invalidations', 'Pre-trade checklist'],
    datasets: ['Market structure', 'Funding / OI', 'Risk limits'],
    successCriteria: ['Clear triggers', 'Concrete invalidation', 'Sizing plan defined'],
    guardrails: ['No vague triggers', 'Explicit no-trade condition required', 'Sizing must reference risk limits'],
    appSurfaces: ['Hyperliquid Intelligence', 'Hyperliquid Data', 'Hyperliquid Paper Lab'],
    backendCapabilities: ['Hyperliquid watchlist', 'paper signals', 'paper trades'],
    completionGate: ['Trigger is exact', 'No-trade condition exists', 'Checklist is complete'],
    workflow: [
      {
        role: 'market-structure',
        label: 'Scenario Map',
        objective: 'Define the structural scenarios and levels that matter for execution.',
        output: 'Scenario tree, levels, and structural invalidation.',
        handoff: 'Pass scenarios to execution.'
      },
      {
        role: 'execution',
        label: 'Execution Plan',
        objective: 'Turn the thesis into concrete entry, stop, target, and checklist rules.',
        output: 'Trade plan with exact triggers and operator checklist.',
        handoff: 'Pass the execution plan to risk.'
      },
      {
        role: 'risk',
        label: 'Block Bad Trades',
        objective: 'Reject weak triggers and constrain risk before action.',
        output: 'Position sizing guardrails and no-trade conditions.',
        handoff: 'End with the final go/no-go rule.'
      }
    ],
    routeRoles: ['execution', 'market-structure', 'risk'],
    recommendedExecutionMode: 'pipeline',
    accent: '#34d399'
  },
  'build-fix': {
    id: 'build-fix',
    label: 'Build/Fix',
    title: 'Build Or Fix',
    description: 'Fix product, data, or tooling issues without losing operational traceability.',
    placeholder: 'Problem, impact, affected area, done criteria, and required validation.',
    quickPrompt: 'Diagnose and fix the technical problem, leave final validation and visible residual risks.',
    guidedInput: [
      'Objective: diagnose and fix one concrete product, data, or tooling issue.',
      'Problem: describe the observed bug or failure and its impact.',
      'Need: root cause, code or data change, validation step, and residual risk.',
      'Constraint: verify the fix; do not stop at speculation.'
    ].join('\n'),
    deliverables: ['Root cause', 'Applied fix', 'Final validation'],
    datasets: ['Repo state', 'Logs', 'Runtime health', 'Tests'],
    successCriteria: ['Root cause proven', 'Change applied', 'Verification executed'],
    guardrails: ['No speculative fixes', 'Verification required', 'State residual risks explicitly'],
    appSurfaces: ['AI Station', 'Hyperliquid Data', 'Strategy Library'],
    backendCapabilities: ['Strategy library API', 'paper trades', 'runtime health'],
    completionGate: ['Root cause identified', 'Validation executed', 'Residual risk recorded'],
    workflow: [
      {
        role: 'developer',
        label: 'Fix Root Cause',
        objective: 'Identify and implement the code change that addresses the real defect.',
        output: 'Root cause and code change summary.',
        handoff: 'Pass the change to data-engineer and ops validation.'
      },
      {
        role: 'data-engineer',
        label: 'Validate Data Path',
        objective: 'Check whether data contracts, schemas, and service assumptions still hold.',
        output: 'Data-path validation and trustworthiness notes.',
        handoff: 'Pass operational concerns to ops.'
      },
      {
        role: 'ops',
        label: 'Runtime Verify',
        objective: 'Verify the fix at runtime and surface remaining operational risk.',
        output: 'Validation result and residual risk list.',
        handoff: 'End with the next verification or deploy step.'
      }
    ],
    routeRoles: ['developer', 'data-engineer', 'ops'],
    recommendedExecutionMode: 'pipeline',
    accent: '#f87171'
  }
};

export function buildGuidedMissionInput(mode: MissionMode) {
  return MISSION_MODE_CONFIG[mode].guidedInput;
}

export function inferMissionMode(goal: string): MissionMode {
  const normalized = goal.toLowerCase();
  if (/(flow|funding|oi|open interest|whale|smart money|hyperliquid)/.test(normalized)) {
    return 'flow-radar';
  }
  if (/(bug|fix|build|code|test|refactor|feature|ui|app|repo|backend|dashboard)/.test(normalized)) {
    return 'build-fix';
  }
  if (/(risk|drawdown|incident|alert|exposure|volatil|fragility|hedge)/.test(normalized)) {
    return 'risk-watch';
  }
  if (/(execute|execution|entry|session|setup|trigger|stop|invalid)/.test(normalized)) {
    return 'execution-prep';
  }
  if (/(strategy|edge|hypothesis|backtest|alpha|insight)/.test(normalized)) {
    return 'strategy-lab';
  }
  return 'market-scan';
}

export function inferAgentRoles(goal: string): AgentRole[] {
  const normalized = goal.toLowerCase();
  const roles = new Set<AgentRole>(['commander']);

  if (/(bug|fix|build|code|test|refactor|feature|ui|app|repo)/.test(normalized)) {
    roles.add('developer');
    roles.add('data-engineer');
  }
  if (/(backtest|replay|paper|validation)/.test(normalized)) {
    roles.add('backtester');
  }
  if (/(trade|market|btc|eth|alt|execution|entry|setup|signal|desk)/.test(normalized)) {
    roles.add('market-structure');
    roles.add('execution');
  }
  if (/(flow|funding|oi|open interest|liquidation|perp|position|whale|smart money|hyperliquid)/.test(normalized)) {
    roles.add('derivatives');
    roles.add('risk');
  }
  if (/(research|investigate|analyze|analyse|summary|look into|context|playbook|video)/.test(normalized)) {
    roles.add('researcher');
  }
  if (/(logs|docker|deploy|service|backend|runtime|crash|health|ops)/.test(normalized)) {
    roles.add('ops');
  }

  return Array.from(roles);
}

export function inferRolesFromMemory(notes: ObsidianRelevantNote[]): AgentRole[] {
  const roles = new Set<AgentRole>();

  for (const note of notes) {
    const fields = [note.type || '', note.domain || '', ...note.tags, note.name].join(' ').toLowerCase();
    if (/(backend|ops|runtime|incident|deploy|service|terminal)/.test(fields)) {
      roles.add('ops');
    }
    if (/(code|repo|ui|frontend|typescript|fix|review|architecture|pipeline)/.test(fields)) {
      roles.add('developer');
      roles.add('data-engineer');
    }
    if (/(backtest|replay|paper|validation|journal|trade review)/.test(fields)) {
      roles.add('backtester');
    }
    if (/(research|thesis|summary|analysis|context|video|playbook)/.test(fields)) {
      roles.add('researcher');
    }
    if (/(trade|market|desk|signal|strategy|execution|trigger)/.test(fields)) {
      roles.add('execution');
      roles.add('market-structure');
    }
    if (/(liquidation|funding|open interest|oi|perp|whale|smart money|hyperliquid|risk)/.test(fields)) {
      roles.add('derivatives');
      roles.add('risk');
    }
  }

  return Array.from(roles);
}

export function formatRoleLabel(role: string) {
  return role
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildMissionMetadata(params: {
  goal: string;
  missionMode: MissionMode;
  missionDepth: MissionDepth;
  pinnedNotes: ObsidianRelevantNote[];
  memoryNotes: ObsidianRelevantNote[];
}): MissionTaskMetadata {
  const { goal, missionMode, missionDepth, pinnedNotes, memoryNotes } = params;
  const config = MISSION_MODE_CONFIG[missionMode];
  const contextLines = [...pinnedNotes, ...memoryNotes]
    .slice(0, 4)
    .map((note) => `${note.name}${note.domain ? ` (${note.domain})` : ''}`);

  return {
    mode: config.id,
    depth: missionDepth,
    executionMode: missionDepth === 'deep' ? 'pipeline' : config.recommendedExecutionMode,
    routeRoles: config.routeRoles,
    deliverables: config.deliverables,
    datasets: config.datasets,
    successCriteria: config.successCriteria,
    guardrails: config.guardrails,
    guidedInput: config.guidedInput,
    workflow: config.workflow,
    appSurfaces: config.appSurfaces,
    backendCapabilities: config.backendCapabilities,
    completionGate: config.completionGate,
    briefing: [
      `Mission Type: ${config.title}`,
      `Depth: ${missionDepth}`,
      `Execution: ${missionDepth === 'deep' ? 'pipeline' : config.recommendedExecutionMode}`,
      `Goal: ${goal.trim() || config.quickPrompt}`,
      `Datasets: ${config.datasets.join('; ')}`,
      `Deliverables: ${config.deliverables.join('; ')}`,
      `Success Criteria: ${config.successCriteria.join('; ')}`,
      `Guardrails: ${config.guardrails.join('; ')}`,
      `App Surfaces: ${config.appSurfaces.join('; ')}`,
      `Backend: ${config.backendCapabilities.join('; ')}`,
      `Completion Gate: ${config.completionGate.join('; ')}`,
      `Workflow: ${config.workflow.map((step) => `${step.label} -> ${formatRoleLabel(step.role)}`).join(' | ')}`,
      contextLines.length > 0 ? `Relevant Memory: ${contextLines.join(' | ')}` : 'Relevant Memory: none attached'
    ].join('\n')
  };
}

export function getRoleOperatingBrief(role: AgentRole): string {
  switch (role) {
    case 'commander':
      return 'Own the plan, assign work deliberately, reconcile conflicts across specialists, and end with a ranked action list.';
    case 'backtester':
      return 'Use the real backtest, replay, strategy library, and paper-trade workflow in this repo. Do not invent validation results.';
    case 'market-structure':
      return 'Focus on price structure, levels, trend state, volatility regime, and scenario mapping across timeframes.';
    case 'derivatives':
      return 'Focus on open interest, funding, liquidations, crowding, squeezes, and positioning stress.';
    case 'execution':
      return 'Turn thesis into triggers, entries, invalidations, sizing guidance, and an execution checklist.';
    case 'trader':
      return 'Focus on tradable setups, session planning, and what the desk should actually do next.';
    case 'risk':
      return 'Pressure test the thesis, surface failure modes, define invalidation, and quantify where conditions are unsafe.';
    case 'researcher':
      return 'Fuse notes, videos, prior research, and context into concise evidence that helps decision quality.';
    case 'data-engineer':
      return 'Validate data quality, APIs, schemas, joins, and operational trustworthiness of the signal stack.';
    case 'developer':
      return 'Implement and verify concrete code changes, tests, and runtime validation steps.';
    case 'ops':
      return 'Check services, logs, terminals, health, and operational blockers that can invalidate execution.';
    case 'executor':
    default:
      return 'Execute the task directly and report the exact outcome, blockers, and next step.';
  }
}
