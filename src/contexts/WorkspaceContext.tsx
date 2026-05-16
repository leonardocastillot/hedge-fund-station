import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Workspace } from '../types/electron';
import { useAgentProfilesContext } from './AgentProfilesContext';

const WORKSPACE_KINDS = new Set(['strategy-pod', 'hedge-fund', 'command-hub', 'project', 'ops']);
const FALLBACK_REPO_PATH = '/Users/optimus/Documents/hedge_fund_stations';

function assetWorkspacePaths(repoPath: string, assetSymbol: string) {
  const normalizedAsset = assetSymbol.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'BTC';
  const assetWorkspaceDir = `${repoPath.replace(/\/$/, '')}/docs/assets/${normalizedAsset}`;
  return {
    assetWorkspaceDir,
    strategyIdeasDir: `${assetWorkspaceDir}/ideas`,
    strategyReviewsDir: `${assetWorkspaceDir}/reviews`
  };
}

function uniqueStrategyIds(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean)));
}

function createFallbackStrategyPod(): Workspace {
  const assetPaths = assetWorkspacePaths(FALLBACK_REPO_PATH, 'BTC');
  return {
    id: 'strategy-pod-btc-convex-cycle-trend',
    name: 'BTC',
    path: FALLBACK_REPO_PATH,
    kind: 'strategy-pod',
    description: 'Asset pod for BTC strategy research sessions.',
    pinned: true,
    default_route: '/workbench',
    icon: 'blocks',
    color: '#22d3ee',
    default_commands: [
      'rtk npm run agent:brief',
      'rtk npm run hf:status -- --strategy btc_convex_cycle_trend',
      'rtk npm run hf:backtest -- --strategy btc_convex_cycle_trend',
      'rtk npm run hf:validate -- --strategy btc_convex_cycle_trend'
    ],
    launch_profiles: [],
    browser_tabs: [
      {
        id: 'tradingview-btc',
        title: 'TradingView BTC',
        url: 'https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT'
      },
      {
        id: 'gateway-health',
        title: 'Gateway Health',
        url: 'http://127.0.0.1:18001/health'
      }
    ],
    shell: '/bin/zsh',
    asset_symbol: 'BTC',
    asset_display_name: 'BTC',
    asset_workspace_dir: assetPaths.assetWorkspaceDir,
    strategy_ideas_dir: assetPaths.strategyIdeasDir,
    strategy_reviews_dir: assetPaths.strategyReviewsDir,
    linked_strategy_ids: ['btc_convex_cycle_trend'],
    active_strategy_id: 'btc_convex_cycle_trend',
    strategy_id: 'btc_convex_cycle_trend',
    strategy_display_name: 'BTC Convex Cycle Trend',
    strategy_symbol: 'BTC',
    strategy_pod_status: 'catalog',
    strategy_backend_dir: `${FALLBACK_REPO_PATH}/backend/hyperliquid_gateway/strategies/btc_convex_cycle_trend`,
    strategy_docs_path: `${FALLBACK_REPO_PATH}/docs/strategies/btc-convex-cycle-trend.md`
  };
}

