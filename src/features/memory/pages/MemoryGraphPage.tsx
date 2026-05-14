import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Database,
  ExternalLink,
  FileText,
  GitBranch,
  Network,
  RefreshCw,
  ShieldCheck,
  Target
} from 'lucide-react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import StrategyMemoryGraphExplorer from '@/features/memory/components/StrategyMemoryGraphExplorer';
import {
  LEARNING_LENSES,
  MEMORY_LENSES,
  NODE_TYPE_LABELS,
  type EvidenceFilterId,
  type EvidenceItem,
  type LearningLensId,
  type MemoryGraph,
  type MemoryLensId,
  type MemoryNode,
  type StrategyMemorySummary
} from '@/features/memory/memoryGraphTypes';
import {
  hyperliquidService,
  type HyperliquidPipelineStage,
  type HyperliquidStrategyCatalogRow,
  type HyperliquidStrategyLearningEvent,
  type HyperliquidStrategyLearningKind,
  type HyperliquidStrategyLearningOutcome
} from '@/services/hyperliquidService';
import type {
  ObsidianGraphEdge,
  ObsidianGraphNodeType,
  ObsidianGraphResponse,
  ObsidianStrategyMemoryInput,
  ObsidianSyncStrategyMemoryResult
} from '@/types/electron';

type CaptureFormState = {
  kind: HyperliquidStrategyLearningKind;
  outcome: HyperliquidStrategyLearningOutcome;
  title: string;
  summary: string;
  evidencePaths: string;
  lesson: string;
  ruleChange: string;
  nextAction: string;
};

const OBSIDIAN_GRAPH_TIMEOUT_MS = 5000;
const OBSIDIAN_OPEN_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'node';
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value);
}

