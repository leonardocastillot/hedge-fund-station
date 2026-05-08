import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, 'graphify-out');
const requiredFiles = [
  'GRAPH_REPORT.md',
  'graph.html',
  'graph.json',
];

const missing = requiredFiles.filter((fileName) => !fs.existsSync(path.join(outputDir, fileName)));

if (missing.length > 0) {
  console.error(`Missing Graphify artifact(s): ${missing.map((fileName) => `graphify-out/${fileName}`).join(', ')}`);
  console.error('Run `npm run graph:build` to generate the versionable repo graph.');
  process.exit(1);
}

const graphPath = path.join(outputDir, 'graph.json');
let graph;
try {
  graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
} catch (error) {
  console.error(`Could not parse graphify-out/graph.json: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const nodes = Array.isArray(graph.nodes)
  ? graph.nodes
  : Array.isArray(graph.graph?.nodes)
    ? graph.graph.nodes
    : [];
const edges = Array.isArray(graph.edges)
  ? graph.edges
  : Array.isArray(graph.links)
    ? graph.links
    : Array.isArray(graph.graph?.edges)
      ? graph.graph.edges
      : [];

const communityValues = new Set(
  nodes
    .map((node) => node?.community ?? node?.cluster ?? node?.community_id ?? node?.communityId)
    .filter((value) => value !== undefined && value !== null && value !== '')
);
const communityCount = Array.isArray(graph.communities)
  ? graph.communities.length
  : graph.communities && typeof graph.communities === 'object'
    ? Object.keys(graph.communities).length
    : communityValues.size;

console.log(`Graphify artifacts ready: ${nodes.length} node(s), ${edges.length} edge(s), ${communityCount} communit${communityCount === 1 ? 'y' : 'ies'}.`);
