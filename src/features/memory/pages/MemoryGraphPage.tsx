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
  Layers,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Target
} from 'lucide-react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  hyperliquidService,
  type HyperliquidGraphifyStatus,
  type HyperliquidPipelineStage,
  type HyperliquidStrategyCatalogRow,
  type HyperliquidStrategyLearningEvent,
  type HyperliquidStrategyLearningKind,
  type HyperliquidStrategyLearningOutcome
} from '@/services/hyperliquidService';
import type {
  ObsidianGraphEdge,
  ObsidianGraphNode,
  ObsidianGraphNodeType,
  ObsidianGraphResponse,
  ObsidianStrategyMemoryInput,
  ObsidianSyncStrategyMemoryResult
} from '@/types/electron';

type MemoryNode = ObsidianGraphNode & {
  x?: number;
  y?: number;
  r?: number;
  degree?: number;
};

type MemoryGraph = {
  nodes: MemoryNode[];
  edges: ObsidianGraphEdge[];
};

type MemoryLensId = 'actionable' | 'paper-ready' | 'blocked' | 'needs-backtest' | 'docs-only' | 'all';

type LearningLensId = 'lessons' | 'mistakes' | 'wins' | 'rule-changes' | 'follow-ups';

type EvidenceItem = {
  key: 'docs' | 'backend' | 'backtest' | 'validation' | 'paper';
  label: string;
  ok: boolean;
};

type StrategyMemorySummary = {
  strategy: HyperliquidStrategyCatalogRow;
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  memoryNoteCount: number;
  learningEventCount: number;
  mistakeCount: number;
  winCount: number;
  ruleChangeCount: number;
  openFollowUpCount: number;
  latestLearning: HyperliquidStrategyLearningEvent | null;
  latestLesson: HyperliquidStrategyLearningEvent | null;
  latestRuleChange: HyperliquidStrategyLearningEvent | null;
  openFollowUp: HyperliquidStrategyLearningEvent | null;
  evidenceItems: EvidenceItem[];
  evidenceComplete: number;
  evidenceTotal: number;
  blockers: string[];
  statusLabel: string;
  statusTone: string;
  nextReview: string;
  queryText: string;
};

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

const NODE_TYPE_LABELS: Record<ObsidianGraphNodeType, string> = {
  strategy: 'Strategy',
  'strategy-doc': 'Strategy Doc',
  'backend-package': 'Backend',
  'backtest-artifact': 'Backtest',
  'validation-artifact': 'Validation',
  'paper-artifact': 'Paper',
  'learning-event': 'Learning Event',
  'agent-memory': 'Agent Memory',
  'progress-handoff': 'Handoff',
  'obsidian-note': 'Obsidian Note',
  'repo-path': 'Repo Path'
};

const NODE_TYPE_TONES: Record<ObsidianGraphNodeType, { fill: string; stroke: string; text: string; glow: string }> = {
  strategy: { fill: '#0f766e', stroke: '#5eead4', text: '#ecfeff', glow: '#2dd4bf' },
  'strategy-doc': { fill: '#1d4ed8', stroke: '#93c5fd', text: '#eff6ff', glow: '#60a5fa' },
  'backend-package': { fill: '#0e7490', stroke: '#67e8f9', text: '#ecfeff', glow: '#22d3ee' },
  'backtest-artifact': { fill: '#15803d', stroke: '#86efac', text: '#f0fdf4', glow: '#4ade80' },
  'validation-artifact': { fill: '#4d7c0f', stroke: '#bef264', text: '#f7fee7', glow: '#a3e635' },
  'paper-artifact': { fill: '#047857', stroke: '#6ee7b7', text: '#ecfdf5', glow: '#34d399' },
  'learning-event': { fill: '#9333ea', stroke: '#f0abfc', text: '#faf5ff', glow: '#e879f9' },
  'agent-memory': { fill: '#7e22ce', stroke: '#d8b4fe', text: '#faf5ff', glow: '#c084fc' },
  'progress-handoff': { fill: '#a16207', stroke: '#fde047', text: '#fefce8', glow: '#facc15' },
  'obsidian-note': { fill: '#be123c', stroke: '#fda4af', text: '#fff1f2', glow: '#fb7185' },
  'repo-path': { fill: '#475569', stroke: '#cbd5e1', text: '#f8fafc', glow: '#94a3b8' }
};

