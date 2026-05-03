import React, { useEffect, useMemo, useState } from 'react';
import { useDeskHistoryContext } from '../../contexts/DeskHistoryContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { useTerminalContext } from '../../contexts/TerminalContext';
import { WorkspaceModal } from './WorkspaceModal';
import type { Workspace } from '../../types/electron';
import { buildTerminalLabel, getLaunchProfileCommandSummary, launchProfileSequence } from '../../utils/workspaceLaunch';
import { hyperliquidService, type HyperliquidMarketRow } from '../../services/hyperliquidService';
import { buildOverviewTrapDecisions, type TrapAction, type TrapDecision, type TrapSide } from '@/features/liquidations/trapDecisions';

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
  const { createTerminal } = useTerminalContext();
  const { recordLaunch } = useDeskHistoryContext();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [liquidationMarkets, setLiquidationMarkets] = useState<HyperliquidMarketRow[]>([]);
  const [liquidationsUpdatedAt, setLiquidationsUpdatedAt] = useState<number | null>(null);
  const [liquidationsError, setLiquidationsError] = useState<string | null>(null);
  const [liquidationsStale, setLiquidationsStale] = useState(false);
  const [hasLiquidationSnapshot, setHasLiquidationSnapshot] = useState(false);

  const sortedWorkspaces = useMemo(
    () => [...workspaces].sort((a, b) => a.name.localeCompare(b.name)),
    [workspaces]
  );

  useEffect(() => {
    let mounted = true;

    const loadLiquidations = async () => {
      try {
        const overview = await hyperliquidService.getOverview(24);
        if (!mounted) {
          return;
        }

        const majors = overview.markets.filter((market) => isMajorMarket(market.symbol));
        setLiquidationMarkets(majors);
        setLiquidationsUpdatedAt(overview.updatedAt);
        setLiquidationsError(null);
        setLiquidationsStale(false);
        setHasLiquidationSnapshot(true);
      } catch (error) {
        if (!mounted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to load liquidation pressure.';
        setLiquidationsError(message);
        setLiquidationsStale(hasLiquidationSnapshot);
      }
    };

    void loadLiquidations();
    const interval = window.setInterval(loadLiquidations, 12_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [hasLiquidationSnapshot]);

  const liquidationTraps = useMemo(() => buildOverviewTrapDecisions(liquidationMarkets, 5), [liquidationMarkets]);

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
  }, [createTerminal, setActiveWorkspace]);

  const runWorkspaceProfile = React.useCallback((workspace: Workspace, profileId: string) => {
    const profile = workspace.launch_profiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    void setActiveWorkspace(workspace.id);
    launchProfileSequence(workspace, profile, createTerminal, undefined, recordLaunch);
  }, [createTerminal, recordLaunch, setActiveWorkspace]);

  const handleWorkspaceClick = async (workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      return;
    }

    runWorkspaceCommand(workspace);
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

  const handleCreateWorkspace = () => {
    setEditingWorkspace(null);
    setIsModalOpen(true);
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
            Workspaces
          </div>
          <div style={{ color: 'var(--app-subtle)', fontSize: '10px', marginTop: '3px' }}>
            Click = switch + open shell
          </div>
        </div>
        <button
          type="button"
          onClick={handleCreateWorkspace}
          style={{
            padding: '5px 8px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            color: 'var(--app-accent)',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: 600,
            transition: 'all 0.2s ease'
          }}
        >
          New
        </button>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px'
      }}>
        {sortedWorkspaces.map((workspace) => {
          const isActive = activeWorkspace?.id === workspace.id;
          const isHovered = hoveredId === workspace.id;
          const showDetails = isActive || isHovered;

          return (
            <div
              key={workspace.id}
              onMouseEnter={() => setHoveredId(workspace.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                marginBottom: '6px',
                borderRadius: '10px',
                border: isActive ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(255, 255, 255, 0.02)',
                background: isActive ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.01)',
                overflow: 'hidden',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isActive ? '0 0 16px var(--app-glow)' : 'none'
              }}
            >
              <button
                type="button"
                onClick={() => handleWorkspaceClick(workspace.id)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    background: isActive ? 'var(--app-focus)' : 'var(--app-panel-muted)',
                    border: isActive ? '1px solid var(--app-border-strong)' : '1px solid var(--app-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--app-text)',
                    fontSize: '11px',
                    fontWeight: 700
                  }}>
                    {ICONS[workspace.icon] || 'WS'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--app-text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {workspace.name}
                    </div>
                    <div style={{
                      fontSize: '10px',
                      color: isActive ? 'var(--app-accent)' : 'var(--app-subtle)',
                      marginTop: '3px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em'
                    }}>
                      {isActive ? 'Active' : workspace.shell}
                    </div>
                  </div>
                </div>
              </button>

              {showDetails && (
                <div style={{
                  borderTop: '1px solid var(--app-border)',
                  padding: '0 10px 10px 10px'
                }}>
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--app-subtle)',
                    fontFamily: 'Consolas, monospace',
                    lineHeight: 1.45,
                    padding: '8px 0',
                    wordBreak: 'break-all'
                  }}>
                    {workspace.path}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <button
                      type="button"
                      onClick={() => runWorkspaceCommand(workspace)}
                      style={miniActionButton}
                    >
                      Shell
                    </button>
                    <button
                      type="button"
                      onClick={() => runWorkspaceCommand(workspace, 'claude')}
                      style={miniActionButton}
                    >
                      Claude
                    </button>
                    <button
                      type="button"
                      onClick={() => runWorkspaceCommand(workspace, 'git status')}
                      style={miniActionButton}
                    >
                      Git
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditWorkspace(workspace)}
                      style={miniActionButton}
                    >
                      Edit
                    </button>
                    {workspace.obsidian_vault_path || workspace.path ? (
                      <button
                        type="button"
                        onClick={() => void window.electronAPI.obsidian.getStatus(workspace.path, workspace.obsidian_vault_path).then((status) => {
                          if (status.vaultPath) {
                            return window.electronAPI.obsidian.openPath(status.vaultPath);
                          }
                        })}
                        style={miniActionButton}
                      >
                        Vault
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleDeleteWorkspace(workspace)}
                      style={{
                        ...miniActionButton,
                        color: 'var(--app-negative)',
                        border: '1px solid var(--app-border-strong)'
                      }}
                    >
                      Del
                    </button>
                  </div>

                  {workspace.launch_profiles.length > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={sectionTitleStyle}>Launch Profiles</div>
                      <div style={{ display: 'grid', gap: '6px' }}>
                        {workspace.launch_profiles.slice(0, 3).map((profile) => (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => runWorkspaceProfile(workspace, profile.id)}
                            style={commandButtonStyle}
                          >
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--app-text)' }}>{profile.name}</div>
                            <div style={commandTextStyle}>{getLaunchProfileCommandSummary(profile)}</div>
                            <div style={{ ...commandTextStyle, color: 'var(--app-muted)', marginTop: '4px' }}>
                              {profile.steps.map((step) => `${step.delayMs}ms>${step.command}`).join(' | ')}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {workspace.default_commands.length > 0 && (
                    <div>
                      <div style={sectionTitleStyle}>Saved Commands</div>
                      <div style={{ display: 'grid', gap: '6px' }}>
                        {workspace.default_commands.slice(0, 2).map((command) => (
                          <button
                            key={command}
                            type="button"
                            onClick={() => runWorkspaceCommand(workspace, command)}
                            style={commandButtonStyle}
                          >
                            <div style={commandTextStyle}>{command}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

      </div>

      <div style={{
        padding: '8px',
        borderTop: '1px solid rgba(255, 255, 255, 0.03)',
        background: 'rgba(4, 8, 16, 0.3)'
      }}>
        <LiquidationTrapsCard
          decisions={liquidationTraps}
          updatedAt={liquidationsUpdatedAt}
          error={liquidationsError}
          stale={liquidationsStale}
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

function LiquidationTrapsCard({
  decisions,
  updatedAt,
  error,
  stale
}: {
  decisions?: TrapDecision[];
  updatedAt: number | null;
  error: string | null;
  stale: boolean;
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
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
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
            Liquidation Traps
          </div>
          <div style={{ color: 'var(--app-subtle)', fontSize: '10px', marginTop: '3px' }}>
            Decision queue from crowding pressure
          </div>
        </div>
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
      </div>

      {error && !stale ? (
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

const miniActionButton: React.CSSProperties = {
  padding: '4px 7px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
  borderRadius: '6px',
  color: 'var(--app-muted)',
  cursor: 'pointer',
  fontSize: '10px',
  fontWeight: 500,
  transition: 'all 0.2s ease'
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
  transition: 'all 0.2s ease'
};

const commandTextStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--app-muted)',
  fontFamily: 'Consolas, monospace',
  wordBreak: 'break-word',
  marginTop: '4px'
};