function toRepoPath(rawPath: string | null | undefined, workspacePath?: string): string | null {
  if (!rawPath) return null;
  const normalized = rawPath.replace(/\\/g, '/');
  if (workspacePath) {
    const workspace = workspacePath.replace(/\\/g, '/').replace(/\/+$/g, '');
    if (normalized.startsWith(`${workspace}/`)) {
      return normalized.slice(workspace.length + 1);
    }
  }
  return normalized.replace(/^\.\//, '');
}

function toOpenPath(rawPath: string | null | undefined, workspacePath?: string): string | undefined {
  if (!rawPath) return undefined;
  if (isAbsolutePath(rawPath)) return rawPath;
  if (!workspacePath) return rawPath;
  return `${workspacePath.replace(/\/+$/g, '')}/${rawPath.replace(/^\.\//, '')}`;
}

function pathLabel(rawPath: string): string {
  const clean = rawPath.replace(/\\/g, '/').replace(/\/+$/g, '');
  return clean.split('/').pop() || clean;
}

function inferPathNodeType(repoPath: string): ObsidianGraphNodeType {
  if (repoPath.startsWith('docs/strategies/')) return 'strategy-doc';
  if (repoPath.startsWith('backend/hyperliquid_gateway/strategies/')) return 'backend-package';
  if (repoPath.startsWith('backend/hyperliquid_gateway/data/backtests/')) return 'backtest-artifact';
  if (repoPath.startsWith('backend/hyperliquid_gateway/data/validations/')) return 'validation-artifact';
  if (repoPath.startsWith('backend/hyperliquid_gateway/data/paper/')) return 'paper-artifact';
  if (repoPath.startsWith('backend/hyperliquid_gateway/data/audits/')) return 'audit-artifact';
  if (repoPath.startsWith('docs/operations/agents/memory/')) return 'agent-memory';
  if (repoPath.startsWith('progress/')) return 'progress-handoff';
  return 'repo-path';
}

function edgeId(source: string, target: string, type: ObsidianGraphEdge['type']): string {
  return `${source}->${target}:${type}`;
}

function nodeIdForPath(repoPath: string): string {
  return `repo:${slug(repoPath)}`;
}

function detailPath(strategy: HyperliquidStrategyCatalogRow): string {
  return `/strategy/${encodeURIComponent(strategy.strategyId)}/${encodeURIComponent(strategy.pipelineStage)}`;
}

function mapStrategyForSync(strategy: HyperliquidStrategyCatalogRow): ObsidianStrategyMemoryInput {
  return {
    strategyId: strategy.strategyId,
    displayName: strategy.displayName,
    pipelineStage: strategy.pipelineStage,
    gateStatus: strategy.gateStatus,
    gateReasons: strategy.gateReasons,
    sourceTypes: strategy.sourceTypes,
    registeredForBacktest: strategy.registeredForBacktest,
    canBacktest: strategy.canBacktest,
    documentationPaths: strategy.documentationPaths,
    latestArtifactPaths: strategy.latestArtifactPaths,
    latestBacktestSummary: strategy.latestBacktestSummary,
    validationStatus: strategy.validationStatus,
    evidenceCounts: strategy.evidenceCounts,
    checklist: strategy.checklist,
    missingAuditItems: strategy.missingAuditItems,
    doublingEstimate: strategy.doublingEstimate
      ? { ...strategy.doublingEstimate }
      : null
  };
}

function mapLearningForSync(event: HyperliquidStrategyLearningEvent) {
  return {
    eventId: event.eventId,
    strategyId: event.strategyId,
    kind: event.kind,
    outcome: event.outcome,
    stage: event.stage,
    title: event.title,
    summary: event.summary,
    evidencePaths: event.evidencePaths,
    lesson: event.lesson,
    ruleChange: event.ruleChange,
    nextAction: event.nextAction,
    generatedAt: event.generatedAt,
    path: event.path
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function learningEventTime(event: HyperliquidStrategyLearningEvent): number {
  const value = Date.parse(event.generatedAt || event.updatedAt || '');
  return Number.isFinite(value) ? value : 0;
}

function learningKindLabel(kind: HyperliquidStrategyLearningKind): string {
  return kind.replace(/_/g, ' ');
}

function learningOutcomeLabel(outcome: HyperliquidStrategyLearningOutcome): string {
  if (outcome === 'win') return 'Win';
  if (outcome === 'loss') return 'Mistake';
  if (outcome === 'mixed') return 'Mixed';
  return 'Unknown';
}

function learningLensMatches(event: HyperliquidStrategyLearningEvent, lens: LearningLensId): boolean {
  if (lens === 'lessons') return event.kind === 'lesson' || Boolean(event.lesson);
  if (lens === 'mistakes') return event.outcome === 'loss';
  if (lens === 'wins') return event.outcome === 'win';
  if (lens === 'rule-changes') return event.kind === 'rule_change' || Boolean(event.ruleChange);
  return Boolean(event.nextAction);
}

function learningSearchText(event: HyperliquidStrategyLearningEvent): string {
  return [
    event.eventId,
    event.strategyId,
    event.kind,
    event.outcome,
    event.stage || '',
    event.title,
    event.summary,
    event.lesson || '',
    event.ruleChange || '',
    event.nextAction || '',
    event.evidencePaths.join(' ')
  ].join(' ').toLowerCase();
}

function buildLearningIndex(events: HyperliquidStrategyLearningEvent[]): Map<string, HyperliquidStrategyLearningEvent[]> {
  const index = new Map<string, HyperliquidStrategyLearningEvent[]>();
  events.forEach((event) => {
    const bucket = index.get(event.strategyId) || [];
    bucket.push(event);
    index.set(event.strategyId, bucket);
  });
  index.forEach((bucket) => bucket.sort((left, right) => learningEventTime(right) - learningEventTime(left)));
  return index;
}

function emptyCaptureForm(summary: StrategyMemorySummary | null, node: MemoryNode | null): CaptureFormState {
  const strategy = summary?.strategy;
  const evidence = uniqueStrings([
    node?.repoPath,
    node?.path,
    strategy?.latestArtifactPaths.paper,
    strategy?.latestArtifactPaths.validation,
    strategy?.latestArtifactPaths.backtest,
    strategy?.latestArtifactPaths.docs
  ]).join('\n');
  return {
    kind: 'lesson',
    outcome: 'unknown',
    title: strategy ? `${strategy.displayName}: ` : '',
    summary: '',
    evidencePaths: evidence,
    lesson: '',
    ruleChange: '',
    nextAction: ''
  };
}

function hasStrategyEvidence(strategy: HyperliquidStrategyCatalogRow): boolean {
  const artifacts = strategy.latestArtifactPaths;
  return Boolean(
    artifacts.backtest ||
      artifacts.validation ||
      artifacts.paper ||
      strategy.evidenceCounts.backtestTrades > 0 ||
      strategy.evidenceCounts.paperCandidates > 0 ||
      strategy.evidenceCounts.paperSignals > 0 ||
      strategy.evidenceCounts.paperTrades > 0
  );
}

function isDocsOnlyStrategy(strategy: HyperliquidStrategyCatalogRow): boolean {
  return Boolean(
    strategy.sourceTypes.includes('docs') &&
      !strategy.registeredForBacktest &&
      !strategy.canBacktest &&
      !strategy.checklist.backendModuleExists
  );
}

function isPaperReadyStrategy(strategy: HyperliquidStrategyCatalogRow): boolean {
  return strategy.pipelineStage === 'paper' || strategy.gateStatus === 'ready-for-paper' || strategy.gateStatus === 'paper-active';
}

function isBlockedStrategy(strategy: HyperliquidStrategyCatalogRow): boolean {
  return strategy.pipelineStage === 'blocked' || strategy.gateStatus === 'audit-blocked';
}

function needsBacktest(strategy: HyperliquidStrategyCatalogRow): boolean {
  if (isDocsOnlyStrategy(strategy)) return false;
  return Boolean(
    strategy.gateStatus === 'backtest-required' ||
      strategy.gateStatus === 'backtest-running-eligible' ||
      ((strategy.registeredForBacktest || strategy.canBacktest) &&
        !strategy.checklist.backtestExists &&
        !strategy.latestArtifactPaths.backtest)
  );
}

function isActionableStrategy(strategy: HyperliquidStrategyCatalogRow): boolean {
  if (isDocsOnlyStrategy(strategy)) return false;
  return Boolean(
    isPaperReadyStrategy(strategy) ||
      isBlockedStrategy(strategy) ||
      needsBacktest(strategy) ||
      strategy.gateStatus === 'audit-eligible' ||
      strategy.pipelineStage !== 'research' ||
      strategy.registeredForBacktest ||
      strategy.canBacktest ||
      hasStrategyEvidence(strategy)
  );
}

function matchesLens(summary: StrategyMemorySummary, lens: MemoryLensId): boolean {
  const strategy = summary.strategy;
  if (lens === 'all') return true;
  if (lens === 'actionable') return isActionableStrategy(strategy);
  if (lens === 'paper-ready') return isPaperReadyStrategy(strategy);
  if (lens === 'blocked') return isBlockedStrategy(strategy);
  if (lens === 'needs-backtest') return needsBacktest(strategy);
  return isDocsOnlyStrategy(strategy);
}

function reviewRank(strategy: HyperliquidStrategyCatalogRow): number {
  if (isPaperReadyStrategy(strategy)) return 0;
  if (needsBacktest(strategy)) return 1;
  if (strategy.gateStatus === 'audit-eligible') return 2;
  if (isBlockedStrategy(strategy)) return 3;
  if (isDocsOnlyStrategy(strategy)) return 4;
  return 5;
}

function formatPercent(value: unknown): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%` : 'N/A';
}

function formatNumber(value: unknown, digits = 2): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'N/A';
}

function statusLabel(strategy: HyperliquidStrategyCatalogRow): string {
  if (strategy.gateStatus === 'paper-active') return 'Paper Active';
  if (strategy.gateStatus === 'ready-for-paper' || strategy.pipelineStage === 'paper') return 'Paper Ready';
  if (needsBacktest(strategy)) return 'Needs Backtest';
  if (strategy.gateStatus === 'audit-eligible') return 'Audit Ready';
  if (isBlockedStrategy(strategy)) return 'Blocked';
  if (isDocsOnlyStrategy(strategy)) return 'Docs Only';
  return strategy.pipelineStage.replace(/-/g, ' ');
}

function statusTone(strategy: HyperliquidStrategyCatalogRow): string {
  if (isPaperReadyStrategy(strategy)) return 'text-emerald-200';
  if (strategy.gateStatus === 'audit-eligible' || needsBacktest(strategy)) return 'text-cyan-200';
  if (isBlockedStrategy(strategy)) return 'text-amber-200';
  if (isDocsOnlyStrategy(strategy)) return 'text-white/60';
  return 'text-white/70';
}

function nextReviewLabel(strategy: HyperliquidStrategyCatalogRow, blockers: string[]): string {
  if (strategy.gateStatus === 'paper-active') return 'Review paper runtime ledger';
  if (strategy.gateStatus === 'ready-for-paper') {
    return strategy.latestArtifactPaths.paper ? 'Review paper candidate' : 'Create paper candidate';
  }
  if (needsBacktest(strategy)) return strategy.nextAction?.label || 'Run bounded backtest';
  if (strategy.gateStatus === 'audit-eligible') return strategy.nextAction?.label || 'Run agent audit';
  if (isBlockedStrategy(strategy)) return blockers[0]?.replace(/_/g, ' ') || 'Repair failed gate';
  if (isDocsOnlyStrategy(strategy)) return 'Create backend package';
  return strategy.nextAction?.label || 'Review strategy evidence';
}

function evidenceItemsFor(strategy: HyperliquidStrategyCatalogRow): EvidenceItem[] {
  const artifacts = strategy.latestArtifactPaths;
  return [
    {
      key: 'docs',
      label: 'Docs',
      ok: strategy.checklist.docsExists || strategy.documentationPaths.length > 0 || Boolean(artifacts.docs)
    },
    {
      key: 'backend',
      label: 'Backend',
      ok: strategy.checklist.backendModuleExists || strategy.checklist.specExists || Boolean(artifacts.spec)
    },
    {
      key: 'backtest',
      label: 'Backtest',
      ok: strategy.checklist.backtestExists || Boolean(artifacts.backtest) || strategy.evidenceCounts.backtestTrades > 0
    },
    {
      key: 'validation',
      label: 'Validation',
      ok: strategy.checklist.validationExists || Boolean(artifacts.validation)
    },
    {
      key: 'paper',
      label: 'Paper',
      ok: strategy.checklist.paperCandidateExists || strategy.checklist.paperLedgerExists || Boolean(artifacts.paper) || strategy.evidenceCounts.paperCandidates > 0 || strategy.evidenceCounts.paperTrades > 0
    }
  ];
}

function nodeSearchText(node: MemoryNode): string {
  return `${node.label} ${node.summary || ''} ${node.repoPath || ''} ${node.strategyId || ''} ${(node.tags || []).join(' ')}`.toLowerCase();
}

function strategyIdFromNodeId(graph: MemoryGraph, nodeId: string): string | null {
  if (nodeId.startsWith('strategy:')) return nodeId.slice('strategy:'.length);
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (node?.strategyId) return node.strategyId;
  const directEdge = graph.edges.find((edge) => {
    if (edge.source !== nodeId && edge.target !== nodeId) return false;
    return edge.source.startsWith('strategy:') || edge.target.startsWith('strategy:');
  });
  if (!directEdge) return null;
  const strategyNodeId = directEdge.source.startsWith('strategy:') ? directEdge.source : directEdge.target;
  return strategyNodeId.slice('strategy:'.length);
}

function relatedGraphIds(graph: MemoryGraph, strategyId: string): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const strategyNodeId = `strategy:${strategyId}`;
  const nodeIds = new Set<string>([strategyNodeId]);
  const edgeIds = new Set<string>();

  graph.nodes.forEach((node) => {
    if (node.strategyId === strategyId) {
      nodeIds.add(node.id);
    }
  });

  graph.edges.forEach((edge) => {
    if (edge.source === strategyNodeId || edge.target === strategyNodeId || nodeIds.has(edge.source) || nodeIds.has(edge.target)) {
      edgeIds.add(edge.id);
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
    }
  });

  graph.edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edgeIds.add(edge.id);
    }
  });

  return { nodeIds, edgeIds };
}

function addPathNode(
  nodes: Map<string, MemoryNode>,
  workspacePath: string | undefined,
  rawPath: string | null | undefined,
  fallbackType?: ObsidianGraphNodeType
): string | null {
  const repoPath = toRepoPath(rawPath, workspacePath);
  if (!repoPath) return null;
  const id = nodeIdForPath(repoPath);
  if (!nodes.has(id)) {
    const type = fallbackType || inferPathNodeType(repoPath);
    nodes.set(id, {
      id,
      type,
      label: pathLabel(repoPath),
      repoPath,
      path: toOpenPath(repoPath, workspacePath),
      summary: repoPath
    });
  }
  return id;
}

function mergeGraphs(
  strategies: HyperliquidStrategyCatalogRow[],
  obsidianGraph: ObsidianGraphResponse | null,
  learningEvents: HyperliquidStrategyLearningEvent[],
  workspacePath?: string
): MemoryGraph {
  const nodes = new Map<string, MemoryNode>();
  const edges = new Map<string, ObsidianGraphEdge>();

  obsidianGraph?.nodes.forEach((node) => nodes.set(node.id, { ...node }));
  obsidianGraph?.edges.forEach((edge) => edges.set(edge.id, edge));

  const strategyStage = new Map<string, HyperliquidPipelineStage>();

  strategies.forEach((strategy) => {
    const strategyNodeId = `strategy:${strategy.strategyId}`;
    strategyStage.set(strategy.strategyId, strategy.pipelineStage);
    nodes.set(strategyNodeId, {
      id: strategyNodeId,
      type: 'strategy',
      label: strategy.displayName,
      strategyId: strategy.strategyId,
      pipelineStage: strategy.pipelineStage,
      gateStatus: strategy.gateStatus,
      summary: `${strategy.gateStatus.replace(/-/g, ' ')}. ${strategy.missingAuditItems[0] || strategy.gateReasons[0] || 'No blocker reported.'}`,
      metadata: {
        stage: strategy.stage,
        evidenceCounts: strategy.evidenceCounts,
        latestBacktestSummary: strategy.latestBacktestSummary,
        strategyDetailPath: detailPath(strategy)
      }
    });

    const docsPaths = Array.from(new Set([
      ...strategy.documentationPaths,
      strategy.latestArtifactPaths.docs,
      strategy.latestArtifactPaths.spec
    ].filter((item): item is string => Boolean(item))));
    docsPaths.forEach((item) => {
      const target = addPathNode(nodes, workspacePath, item, toRepoPath(item, workspacePath)?.startsWith('backend/') ? 'backend-package' : 'strategy-doc');
      if (target) {
        edges.set(edgeId(strategyNodeId, target, 'strategy-doc'), {
          id: edgeId(strategyNodeId, target, 'strategy-doc'),
          source: strategyNodeId,
          target,
          type: target.includes('backend') ? 'backend-package' : 'strategy-doc',
          label: 'source'
        });
      }
    });

    const artifacts = strategy.latestArtifactPaths;
    [
      artifacts.backtest,
      artifacts.validation,
      artifacts.paper,
      artifacts.doublingStability,
      artifacts.btcOptimization
    ].forEach((item) => {
      const target = addPathNode(nodes, workspacePath, item);
      if (target) {
        edges.set(edgeId(strategyNodeId, target, 'artifact'), {
          id: edgeId(strategyNodeId, target, 'artifact'),
          source: strategyNodeId,
          target,
          type: 'artifact',
          label: 'evidence'
        });
      }
    });
  });

  learningEvents.forEach((event) => {
    const strategyNodeId = `strategy:${event.strategyId}`;
    const learningNodeId = `learning:${event.eventId}`;
    const outcome = learningOutcomeLabel(event.outcome);
    nodes.set(learningNodeId, {
      id: learningNodeId,
      type: 'learning-event',
      label: event.title,
      path: event.path || undefined,
      repoPath: toRepoPath(event.path, workspacePath) || undefined,
      strategyId: event.strategyId,
      pipelineStage: event.stage,
      gateStatus: event.outcome,
      updatedAt: learningEventTime(event) || null,
      tags: ['learning', event.kind, event.outcome],
      summary: `${learningKindLabel(event.kind)} / ${outcome}. ${event.lesson || event.summary || event.nextAction || 'Learning event recorded.'}`,
      metadata: {
        eventId: event.eventId,
        kind: event.kind,
        outcome: event.outcome,
        lesson: event.lesson,
        ruleChange: event.ruleChange,
        nextAction: event.nextAction,
        evidencePaths: event.evidencePaths
      }
    });
    if (nodes.has(strategyNodeId)) {
      edges.set(edgeId(strategyNodeId, learningNodeId, 'learning-link'), {
        id: edgeId(strategyNodeId, learningNodeId, 'learning-link'),
        source: strategyNodeId,
        target: learningNodeId,
        type: 'learning-link',
        label: event.kind
      });
    }
    event.evidencePaths.forEach((item) => {
      const target = addPathNode(nodes, workspacePath, item);
      if (target) {
        edges.set(edgeId(learningNodeId, target, 'learning-link'), {
          id: edgeId(learningNodeId, target, 'learning-link'),
          source: learningNodeId,
          target,
          type: 'learning-link',
          label: 'evidence'
        });
      }
    });
  });

  nodes.forEach((node) => {
    if (node.type !== 'obsidian-note' && node.type !== 'agent-memory') return;
    const nodeStrategyId = node.strategyId || '';
    const haystack = `${node.label} ${node.summary || ''} ${(node.tags || []).join(' ')} ${node.repoPath || ''}`.toLowerCase();
    strategies.forEach((strategy) => {
      if (
        nodeStrategyId === strategy.strategyId ||
        haystack.includes(strategy.strategyId.toLowerCase()) ||
        haystack.includes(slug(strategy.strategyId).replace(/-/g, ' '))
      ) {
        const source = `strategy:${strategy.strategyId}`;
        edges.set(edgeId(source, node.id, 'related-note'), {
          id: edgeId(source, node.id, 'related-note'),
          source,
          target: node.id,
          type: 'related-note',
          label: 'memory'
        });
      }
    });
  });

  return {
    nodes: Array.from(nodes.values()).map((node) => ({
      ...node,
      pipelineStage: node.pipelineStage || (node.strategyId ? strategyStage.get(node.strategyId) || null : null)
    })),
    edges: Array.from(edges.values())
  };
}

function buildStrategyMemorySummaries(
  strategies: HyperliquidStrategyCatalogRow[],
  graph: MemoryGraph,
  learningIndex: Map<string, HyperliquidStrategyLearningEvent[]>
): StrategyMemorySummary[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  return strategies.map((strategy) => {
    const related = relatedGraphIds(graph, strategy.strategyId);
    const relatedNodes = Array.from(related.nodeIds)
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is MemoryNode => Boolean(node));
    const evidenceItems = evidenceItemsFor(strategy);
    const evidenceComplete = evidenceItems.filter((item) => item.ok).length;
    const blockers = uniqueStrings([...strategy.gateReasons, ...strategy.missingAuditItems]);
    const learningEvents = learningIndex.get(strategy.strategyId) || [];
    const latestLearning = learningEvents[0] || null;
    const latestLesson = learningEvents.find((event) => event.kind === 'lesson' || Boolean(event.lesson)) || null;
    const latestRuleChange = learningEvents.find((event) => event.kind === 'rule_change' || Boolean(event.ruleChange)) || null;
    const openFollowUp = learningEvents.find((event) => Boolean(event.nextAction)) || null;
    const queryText = [
      strategy.strategyId,
      strategy.displayName,
      strategy.pipelineStage,
      strategy.gateStatus,
      strategy.validationStatus,
      strategy.sourceTypes.join(' '),
      blockers.join(' '),
      learningEvents.map(learningSearchText).join(' '),
      relatedNodes.map(nodeSearchText).join(' ')
    ].join(' ').toLowerCase();

    return {
      strategy,
      nodeIds: related.nodeIds,
      edgeIds: related.edgeIds,
      memoryNoteCount: relatedNodes.filter((node) => node.type === 'obsidian-note' || node.type === 'agent-memory').length,
      learningEventCount: learningEvents.length,
      mistakeCount: learningEvents.filter((event) => event.outcome === 'loss').length,
      winCount: learningEvents.filter((event) => event.outcome === 'win').length,
      ruleChangeCount: learningEvents.filter((event) => event.kind === 'rule_change' || Boolean(event.ruleChange)).length,
      openFollowUpCount: learningEvents.filter((event) => Boolean(event.nextAction)).length,
      latestLearning,
      latestLesson,
      latestRuleChange,
      openFollowUp,
      evidenceItems,
      evidenceComplete,
      evidenceTotal: evidenceItems.length,
      blockers,
      statusLabel: statusLabel(strategy),
      statusTone: statusTone(strategy),
      nextReview: nextReviewLabel(strategy, blockers),
      queryText
    };
  });
}

function filterStrategySummaries(
  summaries: StrategyMemorySummary[],
  lens: MemoryLensId,
  query: string
): StrategyMemorySummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  return summaries
    .filter((summary) => matchesLens(summary, lens))
    .filter((summary) => !normalizedQuery || summary.queryText.includes(normalizedQuery))
    .sort((left, right) => {
      const rankDelta = reviewRank(left.strategy) - reviewRank(right.strategy);
      if (rankDelta !== 0) return rankDelta;
      const leftTrades = Number(left.strategy.latestBacktestSummary?.total_trades ?? left.strategy.tradeCount ?? 0);
      const rightTrades = Number(right.strategy.latestBacktestSummary?.total_trades ?? right.strategy.tradeCount ?? 0);
      if (leftTrades !== rightTrades) return rightTrades - leftTrades;
      return left.strategy.displayName.localeCompare(right.strategy.displayName);
    });
}

function filterLearningEvents(
  events: HyperliquidStrategyLearningEvent[],
  lens: LearningLensId,
  query: string
): HyperliquidStrategyLearningEvent[] {
  const normalizedQuery = query.trim().toLowerCase();
  return events
    .filter((event) => learningLensMatches(event, lens))
    .filter((event) => !normalizedQuery || learningSearchText(event).includes(normalizedQuery))
    .sort((left, right) => learningEventTime(right) - learningEventTime(left));
}

function addNodeNeighborhood(graph: MemoryGraph, visibleNodes: Set<string>, visibleEdges: Set<string>, nodeId: string): void {
  visibleNodes.add(nodeId);
  graph.edges.forEach((edge) => {
    if (edge.source === nodeId || edge.target === nodeId) {
      visibleEdges.add(edge.id);
      visibleNodes.add(edge.source);
      visibleNodes.add(edge.target);
    }
  });
}

function scopeGraph(
  graph: MemoryGraph,
  summaries: StrategyMemorySummary[],
  selectedStrategyId: string | null,
  query: string
): MemoryGraph {
  const visibleNodes = new Set<string>();
  const visibleEdges = new Set<string>();
  const normalizedQuery = query.trim().toLowerCase();
  const selectedSummary = selectedStrategyId
    ? summaries.find((summary) => summary.strategy.strategyId === selectedStrategyId) || null
    : null;
  const scopeSummaries = selectedSummary ? [selectedSummary] : summaries;

  scopeSummaries.forEach((summary) => {
    summary.nodeIds.forEach((nodeId) => visibleNodes.add(nodeId));
    summary.edgeIds.forEach((edgeId) => visibleEdges.add(edgeId));
  });

  if (normalizedQuery) {
    graph.nodes.forEach((node) => {
      if (nodeSearchText(node).includes(normalizedQuery)) {
        addNodeNeighborhood(graph, visibleNodes, visibleEdges, node.id);
      }
    });
  }

  graph.edges.forEach((edge) => {
    if (visibleNodes.has(edge.source) && visibleNodes.has(edge.target)) {
      visibleEdges.add(edge.id);
    }
  });

  const nodes = graph.nodes.filter((node) => visibleNodes.has(node.id));
  const edges = graph.edges.filter((edge) => visibleEdges.has(edge.id) && visibleNodes.has(edge.source) && visibleNodes.has(edge.target));
  return { nodes, edges };
}

function evidenceFilterMatches(node: MemoryNode, filter: EvidenceFilterId): boolean {
  if (node.type === 'strategy' || filter === 'all') return true;
  if (filter === 'agent-path') {
    return [
      'strategy-doc',
      'backend-package',
      'backtest-artifact',
      'validation-artifact',
      'paper-artifact',
      'audit-artifact',
      'learning-event'
    ].includes(node.type);
  }
  if (filter === 'artifacts') {
    return ['backtest-artifact', 'validation-artifact', 'paper-artifact', 'audit-artifact'].includes(node.type);
  }
  if (filter === 'learning') return node.type === 'learning-event';
  return ['obsidian-note', 'agent-memory', 'progress-handoff'].includes(node.type);
}

function filterGraphByEvidence(graph: MemoryGraph, filter: EvidenceFilterId): MemoryGraph {
  if (filter === 'all') return graph;
  const visibleNodes = new Set(
    graph.nodes
      .filter((node) => evidenceFilterMatches(node, filter))
      .map((node) => node.id)
  );
  return {
    nodes: graph.nodes.filter((node) => visibleNodes.has(node.id)),
    edges: graph.edges.filter((edge) => visibleNodes.has(edge.source) && visibleNodes.has(edge.target))
  };
}

export default function MemoryGraphPage() {
  const { activeWorkspace, updateWorkspace } = useWorkspaceContext();
  const [strategies, setStrategies] = useState<HyperliquidStrategyCatalogRow[]>([]);
  const [learningEvents, setLearningEvents] = useState<HyperliquidStrategyLearningEvent[]>([]);
  const [obsidianGraph, setObsidianGraph] = useState<ObsidianGraphResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [activeLens, setActiveLens] = useState<MemoryLensId>('actionable');
  const [activeLearningLens, setActiveLearningLens] = useState<LearningLensId>('lessons');
  const [activeEvidenceFilter, setActiveEvidenceFilter] = useState<EvidenceFilterId>('agent-path');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [openingVault, setOpeningVault] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureForm, setCaptureForm] = useState<CaptureFormState>(() => emptyCaptureForm(null, null));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMemory = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [catalog, learning] = await Promise.all([
        hyperliquidService.getStrategyCatalog(500),
        hyperliquidService.getStrategyLearning(undefined, 500)
      ]);
      setStrategies(catalog.strategies);
      setLearningEvents(learning.events);
      if (activeWorkspace && window.electronAPI?.obsidian?.getGraph) {
        try {
          const graph = await withTimeout(
            window.electronAPI.obsidian.getGraph(activeWorkspace.path, activeWorkspace.obsidian_vault_path),
            OBSIDIAN_GRAPH_TIMEOUT_MS,
            'Obsidian graph load'
          );
          setObsidianGraph(graph);
        } catch (obsidianErr) {
          setObsidianGraph(null);
          setError(obsidianErr instanceof Error ? obsidianErr.message : 'Obsidian graph load failed.');
        }
      } else {
        setObsidianGraph(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory graph.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadMemory(true);
  }, [activeWorkspace?.id]);

  const visibleLearningEvents = useMemo(
    () => filterLearningEvents(learningEvents, activeLearningLens, query),
    [activeLearningLens, learningEvents, query]
  );

  const mergedGraph = useMemo(
    () => mergeGraphs(strategies, obsidianGraph, visibleLearningEvents, activeWorkspace?.path),
    [activeWorkspace?.path, obsidianGraph, strategies, visibleLearningEvents]
  );

  const learningIndex = useMemo(
    () => buildLearningIndex(learningEvents),
    [learningEvents]
  );

  const strategySummaries = useMemo(
    () => buildStrategyMemorySummaries(strategies, mergedGraph, learningIndex),
    [learningIndex, mergedGraph, strategies]
  );

  const filteredSummaries = useMemo(
    () => filterStrategySummaries(strategySummaries, activeLens, query),
    [activeLens, query, strategySummaries]
  );

  useEffect(() => {
    if (filteredSummaries.length === 0) {
      if (selectedStrategyId) setSelectedStrategyId(null);
      return;
    }
    if (selectedStrategyId && filteredSummaries.some((summary) => summary.strategy.strategyId === selectedStrategyId)) {
      return;
    }
    const nextStrategyId = filteredSummaries[0].strategy.strategyId;
    setSelectedStrategyId(nextStrategyId);
    setSelectedNodeId(`strategy:${nextStrategyId}`);
  }, [filteredSummaries, selectedStrategyId]);

  const scopedGraph = useMemo(
    () => scopeGraph(mergedGraph, filteredSummaries, null, query),
    [filteredSummaries, mergedGraph, query]
  );

  const visibleGraph = useMemo(
    () => filterGraphByEvidence(scopedGraph, activeEvidenceFilter),
    [activeEvidenceFilter, scopedGraph]
  );

  const selectedNode = useMemo(
    () => visibleGraph.nodes.find((node) => node.id === selectedNodeId)
      || (selectedStrategyId ? visibleGraph.nodes.find((node) => node.id === `strategy:${selectedStrategyId}`) : null)
      || visibleGraph.nodes[0]
      || null,
    [visibleGraph.nodes, selectedNodeId, selectedStrategyId]
  );

  const selectedSummary = useMemo(() => {
    const nodeStrategyId = selectedNode ? strategyIdFromNodeId(mergedGraph, selectedNode.id) : selectedStrategyId;
    return strategySummaries.find((summary) => summary.strategy.strategyId === nodeStrategyId) || null;
  }, [mergedGraph, selectedNode, selectedStrategyId, strategySummaries]);

  const lensCounts = useMemo(() => MEMORY_LENSES.reduce((accumulator, lens) => {
    accumulator[lens.id] = strategySummaries.filter((summary) => matchesLens(summary, lens.id)).length;
    return accumulator;
  }, {} as Record<MemoryLensId, number>), [strategySummaries]);

  const learningLensCounts = useMemo(() => LEARNING_LENSES.reduce((accumulator, lens) => {
    accumulator[lens.id] = learningEvents.filter((event) => learningLensMatches(event, lens.id)).length;
    return accumulator;
  }, {} as Record<LearningLensId, number>), [learningEvents]);

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    const strategyId = strategyIdFromNodeId(mergedGraph, nodeId);
    if (strategyId) setSelectedStrategyId(strategyId);
  };

  const handleSelectStrategy = (summary: StrategyMemorySummary) => {
    const strategyId = summary.strategy.strategyId;
    setSelectedStrategyId(strategyId);
    setSelectedNodeId(`strategy:${strategyId}`);
  };

  const resetGraphExplorer = () => {
    setQuery('');
    setActiveLens('actionable');
    setActiveLearningLens('lessons');
    setActiveEvidenceFilter('agent-path');
  };

  const runSync = async () => {
    if (!activeWorkspace || !window.electronAPI?.obsidian?.syncStrategyMemory) {
      setError('Obsidian sync is only available inside the Electron app with an active desk.');
      return;
    }

    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const result: ObsidianSyncStrategyMemoryResult = await window.electronAPI.obsidian.syncStrategyMemory(
        activeWorkspace.path,
        strategies.map(mapStrategyForSync),
        activeWorkspace.obsidian_vault_path,
        learningEvents.map(mapLearningForSync)
      );
      if (result.vaultPath && result.vaultPath !== activeWorkspace.obsidian_vault_path) {
        await updateWorkspace(activeWorkspace.id, { obsidian_vault_path: result.vaultPath });
      }
      setMessage(`Synced ${result.created} new and ${result.updated} managed notes. ${result.skipped} manual notes preserved.`);
      await loadMemory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync strategy memory.');
    } finally {
      setSyncing(false);
    }
  };

  const openVault = async () => {
    if (!window.electronAPI?.obsidian) {
      setError('Obsidian vault actions are only available inside the Electron app.');
      return;
    }

    setOpeningVault(true);
    setError(null);
    setMessage(null);
    try {
      const vaultPath = obsidianGraph?.vaultPath || activeWorkspace?.obsidian_vault_path;
      if (vaultPath) {
        await withTimeout(window.electronAPI.obsidian.openVault(vaultPath), OBSIDIAN_OPEN_TIMEOUT_MS, 'Open Vault');
        setMessage(`Opening Obsidian vault: ${vaultPath}`);
        return;
      }
      if (activeWorkspace) {
        const status = await withTimeout(
          window.electronAPI.obsidian.ensureVault(activeWorkspace.path, activeWorkspace.obsidian_vault_path),
          OBSIDIAN_OPEN_TIMEOUT_MS,
          'Obsidian vault setup'
        );
        if (status.vaultPath) {
          await updateWorkspace(activeWorkspace.id, { obsidian_vault_path: status.vaultPath });
          await withTimeout(window.electronAPI.obsidian.openVault(status.vaultPath), OBSIDIAN_OPEN_TIMEOUT_MS, 'Open Vault');
          setMessage(`Opening Obsidian vault: ${status.vaultPath}`);
          await loadMemory(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open Obsidian vault.');
    } finally {
      setOpeningVault(false);
    }
  };

  const openCapture = () => {
    setCaptureForm(emptyCaptureForm(selectedSummary, selectedNode));
    setCaptureOpen(true);
    setMessage(null);
    setError(null);
  };

  const submitCapture = async () => {
    if (!selectedSummary) {
      setError('Select a strategy before capturing a lesson.');
      return;
    }
    if (!captureForm.title.trim()) {
      setError('Lesson title is required.');
      return;
    }

    setCapturing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await hyperliquidService.createStrategyLearningEvent({
        strategyId: selectedSummary.strategy.strategyId,
        kind: captureForm.kind,
        outcome: captureForm.outcome,
        stage: selectedSummary.strategy.pipelineStage,
        title: captureForm.title.trim(),
        summary: captureForm.summary.trim(),
        evidencePaths: captureForm.evidencePaths.split('\n').map((item) => item.trim()).filter(Boolean),
        lesson: captureForm.lesson.trim() || null,
        ruleChange: captureForm.ruleChange.trim() || null,
        nextAction: captureForm.nextAction.trim() || null
      });
      setMessage(`Captured ${learningKindLabel(result.event.kind)} for ${selectedSummary.strategy.displayName}.`);
      setCaptureOpen(false);
      await loadMemory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture strategy lesson.');
    } finally {
      setCapturing(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-7xl items-center justify-center px-4 py-8">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1560px] flex-col gap-4 px-4 py-5 sm:px-5">
      <section className="border-b border-white/10 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-[min(100%,46rem)]">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-cyan-300/80">
              <Network className="h-4 w-4" />
              Strategy Memory
            </div>
            <h1 className="mt-1 text-xl font-semibold leading-tight text-white sm:text-2xl">Actionable Strategy Memory</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Strategy evidence stays repo-first; Obsidian notes add the review trail around each setup.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={openCapture}
              disabled={!selectedSummary}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-fuchsia-400/25 bg-fuchsia-500/15 px-3 py-2 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35 sm:flex-none"
            >
              <ClipboardCheck className="h-4 w-4" />
              Capture Lesson
            </button>
            <button
              type="button"
              onClick={() => void openVault()}
              disabled={openingVault}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.09] sm:flex-none"
            >
              <BookOpen className={`h-4 w-4 ${openingVault ? 'animate-pulse' : ''}`} />
              {openingVault ? 'Opening' : 'Open Vault'}
            </button>
            <button
              type="button"
              onClick={() => void runSync()}
              disabled={syncing || strategies.length === 0}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-emerald-400/25 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35 sm:flex-none"
            >
              <Database className={`h-4 w-4 ${syncing ? 'animate-pulse' : ''}`} />
              {syncing ? 'Syncing' : 'Sync Obsidian'}
            </button>
            <button
              type="button"
              onClick={() => void loadMemory(false)}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-500/12 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/22 sm:flex-none"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>

        {message ? <div className="mt-4 rounded-md border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-50">{message}</div> : null}
        {error ? <div className="mt-4 rounded-md border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
        {obsidianGraph?.warnings.length ? (
          <div className="mt-4 rounded-md border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">
            {obsidianGraph.warnings.join(' ')}
          </div>
        ) : null}
        {captureOpen && selectedSummary ? (
          <CaptureLessonPanel
            strategyName={selectedSummary.strategy.displayName}
            form={captureForm}
            capturing={capturing}
            onChange={setCaptureForm}
            onSubmit={() => void submitCapture()}
            onCancel={() => setCaptureOpen(false)}
          />
        ) : null}
      </section>

      <section className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <StrategyMemoryGraphExplorer
          graph={visibleGraph}
          totalGraph={mergedGraph}
          selectedNodeId={selectedNode?.id || null}
          query={query}
          activeLens={activeLens}
          activeLearningLens={activeLearningLens}
          activeEvidenceFilter={activeEvidenceFilter}
          lensCounts={lensCounts}
          learningLensCounts={learningLensCounts}
          onQueryChange={setQuery}
          onLensChange={setActiveLens}
          onLearningLensChange={setActiveLearningLens}
          onEvidenceFilterChange={setActiveEvidenceFilter}
          onSelectNode={handleSelectNode}
          onResetView={resetGraphExplorer}
        />

        <div className="grid min-w-0 gap-3">
          <NodeInspector node={selectedNode} summary={selectedSummary} />
          <StrategyMemoryList
            summaries={filteredSummaries}
            selectedStrategyId={selectedSummary?.strategy.strategyId || null}
            onSelect={handleSelectStrategy}
          />
        </div>
      </section>
    </div>
  );
}

function CaptureLessonPanel({
  strategyName,
  form,
  capturing,
  onChange,
  onSubmit,
  onCancel
}: {
  strategyName: string;
  form: CaptureFormState;
  capturing: boolean;
  onChange: (form: CaptureFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const update = <K extends keyof CaptureFormState>(key: K, value: CaptureFormState[K]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <div className="mt-4 rounded-md border border-fuchsia-400/20 bg-fuchsia-500/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-fuchsia-200/75">Capture Lesson</div>
          <div className="mt-1 text-sm font-semibold text-white">{strategyName}</div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-white/60 transition hover:bg-white/[0.07]"
        >
          Close
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Kind</span>
          <select
            value={form.kind}
            onChange={(event) => update('kind', event.target.value as HyperliquidStrategyLearningKind)}
            className="min-h-10 rounded-md border border-white/10 bg-black/35 px-3 text-sm text-white outline-none"
          >
            <option value="hypothesis">Hypothesis</option>
            <option value="decision">Decision</option>
            <option value="lesson">Lesson</option>
            <option value="postmortem">Postmortem</option>
            <option value="rule_change">Rule Change</option>
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Outcome</span>
          <select
            value={form.outcome}
            onChange={(event) => update('outcome', event.target.value as HyperliquidStrategyLearningOutcome)}
            className="min-h-10 rounded-md border border-white/10 bg-black/35 px-3 text-sm text-white outline-none"
          >
            <option value="unknown">Unknown</option>
            <option value="win">Win</option>
            <option value="loss">Loss / Mistake</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
      </div>

      <label className="mt-3 grid gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Title</span>
        <input
          value={form.title}
          onChange={(event) => update('title', event.target.value)}
          className="min-h-10 rounded-md border border-white/10 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-white/30"
          placeholder="What did we learn?"
        />
      </label>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <TextAreaField label="Summary" value={form.summary} onChange={(value) => update('summary', value)} />
        <TextAreaField label="Lesson" value={form.lesson} onChange={(value) => update('lesson', value)} />
        <TextAreaField label="Rule Change" value={form.ruleChange} onChange={(value) => update('ruleChange', value)} />
        <TextAreaField label="Next Action" value={form.nextAction} onChange={(value) => update('nextAction', value)} />
      </div>

      <TextAreaField
        label="Evidence Paths"
        value={form.evidencePaths}
        onChange={(value) => update('evidencePaths', value)}
        className="mt-3"
      />

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/65 transition hover:bg-white/[0.08]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={capturing}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-fuchsia-300/35 bg-fuchsia-500/20 px-4 py-2 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-500/30 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
        >
          <ClipboardCheck className="h-4 w-4" />
          {capturing ? 'Capturing' : 'Save Lesson'}
        </button>
      </div>
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  className = ''
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="min-h-24 resize-y rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/30"
      />
    </label>
  );
}

function StrategyMemoryList({
  summaries,
  selectedStrategyId,
  onSelect
}: {
  summaries: StrategyMemorySummary[];
  selectedStrategyId: string | null;
  onSelect: (summary: StrategyMemorySummary) => void;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-black/20">
      <div className="border-b border-white/10 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ClipboardCheck className="h-4 w-4 text-cyan-200" />
          Strategy Review Queue
        </div>
        <div className="mt-1 text-xs text-white/45">{summaries.length} strategy rows in the current lens.</div>
      </div>
      <div className="grid max-h-[72vh] content-start gap-2 overflow-y-auto p-2">
        {summaries.map((summary) => (
          <StrategyMemoryCard
            key={summary.strategy.strategyKey}
            summary={summary}
            selected={selectedStrategyId === summary.strategy.strategyId}
            onSelect={() => onSelect(summary)}
          />
        ))}
        {summaries.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/45">
            No strategies match the current lens.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StrategyMemoryCard({
  summary,
  selected,
  onSelect
}: {
  summary: StrategyMemorySummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const strategy = summary.strategy;
  const statusIcon = isPaperReadyStrategy(strategy)
    ? <ClipboardCheck className="h-4 w-4" />
    : isBlockedStrategy(strategy)
      ? <AlertTriangle className="h-4 w-4" />
      : needsBacktest(strategy)
        ? <Target className="h-4 w-4" />
        : <CheckCircle2 className="h-4 w-4" />;
  const summaryMetrics = strategy.latestBacktestSummary;
  const blockers = summary.blockers.length ? summary.blockers : [summary.nextReview];

  return (
    <article className={`min-w-0 rounded-md border p-3 transition ${
      selected ? 'border-cyan-300/45 bg-cyan-400/10' : 'border-white/10 bg-white/[0.035] hover:border-cyan-400/25 hover:bg-white/[0.055]'
    }`}>
      <button type="button" onClick={onSelect} className="block w-full min-w-0 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{strategy.displayName}</div>
            <div className="mt-1 truncate font-mono text-[10px] text-white/35">{strategy.strategyId}</div>
          </div>
          <div className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs font-semibold ${summary.statusTone}`}>
            {statusIcon}
            {summary.statusLabel}
          </div>
        </div>

        <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(4.5rem,1fr))]">
          <TinyMetric label="Trades" value={String(summaryMetrics?.total_trades ?? strategy.tradeCount)} />
          <TinyMetric label="Return" value={formatPercent(summaryMetrics?.return_pct)} />
          <TinyMetric label="PF" value={formatNumber(summaryMetrics?.profit_factor)} />
          <TinyMetric label="Lessons" value={String(summary.learningEventCount)} />
          <TinyMetric label="Wins" value={String(summary.winCount)} />
          <TinyMetric label="Mistakes" value={String(summary.mistakeCount)} />
        </div>

        <EvidenceMeter items={summary.evidenceItems} complete={summary.evidenceComplete} total={summary.evidenceTotal} />

        <LearningSnapshot summary={summary} />

        <div className="mt-3 rounded-md border border-white/10 bg-black/25 p-2 text-xs leading-5 text-white/60">
          {blockers.slice(0, 3).map((blocker) => (
            <div key={`${strategy.strategyId}:${blocker}`} className="break-words">{blocker.replace(/_/g, ' ')}</div>
          ))}
        </div>
      </button>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Link
          to={detailPath(strategy)}
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-500/12 px-3 py-2 text-xs font-bold text-cyan-50 transition hover:bg-cyan-500/22"
        >
          <ShieldCheck className="h-4 w-4" />
          Detail
        </Link>
        <button
          type="button"
          onClick={onSelect}
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-white/75 transition hover:bg-white/[0.09]"
        >
          <GitBranch className="h-4 w-4" />
          Focus
        </button>
      </div>
    </article>
  );
}

