import React, { useEffect, useMemo, useState } from 'react';
import { useDeskHistoryContext } from '../../contexts/DeskHistoryContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { useTerminalContext } from '../../contexts/TerminalContext';
import { WorkspaceModal } from './WorkspaceModal';
import type { Workspace } from '../../types/electron';
import { buildTerminalLabel, getLaunchProfileCommandSummary, launchProfileSequence } from '../../utils/workspaceLaunch';
import { hyperliquidService, type HyperliquidMarketRow } from '../../services/hyperliquidService';

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

  const liquidationTraps = useMemo(() => buildLiquidationTraps(liquidationMarkets), [liquidationMarkets]);

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
        background: '#11151d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.96)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid rgba(239, 68, 68, 0.2)',
      boxShadow: '4px 0 20px rgba(0, 0, 0, 0.45)'
    }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid rgba(239, 68, 68, 0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px'
      }}>
        <div>
          <div style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#ef4444',
            textTransform: 'uppercase',
            letterSpacing: '0.12em'
          }}>
            Workspaces
          </div>
          <div style={{ color: '#6b7280', fontSize: '10px', marginTop: '3px' }}>
            Click = switch + open shell
          </div>
        </div>
        <button
          type="button"
          onClick={handleCreateWorkspace}
          style={{
            padding: '6px 8px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.22)',
            borderRadius: '8px',
            color: '#fecaca',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 700
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
                marginBottom: '8px',
                borderRadius: '12px',
                border: isActive ? '1px solid rgba(239, 68, 68, 0.28)' : '1px solid rgba(255, 255, 255, 0.06)',
                background: isActive ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                overflow: 'hidden'
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
                    background: isActive ? 'rgba(239, 68, 68, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                    border: isActive ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f3f4f6',
                    fontSize: '11px',
                    fontWeight: 700
                  }}>
                    {ICONS[workspace.icon] || 'WS'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#f9fafb',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {workspace.name}
                    </div>
                    <div style={{
                      fontSize: '10px',
                      color: isActive ? '#fca5a5' : '#6b7280',
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
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  padding: '0 10px 10px 10px'
                }}>
                  <div style={{
                    fontSize: '10px',
                    color: '#6b7280',
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
                        color: '#fca5a5',
                        border: '1px solid rgba(239, 68, 68, 0.22)'
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
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#f3f4f6' }}>{profile.name}</div>
                            <div style={commandTextStyle}>{getLaunchProfileCommandSummary(profile)}</div>
                            <div style={{ ...commandTextStyle, color: '#9ca3af', marginTop: '4px' }}>
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
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        background: 'linear-gradient(180deg, rgba(7, 10, 16, 0.92) 0%, rgba(3, 6, 12, 0.98) 100%)'
      }}>
        <LiquidationTrapsCard
          longs={liquidationTraps.longs}
          shorts={liquidationTraps.shorts}
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
  longs,
  shorts,
  updatedAt,
  error,
  stale
}: {
  longs: HyperliquidMarketRow[];
  shorts: HyperliquidMarketRow[];
  updatedAt: number | null;
  error: string | null;
  stale: boolean;
}) {
  return (
    <div style={{
      borderRadius: '14px',
      border: '1px solid rgba(56, 189, 248, 0.18)',
      background: 'linear-gradient(180deg, rgba(8, 20, 34, 0.96) 0%, rgba(4, 10, 19, 0.98) 100%)',
      overflow: 'hidden',
      boxShadow: '0 10px 24px rgba(2, 6, 23, 0.4)'
    }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px'
      }}>
        <div>
          <div style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#38bdf8',
            textTransform: 'uppercase',
            letterSpacing: '0.12em'
          }}>
            Liquidation Traps
          </div>
          <div style={{ color: '#6b7280', fontSize: '10px', marginTop: '3px' }}>
            BTC, ETH, SOL crowding pressure
          </div>
        </div>
        <div style={{
          padding: '4px 7px',
          borderRadius: '999px',
          background: stale ? 'rgba(251, 191, 36, 0.12)' : 'rgba(255, 255, 255, 0.04)',
          border: stale ? '1px solid rgba(251, 191, 36, 0.24)' : '1px solid rgba(255, 255, 255, 0.08)',
          color: stale ? '#fcd34d' : '#9ca3af',
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
          borderRadius: '10px',
          border: '1px solid rgba(239, 68, 68, 0.24)',
          background: 'rgba(127, 29, 29, 0.24)',
          color: '#fecaca',
          fontSize: '11px',
          lineHeight: 1.45
        }}>
          {error}
        </div>
      ) : (
        <div style={{ padding: '10px', display: 'grid', gap: '8px' }}>
          {error ? (
            <div style={{
              borderRadius: '10px',
              border: '1px solid rgba(251, 191, 36, 0.22)',
              background: 'rgba(120, 53, 15, 0.2)',
              color: '#fde68a',
              fontSize: '10px',
              lineHeight: 1.45,
              padding: '8px 10px'
            }}>
              Gateway slow. Showing last good snapshot.
            </div>
          ) : null}
          <TrapSection title="Longs At Risk" tone="rose" rows={longs} />
          <TrapSection title="Shorts At Risk" tone="emerald" rows={shorts} />
          <div style={{
            paddingTop: '2px',
            fontSize: '10px',
            lineHeight: 1.45,
            color: '#6b7280'
          }}>
            Pressure = forced-flow estimate. Current price is shown as reference zone, not exact liquidation level.
          </div>
        </div>
      )}
    </div>
  );
}

