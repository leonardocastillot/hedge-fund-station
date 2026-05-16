import React from 'react';
import { Archive, Bot, Check, Edit3, Mic, Plus, Send, Square, TerminalSquare } from 'lucide-react';
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
import type { MissionConversation, MissionDraft, MissionPacket, TaskRun } from '@/types/tasks';
import { getProviderMeta } from '@/utils/agentRuntime';
import { buildCodexPrompt, buildMissionDraftInput } from '@/utils/missionDrafts';
import { launchApprovedMissionDraft } from '@/utils/missionDraftLaunch';
import { runMissionAction } from '@/utils/missionActions';
import {
  buildMissionMetadata,
  inferMissionMode,
  MISSION_MODE_CONFIG,
  type MissionMode
} from '@/utils/missionControl';
import { publishWorkspaceDockMode } from '@/features/desks/workspaceDockEvents';

type SafeVoiceSceneStatus = 'idle' | 'recording' | 'transcribing' | 'ready' | 'error';
const ACTIVE_CONVERSATION_STORAGE_KEY = 'hedge-station:mission-chat-active-conversation:v1';

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

function loadActiveConversationMap(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  } catch {
    return {};
  }
}

function buildConversationTitle(goal: string): string {
  const firstLine = goal.trim().split('\n').find(Boolean) || 'New chat';
  return firstLine.length > 48 ? `${firstLine.slice(0, 45)}...` : firstLine;
}

