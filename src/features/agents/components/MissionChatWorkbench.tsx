import React from 'react';
import { Bot, Check, Edit3, Mic, Send, Square, TerminalSquare } from 'lucide-react';
import { useAgentProfilesContext } from '@/contexts/AgentProfilesContext';
import { useCommanderTasksContext } from '@/contexts/CommanderTasksContext';
import { useTerminalContext } from '@/contexts/TerminalContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useGeminiLiveVoice } from '@/hooks/useGeminiLiveVoice';
import {
  GEMINI_BACKEND_ACTIONS,
  GEMINI_STABLE_TERMINAL_COMMANDS,
  type GeminiLiveProposal,
  type GeminiOrchestratorCapabilityContext
} from '@/features/agents/orchestration/geminiOrchestrator';
import {
  hyperliquidService,
  type HyperliquidAgentRunCreateResponse,
  type HyperliquidAgentRuntimeStatus,
  type HyperliquidLatestAgentRunResponse
} from '@/services/hyperliquidService';
import type { AgentRole } from '@/types/agents';
import type { MissionDraft, MissionPacket } from '@/types/tasks';
import { getProviderMeta } from '@/utils/agentRuntime';
import { buildCodexPrompt, buildMissionDraftInput } from '@/utils/missionDrafts';
import { launchApprovedMissionDraft } from '@/utils/missionDraftLaunch';
import { runMissionAction } from '@/utils/missionActions';
import {
  buildMissionMetadata,
  formatRoleLabel,
  inferMissionMode,
  MISSION_MODE_CONFIG,
  type MissionMode
} from '@/utils/missionControl';

type SafeVoiceSceneStatus = 'idle' | 'recording' | 'transcribing' | 'ready' | 'error';

const LazyVoiceOrbScene = React.lazy(() => import('./VoiceOrbScene').then((module) => ({ default: module.VoiceOrbScene })));

type VoiceSceneBoundaryProps = {
  children: React.ReactNode;
  fallback: React.ReactNode;
  onError: () => void;
};

type VoiceSceneBoundaryState = {
  hasError: boolean;
};

class VoiceSceneBoundary extends React.Component<VoiceSceneBoundaryProps, VoiceSceneBoundaryState> {
  state: VoiceSceneBoundaryState = { hasError: false };

  static getDerivedStateFromError(): VoiceSceneBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getProposalDetail(proposal: GeminiLiveProposal): string {
  if (proposal.type === 'propose_terminal_command') {
    return `Command: ${proposal.command || proposal.goal}`;
  }

  if (proposal.type === 'propose_backend_action') {
    const action = GEMINI_BACKEND_ACTIONS.find((item) => item.actionKey === proposal.actionKey);
    return `Backend action: ${action?.label || proposal.actionKey || proposal.goal}`;
  }

  if (proposal.type === 'propose_send_to_terminal') {
    return `Terminal text: ${proposal.text || proposal.goal}`;
  }

  if (proposal.type === 'propose_agent_run') {
    return `${proposal.agentRole ? `Agent role: ${proposal.agentRole}. ` : ''}${proposal.goal}`;
  }

  return proposal.goal;
}

function getProposalApproveLabel(proposal: GeminiLiveProposal): string {
  switch (proposal.type) {
    case 'propose_terminal_command':
      return 'Send Command';
    case 'propose_backend_action':
      return 'Run Action';
    case 'propose_send_to_terminal':
      return 'Send To Terminal';
    case 'propose_agent_run':
      return 'Create Agent Draft';
    case 'propose_mission':
    default:
      return 'Create Draft';
  }
}

function getDraftTone(status: MissionDraft['approvalStatus']) {
  switch (status) {
    case 'running':
      return { label: 'running', background: 'rgba(14, 165, 233, 0.18)', color: '#7dd3fc' };
    case 'completed':
      return { label: 'completed', background: 'rgba(34, 197, 94, 0.16)', color: '#86efac' };
    case 'failed':
      return { label: 'failed', background: 'rgba(239, 68, 68, 0.16)', color: '#fca5a5' };
    case 'cancelled':
      return { label: 'cancelled', background: 'rgba(100, 116, 139, 0.18)', color: '#cbd5e1' };
    case 'approved':
      return { label: 'approved', background: 'rgba(59, 130, 246, 0.16)', color: '#93c5fd' };
    case 'awaiting-approval':
    case 'draft':
    default:
      return { label: 'awaiting approval', background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24' };
  }
}

function updateDraftWithLatestAgentRun(
  draftId: string,
  missionPacket: MissionPacket,
  latest: HyperliquidLatestAgentRunResponse,
  suggestedRoles: AgentRole[],
  proposedCommands: string[],
  updateMissionDraft: (draftId: string, updates: Partial<MissionDraft>) => void
): void {
  const decision = latest.agentRun.decision;
  const parentPath = Array.isArray(latest.agentRun.lineage?.parents)
    ? latest.agentRun.lineage.parents[0]
    : undefined;
  const evidenceRefs = [
    ...missionPacket.evidenceRefs,
    {
      id: latest.agentRun.run_id,
      kind: 'agent-run' as const,
      label: `Latest Research OS ${latest.agentRun.mode}`,
      path: typeof parentPath === 'string' ? parentPath : undefined,
      runId: latest.agentRun.run_id,
      strategyId: latest.strategyId,
      summary: `${decision.recommendation} | ${decision.blockers.length} blockers`,
      createdAt: Date.parse(latest.agentRun.generated_at)
    }
  ];
  const nextPacket: MissionPacket = {
    ...missionPacket,
    evidenceRefs,
    backendActions: missionPacket.backendActions.map((action) => (
      action.strategyId === latest.strategyId
        ? {
            ...action,
            status: 'completed',
            runId: latest.agentRun.run_id,
            summary: decision.executive_summary,
            updatedAt: Date.now()
          }
        : action
    ))
  };
  updateMissionDraft(draftId, {
    missionPacket: nextPacket,
    finalPrompt: buildCodexPrompt({
      goal: nextPacket.goal,
      mode: nextPacket.mode as MissionMode,
      suggestedRoles,
      proposedCommands: Array.from(new Set([...decision.recommended_commands, ...proposedCommands])),
      risks: nextPacket.guardrails,
      missionPacket: nextPacket
    })
  });
}

const voiceSceneStageStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '320px',
  overflow: 'hidden',
  background: 'radial-gradient(circle at 50% 42%, rgba(255, 255, 255, 0.05), rgba(10, 10, 12, 0.22) 40%, rgba(0, 0, 0, 0.97) 100%)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
};

const voiceSceneOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: '0 0 14px',
  pointerEvents: 'none'
};

const voiceSceneLabelStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: '8px',
  background: 'rgba(0, 0, 0, 0.65)',
  border: '1px solid rgba(255, 255, 255, 0.10)',
  color: '#e4e4e7',
  fontSize: '10px',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  backdropFilter: 'blur(10px)'
};