const MEMORY_LENSES: Array<{ id: MemoryLensId; label: string; detail: string }> = [
  { id: 'actionable', label: 'Actionable', detail: 'review queue' },
  { id: 'paper-ready', label: 'Paper Ready', detail: 'paper gate' },
  { id: 'blocked', label: 'Blocked', detail: 'repair list' },
  { id: 'needs-backtest', label: 'Needs Backtest', detail: 'test next' },
  { id: 'docs-only', label: 'Docs Only', detail: 'needs backend' },
  { id: 'all', label: 'All', detail: 'full catalog' }
];

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

const LEARNING_LENSES: Array<{ id: LearningLensId; label: string; detail: string }> = [
  { id: 'lessons', label: 'Lessons', detail: 'latest learning' },
  { id: 'mistakes', label: 'Mistakes', detail: 'loss reviews' },
  { id: 'wins', label: 'Wins', detail: 'what worked' },
  { id: 'rule-changes', label: 'Rule Changes', detail: 'rules changed' },
  { id: 'follow-ups', label: 'Open Follow-ups', detail: 'next actions' }
];

const GRAPH_WIDTH = 980;
const GRAPH_HEIGHT = 760;
const GRAPH_CENTER = { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 };

const TYPE_RANK: Record<ObsidianGraphNodeType, number> = {
  strategy: 0,
  'strategy-doc': 1,
  'backend-package': 2,
  'backtest-artifact': 3,
  'validation-artifact': 4,
  'paper-artifact': 5,
  'learning-event': 6,
  'agent-memory': 7,
  'obsidian-note': 8,
  'progress-handoff': 9,
  'repo-path': 10
};

