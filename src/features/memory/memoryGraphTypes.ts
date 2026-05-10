import type {
  HyperliquidStrategyCatalogRow,
  HyperliquidStrategyLearningEvent
} from '@/services/hyperliquidService';
import type {
  ObsidianGraphEdge,
  ObsidianGraphNode,
  ObsidianGraphNodeType
} from '@/types/electron';

export type MemoryNode = ObsidianGraphNode & {
  x?: number;
  y?: number;
  r?: number;
  degree?: number;
};

export type MemoryGraph = {
  nodes: MemoryNode[];
  edges: ObsidianGraphEdge[];
};

export type MemoryLensId = 'actionable' | 'paper-ready' | 'blocked' | 'needs-backtest' | 'docs-only' | 'all';

export type LearningLensId = 'lessons' | 'mistakes' | 'wins' | 'rule-changes' | 'follow-ups';

export type EvidenceFilterId = 'agent-path' | 'artifacts' | 'learning' | 'memory' | 'all';

export type EvidenceItem = {
  key: 'docs' | 'backend' | 'backtest' | 'validation' | 'paper';
  label: string;
  ok: boolean;
};

export type StrategyMemorySummary = {
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

export const NODE_TYPE_LABELS: Record<ObsidianGraphNodeType, string> = {
  strategy: 'Strategy',
  'strategy-doc': 'Strategy Doc',
  'backend-package': 'Backend',
  'backtest-artifact': 'Backtest',
  'validation-artifact': 'Validation',
  'paper-artifact': 'Paper',
  'audit-artifact': 'Audit',
  'learning-event': 'Learning Event',
  'agent-memory': 'Agent Memory',
  'progress-handoff': 'Handoff',
  'obsidian-note': 'Obsidian Note',
  'repo-path': 'Repo Path'
};

export const NODE_TYPE_TONES: Record<ObsidianGraphNodeType, { fill: string; stroke: string; text: string; glow: string }> = {
  strategy: { fill: '#0f766e', stroke: '#5eead4', text: '#ecfeff', glow: '#2dd4bf' },
  'strategy-doc': { fill: '#1d4ed8', stroke: '#93c5fd', text: '#eff6ff', glow: '#60a5fa' },
  'backend-package': { fill: '#0e7490', stroke: '#67e8f9', text: '#ecfeff', glow: '#22d3ee' },
  'backtest-artifact': { fill: '#15803d', stroke: '#86efac', text: '#f0fdf4', glow: '#4ade80' },
  'validation-artifact': { fill: '#4d7c0f', stroke: '#bef264', text: '#f7fee7', glow: '#a3e635' },
  'paper-artifact': { fill: '#047857', stroke: '#6ee7b7', text: '#ecfdf5', glow: '#34d399' },
  'audit-artifact': { fill: '#7c3aed', stroke: '#c4b5fd', text: '#f5f3ff', glow: '#a78bfa' },
  'learning-event': { fill: '#9333ea', stroke: '#f0abfc', text: '#faf5ff', glow: '#e879f9' },
  'agent-memory': { fill: '#7e22ce', stroke: '#d8b4fe', text: '#faf5ff', glow: '#c084fc' },
  'progress-handoff': { fill: '#a16207', stroke: '#fde047', text: '#fefce8', glow: '#facc15' },
  'obsidian-note': { fill: '#be123c', stroke: '#fda4af', text: '#fff1f2', glow: '#fb7185' },
  'repo-path': { fill: '#475569', stroke: '#cbd5e1', text: '#f8fafc', glow: '#94a3b8' }
};

export const MEMORY_LENSES: Array<{ id: MemoryLensId; label: string; detail: string }> = [
  { id: 'actionable', label: 'Actionable', detail: 'review queue' },
  { id: 'paper-ready', label: 'Paper Ready', detail: 'paper gate' },
  { id: 'blocked', label: 'Blocked', detail: 'repair list' },
  { id: 'needs-backtest', label: 'Needs Backtest', detail: 'test next' },
  { id: 'docs-only', label: 'Docs Only', detail: 'needs backend' },
  { id: 'all', label: 'All', detail: 'full catalog' }
];

export const LEARNING_LENSES: Array<{ id: LearningLensId; label: string; detail: string }> = [
  { id: 'lessons', label: 'Lessons', detail: 'latest learning' },
  { id: 'mistakes', label: 'Mistakes', detail: 'loss reviews' },
  { id: 'wins', label: 'Wins', detail: 'what worked' },
  { id: 'rule-changes', label: 'Rule Changes', detail: 'rules changed' },
  { id: 'follow-ups', label: 'Open Follow-ups', detail: 'next actions' }
];

export const EVIDENCE_FILTERS: Array<{ id: EvidenceFilterId; label: string; detail: string }> = [
  { id: 'agent-path', label: 'Agent Path', detail: 'source + evidence' },
  { id: 'artifacts', label: 'Artifacts', detail: 'backtest/validation/paper' },
  { id: 'learning', label: 'Learning', detail: 'lessons and rules' },
  { id: 'memory', label: 'Memory', detail: 'notes and handoffs' },
  { id: 'all', label: 'All', detail: 'full graph' }
];
