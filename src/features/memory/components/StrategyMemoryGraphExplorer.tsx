import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Database,
  Focus,
  GitBranch,
  Layers,
  LocateFixed,
  Maximize2,
  Network as NetworkIcon,
  Pause,
  Play,
  RotateCcw,
  Search,
  Tags
} from 'lucide-react';
import {
  DataSet,
  Network,
  type Edge as VisEdge,
  type Node as VisNode,
  type Options as VisOptions
} from 'vis-network/standalone';
import 'vis-network/styles/vis-network.css';
import {
  EVIDENCE_FILTERS,
  LEARNING_LENSES,
  MEMORY_LENSES,
  NODE_TYPE_LABELS,
  NODE_TYPE_TONES,
  type EvidenceFilterId,
  type LearningLensId,
  type MemoryGraph,
  type MemoryLensId,
  type MemoryNode
} from '@/features/memory/memoryGraphTypes';

type LensCounts = Record<MemoryLensId, number>;
type LearningLensCounts = Record<LearningLensId, number>;

type StrategyMemoryGraphExplorerProps = {
  graph: MemoryGraph;
  totalGraph: MemoryGraph;
  selectedNodeId: string | null;
  query: string;
  activeLens: MemoryLensId;
  activeLearningLens: LearningLensId;
  activeEvidenceFilter: EvidenceFilterId;
  lensCounts: LensCounts;
  learningLensCounts: LearningLensCounts;
  onQueryChange: (query: string) => void;
  onLensChange: (lens: MemoryLensId) => void;
  onLearningLensChange: (lens: LearningLensId) => void;
  onEvidenceFilterChange: (filter: EvidenceFilterId) => void;
  onSelectNode: (nodeId: string) => void;
  onResetView: () => void;
};

const EDGE_TONES: Record<string, string> = {
  artifact: '#86efac',
  'strategy-doc': '#93c5fd',
  'backend-package': '#67e8f9',
  'learning-link': '#f0abfc',
  'related-note': '#fda4af',
  'repo-path': '#cbd5e1',
  'wiki-link': '#d8b4fe'
};