const STAGE_ANGLE: Record<HyperliquidPipelineStage, number> = {
  paper: -0.58,
  audit: 0.18,
  backtesting: 1.12,
  research: 2.58,
  blocked: 3.72
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'node';
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function jitter(value: string, amount: number): number {
  return ((stableHash(value) % 1000) / 1000 - 0.5) * amount;
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

function formatRate(value: unknown): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 'N/A';
  const percent = Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  return `${Math.round(percent)}%`;
}

function formatGraphCount(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : 'N/A';
}

function formatGraphUpdatedAt(value: number | null): string {
  if (!value) return 'Not built';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
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
  return layoutGraph(nodes, edges);
}

function layoutGraph(nodes: MemoryNode[], edges: ObsidianGraphEdge[]): MemoryGraph {
  const positioned = nodes.map((node) => ({ ...node }));
  const degree = new Map<string, number>();
  edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  });

  positioned.forEach((node) => {
    node.degree = degree.get(node.id) || 0;
    const baseRadius = node.type === 'strategy' ? 19 : node.type.includes('artifact') ? 12 : 10;
    node.r = Math.min(baseRadius + Math.sqrt(node.degree || 0) * 2.4, node.type === 'strategy' ? 31 : 22);
  });

  const strategyNodes = positioned
    .filter((node) => node.type === 'strategy')
    .sort((a, b) => {
      const stageDelta = (a.pipelineStage || '').localeCompare(b.pipelineStage || '');
      return stageDelta || a.label.localeCompare(b.label);
    });
  const strategyPosition = new Map<string, { x: number; y: number; angle: number }>();

  strategyNodes.forEach((node, index) => {
    const stage = (node.pipelineStage || 'research') as HyperliquidPipelineStage;
    const baseAngle = STAGE_ANGLE[stage] ?? ((Math.PI * 2 * index) / Math.max(strategyNodes.length, 1));
    const sameStageIndex = strategyNodes.slice(0, index).filter((item) => item.pipelineStage === node.pipelineStage).length;
    const angle = baseAngle + (sameStageIndex - 1.5) * 0.18 + jitter(node.id, 0.1);
    const radius = stage === 'paper' ? 150 : stage === 'audit' ? 170 : stage === 'backtesting' ? 190 : stage === 'blocked' ? 214 : 224;
    const x = GRAPH_CENTER.x + Math.cos(angle) * radius * 1.08;
    const y = GRAPH_CENTER.y + Math.sin(angle) * radius * 0.82;
    node.x = x;
    node.y = y;
    strategyPosition.set(node.id, { x, y, angle });
  });

  const companionGroups = new Map<string, MemoryNode[]>();
  const unanchored: MemoryNode[] = [];

  positioned
    .filter((node) => node.type !== 'strategy')
    .forEach((node) => {
      const strategyId = node.strategyId ? `strategy:${node.strategyId}` : null;
      const directStrategy = strategyId && strategyPosition.has(strategyId)
        ? strategyId
        : edges.find((edge) => {
          if (edge.source === node.id && strategyPosition.has(edge.target)) return true;
          if (edge.target === node.id && strategyPosition.has(edge.source)) return true;
          return false;
        });
      const anchorId = typeof directStrategy === 'string'
        ? directStrategy
        : directStrategy
          ? strategyPosition.has(directStrategy.source) ? directStrategy.source : directStrategy.target
          : null;
      if (anchorId) {
        const group = companionGroups.get(anchorId) || [];
        group.push(node);
        companionGroups.set(anchorId, group);
      } else {
        unanchored.push(node);
      }
    });

  companionGroups.forEach((group, anchorId) => {
    const anchor = strategyPosition.get(anchorId);
    if (!anchor) return;
    group
      .sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type] || a.label.localeCompare(b.label))
      .forEach((node, index) => {
        const total = group.length;
        const spread = Math.min(2.7, Math.max(1.2, total * 0.22));
        const localAngle = anchor.angle + Math.PI + (index - (total - 1) / 2) * (spread / Math.max(total - 1, 1));
        const ring = 74 + Math.floor(index / 9) * 50 + (node.type.includes('artifact') ? 22 : 0);
        node.x = anchor.x + Math.cos(localAngle) * ring + jitter(node.id, 18);
        node.y = anchor.y + Math.sin(localAngle) * ring + jitter(`${node.id}:y`, 18);
      });
  });

  unanchored
    .sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type] || a.label.localeCompare(b.label))
    .forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(unanchored.length, 1) + jitter(node.id, 0.18);
      const radius = 270 + (index % 3) * 28;
      node.x = GRAPH_CENTER.x + Math.cos(angle) * radius * 1.18;
      node.y = GRAPH_CENTER.y + Math.sin(angle) * radius * 0.88;
    });

  return { nodes: positioned, edges };
}

function summarizeTypeCounts(nodes: MemoryNode[]): Array<{ type: ObsidianGraphNodeType; count: number }> {
  const counts = new Map<ObsidianGraphNodeType, number>();
  nodes.forEach((node) => counts.set(node.type, (counts.get(node.type) || 0) + 1));
  return Object.entries(NODE_TYPE_LABELS)
    .map(([type]) => ({ type: type as ObsidianGraphNodeType, count: counts.get(type as ObsidianGraphNodeType) || 0 }))
    .filter((item) => item.count > 0);
}