function TrapSection({
  title,
  tone,
  rows
}: {
  title: string;
  tone: 'rose' | 'emerald';
  rows: HyperliquidMarketRow[];
}) {
  const accent = tone === 'rose' ? '#fb7185' : '#34d399';
  const background = tone === 'rose' ? 'rgba(127, 29, 29, 0.18)' : 'rgba(6, 78, 59, 0.18)';

  return (
    <div style={{
      borderRadius: '12px',
      border: `1px solid ${tone === 'rose' ? 'rgba(244, 63, 94, 0.18)' : 'rgba(16, 185, 129, 0.18)'}`,
      background
    }}>
      <div style={{
        padding: '8px 10px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px'
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: accent
        }}>
          {title}
        </div>
        <div style={{ fontSize: '10px', color: '#9ca3af' }}>
          {rows.length > 0 ? `${rows.length} setups` : 'No major trap'}
        </div>
      </div>

      <div style={{ padding: '8px', display: 'grid', gap: '6px' }}>
        {rows.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: '11px', lineHeight: 1.45 }}>
            No clear imbalance across the main assets right now.
          </div>
        ) : (
          rows.map((market) => (
            <div
              key={`${title}-${market.symbol}`}
              style={{
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(2, 6, 23, 0.45)',
                padding: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>{market.symbol}</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                    {market.crowdingBias === 'balanced' || !market.crowdingBias ? 'monitoring' : market.crowdingBias.replace(/-/g, ' ')}
                  </div>
                </div>
                <div style={{
                  padding: '3px 6px',
                  borderRadius: '999px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: accent,
                  fontSize: '10px',
                  fontWeight: 700
                }}>
                  {formatCompact(tone === 'rose' ? market.estimatedLongLiquidationUsd ?? null : market.estimatedShortLiquidationUsd ?? null)}
                </div>
              </div>

              <div style={{
                marginTop: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '6px 10px'
              }}>
                <TrapMetric label="Price" value={market.price !== null ? `$${formatCompact(market.price, 2)}` : 'N/A'} />
                <TrapMetric label="OI" value={formatCompact(market.openInterestUsd ?? null)} />
                <TrapMetric label="Funding" value={formatFunding(market.fundingRate)} />
                <TrapMetric label="24h" value={formatSignedPct(market.change24hPct)} positive={market.change24hPct >= 0} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TrapMetric({
  label,
  value,
  positive
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>
      <div style={{
        fontSize: '9px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: '#6b7280'
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '11px',
        fontWeight: 700,
        color: positive === undefined ? '#e5e7eb' : positive ? '#86efac' : '#fda4af',
        marginTop: '2px'
      }}>
        {value}
      </div>
    </div>
  );
}

function buildLiquidationTraps(markets: HyperliquidMarketRow[]) {
  const longs = [...markets]
    .filter((market) => (market.estimatedLongLiquidationUsd || 0) > 0)
    .sort((a, b) => {
      const biasScore = (b.crowdingBias === 'longs-at-risk' ? 1 : 0) - (a.crowdingBias === 'longs-at-risk' ? 1 : 0);
      if (biasScore !== 0) {
        return biasScore;
      }
      return (b.estimatedLongLiquidationUsd || 0) - (a.estimatedLongLiquidationUsd || 0);
    })
    .slice(0, 3);

  const shorts = [...markets]
    .filter((market) => (market.estimatedShortLiquidationUsd || 0) > 0)
    .sort((a, b) => {
      const biasScore = (b.crowdingBias === 'shorts-at-risk' ? 1 : 0) - (a.crowdingBias === 'shorts-at-risk' ? 1 : 0);
      if (biasScore !== 0) {
        return biasScore;
      }
      return (b.estimatedShortLiquidationUsd || 0) - (a.estimatedShortLiquidationUsd || 0);
    })
    .slice(0, 3);

  return { longs, shorts };
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

function formatSignedPct(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatFunding(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  const pct = value * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(3)}%`;
}

const miniActionButton: React.CSSProperties = {
  padding: '5px 8px',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '8px',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontSize: '10px',
  fontWeight: 700
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 700,
  marginBottom: '6px'
};

const commandButtonStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '10px',
  color: '#f3f4f6',
  cursor: 'pointer',
  textAlign: 'left'
};

const commandTextStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#d1d5db',
  fontFamily: 'Consolas, monospace',
  wordBreak: 'break-word',
  marginTop: '4px'
};