const voiceSceneSafePulseStyle = (status: string, audioLevel: number): React.CSSProperties => {
  const isActive = status === 'recording' || status === 'transcribing';
  const size = 96 + Math.round(audioLevel * 72);
  return {
    position: 'absolute',
    left: '50%',
    top: '44%',
    width: `${size}px`,
    height: `${size}px`,
    transform: 'translate(-50%, -50%)',
    borderRadius: '999px',
    border: isActive ? '1px solid rgba(125, 211, 252, 0.50)' : '1px solid rgba(255, 255, 255, 0.18)',
    background: isActive
      ? 'radial-gradient(circle, rgba(125, 211, 252, 0.34), rgba(34, 197, 94, 0.14) 48%, rgba(0, 0, 0, 0) 72%)'
      : 'radial-gradient(circle, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.04) 55%, rgba(0, 0, 0, 0) 74%)',
    boxShadow: isActive
      ? '0 0 48px rgba(56, 189, 248, 0.20), inset 0 0 32px rgba(255, 255, 255, 0.08)'
      : '0 0 36px rgba(255, 255, 255, 0.08), inset 0 0 24px rgba(255, 255, 255, 0.04)',
    transition: 'width 120ms ease, height 120ms ease, border-color 160ms ease, background 160ms ease'
  };
};

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const SafeVoiceScene: React.FC<{
  status: SafeVoiceSceneStatus;
  durationSeconds: number;
  audioLevel: number;
}> = ({ status, durationSeconds, audioLevel }) => {
  const [canRenderThree, setCanRenderThree] = React.useState(false);

  React.useEffect(() => {
    const disabled = window.localStorage.getItem('hedge.voiceOrb.webglDisabled') === '1';
    setCanRenderThree(!disabled && canUseWebGL());
  }, []);

  const fallback = <div style={voiceSceneSafePulseStyle(status, audioLevel)} />;
  const shouldRenderThree = canRenderThree && (status === 'recording' || status === 'transcribing');

  if (!shouldRenderThree) {
    return fallback;
  }

  return (
    <React.Suspense fallback={fallback}>
      <VoiceSceneBoundary
        fallback={fallback}
        onError={() => {
          window.localStorage.setItem('hedge.voiceOrb.webglDisabled', '1');
          setCanRenderThree(false);
        }}
      >
        <LazyVoiceOrbScene
          status={status}
          durationSeconds={durationSeconds}
          audioLevel={audioLevel}
          onRenderError={() => {
            window.localStorage.setItem('hedge.voiceOrb.webglDisabled', '1');
            setCanRenderThree(false);
          }}
        />
      </VoiceSceneBoundary>
    </React.Suspense>
  );
};