export default function MemoryGraphPage() {
  const { activeWorkspace, updateWorkspace } = useWorkspaceContext();
  const [strategies, setStrategies] = useState<HyperliquidStrategyCatalogRow[]>([]);
  const [learningEvents, setLearningEvents] = useState<HyperliquidStrategyLearningEvent[]>([]);
  const [obsidianGraph, setObsidianGraph] = useState<ObsidianGraphResponse | null>(null);
  const [graphifyStatus, setGraphifyStatus] = useState<HyperliquidGraphifyStatus | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [activeLens, setActiveLens] = useState<MemoryLensId>('actionable');
  const [activeLearningLens, setActiveLearningLens] = useState<LearningLensId>('lessons');
  const [query, setQuery] = useState('');
  const [repoGraphExpanded, setRepoGraphExpanded] = useState(true);
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
      const [catalog, learning, graphify] = await Promise.all([
        hyperliquidService.getStrategyCatalog(500),
        hyperliquidService.getStrategyLearning(undefined, 500),
        hyperliquidService.getGraphifyStatus().catch((err): HyperliquidGraphifyStatus => ({
          available: false,
          updatedAt: null,
          outputDir: 'graphify-out',
          reportPath: 'graphify-out/GRAPH_REPORT.md',
          graphJsonPath: 'graphify-out/graph.json',
          htmlPath: 'graphify-out/graph.html',
          explorerUrl: '',
          htmlUrl: '',
          nodeCount: null,
          edgeCount: null,
          communityCount: null,
          warnings: [err instanceof Error ? err.message : 'Graphify status could not be loaded.']
        }))
      ]);
      setStrategies(catalog.strategies);
      setLearningEvents(learning.events);
      setGraphifyStatus(graphify);
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
    () => scopeGraph(mergedGraph, filteredSummaries, selectedStrategyId, query),
    [filteredSummaries, mergedGraph, query, selectedStrategyId]
  );

  const selectedNode = useMemo(
    () => scopedGraph.nodes.find((node) => node.id === selectedNodeId)
      || (selectedStrategyId ? scopedGraph.nodes.find((node) => node.id === `strategy:${selectedStrategyId}`) : null)
      || scopedGraph.nodes[0]
      || null,
    [scopedGraph.nodes, selectedNodeId, selectedStrategyId]
  );

  const selectedSummary = useMemo(() => {
    const nodeStrategyId = selectedNode ? strategyIdFromNodeId(mergedGraph, selectedNode.id) : selectedStrategyId;
    return strategySummaries.find((summary) => summary.strategy.strategyId === nodeStrategyId) || null;
  }, [mergedGraph, selectedNode, selectedStrategyId, strategySummaries]);

  const lensCounts = useMemo(() => MEMORY_LENSES.reduce((accumulator, lens) => {
    accumulator[lens.id] = strategySummaries.filter((summary) => matchesLens(summary, lens.id)).length;
    return accumulator;
  }, {} as Record<MemoryLensId, number>), [strategySummaries]);

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

  const visibleEdgeCount = scopedGraph.edges.length;
  const visibleNodeCount = scopedGraph.nodes.length;

  const typeCounts = useMemo(
    () => summarizeTypeCounts(mergedGraph.nodes),
    [mergedGraph.nodes]
  );

  const runSync = async () => {
    if (!activeWorkspace || !window.electronAPI?.obsidian?.syncStrategyMemory) {
      setError('Obsidian sync is only available inside the Electron app with an active workspace.');
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

  const openGraphifyPath = async (targetPath: string | null | undefined) => {
    if (!targetPath) {
      setError('Graphify path is not available yet. Run npm run graph:build.');
      return;
    }
    if (!window.electronAPI?.obsidian?.openPath) {
      setError('Opening Graphify files is only available inside the Electron app.');
      return;
    }

    setError(null);
    setMessage(null);
    try {
      await window.electronAPI.obsidian.openPath(targetPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open Graphify artifact.');
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

      <RepoGraphPanel
        status={graphifyStatus}
        canOpen={Boolean(window.electronAPI?.obsidian?.openPath)}
        expanded={repoGraphExpanded}
        onToggleExpanded={() => setRepoGraphExpanded((value) => !value)}
        onOpenReport={() => void openGraphifyPath(graphifyStatus?.reportPath)}
        onOpenHtml={() => void openGraphifyPath(graphifyStatus?.htmlPath)}
      />

      <section className="grid gap-3">
        <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3">
          <Search className="h-4 w-4 shrink-0 text-white/45" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search strategies, notes, artifacts..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
        </label>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
          {MEMORY_LENSES.map((lens) => (
            <LensButton
              key={lens.id}
              lens={lens}
              count={lensCounts[lens.id] || 0}
              active={activeLens === lens.id}
              onClick={() => setActiveLens(lens.id)}
            />
          ))}
        </div>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8.5rem),1fr))]">
          {LEARNING_LENSES.map((lens) => (
            <LearningLensButton
              key={lens.id}
              lens={lens}
              count={learningEvents.filter((event) => learningLensMatches(event, lens.id)).length}
              active={activeLearningLens === lens.id}
              onClick={() => setActiveLearningLens(lens.id)}
            />
          ))}
        </div>
      </section>

      <section className="grid min-w-0 items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
        <StrategyMemoryList
          summaries={filteredSummaries}
          selectedStrategyId={selectedSummary?.strategy.strategyId || null}
          onSelect={handleSelectStrategy}
        />

        <div className="min-w-0 rounded-md border border-white/10 bg-black/20">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <GitBranch className="h-4 w-4 text-cyan-200" />
                Evidence Neighborhood
              </div>
              <div className="mt-1 text-xs text-white/45">
                {visibleNodeCount}/{mergedGraph.nodes.length} nodes, {visibleEdgeCount}/{mergedGraph.edges.length} edges
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-white/55">
              {selectedSummary ? selectedSummary.strategy.displayName : MEMORY_LENSES.find((lens) => lens.id === activeLens)?.label}
            </div>
          </div>
          <MemoryGraphCanvas graph={scopedGraph} selectedNodeId={selectedNode?.id || null} onSelect={handleSelectNode} />
          <PassiveLegend counts={typeCounts} />
        </div>

        <NodeInspector node={selectedNode} summary={selectedSummary} />
      </section>
    </div>
  );
}

