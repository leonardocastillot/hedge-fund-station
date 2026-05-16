import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  CommanderTask,
  MissionActionRecord,
  MissionChatMessage,
  MissionConversation,
  MissionDraft,
  MissionReview,
  MissionStageReview,
  MissionTaskMetadata,
  TaskRun,
  TaskStatus
} from '../types/tasks';
import { isAgentProvider } from '../utils/agentRuntime';

const TASKS_STORAGE_KEY = 'hedge-station:commander-tasks';
const RUNS_STORAGE_KEY = 'hedge-station:commander-runs';
const CHAT_STORAGE_KEY = 'hedge-station:mission-chat';
const DRAFTS_STORAGE_KEY = 'hedge-station:mission-drafts';
const CONVERSATIONS_STORAGE_KEY = 'hedge-station:mission-conversations';

interface CommanderTasksContextValue {
  tasks: CommanderTask[];
  runs: TaskRun[];
  missionMessages: MissionChatMessage[];
  missionDrafts: MissionDraft[];
  missionConversations: MissionConversation[];
  createTask: (goal: string, workspaceId: string, title?: string, mission?: MissionTaskMetadata) => CommanderTask;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  updateTask: (taskId: string, updates: Partial<CommanderTask>) => void;
  updateTaskStageReview: (taskId: string, stageIndex: number, updates: Partial<MissionStageReview>) => void;
  updateTaskReview: (taskId: string, updates: Partial<MissionReview>) => void;
  updateTaskAction: (taskId: string, actionId: string, updates: Partial<MissionActionRecord>) => void;
  createRun: (params: Omit<TaskRun, 'id' | 'startedAt' | 'updatedAt'> & { startedAt?: number }) => TaskRun;
  updateRun: (runId: string, updates: Partial<TaskRun>) => void;
  removeRun: (runId: string) => void;
  addMissionMessage: (message: Omit<MissionChatMessage, 'id' | 'createdAt'> & { createdAt?: number }) => MissionChatMessage;
  createMissionConversation: (params: Pick<MissionConversation, 'workspaceId'> & Partial<Pick<MissionConversation, 'title' | 'status'>>) => MissionConversation;
  updateMissionConversation: (conversationId: string, updates: Partial<MissionConversation>) => void;
  archiveMissionConversation: (conversationId: string) => void;
  createMissionDraft: (draft: Omit<MissionDraft, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: number }) => MissionDraft;
  updateMissionDraft: (draftId: string, updates: Partial<MissionDraft>) => void;
  removeMissionDraft: (draftId: string) => void;
}

const CommanderTasksContext = createContext<CommanderTasksContextValue | undefined>(undefined);

function loadArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadRuns(): TaskRun[] {
  const runs = loadArray<Partial<TaskRun>>(RUNS_STORAGE_KEY);
  return runs.map((run) => ({
    id: run.id || `run-${uuidv4()}`,
    taskId: run.taskId || '',
    agentId: run.agentId || '',
    agentName: run.agentName || 'Unknown agent',
    agentRole: run.agentRole,
    stageIndex: typeof run.stageIndex === 'number' ? run.stageIndex : undefined,
    stageLabel: typeof run.stageLabel === 'string' ? run.stageLabel : undefined,
    runtimeProvider: isAgentProvider(run.runtimeProvider) ? run.runtimeProvider : 'claude',
    workspaceId: run.workspaceId || '',
    status: run.status || 'queued',
    launchMode: run.launchMode || 'direct',
    launchState: run.launchState || 'ready',
    summary: run.summary || 'Recovered run',
    outputExcerpt: typeof run.outputExcerpt === 'string' ? run.outputExcerpt : undefined,
    outputCapturedAt: typeof run.outputCapturedAt === 'number' ? run.outputCapturedAt : undefined,
    terminalIds: Array.isArray(run.terminalIds) ? run.terminalIds : [],
    loopRunId: typeof run.loopRunId === 'string' ? run.loopRunId : undefined,
    loopIteration: typeof run.loopIteration === 'number' ? run.loopIteration : undefined,
    loopMaxIterations: typeof run.loopMaxIterations === 'number' ? run.loopMaxIterations : undefined,
    verificationSummary: typeof run.verificationSummary === 'string' ? run.verificationSummary : undefined,
    startedAt: typeof run.startedAt === 'number' ? run.startedAt : Date.now(),
    updatedAt: typeof run.updatedAt === 'number' ? run.updatedAt : Date.now(),
    endedAt: typeof run.endedAt === 'number' ? run.endedAt : undefined
  }));
}

