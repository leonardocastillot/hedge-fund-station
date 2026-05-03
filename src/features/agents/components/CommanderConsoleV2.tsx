import React from 'react';
import { useAgentProfilesContext } from '@/contexts/AgentProfilesContext';
import { useCommanderTasksContext } from '@/contexts/CommanderTasksContext';
import { useTerminalContext } from '@/contexts/TerminalContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useGeminiLiveVoice } from '@/hooks/useGeminiLiveVoice';
import type { AgentLoopRunSnapshot, ObsidianRelevantNote } from '@/types/electron';
import type { AgentProfile } from '@/types/agents';
import type { CommanderTask, MissionDecision, MissionDepth, MissionReviewConfidence } from '@/types/tasks';
import { getDefaultProviderForRole, getProviderMeta, inferRequestedProvider } from '@/utils/agentRuntime';
import {
  buildGuidedMissionInput,
  buildMissionMetadata,
  formatRoleLabel,
  inferAgentRoles,
  inferMissionMode,
  inferRolesFromMemory,
  MISSION_MODE_CONFIG,
  type MissionMode
} from '@/utils/missionControl';
import { launchAgentRun } from '@/utils/agentOrchestration';
import { runMissionAction } from '@/utils/missionActions';
import { LaunchSignalStrip } from './LaunchSignalStrip';

