import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type {
  AgentLoopRunSnapshot,
  AgentLoopStageUpdate,
  AgentLoopStartParams
} from '../../types/ipc.types';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';
const TEXT_MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
const CONFIG_FILE = 'marketing-ai.json';

interface AgentLoopConfig {
  geminiApiKey?: string;
  textModel?: string;
}

interface AgentLoopModelResponse {
  summary?: string;
  decision?: string;
  confidence?: 'low' | 'medium' | 'high';
  nextAction?: string;
  verification?: string[];
  blockers?: string[];
  suggestedOps?: string[];
  stageUpdates?: Array<{
    stageIndex?: number;
    label?: string;
    summary?: string;
    artifact?: string;
    status?: 'pending' | 'running' | 'completed' | 'failed';
  }>;
  done?: boolean;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function stripCodeFence(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function buildRunId(): string {
  return `loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDecision(value?: string): string {
  const normalized = (value || '').trim();
  return normalized || 'pending';
}

function normalizeConfidence(value?: string): 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'high' ? value : 'medium';
}

export class AgentLoopManager {
  private readonly configPath: string;
  private readonly runs = new Map<string, AgentLoopRunSnapshot>();
  private readonly cancellations = new Set<string>();

  constructor() {
    this.configPath = path.join(app.getPath('userData'), CONFIG_FILE);
  }

  async startMission(params: AgentLoopStartParams): Promise<AgentLoopRunSnapshot> {
    const run: AgentLoopRunSnapshot = {
      id: buildRunId(),
      workspaceId: params.workspaceId,
      workspaceName: params.workspaceName,
      status: 'queued',
      summary: 'Mission queued for direct loop execution.',
      decision: 'pending',
      confidence: 'medium',
      nextAction: 'Waiting for first loop iteration.',
      iteration: 0,
      maxIterations: Math.min(Math.max(params.maxIterations ?? 3, 1), 6),
      verificationSummary: 'Loop not evaluated yet.',
      unmetGates: [...params.completionGate],
      blockers: [],
      suggestedOps: [],
      stageUpdates: params.workflow.map((step) => ({
        stageIndex: step.stageIndex,
        label: step.label,
        summary: step.objective,
        status: 'pending'
      })),
      startedAt: Date.now(),
      updatedAt: Date.now()
    };

    this.runs.set(run.id, run);
    void this.executeMission(run.id, params);
    return { ...run };
  }

  getRun(runId: string): AgentLoopRunSnapshot | null {
    const run = this.runs.get(runId);
    return run ? { ...run, stageUpdates: run.stageUpdates.map((stage) => ({ ...stage })) } : null;
  }

  cancelRun(runId: string): { success: boolean } {
    const run = this.runs.get(runId);
    if (!run) {
      return { success: false };
    }

    this.cancellations.add(runId);
    this.runs.set(runId, {
      ...run,
      status: 'cancelled',
      summary: 'Mission loop cancelled by operator.',
      nextAction: 'Review captured state before restarting.',
      updatedAt: Date.now(),
      endedAt: Date.now()
    });
    return { success: true };
  }

  private async executeMission(runId: string, params: AgentLoopStartParams): Promise<void> {
    try {
      let lastSummary = '';
      let unmetGates = [...params.completionGate];

      for (let iteration = 1; iteration <= Math.min(Math.max(params.maxIterations ?? 3, 1), 6); iteration += 1) {
        if (this.cancellations.has(runId)) {
          return;
        }

        this.patchRun(runId, {
          status: 'running',
          iteration,
          summary: iteration === 1 ? 'Running first structured reasoning pass.' : `Refining mission output in iteration ${iteration}.`,
          nextAction: 'Waiting for model response.'
        });

        const response = await this.callLoopModel(params, iteration, unmetGates, lastSummary);
        const stageUpdates = this.mergeStageUpdates(params, runId, response.stageUpdates);
        const verification = this.verifyCompletion(params, response, stageUpdates);
        unmetGates = verification.unmetGates;
        lastSummary = response.summary?.trim() || lastSummary;

        this.patchRun(runId, {
          status: verification.done ? 'completed' : 'running',
          summary: response.summary?.trim() || 'Model returned without a usable summary.',
          decision: normalizeDecision(response.decision),
          confidence: normalizeConfidence(response.confidence),
          nextAction: response.nextAction?.trim() || (verification.done ? 'Review the mission output and decide the next operator action.' : 'Run another refinement iteration.'),
          verificationSummary: verification.summary,
          unmetGates: verification.unmetGates,
          blockers: Array.isArray(response.blockers) ? response.blockers.filter(Boolean).slice(0, 6) : [],
          suggestedOps: Array.isArray(response.suggestedOps) ? response.suggestedOps.filter(Boolean).slice(0, 6) : [],
          stageUpdates,
          updatedAt: Date.now(),
          endedAt: verification.done ? Date.now() : undefined
        });

        if (verification.done) {
          return;
        }
      }

      const run = this.runs.get(runId);
      if (!run || this.cancellations.has(runId)) {
        return;
      }

      this.patchRun(runId, {
        status: 'failed',
        summary: run.summary || 'Mission loop stopped before clearing verification gates.',
        verificationSummary: run.unmetGates.length > 0
          ? `Loop exhausted. Missing: ${run.unmetGates.join(' | ')}`
          : 'Loop exhausted without a valid completion signal.',
        nextAction: run.unmetGates.length > 0
          ? `Resolve the missing gate items: ${run.unmetGates.join(' | ')}`
          : 'Tighten the mission brief and retry.',
        endedAt: Date.now()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.patchRun(runId, {
        status: 'failed',
        summary: 'Direct loop runtime failed.',
        verificationSummary: message,
        nextAction: 'Check Gemini API configuration and retry the mission.',
        error: message,
        endedAt: Date.now()
      });
    } finally {
      this.cancellations.delete(runId);
    }
  }

  private mergeStageUpdates(
    params: AgentLoopStartParams,
    runId: string,
    rawStageUpdates?: AgentLoopModelResponse['stageUpdates']
  ): AgentLoopStageUpdate[] {
    const existing = this.runs.get(runId)?.stageUpdates || [];

    return params.workflow.map((step) => {
      const current = existing.find((stage) => stage.stageIndex === step.stageIndex);
      const incoming = rawStageUpdates?.find((stage) => stage.stageIndex === step.stageIndex);

      return {
        stageIndex: step.stageIndex,
        label: incoming?.label?.trim() || current?.label || step.label,
        summary: incoming?.summary?.trim() || current?.summary || step.objective,
        artifact: incoming?.artifact?.trim() || current?.artifact,
        status: incoming?.status || current?.status || 'pending'
      };
    });
  }

  private verifyCompletion(
    params: AgentLoopStartParams,
    response: AgentLoopModelResponse,
    stageUpdates: AgentLoopStageUpdate[]
  ): { done: boolean; unmetGates: string[]; summary: string } {
    const completedStages = stageUpdates.filter((stage) => stage.status === 'completed').length;
    const verificationNotes = Array.isArray(response.verification)
      ? response.verification.filter(Boolean).map((item) => item.trim())
      : [];

    const completedText = [
      response.summary || '',
      response.nextAction || '',
      response.decision || '',
      ...verificationNotes,
      ...stageUpdates.map((stage) => `${stage.label} ${stage.summary}`)
    ].join(' ').toLowerCase();

    const unmetGates = params.completionGate.filter((gate) => {
      const tokens = gate.toLowerCase().split(/\s+/).filter((token) => token.length > 3);
      return tokens.length > 0 && !tokens.some((token) => completedText.includes(token));
    });

    const hasDecision = normalizeDecision(response.decision) !== 'pending';
    const hasSummary = Boolean(response.summary?.trim());
    const hasNextAction = Boolean(response.nextAction?.trim());
    const workflowCovered = completedStages >= params.workflow.length || params.workflow.length === 0;
    const modelMarkedDone = Boolean(response.done);
    const done = hasDecision && hasSummary && hasNextAction && workflowCovered && (unmetGates.length === 0 || modelMarkedDone);

    return {
      done,
      unmetGates,
      summary: done
        ? 'Verification passed. The loop produced stage output, a decision gate, and operator next action.'
        : unmetGates.length > 0
          ? `Verification pending. Missing: ${unmetGates.join(' | ')}`
          : 'Verification pending. The mission still lacks a stable completion signal.'
    };
  }

  private async callLoopModel(
    params: AgentLoopStartParams,
    iteration: number,
    unmetGates: string[],
    lastSummary: string
  ): Promise<AgentLoopModelResponse> {
    const config = this.readConfig();
    const apiKey = this.getApiKey(config);
    if (!apiKey) {
      throw new Error('Gemini API key is not configured. Configure it in Marketing AI settings first.');
    }

    const models = [config.textModel || DEFAULT_TEXT_MODEL, ...TEXT_MODEL_FALLBACKS.filter((model) => model !== (config.textModel || DEFAULT_TEXT_MODEL))];
    let lastError: unknown = null;

    const payload = {
      mission: {
        goal: params.goal,
        briefing: params.briefing || '',
        deliverables: params.deliverables,
        guardrails: params.guardrails,
        completionGate: params.completionGate,
        workflow: params.workflow
      },
      notes: params.notes || [],
      loopState: {
        iteration,
        maxIterations: Math.min(Math.max(params.maxIterations ?? 3, 1), 6),
        unmetGates,
        lastSummary
      }
    };

    const systemPrompt = [
      'You are a direct mission orchestrator inspired by iterative agent loops.',
      'Return JSON only.',
      'Do not mention tools, terminals, or shell commands.',
      'Produce structured stage outputs that help an operator decide what to do next.',
      'Every workflow stage must get a concise summary. Mark status as completed only when that stage is materially answered.',
      'You must decide whether the mission is ready for a decision gate or still needs another refinement pass.',
      'Output JSON with keys: summary, decision, confidence, nextAction, verification, blockers, suggestedOps, stageUpdates, done.'
    ].join(' ');

    for (const model of models) {
      try {
        const response = await this.callGeminiApi(model, apiKey, {
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.35
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: JSON.stringify(payload, null, 2) }]
            }
          ]
        });

        const rawText = this.extractTextFromResponse(response);
        if (!rawText) {
          throw new Error('Gemini did not return text content');
        }

        return safeJsonParse<AgentLoopModelResponse>(stripCodeFence(rawText), {});
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private patchRun(runId: string, updates: Partial<AgentLoopRunSnapshot>): void {
    const current = this.runs.get(runId);
    if (!current) {
      return;
    }

    this.runs.set(runId, {
      ...current,
      ...updates,
      updatedAt: updates.updatedAt ?? Date.now()
    });
  }

  private readConfig(): AgentLoopConfig {
    if (!fs.existsSync(this.configPath)) {
      return {};
    }

    return safeJsonParse<AgentLoopConfig>(fs.readFileSync(this.configPath, 'utf-8'), {});
  }

  private getApiKey(config: AgentLoopConfig): string | null {
    return config.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
  }

  private extractTextFromResponse(response: any): string {
    const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
    const texts: string[] = [];

    for (const candidate of candidates) {
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      for (const part of parts) {
        if (typeof part?.text === 'string') {
          texts.push(part.text);
        }
      }
    }

    return texts.join('\n').trim();
  }

  private async callGeminiApi(model: string, apiKey: string, body: Record<string, unknown>): Promise<any> {
    const response = await fetch(`${GEMINI_API_BASE_URL}/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const rawError = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${rawError}`);
    }

    return response.json();
  }
}
