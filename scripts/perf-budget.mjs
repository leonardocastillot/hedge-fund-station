import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DIST_ASSETS = path.join(ROOT, 'dist', 'assets');
const DATA_DIR = path.join(ROOT, 'backend', 'hyperliquid_gateway', 'data');
const DATA_DB = path.join(DATA_DIR, 'hyperliquid.db');
const MAIN_CHUNK_RE = /^index-[\w.-]+\.js$/;
const HEAVY_CHUNK_BYTES = 512 * 1024;

const forbiddenInitialMarkers = [
  {
    name: 'xterm',
    patterns: [/xterm/i, /@xterm/i, /xterm-scrollable-element/i],
  },
  {
    name: 'three',
    patterns: [/WebGLRenderer/, /THREE\./, /three\.module/i, /three\.js/i],
  },
];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

async function pathSize(target) {
  try {
    const info = await stat(target);
    if (info.isFile()) return info.size;
    if (!info.isDirectory()) return 0;
    const entries = await readdir(target, { withFileTypes: true });
    const sizes = await Promise.all(entries.map((entry) => pathSize(path.join(target, entry.name))));
    return sizes.reduce((sum, size) => sum + size, 0);
  } catch {
    return null;
  }
}

async function listAssets() {
  const entries = await readdir(DIST_ASSETS, { withFileTypes: true });
  const assets = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = path.join(DIST_ASSETS, entry.name);
        const info = await stat(filePath);
        return { name: entry.name, path: filePath, bytes: info.size };
      })
  );
  return assets.sort((a, b) => b.bytes - a.bytes);
}

async function scanMainChunks(mainChunks) {
  const findings = [];
  for (const chunk of mainChunks) {
    const content = await readFile(chunk.path, 'utf8');
    for (const marker of forbiddenInitialMarkers) {
      const matched = marker.patterns.some((pattern) => pattern.test(content));
      findings.push({ chunk: chunk.name, marker: marker.name, matched });
    }
  }
  return findings;
}

function printAssetTable(title, assets) {
  console.log(`\n${title}`);
  if (!assets.length) {
    console.log('  none');
    return;
  }
  for (const asset of assets) {
    console.log(`  ${formatBytes(asset.bytes).padStart(10)}  ${asset.name}`);
  }
}

async function main() {
  let assets;
  try {
    assets = await listAssets();
  } catch {
    console.error(`dist assets not found at ${DIST_ASSETS}. Run npm run build first.`);
    process.exitCode = 1;
    return;
  }

  const mainChunks = assets.filter((asset) => MAIN_CHUNK_RE.test(asset.name));
  const heavyChunks = assets.filter((asset) => asset.bytes >= HEAVY_CHUNK_BYTES);
  const findings = await scanMainChunks(mainChunks);
  const dataSize = await pathSize(DATA_DIR);
  const dbSize = await pathSize(DATA_DB);

  console.log('Performance Budget Report');
  console.log(`dist/assets files: ${assets.length}`);
  console.log(`initial renderer chunks: ${mainChunks.length}`);
  printAssetTable('Initial renderer chunks', mainChunks);
  printAssetTable('Largest assets', assets.slice(0, 12));
  printAssetTable(`Chunks >= ${formatBytes(HEAVY_CHUNK_BYTES)}`, heavyChunks);

  console.log('\nForbidden initial bundle markers');
  let hasForbiddenMarker = false;
  for (const finding of findings) {
    const status = finding.matched ? 'FAIL' : 'OK';
    if (finding.matched) hasForbiddenMarker = true;
    console.log(`  [${status}] ${finding.marker} in ${finding.chunk}`);
  }
  if (!findings.length) {
    console.log('  [WARN] no initial renderer chunk found');
  }

  console.log('\nRuntime data footprint');
  console.log(`  data dir: ${dataSize === null ? 'missing' : formatBytes(dataSize)}`);
  console.log(`  hyperliquid.db: ${dbSize === null ? 'missing' : formatBytes(dbSize)}`);

  if (hasForbiddenMarker) {
    console.error('\nInitial renderer bundle contains a deferred dependency marker.');
    process.exitCode = 1;
  }
}

await main();
