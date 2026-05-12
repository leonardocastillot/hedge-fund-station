import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Pencil,
  Plus,
  RadioTower,
  ShieldCheck,
  Terminal,
  Trash2
} from 'lucide-react';
import { useDeskHistoryContext } from '../../contexts/DeskHistoryContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { useTerminalContext } from '../../contexts/TerminalContext';
import { WorkspaceModal } from './WorkspaceModal';
import type { Workspace } from '../../types/electron';
import { buildTerminalLabel, getLaunchProfileCommandSummary, launchProfileSequence } from '../../utils/workspaceLaunch';
import {
  CENTER_ROUTE_CHANGED_EVENT,
  navigateCenterPanel,
  type CenterRouteChangedDetail
} from '../../utils/centerNavigation';
import { hyperliquidService, type HyperliquidMarketRow } from '../../services/hyperliquidService';
import { buildOverviewTrapDecisions, type TrapAction, type TrapDecision, type TrapSide } from '@/features/liquidations/trapDecisions';
import { useMarketPolling } from '@/hooks/useMarketPolling';
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';
import { TRADING_STATIONS, isStationRoute, type StationDefinition } from '@/features/stations/stationRegistry';

const ICONS: Record<string, string> = {
  briefcase: 'BK',
  code: '</>',
  folder: 'DIR',
  rocket: 'RUN',
  chart: 'MKT',
  database: 'DB',
  server: 'SRV',
  cloud: 'CLD'
};

function isPrimaryHedgeFundDesk(workspace: Workspace): boolean {
  const haystack = `${workspace.id} ${workspace.name}`.toLowerCase();
  return haystack.includes('hedge') || haystack.includes('trading');
}