const NETWORK_OPTIONS: VisOptions = {
  autoResize: true,
  nodes: {
    shape: 'dot',
    scaling: { min: 8, max: 42 },
    shadow: { enabled: true, color: 'rgba(0, 0, 0, 0.35)', size: 10, x: 0, y: 3 }
  },
  edges: {
    arrows: { to: { enabled: false } },
    color: { inherit: false },
    selectionWidth: 1.4,
    hoverWidth: 1.2,
    smooth: { enabled: true, type: 'dynamic' }
  },
  interaction: {
    hover: true,
    tooltipDelay: 90,
    hideEdgesOnDrag: true,
    keyboard: true,
    multiselect: false,
    navigationButtons: false
  },
  physics: {
    enabled: true,
    solver: 'forceAtlas2Based',
    stabilization: { enabled: true, iterations: 90, fit: true },
    forceAtlas2Based: {
      gravitationalConstant: -64,
      centralGravity: 0.018,
      springLength: 110,
      springConstant: 0.052,
      damping: 0.46,
      avoidOverlap: 0.36
    },
    maxVelocity: 38,
    minVelocity: 0.55
  }
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function displayLabel(node: MemoryNode): string {
  if (node.type === 'strategy') return node.label;
  const repoLabel = node.repoPath?.split('/').pop();
  return repoLabel || node.label;
}

function compactLabel(node: MemoryNode): string {
  const label = displayLabel(node);
  return label.length > 30 ? `${label.slice(0, 29)}...` : label;
}

function nodeSearchText(node: MemoryNode): string {
  return [
    node.id,
    node.label,
    node.summary || '',
    node.repoPath || '',
    node.strategyId || '',
    node.pipelineStage || '',
    node.gateStatus || '',
    ...(node.tags || [])
  ].join(' ').toLowerCase();
}

function tooltip(title: string, rows: Array<[string, unknown]>, footer?: string): string {
  const rowHtml = rows
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => (
      `<div class="memory-graph-tooltip-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    ))
    .join('');
  const footerHtml = footer ? `<div class="memory-graph-tooltip-footer">${escapeHtml(footer)}</div>` : '';
  return `<div class="memory-graph-tooltip"><div class="memory-graph-tooltip-title">${escapeHtml(title)}</div>${rowHtml}${footerHtml}</div>`;
}

function nodeTooltip(node: MemoryNode): string {
  return tooltip(displayLabel(node), [
    ['Type', NODE_TYPE_LABELS[node.type]],
    ['Strategy', node.strategyId || ''],
    ['Stage', node.pipelineStage || ''],
    ['Gate', node.gateStatus || ''],
    ['Path', node.repoPath || node.path || ''],
    ['Links', node.degree ?? '']
  ], 'Click to inspect. Double-click for neighborhood.');
}

function edgeTooltip(edge: MemoryGraph['edges'][number], source?: MemoryNode, target?: MemoryNode): string {
  return tooltip(edge.label || edge.type, [
    ['From', source?.label || edge.source],
    ['To', target?.label || edge.target],
    ['Type', edge.type]
  ], 'Evidence relation in Strategy Memory.');
}

function nodeValue(node: MemoryNode): number {
  if (node.type === 'strategy') return Math.min(42, 23 + Math.sqrt(node.degree || 0) * 4);
  if (node.type.includes('artifact')) return Math.min(30, 14 + Math.sqrt(node.degree || 0) * 3);
  if (node.type === 'learning-event') return Math.min(28, 13 + Math.sqrt(node.degree || 0) * 3);
  return Math.min(24, 10 + Math.sqrt(node.degree || 0) * 2.5);
}

function graphWithDegrees(graph: MemoryGraph): MemoryGraph {
  const degree = new Map<string, number>();
  graph.edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  });
  return {
    nodes: graph.nodes.map((node) => ({ ...node, degree: degree.get(node.id) || node.degree || 0 })),
    edges: graph.edges
  };
}

function neighborhoodGraph(graph: MemoryGraph, rootId: string | null): MemoryGraph {
  if (!rootId || !graph.nodes.some((node) => node.id === rootId)) return graph;
  const visible = new Set<string>([rootId]);
  graph.edges.forEach((edge) => {
    if (edge.source === rootId || edge.target === rootId) {
      visible.add(edge.source);
      visible.add(edge.target);
    }
  });
  return {
    nodes: graph.nodes.filter((node) => visible.has(node.id)),
    edges: graph.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target))
  };
}

export default function StrategyMemoryGraphExplorer({
  graph,
  totalGraph,
  selectedNodeId,
  query,
  activeLens,
  activeLearningLens,
  activeEvidenceFilter,
  lensCounts,
  learningLensCounts,
  onQueryChange,
  onLensChange,
  onLearningLensChange,
  onEvidenceFilterChange,
  onSelectNode,
  onResetView
}: StrategyMemoryGraphExplorerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<VisNode> | null>(null);
  const edgesRef = useRef<DataSet<VisEdge> | null>(null);
  const onSelectNodeRef = useRef(onSelectNode);
  const [labelsEnabled, setLabelsEnabled] = useState(false);
  const [physicsEnabled, setPhysicsEnabled] = useState(true);
  const [neighborhoodRoot, setNeighborhoodRoot] = useState<string | null>(null);
  const [renderMs, setRenderMs] = useState(0);

  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
  }, [onSelectNode]);

  const graphWithDegree = useMemo(() => graphWithDegrees(graph), [graph]);
  const displayGraph = useMemo(
    () => graphWithDegrees(neighborhoodGraph(graphWithDegree, neighborhoodRoot)),
    [graphWithDegree, neighborhoodRoot]
  );
  const nodeById = useMemo(() => new Map(displayGraph.nodes.map((node) => [node.id, node])), [displayGraph.nodes]);
  const totalTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    displayGraph.nodes.forEach((node) => counts.set(node.type, (counts.get(node.type) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [displayGraph.nodes]);

  useEffect(() => {
    if (neighborhoodRoot && !graph.nodes.some((node) => node.id === neighborhoodRoot)) {
      setNeighborhoodRoot(null);
    }
  }, [graph.nodes, neighborhoodRoot]);

  const decorateNode = (node: MemoryNode): VisNode => {
    const tone = NODE_TYPE_TONES[node.type];
    const selected = selectedNodeId === node.id;
    const shouldLabel = labelsEnabled || selected || node.type === 'strategy';
    return {
      id: node.id,
      label: shouldLabel ? compactLabel(node) : '',
      title: nodeTooltip(node),
      value: nodeValue(node),
      mass: node.type === 'strategy' ? 3.8 : Math.max(1, Math.min(3, 1 + (node.degree || 0) / 12)),
      borderWidth: selected ? 3 : node.type === 'strategy' ? 2 : 1.3,
      color: {
        background: tone.fill,
        border: selected ? '#f8fafc' : tone.stroke,
        highlight: { background: tone.fill, border: '#f8fafc' },
        hover: { background: tone.fill, border: tone.stroke }
      },
      font: {
        size: shouldLabel ? (node.type === 'strategy' ? 13 : 11) : 0,
        color: tone.text,
        face: 'Inter, ui-sans-serif, system-ui',
        strokeWidth: shouldLabel ? 4 : 0,
        strokeColor: '#05070d'
      },
      shadow: node.type === 'strategy' || selected
        ? { enabled: true, color: `${tone.glow}66`, size: selected ? 18 : 11, x: 0, y: 0 }
        : undefined
    };
  };

  const decorateEdge = (edge: MemoryGraph['edges'][number]): VisEdge | null => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return null;
    const selected = selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId);
    const color = EDGE_TONES[edge.type] || '#94a3b8';
    return {
      id: edge.id,
      from: edge.source,
      to: edge.target,
      title: edgeTooltip(edge, source, target),
      width: selected ? 2.4 : edge.type === 'artifact' ? 1.7 : 1.15,
      color: { color: selected ? '#f8fafc' : `${color}99`, highlight: '#67e8f9', hover: '#86efac' },
      smooth: { enabled: true, type: 'dynamic' }
    };
  };

  useEffect(() => {
    if (!containerRef.current || networkRef.current) return;
    const nodes = new DataSet<VisNode>();
    const edges = new DataSet<VisEdge>();
    nodesRef.current = nodes;
    edgesRef.current = edges;
    const network = new Network(containerRef.current, { nodes, edges }, NETWORK_OPTIONS);
    networkRef.current = network;

    network.on('selectNode', (event: { nodes?: Array<string | number> }) => {
      const nextId = event.nodes?.[0];
      if (nextId !== undefined) onSelectNodeRef.current(String(nextId));
    });
    network.on('doubleClick', (event: { nodes?: Array<string | number> }) => {
      const nextId = event.nodes?.[0];
      if (nextId !== undefined) {
        const root = String(nextId);
        setNeighborhoodRoot(root);
        onSelectNodeRef.current(root);
      }
    });

    return () => {
      network.destroy();
      networkRef.current = null;
      nodesRef.current = null;
      edgesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const network = networkRef.current;
    if (!nodes || !edges || !network) return;

    const start = performance.now();
    nodes.clear();
    edges.clear();
    nodes.add(displayGraph.nodes.map(decorateNode));
    edges.add(displayGraph.edges.map(decorateEdge).filter((edge): edge is VisEdge => Boolean(edge)));
    network.setOptions({ physics: { enabled: physicsEnabled } });
    if (selectedNodeId && displayGraph.nodes.some((node) => node.id === selectedNodeId)) {
      network.selectNodes([selectedNodeId], false);
    } else {
      network.unselectAll();
    }
    if (physicsEnabled && typeof network.startSimulation === 'function') {
      network.startSimulation();
    }
    setRenderMs(performance.now() - start);
  }, [displayGraph, labelsEnabled, nodeById, physicsEnabled, selectedNodeId]);

  const bestSearchMatch = () => {
    const normalized = normalize(query);
    if (!normalized) return null;
    return graph.nodes
      .filter((node) => nodeSearchText(node).includes(normalized))
      .sort((left, right) => {
        const exactLeft = normalize(left.label) === normalized || normalize(left.id) === normalized ? 1 : 0;
        const exactRight = normalize(right.label) === normalized || normalize(right.id) === normalized ? 1 : 0;
        return exactRight - exactLeft || (right.degree || 0) - (left.degree || 0);
      })[0] || null;
  };

  const focusNode = (nodeId?: string | null, neighborhood = false) => {
    const target = nodeId ? graph.nodes.find((node) => node.id === nodeId) : bestSearchMatch();
    if (!target || !networkRef.current) return;
    if (neighborhood) setNeighborhoodRoot(target.id);
    onSelectNode(target.id);
    window.requestAnimationFrame(() => {
      networkRef.current?.focus(target.id, {
        scale: neighborhood ? 1.35 : 1.18,
        animation: { duration: 650, easingFunction: 'easeInOutQuad' }
      });
    });
  };

  const togglePhysics = () => {
    const next = !physicsEnabled;
    setPhysicsEnabled(next);
    networkRef.current?.setOptions({ physics: { enabled: next } });
    if (next && typeof networkRef.current?.startSimulation === 'function') {
      networkRef.current.startSimulation();
    }
  };

  const resetExplorer = () => {
    setNeighborhoodRoot(null);
    setLabelsEnabled(false);
    setPhysicsEnabled(true);
    onResetView();
    window.requestAnimationFrame(() => {
      networkRef.current?.fit({ animation: { duration: 650, easingFunction: 'easeInOutQuad' } });
    });
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-black/20">
      <style>{`
        .vis-tooltip {
          overflow: hidden !important;
          max-width: min(24rem, calc(100vw - 2rem)) !important;
          border: 1px solid rgba(103, 232, 249, 0.28) !important;
          border-radius: 8px !important;
          background: rgba(6, 8, 13, 0.96) !important;
          color: #f8fafc !important;
          padding: 0 !important;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42) !important;
          backdrop-filter: blur(14px);
          letter-spacing: 0;
        }
        .memory-graph-tooltip {
          max-width: 23rem;
          padding: 0.72rem 0.78rem;
          color: #f8fafc;
          font-size: 0.78rem;
          line-height: 1.35;
          white-space: normal;
        }
        .memory-graph-tooltip-title {
          margin-bottom: 0.55rem;
          color: #f8fafc;
          font-size: 0.88rem;
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .memory-graph-tooltip-row {
          display: grid;
          grid-template-columns: 5.4rem minmax(0, 1fr);
          gap: 0.65rem;
          margin-top: 0.34rem;
        }
        .memory-graph-tooltip-row span {
          color: rgba(226, 232, 240, 0.6);
          font-size: 0.68rem;
          font-weight: 750;
          text-transform: uppercase;
        }
        .memory-graph-tooltip-row strong {
          color: #dff8ff;
          font-weight: 650;
          overflow-wrap: anywhere;
        }
        .memory-graph-tooltip-footer {
          margin-top: 0.65rem;
          padding-top: 0.58rem;
          border-top: 1px solid rgba(255, 255, 255, 0.11);
          color: rgba(226, 232, 240, 0.62);
          font-size: 0.72rem;
        }
      `}</style>
      <div className="border-b border-white/10 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <NetworkIcon className="h-4 w-4 text-cyan-200" />
              Strategy Evidence Graph
            </div>
            <div className="mt-1 text-xs text-white/45">
              {displayGraph.nodes.length}/{totalGraph.nodes.length} nodes, {displayGraph.edges.length}/{totalGraph.edges.length} edges
              {neighborhoodRoot ? ' - neighborhood focus' : ''}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <GraphButton icon={<Focus className="h-4 w-4" />} label="Focus" onClick={() => focusNode(selectedNodeId)} />
            <GraphButton icon={<LocateFixed className="h-4 w-4" />} label="Neighborhood" onClick={() => focusNode(selectedNodeId, true)} />
            <GraphButton icon={<Tags className="h-4 w-4" />} label={labelsEnabled ? 'Hide Labels' : 'Labels'} onClick={() => setLabelsEnabled((value) => !value)} />
            <GraphButton icon={physicsEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} label={physicsEnabled ? 'Physics' : 'Frozen'} onClick={togglePhysics} />
            <GraphButton icon={<Maximize2 className="h-4 w-4" />} label="Fit" onClick={() => networkRef.current?.fit({ animation: { duration: 650, easingFunction: 'easeInOutQuad' } })} />
            <GraphButton icon={<RotateCcw className="h-4 w-4" />} label="Reset" onClick={resetExplorer} />
          </div>
        </div>

        <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(16rem,1fr)_auto]">
          <label className="flex min-h-10 min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3">
            <Search className="h-4 w-4 shrink-0 text-white/45" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  focusNode(null);
                }
              }}
              placeholder="Search strategies, notes, artifacts..."
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
          </label>
          <div className="grid gap-2 sm:grid-flow-col sm:auto-cols-max">
            <select
              value={activeLens}
              onChange={(event) => onLensChange(event.target.value as MemoryLensId)}
              className="min-h-10 rounded-md border border-cyan-400/20 bg-black/35 px-3 text-sm font-semibold text-cyan-50 outline-none"
              aria-label="Strategy lens"
            >
              {MEMORY_LENSES.map((lens) => (
                <option key={lens.id} value={lens.id}>{lens.label} ({lensCounts[lens.id] || 0})</option>
              ))}
            </select>
            <select
              value={activeLearningLens}
              onChange={(event) => onLearningLensChange(event.target.value as LearningLensId)}
              className="min-h-10 rounded-md border border-fuchsia-400/20 bg-black/35 px-3 text-sm font-semibold text-fuchsia-50 outline-none"
              aria-label="Learning lens"
            >
              {LEARNING_LENSES.map((lens) => (
                <option key={lens.id} value={lens.id}>{lens.label} ({learningLensCounts[lens.id] || 0})</option>
              ))}
            </select>
            <select
              value={activeEvidenceFilter}
              onChange={(event) => onEvidenceFilterChange(event.target.value as EvidenceFilterId)}
              className="min-h-10 rounded-md border border-emerald-400/20 bg-black/35 px-3 text-sm font-semibold text-emerald-50 outline-none"
              aria-label="Evidence filter"
            >
              {EVIDENCE_FILTERS.map((filter) => (
                <option key={filter.id} value={filter.id}>{filter.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,7.8rem),1fr))]">
          {EVIDENCE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => onEvidenceFilterChange(filter.id)}
              className={`min-h-10 rounded-md border px-2.5 py-2 text-left transition ${
                activeEvidenceFilter === filter.id
                  ? 'border-emerald-300/45 bg-emerald-400/15 text-emerald-50'
                  : 'border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.07]'
              }`}
            >
              <span className="block text-xs font-bold leading-4">{filter.label}</span>
              <span className="block text-[10px] leading-4 text-white/40">{filter.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-[min(72vh,760px)] min-w-0 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="relative min-h-[480px] bg-[#05070d]">
          <div ref={containerRef} className="h-full min-h-[480px] w-full" aria-label="Interactive strategy memory graph" />
          {displayGraph.nodes.length === 0 ? (
            <div className="absolute inset-0 flex min-h-[480px] items-center justify-center bg-[#05070d] p-6 text-center text-sm text-white/45">
              No graph nodes match the current filters.
            </div>
          ) : null}
          <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/10 bg-black/45 px-3 py-2 text-xs text-white/60 backdrop-blur">
            Graph-first strategy memory
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
            <HudMetric label="Visible" value={displayGraph.nodes.length.toLocaleString()} />
            <HudMetric label="Edges" value={displayGraph.edges.length.toLocaleString()} />
            <HudMetric label="Total" value={totalGraph.nodes.length.toLocaleString()} />
            <HudMetric label="Render" value={`${Math.round(renderMs)}ms`} />
            <HudMetric label="Mode" value={neighborhoodRoot ? 'Neighborhood' : 'Lens'} />
          </div>
        </div>

        <aside className="min-h-0 border-t border-white/10 bg-black/25 p-3 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/50">
            <Layers className="h-4 w-4" />
            Visible Legend
          </div>
          <div className="mt-3 grid gap-2">
            {totalTypeCounts.map(([type, count]) => {
              const nodeType = type as keyof typeof NODE_TYPE_TONES;
              const tone = NODE_TYPE_TONES[nodeType];
              return (
                <div
                  key={type}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs font-semibold"
                  style={{ borderColor: `${tone.stroke}44`, color: tone.text, background: `${tone.fill}22` }}
                >
                  <span className="min-w-0 truncate">{NODE_TYPE_LABELS[nodeType]}</span>
                  <span className="font-mono text-white/60">{count}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-3 text-xs leading-5 text-white/50">
            <div className="mb-1 flex items-center gap-2 font-semibold text-white/65">
              <Database className="h-4 w-4 text-emerald-200" />
              Source Split
            </div>
            Repo artifacts remain source of truth. Obsidian nodes are curated memory around those paths.
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/25 p-3 text-xs text-white/45">
            <GitBranch className="h-4 w-4 text-cyan-200" />
            Double-click any node to isolate its neighborhood.
          </div>
        </aside>
      </div>
    </section>
  );
}

function GraphButton({
  icon,
  label,
  onClick
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-white/75 transition hover:border-cyan-300/35 hover:bg-cyan-400/10 hover:text-cyan-50"
    >
      {icon}
      {label}
    </button>
  );
}

function HudMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[5.6rem] rounded-md border border-white/10 bg-black/45 px-2.5 py-2 backdrop-blur">
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</div>
      <div className="mt-1 truncate text-xs font-semibold text-white" title={value}>{value}</div>
    </div>
  );
}
