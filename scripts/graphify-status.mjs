import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, 'graphify-out');
const requiredFiles = {
  report: path.join(outputDir, 'GRAPH_REPORT.md'),
  graph: path.join(outputDir, 'graph.json'),
  html: path.join(outputDir, 'graph.html'),
};

function relative(filePath) {
  return path.relative(repoRoot, filePath) || '.';
}

function git(args, { allowEmpty = false } = {}) {
  try {
    const output = execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2500,
    });
    const trimmed = output.trim();
    return trimmed || (allowEmpty ? '' : null);
  } catch {
    return null;
  }
}

function builtCommit(reportPath) {
  if (!fs.existsSync(reportPath)) return null;
  const report = fs.readFileSync(reportPath, 'utf8');
  const match = report.match(/Built from commit:\s*`?([0-9a-fA-F]+)`?/);
  return match?.[1] || null;
}

function collection(payload, primary, fallback) {
  if (Array.isArray(payload?.[primary])) return payload[primary];
  if (fallback && Array.isArray(payload?.[fallback])) return payload[fallback];
  if (Array.isArray(payload?.graph?.[primary])) return payload.graph[primary];
  if (fallback && Array.isArray(payload?.graph?.[fallback])) return payload.graph[fallback];
  return [];
}

function graphCounts(graphPath) {
  if (!fs.existsSync(graphPath)) {
    return { nodeCount: null, edgeCount: null, communityCount: null, graphError: null };
  }
  try {
    const payload = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    const nodes = collection(payload, 'nodes');
    const edges = collection(payload, 'edges', 'links');
    let communityCount = 0;
    if (Array.isArray(payload.communities)) {
      communityCount = payload.communities.length;
    } else if (payload.communities && typeof payload.communities === 'object') {
      communityCount = Object.keys(payload.communities).length;
    } else {
      communityCount = new Set(
        nodes
          .map((node) => node?.community ?? node?.cluster ?? node?.community_id ?? node?.communityId)
          .filter((value) => value !== undefined && value !== null && value !== '')
      ).size;
    }
    return { nodeCount: nodes.length, edgeCount: edges.length, communityCount, graphError: null };
  } catch (error) {
    return {
      nodeCount: null,
      edgeCount: null,
      communityCount: null,
      graphError: error instanceof Error ? error.message : String(error),
    };
  }
}

function changedPathsSinceBuilt(built, current) {
  if (!built || !current || built === current) return [];
  const value = git(['diff', '--name-only', `${built}..${current}`]);
  if (value === null) return null;
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function onlyGeneratedGraphChanges(paths) {
  return Array.isArray(paths) && paths.length > 0 && paths.every((item) => item === 'graphify-out' || item.startsWith('graphify-out/'));
}

const missing = Object.values(requiredFiles).filter((filePath) => !fs.existsSync(filePath)).map(relative);
const available = missing.length === 0;
const built = builtCommit(requiredFiles.report);
const current = git(['rev-parse', '--short=8', 'HEAD']);
const porcelain = git(['status', '--porcelain', '--untracked-files=all'], { allowEmpty: true });
const hasUncommittedChanges = porcelain === null ? null : porcelain.length > 0;
const changedPaths = changedPathsSinceBuilt(built, current);
const counts = graphCounts(requiredFiles.graph);

let freshness = 'unknown';
if (!available) {
  freshness = 'missing';
} else if (hasUncommittedChanges) {
  freshness = 'dirty';
} else if (built && current) {
  freshness = built === current || onlyGeneratedGraphChanges(changedPaths) ? 'fresh' : 'stale';
}

const recommendedCommand = ['missing', 'stale', 'dirty'].includes(freshness)
  ? 'npm run graph:build'
  : 'npm run graph:check';

const status = {
  available,
  freshness,
  outputDir: relative(outputDir),
  reportPath: relative(requiredFiles.report),
  graphJsonPath: relative(requiredFiles.graph),
  htmlPath: relative(requiredFiles.html),
  nodeCount: counts.nodeCount,
  edgeCount: counts.edgeCount,
  communityCount: counts.communityCount,
  builtCommit: built,
  currentCommit: current,
  hasUncommittedChanges,
  changedPathCountSinceBuilt: Array.isArray(changedPaths) ? changedPaths.length : null,
  changedPathsSinceBuilt: Array.isArray(changedPaths) ? changedPaths.slice(0, 20) : null,
  missing,
  graphError: counts.graphError,
  recommendedCommand,
};

console.log(JSON.stringify(status, null, 2));

if (!available || counts.graphError) {
  process.exitCode = 1;
}
