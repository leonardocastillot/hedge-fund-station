import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type {
  MissionConsoleAppendSnapshotParams,
  MissionConsoleExportHandoffParams,
  MissionConsoleExportHandoffResult,
  MissionConsoleListRunsParams,
  MissionConsoleRun,
  MissionConsoleSaveRunParams
} from '../../types/ipc.types';

const MAX_RUNS = 200;

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\r/g, '')
    .trim();
}

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'mission';
}

function uniqueEvidenceRefs(refs: MissionConsoleRun['evidenceRefs']): MissionConsoleRun['evidenceRefs'] {
  const seen = new Set<string>();
  const next: MissionConsoleRun['evidenceRefs'] = [];

  for (const ref of refs) {
    const key = ref.id || `${ref.kind}:${ref.path || ref.label}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(ref);
  }

  return next;
}

export class MissionConsoleManager {
  private readonly configDir: string;
  private readonly runsPath: string;

  constructor() {
    this.configDir = path.join(app.getPath('home'), '.hedge-station');
    this.runsPath = path.join(this.configDir, 'mission-console-runs.json');
    ensureDir(this.configDir);
  }

  listRuns(params: MissionConsoleListRunsParams = {}): MissionConsoleRun[] {
    const runs = this.readRuns();
    return runs
      .filter((run) => !params.workspaceId || run.workspaceId === params.workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  saveRun(params: MissionConsoleSaveRunParams): MissionConsoleRun {
    const runs = this.readRuns();
    const now = Date.now();
    const normalizedRun: MissionConsoleRun = {
      ...params.run,
      title: params.run.title.trim() || params.run.goal.slice(0, 72) || 'Mission Console run',
      commands: Array.isArray(params.run.commands) ? params.run.commands.slice(0, 16) : [],
      evidenceRefs: Array.isArray(params.run.evidenceRefs) ? uniqueEvidenceRefs(params.run.evidenceRefs) : [],
      createdAt: params.run.createdAt || now,
      updatedAt: now
    };
    const existingIndex = runs.findIndex((run) => run.id === normalizedRun.id);
    const nextRuns = existingIndex === -1
      ? [normalizedRun, ...runs]
      : runs.map((run, index) => (index === existingIndex ? { ...run, ...normalizedRun } : run));

    this.writeRuns(nextRuns);
    return normalizedRun;
  }

  appendSnapshot(params: MissionConsoleAppendSnapshotParams): MissionConsoleRun {
    const runs = this.readRuns();
    const index = runs.findIndex((run) => run.id === params.runId);
    if (index === -1) {
      throw new Error(`Mission Console run not found: ${params.runId}`);
    }

    const current = runs[index];
    const now = Date.now();
    const outputExcerpt = params.outputExcerpt
      ? stripAnsi(params.outputExcerpt).slice(-6000)
      : current.outputExcerpt;
    const nextRun: MissionConsoleRun = {
      ...current,
      terminalId: params.terminalId || current.terminalId,
      status: params.status || current.status,
      outputExcerpt,
      outputCapturedAt: outputExcerpt ? now : current.outputCapturedAt,
      handoffSummary: params.handoffSummary || current.handoffSummary,
      evidenceRefs: uniqueEvidenceRefs([
        ...(current.evidenceRefs || []),
        ...(params.evidenceRefs || [])
      ]),
      updatedAt: now,
      completedAt: params.status === 'completed' || params.status === 'failed' || params.status === 'cancelled'
        ? (current.completedAt || now)
        : current.completedAt
    };

    runs[index] = nextRun;
    this.writeRuns(runs);
    return nextRun;
  }

  exportHandoff(params: MissionConsoleExportHandoffParams): MissionConsoleExportHandoffResult {
    const runs = this.readRuns();
    const index = runs.findIndex((run) => run.id === params.runId);
    if (index === -1) {
      throw new Error(`Mission Console run not found: ${params.runId}`);
    }

    const run = runs[index];
    const workspaceExportDir = params.workspacePath && fs.existsSync(params.workspacePath)
      ? path.join(params.workspacePath, 'docs', 'operations', 'mission-console', 'handoffs')
      : path.join(this.configDir, 'mission-console-handoffs');
    ensureDir(workspaceExportDir);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(workspaceExportDir, `${stamp}-${safeSlug(run.title)}.md`);
    const outputExcerpt = stripAnsi(params.outputExcerpt || run.outputExcerpt || '').slice(-6000);
    const summary = (params.summary || run.handoffSummary || run.outputExcerpt || 'Mission completed without a written summary.').trim();
    const lines = [
      `# Mission Console Handoff - ${run.title}`,
      '',
      `- Workspace: ${run.workspaceName}`,
      `- Workspace Path: ${run.workspacePath}`,
      `- Provider: ${run.provider}`,
      `- Mission Kind: ${run.missionKind}`,
      `- Status: ${run.status}`,
      `- Created At: ${new Date(run.createdAt).toISOString()}`,
      `- Updated At: ${new Date(run.updatedAt).toISOString()}`,
      run.terminalId ? `- Terminal: ${run.terminalId}` : '',
      '',
      '## Goal',
      run.goal,
      '',
      '## Summary',
      summary,
      '',
      '## Suggested / Related Commands',
      ...(run.commands.length > 0 ? run.commands.map((command) => `- \`${command}\``) : ['- none captured']),
      '',
      '## Evidence',
      ...(run.evidenceRefs.length > 0
        ? run.evidenceRefs.map((ref) => `- ${ref.label}${ref.path ? `: ${ref.path}` : ''}${ref.summary ? ` - ${ref.summary}` : ''}`)
        : ['- terminal snapshot only']),
      '',
      '## Latest Terminal Excerpt',
      '```text',
      outputExcerpt || 'No terminal output captured.',
      '```',
      '',
      '## Next Action',
      'Review the terminal output, decide whether to continue the mission, and keep any durable evidence in the owning workspace docs or backend artifact layer.'
    ].filter(Boolean).join('\n');

    fs.writeFileSync(filePath, `${lines}\n`, 'utf-8');
    const nextRun: MissionConsoleRun = {
      ...run,
      handoffPath: filePath,
      handoffSummary: summary,
      updatedAt: Date.now()
    };
    runs[index] = nextRun;
    this.writeRuns(runs);

    return {
      success: true,
      path: filePath,
      run: nextRun
    };
  }

  private readRuns(): MissionConsoleRun[] {
    if (!fs.existsSync(this.runsPath)) {
      return [];
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.runsPath, 'utf-8')) as MissionConsoleRun[];
      return Array.isArray(parsed)
        ? parsed.filter((run) => run && typeof run.id === 'string' && typeof run.workspaceId === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private writeRuns(runs: MissionConsoleRun[]): void {
    const ordered = runs
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RUNS);
    fs.writeFileSync(this.runsPath, JSON.stringify(ordered, null, 2), 'utf-8');
  }
}
