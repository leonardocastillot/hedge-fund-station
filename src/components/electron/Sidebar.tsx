import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Blocks,
  Bot,
  Briefcase,
  Cloud,
  Code2,
  Copy,
  Database,
  Edit3,
  FolderOpen,
  Folder,
  MoreHorizontal,
  Plus,
  Rocket,
  Server,
  Terminal,
  Trash2,
  type LucideIcon
} from 'lucide-react';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { useDeskSpaceContext } from '@/features/desks/DeskSpaceContext';
import { useTerminalContext } from '@/contexts/TerminalContext';
import type { DeskBrowserTab, Workspace } from '../../types/electron';
import { navigateCenterPanel } from '../../utils/centerNavigation';
import { publishWorkspaceDockMode } from '@/features/desks/workspaceDockEvents';
import { WorkspaceModal } from './WorkspaceModal';

const REPO_PATH = '/Users/optimus/Documents/hedge_fund_stations';

const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  code: Code2,
  folder: Folder,
  rocket: Rocket,
  chart: BarChart3,
  blocks: Blocks,
  terminal: Terminal,
  database: Database,
  server: Server,
  cloud: Cloud
};

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'strategy-pod';
}

function normalizeAssetSymbol(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function assetWorkspacePaths(repoPath: string, assetSymbol: string) {
  const normalizedAsset = normalizeAssetSymbol(assetSymbol) || 'BTC';
  const assetWorkspaceDir = `${repoPath.replace(/\/$/, '')}/docs/assets/${normalizedAsset}`;
  return {
    assetWorkspaceDir,
    strategyIdeasDir: `${assetWorkspaceDir}/ideas`,
    strategyReviewsDir: `${assetWorkspaceDir}/reviews`
  };
}

function uniqueAssetPodId(workspaces: Workspace[], assetSymbol: string): string {
  const baseId = `strategy-pod-${slugify(assetSymbol)}`;
  const existingIds = new Set(workspaces.map((workspace) => workspace.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }
  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function findRepoPath(workspaces: Workspace[], activeWorkspace: Workspace | null): string {
  return workspaces.find((workspace) => workspace.path.endsWith('hedge_fund_stations'))?.path
    || workspaces.find((workspace) => workspace.kind === 'hedge-fund')?.path
    || (activeWorkspace?.path.endsWith('hedge_fund_stations') ? activeWorkspace.path : undefined)
    || REPO_PATH;
}

function assetBrowserTabs(assetSymbol: string): DeskBrowserTab[] {
  const symbol = normalizeAssetSymbol(assetSymbol) || 'BTC';
  return [
    {
      id: `tradingview-${symbol.toLowerCase()}`,
      title: `TradingView ${symbol}`,
      url: `https://www.tradingview.com/chart/?symbol=BINANCE:${encodeURIComponent(`${symbol}USDT`)}`
    },
    {
      id: 'gateway-health',
      title: 'Gateway Health',
      url: 'http://127.0.0.1:18001/health'
    }
  ];
}

function buildAssetPod(params: {
  id: string;
  repoPath: string;
  assetSymbol: string;
  assetDisplayName?: string;
  shell: string;
}): Workspace {
  const assetSymbol = normalizeAssetSymbol(params.assetSymbol) || 'BTC';
  const assetDisplayName = params.assetDisplayName?.trim() || assetSymbol;
  const assetPaths = assetWorkspacePaths(params.repoPath, assetSymbol);
  return {
    id: params.id,
    name: assetDisplayName,
    path: params.repoPath,
    kind: 'strategy-pod',
    description: `Asset pod for ${assetSymbol} strategy research sessions.`,
    pinned: true,
    default_route: '/workbench',
    icon: 'blocks',
    color: '#22d3ee',
    default_commands: [
      'rtk npm run agent:brief',
      'rtk npm run hf:status',
      'rtk npm run gateway:probe'
    ],
    launch_profiles: [
      {
        id: 'strategy-agentic-desk',
        name: 'Strategy Agentic Desk',
        steps: [
          { command: 'rtk npm run agent:brief', delayMs: 0 },
          { command: 'rtk npm run hf:status', delayMs: 400 }
        ]
      },
      {
        id: 'strategy-review',
        name: 'Strategy Review',
        steps: [
          { command: 'rtk npm run agent:check', delayMs: 0 },
          { command: 'rtk npm run hf:status', delayMs: 500 }
        ]
      }
    ],
    browser_tabs: assetBrowserTabs(assetSymbol),
    shell: params.shell,
    obsidian_vault_path: undefined,
    asset_symbol: assetSymbol,
    asset_display_name: assetDisplayName,
    asset_workspace_dir: assetPaths.assetWorkspaceDir,
    strategy_ideas_dir: assetPaths.strategyIdeasDir,
    strategy_reviews_dir: assetPaths.strategyReviewsDir,
    linked_strategy_ids: [],
    active_strategy_id: undefined,
    strategy_symbol: assetSymbol,
    strategy_pod_status: 'draft'
  };
}

function sortWorkspaces(workspaces: Workspace[]): Workspace[] {
  const kindOrder: Record<Workspace['kind'], number> = {
    'strategy-pod': 0,
    'hedge-fund': 1,
    'command-hub': 2,
    ops: 3,
    project: 4
  };

  return [...workspaces].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }

    const leftKind = kindOrder[a.kind] ?? 99;
    const rightKind = kindOrder[b.kind] ?? 99;
    if (leftKind !== rightKind) {
      return leftKind - rightKind;
    }

    return a.name.localeCompare(b.name);
  });
}

