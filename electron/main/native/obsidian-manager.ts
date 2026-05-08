import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { shell } from 'electron';
import type {
  ObsidianGetStatusParams,
  ObsidianEnsureVaultParams,
  ObsidianListNotesParams,
  ObsidianExportMissionParams,
  ObsidianNoteSummary,
  ObsidianRelevantNote,
  ObsidianSearchRelevantParams,
  ObsidianListPinnedParams,
  ObsidianVaultStatus,
  ObsidianOpenPathParams,
  ObsidianOpenVaultParams,
  ObsidianGetGraphParams,
  ObsidianGraphEdge,
  ObsidianGraphNode,
  ObsidianGraphNodeType,
  ObsidianGraphResponse,
  ObsidianStrategyLearningEventInput,
  ObsidianSyncStrategyMemoryParams,
  ObsidianSyncStrategyMemoryResult
} from '../../types/ipc.types';

type MarkdownNote = {
  name: string;
  path: string;
  relativePath: string;
  updatedAt: number;
  content: string;
};

const MANAGED_BY = 'hedge-fund-station';

export class ObsidianManager {
  private writeFileIfMissing(filePath: string, content: string): void {
    if (fs.existsSync(filePath)) {
      return;
    }

    fs.writeFileSync(filePath, content, 'utf-8');
  }

  private extractFrontmatter(raw: string): { body: string; metadata: Record<string, string | string[]> } {
    if (!raw.startsWith('---\n')) {
      return { body: raw, metadata: {} };
    }

    const end = raw.indexOf('\n---\n', 4);
    if (end === -1) {
      return { body: raw, metadata: {} };
    }

    const frontmatter = raw.slice(4, end).split('\n');
    const metadata: Record<string, string | string[]> = {};
    for (const line of frontmatter) {
      const separator = line.indexOf(':');
      if (separator === -1) {
        continue;
      }
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (!key) {
        continue;
      }
      if (value.startsWith('[') && value.endsWith(']')) {
        metadata[key] = value.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean);
      } else {
        metadata[key] = value;
      }
    }

