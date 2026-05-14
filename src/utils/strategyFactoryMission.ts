import type { AgentRole } from '@/types/agents';
import type { MissionDraftInput } from './missionDrafts';
import type { HyperliquidAgentRuntimeStatus, HyperliquidStrategyCatalogRow } from '@/services/hyperliquidService';
import { buildMissionDraftInput } from './missionDrafts';

export type StrategyFactoryFocus = 'auto' | 'scalper' | 'swing';

const STRATEGY_FACTORY_FOCUS_LABELS: Record<StrategyFactoryFocus, string> = {
  auto: 'Auto best edge',
  scalper: 'Scalper',
  swing: 'Swing'
};

const STRATEGY_FACTORY_ROLES: AgentRole[] = ['researcher', 'backtester', 'risk', 'developer', 'data-engineer', 'ops'];

export const STRATEGY_FACTORY_REQUIRED_COMMANDS = [
  'rtk npm run agent:brief',
  'rtk npm run agent:check',
  'rtk npm run hf:doctor',
  'rtk npm run hf:agent:runtime',
  'rtk npm run hf:status',
  'rtk npm run hf:strategy:new -- --strategy-id <new_strategy_id>',
  'rtk npm run hf:backtest',
  'rtk npm run hf:validate',
  'rtk npm run hf:paper',
  'rtk npm run hf:doubling:stability',
  'rtk git diff --check'
];

export function getStrategyFactoryFocusLabel(focus: StrategyFactoryFocus): string {
  return STRATEGY_FACTORY_FOCUS_LABELS[focus];
}

function formatPercent(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return `${numeric.toFixed(Math.abs(numeric) >= 100 ? 0 : 1)}%`;
}

function formatNumber(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return String(Math.round(numeric));
}

function formatDoublingDays(strategy: HyperliquidStrategyCatalogRow): string {
  const days = Number(strategy.doublingEstimate?.projectedDaysToDouble);
  if (!Number.isFinite(days) || days <= 0) return 'n/a';
  if (days < 1) return '<1d';
  return `${days.toFixed(days < 10 ? 1 : 0)}d`;
}

function evidenceScore(strategy: HyperliquidStrategyCatalogRow): number {
  const returnPct = Number(strategy.latestBacktestSummary?.return_pct ?? 0);
  const trades = Number(strategy.latestBacktestSummary?.total_trades ?? strategy.tradeCount ?? 0);
  const doublingDays = Number(strategy.doublingEstimate?.projectedDaysToDouble ?? Infinity);
  const stageScore = strategy.gateStatus === 'paper-active'
    ? 600
    : strategy.gateStatus === 'ready-for-paper'
      ? 500
      : strategy.gateStatus === 'audit-eligible'
        ? 400
        : strategy.gateStatus === 'backtest-running-eligible'
          ? 250
          : strategy.pipelineStage === 'blocked'
            ? -100
            : 0;
  const doublingScore = Number.isFinite(doublingDays) ? Math.max(0, 200 - doublingDays) : 0;
  return stageScore + doublingScore + returnPct + Math.min(trades, 150);
}

function inferEvidenceLean(strategies: HyperliquidStrategyCatalogRow[]): 'scalper' | 'swing' | 'mixed' {
  const text = strategies
    .slice(0, 12)
    .map((strategy) => `${strategy.strategyId} ${strategy.displayName} ${strategy.setupTag || ''}`)
    .join(' ')
    .toLowerCase();
  const scalperHits = (text.match(/scalp|micro|intraday|short[-_ ]?horizon|failed[-_ ]?impulse/g) || []).length;
  const swingHits = (text.match(/swing|trend|cycle|breakout|continuation|multi[-_ ]?day/g) || []).length;

  if (scalperHits > swingHits + 1) return 'scalper';
  if (swingHits > scalperHits + 1) return 'swing';
  return 'mixed';
}

export function buildStrategyFactoryBenchmarkBoard(
  strategies: HyperliquidStrategyCatalogRow[],
  limit = 8
): string[] {
  return [...strategies]
    .sort((left, right) => evidenceScore(right) - evidenceScore(left))
    .slice(0, limit)
    .map((strategy) => {
      const summary = strategy.latestBacktestSummary;
      return [
        `- ${strategy.displayName} (${strategy.strategyId})`,
        `stage=${strategy.pipelineStage}`,
        `gate=${strategy.gateStatus}`,
        `return=${formatPercent(summary?.return_pct)}`,
        `trades=${formatNumber(summary?.total_trades ?? strategy.tradeCount)}`,
        `win=${formatPercent(summary?.win_rate_pct ?? strategy.winRate)}`,
        `max_dd=${formatPercent(summary?.max_drawdown_pct)}`,
        `validation=${strategy.validationStatus || strategy.robustAssessment?.status || 'n/a'}`,
        `2x=${formatDoublingDays(strategy)}`,
        `evidence=${strategy.evidenceCounts.backtestTrades}/${strategy.evidenceCounts.paperCandidates}/${strategy.evidenceCounts.paperTrades}`
      ].join(' | ');
    });
}