export const CommanderConsoleV2: React.FC<{ workspaceId?: string | null }> = ({ workspaceId }) => {
  const { agents, ensureWorkspaceAgents } = useAgentProfilesContext();
  const { createTask, updateTask, updateTaskAction, updateTaskReview, updateTaskStageReview, updateTaskStatus, createRun, updateRun, runs, tasks } = useCommanderTasksContext();
  const { createTerminal, terminals } = useTerminalContext();
  const { activeWorkspace, workspaces } = useWorkspaceContext();
  const [goal, setGoal] = React.useState('');
  const [missionMode, setMissionMode] = React.useState<MissionMode>('market-scan');
  const [missionDepth, setMissionDepth] = React.useState<MissionDepth>('focused');
  const [memoryNotes, setMemoryNotes] = React.useState<ObsidianRelevantNote[]>([]);
  const [pinnedNotes, setPinnedNotes] = React.useState<ObsidianRelevantNote[]>([]);
  const [isMemoryLoading, setIsMemoryLoading] = React.useState(false);
  const [reviewSummary, setReviewSummary] = React.useState('');
  const [reviewNextAction, setReviewNextAction] = React.useState('');
  const [reviewDecision, setReviewDecision] = React.useState<MissionDecision>('pending');
  const [reviewConfidence, setReviewConfidence] = React.useState<MissionReviewConfidence>('medium');
  const [isRunningRecommendedOps, setIsRunningRecommendedOps] = React.useState(false);
  const [runtimeMode, setRuntimeMode] = React.useState<'direct-loop' | 'terminal'>('direct-loop');
  const [loopMaxIterations, setLoopMaxIterations] = React.useState(3);
  const [directLoopReady, setDirectLoopReady] = React.useState(false);
  const pointerRecordingRef = React.useRef(false);

  const workspace = React.useMemo(
    () => workspaces.find((item) => item.id === workspaceId) || activeWorkspace || null,
    [activeWorkspace, workspaceId, workspaces]
  );

  const workspaceAgents = React.useMemo(
    () => agents.filter((agent) => agent.workspaceId === workspace?.id),
    [agents, workspace?.id]
  );

  React.useEffect(() => {
    if (!workspace) {
      setPinnedNotes([]);
      return;
    }

    if (typeof window.electronAPI?.obsidian?.listPinned !== 'function') {
      setPinnedNotes([]);
      return;
    }

    window.electronAPI.obsidian
      .listPinned(workspace.path, workspace.obsidian_vault_path, workspace.id, workspace.name, 4)
      .then((notes) => setPinnedNotes(notes))
      .catch(() => setPinnedNotes([]));
  }, [workspace]);

  React.useEffect(() => {
    if (!window.electronAPI?.voice?.getLiveStatus) {
      setDirectLoopReady(false);
      return;
    }

    window.electronAPI.voice.getLiveStatus()
      .then((status) => setDirectLoopReady(status.isConfigured))
      .catch(() => setDirectLoopReady(false));
  }, []);

  React.useEffect(() => {
    if (!workspace || !goal.trim()) {
      setMemoryNotes([]);
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsMemoryLoading(true);
      if (!window.electronAPI?.obsidian?.searchRelevant) {
        setMemoryNotes([]);
        setIsMemoryLoading(false);
        return;
      }

      window.electronAPI.obsidian
        .searchRelevant(workspace.path, goal.trim(), workspace.obsidian_vault_path, 4)
        .then((notes) => setMemoryNotes(notes))
        .catch(() => setMemoryNotes([]))
        .finally(() => setIsMemoryLoading(false));
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [goal, workspace]);

  React.useEffect(() => {
    if (!goal.trim()) {
      return;
    }

    setMissionMode(inferMissionMode(goal));
  }, [goal]);

  const missionConfig = MISSION_MODE_CONFIG[missionMode];

  const suggestedRoles = React.useMemo(() => {
    const fromGoal = inferAgentRoles(goal);
    const fromMemory = inferRolesFromMemory([...pinnedNotes, ...memoryNotes]);
    return Array.from(new Set([...missionConfig.routeRoles, ...fromGoal, ...fromMemory]));
  }, [goal, memoryNotes, missionConfig.routeRoles, pinnedNotes]);

  const suggestedAgents = React.useMemo(() => {
    const routeRoles = missionDepth === 'focused'
      ? missionConfig.routeRoles.slice(0, 1)
      : missionConfig.routeRoles.slice(0, Math.min(3, missionConfig.routeRoles.length));
    const orderedAgents: AgentProfile[] = [];

    routeRoles.forEach((role) => {
      const match = workspaceAgents.find((agent) => agent.role === role);
      if (match && !orderedAgents.some((agent) => agent.id === match.id)) {
        orderedAgents.push(match);
      }
    });

    if (orderedAgents.length === 0) {
      workspaceAgents
        .filter((agent) => suggestedRoles.includes(agent.role))
        .slice(0, missionDepth === 'focused' ? 1 : 3)
        .forEach((agent) => {
          if (!orderedAgents.some((item) => item.id === agent.id)) {
            orderedAgents.push(agent);
          }
        });
    }

    return orderedAgents;
  }, [missionConfig.routeRoles, missionDepth, suggestedRoles, workspaceAgents]);

  const scopedRuns = React.useMemo(
    () => runs.filter((run) => run.workspaceId === workspace?.id).slice(0, 5),
    [runs, workspace?.id]
  );

  const scopedTasks = React.useMemo(
    () => tasks.filter((task) => task.workspaceId === workspace?.id).slice(0, 5),
    [tasks, workspace?.id]
  );
  const latestTask = scopedTasks[0] || null;
  const latestTaskRuns = React.useMemo(
    () => latestTask ? runs.filter((run) => run.taskId === latestTask.id) : [],
    [latestTask, runs]
  );

  const missionMetadata = React.useMemo(
    () => buildMissionMetadata({
      goal,
      missionMode,
      missionDepth,
      pinnedNotes,
      memoryNotes
    }),
    [goal, memoryNotes, missionDepth, missionMode, pinnedNotes]
  );
  const requestedProvider = React.useMemo(() => inferRequestedProvider(goal), [goal]);
  const effectiveProvider = requestedProvider ?? 'codex';
  const effectiveProviderMeta = React.useMemo(() => getProviderMeta(effectiveProvider), [effectiveProvider]);

  const applyLoopSnapshotToTask = React.useCallback((taskId: string, runId: string, snapshot: AgentLoopRunSnapshot) => {
    const nextStatus = snapshot.status === 'completed'
      ? 'completed'
      : snapshot.status === 'failed' || snapshot.status === 'cancelled'
        ? 'failed'
        : 'running';
    const nextDecision = (
      snapshot.decision === 'reject'
      || snapshot.decision === 'needs-more-data'
      || snapshot.decision === 'ready-for-backtest'
      || snapshot.decision === 'ready-for-paper'
      || snapshot.decision === 'ready-for-build'
    )
      ? snapshot.decision
      : 'pending';

    updateRun(runId, {
      status: nextStatus,
      launchState: snapshot.status === 'running' ? 'verifying' : snapshot.status === 'completed' ? 'ready' : 'attention',
      summary: snapshot.summary,
      outputExcerpt: [
        snapshot.summary,
        snapshot.verificationSummary ? `Verification: ${snapshot.verificationSummary}` : '',
        snapshot.blockers.length > 0 ? `Blockers: ${snapshot.blockers.join(' | ')}` : '',
        snapshot.suggestedOps.length > 0 ? `Suggested ops: ${snapshot.suggestedOps.join(' | ')}` : ''
      ].filter(Boolean).join('\n'),
      outputCapturedAt: snapshot.updatedAt,
      loopIteration: snapshot.iteration,
      loopMaxIterations: snapshot.maxIterations,
      verificationSummary: snapshot.verificationSummary,
      endedAt: snapshot.endedAt
    });

    updateTaskStatus(taskId, nextStatus);
    updateTaskReview(taskId, {
      decision: nextDecision,
      confidence: snapshot.confidence,
      summary: snapshot.summary,
      nextAction: snapshot.nextAction
    });

    snapshot.stageUpdates.forEach((stage) => {
      updateTaskStageReview(taskId, stage.stageIndex, {
        status: stage.status,
        summary: stage.summary,
        artifact: stage.artifact
      });
    });
  }, [updateRun, updateTaskReview, updateTaskStageReview, updateTaskStatus]);

  const startDirectLoopTask = React.useCallback(async (task: CommanderTask) => {
    if (!workspace) {
      return;
    }

    const snapshot = await window.electronAPI.agentLoop.startMission({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      goal: task.goal,
      briefing: task.mission?.briefing || buildGuidedMissionInput(missionMode),
      completionGate: task.mission?.completionGate || [],
      guardrails: task.mission?.guardrails || [],
      deliverables: task.mission?.deliverables || [],
      workflow: (task.mission?.workflow || []).map((step, index) => ({
        stageIndex: index,
        role: step.role,
        label: step.label,
        objective: step.objective,
        output: step.output
      })),
      notes: [...pinnedNotes, ...memoryNotes].slice(0, 6).map((note) => ({
        title: note.name,
        snippet: note.snippet,
        path: note.path
      })),
      maxIterations: loopMaxIterations
    });

    const run = createRun({
      taskId: task.id,
      agentId: `${workspace.id}:direct-loop`,
      agentName: 'Direct Loop',
      agentRole: 'commander',
      runtimeProvider: 'gemini',
      workspaceId: workspace.id,
      status: 'running',
      launchMode: 'loop',
      launchState: 'verifying',
      summary: snapshot.summary,
      terminalIds: [],
      loopRunId: snapshot.id,
      loopIteration: snapshot.iteration,
      loopMaxIterations: snapshot.maxIterations,
      verificationSummary: snapshot.verificationSummary
    });

    applyLoopSnapshotToTask(task.id, run.id, snapshot);
  }, [applyLoopSnapshotToTask, createRun, loopMaxIterations, memoryNotes, missionMode, pinnedNotes, workspace]);

  const launchAgentsForTask = React.useCallback((task: CommanderTask, targetAgents: typeof workspaceAgents, summaryPrefix?: string) => {
    if (!workspace) {
      return;
    }

    if (targetAgents.length === 0) {
      updateTaskStatus(task.id, 'failed');
      return;
    }

    updateTaskStatus(task.id, 'running');

    targetAgents.forEach((agent) => {
      launchAgentRun(
        {
          workspace,
          createTerminal,
          createRun,
          updateRun
        },
        {
          task,
          agent,
          summaryPrefix,
          forceDirectLaunch: true
        }
      );
    });
  }, [createRun, createTerminal, updateRun, updateTaskStatus, workspace, workspaceAgents]);

  const launchPipelineStage = React.useCallback((task: CommanderTask, stageIndex: number, summaryPrefix?: string) => {
    if (!workspace || !task.mission) {
      return;
    }

    const workflowStep = task.mission.workflow[stageIndex];
    if (!workflowStep) {
      return;
    }

    const preferredAgent = workspaceAgents.find((agent) => agent.role === workflowStep.role);
    if (!preferredAgent) {
      updateTaskStatus(task.id, 'failed');
      return;
    }

    updateTaskStatus(task.id, 'running');
    launchAgentRun(
      {
        workspace,
        createTerminal,
        createRun,
        updateRun
      },
      {
        task,
        agent: { ...preferredAgent, provider: effectiveProvider },
        summaryPrefix: summaryPrefix || `Stage ${stageIndex + 1}: ${workflowStep.label}`,
        forceDirectLaunch: true,
        stageIndex,
        stageLabel: workflowStep.label
      }
    );
  }, [createRun, createTerminal, effectiveProvider, updateRun, updateTaskStatus, workspace, workspaceAgents]);

  const buildFallbackCommander = React.useCallback((workspaceToUse: NonNullable<typeof workspace>): AgentProfile => ({
    id: `${workspaceToUse.id}:fallback-commander`,
    name: `${workspaceToUse.name} Commander`,
    role: 'commander',
    provider: getDefaultProviderForRole('commander'),
    workspaceId: workspaceToUse.id,
    promptTemplate: 'Fallback commander for direct mission launch.',
    objective: 'Own the mission when no persisted fleet is available.',
    accentColor: '#ef4444',
    autoAssignTerminalPurpose: 'planning'
  }), []);

  const handleExecute = React.useCallback(async () => {
    if (!workspace || !goal.trim()) {
      return;
    }

    if (workspaceAgents.length === 0) {
      ensureWorkspaceAgents([workspace]);
    }

    const taskTitle = `${missionConfig.title}: ${(goal.trim() || missionConfig.quickPrompt).slice(0, 48)}`;
    const task = createTask(goal.trim(), workspace.id, taskTitle, missionMetadata);
    updateTaskStatus(task.id, 'routing');
    if (runtimeMode === 'direct-loop') {
      try {
        await startDirectLoopTask(task);
        setGoal('');
        return;
      } catch (error) {
        updateTaskStatus(task.id, 'failed');
        updateTaskReview(task.id, {
          decision: 'needs-more-data',
          confidence: 'low',
          summary: error instanceof Error ? error.message : 'Direct loop launch failed.',
          nextAction: 'Check Gemini API configuration and retry.'
        });
        return;
      }
    }

    if (missionMetadata.executionMode === 'pipeline' && missionMetadata.workflow.length > 0) {
      launchPipelineStage(task, 0, 'Pipeline start');
      setGoal('');
      return;
    }

    const selectedProvider = effectiveProvider;
    const fallbackAgents = agents.filter((agent) => agent.workspaceId === workspace.id);
    const targetAgents = suggestedAgents.length > 0
      ? suggestedAgents
      : fallbackAgents.filter((agent) => agent.role === 'commander').slice(0, 1);

    if (targetAgents.length === 0) {
      const fallbackCommander = buildFallbackCommander(workspace);
      const selectedFallbackCommander = { ...fallbackCommander, provider: selectedProvider };
      updateTaskStatus(task.id, 'running');
      launchAgentRun(
        {
          workspace,
          createTerminal,
          createRun,
          updateRun
        },
        {
          task,
          agent: selectedFallbackCommander,
          summaryPrefix: 'Fallback launch',
          forceDirectLaunch: true
        }
      );
      setGoal('');
      return;
    }

    launchAgentsForTask(
      task,
      targetAgents.map((agent) => ({ ...agent, provider: selectedProvider }))
    );
    setGoal('');
  }, [agents, buildFallbackCommander, createRun, createTask, createTerminal, effectiveProvider, ensureWorkspaceAgents, goal, launchAgentsForTask, launchPipelineStage, missionConfig.quickPrompt, missionConfig.title, missionMetadata, runtimeMode, startDirectLoopTask, suggestedAgents, updateRun, updateTaskReview, updateTaskStatus, workspace, workspaceAgents.length]);

  const handleRetryRun = React.useCallback(async (runId: string) => {
    if (!workspace) {
      return;
    }

    const run = runs.find((item) => item.id === runId);
    if (!run) {
      return;
    }

    const agent = workspaceAgents.find((item) => item.id === run.agentId);
    if (!agent) {
      return;
    }

    const sourceTask = tasks.find((item) => item.id === run.taskId);
    const retryTask = createTask(
      sourceTask?.goal || run.summary,
      workspace.id,
      sourceTask?.title || `Retry: ${run.agentName}`,
      sourceTask?.mission
    );
    updateTaskStatus(retryTask.id, 'routing');
    if (run.launchMode === 'loop') {
      try {
        await startDirectLoopTask(retryTask);
      } catch (error) {
        updateTaskStatus(retryTask.id, 'failed');
        updateTaskReview(retryTask.id, {
          decision: 'needs-more-data',
          confidence: 'low',
          summary: error instanceof Error ? error.message : 'Direct loop retry failed.',
          nextAction: 'Check Gemini API configuration and retry.'
        });
      }
      return;
    }
    if (sourceTask?.mission?.executionMode === 'pipeline' && typeof run.stageIndex === 'number') {
      launchPipelineStage(retryTask, run.stageIndex, `Retry stage ${run.stageIndex + 1}`);
      return;
    }

    launchAgentsForTask(retryTask, [agent], 'Retrying');
  }, [createTask, launchAgentsForTask, launchPipelineStage, runs, startDirectLoopTask, tasks, updateTaskReview, updateTaskStatus, workspace, workspaceAgents]);

  React.useEffect(() => {
    if (!workspace) {
      return;
    }

    const activeLoopRuns = runs.filter((run) => (
      run.workspaceId === workspace.id
      && run.launchMode === 'loop'
      && run.loopRunId
      && (run.status === 'running' || run.status === 'queued' || run.status === 'routing')
    ));

    if (activeLoopRuns.length === 0) {
      return;
    }

    let isDisposed = false;
    const syncLoopRuns = async () => {
      for (const run of activeLoopRuns) {
        const snapshot = await window.electronAPI.agentLoop.getRun(run.loopRunId!);
        if (!snapshot || isDisposed) {
          continue;
        }

        applyLoopSnapshotToTask(run.taskId, run.id, snapshot);
      }
    };

    void syncLoopRuns();
    const timer = window.setInterval(() => {
      void syncLoopRuns();
    }, 1800);

    return () => {
      isDisposed = true;
      window.clearInterval(timer);
    };
  }, [applyLoopSnapshotToTask, runs, workspace]);

  React.useEffect(() => {
    if (!workspace) {
      return;
    }

    tasks
      .filter((task) => task.workspaceId === workspace.id && task.mission?.executionMode === 'pipeline')
      .forEach((task) => {
        const workflow = task.mission?.workflow || [];
        if (workflow.length === 0) {
          return;
        }

        const taskRuns = runs
          .filter((run) => run.taskId === task.id)
          .sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0) || a.startedAt - b.startedAt);

        if (taskRuns.length === 0) {
          return;
        }

        if (taskRuns.some((run) => run.status === 'failed')) {
          if (task.status !== 'failed') {
            updateTaskStatus(task.id, 'failed');
          }
          return;
        }

        const activeRun = taskRuns.find((run) => run.status === 'running' || run.status === 'queued' || run.status === 'routing');
        if (activeRun) {
          if (task.status !== 'running') {
            updateTaskStatus(task.id, 'running');
          }
          return;
        }

        const completedStageIndexes = new Set(
          taskRuns
            .filter((run) => run.status === 'completed' && typeof run.stageIndex === 'number')
            .map((run) => run.stageIndex as number)
        );

        for (let index = 0; index < workflow.length; index += 1) {
          const stageAlreadyLaunched = taskRuns.some((run) => run.stageIndex === index);
          if (!completedStageIndexes.has(index) && !stageAlreadyLaunched) {
            launchPipelineStage(task, index, index === 0 ? 'Pipeline start' : `Auto handoff ${index + 1}`);
            return;
          }

          if (!completedStageIndexes.has(index)) {
            return;
          }
        }

        if (completedStageIndexes.size >= workflow.length && task.status !== 'completed') {
          updateTaskStatus(task.id, 'completed');
        }
      });
  }, [launchPipelineStage, runs, tasks, updateTaskStatus, workspace]);

  React.useEffect(() => {
    tasks
      .filter((task) => task.workspaceId === workspace?.id && Array.isArray(task.stageReviews))
      .forEach((task) => {
        const taskRuns = runs.filter((run) => run.taskId === task.id && typeof run.stageIndex === 'number');
        taskRuns.forEach((run) => {
          const nextStageStatus = run.status === 'failed'
            ? 'failed'
            : run.status === 'completed'
              ? 'completed'
              : 'running';
          const stageReview = task.stageReviews?.find((stage) => stage.stageIndex === run.stageIndex);
          if (!stageReview) {
            return;
          }

          if (
            stageReview.status !== nextStageStatus
            || stageReview.summary !== run.summary
            || (run.outputExcerpt && stageReview.artifact !== run.outputExcerpt)
          ) {
            updateTaskStageReview(task.id, run.stageIndex as number, {
              status: nextStageStatus,
              summary: run.summary,
              artifact: run.outputExcerpt || stageReview.artifact
            });
          }
        });
      });
  }, [runs, tasks, updateTaskStageReview, workspace?.id]);

  React.useEffect(() => {
    if (!latestTask?.review) {
      setReviewDecision('pending');
      setReviewConfidence('medium');
      setReviewSummary('');
      setReviewNextAction('');
      return;
    }

    setReviewDecision(latestTask.review.decision);
    setReviewConfidence(latestTask.review.confidence);
    setReviewSummary(latestTask.review.summary);
    setReviewNextAction(latestTask.review.nextAction);
  }, [latestTask]);

  const handleSaveReview = React.useCallback(() => {
    if (!latestTask) {
      return;
    }

    updateTaskReview(latestTask.id, {
      decision: reviewDecision,
      confidence: reviewConfidence,
      summary: reviewSummary.trim(),
      nextAction: reviewNextAction.trim()
    });

    if (reviewDecision !== 'pending' && latestTask.status === 'completed') {
      updateTask(latestTask.id, { status: 'completed' });
    }
  }, [latestTask, reviewConfidence, reviewDecision, reviewNextAction, reviewSummary, updateTask, updateTaskReview]);

  const handleRunMissionAction = React.useCallback(async (actionId: string) => {
    if (!latestTask) {
      return;
    }

    const action = latestTask.actions?.find((item) => item.id === actionId);
    if (!action) {
      return;
    }

    updateTaskAction(latestTask.id, action.id, {
      status: 'running',
      summary: `Running ${action.label}...`
    });

    try {
      const result = await runMissionAction(latestTask, action.key);
      updateTaskAction(latestTask.id, action.id, {
        status: 'completed',
        summary: result.summary
      });
      if (latestTask.mission?.mode === 'strategy-lab') {
        if (action.key === 'load-strategy-library') {
          updateTaskStageReview(latestTask.id, 0, {
            status: 'completed',
            summary: `Research context loaded. ${result.summary}`
          });
        }
        if (action.key === 'run-all-backtests') {
          updateTaskStageReview(latestTask.id, 1, {
            status: 'completed',
            summary: `Validation executed. ${result.summary}`
          });
          updateTaskReview(latestTask.id, {
            decision: 'ready-for-backtest',
            confidence: 'medium',
            summary: result.summary,
            nextAction: 'Review backtest results, inspect detailed strategy metrics, and decide whether to seed paper flow.'
          });
        }
        if (action.key === 'seed-paper-signals' || action.key === 'load-paper-trades') {
          updateTaskStageReview(latestTask.id, 2, {
            status: 'completed',
            summary: `Review evidence updated. ${result.summary}`
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to run ${action.label}.`;
      updateTaskAction(latestTask.id, action.id, {
        status: 'failed',
        summary: message
      });
      if (latestTask.mission?.mode === 'strategy-lab') {
        if (action.key === 'run-all-backtests') {
          updateTaskStageReview(latestTask.id, 1, {
            status: 'failed',
            summary: message
          });
        }
      }
    }
  }, [latestTask, updateTaskAction, updateTaskReview, updateTaskStageReview]);

  const handleRunRecommendedOps = React.useCallback(async () => {
    if (!latestTask?.actions?.length || isRunningRecommendedOps) {
      return;
    }

    setIsRunningRecommendedOps(true);
    try {
      for (const action of latestTask.actions) {
        // eslint-disable-next-line no-await-in-loop
        await handleRunMissionAction(action.id);
      }
    } finally {
      setIsRunningRecommendedOps(false);
    }
  }, [handleRunMissionAction, isRunningRecommendedOps, latestTask]);

  const latestFailedRun = React.useMemo(
    () => scopedRuns.find((run) => run.status === 'failed' || run.launchState === 'attention'),
    [scopedRuns]
  );

  const {
    status: voiceStatus,
    transcript,
    outputTranscript,
    error: voiceError,
    durationSeconds,
    start: startRecording,
    stop: stopRecording,
    reset: resetVoice
  } = useGeminiLiveVoice({
    onConversationReady: (conversation) => {
      const nextGoal = conversation.missionText.trim();
      if (!nextGoal) {
        return;
      }

      setGoal(nextGoal);
      setMissionMode(inferMissionMode(nextGoal));
    }
  });

  const previewAgents = suggestedAgents.length > 0
    ? suggestedAgents
    : workspaceAgents.filter((agent) => agent.role === 'commander').slice(0, 1);
  const previewOrFallbackAgents = React.useMemo(
    () => previewAgents.length > 0 || !workspace ? previewAgents : [buildFallbackCommander(workspace)],
    [buildFallbackCommander, previewAgents, workspace]
  );
  const canLaunchMission = Boolean(
    workspace
    && goal.trim()
    && (runtimeMode === 'terminal' || directLoopReady)
  );
  const applyGuidedTemplate = React.useCallback(() => {
    setGoal(buildGuidedMissionInput(missionMode));
  }, [missionMode]);
  const applyQuickPrompt = React.useCallback(() => {
    setGoal(missionConfig.quickPrompt);
  }, [missionConfig.quickPrompt]);

  const missionBrief = React.useMemo(() => {
    const combined = [...pinnedNotes, ...memoryNotes.filter((note) => !pinnedNotes.some((pinned) => pinned.path === note.path))];
    if (combined.length === 0) {
      return [];
    }

    return combined.map((note) => ({
      id: note.path,
      title: note.name,
      line: [
        note.pinned ? 'pinned' : null,
        note.type ? `type:${note.type}` : null,
        note.domain ? `domain:${note.domain}` : null,
        note.tags.length > 0 ? `tags:${note.tags.slice(0, 3).join(', ')}` : null
      ].filter(Boolean).join(' • '),
      snippet: note.snippet
    }));
  }, [memoryNotes, pinnedNotes]);

  const handleVoicePressStart = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (voiceStatus === 'connecting' || voiceStatus === 'recording' || voiceStatus === 'waiting-response' || voiceStatus === 'responding') {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRecordingRef.current = true;
    void startRecording();
  }, [startRecording, voiceStatus]);

  const handleVoicePressEnd = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerRecordingRef.current) {
      return;
    }
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerRecordingRef.current = false;
    stopRecording();
  }, [stopRecording]);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Mission Control</div>
          <div style={titleStyle}>Speak, route, retry, and keep agents moving.</div>
        </div>
        <div style={workspaceChipStyle}>{workspace?.name || 'No workspace'}</div>
      </div>

      <div style={heroGridStyle}>
        <div style={composerCardStyle}>
          <div style={panelLabelStyle}>Mission Input</div>
          <div style={missionModeGridStyle}>
            {Object.values(MISSION_MODE_CONFIG).map((mode) => {
              const active = missionMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setMissionMode(mode.id);
                    setGoal(mode.guidedInput);
                  }}
                  style={{
                    ...missionModeCardStyle,
                    border: active ? `1px solid ${mode.accent}55` : '1px solid rgba(148, 163, 184, 0.12)',
                    background: active ? `${mode.accent}18` : 'rgba(2, 6, 23, 0.68)'
                  }}
                >
                  <div style={{ color: active ? '#f8fafc' : '#cbd5e1', fontSize: '12px', fontWeight: 800 }}>{mode.label}</div>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px', lineHeight: 1.35 }}>{mode.description}</div>
                </button>
              );
            })}
          </div>
          <div style={depthRowStyle}>
            {(['focused', 'deep'] as MissionDepth[]).map((depth) => {
              const active = missionDepth === depth;
              return (
                <button
                  key={depth}
                  type="button"
                  onClick={() => setMissionDepth(depth)}
                  style={{
                    ...depthChipStyle,
                    border: active ? `1px solid ${missionConfig.accent}55` : '1px solid rgba(148, 163, 184, 0.12)',
                    background: active ? `${missionConfig.accent}18` : 'rgba(15, 23, 42, 0.58)',
                    color: active ? '#f8fafc' : '#94a3b8'
                  }}
                >
                  {depth === 'focused' ? 'Focused' : 'Deep'}
                </button>
              );
            })}
            <div style={{ color: '#64748b', fontSize: '11px' }}>
              {missionDepth === 'focused'
                ? 'Ruta minima para avanzar rapido.'
                : 'Ruta completa para producir insight mas profundo.'}
            </div>
          </div>
          <textarea
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder={missionConfig.placeholder}
            rows={7}
            style={textareaStyle}
          />
          <div style={deliverablesStripStyle}>
            {missionConfig.deliverables.map((item) => (
              <div key={item} style={deliverableChipStyle}>
                {item}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
            <button type="button" onClick={applyGuidedTemplate} style={ghostButtonStyle}>
              Use Guided Template
            </button>
            <button type="button" onClick={applyQuickPrompt} style={ghostButtonStyle}>
              Use Quick Prompt
            </button>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setRuntimeMode('direct-loop')}
                style={{
                  ...ghostButtonStyle,
                  border: runtimeMode === 'direct-loop' ? '1px solid rgba(34, 197, 94, 0.35)' : ghostButtonStyle.border,
                  color: runtimeMode === 'direct-loop' ? '#86efac' : '#cbd5e1'
                }}
              >
                Direct Loop
              </button>
              <button
                type="button"
                onClick={() => setRuntimeMode('terminal')}
                style={{
                  ...ghostButtonStyle,
                  border: runtimeMode === 'terminal' ? '1px solid rgba(56, 189, 248, 0.35)' : ghostButtonStyle.border,
                  color: runtimeMode === 'terminal' ? '#7dd3fc' : '#cbd5e1'
                }}
              >
                Terminal Fallback
              </button>
              <label style={{ color: '#94a3b8', fontSize: '11px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                Max loops
                <select value={loopMaxIterations} onChange={(event) => setLoopMaxIterations(Number(event.target.value))} style={reviewSelectStyle}>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </label>
            </div>
            <div style={{ color: runtimeMode === 'direct-loop' ? '#86efac' : effectiveProviderMeta.accent, fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {runtimeMode === 'direct-loop'
                ? `Runtime: Gemini direct ${directLoopReady ? 'ready' : 'not configured'}`
                : `Effective Provider: ${effectiveProviderMeta.label}`}
            </div>
          </div>
          {runtimeMode === 'direct-loop' && !directLoopReady ? (
            <div style={{ color: '#fde68a', fontSize: '11px', marginTop: '8px', lineHeight: 1.45 }}>
              Direct loop needs a Gemini API key. Use the existing Marketing AI config to enable it, or switch to terminal fallback.
            </div>
          ) : null}
          <div style={voiceDockStyle}>
              <button
                type="button"
                onPointerDown={handleVoicePressStart}
              onPointerUp={handleVoicePressEnd}
              onPointerCancel={handleVoicePressEnd}
              style={{
                ...voiceButtonStyle,
                background: voiceStatus === 'recording'
                  ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                  : 'linear-gradient(135deg, #334155 0%, #1e293b 100%)'
              }}
              >
              {voiceStatus === 'recording'
                ? `Listening ${durationSeconds}s`
                : voiceStatus === 'connecting'
                  ? 'Connecting Gemini'
                  : voiceStatus === 'waiting-response'
                    ? 'Waiting For Gemini'
                  : voiceStatus === 'responding'
                    ? 'Gemini Responding'
                    : 'Hold To Speak'}
            </button>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: voiceError ? '#fca5a5' : '#94a3b8', fontSize: '11px' }}>
                {voiceError || (voiceStatus === 'connecting'
                  ? 'Opening Gemini Live session...'
                  : voiceStatus === 'waiting-response'
                    ? 'Waiting for Gemini response...'
                  : voiceStatus === 'responding'
                    ? 'Gemini is answering and preparing the mission...'
                    : 'Voice talks with Gemini Live and fills the mission box')}
              </div>
              {transcript ? (
                <div style={{ color: '#e2e8f0', fontSize: '12px', marginTop: '4px', lineHeight: 1.4 }}>
                  {transcript}
                </div>
              ) : null}
              {outputTranscript ? (
                <div style={{ color: '#86efac', fontSize: '12px', marginTop: '4px', lineHeight: 1.4 }}>
                  Gemini: {outputTranscript}
                </div>
              ) : null}
            </div>
            <button type="button" onClick={resetVoice} style={ghostButtonStyle}>
              Clear
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={!canLaunchMission}
              onClick={() => void handleExecute()}
              style={{
                ...launchButtonStyle,
                opacity: !canLaunchMission ? 0.5 : 1,
                cursor: !canLaunchMission ? 'not-allowed' : 'pointer'
              }}
            >
              {runtimeMode === 'direct-loop' ? 'Start Direct Loop' : 'Launch Mission'}
            </button>
            {latestFailedRun ? (
              <button type="button" onClick={() => void handleRetryRun(latestFailedRun.id)} style={retryButtonStyle}>
                Try Again Latest
              </button>
            ) : null}
          </div>
        </div>

        <div style={quickActionsStyle}>
          <div style={panelLabelStyle}>Desk Shortcuts</div>
          <QuickActionCard
            title="Load Current Desk"
            subtitle={`${missionConfig.title} con prompt guiado`}
            onClick={applyGuidedTemplate}
          />
          <QuickActionCard
            title="Weekly Strategy Pass"
            subtitle="Idea, filtros, invalidacion y plan de test"
            onClick={() => {
              setMissionMode('strategy-lab');
              setMissionDepth('deep');
              setGoal(MISSION_MODE_CONFIG['strategy-lab'].guidedInput);
            }}
          />
          <QuickActionCard
            title="Retry Latest Failure"
            subtitle={latestFailedRun ? latestFailedRun.agentName : 'No failed run'}
            disabled={!latestFailedRun}
            onClick={() => latestFailedRun && void handleRetryRun(latestFailedRun.id)}
          />
        </div>
      </div>

      <div style={previewGridStyle}>
        <div style={panelStyle}>
          <div style={panelLabelStyle}>Mission Brief</div>
          <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '8px', lineHeight: 1.45 }}>
            {isMemoryLoading
              ? 'Searching Obsidian memory...'
              : missionBrief.length > 0
                ? 'The orchestrator found relevant memory before launch.'
                : 'No relevant memory found yet for this mission.'}
          </div>
          <div style={{ marginTop: '12px', padding: '12px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.12)', background: 'rgba(2, 6, 23, 0.5)' }}>
            <div style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Workflow
            </div>
            <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
              {missionConfig.workflow.map((step, index) => (
                <div key={`${step.role}-${step.label}`} style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.45 }}>
                  <span style={{ color: '#f8fafc', fontWeight: 700 }}>{index + 1}. {step.label}</span>
                  {` - ${formatRoleLabel(step.role)}: ${step.output}`}
                </div>
              ))}
            </div>
            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '10px', lineHeight: 1.45 }}>
              Guardrails: {missionConfig.guardrails.join(' | ')}
            </div>
          </div>
          {!workspace ? (
            <div style={{ color: '#fca5a5', fontSize: '11px', marginTop: '10px' }}>
              Select an active workspace before launching.
            </div>
          ) : previewAgents.length === 0 ? (
            <div style={{ color: '#fde68a', fontSize: '11px', marginTop: '10px' }}>
              No persisted agents loaded yet. Mission launch will use a fallback commander.
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
            {missionBrief.length === 0 ? (
              <div style={emptyStyle}>Use playbooks, architecture notes, and post-mortems in Obsidian to strengthen routing.</div>
            ) : (
              missionBrief.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void window.electronAPI.obsidian.openPath(item.id)}
                  style={routeCardStyle}
                >
                  <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700, textAlign: 'left' }}>{item.title}</div>
                  {item.line ? (
                    <div style={{ color: '#a78bfa', fontSize: '10px', fontWeight: 700, marginTop: '5px', textAlign: 'left' }}>
                      {item.line}
                    </div>
                  ) : null}
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px', lineHeight: 1.4, textAlign: 'left' }}>
                    {item.snippet}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div style={panelStyle}>
          <div style={panelLabelStyle}>Mission Blueprint</div>
          <div style={{ display: 'grid', gap: '12px', marginTop: '10px' }}>
            <div>
              <div style={blueprintLabelStyle}>App Surfaces</div>
              <div style={blueprintListStyle}>{missionConfig.appSurfaces.join(' | ')}</div>
            </div>
            <div>
              <div style={blueprintLabelStyle}>Backend Capabilities</div>
              <div style={blueprintListStyle}>{missionConfig.backendCapabilities.join(' | ')}</div>
            </div>
            <div>
              <div style={blueprintLabelStyle}>Completion Gate</div>
              <div style={blueprintListStyle}>{missionConfig.completionGate.join(' | ')}</div>
            </div>
          </div>
        </div>

        <div style={panelStyle}>
          <div style={panelLabelStyle}>Routing Preview</div>
          <div style={{ color: runtimeMode === 'direct-loop' ? '#86efac' : effectiveProviderMeta.accent, fontSize: '11px', fontWeight: 800, marginTop: '8px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {runtimeMode === 'direct-loop' ? 'Launch engine: Gemini direct loop' : `Launch provider: ${effectiveProviderMeta.label}`}
          </div>
          <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
            {runtimeMode === 'direct-loop' ? (
              <div style={routeCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#f8fafc', fontSize: '13px', fontWeight: 700 }}>Direct Loop</div>
                    <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                      Structured mission runtime with verify-and-refine iterations
                    </div>
                  </div>
                  <div style={providerBadgeStyle('#22c55e', 'rgba(34, 197, 94, 0.18)')}>
                    GL
                  </div>
                </div>
              </div>
            ) : previewOrFallbackAgents.length === 0 ? (
              <div style={emptyStyle}>No agents available in this workspace.</div>
            ) : (
              previewOrFallbackAgents.map((agent) => {
                const provider = getProviderMeta(effectiveProvider);
                return (
                  <div key={agent.id} style={routeCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: '#f8fafc', fontSize: '13px', fontWeight: 700 }}>{agent.name}</div>
                        <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                          {formatRoleLabel(agent.role)} • {provider.label}
                        </div>
                      </div>
                      <div style={providerBadgeStyle(provider.accent, provider.glow)}>
                        {provider.shortLabel}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={panelStyle}>
          <div style={panelLabelStyle}>Live Queue</div>
          <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
            {scopedRuns.length === 0 ? (
              <div style={emptyStyle}>No missions launched yet.</div>
            ) : (
              scopedRuns.map((run) => {
                const provider = getProviderMeta(run.runtimeProvider);
                const runtimeTerminal = terminals.find((terminal) => run.terminalIds.includes(terminal.id));
                return (
                  <div key={run.id} style={routeCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                      <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>{run.agentName}</div>
                      <div style={statusPill(run.launchState === 'ready' ? 'ready' : run.launchState === 'attention' ? 'attention' : 'launching')}>
                        {run.launchState}
                      </div>
                    </div>
                    <div style={{ color: provider.accent, fontSize: '10px', fontWeight: 800, marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {provider.label}{run.stageLabel ? ` • ${run.stageLabel}` : ''}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px', lineHeight: 1.45 }}>
                      {run.summary}
                    </div>
                    <LaunchSignalStrip run={run} terminal={runtimeTerminal} />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => void handleRetryRun(run.id)} style={retryActionStyle}>
                        Try Again
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={panelStyle}>
          <div style={panelLabelStyle}>Recent Missions</div>
          <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
            {scopedTasks.length === 0 ? (
              <div style={emptyStyle}>No mission history yet.</div>
            ) : (
              scopedTasks.map((task) => (
                <div key={task.id} style={routeCardStyle}>
                  <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>{task.title}</div>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px', lineHeight: 1.4 }}>{task.goal}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={panelStyle}>
          <div style={panelLabelStyle}>Decision Gate</div>
          {!latestTask ? (
            <div style={emptyStyle}>Launch a mission to review structured stage output and the final decision.</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
              <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>{latestTask.title}</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {(latestTask.stageReviews || []).map((stage) => (
                  <div key={`${latestTask.id}-${stage.stageIndex}`} style={routeCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                      <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>
                        {stage.stageIndex + 1}. {stage.label}
                      </div>
                      <div style={statusPill(stage.status === 'failed' ? 'attention' : stage.status === 'completed' ? 'ready' : 'launching')}>
                        {stage.status}
                      </div>
                    </div>
                    <div style={{ color: '#64748b', fontSize: '11px', marginTop: '6px', lineHeight: 1.45 }}>
                      {stage.summary || stage.objective}
                    </div>
                    {stage.artifact ? (
                      <pre style={{ ...artifactPreStyle, maxHeight: '160px', marginTop: '8px' }}>
                        {stage.artifact}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
              <label style={reviewLabelStyle}>
                Decision
                <select value={reviewDecision} onChange={(event) => setReviewDecision(event.target.value as MissionDecision)} style={reviewSelectStyle}>
                  <option value="pending">pending</option>
                  <option value="reject">reject</option>
                  <option value="needs-more-data">needs-more-data</option>
                  <option value="ready-for-backtest">ready-for-backtest</option>
                  <option value="ready-for-paper">ready-for-paper</option>
                  <option value="ready-for-build">ready-for-build</option>
                </select>
              </label>
              <label style={reviewLabelStyle}>
                Confidence
                <select value={reviewConfidence} onChange={(event) => setReviewConfidence(event.target.value as MissionReviewConfidence)} style={reviewSelectStyle}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>
              <label style={reviewLabelStyle}>
                Summary
                <textarea value={reviewSummary} onChange={(event) => setReviewSummary(event.target.value)} rows={3} style={reviewTextareaStyle} />
              </label>
              <label style={reviewLabelStyle}>
                Next Action
                <textarea value={reviewNextAction} onChange={(event) => setReviewNextAction(event.target.value)} rows={2} style={reviewTextareaStyle} />
              </label>
              <button type="button" onClick={handleSaveReview} style={launchButtonStyle}>
                Save Decision
              </button>
            </div>
          )}
        </div>

        <div style={panelStyle}>
          <div style={panelLabelStyle}>Mission Ops</div>
          {!latestTask || !latestTask.actions || latestTask.actions.length === 0 ? (
            <div style={emptyStyle}>This mission mode does not have controlled backend actions yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => void handleRunRecommendedOps()}
                disabled={isRunningRecommendedOps}
                style={{
                  ...launchButtonStyle,
                  minWidth: 0,
                  opacity: isRunningRecommendedOps ? 0.6 : 1,
                  cursor: isRunningRecommendedOps ? 'not-allowed' : 'pointer'
                }}
              >
                {isRunningRecommendedOps ? 'Running Recommended Ops...' : 'Run Recommended Ops'}
              </button>
              {latestTask.actions.map((action) => (
                <div key={action.id} style={routeCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                    <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>{action.label}</div>
                    <div style={statusPill(action.status === 'failed' ? 'attention' : action.status === 'completed' ? 'ready' : 'launching')}>
                      {action.status}
                    </div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px', lineHeight: 1.45 }}>
                    {action.summary}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => void handleRunMissionAction(action.id)}
                      disabled={action.status === 'running'}
                      style={{
                        ...retryActionStyle,
                        opacity: action.status === 'running' ? 0.6 : 1,
                        cursor: action.status === 'running' ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Run Action
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={panelStyle}>
          <div style={panelLabelStyle}>Run Artifacts</div>
          {!latestTask || latestTaskRuns.length === 0 ? (
            <div style={emptyStyle}>No captured run output yet for this mission.</div>
          ) : (
            <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
              {latestTaskRuns.map((run) => (
                <div key={run.id} style={routeCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                    <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>
                      {run.agentName}{run.stageLabel ? ` - ${run.stageLabel}` : ''}
                    </div>
                    <div style={statusPill(run.launchState === 'attention' ? 'attention' : run.status === 'completed' ? 'ready' : 'launching')}>
                      {run.status}
                    </div>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginTop: '6px' }}>
                    {run.outputCapturedAt ? `Captured ${new Date(run.outputCapturedAt).toLocaleTimeString()}` : 'Waiting for output capture'}
                  </div>
                  <pre style={artifactPreStyle}>
                    {run.outputExcerpt || 'No output captured yet.'}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function QuickActionCard({
  title,
  subtitle,
  onClick,
  disabled = false
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '14px',
        borderRadius: '16px',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        background: disabled ? 'rgba(15, 23, 42, 0.35)' : 'rgba(2, 6, 23, 0.75)',
        color: '#f8fafc',
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 800 }}>{title}</div>
      <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px', lineHeight: 1.4 }}>{subtitle}</div>
    </button>
  );
}

const containerStyle: React.CSSProperties = {
  borderRadius: '24px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(2, 6, 23, 0.96) 100%)',
  padding: '18px'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap'
};

const eyebrowStyle: React.CSSProperties = {
  color: '#ef4444',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.14em'
};

const titleStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '20px',
  fontWeight: 800,
  marginTop: '6px'
};

const workspaceChipStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '999px',
  border: '1px solid rgba(239, 68, 68, 0.16)',
  background: 'rgba(239, 68, 68, 0.08)',
  color: '#fca5a5',
  fontSize: '11px',
  fontWeight: 700
};

const heroGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.8fr)',
  gap: '14px',
  marginTop: '16px'
};

const missionModeGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '10px',
  marginTop: '12px',
  marginBottom: '12px'
};

const missionModeCardStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '16px',
  textAlign: 'left',
  cursor: 'pointer'
};

const depthRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  flexWrap: 'wrap',
  marginBottom: '12px'
};

const depthChipStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 800,
  cursor: 'pointer'
};

const composerCardStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '18px',
  background: 'rgba(15, 23, 42, 0.58)',
  border: '1px solid rgba(148, 163, 184, 0.12)'
};

const quickActionsStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '18px',
  background: 'rgba(15, 23, 42, 0.58)',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  display: 'grid',
  gap: '10px'
};

const panelStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '18px',
  background: 'rgba(15, 23, 42, 0.58)',
  border: '1px solid rgba(148, 163, 184, 0.12)'
};

const panelLabelStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.12em'
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '18px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'rgba(15, 23, 42, 0.8)',
  color: '#f8fafc',
  fontSize: '13px',
  resize: 'vertical',
  outline: 'none',
  lineHeight: 1.55
};

const deliverablesStripStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  marginTop: '12px'
};

const deliverableChipStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: '999px',
  background: 'rgba(59, 130, 246, 0.12)',
  border: '1px solid rgba(59, 130, 246, 0.2)',
  color: '#bfdbfe',
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase'
};

const voiceDockStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  marginTop: '12px',
  alignItems: 'flex-start'
};

const voiceButtonStyle: React.CSSProperties = {
  padding: '11px 14px',
  borderRadius: '14px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  color: '#eff6ff',
  fontSize: '11px',
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

const ghostButtonStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'rgba(2, 6, 23, 0.7)',
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer'
};

const launchButtonStyle: React.CSSProperties = {
  minWidth: '160px',
  padding: '11px 18px',
  borderRadius: '18px',
  border: '1px solid rgba(220, 38, 38, 0.22)',
  background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
  color: '#f8fafc',
  fontSize: '12px',
  fontWeight: 800
};

const retryButtonStyle: React.CSSProperties = {
  minWidth: '160px',
  padding: '11px 18px',
  borderRadius: '18px',
  border: '1px solid rgba(251, 191, 36, 0.22)',
  background: 'rgba(245, 158, 11, 0.14)',
  color: '#fde68a',
  fontSize: '12px',
  fontWeight: 800,
  cursor: 'pointer'
};

const previewGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '14px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  marginTop: '16px'
};

const routeCardStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '16px',
  background: 'rgba(2, 6, 23, 0.7)',
  border: '1px solid rgba(148, 163, 184, 0.1)'
};

const emptyStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '14px',
  background: 'rgba(15, 23, 42, 0.45)',
  border: '1px dashed rgba(148, 163, 184, 0.14)',
  color: '#64748b',
  fontSize: '12px'
};

const retryActionStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: '10px',
  border: '1px solid rgba(59, 130, 246, 0.24)',
  background: 'rgba(59, 130, 246, 0.12)',
  color: '#bfdbfe',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer'
};

const reviewLabelStyle: React.CSSProperties = {
  display: 'grid',
  gap: '6px',
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 700
};

const reviewSelectStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.72)',
  color: '#f8fafc',
  padding: '10px 12px',
  fontSize: '12px'
};

const reviewTextareaStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.72)',
  color: '#f8fafc',
  padding: '10px 12px',
  fontSize: '12px',
  lineHeight: 1.45,
  resize: 'vertical'
};

const artifactPreStyle: React.CSSProperties = {
  marginTop: '10px',
  padding: '12px',
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'rgba(2, 6, 23, 0.7)',
  color: '#cbd5e1',
  fontSize: '11px',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: '220px',
  overflow: 'auto'
};

const blueprintLabelStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase'
};

const blueprintListStyle: React.CSSProperties = {
  color: '#e2e8f0',
  fontSize: '11px',
  lineHeight: 1.5,
  marginTop: '6px'
};

function providerBadgeStyle(accent: string, glow: string): React.CSSProperties {
  return {
    padding: '4px 8px',
    borderRadius: '999px',
    background: glow,
    color: accent,
    fontSize: '10px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.08em'
  };
}

function statusPill(state: 'launching' | 'ready' | 'attention'): React.CSSProperties {
  const tone = {
    launching: { background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24' },
    ready: { background: 'rgba(16, 185, 129, 0.16)', color: '#34d399' },
    attention: { background: 'rgba(239, 68, 68, 0.16)', color: '#f87171' }
  }[state];

  return {
    padding: '3px 8px',
    borderRadius: '999px',
    background: tone.background,
    color: tone.color,
    fontSize: '10px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.08em'
  };
}