function isAutomaticConversationTitle(title: string): boolean {
  return title === 'New chat' || title === 'Workspace history' || title === 'Conversation';
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
      return { label: 'running', background: 'var(--app-accent-soft)', color: 'var(--app-accent)' };
    case 'completed':
      return { label: 'completed', background: 'rgba(34, 197, 94, 0.16)', color: '#86efac' };
    case 'failed':
      return { label: 'failed', background: 'rgba(239, 68, 68, 0.16)', color: '#fca5a5' };
    case 'cancelled':
      return { label: 'cancelled', background: 'var(--app-panel-muted)', color: 'var(--app-muted)' };
    case 'approved':
      return { label: 'approved', background: 'var(--app-accent-soft)', color: 'var(--app-accent)' };
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
    border: isActive ? '1px solid var(--app-border-strong)' : '1px solid rgba(255, 255, 255, 0.18)',
    background: isActive
      ? 'radial-gradient(circle, var(--app-focus), var(--app-positive-soft) 48%, rgba(0, 0, 0, 0) 72%)'
      : 'radial-gradient(circle, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.04) 55%, rgba(0, 0, 0, 0) 74%)',
    boxShadow: isActive
      ? '0 0 48px var(--app-glow), inset 0 0 32px rgba(255, 255, 255, 0.08)'
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
    missionConversations,
    runs,
    createTask,
    updateTaskStatus,
    updateTaskAction,
    createRun,
    updateRun,
    addMissionMessage,
    createMissionConversation,
    updateMissionConversation,
    archiveMissionConversation,
    createMissionDraft,
    updateMissionDraft
  } = useCommanderTasksContext();
  const { createTerminal, closeTerminal, setActiveTerminal, terminals, activeTerminalId } = useTerminalContext();
  const [input, setInput] = React.useState('');
  const [editingDraftId, setEditingDraftId] = React.useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = React.useState<HyperliquidAgentRuntimeStatus | null>(null);
  const [claudeAvailable, setClaudeAvailable] = React.useState(false);
  const [activeConversationByWorkspace, setActiveConversationByWorkspace] = React.useState<Record<string, string>>(() => loadActiveConversationMap());
  const buildDraftRef = React.useRef<(goal: string) => void>(() => undefined);

  const workspace = React.useMemo(
    () => workspaces.find((item) => item.id === workspaceId) || activeWorkspace || null,
    [activeWorkspace, workspaceId, workspaces]
  );

  const workspaceAgents = React.useMemo(
    () => agents.filter((agent) => agent.workspaceId === workspace?.id),
    [agents, workspace?.id]
  );

  const workspaceConversations = React.useMemo(
    () => missionConversations
      .filter((conversation) => conversation.workspaceId === workspace?.id)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [missionConversations, workspace?.id]
  );

  const activeConversations = React.useMemo(
    () => workspaceConversations.filter((conversation) => conversation.status === 'active'),
    [workspaceConversations]
  );

  const archivedConversations = React.useMemo(
    () => workspaceConversations.filter((conversation) => conversation.status === 'archived'),
    [workspaceConversations]
  );

  const activeConversation = React.useMemo(() => {
    const activeConversationId = workspace?.id ? activeConversationByWorkspace[workspace.id] : undefined;
    const selectedConversation = workspaceConversations.find((conversation) => conversation.id === activeConversationId);
    return selectedConversation?.status === 'active' ? selectedConversation : activeConversations[0] || null;
  }, [activeConversationByWorkspace, activeConversations, workspace?.id, workspaceConversations]);

  React.useEffect(() => {
    window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, JSON.stringify(activeConversationByWorkspace));
  }, [activeConversationByWorkspace]);

  React.useEffect(() => {
    if (!workspace) {
      return;
    }

    if (activeConversation && activeConversation.workspaceId === workspace.id) {
      if (activeConversationByWorkspace[workspace.id] !== activeConversation.id) {
        setActiveConversationByWorkspace((current) => ({ ...current, [workspace.id]: activeConversation.id }));
      }
      return;
    }

    const conversation = createMissionConversation({ workspaceId: workspace.id, title: 'New chat' });
    setActiveConversationByWorkspace((current) => ({ ...current, [workspace.id]: conversation.id }));
  }, [activeConversation, activeConversationByWorkspace, createMissionConversation, workspace]);

  const selectConversation = React.useCallback((conversationId: string) => {
    if (!workspace) {
      return;
    }
    setActiveConversationByWorkspace((current) => ({ ...current, [workspace.id]: conversationId }));
  }, [workspace]);

  const createConversation = React.useCallback(() => {
    if (!workspace) {
      return;
    }
    const conversation = createMissionConversation({ workspaceId: workspace.id, title: 'New chat' });
    selectConversation(conversation.id);
    setEditingDraftId(null);
    setInput('');
  }, [createMissionConversation, selectConversation, workspace]);

  const archiveActiveConversation = React.useCallback(() => {
    if (!workspace || !activeConversation) {
      return;
    }
    archiveMissionConversation(activeConversation.id);
    const nextConversation = activeConversations.find((conversation) => conversation.id !== activeConversation.id);
    if (nextConversation) {
      selectConversation(nextConversation.id);
      return;
    }
    const conversation = createMissionConversation({ workspaceId: workspace.id, title: 'New chat' });
    selectConversation(conversation.id);
  }, [activeConversation, activeConversations, archiveMissionConversation, createMissionConversation, selectConversation, workspace]);

  const restoreConversation = React.useCallback((conversationId: string) => {
    if (!conversationId || !workspace) {
      return;
    }
    updateMissionConversation(conversationId, { status: 'active' });
    selectConversation(conversationId);
  }, [selectConversation, updateMissionConversation, workspace]);

  const scopedMessages = React.useMemo(
    () => missionMessages
      .filter((message) => message.workspaceId === workspace?.id)
      .filter((message) => message.conversationId === activeConversation?.id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-80),
    [activeConversation?.id, missionMessages, workspace?.id]
  );

  const scopedDrafts = React.useMemo(
    () => missionDrafts
      .filter((draft) => draft.workspaceId === workspace?.id)
      .filter((draft) => draft.conversationId === activeConversation?.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8),
    [activeConversation?.id, missionDrafts, workspace?.id]
  );

  const activeDrafts = React.useMemo(
    () => scopedDrafts.filter((draft) => draft.approvalStatus !== 'completed' && draft.approvalStatus !== 'cancelled'),
    [scopedDrafts]
  );

  const runById = React.useMemo(
    () => new Map<string, TaskRun>(runs.map((run) => [run.id, run])),
    [runs]
  );

  const conversationRuns = React.useMemo(() => {
    const runIds = new Set(scopedDrafts.map((draft) => draft.runId).filter((runId): runId is string => Boolean(runId)));
    return runs
      .filter((run) => run.workspaceId === workspace?.id && runIds.has(run.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
  }, [runs, scopedDrafts, workspace?.id]);

  const timelineDrafts = React.useMemo(
    () => [...scopedDrafts].sort((a, b) => a.createdAt - b.createdAt),
    [scopedDrafts]
  );

  const scopedRuns = React.useMemo(
    () => runs
      .filter((run) => run.workspaceId === workspace?.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6),
    [runs, workspace?.id]
  );

  const activeTerminal = React.useMemo(
    () => terminals.find((terminal) => terminal.id === activeTerminalId) || null,
    [activeTerminalId, terminals]
  );

  const focusTerminalForDraft = React.useCallback((draft: MissionDraft) => {
    const run = draft.runId ? runById.get(draft.runId) : null;
    const terminalId = draft.terminalIds?.[0] || run?.terminalIds[0];
    if (!terminalId) {
      return;
    }
    setActiveTerminal(terminalId);
    if (workspace) {
      publishWorkspaceDockMode('code', workspace.id);
    }
  }, [runById, setActiveTerminal, workspace]);

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

  const ensureActiveConversation = React.useCallback((): MissionConversation | null => {
    if (!workspace) {
      return null;
    }

    if (activeConversation?.workspaceId === workspace.id && activeConversation.status === 'active') {
      return activeConversation;
    }

    const fallbackConversation = activeConversations[0];
    if (fallbackConversation) {
      selectConversation(fallbackConversation.id);
      return fallbackConversation;
    }

    const conversation = createMissionConversation({ workspaceId: workspace.id, title: 'New chat' });
    selectConversation(conversation.id);
    return conversation;
  }, [activeConversation, activeConversations, createMissionConversation, selectConversation, workspace]);

  const buildDraft = React.useCallback((goal: string) => {
    if (!workspace) {
      return;
    }

    const conversation = ensureActiveConversation();
    if (!conversation) {
      return;
    }

    const draftInput = buildMissionDraftInput({
      workspaceId: workspace.id,
      conversationId: conversation.id,
      goal,
      runtimeStatus,
      claudeAvailable
    });

    addMissionMessage({
      workspaceId: workspace.id,
      conversationId: conversation.id,
      role: 'user',
      content: goal
    });

    if (isAutomaticConversationTitle(conversation.title)) {
      updateMissionConversation(conversation.id, { title: buildConversationTitle(goal) });
    }

    const draft = createMissionDraft(draftInput);

    addMissionMessage({
      workspaceId: workspace.id,
      conversationId: conversation.id,
      draftId: draft.id,
      role: 'assistant',
      content: `Ready. I made a draft for "${draftInput.title}". Review it, then Run in Code.`
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
  }, [
    addMissionMessage,
    claudeAvailable,
    createMissionDraft,
    ensureActiveConversation,
    runtimeStatus,
    updateMissionConversation,
    updateMissionDraft,
    workspace
  ]);

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
      const conversation = ensureActiveConversation();
      addMissionMessage({
        workspaceId: workspace.id,
        conversationId: conversation?.id,
        role: 'assistant',
        content: `Gemini proposed "${proposal.title}". It is waiting for approval.`
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
      if (!workspace) {
        return;
      }
      const editingDraft = missionDrafts.find((draft) => draft.id === editingDraftId);
      const conversation = editingDraft?.conversationId
        ? workspaceConversations.find((item) => item.id === editingDraft.conversationId) || ensureActiveConversation()
        : ensureActiveConversation();
      if (!conversation) {
        return;
      }
      const draftInput = buildMissionDraftInput({
        workspaceId: workspace.id,
        conversationId: conversation.id,
        goal,
        runtimeStatus,
        claudeAvailable
      });
      updateMissionDraft(editingDraftId, {
        ...draftInput,
        approvalStatus: 'awaiting-approval'
      });
      addMissionMessage({
        workspaceId: workspace.id,
        conversationId: conversation.id,
        draftId: editingDraftId,
        role: 'assistant',
        content: `Updated. "${draftInput.title}" is ready to run after approval.`
      });
      setEditingDraftId(null);
      setInput('');
      return;
    }

    buildDraft(goal);
  }, [
    addMissionMessage,
    buildDraft,
    claudeAvailable,
    editingDraftId,
    ensureActiveConversation,
    input,
    missionDrafts,
    runtimeStatus,
    updateMissionDraft,
    workspace,
    workspaceConversations
  ]);

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
        conversationId: draft.conversationId,
        draftId: draft.id,
        role: 'system',
        content: `Preflight failed: ${err instanceof Error ? err.message : 'unknown error'}. Review before running.`
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
        conversationId: draft.conversationId,
        taskId: launchResult.task.id,
        draftId: draft.id,
        role: 'system',
        content: `Mission launch failed: ${launchResult.error}`
      });
      return;
    }

    publishWorkspaceDockMode('code', workspace.id);

    updateMissionDraft(draft.id, {
      taskId: launchResult.task.id,
      runId: launchResult.run.id,
      terminalIds: launchResult.run.terminalIds,
      approvalStatus: 'running',
      approvedAt: Date.now()
    });
    addMissionMessage({
      workspaceId: workspace.id,
      conversationId: draft.conversationId,
      taskId: launchResult.task.id,
      draftId: draft.id,
      role: 'system',
      content: `Approved. Opening Code for "${draft.title}".`
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
        conversationId: draft.conversationId,
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
        const conversation = ensureActiveConversation();
        addMissionMessage({
          workspaceId: workspace.id,
          conversationId: conversation?.id,
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

    const conversation = ensureActiveConversation();
    const terminalId = createTerminal(
      workspace.path,
      workspace.shell,
      proposal.title || 'Gemini terminal proposal',
      execute ? trimmed : undefined,
      { workspaceId: workspace.id, terminalPurpose: 'gemini-orchestrator' }
    );
    setActiveTerminal(terminalId);
    if (!execute) {
      window.setTimeout(() => {
        window.electronAPI.terminal.write(terminalId, trimmed);
      }, 500);
    }
    addMissionMessage({
      workspaceId: workspace.id,
      conversationId: conversation?.id,
      role: 'system',
      content: execute
        ? `Approved terminal command launched in a new terminal: ${trimmed}`
        : 'Approved terminal text sent to a new terminal.'
    });
    return true;
  }, [activeTerminal, addMissionMessage, createTerminal, ensureActiveConversation, setActiveTerminal, workspace]);

  const runApprovedBackendAction = React.useCallback(async (proposal: GeminiLiveProposal) => {
    if (!workspace) {
      setInput(proposal.goal || proposal.title);
      return false;
    }

    const action = GEMINI_BACKEND_ACTIONS.find((item) => item.actionKey === proposal.actionKey);
    if (!action) {
      const conversation = ensureActiveConversation();
      addMissionMessage({
        workspaceId: workspace.id,
        conversationId: conversation?.id,
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
    const conversation = ensureActiveConversation();

    updateTaskStatus(task.id, 'running');
    if (actionRecord) {
      updateTaskAction(task.id, actionRecord.id, {
        status: 'running',
        summary: `Running ${action.label} from approved Gemini proposal...`
      });
    }
    addMissionMessage({
      workspaceId: workspace.id,
      conversationId: conversation?.id,
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
        conversationId: conversation?.id,
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
        conversationId: conversation?.id,
        taskId: task.id,
        role: 'system',
        content: `${action.label} failed: ${message}`
      });
      return false;
    }
  }, [addMissionMessage, createTask, ensureActiveConversation, updateTaskAction, updateTaskStatus, workspace]);

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
          const conversation = ensureActiveConversation();
          addMissionMessage({
            workspaceId: workspace.id,
            conversationId: conversation?.id,
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
    ensureActiveConversation,
    runApprovedBackendAction,
    sendApprovedTerminalText,
    workspace
  ]);

  return (
    <div style={{ ...shellStyle, ...(isDock ? dockShellStyle : null) }}>
      {isDock ? (
        <div style={{ ...headerStyle, ...dockHeaderStyle }}>
          <div>
            <div style={eyebrowStyle}>Voice Source</div>
            <h2 style={{ ...titleStyle, ...dockTitleStyle }}>Gemini Live desk</h2>
            <p style={copyStyle}>Tap to talk with Gemini Live. Approve only when it proposes an action.</p>
          </div>
          <div style={{ ...statusStripStyle, ...dockStatusStripStyle }}>
            <div style={statusPillStyle}>Actions need approval</div>
            <div style={statusPillStyle}>{runtimeStatus?.codexAuthenticated ? 'Codex connected' : 'Codex pending'}</div>
            <div style={statusPillStyle}>{claudeAvailable ? 'Claude available' : 'Claude optional'}</div>
            <div style={statusPillStyle}>{voiceDiagnostics.model || 'Gemini Live'}</div>
          </div>
        </div>
      ) : (
        <div style={conversationBarStyle}>
          <div style={conversationRailStyle}>
            {activeConversations.slice(0, 6).map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => selectConversation(conversation.id)}
                title={conversation.title}
                style={{
                  ...conversationPillStyle,
                  ...(conversation.id === activeConversation?.id ? activeConversationPillStyle : null)
                }}
              >
                <span style={conversationTitleStyle}>{conversation.title}</span>
                <span style={conversationTimeStyle}>{formatTime(conversation.updatedAt)}</span>
              </button>
            ))}
            {activeConversations.length === 0 ? (
              <div style={conversationEmptyStyle}>No active chats</div>
            ) : null}
          </div>
          <div style={conversationActionRailStyle}>
            {archivedConversations.length > 0 ? (
              <select
                value=""
                aria-label="Restore archived conversation"
                onChange={(event) => {
                  restoreConversation(event.target.value);
                  event.currentTarget.value = '';
                }}
                style={archiveSelectStyle}
              >
                <option value="">History</option>
                {archivedConversations.slice(0, 12).map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
                ))}
              </select>
            ) : null}
            <button type="button" onClick={createConversation} style={conversationIconButtonStyle} title="New conversation">
              <Plus size={15} />
              New
            </button>
            <button
              type="button"
              onClick={archiveActiveConversation}
              disabled={!activeConversation}
              style={conversationIconButtonStyle}
              title="Archive conversation"
            >
              <Archive size={15} />
              Close
            </button>
          </div>
        </div>
      )}

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
            {scopedMessages.length === 0 && timelineDrafts.length === 0 ? (
              <div style={{ ...emptyStateStyle, ...(isDock ? dockEmptyStateStyle : null) }}>
                <Bot size={24} />
                <div>{isDock ? 'Tap Talk and speak with Gemini Live. Proposals will wait for approval.' : 'Ask for work in this workspace. I will keep it as chat first, then make a draft you can run in Code.'}</div>
              </div>
            ) : (
              <>
                {scopedMessages.map((message) => (
                  <div
                    key={message.id}
                    style={{
                      ...messageStyle,
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      background: message.role === 'user' ? 'var(--app-accent-soft)' : 'var(--app-panel)',
                      borderColor: message.role === 'user' ? 'var(--app-border-strong)' : 'var(--app-border)'
                    }}
                  >
                    <div style={messageMetaStyle}>
                      {message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Codex' : 'System'} • {formatTime(message.createdAt)}
                    </div>
                    <div style={messageContentStyle}>{message.content}</div>
                  </div>
                ))}
                {!isDock ? timelineDrafts.map((draft) => {
                  const tone = getDraftTone(draft.approvalStatus);
                  const provider = getProviderMeta(draft.missionPacket?.frontierRuntime || 'codex');
                  const draftRun = draft.runId ? runById.get(draft.runId) : null;
                  const terminalId = draft.terminalIds?.[0] || draftRun?.terminalIds[0];
                  return (
                    <div key={`draft-${draft.id}`} style={chatDraftCardStyle}>
                      <div style={chatDraftTopStyle}>
                        <div>
                          <div style={chatDraftLabelStyle}>Draft</div>
                          <div style={chatDraftTitleStyle}>{draft.title}</div>
                        </div>
                        <span style={{ ...draftStatusStyle, background: tone.background, color: tone.color }}>{tone.label}</span>
                      </div>
                      <div style={chatDraftGoalStyle}>{draft.goal}</div>
                      <div style={chatDraftMetaStyle}>
                        {provider.label} • {MISSION_MODE_CONFIG[draft.mode as MissionMode]?.label || draft.mode}
                        {draftRun ? ` • run ${draftRun.status}` : ''}
                      </div>
                      <div style={draftActionsStyle}>
                        <button
                          type="button"
                          onClick={() => void approveDraft(draft)}
                          disabled={draft.approvalStatus === 'running' || draft.approvalStatus === 'completed'}
                          style={approveButtonStyle}
                        >
                          <Check size={14} />
                          Run in Code
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
                        {terminalId ? (
                          <button type="button" onClick={() => focusTerminalForDraft(draft)} style={draftGhostButtonStyle}>
                            <TerminalSquare size={14} />
                            Code
                          </button>
                        ) : null}
                        <button type="button" onClick={() => cancelDraft(draft)} style={stopButtonStyle}>
                          <Square size={13} />
                          Stop
                        </button>
                      </div>
                    </div>
                  );
                }) : null}
              </>
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
              placeholder={isDock ? 'Voice transcript or quick mission...' : 'Message Codex in this workspace...'}
              rows={isDock ? 3 : 3}
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
                    background: voiceStatus === 'listening' ? 'var(--app-negative-soft)' : 'var(--app-accent-soft)',
                    color: voiceStatus === 'listening' ? 'var(--app-negative)' : 'var(--app-accent)'
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
                {editingDraftId ? 'Update Draft' : 'Send'}
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
                      border: '1px solid var(--app-border-strong)',
                      background: 'var(--app-accent-soft)',
                      display: 'grid',
                      gap: '8px'
                    }}
                  >
                    <div style={{ color: 'var(--app-accent)', fontSize: '12px', fontWeight: 800 }}>
                      Pending approval: {proposal.title}
                    </div>
                    <div style={{ color: 'var(--app-muted)', fontSize: '11px', lineHeight: 1.45 }}>
                      {getProposalDetail(proposal)}
                    </div>
                    {proposal.reason ? (
                      <div style={{ color: 'var(--app-text)', fontSize: '11px', lineHeight: 1.45 }}>
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
            {isDock ? (
              <div style={hintStyle}>
                Live diag: {voiceStatus} | sent {voiceDiagnostics.sentAudioChunks} | recv {voiceDiagnostics.receivedAudioChunks}
                {voiceDiagnostics.fallbackUsed ? ' | fallback model' : ''}
              </div>
            ) : null}
          </div>
        </section>

        {isDock ? (
          <aside style={{ ...draftPanelStyle, ...dockDraftPanelStyle }}>
            <div style={panelHeaderStyle}>
              <div>
                <div style={panelLabelStyle}>Active</div>
                <div style={panelCopyStyle}>Drafts wait here. Terminals live in Code.</div>
              </div>
            </div>

            <div style={{ ...draftListStyle, ...dockDraftListStyle }}>
              {activeDrafts.length === 0 && conversationRuns.length === 0 ? (
                <div style={emptyDraftStyle}>No active drafts in this chat.</div>
              ) : null}

              {activeDrafts.slice(0, 4).map((draft) => {
                const tone = getDraftTone(draft.approvalStatus);
                const provider = getProviderMeta(draft.missionPacket?.frontierRuntime || 'codex');
                const draftRun = draft.runId ? runById.get(draft.runId) : null;
                const terminalId = draft.terminalIds?.[0] || draftRun?.terminalIds[0];
                return (
                  <div key={draft.id} style={compactDraftCardStyle}>
                    <div style={compactDraftHeaderStyle}>
                      <div>
                        <div style={draftTitleStyle}>{draft.title}</div>
                        <div style={draftModeStyle}>{provider.label} • {MISSION_MODE_CONFIG[draft.mode as MissionMode]?.label || draft.mode}</div>
                      </div>
                      <span style={{ ...draftStatusStyle, background: tone.background, color: tone.color }}>{tone.label}</span>
                    </div>
                    <div style={compactDraftGoalStyle}>{draft.goal}</div>
                    <div style={draftActionsStyle}>
                      <button
                        type="button"
                        onClick={() => void approveDraft(draft)}
                        disabled={draft.approvalStatus === 'running' || draft.approvalStatus === 'completed'}
                        style={approveButtonStyle}
                      >
                        <Check size={14} />
                        Run in Code
                      </button>
                      {terminalId ? (
                        <button type="button" onClick={() => focusTerminalForDraft(draft)} style={draftGhostButtonStyle}>
                          <TerminalSquare size={14} />
                          Code
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {conversationRuns.length > 0 ? (
                <div style={runHistoryGroupStyle}>
                  <div style={miniLabelStyle}>Recent runs</div>
                  {conversationRuns.map((run) => {
                    const terminalId = run.terminalIds[0];
                    return (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => {
                          if (terminalId) {
                            setActiveTerminal(terminalId);
                            if (workspace) {
                              publishWorkspaceDockMode('code', workspace.id);
                            }
                          }
                        }}
                        disabled={!terminalId}
                        style={runHistoryButtonStyle}
                      >
                        <span style={runHistoryTitleStyle}>{run.summary}</span>
                        <span style={runHistoryMetaStyle}>{run.status} • {run.runtimeProvider}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
};

const shellStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--app-bg)',
  color: 'var(--app-text)',
  overflow: 'hidden'
};

const dockShellStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
  borderLeft: '1px solid var(--app-border)'
};

const headerStyle: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '16px 18px 12px',
  borderBottom: '1px solid var(--app-border)',
  flexWrap: 'wrap'
};

const dockHeaderStyle: React.CSSProperties = {
  padding: '16px 14px 12px',
  gap: '10px'
};

const eyebrowStyle: React.CSSProperties = {
  color: 'var(--app-accent)',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.14em'
};

const titleStyle: React.CSSProperties = {
  margin: '6px 0 3px',
  color: 'var(--app-text)',
  fontSize: '21px',
  fontWeight: 850,
  letterSpacing: 0
};

const dockTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  lineHeight: 1.2
};

const copyStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--app-muted)',
  fontSize: '12px',
  lineHeight: 1.45
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
  padding: '6px 8px',
  borderRadius: '7px',
  background: 'var(--app-panel-muted)',
  border: '1px solid var(--app-border)',
  color: 'var(--app-muted)',
  fontSize: '10px',
  fontWeight: 800,
  textTransform: 'uppercase'
};

const conversationBarStyle: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '10px',
  alignItems: 'center',
  padding: '10px 12px',
  borderBottom: '1px solid var(--app-border)',
  background: 'var(--app-surface)'
};

const conversationRailStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  gap: '8px',
  overflowX: 'auto',
  paddingBottom: '2px'
};

const conversationPillStyle: React.CSSProperties = {
  flex: '0 0 auto',
  maxWidth: '220px',
  minWidth: '124px',
  display: 'grid',
  gap: '3px',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel)',
  color: 'var(--app-muted)',
  cursor: 'pointer',
  textAlign: 'left'
};

const activeConversationPillStyle: React.CSSProperties = {
  borderColor: 'var(--app-border-strong)',
  background: 'var(--app-accent-soft)',
  color: 'var(--app-text)'
};

const conversationTitleStyle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '12px',
  fontWeight: 850
};

const conversationTimeStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 700
};

const conversationEmptyStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '12px',
  padding: '9px 2px'
};

const conversationActionRailStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center'
};

const conversationIconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel)',
  color: 'var(--app-text)',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 800
};