export const MissionChatWorkbench: React.FC<{ workspaceId?: string | null; variant?: 'full' | 'dock' }> = ({
  workspaceId,
  variant = 'full'
}) => {
  const isDock = variant === 'dock';
  const { activeWorkspace, workspaces } = useWorkspaceContext();
  const { agents, ensureWorkspaceAgents } = useAgentProfilesContext();
  const {
    missionMessages,
    missionDrafts,
    runs,
    createTask,
    updateTaskStatus,
    updateTaskAction,
    createRun,
    updateRun,
    addMissionMessage,
    createMissionDraft,
    updateMissionDraft
  } = useCommanderTasksContext();
  const { createTerminal, closeTerminal, setActiveTerminal, terminals, activeTerminalId } = useTerminalContext();
  const [input, setInput] = React.useState('');
  const [editingDraftId, setEditingDraftId] = React.useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = React.useState<HyperliquidAgentRuntimeStatus | null>(null);
  const [claudeAvailable, setClaudeAvailable] = React.useState(false);
  const buildDraftRef = React.useRef<(goal: string) => void>(() => undefined);

  const workspace = React.useMemo(
    () => workspaces.find((item) => item.id === workspaceId) || activeWorkspace || null,
    [activeWorkspace, workspaceId, workspaces]
  );

  const workspaceAgents = React.useMemo(
    () => agents.filter((agent) => agent.workspaceId === workspace?.id),
    [agents, workspace?.id]
  );

  const scopedMessages = React.useMemo(
    () => missionMessages
      .filter((message) => message.workspaceId === workspace?.id)
      .slice(0, 14)
      .reverse(),
    [missionMessages, workspace?.id]
  );

  const scopedDrafts = React.useMemo(
    () => missionDrafts
      .filter((draft) => draft.workspaceId === workspace?.id)
      .slice(0, 6),
    [missionDrafts, workspace?.id]
  );

  const scopedRuns = React.useMemo(
    () => runs
      .filter((run) => run.workspaceId === workspace?.id)
      .slice(0, 6),
    [runs, workspace?.id]
  );

  const activeTerminal = React.useMemo(
    () => terminals.find((terminal) => terminal.id === activeTerminalId) || null,
    [activeTerminalId, terminals]
  );

  const orchestratorContext = React.useMemo<GeminiOrchestratorCapabilityContext>(() => ({
    appName: 'Hedge Fund Station',
    workspace: workspace
      ? {
          id: workspace.id,
          name: workspace.name,
          path: workspace.path,
          shell: workspace.shell
        }
      : undefined,
    runtime: {
      codexConnected: Boolean(runtimeStatus?.codexAuthenticated),
      claudeAvailable,
      apiProviderAvailable: Boolean(runtimeStatus?.apiProviderAvailable),
      runtimeMode: runtimeStatus?.runtimeMode,
      defaultModel: runtimeStatus?.defaultModel || null
    },
    missionModes: Object.values(MISSION_MODE_CONFIG).map((mode) => ({
      id: mode.id,
      label: mode.label,
      description: mode.description,
      routeRoles: mode.routeRoles,
      appSurfaces: mode.appSurfaces,
      backendCapabilities: mode.backendCapabilities
    })),
    agents: workspaceAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      provider: agent.provider,
      objective: agent.objective
    })),
    runtimes: [
      {
        id: 'codex',
        label: 'Codex',
        available: Boolean(runtimeStatus?.codexAuthenticated),
        status: runtimeStatus?.codexAuthenticated ? 'authenticated' : 'login pending'
      },
      {
        id: 'claude',
        label: 'Claude CLI',
        available: claudeAvailable,
        status: claudeAvailable ? 'available' : 'not detected'
      },
      {
        id: 'gemini',
        label: 'Gemini Live',
        available: true,
        status: 'voice orchestrator'
      }
    ],
    safeTerminalCommands: GEMINI_STABLE_TERMINAL_COMMANDS,
    backendActions: GEMINI_BACKEND_ACTIONS,
    appSurfaces: Array.from(new Set(Object.values(MISSION_MODE_CONFIG).flatMap((mode) => mode.appSurfaces)))
      .map((name) => ({ name })),
    terminal: {
      terminalCount: terminals.length,
      activeTerminalId: activeTerminal?.id,
      activeLabel: activeTerminal?.label,
      activeCwd: activeTerminal?.cwd,
      activeCommand: activeTerminal?.currentCommand,
      available: Boolean(activeTerminal)
    },
    recentDrafts: scopedDrafts.slice(0, 4).map((draft) => ({
      id: draft.id,
      title: draft.title,
      mode: draft.mode,
      status: draft.approvalStatus
    })),
    recentRuns: scopedRuns.slice(0, 4).map((run) => ({
      id: run.id,
      summary: run.summary,
      status: run.status,
      runtimeProvider: run.runtimeProvider
    })),
    guardrails: [
      'Gemini can converse freely, but every command, agent launch, backend action, terminal write, and mission execution needs human approval.',
      'The renderer is a cockpit. Heavy market logic, replay, validation, and paper evidence stay in backend or stable scripts.',
      'Never place live trades, change credentials, or promote a strategy without explicit human review.'
    ]
  }), [
    activeTerminal,
    claudeAvailable,
    runtimeStatus?.apiProviderAvailable,
    runtimeStatus?.codexAuthenticated,
    runtimeStatus?.defaultModel,
    runtimeStatus?.runtimeMode,
    scopedDrafts,
    scopedRuns,
    terminals.length,
    workspace,
    workspaceAgents
  ]);

  React.useEffect(() => {
    let cancelled = false;
    const loadRuntimeMatrix = async () => {
      try {
        const [status, commands] = await Promise.all([
          hyperliquidService.getAgentRuntimeStatus().catch(() => null),
          window.electronAPI?.diagnostics?.checkCommands
            ? window.electronAPI.diagnostics.checkCommands(['claude']).catch(() => [])
            : Promise.resolve([])
        ]);
        if (cancelled) {
          return;
        }
        setRuntimeStatus(status);
        setClaudeAvailable(commands.some((command) => command.command === 'claude' && command.available));
      } catch {
        if (!cancelled) {
          setRuntimeStatus(null);
          setClaudeAvailable(false);
        }
      }
    };
    void loadRuntimeMatrix();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildDraft = React.useCallback((goal: string) => {
    if (!workspace) {
      return;
    }

    const draftInput = buildMissionDraftInput({
      workspaceId: workspace.id,
      goal,
      runtimeStatus,
      claudeAvailable
    });

    addMissionMessage({
      workspaceId: workspace.id,
      role: 'user',
      content: goal
    });

    const draft = createMissionDraft(draftInput);

    addMissionMessage({
      workspaceId: workspace.id,
      draftId: draft.id,
      role: 'assistant',
      content: `Draft ready for approval: ${draftInput.title}. Codex will launch only after approval.`
    });

    setInput('');
    const strategyId = draftInput.missionPacket?.strategyId;
    if (strategyId) {
      void hyperliquidService.getLatestAgentRun(strategyId).then((latest) => {
        updateDraftWithLatestAgentRun(
          draft.id,
          draftInput.missionPacket as MissionPacket,
          latest,
          draftInput.suggestedRoles,
          draftInput.proposedCommands,
          updateMissionDraft
        );
      }).catch(() => undefined);
    }
  }, [addMissionMessage, claudeAvailable, createMissionDraft, runtimeStatus, updateMissionDraft, workspace]);

  buildDraftRef.current = buildDraft;

  const {
    status: voiceStatus,
    transcript,
    outputTranscript,
    error: voiceError,
    durationSeconds,
    audioLevel,
    proposals: voiceProposals,
    diagnostics: voiceDiagnostics,
    start: startRecording,
    stop: stopRecording,
    reset,
    endSession,
    approveProposal,
    dismissProposal
  } = useGeminiLiveVoice({
    autoDraftOnTurnComplete: false,
    orchestratorContext,
    onProposal: (proposal) => {
      if (!workspace) {
        return;
      }
      addMissionMessage({
        workspaceId: workspace.id,
        role: 'assistant',
        content: `Gemini proposed "${proposal.title}". Waiting for your approval before any action.`
      });
    },
    onConversationReady: (conversation) => {
      const goal = conversation.missionText.trim();
      if (!goal) {
        return;
      }

      setInput(goal);
    }
  });
  const voiceSceneStatus: SafeVoiceSceneStatus = voiceStatus === 'token' || voiceStatus === 'connecting' || voiceStatus === 'responding'
    ? 'transcribing'
    : voiceStatus === 'missing-key'
      ? 'error'
      : voiceStatus === 'listening'
        ? 'recording'
      : voiceStatus === 'live' || voiceStatus === 'ready'
        ? 'ready'
      : voiceStatus === 'idle' || voiceStatus === 'error'
        ? voiceStatus
        : 'idle';
  const canCancelVoice = voiceStatus === 'token'
    || voiceStatus === 'connecting'
    || voiceStatus === 'listening'
    || voiceStatus === 'responding';
  const canEndLiveSession = voiceStatus === 'live' || voiceStatus === 'listening' || voiceStatus === 'responding';
  const pendingVoiceProposals = React.useMemo(
    () => voiceProposals.filter((proposal) => proposal.status === 'pending'),
    [voiceProposals]
  );

  const handleSubmit = React.useCallback(() => {
    const goal = input.trim();
    if (!goal) {
      return;
    }

    if (editingDraftId) {
      const draftInput = buildMissionDraftInput({
        workspaceId: workspace?.id || '',
        goal,
        runtimeStatus,
        claudeAvailable
      });
      updateMissionDraft(editingDraftId, {
        ...draftInput,
        approvalStatus: 'awaiting-approval'
      });
      addMissionMessage({
        workspaceId: workspace?.id || '',
        draftId: editingDraftId,
        role: 'assistant',
        content: `Draft updated and waiting for approval: ${draftInput.title}.`
      });
      setEditingDraftId(null);
      setInput('');
      return;
    }

    buildDraft(goal);
  }, [addMissionMessage, buildDraft, claudeAvailable, editingDraftId, input, runtimeStatus, updateMissionDraft, workspace?.id]);

  const runResearchOsPreflight = React.useCallback(async (draft: MissionDraft): Promise<MissionDraft> => {
    const packet = draft.missionPacket;
    const action = packet?.backendActions.find((item) => (
      (item.kind === 'agent-research' || item.kind === 'agent-audit')
        && item.status !== 'completed'
        && item.strategyId
    ));
    if (!packet || !action?.strategyId) {
      return draft;
    }

    const runningPacket: MissionPacket = {
      ...packet,
      backendActions: packet.backendActions.map((item) => (
        item.id === action.id ? { ...item, status: 'running', updatedAt: Date.now() } : item
      ))
    };
    updateMissionDraft(draft.id, { missionPacket: runningPacket });

    const response: HyperliquidAgentRunCreateResponse = action.kind === 'agent-audit'
      ? await hyperliquidService.runAgentAudit({
          strategy_id: action.strategyId,
          runtime: runningPacket.runtimePlan.backendRuntime === 'auto' ? 'auto' : runningPacket.runtimePlan.backendRuntime,
          mission_id: runningPacket.missionId
        })
      : await hyperliquidService.runAgentResearch({
          strategy_id: action.strategyId,
          runtime: runningPacket.runtimePlan.backendRuntime === 'auto' ? 'auto' : runningPacket.runtimePlan.backendRuntime,
          mission_id: runningPacket.missionId
        });

    const nextPacket: MissionPacket = {
      ...runningPacket,
      backendActions: runningPacket.backendActions.map((item) => (
        item.id === action.id
          ? {
              ...item,
              status: 'completed',
              runId: response.runId,
              path: response.runPath,
              summary: `${response.recommendation} | ${response.blockerCount} blockers`,
              updatedAt: Date.now()
            }
          : item
      )),
      evidenceRefs: [
        ...runningPacket.evidenceRefs,
        {
          id: response.runId,
          kind: 'agent-run',
          label: `Research OS ${response.mode}`,
          path: response.runPath,
          runId: response.runId,
          strategyId: response.strategyId,
          summary: `${response.recommendation} | ${response.blockerCount} blockers`,
          createdAt: Date.now()
        }
      ],
      outputs: [
        ...runningPacket.outputs,
        {
          id: response.runId,
          kind: 'agent-run',
          label: `Research OS ${response.mode}`,
          path: response.runPath,
          runId: response.runId,
          strategyId: response.strategyId,
          summary: response.agentRun.decision.executive_summary,
          createdAt: Date.now()
        }
      ]
    };
    const finalPrompt = buildCodexPrompt({
      goal: draft.goal,
      mode: draft.mode as MissionMode,
      suggestedRoles: draft.suggestedRoles,
      proposedCommands: Array.from(new Set([...response.recommendedCommands, ...draft.proposedCommands])),
      risks: draft.risks,
      missionPacket: nextPacket
    });
    updateMissionDraft(draft.id, {
      missionPacket: nextPacket,
      finalPrompt,
      proposedCommands: Array.from(new Set([...response.recommendedCommands, ...draft.proposedCommands]))
    });
    return {
      ...draft,
      missionPacket: nextPacket,
      finalPrompt,
      proposedCommands: Array.from(new Set([...response.recommendedCommands, ...draft.proposedCommands]))
    };
  }, [updateMissionDraft]);

  const approveDraft = React.useCallback(async (draft: MissionDraft) => {
    if (!workspace) {
      return;
    }

    if (workspaceAgents.length === 0) {
      ensureWorkspaceAgents([workspace]);
    }

    const missionMode = inferMissionMode(draft.goal);
    const missionMetadata = buildMissionMetadata({
      goal: draft.goal,
      missionMode,
      missionDepth: 'focused',
      pinnedNotes: [],
      memoryNotes: []
    });
    const task = createTask(draft.goal, workspace.id, draft.title, missionMetadata);
    updateTaskStatus(task.id, 'routing');

    let launchDraft = draft;
    try {
      launchDraft = await runResearchOsPreflight(draft);
    } catch (err) {
      const packet = draft.missionPacket;
      if (packet) {
        updateMissionDraft(draft.id, {
          missionPacket: {
            ...packet,
            backendActions: packet.backendActions.map((action) => (
              action.status === 'running'
                ? { ...action, status: 'failed', summary: err instanceof Error ? err.message : 'Research OS preflight failed.', updatedAt: Date.now() }
                : action
            ))
          }
        });
      }
      addMissionMessage({
        workspaceId: workspace.id,
        draftId: draft.id,
        role: 'system',
        content: `Research OS preflight failed: ${err instanceof Error ? err.message : 'unknown error'}. Frontier launch blocked until review.`
      });
      updateTaskStatus(task.id, 'failed');
      updateMissionDraft(draft.id, {
        taskId: task.id,
        approvalStatus: 'failed',
        error: err instanceof Error ? err.message : 'Research OS preflight failed.'
      });
      return;
    }

    const launchResult = launchApprovedMissionDraft(
      {
        workspace,
        workspaceAgents,
        createTask,
        updateTaskStatus,
        createTerminal,
        createRun,
        updateRun
      },
      {
        draft: launchDraft,
        task,
        summaryPrefix: 'Approved mission launching'
      }
    );

    if (!launchResult.ok) {
      updateMissionDraft(draft.id, {
        taskId: launchResult.task.id,
        approvalStatus: 'failed',
        error: launchResult.error
      });
      addMissionMessage({
        workspaceId: workspace.id,
        taskId: launchResult.task.id,
        draftId: draft.id,
        role: 'system',
        content: `Mission launch failed: ${launchResult.error}`
      });
      return;
    }

    updateMissionDraft(draft.id, {
      taskId: launchResult.task.id,
      runId: launchResult.run.id,
      terminalIds: launchResult.run.terminalIds,
      approvalStatus: 'running',
      approvedAt: Date.now()
    });
    addMissionMessage({
      workspaceId: workspace.id,
      taskId: launchResult.task.id,
      draftId: draft.id,
      role: 'system',
      content: `Approved. ${getProviderMeta(launchResult.agent.provider).label} launched for "${draft.title}" with Research OS evidence attached.`
    });
  }, [
    addMissionMessage,
    createRun,
    createTask,
    createTerminal,
    ensureWorkspaceAgents,
    runResearchOsPreflight,
    updateMissionDraft,
    updateRun,
    updateTaskStatus,
    workspace,
    workspaceAgents
  ]);

  const cancelDraft = React.useCallback((draft: MissionDraft) => {
    draft.terminalIds?.forEach((terminalId) => {
      closeTerminal(terminalId);
    });
    if (draft.runId) {
      updateRun(draft.runId, {
        status: 'failed',
        launchState: 'attention',
        summary: 'Mission cancelled by operator.',
        endedAt: Date.now()
      });
    }
    if (draft.taskId) {
      updateTaskStatus(draft.taskId, 'failed');
    }
    updateMissionDraft(draft.id, { approvalStatus: 'cancelled' });
    if (workspace) {
      addMissionMessage({
        workspaceId: workspace.id,
        draftId: draft.id,
        role: 'system',
        content: `Cancelled mission: ${draft.title}.`
      });
    }
  }, [addMissionMessage, closeTerminal, updateMissionDraft, updateRun, updateTaskStatus, workspace]);

  React.useEffect(() => {
    scopedDrafts.forEach((draft) => {
      if (!draft.runId || draft.approvalStatus !== 'running') {
        return;
      }
      const run = runs.find((item) => item.id === draft.runId);
      if (!run) {
        return;
      }
      if (run.status === 'completed' || run.status === 'failed') {
        updateMissionDraft(draft.id, {
          approvalStatus: run.status,
          terminalIds: run.terminalIds
        });
      } else if (draft.terminalIds?.join('|') !== run.terminalIds.join('|')) {
        updateMissionDraft(draft.id, { terminalIds: run.terminalIds });
      }
    });
  }, [runs, scopedDrafts, updateMissionDraft]);

  const sendApprovedTerminalText = React.useCallback((proposal: GeminiLiveProposal, text: string, execute: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }

    const payload = execute ? `${trimmed}\r` : trimmed;
    if (activeTerminal) {
      setActiveTerminal(activeTerminal.id);
      window.electronAPI.terminal.write(activeTerminal.id, payload);
      if (workspace) {
        addMissionMessage({
          workspaceId: workspace.id,
          role: 'system',
          content: execute
            ? `Approved terminal command sent to ${activeTerminal.label}: ${trimmed}`
            : `Approved text sent to ${activeTerminal.label}.`
        });
      }
      return true;
    }

    if (!workspace) {
      setInput(trimmed);
      return false;
    }

    const terminalId = createTerminal(
      workspace.path,
      workspace.shell,
      proposal.title || 'Gemini terminal proposal',
      execute ? trimmed : undefined,
      { terminalPurpose: 'gemini-orchestrator' }
    );
    setActiveTerminal(terminalId);
    if (!execute) {
      window.setTimeout(() => {
        window.electronAPI.terminal.write(terminalId, trimmed);
      }, 500);
    }
    addMissionMessage({
      workspaceId: workspace.id,
      role: 'system',
      content: execute
        ? `Approved terminal command launched in a new terminal: ${trimmed}`
        : 'Approved terminal text sent to a new terminal.'
    });
    return true;
  }, [activeTerminal, addMissionMessage, createTerminal, setActiveTerminal, workspace]);

  const runApprovedBackendAction = React.useCallback(async (proposal: GeminiLiveProposal) => {
    if (!workspace) {
      setInput(proposal.goal || proposal.title);
      return false;
    }

    const action = GEMINI_BACKEND_ACTIONS.find((item) => item.actionKey === proposal.actionKey);
    if (!action) {
      addMissionMessage({
        workspaceId: workspace.id,
        role: 'system',
        content: `Gemini proposed an unsupported backend action: ${proposal.actionKey || 'unknown'}. Nothing ran.`
      });
      return false;
    }

    const goal = proposal.goal.trim() || `${action.label}: ${proposal.reason || action.description}`;
    const mode = (action.modeHints[0] as MissionMode | undefined) || inferMissionMode(goal);
    const missionMetadata = buildMissionMetadata({
      goal,
      missionMode: mode,
      missionDepth: 'focused',
      pinnedNotes: [],
      memoryNotes: []
    });
    const task = createTask(goal, workspace.id, proposal.title || action.label, missionMetadata);
    const actionRecord = task.actions?.find((item) => item.key === action.actionKey);

    updateTaskStatus(task.id, 'running');
    if (actionRecord) {
      updateTaskAction(task.id, actionRecord.id, {
        status: 'running',
        summary: `Running ${action.label} from approved Gemini proposal...`
      });
    }
    addMissionMessage({
      workspaceId: workspace.id,
      taskId: task.id,
      role: 'system',
      content: `Approved backend action: ${action.label}.`
    });

    try {
      const result = await runMissionAction(task, action.actionKey);
      updateTaskStatus(task.id, 'completed');
      if (actionRecord) {
        updateTaskAction(task.id, actionRecord.id, {
          status: 'completed',
          summary: result.summary
        });
      }
      addMissionMessage({
        workspaceId: workspace.id,
        taskId: task.id,
        role: 'assistant',
        content: `${action.label} completed. ${result.summary}`
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : `${action.label} failed.`;
      updateTaskStatus(task.id, 'failed');
      if (actionRecord) {
        updateTaskAction(task.id, actionRecord.id, {
          status: 'failed',
          summary: message
        });
      }
      addMissionMessage({
        workspaceId: workspace.id,
        taskId: task.id,
        role: 'system',
        content: `${action.label} failed: ${message}`
      });
      return false;
    }
  }, [addMissionMessage, createTask, updateTaskAction, updateTaskStatus, workspace]);

  const handleVoicePrimary = React.useCallback(() => {
    if (voiceStatus === 'listening') {
      stopRecording();
      return;
    }

    if (voiceStatus === 'token' || voiceStatus === 'connecting' || voiceStatus === 'responding') {
      return;
    }

    void startRecording();
  }, [startRecording, stopRecording, voiceStatus]);

  const handleApproveVoiceProposal = React.useCallback(async (proposal: GeminiLiveProposal) => {
    if (proposal.type === 'propose_terminal_command') {
      const command = proposal.command?.trim();
      if (!command) {
        return;
      }
      const sent = sendApprovedTerminalText(proposal, command, true);
      if (sent) {
        approveProposal(proposal.id);
      }
      return;
    }

    if (proposal.type === 'propose_send_to_terminal') {
      const text = proposal.text?.trim() || proposal.goal.trim();
      if (!text) {
        return;
      }
      const sent = sendApprovedTerminalText(proposal, text, false);
      if (sent) {
        approveProposal(proposal.id);
      }
      return;
    }

    if (proposal.type === 'propose_backend_action') {
      if (!GEMINI_BACKEND_ACTIONS.some((action) => action.actionKey === proposal.actionKey)) {
        if (workspace) {
          addMissionMessage({
            workspaceId: workspace.id,
            role: 'system',
            content: `Unsupported Gemini backend action: ${proposal.actionKey || 'unknown'}. Nothing ran.`
          });
        }
        return;
      }
      approveProposal(proposal.id);
      await runApprovedBackendAction(proposal);
      return;
    }

    if (!workspace) {
      setInput(proposal.goal.trim() || proposal.title);
      return;
    }

    approveProposal(proposal.id);
    const goal = [
      proposal.goal.trim() || proposal.title,
      proposal.type === 'propose_agent_run' && proposal.agentRole
        ? `Requested specialist role: ${proposal.agentRole}`
        : ''
    ].filter(Boolean).join('\n\n');
    setInput(goal);
    buildDraftRef.current(goal);
  }, [
    addMissionMessage,
    approveProposal,
    runApprovedBackendAction,
    sendApprovedTerminalText,
    workspace
  ]);

  return (
    <div style={{ ...shellStyle, ...(isDock ? dockShellStyle : null) }}>
      <div style={{ ...headerStyle, ...(isDock ? dockHeaderStyle : null) }}>
        <div>
          <div style={eyebrowStyle}>{isDock ? 'Voice Source' : 'Codex Mission Chat'}</div>
          <h2 style={{ ...titleStyle, ...(isDock ? dockTitleStyle : null) }}>
            {isDock ? 'Gemini Live desk' : 'Talk live. Approve actions. Then run auditable agents.'}
          </h2>
          <p style={copyStyle}>
            {isDock
              ? 'Tap to talk with Gemini Live. Approve only when it proposes an action.'
              : 'Gemini Live can plan with you in real time; Research OS and terminals still require explicit approval.'}
          </p>
        </div>
        <div style={{ ...statusStripStyle, ...(isDock ? dockStatusStripStyle : null) }}>
          <div style={statusPillStyle}>Actions need approval</div>
          <div style={statusPillStyle}>{runtimeStatus?.codexAuthenticated ? 'Codex connected' : 'Codex pending'}</div>
          <div style={statusPillStyle}>{claudeAvailable ? 'Claude available' : 'Claude optional'}</div>
          <div style={statusPillStyle}>{voiceDiagnostics.model || 'Gemini Live'}</div>
        </div>
      </div>

      <div style={{ ...mainGridStyle, ...(isDock ? dockMainGridStyle : null) }}>
        <section style={{ ...chatPanelStyle, ...(isDock ? dockChatPanelStyle : null) }}>
          {isDock ? (
            <div style={voiceSceneStageStyle}>
              <SafeVoiceScene status={voiceSceneStatus} durationSeconds={durationSeconds} audioLevel={audioLevel} />
              <div style={voiceSceneOverlayStyle}>
                <div style={voiceSceneLabelStyle}>
                  {voiceStatus === 'listening'
                      ? 'Listening'
                    : voiceStatus === 'token'
                      ? 'Token'
                    : voiceStatus === 'connecting'
                      ? 'Connecting'
                      : voiceStatus === 'responding'
                        ? 'Responding'
                      : voiceStatus === 'live' || voiceStatus === 'ready'
                        ? 'Live'
                        : voiceStatus === 'error' || voiceStatus === 'missing-key'
                          ? 'Voice Error'
                          : 'Standing By'}
                </div>
              </div>
            </div>
          ) : null}
          <div style={{ ...messageListStyle, ...(isDock ? dockMessageListStyle : null) }}>
            {scopedMessages.length === 0 ? (
              <div style={{ ...emptyStateStyle, ...(isDock ? dockEmptyStateStyle : null) }}>
                <Bot size={24} />
                <div>{isDock ? 'Tap Talk and speak with Gemini Live. Proposals will wait for approval.' : 'Speak with Gemini Live, then approve any mission, agent, or terminal proposal before it runs.'}</div>
              </div>
            ) : (
              scopedMessages.map((message) => (
                <div
                  key={message.id}
                  style={{
                    ...messageStyle,
                    alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                    background: message.role === 'user' ? 'rgba(56, 189, 248, 0.14)' : 'rgba(15, 23, 42, 0.78)',
                    borderColor: message.role === 'user' ? 'rgba(56, 189, 248, 0.24)' : 'rgba(148, 163, 184, 0.14)'
                  }}
                >
                  <div style={messageMetaStyle}>{message.role} • {formatTime(message.createdAt)}</div>
                  <div style={messageContentStyle}>{message.content}</div>
                </div>
              ))
            )}
          </div>

          <div style={{ ...composerStyle, ...(isDock ? dockComposerStyle : null) }}>
            {isDock ? (
              <button
                type="button"
                onClick={handleVoicePrimary}
                disabled={voiceStatus === 'token' || voiceStatus === 'connecting' || voiceStatus === 'responding'}
                style={{
                  ...dockPrimaryVoiceButtonStyle,
                  background: voiceStatus === 'listening'
                    ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(200, 200, 200, 0.90))'
                    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(180, 180, 180, 0.10))',
                  color: voiceStatus === 'listening' ? '#0a0a0a' : '#ffffff'
                }}
              >
                <Mic size={20} />
                {voiceStatus === 'listening'
                  ? `Stop Turn ${durationSeconds}s`
                  : voiceStatus === 'token'
                    ? 'Getting Token'
                  : voiceStatus === 'connecting'
                    ? 'Connecting'
                    : voiceStatus === 'responding'
                      ? 'Gemini Responding'
                    : voiceStatus === 'live'
                      ? 'Talk'
                      : 'Start Live'}
              </button>
            ) : null}
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={isDock ? 'Voice transcript or quick mission...' : 'Speak or type the mission. Example: scan Hyperliquid for crowded squeeze candidates and prepare a no-trade list.'}
              rows={isDock ? 3 : 4}
              style={{ ...textareaStyle, ...(isDock ? dockTextareaStyle : null) }}
            />
            <div style={composerActionsStyle}>
              {!isDock ? (
                <button
                  type="button"
                  onClick={handleVoicePrimary}
                  disabled={voiceStatus === 'token' || voiceStatus === 'connecting' || voiceStatus === 'responding'}
                  style={{
                    ...voiceButtonStyle,
                    background: voiceStatus === 'listening' ? 'rgba(239, 68, 68, 0.24)' : 'rgba(59, 130, 246, 0.18)',
                    color: voiceStatus === 'listening' ? '#fecaca' : '#bfdbfe'
                  }}
                >
                        <Mic size={15} />
                  {voiceStatus === 'listening'
                    ? `Stop turn ${durationSeconds}s`
                    : voiceStatus === 'token'
                      ? 'Getting token'
                    : voiceStatus === 'connecting'
                      ? 'Connecting'
                      : voiceStatus === 'responding'
                        ? 'Gemini responding'
                      : voiceStatus === 'live'
                        ? 'Talk'
                        : 'Start Live'}
                </button>
              ) : null}
              {canCancelVoice ? (
                <button type="button" onClick={reset} style={ghostButtonStyle}>
                  Cancel
                </button>
              ) : null}
              {canEndLiveSession ? (
                <button type="button" onClick={endSession} style={ghostButtonStyle}>
                  End Session
                </button>
              ) : null}
              <button type="button" onClick={() => { reset(); setInput(''); }} style={ghostButtonStyle}>
                Clear
              </button>
              <button type="button" onClick={handleSubmit} disabled={!input.trim() || !workspace} style={sendButtonStyle}>
                <Send size={15} />
                {editingDraftId ? 'Update Draft' : 'Draft Mission'}
              </button>
            </div>
            {voiceError ? <div style={errorStyle}>{voiceError}</div> : null}
            {transcript ? <div style={hintStyle}>You: {transcript}</div> : null}
            {outputTranscript ? <div style={hintStyle}>Gemini: {outputTranscript}</div> : null}
            {pendingVoiceProposals.length > 0 ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                {pendingVoiceProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(56, 189, 248, 0.24)',
                      background: 'rgba(8, 47, 73, 0.26)',
                      display: 'grid',
                      gap: '8px'
                    }}
                  >
                    <div style={{ color: '#e0f2fe', fontSize: '12px', fontWeight: 800 }}>
                      Pending approval: {proposal.title}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.45 }}>
                      {getProposalDetail(proposal)}
                    </div>
                    {proposal.reason ? (
                      <div style={{ color: '#cbd5e1', fontSize: '11px', lineHeight: 1.45 }}>
                        Reason: {proposal.reason}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => { void handleApproveVoiceProposal(proposal); }} style={sendButtonStyle}>
                        {getProposalApproveLabel(proposal)}
                      </button>
                      <button type="button" onClick={() => dismissProposal(proposal.id)} style={ghostButtonStyle}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div style={hintStyle}>
              Live diag: {voiceStatus} | sent {voiceDiagnostics.sentAudioChunks} | recv {voiceDiagnostics.receivedAudioChunks}
              {voiceDiagnostics.fallbackUsed ? ' | fallback model' : ''}
            </div>
          </div>
        </section>

        <aside style={{ ...draftPanelStyle, ...(isDock ? dockDraftPanelStyle : null) }}>
          <div style={panelHeaderStyle}>
            <div>
              <div style={panelLabelStyle}>Mission Drafts</div>
              <div style={panelCopyStyle}>Nothing runs until you approve it.</div>
            </div>
          </div>

          <div style={{ ...draftListStyle, ...(isDock ? dockDraftListStyle : null) }}>
            {scopedDrafts.length === 0 ? (
              <div style={emptyDraftStyle}>No mission drafts yet.</div>
            ) : (
              scopedDrafts.map((draft) => {
                const tone = getDraftTone(draft.approvalStatus);
                const provider = getProviderMeta(draft.missionPacket?.frontierRuntime || 'codex');
                const draftRun = draft.runId ? runs.find((run) => run.id === draft.runId) : null;
                return (
                  <div key={draft.id} style={draftCardStyle}>
                    <div style={draftHeaderStyle}>
                      <div>
                        <div style={draftTitleStyle}>{draft.title}</div>
                        <div style={draftModeStyle}>{MISSION_MODE_CONFIG[draft.mode as MissionMode]?.label || draft.mode}</div>
                      </div>
                      <div style={{ ...draftStatusStyle, background: tone.background, color: tone.color }}>{tone.label}</div>
                    </div>

                    <div style={draftGoalStyle}>{draft.goal}</div>

                    {draft.missionPacket ? (
                      <div style={miniSectionStyle}>
                        <div style={miniLabelStyle}>Mission packet</div>
                        <div style={riskStyle}>{draft.missionPacket.runtimePlan.summary}</div>
                        {draft.missionPacket.strategyId ? (
                          <code style={commandStyle}>strategy: {draft.missionPacket.strategyId}</code>
                        ) : null}
                      </div>
                    ) : null}

                    <div style={chipRowStyle}>
                      {draft.suggestedRoles.slice(0, 4).map((role) => (
                        <span key={role} style={chipStyle}>{formatRoleLabel(role)}</span>
                      ))}
                    </div>

                    <div style={miniSectionStyle}>
                      <div style={miniLabelStyle}>Approved command shortlist</div>
                      {draft.proposedCommands.map((command) => (
                        <code key={command} style={commandStyle}>{command}</code>
                      ))}
                    </div>

                    {draft.missionPacket?.backendActions.length ? (
                      <div style={miniSectionStyle}>
                        <div style={miniLabelStyle}>Research OS preflight</div>
                        {draft.missionPacket.backendActions.map((action) => (
                          <div key={action.id} style={riskStyle}>
                            {action.label} · {action.status}{action.summary ? ` · ${action.summary}` : ''}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {draft.missionPacket?.evidenceRefs.length ? (
                      <div style={miniSectionStyle}>
                        <div style={miniLabelStyle}>Evidence attached</div>
                        {draft.missionPacket.evidenceRefs.slice(0, 3).map((ref) => (
                          <div key={ref.id} style={riskStyle}>{ref.label}: {ref.summary || ref.path || ref.runId}</div>
                        ))}
                      </div>
                    ) : null}

                    <div style={miniSectionStyle}>
                      <div style={miniLabelStyle}>Risk guardrails</div>
                      {draft.risks.map((risk) => (
                        <div key={risk} style={riskStyle}>{risk}</div>
                      ))}
                    </div>

                    {draftRun?.outputExcerpt ? (
                      <pre style={excerptStyle}>{draftRun.outputExcerpt.slice(-900)}</pre>
                    ) : null}

                    <div style={draftActionsStyle}>
                      <button
                        type="button"
                        onClick={() => void approveDraft(draft)}
                        disabled={draft.approvalStatus === 'running' || draft.approvalStatus === 'completed'}
                        style={approveButtonStyle}
                      >
                        <Check size={14} />
                        Approve {provider.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDraftId(draft.id);
                          setInput(draft.goal);
                        }}
                        disabled={draft.approvalStatus === 'running'}
                        style={draftGhostButtonStyle}
                      >
                        <Edit3 size={14} />
                        Edit
                      </button>
                      {draft.terminalIds?.[0] ? (
                        <button type="button" onClick={() => setActiveTerminal(draft.terminalIds![0])} style={draftGhostButtonStyle}>
                          <TerminalSquare size={14} />
                          Console
                        </button>
                      ) : null}
                      <button type="button" onClick={() => cancelDraft(draft)} style={stopButtonStyle}>
                        <Square size={13} />
                        Stop
                      </button>
                    </div>

                    <div style={{ ...providerStripStyle, color: provider.accent }}>
                      {provider.label} frontier runtime • Research OS artifacts retained
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

const shellStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: '#020617',
  color: '#e5e7eb'
};

const dockShellStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
  borderLeft: '1px solid rgba(148, 163, 184, 0.12)'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '22px 24px 16px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  flexWrap: 'wrap'
};

const dockHeaderStyle: React.CSSProperties = {
  padding: '16px 14px 12px',
  gap: '10px'
};

const eyebrowStyle: React.CSSProperties = {
  color: '#38bdf8',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.14em'
};

const titleStyle: React.CSSProperties = {
  margin: '8px 0 4px',
  color: '#f8fafc',
  fontSize: '26px',
  fontWeight: 800,
  letterSpacing: 0
};

const dockTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  lineHeight: 1.2
};

const copyStyle: React.CSSProperties = {
  margin: 0,
  color: '#94a3b8',
  fontSize: '13px'
};

const statusStripStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'flex-start',
  flexWrap: 'wrap'
};

const dockStatusStripStyle: React.CSSProperties = {
  gap: '6px'
};

const statusPillStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: '8px',
  background: 'rgba(15, 23, 42, 0.75)',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase'
};

const mainGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(360px, 1.3fr) minmax(340px, 0.9fr)',
  gap: '18px',
  padding: '18px 24px 24px'
};

const dockMainGridStyle: React.CSSProperties = {
  gridTemplateColumns: '1fr',
  gap: '10px',
  padding: '10px',
  overflow: 'auto',
  minHeight: 0
};

const chatPanelStyle: React.CSSProperties = {
  minHeight: '650px',
  display: 'grid',
  gridTemplateRows: '1fr auto',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'rgba(15, 23, 42, 0.48)',
  borderRadius: '8px',
  overflow: 'hidden'
};

const dockChatPanelStyle: React.CSSProperties = {
  minHeight: '560px'
};

const messageListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '18px',
  overflow: 'auto'
};

const dockMessageListStyle: React.CSSProperties = {
  padding: '12px',
  maxHeight: '34vh'
};

const emptyStateStyle: React.CSSProperties = {
  margin: 'auto',
  maxWidth: '420px',
  display: 'grid',
  gap: '12px',
  justifyItems: 'center',
  color: '#94a3b8',
  fontSize: '13px',
  lineHeight: 1.5,
  textAlign: 'center'
};

const dockEmptyStateStyle: React.CSSProperties = {
  fontSize: '12px',
  maxWidth: '260px'
};

const messageStyle: React.CSSProperties = {
  maxWidth: '78%',
  border: '1px solid',
  borderRadius: '8px',
  padding: '11px 12px'
};

const messageMetaStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '10px',
  fontWeight: 800,
  textTransform: 'uppercase',
  marginBottom: '6px'
};

const messageContentStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  color: '#e5e7eb',
  fontSize: '13px',
  lineHeight: 1.5
};

const composerStyle: React.CSSProperties = {
  borderTop: '1px solid rgba(148, 163, 184, 0.12)',
  padding: '12px',
  display: 'grid',
  gap: '10px',
  background: 'rgba(2, 6, 23, 0.76)'
};

const dockComposerStyle: React.CSSProperties = {
  padding: '10px'
};

const dockPrimaryVoiceButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '58px',
  border: '1px solid rgba(255, 255, 255, 0.16)',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  boxShadow: '0 14px 34px rgba(255, 255, 255, 0.06)'
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  resize: 'vertical',
  minHeight: '96px',
  borderRadius: '8px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.88)',
  color: '#f8fafc',
  padding: '12px',
  fontSize: '13px',
  lineHeight: 1.5,
  outline: 'none',
  boxSizing: 'border-box'
};