function normalizeWorkspaces(workspaces: Workspace[]): Workspace[] {
  return workspaces.map((workspace) => {
    const kind = WORKSPACE_KINDS.has(workspace.kind) ? workspace.kind : 'project';
    const legacyStrategyId = typeof workspace.strategy_id === 'string' && workspace.strategy_id.trim()
      ? workspace.strategy_id.trim()
      : undefined;
    const linkedStrategyIds = uniqueStrategyIds([
      ...(Array.isArray(workspace.linked_strategy_ids) ? workspace.linked_strategy_ids : []),
      workspace.active_strategy_id,
      legacyStrategyId
    ]);
    const activeStrategyId = typeof workspace.active_strategy_id === 'string' && workspace.active_strategy_id.trim()
      ? workspace.active_strategy_id.trim()
      : linkedStrategyIds[0];
    const assetSymbol = typeof workspace.asset_symbol === 'string' && workspace.asset_symbol.trim()
      ? workspace.asset_symbol.trim().toUpperCase()
      : typeof workspace.strategy_symbol === 'string' && workspace.strategy_symbol.trim()
        ? workspace.strategy_symbol.trim().toUpperCase()
        : kind === 'strategy-pod'
          ? 'BTC'
          : undefined;
    const assetDisplayName = typeof workspace.asset_display_name === 'string' && workspace.asset_display_name.trim()
      ? workspace.asset_display_name.trim()
      : assetSymbol;
    const assetPaths = kind === 'strategy-pod' ? assetWorkspacePaths(workspace.path, assetSymbol || 'BTC') : undefined;
    return {
      ...workspace,
      kind,
      name: kind === 'strategy-pod' && assetDisplayName ? assetDisplayName : workspace.name,
      description: typeof workspace.description === 'string' ? workspace.description : '',
      pinned: typeof workspace.pinned === 'boolean' ? workspace.pinned : false,
      default_route: typeof workspace.default_route === 'string' ? workspace.default_route : '/workbench',
      default_commands: Array.isArray(workspace.default_commands) ? workspace.default_commands : [],
      launch_profiles: Array.isArray(workspace.launch_profiles) ? workspace.launch_profiles : [],
      browser_tabs: Array.isArray(workspace.browser_tabs) ? workspace.browser_tabs : [],
      obsidian_vault_path: typeof workspace.obsidian_vault_path === 'string' ? workspace.obsidian_vault_path : undefined,
      asset_symbol: kind === 'strategy-pod' ? assetSymbol : undefined,
      asset_display_name: kind === 'strategy-pod' ? assetDisplayName : undefined,
      asset_workspace_dir: kind === 'strategy-pod' ? assetPaths?.assetWorkspaceDir : undefined,
      strategy_ideas_dir: kind === 'strategy-pod' ? assetPaths?.strategyIdeasDir : undefined,
      strategy_reviews_dir: kind === 'strategy-pod' ? assetPaths?.strategyReviewsDir : undefined,
      linked_strategy_ids: kind === 'strategy-pod' ? linkedStrategyIds : undefined,
      active_strategy_id: kind === 'strategy-pod' ? activeStrategyId : undefined,
      strategy_id: kind === 'strategy-pod' ? activeStrategyId : undefined,
      strategy_display_name: typeof workspace.strategy_display_name === 'string' && workspace.strategy_display_name.trim()
        ? workspace.strategy_display_name.trim()
        : undefined,
      strategy_symbol: typeof workspace.strategy_symbol === 'string' && workspace.strategy_symbol.trim()
        ? workspace.strategy_symbol.trim().toUpperCase()
        : assetSymbol,
      strategy_pod_status: workspace.strategy_pod_status === 'draft' || workspace.strategy_pod_status === 'catalog'
        ? workspace.strategy_pod_status
        : kind === 'strategy-pod'
          ? activeStrategyId ? 'catalog' : 'draft'
          : undefined,
      strategy_backend_dir: typeof workspace.strategy_backend_dir === 'string' && workspace.strategy_backend_dir.trim()
        ? workspace.strategy_backend_dir.trim()
        : undefined,
      strategy_docs_path: typeof workspace.strategy_docs_path === 'string' && workspace.strategy_docs_path.trim()
        ? workspace.strategy_docs_path.trim()
        : undefined
    };
  });
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  setActiveWorkspace: (id: string) => Promise<void>;
  createWorkspace: (workspace: Workspace) => Promise<void>;
  inferWorkspaceFromPath: (workspacePath: string) => Promise<Workspace>;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { ensureWorkspaceAgents } = useAgentProfilesContext();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load workspaces on mount
  const refreshWorkspaces = useCallback(async () => {
    try {
      if (!window.electronAPI?.workspace) {
        const fallbackWorkspaces = normalizeWorkspaces([createFallbackStrategyPod()]);
        setWorkspaces(fallbackWorkspaces);
        setActiveWorkspaceState(fallbackWorkspaces[0] || null);
        ensureWorkspaceAgents(fallbackWorkspaces);
        return;
      }

      const [allWorkspaces, active] = await Promise.all([
        window.electronAPI.workspace.getAll(),
        window.electronAPI.workspace.getActive()
      ]);

      const normalizedWorkspaces = normalizeWorkspaces(allWorkspaces);
      const normalizedActive = active
        ? normalizeWorkspaces([active])[0]
        : null;

      setWorkspaces(normalizedWorkspaces);
      setActiveWorkspaceState(normalizedActive);
      ensureWorkspaceAgents(normalizedWorkspaces);
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const setActiveWorkspace = useCallback(async (id: string) => {
    try {
      if (!window.electronAPI?.workspace) {
        const workspace = workspaces.find((item) => item.id === id) || null;
        setActiveWorkspaceState(workspace);
        return;
      }

      await window.electronAPI.workspace.setActive(id);
      const active = await window.electronAPI.workspace.getActive();
      setActiveWorkspaceState(active ? normalizeWorkspaces([active])[0] : null);
    } catch (error) {
      console.error('❌ Failed to set active workspace:', error);
      throw error;
    }
  }, [workspaces]);

  const createWorkspace = useCallback(async (workspace: Workspace) => {
    try {
      if (!window.electronAPI?.workspace) {
        const normalized = normalizeWorkspaces([...workspaces, workspace]);
        setWorkspaces(normalized);
        ensureWorkspaceAgents(normalized);
        return;
      }

      await window.electronAPI.workspace.create(workspace);
      await refreshWorkspaces();
    } catch (error) {
      console.error('Failed to create workspace:', error);
      throw error;
    }
  }, [ensureWorkspaceAgents, refreshWorkspaces, workspaces]);

  const inferWorkspaceFromPath = useCallback(async (workspacePath: string) => {
    if (!window.electronAPI?.workspace) {
      throw new Error('Workspace API is not available.');
    }

    return window.electronAPI.workspace.inferFromPath(workspacePath);
  }, []);

  const updateWorkspace = useCallback(async (id: string, updates: Partial<Workspace>) => {
    try {
      if (!window.electronAPI?.workspace) {
        const normalized = normalizeWorkspaces(workspaces.map((workspace) => (
          workspace.id === id ? { ...workspace, ...updates } : workspace
        )));
        setWorkspaces(normalized);
        setActiveWorkspaceState((active) => (
          active?.id === id
            ? normalized.find((workspace) => workspace.id === id) || active
            : active
        ));
        ensureWorkspaceAgents(normalized);
        return;
      }

      await window.electronAPI.workspace.update(id, updates);
      await refreshWorkspaces();
    } catch (error) {
      console.error('Failed to update workspace:', error);
      throw error;
    }
  }, [ensureWorkspaceAgents, refreshWorkspaces, workspaces]);

  const deleteWorkspace = useCallback(async (id: string) => {
    try {
      if (!window.electronAPI?.workspace) {
        const normalized = normalizeWorkspaces(workspaces.filter((workspace) => workspace.id !== id));
        setWorkspaces(normalized);
        setActiveWorkspaceState((active) => (
          active?.id === id ? normalized.find((workspace) => workspace.kind === 'strategy-pod') || null : active
        ));
        ensureWorkspaceAgents(normalized);
        return;
      }

      await window.electronAPI.workspace.delete(id);
      await refreshWorkspaces();
    } catch (error) {
      console.error('Failed to delete workspace:', error);
      throw error;
    }
  }, [ensureWorkspaceAgents, refreshWorkspaces, workspaces]);

  const value: WorkspaceContextValue = {
    workspaces,
    activeWorkspace,
    isLoading,
    setActiveWorkspace,
    createWorkspace,
    inferWorkspaceFromPath,
    updateWorkspace,
    deleteWorkspace,
    refreshWorkspaces
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspaceContext = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspaceContext must be used within WorkspaceProvider');
  }
  return context;
};
