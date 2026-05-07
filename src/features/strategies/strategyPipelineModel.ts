import type { HyperliquidPipelineStage, HyperliquidStrategyCatalogRow } from '@/services/hyperliquidService';

export type ActionablePipelineStage = Extract<HyperliquidPipelineStage, 'backtesting' | 'audit' | 'paper' | 'blocked'>;

export const ACTIONABLE_PIPELINE_STAGES: ActionablePipelineStage[] = ['backtesting', 'audit', 'paper', 'blocked'];

const ACTIONABLE_STAGE_RANK: Record<ActionablePipelineStage, number> = {
  paper: 0,
  audit: 1,
  backtesting: 2,
  blocked: 3
};

const INVENTORY_STAGE_RANK: Record<HyperliquidPipelineStage, number> = {
  paper: 0,
  audit: 1,
  backtesting: 2,
  blocked: 3,
  research: 4
};

function hasStrategyEvidence(strategy: HyperliquidStrategyCatalogRow): boolean {
  return Boolean(
    strategy.latestArtifactPaths.backtest ||
      strategy.latestArtifactPaths.validation ||
      strategy.latestArtifactPaths.paper ||
      strategy.evidenceCounts.backtestTrades > 0 ||
      strategy.evidenceCounts.paperCandidates > 0 ||
      strategy.evidenceCounts.paperSignals > 0 ||
      strategy.evidenceCounts.paperTrades > 0
  );
}

export function isActionablePipelineStrategy(strategy: HyperliquidStrategyCatalogRow): boolean {
  if (strategy.strategyId.startsWith('runtime:')) return false;
  if (strategy.pipelineStage !== 'research') return true;
  return strategy.registeredForBacktest || strategy.canBacktest || hasStrategyEvidence(strategy);
}

export function actionableStageFor(strategy: HyperliquidStrategyCatalogRow): ActionablePipelineStage | null {
  if (!isActionablePipelineStrategy(strategy)) return null;
  if (strategy.pipelineStage === 'research') return 'backtesting';
  return strategy.pipelineStage;
}

export function sortActionableStrategies(strategies: HyperliquidStrategyCatalogRow[]): HyperliquidStrategyCatalogRow[] {
  return [...strategies].sort((left, right) => {
    const leftStage = actionableStageFor(left) ?? 'blocked';
    const rightStage = actionableStageFor(right) ?? 'blocked';
    const stageDelta = ACTIONABLE_STAGE_RANK[leftStage] - ACTIONABLE_STAGE_RANK[rightStage];
    if (stageDelta !== 0) return stageDelta;

    const leftDays = Number(left.doublingEstimate?.projectedDaysToDouble ?? Infinity);
    const rightDays = Number(right.doublingEstimate?.projectedDaysToDouble ?? Infinity);
    if (leftDays !== rightDays) return leftDays - rightDays;

    const leftTrades = Number(left.latestBacktestSummary?.total_trades ?? left.tradeCount ?? 0);
    const rightTrades = Number(right.latestBacktestSummary?.total_trades ?? right.tradeCount ?? 0);
    if (leftTrades !== rightTrades) return rightTrades - leftTrades;

    return left.displayName.localeCompare(right.displayName);
  });
}

export function groupActionableStrategies(
  strategies: HyperliquidStrategyCatalogRow[]
): Record<ActionablePipelineStage, HyperliquidStrategyCatalogRow[]> {
  const grouped: Record<ActionablePipelineStage, HyperliquidStrategyCatalogRow[]> = {
    backtesting: [],
    audit: [],
    paper: [],
    blocked: []
  };

  for (const strategy of sortActionableStrategies(strategies)) {
    const stage = actionableStageFor(strategy);
    if (stage) {
      grouped[stage].push(strategy);
    }
  }

  return grouped;
}

export function sortInventoryStrategies(strategies: HyperliquidStrategyCatalogRow[]): HyperliquidStrategyCatalogRow[] {
  return [...strategies].sort((left, right) => {
    const rankDelta = INVENTORY_STAGE_RANK[left.pipelineStage] - INVENTORY_STAGE_RANK[right.pipelineStage];
    if (rankDelta !== 0) return rankDelta;
    if (left.registeredForBacktest !== right.registeredForBacktest) return left.registeredForBacktest ? -1 : 1;
    return left.displayName.localeCompare(right.displayName);
  });
}

export function summarizeStrategyPipeline(strategies: HyperliquidStrategyCatalogRow[]) {
  const actionable = strategies.filter(isActionablePipelineStrategy);
  const auditEligible = actionable.filter((strategy) => strategy.gateStatus === 'audit-eligible').length;
  const readyForPaper = actionable.filter((strategy) => strategy.gateStatus === 'ready-for-paper' || strategy.gateStatus === 'paper-active').length;
  const blocked = actionable.filter((strategy) => actionableStageFor(strategy) === 'blocked').length;
  const registered = strategies.filter((strategy) => strategy.registeredForBacktest).length;
  const inventoryOnly = strategies.length - actionable.length;
  const fastestDoubling = actionable
    .filter((strategy) => strategy.doublingEstimate?.candidate && strategy.doublingEstimate.projectedDaysToDouble)
    .sort((left, right) => Number(left.doublingEstimate?.projectedDaysToDouble ?? Infinity) - Number(right.doublingEstimate?.projectedDaysToDouble ?? Infinity))[0] ?? null;

  return {
    actionableCount: actionable.length,
    inventoryOnly,
    auditEligible,
    readyForPaper,
    blocked,
    registered,
    fastestDoubling
  };
}