export const Sidebar: React.FC = () => {
  const performanceProfile = usePerformanceProfile();
  const {
    workspaces,
    activeWorkspace,
    isLoading,
    setActiveWorkspace,
    createWorkspace,
    inferWorkspaceFromPath,
    updateWorkspace,
    deleteWorkspace
  } = useWorkspaceContext();
  const { createTerminal } = useTerminalContext();
  const { recordLaunch } = useDeskHistoryContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [liquidationMarkets, setLiquidationMarkets] = useState<HyperliquidMarketRow[]>([]);
  const [liquidationsUpdatedAt, setLiquidationsUpdatedAt] = useState<number | null>(null);
  const [liquidationsError, setLiquidationsError] = useState<string | null>(null);
  const [liquidationsStale, setLiquidationsStale] = useState(false);
  const [hasLiquidationSnapshot, setHasLiquidationSnapshot] = useState(false);
  const [isLiquidationsCollapsed, setIsLiquidationsCollapsed] = usePersistedBoolean(
    'hedge-station:sidebar:liquidation-traps-collapsed',
    performanceProfile !== 'full'
  );
  const [areLaunchProfilesCollapsed, setAreLaunchProfilesCollapsed] = usePersistedBoolean(
    'hedge-station:sidebar:launch-profiles-collapsed',
    false
  );
  const [areSavedCommandsCollapsed, setAreSavedCommandsCollapsed] = usePersistedBoolean(
    'hedge-station:sidebar:saved-commands-collapsed',
    false
  );
  const [activeCenterPath, setActiveCenterPath] = useState(() => (
    typeof window === 'undefined' ? '/station/hedge-fund' : window.location.pathname || '/station/hedge-fund'
  ));

  const sortedWorkspaces = useMemo(
    () => [...workspaces].sort((a, b) => a.name.localeCompare(b.name)),
    [workspaces]
  );

  const liquidationPoll = useMarketPolling(
    'sidebar:hyperliquid-overview:majors',
    async () => {
      const overview = await hyperliquidService.getOverview(24);
      return {
        markets: overview.markets.filter((market) => isMajorMarket(market.symbol)),
        updatedAt: overview.updatedAt
      };
    },
    { intervalMs: 30_000, staleAfterMs: 90_000, enabled: !isLiquidationsCollapsed }
  );

  useEffect(() => {
    const handleRouteChanged = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as CenterRouteChangedDetail | undefined : undefined;
      if (detail?.path) {
        setActiveCenterPath(detail.path);
      }
    };
    const handlePopState = () => setActiveCenterPath(window.location.pathname || '/station/hedge-fund');

    window.addEventListener(CENTER_ROUTE_CHANGED_EVENT, handleRouteChanged);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener(CENTER_ROUTE_CHANGED_EVENT, handleRouteChanged);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (liquidationPoll.data) {
      setLiquidationMarkets(liquidationPoll.data.markets);
      setLiquidationsUpdatedAt(liquidationPoll.data.updatedAt);
      setLiquidationsError(null);
      setLiquidationsStale(liquidationPoll.status === 'stale');
      setHasLiquidationSnapshot(true);
      return;
    }

    if (liquidationPoll.error) {
      setLiquidationsError(liquidationPoll.error);
      setLiquidationsStale(hasLiquidationSnapshot);
    }
  }, [hasLiquidationSnapshot, liquidationPoll.data, liquidationPoll.error, liquidationPoll.status]);

  const liquidationTraps = useMemo(() => buildOverviewTrapDecisions(liquidationMarkets, 5), [liquidationMarkets]);

  const handleStationClick = React.useCallback((station: StationDefinition) => {
    setActiveCenterPath(station.route);
    navigateCenterPanel(station.route);
  }, []);

  const runWorkspaceCommand = React.useCallback((workspace: Workspace, command?: string, switchWorkspace = true) => {
    if (switchWorkspace) {
      void setActiveWorkspace(workspace.id);
    }

    createTerminal(
      workspace.path,
      workspace.shell,
      buildTerminalLabel(workspace, command),
      command
    );
    navigateCenterPanel('/terminals');
  }, [createTerminal, setActiveWorkspace]);

  const runWorkspaceProfile = React.useCallback((workspace: Workspace, profileId: string) => {
    const profile = workspace.launch_profiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    void setActiveWorkspace(workspace.id);
    launchProfileSequence(workspace, profile, createTerminal, undefined, recordLaunch);
    navigateCenterPanel('/terminals');
  }, [createTerminal, recordLaunch, setActiveWorkspace]);

  const handleWorkspaceClick = async (workspaceId: string) => {
    await setActiveWorkspace(workspaceId);
  };

  const handleEditWorkspace = (workspace: Workspace) => {
    setEditingWorkspace(workspace);
    setIsModalOpen(true);
  };

  const handleDeleteWorkspace = async (workspace: Workspace) => {
    const confirmed = window.confirm(`Delete workspace "${workspace.name}"?\n\nThis removes it from the app but does not delete the folder on disk.`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteWorkspace(workspace.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete workspace';
      window.alert(message);
    }
  };

  const handleOpenWorkspaceVault = async (workspace: Workspace) => {
    try {
      const status = await window.electronAPI.obsidian.getStatus(workspace.path, workspace.obsidian_vault_path);
      const readyStatus = status.vaultPath
        ? status
        : await window.electronAPI.obsidian.ensureVault(workspace.path, workspace.obsidian_vault_path);

      if (readyStatus.vaultPath && readyStatus.vaultPath !== workspace.obsidian_vault_path) {
        await updateWorkspace(workspace.id, { obsidian_vault_path: readyStatus.vaultPath });
      }

      if (readyStatus.vaultPath) {
        await window.electronAPI.obsidian.openVault(readyStatus.vaultPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open workspace vault';
      window.alert(message);
    }
  };

  const handleCreateWorkspace = async () => {
    try {
      const selectedPath = await window.electronAPI.workspace.pickDirectory();
      if (!selectedPath) {
        return;
      }

      const workspace = await inferWorkspaceFromPath(selectedPath);
      await createWorkspace(workspace);
      await setActiveWorkspace(workspace.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create workspace';
      window.alert(message);
    }
  };

  const handleSaveWorkspace = async (workspace: Workspace) => {
    if (editingWorkspace) {
      const { id, ...updates } = workspace;
      await updateWorkspace(editingWorkspace.id, updates);
    } else {
      await createWorkspace(workspace);
    }

    setEditingWorkspace(null);
    setIsModalOpen(false);
  };

  const handleCloseModal = () => {
    setEditingWorkspace(null);
    setIsModalOpen(false);
  };

  if (isLoading) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        background: 'var(--app-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--app-muted)'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'rgba(4, 8, 16, 0.35)',
      backdropFilter: 'blur(28px) saturate(1.2)',
      WebkitBackdropFilter: 'blur(28px) saturate(1.2)',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid rgba(255, 255, 255, 0.03)',
      boxShadow: 'inset -1px 0 0 rgba(255, 255, 255, 0.02)'
    }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
        display: 'grid',
        gap: '8px'
      }}>
        <div>
          <div style={{
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--app-accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em'
          }}>
            Trading Stations
          </div>
          <div style={{ color: 'var(--app-subtle)', fontSize: '10px', marginTop: '3px' }}>
            Fixed hedge fund research and live monitor surfaces
          </div>
        </div>
        <div style={stationListStyle}>
          {TRADING_STATIONS.map((station) => (
            <StationListItem
              key={station.id}
              station={station}
              isActive={isStationRoute(activeCenterPath, station) || (activeCenterPath === '/' && station.id === 'hedge-fund-station')}
              onSelect={() => handleStationClick(station)}
            />
          ))}
        </div>
      </div>

      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px'
      }}>
        <div>
          <div style={{
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--app-accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em'
          }}>
            Desks
          </div>
          <div style={{ color: 'var(--app-subtle)', fontSize: '10px', marginTop: '3px' }}>
            Local folders, commands, terminals, agents, and vaults
          </div>
        </div>
        <button
          type="button"
          title="Add desk"
          aria-label="Add desk"
          onClick={handleCreateWorkspace}
          style={{
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
            padding: 0
          }}
        >
          <Plus size={15} />
        </button>
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={workspaceListStyle}>
          {sortedWorkspaces.map((workspace) => (
            <WorkspaceListItem
              key={workspace.id}
              workspace={workspace}
              isActive={activeWorkspace?.id === workspace.id}
              onSelect={() => void handleWorkspaceClick(workspace.id)}
            />
          ))}
        </div>

        <ActiveWorkspaceDetails
          workspace={activeWorkspace}
          launchProfilesCollapsed={areLaunchProfilesCollapsed}
          savedCommandsCollapsed={areSavedCommandsCollapsed}
          onToggleLaunchProfiles={() => setAreLaunchProfilesCollapsed((value) => !value)}
          onToggleSavedCommands={() => setAreSavedCommandsCollapsed((value) => !value)}
          onRunCommand={runWorkspaceCommand}
          onRunProfile={runWorkspaceProfile}
          onEdit={handleEditWorkspace}
          onDelete={(workspace) => void handleDeleteWorkspace(workspace)}
          onOpenVault={(workspace) => void handleOpenWorkspaceVault(workspace)}
        />
      </div>

      <div style={{
        padding: isLiquidationsCollapsed ? '6px 8px 8px' : '8px',
        borderTop: '1px solid rgba(255, 255, 255, 0.03)',
        background: 'rgba(4, 8, 16, 0.3)'
      }}>
        <LiquidationTrapsCard
          decisions={liquidationTraps}
          updatedAt={liquidationsUpdatedAt}
          error={liquidationsError}
          stale={liquidationsStale}
          collapsed={isLiquidationsCollapsed}
          onToggleCollapsed={() => setIsLiquidationsCollapsed((value) => !value)}
        />
      </div>

      <WorkspaceModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveWorkspace}
        existingWorkspace={editingWorkspace}
      />
    </div>
  );
};