function loadMessages(): MissionChatMessage[] {
  return loadArray<Partial<MissionChatMessage>>(CHAT_STORAGE_KEY)
    .filter((message) => typeof message.workspaceId === 'string' && typeof message.content === 'string')
    .map((message) => ({
      id: message.id || `msg-${uuidv4()}`,
      workspaceId: message.workspaceId || '',
      conversationId: typeof message.conversationId === 'string' ? message.conversationId : legacyConversationId(message.workspaceId || ''),
      taskId: typeof message.taskId === 'string' ? message.taskId : undefined,
      draftId: typeof message.draftId === 'string' ? message.draftId : undefined,
      role: message.role === 'user' || message.role === 'system' ? message.role : 'assistant',
      content: message.content || '',
      createdAt: typeof message.createdAt === 'number' ? message.createdAt : Date.now()
    }));
}

function loadDrafts(): MissionDraft[] {
  return loadArray<Partial<MissionDraft>>(DRAFTS_STORAGE_KEY)
    .filter((draft) => typeof draft.workspaceId === 'string' && typeof draft.goal === 'string')
    .map((draft) => ({
      id: draft.id || `draft-${uuidv4()}`,
      workspaceId: draft.workspaceId || '',
      conversationId: typeof draft.conversationId === 'string' ? draft.conversationId : legacyConversationId(draft.workspaceId || ''),
      taskId: typeof draft.taskId === 'string' ? draft.taskId : undefined,
      title: draft.title || (draft.goal || 'Mission draft').slice(0, 72),
      goal: draft.goal || '',
      mode: draft.mode || 'market-scan',
      suggestedRoles: Array.isArray(draft.suggestedRoles) ? draft.suggestedRoles : [],
      proposedCommands: Array.isArray(draft.proposedCommands) ? draft.proposedCommands : [],
      risks: Array.isArray(draft.risks) ? draft.risks : [],
      finalPrompt: draft.finalPrompt || draft.goal || '',
      missionPacket: draft.missionPacket,
      approvalStatus: draft.approvalStatus || 'draft',
      createdAt: typeof draft.createdAt === 'number' ? draft.createdAt : Date.now(),
      updatedAt: typeof draft.updatedAt === 'number' ? draft.updatedAt : Date.now(),
      approvedAt: typeof draft.approvedAt === 'number' ? draft.approvedAt : undefined,
      runId: typeof draft.runId === 'string' ? draft.runId : undefined,
      terminalIds: Array.isArray(draft.terminalIds) ? draft.terminalIds : undefined,
      error: typeof draft.error === 'string' ? draft.error : undefined
    }));
}

function legacyConversationId(workspaceId: string): string {
  return `legacy:${workspaceId || 'workspace'}`;
}