const dockTextareaStyle: React.CSSProperties = {
  minHeight: '78px',
  fontSize: '12px'
};

const composerActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  justifyContent: 'flex-end'
};

const voiceButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  padding: '9px 11px',
  borderRadius: '8px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 800
};

const ghostButtonStyle: React.CSSProperties = {
  padding: '9px 11px',
  borderRadius: '8px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.65)',
  color: '#cbd5e1',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 800
};

const sendButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  padding: '9px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(56, 189, 248, 0.28)',
  background: 'rgba(56, 189, 248, 0.16)',
  color: '#bae6fd',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 800
};

const errorStyle: React.CSSProperties = {
  color: '#fca5a5',
  fontSize: '11px'
};

const hintStyle: React.CSSProperties = {
  color: '#93c5fd',
  fontSize: '11px'
};

const draftPanelStyle: React.CSSProperties = {
  minHeight: '650px',
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  gap: '12px'
};

const dockDraftPanelStyle: React.CSSProperties = {
  minHeight: 'unset',
  gap: '10px'
};

const panelHeaderStyle: React.CSSProperties = {
  padding: '14px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'rgba(15, 23, 42, 0.58)',
  borderRadius: '8px'
};

const panelLabelStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '14px',
  fontWeight: 800
};

const panelCopyStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '12px',
  marginTop: '4px'
};

