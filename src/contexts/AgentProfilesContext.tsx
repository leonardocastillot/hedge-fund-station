import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Workspace } from '../types/electron';
import type { AgentProfile } from '../types/agents';
import { getDefaultProviderForRole } from '../utils/agentRuntime';

const STORAGE_KEY = 'hedge-station:agent-profiles';

const TRADING_OPERATING_DISCIPLINE =
  'Use the repo as an operating stack: put heavy strategy logic, replay, paper execution, ranking, and long-running market jobs in backend services or Docker-facing processes. Keep the Electron app focused on visualization, inspection, controls, and review. When proposing or improving a strategy, first create or update a spec in docs/strategies and map implementation to backend/hyperliquid_gateway/strategies before changing UI surfaces.';

interface AgentProfilesContextValue {
  agents: AgentProfile[];
  upsertAgent: (agent: AgentProfile) => void;
  removeAgent: (agentId: string) => void;
  ensureWorkspaceAgents: (workspaces: Workspace[]) => void;
}

const AgentProfilesContext = createContext<AgentProfilesContextValue | undefined>(undefined);

function loadAgents(): AgentProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as AgentProfile[];
    return Array.isArray(parsed)
      ? parsed.map((agent) => ({
          ...agent,
          provider: normalizeAgentProvider(agent)
        }))
      : [];
  } catch {
    return [];
  }
}

function normalizeAgentProvider(agent: AgentProfile): AgentProfile['provider'] {
  if (!agent.provider) {
    return getDefaultProviderForRole(agent.role);
  }

  if (agent.provider === 'claude') {
    return getDefaultProviderForRole(agent.role);
  }

  return agent.provider;
}