function LearningSnapshot({ summary }: { summary: StrategyMemorySummary }) {
  const primary = summary.latestLesson || summary.latestLearning;
  return (
    <div className="mt-3 rounded-md border border-fuchsia-300/15 bg-fuchsia-500/[0.08] p-2 text-xs leading-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-bold uppercase tracking-[0.12em] text-fuchsia-200/70">Learning</div>
        <div className="text-white/45">
          {summary.memoryNoteCount} notes / {summary.ruleChangeCount} rule changes / {summary.openFollowUpCount} follow-ups
        </div>
      </div>
      {primary ? (
        <div className="mt-2 text-white/65">
          <span className="font-semibold text-white/80">{learningOutcomeLabel(primary.outcome)}:</span>{' '}
          {primary.lesson || primary.summary || primary.title}
        </div>
      ) : (
        <div className="mt-2 text-white/40">No captured strategy lesson yet.</div>
      )}
      {summary.openFollowUp ? (
        <div className="mt-1 text-fuchsia-100/80">Next: {summary.openFollowUp.nextAction}</div>
      ) : null}
      {summary.latestRuleChange?.ruleChange ? (
        <div className="mt-1 text-cyan-100/75">Rule: {summary.latestRuleChange.ruleChange}</div>
      ) : null}
    </div>
  );
}