const archiveSelectStyle: React.CSSProperties = {
  height: '34px',
  maxWidth: '128px',
  borderRadius: '8px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel)',
  color: 'var(--app-muted)',
  padding: '0 8px',
  fontSize: '12px',
  fontWeight: 800,
  outline: 'none'
};

const mainGridStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '12px',
  padding: '12px',
  overflow: 'hidden'
};

const dockMainGridStyle: React.CSSProperties = {
  gridTemplateColumns: '1fr',
  gap: '10px',
  padding: '10px',
  overflow: 'auto',
  minHeight: 0
};

const chatPanelStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: '1fr auto',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel)',
  borderRadius: '8px',
  overflow: 'hidden'
};

const dockChatPanelStyle: React.CSSProperties = {
  minHeight: '560px'
};

const messageListStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '16px',
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
  color: 'var(--app-muted)',
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
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 800,
  textTransform: 'uppercase',
  marginBottom: '6px'
};

const messageContentStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  color: 'var(--app-text)',
  fontSize: '13px',
  lineHeight: 1.5
};

const chatDraftCardStyle: React.CSSProperties = {
  width: 'min(680px, 92%)',
  alignSelf: 'flex-start',
  display: 'grid',
  gap: '10px',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid var(--app-border-strong)',
  background: 'var(--app-surface)'
};

const chatDraftTopStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'flex-start'
};

const chatDraftLabelStyle: React.CSSProperties = {
  color: 'var(--app-accent)',
  fontSize: '10px',
  fontWeight: 900,
  textTransform: 'uppercase'
};

const chatDraftTitleStyle: React.CSSProperties = {
  color: 'var(--app-text)',
  fontSize: '13px',
  fontWeight: 850,
  lineHeight: 1.35,
  marginTop: '3px'
};

const chatDraftGoalStyle: React.CSSProperties = {
  color: 'var(--app-muted)',
  fontSize: '12px',
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap'
};

const chatDraftMetaStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '11px',
  fontWeight: 750
};

const composerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--app-border)',
  padding: '10px',
  display: 'grid',
  gap: '10px',
  background: 'var(--app-surface)'
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
  minHeight: '78px',
  borderRadius: '8px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel)',
  color: 'var(--app-text)',
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
  border: '1px solid var(--app-border)',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 800
};

const ghostButtonStyle: React.CSSProperties = {
  padding: '9px 11px',
  borderRadius: '8px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-muted)',
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
  border: '1px solid var(--app-border-strong)',
  background: 'var(--app-accent-soft)',
  color: 'var(--app-accent)',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 800
};

const errorStyle: React.CSSProperties = {
  color: '#fca5a5',
  fontSize: '11px'
};