function createDefaultAgentsForWorkspace(workspace: Workspace): AgentProfile[] {
  const kind = workspace.kind || 'project';
  const isTrading = kind === 'hedge-fund' || kind === 'strategy-pod';
  const planningProfileId = workspace.launch_profiles[0]?.id;
  const opsProfileId = workspace.launch_profiles[1]?.id || planningProfileId;

  const base: AgentProfile[] = isTrading ? [
    {
      id: `${workspace.id}:commander`,
      name: `${workspace.name} Commander`,
      role: 'commander' as const,
      provider: getDefaultProviderForRole('commander'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: `Lead the mission, decompose the objective, route the work to specialists, and synthesize the final operating plan. ${TRADING_OPERATING_DISCIPLINE}`,
      objective: 'Turn goals into a coordinated plan with ranked actions and explicit handoffs.',
      collaboratesWith: ['market-structure', 'derivatives', 'execution', 'risk', 'researcher', 'data-engineer', 'developer', 'ops'],
      accentColor: '#ef4444',
      autoAssignTerminalPurpose: 'planning'
    },
    {
      id: `${workspace.id}:market-structure`,
      name: `${workspace.name} Market Structure`,
      role: 'market-structure' as const,
      provider: getDefaultProviderForRole('market-structure'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: `Map trend, range, volatility regime, key levels, and scenario tree across multiple timeframes. ${TRADING_OPERATING_DISCIPLINE}`,
      objective: 'Explain where price is, where it can go next, and what invalidates the map.',
      collaboratesWith: ['commander', 'execution', 'risk', 'researcher'],
      accentColor: '#38bdf8',
      autoAssignTerminalPurpose: 'market-structure'
    },
    {
      id: `${workspace.id}:derivatives`,
      name: `${workspace.name} Derivatives`,
      role: 'derivatives' as const,
      provider: getDefaultProviderForRole('derivatives'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: `Track funding, open interest, liquidations, crowding, squeeze conditions, and trader positioning. ${TRADING_OPERATING_DISCIPLINE}`,
      objective: 'Surface where positioning is crowded, fragile, or starting to expand.',
      collaboratesWith: ['commander', 'risk', 'execution', 'researcher'],
      accentColor: '#22c55e',
      autoAssignTerminalPurpose: 'derivatives'
    },
    {
      id: `${workspace.id}:execution`,
      name: `${workspace.name} Execution`,
      role: 'execution' as const,
      provider: getDefaultProviderForRole('execution'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: `Translate thesis into triggers, entries, invalidations, sizing guidance, and execution checklists. ${TRADING_OPERATING_DISCIPLINE}`,
      objective: 'Turn analysis into a tradable plan with exact conditions.',
      collaboratesWith: ['commander', 'market-structure', 'risk'],
      accentColor: '#10b981',
      autoAssignTerminalPurpose: 'execution'
    },
    {
      id: `${workspace.id}:risk`,
      name: `${workspace.name} Risk`,
      role: 'risk' as const,
      provider: getDefaultProviderForRole('risk'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: `Challenge the thesis, identify failure modes, define invalidation levels, and surface asymmetric downside. ${TRADING_OPERATING_DISCIPLINE}`,
      objective: 'Prevent low-quality setups and keep risk explicit before action.',
      collaboratesWith: ['commander', 'derivatives', 'execution', 'ops'],
      accentColor: '#f59e0b',
      autoAssignTerminalPurpose: 'risk'
    },
    {
      id: `${workspace.id}:researcher`,
      name: `${workspace.name} Research`,
      role: 'researcher' as const,
      provider: getDefaultProviderForRole('researcher'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: `Fuse notes, videos, postmortems, market context, and external research into concise evidence. ${TRADING_OPERATING_DISCIPLINE}`,
      objective: 'Bring the best prior knowledge into the current decision.',
      collaboratesWith: ['commander', 'market-structure', 'derivatives'],
      accentColor: '#a855f7',
      autoAssignTerminalPurpose: 'research'
    },
    {
      id: `${workspace.id}:backtester`,
      name: `${workspace.name} Backtester`,
      role: 'backtester' as const,
      provider: getDefaultProviderForRole('backtester'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: `Use the existing app and backend backtesting, replay, and paper-trade capabilities instead of inventing results. Prefer the real endpoints and pages already in the repo: strategy library, backtest endpoints, Hyperliquid paper lab, and paper analytics. ${TRADING_OPERATING_DISCIPLINE}`,
      objective: 'Validate strategy ideas with the real backtest and paper workflow already available in this workspace.',
      collaboratesWith: ['researcher', 'market-structure', 'risk', 'data-engineer'],
      accentColor: '#14b8a6',
      autoAssignTerminalPurpose: 'backtesting'
    },
    {
      id: `${workspace.id}:data-engineer`,
      name: `${workspace.name} Data Engineer`,
      role: 'data-engineer' as const,
      provider: getDefaultProviderForRole('data-engineer'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: `Validate APIs, schemas, joins, caches, and data trust before the desk relies on a signal. ${TRADING_OPERATING_DISCIPLINE}`,
      objective: 'Keep the market data layer reliable and explainable.',
      collaboratesWith: ['commander', 'developer', 'ops'],
      accentColor: '#60a5fa',
      autoAssignTerminalPurpose: 'data'
    },
    {
      id: `${workspace.id}:developer`,
      name: `${workspace.name} Dev Agent`,
      role: 'developer' as const,
      provider: getDefaultProviderForRole('developer'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: `Implement concrete product and tooling changes with tests, diffs, and validation. ${TRADING_OPERATING_DISCIPLINE}`,
      objective: 'Ship code changes without hand-wavy outcomes.',
      collaboratesWith: ['commander', 'data-engineer', 'ops'],
      accentColor: '#3b82f6',
      autoAssignTerminalPurpose: 'coding'
    },
    {
      id: `${workspace.id}:ops`,
      name: `${workspace.name} Ops Agent`,
      role: 'ops' as const,
      provider: getDefaultProviderForRole('ops'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: opsProfileId,
      promptTemplate: `Focus on logs, services, process state, terminals, connectivity, and runtime health. ${TRADING_OPERATING_DISCIPLINE}`,
      objective: 'Keep the operating stack healthy while analysis and execution run.',
      collaboratesWith: ['commander', 'data-engineer', 'developer', 'risk'],
      accentColor: '#f97316',
      autoAssignTerminalPurpose: 'ops'
    }
  ] : [
    {
      id: `${workspace.id}:commander`,
      name: `${workspace.name} Commander`,
      role: 'commander' as const,
      provider: getDefaultProviderForRole('commander'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: 'Lead the mission, decompose the objective, route the work to specialists, and synthesize the final operating plan.',
      objective: 'Turn goals into a coordinated plan with ranked actions and explicit handoffs.',
      collaboratesWith: ['researcher', 'developer', 'data-engineer', 'ops'],
      accentColor: '#ef4444',
      autoAssignTerminalPurpose: 'planning'
    },
    {
      id: `${workspace.id}:researcher`,
      name: `${workspace.name} Research`,
      role: 'researcher' as const,
      provider: getDefaultProviderForRole('researcher'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: 'Fuse notes, docs, and prior work into concise decision support.',
      objective: 'Reduce search time and raise context quality.',
      collaboratesWith: ['commander', 'developer'],
      accentColor: '#a855f7',
      autoAssignTerminalPurpose: 'research'
    },
    {
      id: `${workspace.id}:backtester`,
      name: `${workspace.name} Backtester`,
      role: 'backtester' as const,
      provider: getDefaultProviderForRole('backtester'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: 'Use the existing backtest and paper-trade capabilities in this repo to validate ideas before recommending changes.',
      objective: 'Run or inspect the real validation workflow already present in the workspace.',
      collaboratesWith: ['commander', 'researcher', 'developer'],
      accentColor: '#14b8a6',
      autoAssignTerminalPurpose: 'backtesting'
    },
    {
      id: `${workspace.id}:data-engineer`,
      name: `${workspace.name} Data Engineer`,
      role: 'data-engineer' as const,
      provider: getDefaultProviderForRole('data-engineer'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: 'Validate APIs, schemas, caches, and data flows used by the workspace.',
      objective: 'Keep the data layer stable and inspectable.',
      collaboratesWith: ['commander', 'developer', 'ops'],
      accentColor: '#60a5fa',
      autoAssignTerminalPurpose: 'data'
    },
    {
      id: `${workspace.id}:developer`,
      name: `${workspace.name} Dev Agent`,
      role: 'developer' as const,
      provider: getDefaultProviderForRole('developer'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: planningProfileId,
      promptTemplate: 'Implement concrete product and tooling changes with tests, diffs, and validation.',
      objective: 'Ship code changes without hand-wavy outcomes.',
      collaboratesWith: ['commander', 'data-engineer', 'ops'],
      accentColor: '#3b82f6',
      autoAssignTerminalPurpose: 'coding'
    },
    {
      id: `${workspace.id}:ops`,
      name: `${workspace.name} Ops Agent`,
      role: 'ops' as const,
      provider: getDefaultProviderForRole('ops'),
      workspaceId: workspace.id,
      defaultLaunchProfileId: opsProfileId,
      promptTemplate: 'Focus on logs, services, process state, terminals, connectivity, and runtime health.',
      objective: 'Keep the operating stack healthy while work runs.',
      collaboratesWith: ['commander', 'data-engineer', 'developer'],
      accentColor: '#f97316',
      autoAssignTerminalPurpose: 'ops'
    }
  ];

  if (kind === 'command-hub') {
    const allowedRoles = new Set<AgentProfile['role']>(['commander', 'developer', 'ops']);
    return base
      .filter((agent) => allowedRoles.has(agent.role))
      .map((agent) => {
        if (agent.role === 'commander') {
          return {
            ...agent,
            promptTemplate: 'Lead terminal, AI runtime, tunnel, and short operational work. Keep commands explicit and ask for approval before mutating important project state.',
            objective: 'Turn loose operational needs into safe terminal actions and short handoffs.'
          };
        }
        if (agent.role === 'developer') {
          return {
            ...agent,
            promptTemplate: 'Help with local code and tooling work from the command hub. Prefer scoped commands, clear cwd, and verification.',
            objective: 'Ship small project or tooling changes from a terminal-first desk.'
          };
        }
        return {
          ...agent,
          promptTemplate: 'Watch processes, shells, tunnels, services, and runtime health across local projects.',
          objective: 'Keep terminal operations healthy and easy to recover.'
        };
      });
  }

  if (kind === 'project') {
    const allowedRoles = new Set<AgentProfile['role']>(['commander', 'researcher', 'developer', 'ops', 'data-engineer']);
    return base.filter((agent) => allowedRoles.has(agent.role));
  }

  return base;
}

export const AgentProfilesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agents, setAgents] = useState<AgentProfile[]>(() => loadAgents());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  }, [agents]);

  const value = useMemo<AgentProfilesContextValue>(() => ({
    agents,
    upsertAgent: (agent) => {
      setAgents((prev) => {
        const next = prev.filter((item) => item.id !== agent.id);
        return [...next, agent];
      });
    },
    removeAgent: (agentId) => {
      setAgents((prev) => prev.filter((item) => item.id !== agentId));
    },
    ensureWorkspaceAgents: (workspaces) => {
      setAgents((prev) => {
        let next = [...prev];
        for (const workspace of workspaces) {
          const existingForWorkspace = next.filter((agent) => agent.workspaceId === workspace.id);
          const defaults = createDefaultAgentsForWorkspace(workspace);
          const defaultRoles = new Set(defaults.map((agent) => agent.role));
          const defaultIds = new Set(defaults.map((agent) => agent.id));

          next = next.filter((agent) => {
            if (agent.workspaceId !== workspace.id) {
              return true;
            }

            const isGeneratedDefaultId = agent.id === `${workspace.id}:${agent.role}`;
            return !isGeneratedDefaultId || defaultRoles.has(agent.role) || defaultIds.has(agent.id);
          });

          const refreshedExistingForWorkspace = next.filter((agent) => agent.workspaceId === workspace.id);
          if (existingForWorkspace.length === 0) {
            next.push(...defaults);
            continue;
          }

          defaults.forEach((defaultAgent) => {
            const existingMatch = refreshedExistingForWorkspace.find((agent) => agent.role === defaultAgent.role);
            if (!existingMatch) {
              next.push(defaultAgent);
              return;
            }

            if (existingMatch.id === defaultAgent.id) {
              next = next.map((agent) => (
                agent.id === existingMatch.id
                  ? {
                      ...defaultAgent,
                      provider: existingMatch.provider
                    }
                  : agent
              ));
            }
          });
        }
        return next;
      });
    }
  }), [agents]);

  return (
    <AgentProfilesContext.Provider value={value}>
      {children}
    </AgentProfilesContext.Provider>
  );
};

export function useAgentProfilesContext() {
  const context = useContext(AgentProfilesContext);
  if (!context) {
    throw new Error('useAgentProfilesContext must be used within AgentProfilesProvider');
  }
  return context;
}