function WorkspaceListItem({
  workspace,
  isActive,
  onSelect
}: {
  workspace: Workspace;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        minHeight: '48px',
        padding: '7px 8px',
        borderRadius: '8px',
        border: isActive ? '1px solid var(--app-border-strong)' : '1px solid rgba(255, 255, 255, 0.025)',
        background: isActive ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.01)',
        boxShadow: isActive ? '0 0 12px var(--app-glow)' : 'none',
        color: 'var(--app-text)',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'grid',
        gridTemplateColumns: '30px minmax(0, 1fr)',
        gap: '8px',
        alignItems: 'center',
        transition: 'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease'
      }}
    >
      <span style={{
        width: '30px',
        height: '30px',
        borderRadius: '8px',
        background: isActive ? 'var(--app-focus)' : 'var(--app-panel-muted)',
        border: isActive ? '1px solid var(--app-border-strong)' : '1px solid var(--app-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--app-text)',
        fontSize: '10px',
        fontWeight: 800,
        flexShrink: 0
      }}>
        {ICONS[workspace.icon] || 'WS'}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: 'block',
          fontSize: '12px',
          fontWeight: 800,
          lineHeight: 1.15,
          color: 'var(--app-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {workspace.name}
        </span>
        <span style={{
          display: 'block',
          fontSize: '10px',
          color: isActive ? 'var(--app-accent)' : 'var(--app-subtle)',
          marginTop: '4px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
            {isActive
            ? isPrimaryHedgeFundDesk(workspace) ? 'Primary command desk' : 'Active command desk'
            : `Command desk - ${compactPath(workspace.path)}`}
        </span>
      </span>
    </button>
  );
}

