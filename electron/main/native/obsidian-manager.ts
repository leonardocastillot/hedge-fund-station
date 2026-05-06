import * as fs from 'fs';
import * as path from 'path';
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
  ObsidianOpenVaultParams
} from '../../types/ipc.types';

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

  private getAllMarkdownNotes(notesPath: string): Array<{ name: string; path: string; updatedAt: number; content: string }> {
    if (!fs.existsSync(notesPath)) {
      return [];
    }

    return fs.readdirSync(notesPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map((entry) => {
        const fullPath = path.join(notesPath, entry.name);
        const stats = fs.statSync(fullPath);
        return {
          name: entry.name.replace(/\.md$/i, ''),
          path: fullPath,
          updatedAt: stats.mtimeMs,
          content: fs.readFileSync(fullPath, 'utf-8')
        };
      });
  }

  private buildRelevantNote(
    note: { name: string; path: string; updatedAt: number; content: string },
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

  private resolveVaultPath(workspacePath: string, explicitVaultPath?: string): string | null {
    const candidate = explicitVaultPath?.trim() || workspacePath;
    if (!candidate) {
      return null;
    }

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
      notesPath: vaultPath ? path.join(vaultPath, 'hedge-station') : null
    };
  }

  ensureVault(params: ObsidianEnsureVaultParams): ObsidianVaultStatus {
    const workspacePath = params.workspacePath.trim();
    if (!workspacePath || !fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
      throw new Error(`Workspace path does not exist or is not a directory: ${workspacePath}`);
    }

    const vaultPath = params.vaultPath?.trim() || workspacePath;
    fs.mkdirSync(vaultPath, { recursive: true });
    fs.mkdirSync(path.join(vaultPath, '.obsidian'), { recursive: true });

    const notesPath = path.join(vaultPath, 'hedge-station');
    fs.mkdirSync(notesPath, { recursive: true });

    this.writeFileIfMissing(path.join(vaultPath, '.obsidian', 'app.json'), JSON.stringify({
      newFileLocation: 'folder',
      newFileFolderPath: 'hedge-station',
      attachmentFolderPath: 'hedge-station/attachments'
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

  async openVault(params: ObsidianOpenVaultParams): Promise<{ success: boolean; fallback: boolean }> {
    const vaultPath = params.vaultPath.trim();
    if (!vaultPath) {
      throw new Error('Vault path is required.');
    }

    const url = `obsidian://open?path=${encodeURIComponent(vaultPath)}`;
    try {
      await shell.openExternal(url);
      return { success: true, fallback: false };
    } catch {
      await shell.openPath(vaultPath);
      return { success: true, fallback: true };
    }
  }
}