function RepoGraphPanel({
  status,
  canOpen,
  expanded,
  onToggleExpanded,
  onOpenReport,
  onOpenHtml
}: {
  status: HyperliquidGraphifyStatus | null;
  canOpen: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenReport: () => void;
  onOpenHtml: () => void;
}) {
  const available = Boolean(status?.available);
  const warnings = status?.warnings || [];
  const isLoading = status === null;
  const iframeSrc = available ? status?.explorerUrl || status?.htmlUrl || null : null;

  return (
    <section className="overflow-hidden rounded-md border border-white/10 bg-black/20">
      <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Network className="h-4 w-4 text-cyan-200" />
            Repo Graph
          </div>
          <div className={`mt-1 text-xs font-semibold ${available ? 'text-emerald-200' : 'text-amber-200'}`}>
            {isLoading ? 'Checking Graphify' : available ? 'Graphify artifacts ready' : 'Graphify build pending'}
          </div>
          <div className="mt-1 truncate text-xs text-white/40">
            {status?.outputDir || 'graphify-out'}
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <button
            type="button"
            onClick={onToggleExpanded}
            disabled={!available}
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md border border-fuchsia-400/25 bg-fuchsia-500/15 px-3 py-2 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-white/35 sm:flex-none"
          >
            <GitBranch className="h-4 w-4" />
            {expanded ? 'Hide Map' : 'Show Map'}
          </button>
          <button
            type="button"
            onClick={onOpenReport}
            disabled={!available || !canOpen}
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-white/35 sm:flex-none"
          >
            <FileText className="h-4 w-4" />
            Report
          </button>
          <button
            type="button"
            onClick={onOpenHtml}
            disabled={!available || !canOpen}
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-500/12 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/22 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-white/35 sm:flex-none"
          >
            <ExternalLink className="h-4 w-4" />
            HTML
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
        <TinyMetric label="Nodes" value={formatGraphCount(status?.nodeCount ?? null)} />
        <TinyMetric label="Edges" value={formatGraphCount(status?.edgeCount ?? null)} />
        <TinyMetric label="Communities" value={formatGraphCount(status?.communityCount ?? null)} />
        <TinyMetric label="Updated" value={formatGraphUpdatedAt(status?.updatedAt ?? null)} />
      </div>

      {warnings.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
          {warnings.join(' ')}
        </div>
      ) : null}
      </div>

      {expanded && iframeSrc ? (
        <div className="border-t border-white/10 bg-[#0f0f1a]">
          <iframe
            src={iframeSrc}
            title="Interactive Graphify repository map"
            className="h-[min(78vh,880px)] w-full bg-[#0f0f1a]"
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : null}
    </section>
  );
}