function loadConversations(messages: MissionChatMessage[], drafts: MissionDraft[]): MissionConversation[] {
  const storedConversations = loadArray<Partial<MissionConversation>>(CONVERSATIONS_STORAGE_KEY)
    .filter((conversation) => typeof conversation.workspaceId === 'string' && typeof conversation.title === 'string')
    .map((conversation) => ({
      id: conversation.id || `conversation-${uuidv4()}`,
      workspaceId: conversation.workspaceId || '',
      title: conversation.title || 'Workspace history',
      status: conversation.status === 'archived' ? 'archived' as const : 'active' as const,
      createdAt: typeof conversation.createdAt === 'number' ? conversation.createdAt : Date.now(),
      updatedAt: typeof conversation.updatedAt === 'number' ? conversation.updatedAt : Date.now()
    }));

  const byId = new Map(storedConversations.map((conversation) => [conversation.id, conversation]));
  [...messages, ...drafts].forEach((item) => {
    if (!item.workspaceId || !item.conversationId || byId.has(item.conversationId)) {
      return;
    }

    byId.set(item.conversationId, {
      id: item.conversationId,
      workspaceId: item.workspaceId,
      title: item.conversationId === legacyConversationId(item.workspaceId) ? 'Workspace history' : 'Conversation',
      status: 'active',
      createdAt: item.createdAt,
      updatedAt: 'updatedAt' in item && typeof item.updatedAt === 'number' ? item.updatedAt : item.createdAt
    });
  });

  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function buildInitialStageReviews(mission?: MissionTaskMetadata): MissionStageReview[] | undefined {
  if (!mission?.workflow?.length) {
    return undefined;
  }

  return mission.workflow.map((step, index) => ({
    stageIndex: index,
    role: step.role,
    label: step.label,
    objective: step.objective,
    status: 'pending',
    summary: step.output
  }));
}

function buildInitialReview(mission?: MissionTaskMetadata): MissionReview | undefined {
  if (!mission) {
    return undefined;
  }

  const successCriteria = Array.isArray(mission.successCriteria) ? mission.successCriteria : [];
  const deliverables = Array.isArray(mission.deliverables) ? mission.deliverables : [];
  const workflow = Array.isArray(mission.workflow) ? mission.workflow : [];

  return {
    decision: 'pending',
    confidence: 'medium',
    summary: successCriteria[0] || '',
    nextAction: workflow[0]?.handoff || deliverables[0] || ''
  };
}

function normalizeMissionMetadata(mission?: MissionTaskMetadata): MissionTaskMetadata | undefined {
  if (!mission) {
    return undefined;
  }

  return {
    ...mission,
    routeRoles: Array.isArray(mission.routeRoles) ? mission.routeRoles : [],
    deliverables: Array.isArray(mission.deliverables) ? mission.deliverables : [],
    datasets: Array.isArray(mission.datasets) ? mission.datasets : [],
    successCriteria: Array.isArray(mission.successCriteria) ? mission.successCriteria : [],
    guardrails: Array.isArray(mission.guardrails) ? mission.guardrails : [],
    guidedInput: typeof mission.guidedInput === 'string' ? mission.guidedInput : '',
    workflow: Array.isArray(mission.workflow) ? mission.workflow : [],
    appSurfaces: Array.isArray(mission.appSurfaces) ? mission.appSurfaces : [],
    backendCapabilities: Array.isArray(mission.backendCapabilities) ? mission.backendCapabilities : [],
    completionGate: Array.isArray(mission.completionGate) ? mission.completionGate : []
  };
}

function buildInitialActions(mission?: MissionTaskMetadata): MissionActionRecord[] | undefined {
  if (!mission) {
    return undefined;
  }

  const baseActionsByMode: Record<string, Array<{ key: string; label: string; summary: string }>> = {
    'strategy-lab': [
      { key: 'load-strategy-library', label: 'Load Strategy Library', summary: 'Fetch the current strategy library from the backend.' },
      { key: 'run-all-backtests', label: 'Run All Backtests', summary: 'Run production backtests for the strategy set.' },
      { key: 'seed-paper-signals', label: 'Seed Paper Signals', summary: 'Seed fresh paper signals from the Hyperliquid gateway.' },
      { key: 'load-paper-trades', label: 'Load Paper Trades', summary: 'Inspect current paper-trade results and reviews.' }
    ],
    'flow-radar': [
      { key: 'load-overview', label: 'Load Hyperliquid Overview', summary: 'Fetch the market overview and opportunity ranking.' },
      { key: 'load-watchlist', label: 'Load Watchlist', summary: 'Fetch the current Hyperliquid watchlist buckets.' },
      { key: 'seed-paper-signals', label: 'Seed Paper Signals', summary: 'Create fresh paper signals for the desk.' }
    ],
    'market-scan': [
      { key: 'load-overview', label: 'Load Hyperliquid Overview', summary: 'Fetch the market overview for the current scan.' },
      { key: 'load-alerts', label: 'Load Alerts', summary: 'Fetch recent Hyperliquid alert events.' }
    ],
    'risk-watch': [
      { key: 'load-alerts', label: 'Load Alerts', summary: 'Fetch recent Hyperliquid alert events.' },
      { key: 'load-paper-trades', label: 'Load Paper Trades', summary: 'Inspect paper-trade exposure and reviews.' }
    ],
    'execution-prep': [
      { key: 'load-watchlist', label: 'Load Watchlist', summary: 'Fetch the current Hyperliquid watchlist buckets.' },
      { key: 'load-paper-signals', label: 'Load Paper Signals', summary: 'Inspect current paper signals before execution.' }
    ],
    'build-fix': [
      { key: 'load-strategy-library', label: 'Load Strategy Library', summary: 'Check the strategy backend contract.' },
      { key: 'load-paper-trades', label: 'Load Paper Trades', summary: 'Check downstream paper-trade data integrity.' }
    ]
  };

  return (baseActionsByMode[mission.mode] || []).map((action) => ({
    id: `${mission.mode}:${action.key}`,
    key: action.key,
    label: action.label,
    status: 'idle',
    summary: action.summary
  }));
}

export const CommanderTasksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialMessages = React.useMemo(() => loadMessages(), []);
  const initialDrafts = React.useMemo(() => loadDrafts(), []);
  const [tasks, setTasks] = useState<CommanderTask[]>(() => loadArray<Partial<CommanderTask>>(TASKS_STORAGE_KEY).map((task) => ({
    id: task.id || `task-${uuidv4()}`,
    title: task.title || (task.goal || 'Recovered task').slice(0, 72),
    goal: task.goal || '',
    workspaceId: task.workspaceId || '',
    status: task.status || 'queued',
    createdAt: typeof task.createdAt === 'number' ? task.createdAt : Date.now(),
    mission: normalizeMissionMetadata(task.mission),
    stageReviews: Array.isArray(task.stageReviews) ? task.stageReviews : buildInitialStageReviews(normalizeMissionMetadata(task.mission)),
    review: task.review || buildInitialReview(normalizeMissionMetadata(task.mission)),
    actions: Array.isArray(task.actions) ? task.actions : buildInitialActions(normalizeMissionMetadata(task.mission))
  })));
  const [runs, setRuns] = useState<TaskRun[]>(() => loadRuns());
  const [missionMessages, setMissionMessages] = useState<MissionChatMessage[]>(() => initialMessages);
  const [missionDrafts, setMissionDrafts] = useState<MissionDraft[]>(() => initialDrafts);
  const [missionConversations, setMissionConversations] = useState<MissionConversation[]>(() => loadConversations(initialMessages, initialDrafts));

  useEffect(() => {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(runs));
  }, [runs]);

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(missionMessages.slice(0, 240)));
  }, [missionMessages]);

  useEffect(() => {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(missionDrafts.slice(0, 80)));
  }, [missionDrafts]);

  useEffect(() => {
    localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(missionConversations.slice(0, 120)));
  }, [missionConversations]);

  const value = useMemo<CommanderTasksContextValue>(() => ({
    tasks,
    runs,
    missionMessages,
    missionDrafts,
    missionConversations,
    createTask: (goal, workspaceId, title, mission) => {
      const task: CommanderTask = {
        id: `task-${uuidv4()}`,
        title: title || goal.slice(0, 72),
        goal,
        workspaceId,
        status: 'queued',
        approvalStatus: mission ? 'awaiting-approval' : undefined,
        createdAt: Date.now(),
        mission,
        stageReviews: buildInitialStageReviews(mission),
        review: buildInitialReview(mission),
        actions: buildInitialActions(mission)
      };

      setTasks((prev) => [task, ...prev].slice(0, 50));
      return task;
    },
    updateTaskStatus: (taskId, status) => {
      setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status } : task)));
    },
    updateTask: (taskId, updates) => {
      setTasks((prev) => prev.map((task) => (
        task.id === taskId
          ? {
              ...task,
              ...updates
            }
          : task
      )));
    },
    updateTaskStageReview: (taskId, stageIndex, updates) => {
      setTasks((prev) => prev.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const stageReviews = Array.isArray(task.stageReviews) ? task.stageReviews : [];
        return {
          ...task,
          stageReviews: stageReviews.map((stage) => (
            stage.stageIndex === stageIndex
              ? {
                  ...stage,
                  ...updates,
                  updatedAt: Date.now()
                }
              : stage
          ))
        };
      }));
    },
    updateTaskReview: (taskId, updates) => {
      setTasks((prev) => prev.map((task) => (
        task.id === taskId
          ? {
              ...task,
              review: {
                decision: task.review?.decision || 'pending',
                confidence: task.review?.confidence || 'medium',
                summary: task.review?.summary || '',
                nextAction: task.review?.nextAction || '',
                ...updates,
                updatedAt: Date.now()
              }
            }
          : task
      )));
    },
    updateTaskAction: (taskId, actionId, updates) => {
      setTasks((prev) => prev.map((task) => (
        task.id === taskId
          ? {
              ...task,
              actions: (task.actions || []).map((action) => (
                action.id === actionId
                  ? {
                      ...action,
                      ...updates,
                      updatedAt: Date.now()
                    }
                  : action
              ))
            }
          : task
      )));
    },
    createRun: (params) => {
      const run: TaskRun = {
        id: `run-${uuidv4()}`,
        startedAt: params.startedAt || Date.now(),
        updatedAt: params.startedAt || Date.now(),
        ...params
      };

      setRuns((prev) => [run, ...prev].slice(0, 120));
      return run;
    },
    updateRun: (runId, updates) => {
      setRuns((prev) => prev.map((run) => (
        run.id === runId
          ? {
              ...run,
              ...updates,
              updatedAt: Date.now()
            }
          : run
      )));
    },
    removeRun: (runId) => {
      setRuns((prev) => prev.filter((run) => run.id !== runId));
      setMissionDrafts((prev) => prev.map((draft) => (
        draft.runId === runId
          ? {
              ...draft,
              runId: undefined,
              terminalIds: undefined,
              approvalStatus: draft.approvalStatus === 'running' ? 'cancelled' : draft.approvalStatus,
              updatedAt: Date.now()
            }
          : draft
      )));
    },
    addMissionMessage: (message) => {
      const nextMessage: MissionChatMessage = {
        id: `msg-${uuidv4()}`,
        createdAt: message.createdAt || Date.now(),
        ...message,
        conversationId: message.conversationId || legacyConversationId(message.workspaceId)
      };
      setMissionMessages((prev) => [nextMessage, ...prev].slice(0, 240));
      setMissionConversations((prev) => prev.map((conversation) => (
        conversation.id === nextMessage.conversationId
          ? { ...conversation, updatedAt: nextMessage.createdAt }
          : conversation
      )));
      return nextMessage;
    },
    createMissionConversation: (params) => {
      const timestamp = Date.now();
      const conversation: MissionConversation = {
        id: `conversation-${uuidv4()}`,
        workspaceId: params.workspaceId,
        title: params.title || 'New chat',
        status: params.status || 'active',
        createdAt: timestamp,
        updatedAt: timestamp
      };
      setMissionConversations((prev) => [conversation, ...prev].slice(0, 120));
      return conversation;
    },
    updateMissionConversation: (conversationId, updates) => {
      setMissionConversations((prev) => prev.map((conversation) => (
        conversation.id === conversationId
          ? {
              ...conversation,
              ...updates,
              updatedAt: Date.now()
            }
          : conversation
      )));
    },
    archiveMissionConversation: (conversationId) => {
      setMissionConversations((prev) => prev.map((conversation) => (
        conversation.id === conversationId
          ? {
              ...conversation,
              status: 'archived',
              updatedAt: Date.now()
            }
          : conversation
      )));
    },
    createMissionDraft: (draft) => {
      const timestamp = draft.createdAt || Date.now();
      const nextDraft: MissionDraft = {
        id: `draft-${uuidv4()}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...draft,
        conversationId: draft.conversationId || legacyConversationId(draft.workspaceId)
      };
      setMissionDrafts((prev) => [nextDraft, ...prev].slice(0, 80));
      setMissionConversations((prev) => prev.map((conversation) => (
        conversation.id === nextDraft.conversationId
          ? { ...conversation, updatedAt: timestamp }
          : conversation
      )));
      return nextDraft;
    },
    updateMissionDraft: (draftId, updates) => {
      setMissionDrafts((prev) => prev.map((draft) => (
        draft.id === draftId
          ? {
              ...draft,
              ...updates,
              updatedAt: Date.now()
            }
          : draft
      )));
    },
    removeMissionDraft: (draftId) => {
      setMissionDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
    }
  }), [missionConversations, missionDrafts, missionMessages, runs, tasks]);

  return (
    <CommanderTasksContext.Provider value={value}>
      {children}
    </CommanderTasksContext.Provider>
  );
};

export function useCommanderTasksContext() {
  const context = useContext(CommanderTasksContext);
  if (!context) {
    throw new Error('useCommanderTasksContext must be used within CommanderTasksProvider');
  }
  return context;
}