const hintStyle: React.CSSProperties = {
  color: 'var(--app-muted)',
  fontSize: '11px'
};

const draftPanelStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  gap: '10px',
  overflow: 'hidden'
};

const dockDraftPanelStyle: React.CSSProperties = {
  minHeight: 'unset',
  gap: '10px'
};

const panelHeaderStyle: React.CSSProperties = {
  padding: '12px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel)',
  borderRadius: '8px'
};

const panelLabelStyle: React.CSSProperties = {
  color: 'var(--app-text)',
  fontSize: '14px',
  fontWeight: 800
};

const panelCopyStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '12px',
  marginTop: '4px'
};

const draftListStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  alignContent: 'start',
  gap: '10px',
  overflow: 'auto'
};

const dockDraftListStyle: React.CSSProperties = {
  maxHeight: '42vh'
};

const emptyDraftStyle: React.CSSProperties = {
  padding: '18px',
  borderRadius: '8px',
  border: '1px dashed var(--app-border)',
  color: 'var(--app-subtle)',
  fontSize: '12px'
};

const compactDraftCardStyle: React.CSSProperties = {
  display: 'grid',
  gap: '10px',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel)'
};

const compactDraftHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  alignItems: 'flex-start'
};

const draftTitleStyle: React.CSSProperties = {
  color: 'var(--app-text)',
  fontSize: '13px',
  fontWeight: 800,
  lineHeight: 1.35
};

const draftModeStyle: React.CSSProperties = {
  color: 'var(--app-accent)',
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

const compactDraftGoalStyle: React.CSSProperties = {
  color: 'var(--app-muted)',
  fontSize: '12px',
  lineHeight: 1.45,
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
};

const miniLabelStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 800,
  textTransform: 'uppercase'
};

const runHistoryGroupStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
  paddingTop: '4px'
};

const runHistoryButtonStyle: React.CSSProperties = {
  display: 'grid',
  gap: '4px',
  width: '100%',
  padding: '9px',
  borderRadius: '8px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-text)',
  textAlign: 'left',
  cursor: 'pointer'
};

const runHistoryTitleStyle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '11px',
  fontWeight: 800
};

const runHistoryMetaStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 750,
  textTransform: 'uppercase'
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
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-muted)',
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