export const Sidebar: React.FC = () => {
  const {
    workspaces,
    activeWorkspace,
    isLoading,
    setActiveWorkspace,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace
  } = useWorkspaceContext();
  const { setDeskState } = useDeskSpaceContext();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [assetSymbolInput, setAssetSymbolInput] = useState('BTC');
  const [assetDisplayInput, setAssetDisplayInput] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const { terminals, createTerminal, setActiveTerminal } = useTerminalContext();

  const strategyPodWorkspaces = useMemo(
    () => sortWorkspaces(workspaces.filter((workspace) => workspace.kind === 'strategy-pod')),
    [workspaces]
  );

  const activateWorkspace = async (workspaceId: string, dockMode: 'inspector' | 'code' | 'browser' | 'runs' = 'inspector') => {
    await setActiveWorkspace(workspaceId);
    setDeskState(workspaceId, { activeView: 'overview' });
    navigateCenterPanel('/workbench');
    publishWorkspaceDockMode(dockMode, workspaceId);
  };

  const handleCreateAssetPod = async () => {
    const assetSymbol = normalizeAssetSymbol(assetSymbolInput);
    if (!assetSymbol) {
      setCreatorError('Enter a ticker symbol.');
      return;
    }
    if (strategyPodWorkspaces.some((workspace) => (workspace.asset_symbol || workspace.strategy_symbol || '').toUpperCase() === assetSymbol)) {
      setCreatorError(`Strategy Pod for ${assetSymbol} already exists.`);
      return;
    }
    const repoPath = findRepoPath(workspaces, activeWorkspace);
    const workspace = buildAssetPod({
      id: uniqueAssetPodId(workspaces, assetSymbol),
      repoPath,
      assetSymbol,
      assetDisplayName: assetDisplayInput,
      shell: activeWorkspace?.shell || '/bin/zsh'
    });
    await createWorkspace(workspace);
    setCreatorOpen(false);
    setCreatorError(null);
    setAssetSymbolInput('BTC');
    setAssetDisplayInput('');
    await activateWorkspace(workspace.id, 'inspector');
  };

  const handleDuplicate = async (workspace: Workspace) => {
    const sourceSymbol = workspace.asset_symbol || workspace.strategy_symbol || workspace.name;
    const copySymbol = normalizeAssetSymbol(`${sourceSymbol}2`);
    const copyName = `${workspace.name} Copy`;
    const copy: Workspace = {
      ...workspace,
      id: uniqueAssetPodId(workspaces, copySymbol),
      name: copyName,
      asset_symbol: copySymbol,
      asset_display_name: copyName,
      pinned: workspace.kind === 'strategy-pod' ? workspace.pinned : false
    };
    await createWorkspace(copy);
    await activateWorkspace(copy.id, workspace.kind === 'strategy-pod' ? 'inspector' : 'code');
  };

  const handleDeletePod = async (workspace: Workspace) => {
    const confirmed = window.confirm(
      workspace.kind === 'strategy-pod'
        ? `Delete local pod "${workspace.name}"? This will not delete strategy files or backend artifacts.`
        : `Delete local workspace "${workspace.name}"? This will not delete files on disk.`
    );
    if (!confirmed) {
      return;
    }
    await deleteWorkspace(workspace.id);
  };

  const handleOpenStrategyShell = async (workspace: Workspace) => {
    await setActiveWorkspace(workspace.id);
    setDeskState(workspace.id, { activeView: 'overview' });
    navigateCenterPanel('/workbench');
    const cwd = workspace.strategy_backend_dir || workspace.path;
    const terminalId = createTerminal(
      cwd,
      workspace.shell,
      `${workspace.asset_symbol || workspace.name} Shell`,
      undefined,
      {
        workspaceId: workspace.id,
        terminalPurpose: 'strategy-shell',
        assetSymbol: workspace.asset_symbol || workspace.strategy_symbol,
        strategySessionId: `manual-${Date.now()}`,
        strategySessionTitle: `${workspace.asset_symbol || workspace.name} manual shell`,
        strategySessionStatus: 'draft'
      }
    );
    setActiveTerminal(terminalId);
    publishWorkspaceDockMode('code', workspace.id);
  };

  const handleSaveWorkspace = async (workspace: Workspace) => {
    const { id, ...updates } = workspace;
    await updateWorkspace(id, updates);
    if (activeWorkspace?.id === id) {
      publishWorkspaceDockMode(workspace.kind === 'strategy-pod' ? 'inspector' : 'code', id);
    }
  };

  if (isLoading) {
    return (
      <div style={loadingStyle}>
        Loading...
      </div>
    );
  }

  return (
    <aside style={sidebarStyle} aria-label="Strategy pod switcher">
      <header style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrowStyle}>Strategy Pods</div>
          <div style={subtleTextStyle}>
            {strategyPodWorkspaces.length} pods
          </div>
        </div>
        <button
          type="button"
          title="Create strategy pod"
          aria-label="Create strategy pod"
          onClick={() => setCreatorOpen(true)}
          style={addButtonStyle}
        >
          <Plus size={15} />
        </button>
      </header>

      <div style={workspaceListStyle}>
        {strategyPodWorkspaces.length === 0 ? (
          <div style={emptyStateStyle}>No strategy pods yet.</div>
        ) : (
          strategyPodWorkspaces.map((workspace) => {
            const sessionCount = terminals.filter((terminal) => terminal.workspaceId === workspace.id).length;
            const linkedCount = workspace.linked_strategy_ids?.length || (workspace.strategy_id ? 1 : 0);
            return (
              <WorkspaceListItem
                key={workspace.id}
                workspace={workspace}
                linkedCount={linkedCount}
                sessionCount={sessionCount}
                isActive={activeWorkspace?.id === workspace.id}
                menuOpen={openMenuId === workspace.id}
                onSelect={() => void activateWorkspace(workspace.id, 'inspector')}
                onToggleMenu={() => setOpenMenuId((current) => current === workspace.id ? null : workspace.id)}
                onOpenAgentView={() => {
                  setOpenMenuId(null);
                  void activateWorkspace(workspace.id, 'inspector');
                }}
                onEdit={() => {
                  setOpenMenuId(null);
                  setEditingWorkspace(workspace);
                }}
                onDuplicate={() => {
                  setOpenMenuId(null);
                  void handleDuplicate(workspace).catch((error) => window.alert(error instanceof Error ? error.message : 'Duplicate failed.'));
                }}
                onDelete={() => {
                  setOpenMenuId(null);
                  void handleDeletePod(workspace).catch((error) => window.alert(error instanceof Error ? error.message : 'Delete failed.'));
                }}
                onOpenCli={() => {
                  setOpenMenuId(null);
                  void activateWorkspace(workspace.id, 'code');
                }}
                onOpenInspector={() => {
                  setOpenMenuId(null);
                  void activateWorkspace(workspace.id, 'inspector');
                }}
                onOpenStrategyShell={() => {
                  setOpenMenuId(null);
                  void handleOpenStrategyShell(workspace).catch((error) => window.alert(error instanceof Error ? error.message : 'Could not open strategy shell.'));
                }}
              />
            );
          })
        )}
      </div>

      <PodCreatorModal
        open={creatorOpen}
        error={creatorError}
        assetSymbol={assetSymbolInput}
        assetDisplayName={assetDisplayInput}
        onAssetSymbol={setAssetSymbolInput}
        onAssetDisplayName={setAssetDisplayInput}
        onClose={() => {
          setCreatorOpen(false);
          setCreatorError(null);
        }}
        onCreate={() => void handleCreateAssetPod().catch((error) => setCreatorError(error instanceof Error ? error.message : 'Could not create asset pod.'))}
      />

      <WorkspaceModal
        isOpen={Boolean(editingWorkspace)}
        existingWorkspace={editingWorkspace}
        onClose={() => setEditingWorkspace(null)}
        onSave={handleSaveWorkspace}
      />
    </aside>
  );
};