function LensButton({
  lens,
  count,
  active,
  onClick
}: {
  lens: { id: MemoryLensId; label: string; detail: string };
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left transition ${
        active ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-50' : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]'
      }`}
    >
      <Target className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-4">{lens.label}</span>
        <span className="block text-xs leading-4 text-white/40">{lens.detail}</span>
      </span>
      <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs font-bold">{count}</span>
    </button>
  );
}

function LearningLensButton({
  lens,
  count,
  active,
  onClick
}: {
  lens: { id: LearningLensId; label: string; detail: string };
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left transition ${
        active ? 'border-fuchsia-300/45 bg-fuchsia-400/15 text-fuchsia-50' : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]'
      }`}
    >
      <GitBranch className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-4">{lens.label}</span>
        <span className="block text-xs leading-4 text-white/40">{lens.detail}</span>
      </span>
      <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs font-bold">{count}</span>
    </button>
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

function PassiveLegend({ counts }: { counts: Array<{ type: ObsidianGraphNodeType; count: number }> }) {
  return (
    <div className="border-t border-white/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/45">
        <Layers className="h-4 w-4" />
        Node Legend
      </div>
      <div className="flex flex-wrap gap-2">
        {counts.map((item) => {
          const tone = NODE_TYPE_TONES[item.type];
          return (
            <span
              key={item.type}
              className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-semibold"
              style={{ borderColor: `${tone.stroke}55`, color: tone.text, background: `${tone.fill}33` }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: tone.stroke }} />
              {NODE_TYPE_LABELS[item.type]} {item.count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function MemoryGraphCanvas({
  graph,
  selectedNodeId,
  onSelect
}: {
  graph: MemoryGraph;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const selectedLinks = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const linked = new Set<string>([selectedNodeId]);
    graph.edges.forEach((edge) => {
      if (edge.source === selectedNodeId) linked.add(edge.target);
      if (edge.target === selectedNodeId) linked.add(edge.source);
    });
    return linked;
  }, [graph.edges, selectedNodeId]);

  if (graph.nodes.length === 0) {
    return (
      <div className="flex min-h-[520px] items-center justify-center p-6 text-center text-sm text-white/45">
        No graph nodes match the current lens.
      </div>
    );
  }

  return (
    <div className="relative aspect-[1.25/1] min-h-[340px] max-h-[720px] overflow-hidden rounded-t-md bg-[#05070d]">
      <svg
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label="Obsidian strategy memory graph"
      >
        <defs>
          <pattern id="memoryDots" width="34" height="34" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#94a3b8" opacity="0.16" />
          </pattern>
          <filter id="nodeGlow" x="-70%" y="-70%" width="240%" height="240%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#67e8f9" floodOpacity="0.34" />
          </filter>
          <filter id="selectedGlow" x="-90%" y="-90%" width="280%" height="280%">
            <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#f8fafc" floodOpacity="0.42" />
          </filter>
        </defs>

        <rect width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill="#05070d" />
        <rect width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill="url(#memoryDots)" />
        <circle cx={GRAPH_CENTER.x} cy={GRAPH_CENTER.y} r="132" fill="none" stroke="#334155" strokeOpacity="0.3" strokeWidth="1" />
        <circle cx={GRAPH_CENTER.x} cy={GRAPH_CENTER.y} r="246" fill="none" stroke="#334155" strokeOpacity="0.18" strokeWidth="1" />
        <circle cx={GRAPH_CENTER.x} cy={GRAPH_CENTER.y} r="340" fill="none" stroke="#334155" strokeOpacity="0.12" strokeWidth="1" />
        <text x={GRAPH_CENTER.x} y={GRAPH_CENTER.y - 8} textAnchor="middle" fill="#cbd5e1" fillOpacity="0.5" fontSize="12" fontWeight="700" letterSpacing="0">
          Hedge Fund Memory
        </text>
        <text x={GRAPH_CENTER.x} y={GRAPH_CENTER.y + 13} textAnchor="middle" fill="#94a3b8" fillOpacity="0.44" fontSize="10" fontWeight="600" letterSpacing="0">
          repo evidence + Obsidian notes
        </text>

        {graph.edges.map((edge) => {
          const source = nodeById.get(edge.source);
          const target = nodeById.get(edge.target);
          if (!source || !target) return null;
          const sourceX = source.x || 0;
          const sourceY = source.y || 0;
          const targetX = target.x || 0;
          const targetY = target.y || 0;
          const midX = (sourceX + targetX) / 2;
          const midY = (sourceY + targetY) / 2;
          const dx = targetX - sourceX;
          const dy = targetY - sourceY;
          const curve = Math.min(70, Math.max(-70, (dx * 0.08) - (dy * 0.04)));
          const controlX = midX - dy * 0.08;
          const controlY = midY + curve;
          const isFocus = !selectedNodeId || edge.source === selectedNodeId || edge.target === selectedNodeId;
          const stroke = edge.type === 'artifact'
            ? '#86efac'
            : edge.type === 'wiki-link'
              ? '#d8b4fe'
              : edge.type === 'related-note'
                ? '#fda4af'
                : edge.type === 'learning-link'
                  ? '#f0abfc'
                  : '#94a3b8';
          return (
            <path
              key={edge.id}
              d={`M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`}
              stroke={stroke}
              strokeOpacity={isFocus ? 0.58 : 0.08}
              strokeWidth={isFocus ? (edge.type === 'artifact' ? 1.8 : 1.35) : 0.8}
              fill="none"
            />
          );
        })}

        {graph.nodes.map((node) => {
          const tone = NODE_TYPE_TONES[node.type];
          const isSelected = node.id === selectedNodeId;
          const isLinked = selectedLinks.has(node.id);
          const isDimmed = Boolean(selectedNodeId) && !isLinked;
          const radius = node.r || 11;
          const label = node.label.length > 26 ? `${node.label.slice(0, 25)}...` : node.label;
          const showLabel = node.type === 'strategy' || isSelected || isLinked || graph.nodes.length <= 36;
          return (
            <g
              key={node.id}
              transform={`translate(${node.x || 0}, ${node.y || 0})`}
              onClick={() => onSelect(node.id)}
              className="cursor-pointer"
              filter={isSelected ? 'url(#selectedGlow)' : node.type === 'strategy' ? 'url(#nodeGlow)' : undefined}
              opacity={isDimmed ? 0.32 : 1}
            >
              <title>{`${node.label} - ${NODE_TYPE_LABELS[node.type]}`}</title>
              <circle
                r={radius + 10}
                fill={tone.glow}
                opacity={isSelected ? 0.2 : node.type === 'strategy' ? 0.12 : 0.045}
              />
              <circle
                r={radius}
                fill={tone.fill}
                stroke={isSelected ? '#f8fafc' : tone.stroke}
                strokeWidth={isSelected ? 2.6 : node.type === 'strategy' ? 1.8 : 1.1}
                opacity={0.96}
              />
              <circle r={Math.max(2.8, radius * 0.32)} fill={tone.stroke} opacity={0.78} />
              {showLabel ? (
                <>
                  <text x="0" y={radius + 17} textAnchor="middle" fill={tone.text} fontSize={node.type === 'strategy' ? 11 : 9.5} fontWeight="700" letterSpacing="0">
                    {label}
                  </text>
                  {node.type === 'strategy' ? (
                    <text x="0" y={radius + 32} textAnchor="middle" fill="#cbd5e1" fillOpacity="0.72" fontSize="8.5" fontWeight="700" letterSpacing="0">
                      {(node.pipelineStage || 'research').toUpperCase()}
                    </text>
                  ) : null}
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/55 backdrop-blur">
        Focused evidence neighborhood
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
      <div className="mt-1 truncate text-xs font-semibold text-white">{value}</div>
    </div>
  );
}