function StationListItem({
  station,
  isActive,
  onSelect
}: {
  station: StationDefinition;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        minHeight: '54px',
        padding: '8px',
        borderRadius: '8px',
        border: isActive ? '1px solid var(--app-border-strong)' : '1px solid rgba(255, 255, 255, 0.035)',
        background: isActive ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.014)',
        boxShadow: isActive ? '0 0 14px var(--app-glow)' : 'none',
        color: 'var(--app-text)',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'grid',
        gridTemplateColumns: '32px minmax(0, 1fr)',
        gap: '9px',
        alignItems: 'center',
        transition: 'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease'
      }}
    >
      <span style={{
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        background: isActive ? 'var(--app-focus)' : 'var(--app-panel-muted)',
        border: isActive ? '1px solid var(--app-border-strong)' : '1px solid var(--app-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: isActive ? 'var(--app-text)' : 'var(--app-muted)'
      }}>
        {station.icon === 'live' ? <RadioTower size={16} /> : <ShieldCheck size={16} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: 'block',
          fontSize: '12px',
          fontWeight: 850,
          lineHeight: 1.15,
          color: 'var(--app-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {station.label}
        </span>
        <span style={{
          display: 'block',
          fontSize: '10px',
          color: isActive ? 'var(--app-accent)' : 'var(--app-subtle)',
          marginTop: '4px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {station.description}
        </span>
      </span>
    </button>
  );
}

function ActiveWorkspaceDetails({
  workspace,
  launchProfilesCollapsed,
  savedCommandsCollapsed,
  onToggleLaunchProfiles,
  onToggleSavedCommands,
  onRunCommand,
  onRunProfile,
  onEdit,
  onDelete,
  onOpenVault
}: {
  workspace: Workspace | null;
  launchProfilesCollapsed: boolean;
  savedCommandsCollapsed: boolean;
  onToggleLaunchProfiles: () => void;
  onToggleSavedCommands: () => void;
  onRunCommand: (workspace: Workspace, command?: string, switchWorkspace?: boolean) => void;
  onRunProfile: (workspace: Workspace, profileId: string) => void;
  onEdit: (workspace: Workspace) => void;
  onDelete: (workspace: Workspace) => void;
  onOpenVault: (workspace: Workspace) => void;
}) {
  if (!workspace) {
    return (
      <div style={activeDetailStyle}>
        <div style={emptyDetailStyle}>Select the primary hedge fund desk or add a bot/dev/client/business side desk to prepare commands.</div>
      </div>
    );
  }

  return (
    <div style={activeDetailStyle}>
      <div style={activeDetailHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={sectionTitleStyle}>Active Desk</div>
          <div style={{
            fontSize: '13px',
            fontWeight: 800,
            color: 'var(--app-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {workspace.name}
          </div>
          <div style={pathTextStyle} title={workspace.path}>{workspace.path}</div>
        </div>
      </div>

      <div style={quickActionGridStyle}>
        <IconActionButton label="Shell" title="Open shell" icon={<Terminal size={13} />} onClick={() => onRunCommand(workspace)} />
        <IconActionButton label="Claude" title="Run Claude" icon={<Bot size={13} />} onClick={() => onRunCommand(workspace, 'claude')} />
        <IconActionButton label="Git" title="Run git status" icon={<GitBranch size={13} />} onClick={() => onRunCommand(workspace, 'git status')} />
        <IconActionButton label="Edit" title="Edit workspace" icon={<Pencil size={13} />} onClick={() => onEdit(workspace)} />
        <IconActionButton label="Vault" title="Open workspace vault" icon={<BookOpen size={13} />} onClick={() => onOpenVault(workspace)} />
        <IconActionButton
          label="Delete"
          title="Delete workspace"
          icon={<Trash2 size={13} />}
          danger
          onClick={() => onDelete(workspace)}
        />
      </div>

      <CollapsibleSectionHeader
        title="Launch Profiles"
        count={workspace.launch_profiles.length}
        collapsed={launchProfilesCollapsed}
        onToggle={onToggleLaunchProfiles}
      />
      {!launchProfilesCollapsed && (
        <div style={commandListStyle}>
          {workspace.launch_profiles.length === 0 ? (
            <div style={emptyInlineStyle}>No launch profiles saved.</div>
          ) : (
            workspace.launch_profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => onRunProfile(workspace, profile.id)}
                style={commandButtonStyle}
              >
                <div style={commandTitleStyle}>{profile.name}</div>
                <div style={commandTextStyle}>{getLaunchProfileCommandSummary(profile)}</div>
                <div style={commandMetaTextStyle}>
                  {profile.steps.map((step) => `${step.delayMs}ms>${step.command}`).join(' | ')}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      <CollapsibleSectionHeader
        title="Saved Commands"
        count={workspace.default_commands.length}
        collapsed={savedCommandsCollapsed}
        onToggle={onToggleSavedCommands}
      />
      {!savedCommandsCollapsed && (
        <div style={commandListStyle}>
          {workspace.default_commands.length === 0 ? (
            <div style={emptyInlineStyle}>No saved commands yet.</div>
          ) : (
            workspace.default_commands.map((command) => (
              <button
                key={command}
                type="button"
                onClick={() => onRunCommand(workspace, command)}
                style={commandButtonStyle}
                title={command}
              >
                <div style={commandTextStyle}>{command}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function IconActionButton({
  label,
  title,
  icon,
  danger,
  onClick
}: {
  label: string;
  title: string;
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        ...miniActionButton,
        color: danger ? 'var(--app-negative)' : miniActionButton.color,
        border: danger ? '1px solid var(--app-border-strong)' : miniActionButton.border
      }}
    >
      <span style={{ display: 'flex' }}>{icon}</span>
      <span style={{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {label}
      </span>
    </button>
  );
}

function CollapsibleSectionHeader({
  title,
  count,
  collapsed,
  onToggle
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={sectionToggleStyle}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <span style={{ ...sectionTitleStyle, marginBottom: 0 }}>{title}</span>
      </span>
      <span style={countPillStyle}>{count}</span>
    </button>
  );
}

function LiquidationTrapsCard({
  decisions,
  updatedAt,
  error,
  stale,
  collapsed,
  onToggleCollapsed
}: {
  decisions?: TrapDecision[];
  updatedAt: number | null;
  error: string | null;
  stale: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const safeDecisions = decisions ?? [];

  return (
    <div style={{
      borderRadius: '10px',
      border: '1px solid rgba(255, 255, 255, 0.03)',
      background: 'rgba(255, 255, 255, 0.015)',
      overflow: 'hidden',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
    }}>
      <button
        type="button"
        onClick={onToggleCollapsed}
        style={{
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        width: '100%',
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left'
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--app-accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em'
          }}>
            Liquidation Traps
          </div>
          <div style={{ color: 'var(--app-subtle)', fontSize: '10px', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Decision queue from crowding pressure
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <div style={{
            padding: '4px 7px',
            borderRadius: '999px',
            background: stale ? 'var(--app-warning-soft)' : 'var(--app-panel-muted)',
            border: stale ? '1px solid var(--app-warning)' : '1px solid var(--app-border)',
            color: stale ? 'var(--app-warning)' : 'var(--app-muted)',
            fontSize: '10px',
            fontWeight: 700
          }}>
            {stale ? 'Stale' : updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading'}
          </div>
          <span style={{ display: 'flex', color: 'var(--app-muted)' }}>
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </button>

      {collapsed ? null : error && !stale ? (
        <div style={{
          margin: '10px',
          padding: '10px',
          borderRadius: '8px',
          border: '1px solid var(--app-negative)',
          background: 'var(--app-negative-soft)',
          color: 'var(--app-negative)',
          fontSize: '11px',
          lineHeight: 1.45
        }}>
          {error}
        </div>
      ) : (
        <div style={{ padding: '10px', display: 'grid', gap: '8px' }}>
          {error ? (
            <div style={{
              borderRadius: '8px',
              border: '1px solid var(--app-warning)',
              background: 'var(--app-warning-soft)',
              color: 'var(--app-warning)',
              fontSize: '10px',
              lineHeight: 1.45,
              padding: '8px 10px'
            }}>
              Gateway slow. Showing last good snapshot.
            </div>
          ) : null}
          {safeDecisions.length === 0 ? (
            <div style={{
              borderRadius: '8px',
              border: '1px dashed var(--app-border)',
              background: 'var(--app-panel-muted)',
              color: 'var(--app-muted)',
              fontSize: '11px',
              lineHeight: 1.45,
              padding: '10px'
            }}>
              No clear BTC, ETH or SOL trap yet. Wait for pressure to concentrate.
            </div>
          ) : (
            safeDecisions.map((decision) => (
              <TrapDecisionRow key={`${decision.symbol}-${decision.sideAtRisk}`} decision={decision} />
            ))
          )}
          <div style={{
            paddingTop: '2px',
            fontSize: '10px',
            lineHeight: 1.45,
            color: 'var(--app-subtle)'
          }}>
            Confirm before acting: this queue ranks review urgency, not a standalone trade signal.
          </div>
        </div>
      )}
    </div>
  );
}

function TrapDecisionRow({ decision }: { decision: TrapDecision }) {
  return (
    <div style={{
      borderRadius: '10px',
      border: '1px solid var(--app-border)',
      background: 'var(--app-panel-muted)',
      padding: '9px'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--app-text)' }}>{decision.symbol}</div>
            <ActionPill action={decision.action} />
          </div>
          <div style={{ color: sideColor(decision.sideAtRisk), fontSize: '10px', fontWeight: 800, marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {sideCopy(decision.sideAtRisk)}
          </div>
        </div>
        <div style={{
          flexShrink: 0,
          padding: '3px 6px',
          borderRadius: '999px',
          background: 'var(--app-surface)',
          border: '1px solid var(--app-border)',
          color: 'var(--app-text)',
          fontSize: '10px',
          fontWeight: 800
        }}>
          {formatCompact(decision.pressureUsd)}
        </div>
      </div>
      <div style={{ marginTop: '7px', color: 'var(--app-muted)', fontSize: '11px', lineHeight: 1.4 }}>
        {decision.setupReason}
      </div>
      <TrapMiniLine label="Confirm" value={decision.confirmation} />
      <TrapMiniLine label="Risk" value={decision.risk} />
    </div>
  );
}

function TrapMiniLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: '6px', display: 'grid', gridTemplateColumns: '46px minmax(0, 1fr)', gap: '7px', fontSize: '10px', lineHeight: 1.35 }}>
      <span style={{ color: 'var(--app-subtle)', fontWeight: 800, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ color: 'var(--app-muted)' }}>
        {value}
      </span>
    </div>
  );
}

function ActionPill({ action }: { action: TrapAction }) {
  return (
    <span style={{
      borderRadius: '999px',
      border: `1px solid ${actionColor(action)}`,
      background: actionBackground(action),
      color: actionColor(action),
      padding: '2px 6px',
      fontSize: '9px',
      fontWeight: 900,
      textTransform: 'uppercase',
      letterSpacing: '0.08em'
    }}>
      {action}
    </span>
  );
}

function actionColor(action: TrapAction) {
  if (action === 'Confirm') return 'var(--app-positive)';
  if (action === 'Watch') return 'var(--app-warning)';
  return 'var(--app-subtle)';
}

function actionBackground(action: TrapAction) {
  if (action === 'Confirm') return 'var(--app-positive-soft)';
  if (action === 'Watch') return 'var(--app-warning-soft)';
  return 'var(--app-panel-muted)';
}

function sideColor(side: TrapSide) {
  if (side === 'longs') return 'var(--app-negative)';
  if (side === 'shorts') return 'var(--app-positive)';
  return 'var(--app-muted)';
}

function sideCopy(side: TrapSide) {
  if (side === 'longs') return 'Longs at risk';
  if (side === 'shorts') return 'Shorts at risk';
  return 'Balanced';
}

function isMajorMarket(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  return normalized === 'BTC' || normalized === 'ETH' || normalized === 'SOL';
}

function formatCompact(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(digits)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(digits)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(digits)}K`;
  }
  return value.toFixed(digits);
}

function compactPath(path: string) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 2) {
    return path;
  }
  return `.../${parts.slice(-2).join('/')}`;
}

function usePersistedBoolean(key: string, defaultValue: boolean): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') {
      return defaultValue;
    }

    const stored = window.localStorage.getItem(key);
    if (stored === null) {
      return defaultValue;
    }
    return stored === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem(key, String(value));
  }, [key, value]);

  return [value, setValue];
}

const workspaceListStyle: React.CSSProperties = {
  flex: '1 1 auto',
  minHeight: '132px',
  overflowY: 'auto',
  display: 'grid',
  alignContent: 'start',
  gap: '6px',
  padding: '8px'
};

const stationListStyle: React.CSSProperties = {
  display: 'grid',
  gap: '6px'
};

const activeDetailStyle: React.CSSProperties = {
  flex: '0 0 auto',
  maxHeight: '44%',
  minHeight: '128px',
  overflowY: 'auto',
  borderTop: '1px solid rgba(255, 255, 255, 0.03)',
  background: 'rgba(4, 8, 16, 0.22)',
  padding: '9px 8px 10px',
  display: 'grid',
  alignContent: 'start',
  gap: '8px'
};

const activeDetailHeaderStyle: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.035)',
  background: 'rgba(255, 255, 255, 0.014)',
  padding: '9px 10px'
};

const emptyDetailStyle: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px dashed var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-muted)',
  fontSize: '11px',
  lineHeight: 1.45,
  padding: '10px'
};

const pathTextStyle: React.CSSProperties = {
  marginTop: '5px',
  color: 'var(--app-subtle)',
  fontFamily: 'Consolas, monospace',
  fontSize: '10px',
  lineHeight: 1.35,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const quickActionGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '6px'
};

const sectionToggleStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 2px 3px',
  background: 'transparent',
  border: 'none',
  color: 'var(--app-muted)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  textAlign: 'left'
};

const countPillStyle: React.CSSProperties = {
  minWidth: '20px',
  padding: '2px 6px',
  borderRadius: '999px',
  background: 'var(--app-panel-muted)',
  border: '1px solid var(--app-border)',
  color: 'var(--app-subtle)',
  fontSize: '10px',
  fontWeight: 800,
  textAlign: 'center'
};

const commandListStyle: React.CSSProperties = {
  display: 'grid',
  gap: '6px'
};

const emptyInlineStyle: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px dashed rgba(255, 255, 255, 0.04)',
  background: 'rgba(255, 255, 255, 0.01)',
  color: 'var(--app-subtle)',
  fontSize: '10px',
  lineHeight: 1.4,
  padding: '8px 10px'
};

const miniActionButton: React.CSSProperties = {
  padding: '4px 7px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
  borderRadius: '6px',
  color: 'var(--app-muted)',
  cursor: 'pointer',
  fontSize: '10px',
  fontWeight: 500,
  transition: 'all 0.2s ease',
  minWidth: 0,
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px'
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--app-subtle)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 700,
  marginBottom: '6px'
};

const commandButtonStyle: React.CSSProperties = {
  padding: '7px 10px',
  background: 'rgba(255, 255, 255, 0.015)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  borderRadius: '8px',
  color: 'var(--app-text)',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'all 0.2s ease',
  minWidth: 0
};

const commandTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 800,
  color: 'var(--app-text)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const commandTextStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--app-muted)',
  fontFamily: 'Consolas, monospace',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  marginTop: '4px'
};

const commandMetaTextStyle: React.CSSProperties = {
  ...commandTextStyle,
  color: 'var(--app-subtle)',
  fontSize: '10px'
};