    return {
      body: raw.slice(end + 5),
      metadata
    };
  }

  private getAllMarkdownNotes(notesPath: string): MarkdownNote[] {
    if (!fs.existsSync(notesPath)) {
      return [];
    }

    const notes: MarkdownNote[] = [];
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === 'attachments' || entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(fullPath);
          continue;
        }

        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) {
          continue;
        }

        const stats = fs.statSync(fullPath);
        notes.push({
          name: entry.name.replace(/\.md$/i, ''),
          path: fullPath,
          relativePath: path.relative(notesPath, fullPath),
          updatedAt: stats.mtimeMs,
          content: fs.readFileSync(fullPath, 'utf-8')
        });
      }
    };

    visit(notesPath);
    return notes;
  }

  private buildRelevantNote(
    note: MarkdownNote,
    score: number,
    snippetSeed?: string
  ): ObsidianRelevantNote {
    const { body, metadata } = this.extractFrontmatter(note.content);
    const tags = Array.isArray(metadata.tags)
      ? metadata.tags.map((tag) => String(tag).toLowerCase())
      : typeof metadata.tags === 'string'
        ? [metadata.tags.toLowerCase()]
        : [];
    const type = typeof metadata.type === 'string' ? metadata.type.toLowerCase() : '';
    const domain = typeof metadata.domain === 'string' ? metadata.domain.toLowerCase() : '';
    const pinned = metadata.pinned === 'true' || tags.includes('pinned');
    const snippet = snippetSeed || body.slice(0, 180).replace(/\s+/g, ' ').trim();

    return {
      name: note.name,
      path: note.path,
      updatedAt: note.updatedAt,
      score,
      snippet,
      type: type || undefined,
      domain: domain || undefined,
      tags,
      pinned
    };
  }

  private matchesWorkspaceScope(
    metadata: Record<string, string | string[]>,
    workspaceId?: string,
    workspaceName?: string
  ): boolean {
    const workspaceField = metadata.workspace;
    if (!workspaceField) {
      return true;
    }

    const candidates = Array.isArray(workspaceField)
      ? workspaceField.map((item) => String(item).toLowerCase())
      : [String(workspaceField).toLowerCase()];

    const workspaceIdToken = workspaceId?.toLowerCase();
    const workspaceNameToken = workspaceName?.toLowerCase();

    return candidates.some((value) => value === 'all'
      || (workspaceIdToken ? value.includes(workspaceIdToken) : false)
      || (workspaceNameToken ? value.includes(workspaceNameToken) : false));
  }

  private slug(value: string): string {
    return value
      .toLowerCase()
      .replace(/\\/g, '/')
      .replace(/\.md$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'note';
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private metadataString(metadata: Record<string, string | string[]>, key: string): string | undefined {
    const value = metadata[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private metadataList(metadata: Record<string, string | string[]>, key: string): string[] {
    const value = metadata[key];
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
      return [value.trim()];
    }
    return [];
  }

  private noteNodeId(note: MarkdownNote): string {
    return `obsidian:${this.slug(note.relativePath)}`;
  }

  private pathNodeId(workspacePath: string, fullPath: string): string {
    const relative = path.relative(workspacePath, fullPath).replace(/\\/g, '/');
    return `repo:${this.slug(relative || fullPath)}`;
  }

  private pathLabel(fullPath: string): string {
    const parsed = path.parse(fullPath);
    return parsed.base || parsed.name || fullPath;
  }

  private inferPathNodeType(workspacePath: string, fullPath: string): ObsidianGraphNodeType {
    const relative = path.relative(workspacePath, fullPath).replace(/\\/g, '/');
    if (relative.startsWith('docs/strategies/')) return 'strategy-doc';
    if (relative.startsWith('backend/hyperliquid_gateway/strategies/')) return 'backend-package';
    if (relative.startsWith('backend/hyperliquid_gateway/data/backtests/')) return 'backtest-artifact';
    if (relative.startsWith('backend/hyperliquid_gateway/data/validations/')) return 'validation-artifact';
    if (relative.startsWith('backend/hyperliquid_gateway/data/paper/')) return 'paper-artifact';
    if (relative.startsWith('docs/operations/agents/memory/')) return 'agent-memory';
    if (relative.startsWith('progress/')) return 'progress-handoff';
    return 'repo-path';
  }

  private extractWikiLinks(raw: string): string[] {
    const links = new Set<string>();
    const wikiLinkPattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = wikiLinkPattern.exec(raw)) !== null) {
      const target = match[1]?.trim();
      if (target) {
        links.add(target);
      }
    }
    return Array.from(links);
  }

  private normalizePathCandidate(candidate: string): string {
    return candidate
      .trim()
      .replace(/^<|>$/g, '')
      .replace(/^`|`$/g, '')
      .replace(/[),.;:]+$/g, '');
  }

  private resolveRepoPath(candidate: string, workspacePath: string): string | null {
    const normalized = this.normalizePathCandidate(candidate);
    if (!normalized) {
      return null;
    }

    const absoluteCandidate = path.isAbsolute(normalized)
      ? normalized
      : path.join(workspacePath, normalized.replace(/^\.\//, ''));

    const resolved = path.resolve(absoluteCandidate);
    const workspaceRoot = path.resolve(workspacePath);
    if (!resolved.startsWith(workspaceRoot) || !fs.existsSync(resolved)) {
      return null;
    }
    return resolved;
  }

  private extractRepoPathLinks(raw: string, workspacePath: string): string[] {
    const links = new Set<string>();
    const relativePathPattern = /(?:^|[\s([`'"])((?:\.\/)?(?:AGENTS\.md|CHECKPOINTS\.md|package\.json|agent_tasks\.json|docs\/[^\s)\]`'"]+|backend\/[^\s)\]`'"]+|src\/[^\s)\]`'"]+|electron\/[^\s)\]`'"]+|progress\/[^\s)\]`'"]+|skills\/[^\s)\]`'"]+|scripts\/[^\s)\]`'"]+|tests\/[^\s)\]`'"]+))/g;
    let match: RegExpExecArray | null;
    while ((match = relativePathPattern.exec(raw)) !== null) {
      const resolved = this.resolveRepoPath(match[1], workspacePath);
      if (resolved) {
        links.add(resolved);
      }
    }

    const absolutePathPattern = new RegExp(`${this.escapeRegex(path.resolve(workspacePath))}[^\\s)\\]\`'"]+`, 'g');
    while ((match = absolutePathPattern.exec(raw)) !== null) {
      const resolved = this.resolveRepoPath(match[0], workspacePath);
      if (resolved) {
        links.add(resolved);
      }
    }

    return Array.from(links);
  }

  private addEdge(edges: ObsidianGraphEdge[], seen: Set<string>, edge: Omit<ObsidianGraphEdge, 'id'>): void {
    const id = `${edge.source}->${edge.target}:${edge.type}`;
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    edges.push({ ...edge, id });
  }

  private frontmatterLine(key: string, value: string | number | boolean | null | undefined): string {
    if (value === undefined || value === null || value === '') {
      return `${key}:`;
    }
    return `${key}: ${String(value).replace(/\n/g, ' ')}`;
  }

  private frontmatterArrayLine(key: string, values?: Array<string | null | undefined>): string {
    const clean = (values || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => value.replace(/[\[\],]/g, ''));
    return `${key}: [${clean.join(', ')}]`;
  }

  private isManagedMarkdown(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
      return false;
    }
    const { metadata } = this.extractFrontmatter(fs.readFileSync(filePath, 'utf-8'));
    return metadata.managed_by === MANAGED_BY;
  }

  private writeManagedMarkdown(
    filePath: string,
    content: string,
    result: ObsidianSyncStrategyMemoryResult
  ): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (fs.existsSync(filePath) && !this.isManagedMarkdown(filePath)) {
      result.skipped += 1;
      result.skippedFiles.push(filePath);
      result.warnings.push(`Skipped manual Obsidian note: ${filePath}`);
      return;
    }

    const existed = fs.existsSync(filePath);
    fs.writeFileSync(filePath, content, 'utf-8');
    if (existed) {
      result.updated += 1;
    } else {
      result.created += 1;
    }
    result.writtenFiles.push(filePath);
  }

  private strategyNoteContent(strategy: ObsidianSyncStrategyMemoryParams['strategies'][number], workspacePath: string): string {
    const strategyId = strategy.strategyId.trim();
    const displayName = strategy.displayName || strategyId.replace(/_/g, ' ');
    const artifacts = strategy.latestArtifactPaths || {};
    const docsPaths = Array.from(new Set([
      ...(strategy.documentationPaths || []),
      artifacts.docs,
      artifacts.spec
    ].filter((item): item is string => Boolean(item))));
    const artifactPaths = [artifacts.backtest, artifacts.validation, artifacts.paper, artifacts.doublingStability, artifacts.btcOptimization]
      .filter((item): item is string => Boolean(item));
    const repoRelative = (value: string): string => {
      const resolved = this.resolveRepoPath(value, workspacePath);
      return resolved ? path.relative(workspacePath, resolved).replace(/\\/g, '/') : value;
    };
    const summary = strategy.latestBacktestSummary || {};
    const evidenceCounts = strategy.evidenceCounts || {};
    const gateReasons = strategy.gateReasons || [];
    const missingAuditItems = strategy.missingAuditItems || [];

    return [
      '---',
      'type: strategy-memory',
      this.frontmatterLine('managed_by', MANAGED_BY),
      this.frontmatterLine('strategy_id', strategyId),
      this.frontmatterLine('pipeline_stage', strategy.pipelineStage || 'unknown'),
      this.frontmatterLine('gate_status', strategy.gateStatus || 'unknown'),
      this.frontmatterArrayLine('tags', ['hedge-station', 'strategy', strategyId, strategy.pipelineStage, strategy.gateStatus]),
      this.frontmatterArrayLine('source_types', strategy.sourceTypes || []),
      this.frontmatterArrayLine('source_paths', [...docsPaths, ...artifactPaths].map(repoRelative)),
      this.frontmatterLine('updated_at', new Date().toISOString()),
      '---',
      '',
      `# ${displayName}`,
      '',
      `- Strategy ID: \`${strategyId}\``,
      `- Pipeline Stage: ${strategy.pipelineStage || 'unknown'}`,
      `- Gate Status: ${strategy.gateStatus || 'unknown'}`,
      `- Validation Status: ${strategy.validationStatus || 'unknown'}`,
      `- Registered For Backtest: ${strategy.registeredForBacktest ? 'yes' : 'no'}`,
      `- Can Backtest: ${strategy.canBacktest ? 'yes' : 'no'}`,
      '',
      '## Source Links',
      ...(docsPaths.length ? docsPaths.map((item) => `- ${repoRelative(item)}`) : ['- No docs/spec path found yet.']),
      '',
      '## Evidence Links',
      ...(artifactPaths.length ? artifactPaths.map((item) => `- ${repoRelative(item)}`) : ['- No backtest, validation, or paper artifact found yet.']),
      '',
      '## Latest Backtest',
      `- Trades: ${String(summary.total_trades ?? 'N/A')}`,
      `- Return: ${String(summary.return_pct ?? 'N/A')}`,
      `- Profit Factor: ${String(summary.profit_factor ?? 'N/A')}`,
      `- Max Drawdown: ${String(summary.max_drawdown_pct ?? 'N/A')}`,
      '',
      '## Evidence Counts',
      ...Object.entries(evidenceCounts).map(([key, value]) => `- ${key}: ${value}`),
      Object.keys(evidenceCounts).length ? '' : '- No evidence counts reported.',
      '',
      '## Blockers',
      ...[...gateReasons, ...missingAuditItems].map((item) => `- ${item}`),
      gateReasons.length || missingAuditItems.length ? '' : '- No blockers reported.',
      '',
      '## Related Indexes',
      '- [[Strategy Index]]',
      '- [[Evidence Index]]',
      ''
    ].join('\n');
  }

  private strategyIndexContent(strategies: ObsidianSyncStrategyMemoryParams['strategies']): string {
    const sorted = [...strategies].sort((a, b) => (a.displayName || a.strategyId).localeCompare(b.displayName || b.strategyId));
    return [
      '---',
      'type: strategy-index',
      this.frontmatterLine('managed_by', MANAGED_BY),
      this.frontmatterArrayLine('tags', ['hedge-station', 'strategy-index']),
      this.frontmatterLine('updated_at', new Date().toISOString()),
      '---',
      '',
      '# Strategy Index',
      '',
      ...sorted.map((strategy) => {
        const noteName = strategy.strategyId.trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
        return `- [[${noteName}|${strategy.displayName || strategy.strategyId}]] - ${strategy.pipelineStage || 'unknown'} / ${strategy.gateStatus || 'unknown'}`;
      }),
      ''
    ].join('\n');
  }

  private evidenceIndexContent(strategies: ObsidianSyncStrategyMemoryParams['strategies'], workspacePath: string): string {
    const lines: string[] = [];
    strategies.forEach((strategy) => {
      const artifacts = strategy.latestArtifactPaths || {};
      const artifactPaths = [artifacts.backtest, artifacts.validation, artifacts.paper, artifacts.doublingStability, artifacts.btcOptimization]
        .filter((item): item is string => Boolean(item));
      if (artifactPaths.length === 0) {
        return;
      }
      lines.push(`## ${strategy.displayName || strategy.strategyId}`);
      artifactPaths.forEach((item) => {
        const resolved = this.resolveRepoPath(item, workspacePath);
        const label = resolved ? path.relative(workspacePath, resolved).replace(/\\/g, '/') : item;
        lines.push(`- ${label}`);
      });
      lines.push('');
    });

    return [
      '---',
      'type: evidence-index',
      this.frontmatterLine('managed_by', MANAGED_BY),
      this.frontmatterArrayLine('tags', ['hedge-station', 'evidence-index']),
      this.frontmatterLine('updated_at', new Date().toISOString()),
      '---',
      '',
      '# Evidence Index',
      '',
      lines.length ? lines.join('\n') : 'No strategy artifacts found in the latest catalog sync.',
      ''
    ].join('\n');
  }

  private learningFileName(event: ObsidianStrategyLearningEventInput): string {
    const base = event.eventId || `${event.strategyId}-${event.title}`;
    return `${base.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'learning-event'}.md`;
  }

  private learningNoteContent(event: ObsidianStrategyLearningEventInput, workspacePath: string): string {
    const strategyId = event.strategyId.trim();
    const title = event.title?.trim() || 'Strategy learning event';
    const repoRelative = (value: string): string => {
      const resolved = this.resolveRepoPath(value, workspacePath);
      return resolved ? path.relative(workspacePath, resolved).replace(/\\/g, '/') : value;
    };
    const evidencePaths = Array.from(new Set([
      event.path,
      ...(event.evidencePaths || [])
    ].filter((item): item is string => Boolean(item && item.trim())))).map(repoRelative);

    return [
      '---',
      'type: strategy-learning',
      this.frontmatterLine('managed_by', MANAGED_BY),
      this.frontmatterLine('event_id', event.eventId),
      this.frontmatterLine('strategy_id', strategyId),
      this.frontmatterLine('kind', event.kind),
      this.frontmatterLine('outcome', event.outcome),
      this.frontmatterLine('pipeline_stage', event.stage || 'unknown'),
      this.frontmatterArrayLine('tags', ['hedge-station', 'strategy-learning', strategyId, event.kind, event.outcome]),
      this.frontmatterArrayLine('source_paths', evidencePaths),
      this.frontmatterLine('generated_at', event.generatedAt || new Date().toISOString()),
      this.frontmatterLine('updated_at', new Date().toISOString()),
      '---',
      '',
      `# ${title}`,
      '',
      `- Strategy ID: \`${strategyId}\``,
      `- Kind: ${event.kind.replace(/_/g, ' ')}`,
      `- Outcome: ${event.outcome}`,
      `- Stage: ${event.stage || 'unknown'}`,
      '',
      '## Summary',
      event.summary?.trim() || 'No summary recorded.',
      '',
      '## Lesson',
      event.lesson?.trim() || 'No lesson recorded.',
      '',
      '## Rule Change',
      event.ruleChange?.trim() || 'No rule change recorded.',
      '',
      '## Next Action',
      event.nextAction?.trim() || 'No follow-up recorded.',
      '',
      '## Evidence Links',
      ...(evidencePaths.length ? evidencePaths.map((item) => `- ${item}`) : ['- No evidence paths linked.']),
      '',
      '## Related',
      `- [[${strategyId}]]`,
      '- [[Strategy Index]]',
      '- [[Evidence Index]]',
      ''
    ].join('\n');
  }

  private normalizeVaultCandidate(candidate: string): string {
    const resolved = path.resolve(candidate.trim());
    if (path.basename(resolved) === 'hedge-station') {
      return resolved;
    }

    const curatedVault = path.join(resolved, 'hedge-station');
    if (
      fs.existsSync(curatedVault)
      && (
        fs.existsSync(path.join(resolved, 'AGENTS.md'))
        || fs.existsSync(path.join(curatedVault, 'Workspace Home.md'))
        || fs.existsSync(path.join(curatedVault, '.obsidian'))
      )
    ) {
      return curatedVault;
    }
    return resolved;
  }

  private notesPathForVault(vaultPath: string): string {
    return path.basename(path.resolve(vaultPath)) === 'hedge-station'
      ? vaultPath
      : path.join(vaultPath, 'hedge-station');
  }

  private resolveVaultPath(workspacePath: string, explicitVaultPath?: string): string | null {
    const rawCandidate = explicitVaultPath?.trim() || workspacePath;
    if (!rawCandidate) {
      return null;
    }

    const candidate = this.normalizeVaultCandidate(rawCandidate);
    const configPath = path.join(candidate, '.obsidian');
    if (fs.existsSync(configPath) && fs.statSync(configPath).isDirectory()) {
      return candidate;
    }

    return null;
  }

  getStatus(params: ObsidianGetStatusParams): ObsidianVaultStatus {
    const vaultPath = this.resolveVaultPath(params.workspacePath, params.vaultPath);
    return {
      isAvailable: Boolean(vaultPath),
      vaultPath,
      notesPath: vaultPath ? this.notesPathForVault(vaultPath) : null
    };
  }

  ensureVault(params: ObsidianEnsureVaultParams): ObsidianVaultStatus {
    const workspacePath = params.workspacePath.trim();
    if (!workspacePath || !fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
      throw new Error(`Workspace path does not exist or is not a directory: ${workspacePath}`);
    }

    const vaultPath = this.normalizeVaultCandidate(params.vaultPath?.trim() || path.join(workspacePath, 'hedge-station'));
    fs.mkdirSync(vaultPath, { recursive: true });
    fs.mkdirSync(path.join(vaultPath, '.obsidian'), { recursive: true });

    const notesPath = this.notesPathForVault(vaultPath);
    fs.mkdirSync(notesPath, { recursive: true });

    this.writeFileIfMissing(path.join(vaultPath, '.obsidian', 'app.json'), JSON.stringify({
      newFileLocation: 'current',
      attachmentFolderPath: 'attachments'
    }, null, 2));

    fs.mkdirSync(path.join(notesPath, 'attachments'), { recursive: true });

    this.writeFileIfMissing(path.join(notesPath, 'Workspace Home.md'), [
      '---',
      'type: workspace-home',
      'pinned: true',
      'tags: [hedge-station, workspace]',
      `created_at: ${new Date().toISOString()}`,
      '---',
      '',
      '# Workspace Home',
      '',
      '## Purpose',
      '',
      'Use this vault as the operating memory for the workspace.',
      '',
      '## Useful Links',
      '',
      '- [[Mission Log]]',
      '- [[Pinned Memory]]',
      '- [[Open Questions]]',
      ''
    ].join('\n'));

    this.writeFileIfMissing(path.join(notesPath, 'Mission Log.md'), [
      '---',
      'type: mission-log',
      'tags: [hedge-station, missions]',
      `created_at: ${new Date().toISOString()}`,
      '---',
      '',
      '# Mission Log',
      '',
      'Capture important mission outcomes here when they should stay visible beyond one run.',
      ''
    ].join('\n'));

    this.writeFileIfMissing(path.join(notesPath, 'Pinned Memory.md'), [
      '---',
      'type: memory',
      'pinned: true',
      'tags: [hedge-station, pinned]',
      `created_at: ${new Date().toISOString()}`,
      '---',
      '',
      '# Pinned Memory',
      '',
      'Keep durable workspace facts, decisions, and shortcuts here.',
      ''
    ].join('\n'));

    this.writeFileIfMissing(path.join(notesPath, 'Open Questions.md'), [
      '---',
      'type: open-questions',
      'tags: [hedge-station, questions]',
      `created_at: ${new Date().toISOString()}`,
      '---',
      '',
      '# Open Questions',
      '',
      '- What should the next agent clarify before changing behavior?',
      ''
    ].join('\n'));

    return {
      isAvailable: true,
      vaultPath,
      notesPath
    };
  }

  listNotes(params: ObsidianListNotesParams): ObsidianNoteSummary[] {
    const status = this.getStatus(params);
    if (!status.notesPath || !fs.existsSync(status.notesPath)) {
      return [];
    }

    return this.getAllMarkdownNotes(status.notesPath)
      .map((entry) => ({
        name: entry.name,
        path: entry.path,
        updatedAt: entry.updatedAt
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, params.limit ?? 8);
  }

  searchRelevant(params: ObsidianSearchRelevantParams): ObsidianRelevantNote[] {
    const status = this.getStatus({
      workspacePath: params.workspacePath,
      vaultPath: params.vaultPath
    });

    if (!status.notesPath) {
      return [];
    }

    const queryTokens = params.query
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length >= 3);

    if (queryTokens.length === 0) {
      return [];
    }

    const relevantNotes = this.getAllMarkdownNotes(status.notesPath)
      .map((note): ObsidianRelevantNote | null => {
        const { body, metadata } = this.extractFrontmatter(note.content);
        const haystack = `${note.name}\n${body}`.toLowerCase();
        const tags = Array.isArray(metadata.tags)
          ? metadata.tags.map((tag) => String(tag).toLowerCase())
          : typeof metadata.tags === 'string'
            ? [metadata.tags.toLowerCase()]
            : [];
        const domain = typeof metadata.domain === 'string' ? metadata.domain.toLowerCase() : '';
        const type = typeof metadata.type === 'string' ? metadata.type.toLowerCase() : '';
        const pinned = metadata.pinned === 'true' || tags.includes('pinned');

        let score = 0;
        for (const token of queryTokens) {
          if (note.name.toLowerCase().includes(token)) {
            score += 5;
          }
          if (domain.includes(token)) {
            score += 4;
          }
          if (type.includes(token)) {
            score += 3;
          }
          if (tags.some((tag) => tag.includes(token))) {
            score += 3;
          }

          const matches = haystack.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
          score += Math.min(matches?.length || 0, 4);
        }

        if (type === 'playbook') {
          score += 2;
        }
        if (pinned) {
          score += 3;
        }

        const recencyBoost = Math.max(0, 2 - (Date.now() - note.updatedAt) / (1000 * 60 * 60 * 24 * 14));
        score += recencyBoost;

        if (score <= 0) {
          return null;
        }

        const lowerBody = body.toLowerCase();
        const firstToken = queryTokens[0];
        const matchIndex = lowerBody.indexOf(firstToken);
        const snippet = matchIndex === -1
          ? body.slice(0, 180).trim()
          : body.slice(Math.max(0, matchIndex - 60), matchIndex + 120).replace(/\s+/g, ' ').trim();

        const relevant = this.buildRelevantNote(note, score, snippet);
        return {
          ...relevant,
          pinned
        };
      })
      .filter((note): note is ObsidianRelevantNote => note !== null);

    return relevantNotes
      .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
      .slice(0, params.limit ?? 5);
  }

  listPinned(params: ObsidianListPinnedParams): ObsidianRelevantNote[] {
    const status = this.getStatus({
      workspacePath: params.workspacePath,
      vaultPath: params.vaultPath
    });

    if (!status.notesPath) {
      return [];
    }

    return this.getAllMarkdownNotes(status.notesPath)
      .map((note): ObsidianRelevantNote | null => {
        const { metadata } = this.extractFrontmatter(note.content);
        const tags = Array.isArray(metadata.tags)
          ? metadata.tags.map((tag) => String(tag).toLowerCase())
          : typeof metadata.tags === 'string'
            ? [metadata.tags.toLowerCase()]
            : [];
        const pinned = metadata.pinned === 'true' || tags.includes('pinned');
        if (!pinned) {
          return null;
        }
        if (!this.matchesWorkspaceScope(metadata, params.workspaceId, params.workspaceName)) {
          return null;
        }

        return this.buildRelevantNote(note, 100);
      })
      .filter((note): note is ObsidianRelevantNote => note !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, params.limit ?? 5);
  }

  getGraph(params: ObsidianGetGraphParams): ObsidianGraphResponse {
    const status = this.getStatus(params);
    const nodes = new Map<string, ObsidianGraphNode>();
    const edges: ObsidianGraphEdge[] = [];
    const seenEdges = new Set<string>();
    const warnings: string[] = [];

    if (!status.notesPath || !fs.existsSync(status.notesPath)) {
      return {
        generatedAt: new Date().toISOString(),
        vaultPath: status.vaultPath,
        notesPath: status.notesPath,
        nodes: [],
        edges: [],
        warnings: status.vaultPath ? ['No hedge-station notes folder found.'] : ['No Obsidian vault found for this workspace.']
      };
    }

    const notes = this.getAllMarkdownNotes(status.notesPath);
    const noteLookup = new Map<string, string>();
    notes.forEach((note) => {
      const nodeId = this.noteNodeId(note);
      noteLookup.set(this.slug(note.name), nodeId);
      noteLookup.set(this.slug(note.relativePath), nodeId);
      noteLookup.set(this.slug(note.relativePath.replace(/\.md$/i, '')), nodeId);
    });

    notes.forEach((note) => {
      const { body, metadata } = this.extractFrontmatter(note.content);
      const tags = this.metadataList(metadata, 'tags').map((tag) => tag.toLowerCase());
      const type = this.metadataString(metadata, 'type')?.toLowerCase();
      const strategyId = this.metadataString(metadata, 'strategy_id') || null;
      const pipelineStage = this.metadataString(metadata, 'pipeline_stage') || null;
      const gateStatus = this.metadataString(metadata, 'gate_status') || null;
      const nodeType: ObsidianGraphNodeType = type === 'memory' || type === 'open-questions' || type === 'mission-log'
        ? 'agent-memory'
        : 'obsidian-note';
      const nodeId = this.noteNodeId(note);
      nodes.set(nodeId, {
        id: nodeId,
        type: nodeType,
        label: note.name,
        path: note.path,
        updatedAt: note.updatedAt,
        strategyId,
        pipelineStage,
        gateStatus,
        tags,
        summary: body.slice(0, 220).replace(/\s+/g, ' ').trim() || null,
        metadata: {
          obsidianType: type || null,
          eventId: this.metadataString(metadata, 'event_id') || null,
          kind: this.metadataString(metadata, 'kind') || null,
          outcome: this.metadataString(metadata, 'outcome') || null,
          relativePath: note.relativePath,
          managedBy: this.metadataString(metadata, 'managed_by') || null
        }
      });

      this.extractWikiLinks(note.content).forEach((target) => {
        const targetId = noteLookup.get(this.slug(target));
        if (!targetId || targetId === nodeId) {
          return;
        }
        this.addEdge(edges, seenEdges, {
          source: nodeId,
          target: targetId,
          type: 'wiki-link',
          label: target
        });
      });

      this.extractRepoPathLinks(note.content, params.workspacePath).forEach((repoPath) => {
        const repoNodeId = this.pathNodeId(params.workspacePath, repoPath);
        if (!nodes.has(repoNodeId)) {
          nodes.set(repoNodeId, {
            id: repoNodeId,
            type: this.inferPathNodeType(params.workspacePath, repoPath),
            label: this.pathLabel(repoPath),
            path: repoPath,
            repoPath: path.relative(params.workspacePath, repoPath).replace(/\\/g, '/'),
            updatedAt: fs.statSync(repoPath).mtimeMs,
            summary: path.relative(params.workspacePath, repoPath).replace(/\\/g, '/')
          });
        }
        this.addEdge(edges, seenEdges, {
          source: nodeId,
          target: repoNodeId,
          type: 'repo-path',
          label: 'repo path'
        });
      });
    });

    return {
      generatedAt: new Date().toISOString(),
      vaultPath: status.vaultPath,
      notesPath: status.notesPath,
      nodes: Array.from(nodes.values()),
      edges,
      warnings
    };
  }

  syncStrategyMemory(params: ObsidianSyncStrategyMemoryParams): ObsidianSyncStrategyMemoryResult {
    const status = this.ensureVault({
      workspacePath: params.workspacePath,
      vaultPath: params.vaultPath
    });

    if (!status.vaultPath || !status.notesPath) {
      throw new Error('No Obsidian vault found for this workspace.');
    }

    const result: ObsidianSyncStrategyMemoryResult = {
      vaultPath: status.vaultPath,
      notesPath: status.notesPath,
      created: 0,
      updated: 0,
      skipped: 0,
      writtenFiles: [],
      skippedFiles: [],
      warnings: []
    };

    const cleanStrategies = (params.strategies || [])
      .filter((strategy) => strategy.strategyId && strategy.strategyId.trim())
      .sort((a, b) => (a.displayName || a.strategyId).localeCompare(b.displayName || b.strategyId));

    cleanStrategies.forEach((strategy) => {
      const fileName = `${strategy.strategyId.trim().replace(/[^a-zA-Z0-9_-]+/g, '-')}.md`;
      const filePath = path.join(status.notesPath as string, 'strategies', fileName);
      this.writeManagedMarkdown(filePath, this.strategyNoteContent(strategy, params.workspacePath), result);
    });

    const cleanLearningEvents = (params.learningEvents || [])
      .filter((event) => event.eventId && event.strategyId && event.title)
      .sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''));
    cleanLearningEvents.forEach((event) => {
      const strategyFolder = event.strategyId.trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'unknown_strategy';
      const filePath = path.join(status.notesPath as string, 'lessons', strategyFolder, this.learningFileName(event));
      this.writeManagedMarkdown(filePath, this.learningNoteContent(event, params.workspacePath), result);
    });

    this.writeManagedMarkdown(
      path.join(status.notesPath, 'indexes', 'Strategy Index.md'),
      this.strategyIndexContent(cleanStrategies),
      result
    );
    this.writeManagedMarkdown(
      path.join(status.notesPath, 'indexes', 'Evidence Index.md'),
      this.evidenceIndexContent(cleanStrategies, params.workspacePath),
      result
    );

    return result;
  }

  exportMission(params: ObsidianExportMissionParams): { filePath: string } {
    const status = this.getStatus({
      workspacePath: params.workspacePath,
      vaultPath: params.vaultPath
    });

    if (!status.notesPath) {
      throw new Error('No Obsidian vault found for this workspace.');
    }

    fs.mkdirSync(status.notesPath, { recursive: true });

    const slug = params.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'mission';
    const timestamp = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
    const fileName = `${timestamp}-${slug}.md`;
    const filePath = path.join(status.notesPath, fileName);
    const workspaceSlug = params.workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const agentSlug = (params.agentName || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const content = [
      '---',
      'type: mission-run',
      `workspace: [${workspaceSlug || 'workspace'}]`,
      `agent: ${agentSlug || 'unknown'}`,
      `runtime: ${params.runtimeProvider || 'unknown'}`,
      'tags: [mission, hedge-station]',
      `exported_at: ${new Date().toISOString()}`,
      '---',
      '',
      `# ${params.title}`,
      '',
      `- Workspace: ${params.workspaceName}`,
      `- Agent: ${params.agentName || 'Unknown'}`,
      `- Runtime: ${params.runtimeProvider || 'Unknown'}`,
      `- Exported: ${new Date().toISOString()}`,
      '',
      '## Goal',
      params.goal,
      '',
      '## Summary',
      params.summary,
      params.details ? `\n## Details\n${params.details}\n` : '',
      ''
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf-8');
    return { filePath };
  }

  async openPath(params: ObsidianOpenPathParams): Promise<{ success: boolean }> {
    await shell.openPath(params.path);
    return { success: true };
  }

  private async bestEffortOpen(promise: Promise<unknown>, timeoutMs = 1500): Promise<boolean> {
    let timeout: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        promise.then(() => true).catch(() => false),
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), timeoutMs);
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async openWithObsidianApp(targetPath: string, timeoutMs = 1800): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return false;
    }

    return this.bestEffortOpen(new Promise<void>((resolve, reject) => {
      execFile('/usr/bin/open', ['-a', 'Obsidian', targetPath], { timeout: timeoutMs }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    }), timeoutMs + 300);
  }

  private obsidianVaultId(vaultPath: string): string {
    return crypto.createHash('md5').update(path.resolve(vaultPath)).digest('hex').slice(0, 16);
  }

  private registerObsidianVault(vaultPath: string): { vaultId: string; vaultName: string } | null {
    if (process.platform !== 'darwin') {
      return null;
    }

    const home = process.env.HOME;
    if (!home) {
      return null;
    }

    const configDir = path.join(home, 'Library', 'Application Support', 'obsidian');
    const configPath = path.join(configDir, 'obsidian.json');
    if (!fs.existsSync(configDir)) {
      return null;
    }

    const vaultName = path.basename(vaultPath);
    const normalizedVaultPath = path.resolve(vaultPath);
    let config: { vaults?: Record<string, { path?: string; ts?: number; open?: boolean }> } = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {
        return null;
      }
    }

    const vaults = config.vaults && typeof config.vaults === 'object' ? config.vaults : {};
    const existing = Object.entries(vaults).find(([, value]) => (
      typeof value.path === 'string'
      && path.resolve(value.path) === normalizedVaultPath
    ));
    const vaultId = existing?.[0] || this.obsidianVaultId(normalizedVaultPath);
    const now = Date.now();

    Object.values(vaults).forEach((value) => {
      value.open = false;
    });
    vaults[vaultId] = {
      ...(vaults[vaultId] || {}),
      path: normalizedVaultPath,
      ts: now,
      open: true
    };
    config.vaults = vaults;

    fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');
    const windowStatePath = path.join(configDir, `${vaultId}.json`);
    if (!fs.existsSync(windowStatePath)) {
      fs.writeFileSync(windowStatePath, JSON.stringify({
        x: 180,
        y: 120,
        width: 1440,
        height: 900,
        isMaximized: false,
        devTools: false,
        zoom: 0
      }), 'utf-8');
    }

    return { vaultId, vaultName };
  }

  async openVault(params: ObsidianOpenVaultParams): Promise<{ success: boolean; fallback: boolean }> {
    const vaultPath = this.normalizeVaultCandidate(params.vaultPath.trim());
    if (!vaultPath) {
      throw new Error('Vault path is required.');
    }
    const configPath = path.join(vaultPath, '.obsidian');
    if (!fs.existsSync(configPath) || !fs.statSync(configPath).isDirectory()) {
      throw new Error(`Obsidian vault path is not valid: ${vaultPath}`);
    }

    const notesPath = this.notesPathForVault(vaultPath);
    const homeNotePath = path.join(notesPath, 'Workspace Home.md');
    const relativeHomeNote = path.relative(vaultPath, homeNotePath).replace(/\\/g, '/');
    const fileTarget = fs.existsSync(homeNotePath) ? relativeHomeNote : undefined;

    const registeredVault = this.registerObsidianVault(vaultPath);
    const vaultIdentifier = registeredVault?.vaultName || path.basename(vaultPath) || registeredVault?.vaultId;
    const fileUrl = fs.existsSync(homeNotePath)
      ? `obsidian://open?path=${encodeURIComponent(homeNotePath)}`
      : null;
    const vaultUrl = fileTarget
      ? `obsidian://open?vault=${encodeURIComponent(vaultIdentifier)}&file=${encodeURIComponent(fileTarget)}`
      : `obsidian://open?vault=${encodeURIComponent(vaultIdentifier)}`;

    void (async () => {
      if (await this.bestEffortOpen(shell.openExternal(vaultUrl))) {
        return;
      }
      if (fileUrl && await this.bestEffortOpen(shell.openExternal(fileUrl))) {
        return;
      }
      const openedByApp = fs.existsSync(homeNotePath)
        ? await this.openWithObsidianApp(homeNotePath)
        : await this.openWithObsidianApp(vaultPath);
      if (openedByApp) {
        return;
      }
      await this.bestEffortOpen(shell.openPath(vaultPath));
    })();

    return { success: true, fallback: !registeredVault };
  }
}