function WorkspaceListItem({
  workspace,
  linkedCount,
  sessionCount,
  isActive,
  menuOpen,
  onSelect,
  onToggleMenu,
  onOpenAgentView,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenCli,
  onOpenInspector,
  onOpenStrategyShell
}: {
  workspace: Workspace;
  linkedCount: number;
  sessionCount: number;
  isActive: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onToggleMenu: () => void;
  onOpenAgentView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenCli: () => void;
  onOpenInspector: () => void;
  onOpenStrategyShell: () => void;
}) {
  const Icon = workspace.kind === 'strategy-pod' ? Blocks : ICONS[workspace.icon] || Folder;
  const assetSymbol = workspace.asset_symbol || workspace.strategy_symbol || workspace.name;
  const activeStrategy = workspace.active_strategy_id || workspace.strategy_id || 'draft strategy';
  const meta = `${assetSymbol} / ${linkedCount} strategies / ${sessionCount} sessions / ${activeStrategy}`;

  return (
    <div
      style={{
        ...workspaceItemShellStyle,
        border: isActive ? '1px solid var(--app-border-strong)' : workspaceItemShellStyle.border,
        background: isActive ? 'rgba(255, 255, 255, 0.042)' : workspaceItemShellStyle.background,
        boxShadow: isActive ? '0 0 12px var(--app-glow)' : 'none'
      }}
      title={`${assetSymbol}\nrepo: ${workspace.path}\nactive strategy: ${activeStrategy}\nbackend: ${workspace.strategy_backend_dir || 'not linked'}\ndocs: ${workspace.strategy_docs_path || 'not linked'}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? 'page' : undefined}
        style={workspaceSelectButtonStyle}
      >
        <span style={{
          ...workspaceIconStyle,
          background: isActive ? 'var(--app-focus)' : workspaceIconStyle.background,
          border: isActive ? '1px solid var(--app-border-strong)' : workspaceIconStyle.border
        }}>
          <Icon size={15} />
        </span>
        <span style={workspaceTextBlockStyle}>
          <span style={workspaceTopLineStyle}>
            <span style={workspaceNameStyle}>{workspace.name}</span>
            {isActive ? <span style={activeDotStyle} aria-label="Active workspace" /> : null}
          </span>
          <span style={workspaceMetaStyle}>{meta}</span>
        </span>
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleMenu();
        }}
        title="Pod actions"
        aria-label="Pod actions"
        style={workspaceMenuButtonStyle}
      >
        <MoreHorizontal size={14} />
      </button>

      {menuOpen ? (
        <div style={workspaceMenuStyle}>
          <MenuItem icon={<Bot size={13} />} label="Agent View" onClick={onOpenAgentView} />
          <MenuItem icon={<BarChart3 size={13} />} label="Open Inspector" onClick={onOpenInspector} />
          <MenuItem icon={<Terminal size={13} />} label="Open Agent CLI" onClick={onOpenCli} />
          <MenuItem icon={<FolderOpen size={13} />} label="Open Strategy Shell" onClick={onOpenStrategyShell} />
          <MenuItem icon={<Edit3 size={13} />} label="Edit" onClick={onEdit} />
          <MenuItem icon={<Copy size={13} />} label="Duplicate" onClick={onDuplicate} />
          <MenuItem icon={<Trash2 size={13} />} label="Delete Pod" onClick={onDelete} danger />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...menuItemStyle,
        color: danger ? '#fca5a5' : menuItemStyle.color
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PodCreatorModal({
  open,
  error,
  assetSymbol,
  assetDisplayName,
  onAssetSymbol,
  onAssetDisplayName,
  onClose,
  onCreate
}: {
  open: boolean;
  error: string | null;
  assetSymbol: string;
  assetDisplayName: string;
  onAssetSymbol: (value: string) => void;
  onAssetDisplayName: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div style={modalBackdropStyle}>
      <section style={podModalStyle}>
        <div style={modalHeaderStyle}>
          <div>
            <div style={eyebrowStyle}>New Asset Pod</div>
            <h2 style={modalTitleStyle}>Create a ticker workspace</h2>
            <p style={modalCopyStyle}>Asset pods group terminals, agent sessions, browser tabs, and linked strategies for one ticker. Strategy files are created later from the inspector or Strategy Factory.</p>
          </div>
          <button type="button" onClick={onClose} style={modalCloseButtonStyle}>X</button>
        </div>

        <div style={podChoiceGridStyle}>
          <section style={podChoiceCardStyle}>
            <div style={choiceTitleStyle}>Ticker</div>
            <div style={choiceCopyStyle}>Use the exchange symbol. Example: BTC, ETH, SOL, HYPE.</div>
            <input
              type="text"
              value={assetSymbol}
              onChange={(event) => onAssetSymbol(event.target.value.toUpperCase())}
              placeholder="BTC"
              style={creatorInputStyle}
            />
          </section>

          <section style={podChoiceCardStyle}>
            <div style={choiceTitleStyle}>Display</div>
            <div style={choiceCopyStyle}>Optional label for the left rail. Leave empty to use the ticker.</div>
            <input
              type="text"
              value={assetDisplayName}
              onChange={(event) => onAssetDisplayName(event.target.value)}
              placeholder="Bitcoin"
              style={creatorInputStyle}
            />
          </section>
        </div>

        <div style={modalFooterStyle}>
          <button type="button" onClick={onCreate} style={creatorPrimaryButtonStyle}>
            Create Asset Pod
          </button>
        </div>

        {error ? <div style={creatorErrorStyle}>{error}</div> : null}
      </section>
    </div>
  );
}

const loadingStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'var(--app-surface)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--app-muted)'
};

const sidebarStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'rgba(4, 8, 16, 0.35)',
  backdropFilter: 'blur(28px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(28px) saturate(1.2)',
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset -1px 0 0 rgba(255, 255, 255, 0.02)'
};

const headerStyle: React.CSSProperties = {
  padding: '12px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px'
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 800,
  color: 'var(--app-accent)',
  textTransform: 'uppercase',
  letterSpacing: '0.12em'
};

const subtleTextStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '10px',
  marginTop: '3px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const addButtonStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '6px',
  color: 'var(--app-accent)',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  flex: '0 0 auto'
};

const workspaceListStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'grid',
  alignContent: 'start',
  gap: '5px',
  padding: '8px'
};

const workspaceItemShellStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  minHeight: '48px',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.025)',
  background: 'rgba(255, 255, 255, 0.01)',
  color: 'var(--app-text)',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 24px',
  alignItems: 'center',
  transition: 'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease'
};

const workspaceSelectButtonStyle: React.CSSProperties = {
  minWidth: 0,
  minHeight: '48px',
  padding: '7px 4px 7px 8px',
  border: 0,
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
  display: 'grid',
  gridTemplateColumns: '30px minmax(0, 1fr)',
  gap: '8px',
  alignItems: 'center'
};

const workspaceMenuButtonStyle: React.CSSProperties = {
  width: '24px',
  height: '30px',
  border: 0,
  borderLeft: '1px solid rgba(255,255,255,0.04)',
  background: 'transparent',
  color: 'var(--app-subtle)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0
};

const workspaceIconStyle: React.CSSProperties = {
  width: '30px',
  height: '30px',
  borderRadius: '8px',
  background: 'var(--app-panel-muted)',
  border: '1px solid var(--app-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--app-text)',
  fontSize: '10px',
  fontWeight: 800,
  flexShrink: 0
};

const workspaceTextBlockStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: '3px'
};

const workspaceTopLineStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
};

const workspaceNameStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'block',
  fontSize: '12px',
  fontWeight: 800,
  lineHeight: 1.15,
  color: 'var(--app-text)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const workspaceMetaStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'block',
  color: 'var(--app-subtle)',
  fontSize: '10px',
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const activeDotStyle: React.CSSProperties = {
  width: '7px',
  height: '7px',
  borderRadius: '999px',
  background: 'var(--app-accent)',
  boxShadow: '0 0 10px var(--app-glow)',
  flex: '0 0 auto'
};

const workspaceMenuStyle: React.CSSProperties = {
  position: 'absolute',
  right: '4px',
  top: '42px',
  zIndex: 20,
  width: '170px',
  borderRadius: '8px',
  border: '1px solid var(--app-border)',
  background: 'rgba(8, 13, 24, 0.98)',
  boxShadow: '0 16px 48px rgba(0,0,0,0.42)',
  padding: '5px',
  display: 'grid',
  gap: '2px'
};

const menuItemStyle: React.CSSProperties = {
  height: '30px',
  border: 0,
  borderRadius: '6px',
  background: 'transparent',
  color: 'var(--app-text)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 8px',
  fontSize: '11px',
  fontWeight: 700,
  textAlign: 'left'
};

const emptyStateStyle: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px dashed var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-muted)',
  fontSize: '11px',
  lineHeight: 1.45,
  padding: '10px'
};

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9998,
  background: 'rgba(2, 6, 23, 0.72)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px'
};

const podModalStyle: React.CSSProperties = {
  width: 'min(780px, 100%)',
  maxHeight: '88vh',
  borderRadius: '12px',
  border: '1px solid rgba(34, 211, 238, 0.22)',
  background: 'linear-gradient(180deg, rgba(10, 14, 24, 0.98) 0%, rgba(5, 7, 11, 0.98) 100%)',
  boxShadow: '0 30px 120px rgba(0, 0, 0, 0.45)',
  overflow: 'auto'
};

const modalHeaderStyle: React.CSSProperties = {
  padding: '16px 18px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px'
};

const modalTitleStyle: React.CSSProperties = {
  margin: '6px 0 4px 0',
  color: '#f9fafb',
  fontSize: '18px',
  fontWeight: 800
};

const modalCopyStyle: React.CSSProperties = {
  margin: 0,
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: 1.5,
  maxWidth: '520px'
};

const modalCloseButtonStyle: React.CSSProperties = {
  width: '34px',
  height: '34px',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  background: 'rgba(255, 255, 255, 0.03)',
  color: '#9ca3af',
  cursor: 'pointer',
  fontSize: '15px',
  fontWeight: 700
};

const podChoiceGridStyle: React.CSSProperties = {
  padding: '16px 18px',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '12px'
};

const podChoiceCardStyle: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  background: 'rgba(255, 255, 255, 0.025)',
  padding: '12px',
  display: 'grid',
  gap: '10px'
};

const choiceTitleStyle: React.CSSProperties = {
  color: '#f9fafb',
  fontSize: '13px',
  fontWeight: 800
};

const choiceCopyStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '11px',
  lineHeight: 1.45
};

const creatorInputStyle: React.CSSProperties = {
  width: '100%',
  height: '36px',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  background: '#0b0f19',
  color: '#f9fafb',
  padding: '0 10px',
  fontSize: '12px',
  outline: 'none'
};

const creatorPrimaryButtonStyle: React.CSSProperties = {
  height: '36px',
  borderRadius: '8px',
  border: '1px solid rgba(34, 211, 238, 0.3)',
  background: 'rgba(34, 211, 238, 0.14)',
  color: '#cffafe',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 800
};

const modalFooterStyle: React.CSSProperties = {
  display: 'grid',
  padding: '0 18px 16px',
  justifyContent: 'end'
};

const creatorErrorStyle: React.CSSProperties = {
  margin: '0 18px 16px',
  borderRadius: '8px',
  border: '1px solid rgba(248, 113, 113, 0.28)',
  background: 'rgba(239, 68, 68, 0.12)',
  color: '#fecaca',
  padding: '10px 12px',
  fontSize: '12px',
  lineHeight: 1.45
};