const draftListStyle: React.CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: '12px',
  overflow: 'auto'
};

const dockDraftListStyle: React.CSSProperties = {
  maxHeight: '42vh'
};

const emptyDraftStyle: React.CSSProperties = {
  padding: '18px',
  borderRadius: '8px',
  border: '1px dashed rgba(148, 163, 184, 0.16)',
  color: '#64748b',
  fontSize: '12px'
};

const draftCardStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  padding: '14px',
  borderRadius: '8px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'rgba(15, 23, 42, 0.72)'
};

const draftHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  alignItems: 'flex-start'
};

const draftTitleStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '13px',
  fontWeight: 800,
  lineHeight: 1.35
};

const draftModeStyle: React.CSSProperties = {
  color: '#38bdf8',
  fontSize: '10px',
  fontWeight: 800,
  textTransform: 'uppercase',
  marginTop: '5px'
};

const draftStatusStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: '8px',
  fontSize: '10px',
  fontWeight: 800,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap'
};

const draftGoalStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: '12px',
  lineHeight: 1.5
};

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap'
};

const chipStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: '8px',
  background: 'rgba(56, 189, 248, 0.1)',
  color: '#7dd3fc',
  fontSize: '10px',
  fontWeight: 800
};

const miniSectionStyle: React.CSSProperties = {
  display: 'grid',
  gap: '6px'
};

const miniLabelStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '10px',
  fontWeight: 800,
  textTransform: 'uppercase'
};

const commandStyle: React.CSSProperties = {
  display: 'block',
  padding: '6px 8px',
  borderRadius: '6px',
  background: 'rgba(2, 6, 23, 0.72)',
  color: '#e0f2fe',
  fontSize: '11px',
  whiteSpace: 'pre-wrap'
};

const riskStyle: React.CSSProperties = {
  color: '#fbbf24',
  fontSize: '11px',
  lineHeight: 1.4
};

const excerptStyle: React.CSSProperties = {
  maxHeight: '130px',
  overflow: 'auto',
  margin: 0,
  padding: '8px',
  borderRadius: '6px',
  background: 'rgba(2, 6, 23, 0.86)',
  color: '#cbd5e1',
  fontSize: '10px',
  whiteSpace: 'pre-wrap'
};

const draftActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap'
};

const approveButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid rgba(34, 197, 94, 0.28)',
  background: 'rgba(34, 197, 94, 0.14)',
  color: '#bbf7d0',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 800
};

const draftGhostButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.66)',
  color: '#cbd5e1',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 800
};

const stopButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid rgba(248, 113, 113, 0.24)',
  background: 'rgba(127, 29, 29, 0.22)',
  color: '#fecaca',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 800
};

const providerStripStyle: React.CSSProperties = {
  paddingTop: '4px',
  fontSize: '10px',
  fontWeight: 800,
  textTransform: 'uppercase'
};