export function buildStrategyFactoryGoal(params: {
  focus: StrategyFactoryFocus;
  strategies: HyperliquidStrategyCatalogRow[];
}): string {
  const benchmarkBoard = buildStrategyFactoryBenchmarkBoard(params.strategies);
  const evidenceLean = inferEvidenceLean(params.strategies);
  const focusInstruction = params.focus === 'auto'
    ? `Auto-select scalper or swing only after comparing evidence. Initial catalog lean: ${evidenceLean}.`
    : `Operator override: build a ${params.focus} candidate unless evidence clearly says it is a bad use of this repo.`;
  const registered = params.strategies.filter((strategy) => strategy.registeredForBacktest).length;
  const readyForPaper = params.strategies.filter((strategy) => strategy.gateStatus === 'ready-for-paper' || strategy.gateStatus === 'paper-active').length;
  const blocked = params.strategies.filter((strategy) => strategy.pipelineStage === 'blocked' || strategy.gateStatus === 'audit-blocked').length;

  return [
    'Strategy Factory mission: create one complete, backend-first strategy candidate for Hedge Fund Station.',
    '',
    `Focus: ${getStrategyFactoryFocusLabel(params.focus)}.`,
    focusInstruction,
    '',
    'Current strategy catalog snapshot:',
    `- total strategies: ${params.strategies.length}`,
    `- registered for backtest: ${registered}`,
    `- ready or active paper gates: ${readyForPaper}`,
    `- blocked rows: ${blocked}`,
    '',
    'Comparable benchmark board to beat or learn from:',
    ...(benchmarkBoard.length ? benchmarkBoard : ['- No strategy catalog rows are loaded. Build the board from docs and backend artifacts before proposing a thesis.']),
    '',
    'Required investigation:',
    '- Mine docs/strategies, backend/hyperliquid_gateway/strategies, backtest reports, validation reports, paper candidates, paper ledgers, backend/hyperliquid_gateway/data/agent_runs, docs/operations/agents/memory, progress handoffs, and graph/memory reports when fresh enough.',
    '- Build a comparable benchmark board with the strongest current strategies, rejected strategies, failure modes, and what each suggests about regimes, inputs, indicators, and combinations.',
    '- Choose scalper or swing by evidence unless the operator selected a specific focus.',
    '- The thesis must not be parameter-only curve fitting. Parameters can refine risk, but the main edge must come from a falsifiable market mechanism, data input, regime filter, trigger/invalidation pair, or signal combination.',
    '',
    'Implementation contract:',
    '- Create or materially complete exactly one strategy candidate.',
    '- Write or update docs/strategies/<strategy-id>.md with edge, regime, anti-regime, inputs, entry, invalidation, exit, risk, costs, validation, failure modes, and backend mapping.',
    '- Put deterministic logic in backend/hyperliquid_gateway/strategies/<strategy_id>/, not React or Electron.',
    '- Add focused backend tests where the strategy logic, scoring, risk, or backtest adapter can regress.',
    '- Run the stable hf:* pipeline: doctor, status, strategy new if needed, backtest, validate, and paper candidate only when validation makes it eligible.',
    '- Prepare live-gate notes only as blocked planning after paper evidence, risk review, runbook, and explicit operator sign-off.',
    '',
    'Hard guardrails:',
    '- No live trades, no credential changes, no one-click live promotion, and no non-dry-run paper supervisor loops.',
    '- Do not invent evidence. If evidence is missing, record the gap and stop at the correct gate.',
    '- Do not optimize a tiny historical window just to beat the current board.',
    '- Leave progress/current.md, progress/impl_<task>.md, and progress/history.md in a state the next agent can trust.',
    '',
    'Done means: source/docs/tests are updated, backtest and validation artifacts are named, paper candidate is created only if eligible, live remains blocked, and the final operator brief names files, commands, results, risks, and next gate.'
  ].join('\n');
}

export function buildStrategyFactoryMissionDraftInput(params: {
  workspaceId: string;
  focus: StrategyFactoryFocus;
  strategies: HyperliquidStrategyCatalogRow[];
  runtimeStatus: HyperliquidAgentRuntimeStatus | null;
  claudeAvailable: boolean;
}): MissionDraftInput {
  const goal = buildStrategyFactoryGoal({
    focus: params.focus,
    strategies: params.strategies
  });
  const focusLabel = getStrategyFactoryFocusLabel(params.focus);
  const risks = [
    'No live trades, no order routing, and no credential changes.',
    'No parameter-only curve fitting as the main thesis.',
    'Backend-first strategy logic only; React and Electron stay review/control surfaces.',
    'Paper candidate only after validation evidence; live gate remains blocked without operator sign-off.',
    'Use stable hf:* commands and leave inspectable artifacts, reports, and handoff notes.'
  ];

  return buildMissionDraftInput({
    workspaceId: params.workspaceId,
    goal,
    runtimeStatus: params.runtimeStatus,
    claudeAvailable: params.claudeAvailable,
    mode: 'strategy-lab',
    preferredRuntime: 'codex',
    title: `Strategy Factory: ${focusLabel}`,
    suggestedRoles: STRATEGY_FACTORY_ROLES,
    backendActions: [],
    proposedCommands: STRATEGY_FACTORY_REQUIRED_COMMANDS,
    risks,
    evidenceRefs: [
      {
        id: 'strategy-catalog',
        kind: 'command',
        label: 'Strategy catalog snapshot',
        summary: `${params.strategies.length} strategies loaded from Strategy Pipeline`
      },
      {
        id: 'strategy-docs',
        kind: 'command',
        label: 'Strategy docs',
        path: 'docs/strategies'
      },
      {
        id: 'strategy-backend',
        kind: 'command',
        label: 'Backend strategy packages',
        path: 'backend/hyperliquid_gateway/strategies'
      },
      {
        id: 'agent-runs',
        kind: 'agent-run',
        label: 'Agent run evidence',
        path: 'backend/hyperliquid_gateway/data/agent_runs'
      }
    ]
  });
}