function EvidenceMeter({ items, complete, total }: { items: EvidenceItem[]; complete: number; total: number }) {
  return (
    <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Evidence</div>
        <div className="text-xs font-semibold text-white/60">{complete}/{total}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.key}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
              item.ok ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-white/35'
            }`}
          >
            {item.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function suggestedAgentCommands(strategy: HyperliquidStrategyCatalogRow): string[] {
  const strategyId = strategy.strategyId;
  const commands = ['npm run hf:status'];
  if (isDocsOnlyStrategy(strategy)) {
    commands.push(`npm run hf:strategy:new -- --strategy-id ${strategyId}`);
  }
  if (strategy.registeredForBacktest || strategy.canBacktest || needsBacktest(strategy)) {
    commands.push(`npm run hf:backtest -- --strategy ${strategyId}`);
  }
  if (strategy.gateStatus === 'audit-eligible' || isBlockedStrategy(strategy)) {
    commands.push(`npm run hf:agent:audit -- --strategy ${strategyId}`);
  }
  if (isPaperReadyStrategy(strategy)) {
    commands.push(`npm run hf:paper -- --strategy ${strategyId}`);
  }
  return uniqueStrings(commands).slice(0, 4);
}

function sourcePathsForAgent(strategy: HyperliquidStrategyCatalogRow): string[] {
  const artifacts = strategy.latestArtifactPaths;
  return uniqueStrings([
    ...strategy.documentationPaths,
    artifacts.docs,
    artifacts.spec
  ]).slice(0, 5);
}

function evidencePathsForAgent(strategy: HyperliquidStrategyCatalogRow): string[] {
  const artifacts = strategy.latestArtifactPaths;
  return uniqueStrings([
    artifacts.backtest,
    artifacts.validation,
    artifacts.paper,
    artifacts.doublingStability,
    artifacts.btcOptimization
  ]).slice(0, 6);
}

function AgentPathPanel({ summary }: { summary: StrategyMemorySummary }) {
  const strategy = summary.strategy;
  const missing = summary.evidenceItems.filter((item) => !item.ok).map((item) => item.label);
  const sourcePaths = sourcePathsForAgent(strategy);
  const evidencePaths = evidencePathsForAgent(strategy);
  const commands = suggestedAgentCommands(strategy);

  return (
    <div className="rounded-md border border-cyan-300/20 bg-cyan-500/[0.08] p-3 text-xs leading-5">
      <div className="flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-cyan-100/75">
        <Target className="h-4 w-4" />
        Agent Path
      </div>
      <div className="mt-2 text-white/70">{summary.nextReview}</div>
      <div className="mt-3 grid gap-3">
        <AgentPathList label="Missing" empty="No missing evidence in this lens." items={missing} />
        <AgentPathList label="Source" empty="No source path reported yet." items={sourcePaths} mono />
        <AgentPathList label="Evidence" empty="No artifact path reported yet." items={evidencePaths} mono />
        <AgentPathList label="Commands" empty="No stable command suggestion." items={commands} mono />
      </div>
    </div>
  );
}

function AgentPathList({
  label,
  items,
  empty,
  mono = false
}: {
  label: string;
  items: string[];
  empty: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</div>
      <div className={`mt-1 grid gap-1 text-white/60 ${mono ? 'font-mono text-[11px]' : ''}`}>
        {items.length ? items.map((item) => (
          <div key={`${label}:${item}`} className="break-words rounded border border-white/10 bg-black/20 px-2 py-1">
            {item.replace(/_/g, label === 'Missing' ? ' ' : '_')}
          </div>
        )) : (
          <div className="text-white/35">{empty}</div>
        )}
      </div>
    </div>
  );
}

function NodeInspector({
  node,
  summary
}: {
  node: MemoryNode | null;
  summary: StrategyMemorySummary | null;
}) {
  const strategy = summary?.strategy || null;
  const metadata = node?.metadata || {};
  const canOpenPath = Boolean(node?.path && window.electronAPI?.obsidian?.openPath);

  const openNodePath = async () => {
    if (node?.path && window.electronAPI?.obsidian?.openPath) {
      await window.electronAPI.obsidian.openPath(node.path);
    }
  };

  return (
    <aside className="min-w-0 rounded-md border border-white/10 bg-black/25 p-4">
      {!node ? (
        <div className="text-sm text-white/45">Select a graph node to inspect memory, strategy evidence, and source paths.</div>
      ) : (
        <div className="grid gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300/80">
              <GitBranch className="h-4 w-4" />
              Node Inspector
            </div>
            <h2 className="mt-2 break-words text-lg font-semibold text-white">{node.label}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="inline-flex rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-xs font-semibold text-white/70">
                {NODE_TYPE_LABELS[node.type]}
              </div>
              {summary ? (
                <div className={`inline-flex rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs font-semibold ${summary.statusTone}`}>
                  {summary.statusLabel}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 text-sm leading-6 text-white/65">
            {strategy ? <InfoRow label="Strategy" value={strategy.strategyId} /> : node.strategyId ? <InfoRow label="Strategy" value={node.strategyId} /> : null}
            {(strategy?.pipelineStage || node.pipelineStage) ? <InfoRow label="Stage" value={strategy?.pipelineStage || node.pipelineStage || ''} /> : null}
            {(strategy?.gateStatus || node.gateStatus) ? <InfoRow label="Gate" value={strategy?.gateStatus || node.gateStatus || ''} /> : null}
            {node.type === 'learning-event' && typeof metadata.kind === 'string' ? <InfoRow label="Learning Kind" value={metadata.kind.replace(/_/g, ' ')} /> : null}
            {node.type === 'learning-event' && typeof metadata.outcome === 'string' ? <InfoRow label="Outcome" value={metadata.outcome} /> : null}
            {summary ? <InfoRow label="Next Review" value={summary.nextReview} /> : null}
            {node.repoPath ? <InfoRow label="Repo Path" value={node.repoPath} mono /> : null}
          </div>

          {node.summary ? (
            <div className="rounded-md border border-white/10 bg-black/25 p-3 text-sm leading-6 text-white/65">
              {node.summary}
            </div>
          ) : null}

          {strategy ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <TinyMetric label="Backtest" value={String(strategy.evidenceCounts.backtestTrades)} />
                <TinyMetric label="Paper" value={String(strategy.evidenceCounts.paperTrades)} />
                <TinyMetric label="Lessons" value={String(summary?.learningEventCount ?? 0)} />
                <TinyMetric label="Follow-ups" value={String(summary?.openFollowUpCount ?? 0)} />
              </div>
              {summary ? <LearningSnapshot summary={summary} /> : null}
              {summary ? <EvidenceMeter items={summary.evidenceItems} complete={summary.evidenceComplete} total={summary.evidenceTotal} /> : null}
              {summary ? <AgentPathPanel summary={summary} /> : null}
              {summary?.blockers.length ? (
                <div className="rounded-md border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-50">
                  {summary.blockers.slice(0, 5).map((blocker) => (
                    <div key={`${strategy.strategyId}:inspector:${blocker}`} className="break-words">{blocker.replace(/_/g, ' ')}</div>
                  ))}
                </div>
              ) : null}
            </>
          ) : typeof metadata.evidenceCounts === 'object' && metadata.evidenceCounts ? (
            <div className="rounded-md border border-white/10 bg-black/25 p-3 text-xs leading-5 text-white/55">
              Evidence metadata is available on this node.
            </div>
          ) : null}

          <div className="grid gap-2">
            {node.path ? (
              <button
                type="button"
                onClick={() => void openNodePath()}
                disabled={!canOpenPath}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-white/35"
              >
                <ExternalLink className="h-4 w-4" />
                Open Path
              </button>
            ) : null}
            {strategy ? (
              <Link
                to={detailPath(strategy)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-500/12 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/22"
              >
                <ShieldCheck className="h-4 w-4" />
                Open Strategy Detail
              </Link>
            ) : null}
            {node.repoPath?.startsWith('docs/') ? (
              <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/45">
                <FileText className="h-4 w-4" />
                Repo doc source
              </div>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</div>
      <div className={`mt-1 break-words text-white/75 ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}

function TinyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</div>
      <div className="mt-1 truncate text-xs font-semibold text-white" title={value}>{value}</div>
    </div>
  );
}
