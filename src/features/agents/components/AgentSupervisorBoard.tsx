import React from 'react';
import { useAgentProfilesContext } from '@/contexts/AgentProfilesContext';
import { useDeskHistoryContext } from '@/contexts/DeskHistoryContext';
import { useTerminalContext } from '@/contexts/TerminalContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { AGENT_PROVIDERS, getProviderMeta, resolveAgentRuntimeCommand, resolveAgentRuntimeShell } from '@/utils/agentRuntime';
import { launchProfileSequence } from '@/utils/workspaceLaunch';

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) {
    return 'Never';
  }

  const deltaMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.round(deltaMs / 60000));
  if (minutes < 1) {
    return 'Now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.round(hours / 24)}d`;
}

export const AgentSupervisorBoard: React.FC<{ workspaceId?: string | null }> = ({ workspaceId }) => {
  const { agents, upsertAgent } = useAgentProfilesContext();
  const { history, recordLaunch } = useDeskHistoryContext();
  const { terminals, createTerminal, setActiveTerminal, activeTerminalId } = useTerminalContext();
  const { workspaces } = useWorkspaceContext();

  const scopedAgents = React.useMemo(
    () => agents.filter((agent) => !workspaceId || agent.workspaceId === workspaceId),
    [agents, workspaceId]
  );

  const launchAgent = React.useCallback((agentId: string) => {
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) {
      return;
    }

    const workspace = workspaces.find((item) => item.id === agent.workspaceId);
    if (!workspace) {
      return;
    }

    const assetSymbol = workspace.asset_symbol || workspace.strategy_symbol;
    const metadata = {
      agentId: agent.id,
      agentName: agent.name,
      terminalPurpose: agent.autoAssignTerminalPurpose,
      workspaceId: workspace.id,
      assetSymbol,
      strategySessionId: assetSymbol ? `strategy-session-${assetSymbol.toLowerCase()}-${Date.now()}` : undefined,
      strategySessionTitle: assetSymbol ? `${assetSymbol} draft strategy session` : undefined,
      strategySessionStatus: assetSymbol ? 'draft' as const : undefined,
      runtimeProvider: agent.provider
    };
    const runtimeShell = resolveAgentRuntimeShell(workspace.shell);

    const launchProfile = workspace.launch_profiles.find((profile) => profile.id === agent.defaultLaunchProfileId);

    if (launchProfile) {
      launchProfileSequence(workspace, launchProfile, createTerminal, metadata, recordLaunch);
      return;
    }

    createTerminal(
      workspace.path,
      runtimeShell,
      `${agent.name}: ${getProviderMeta(agent.provider).label}`,
      resolveAgentRuntimeCommand(agent.provider, runtimeShell),
      metadata
    );
  }, [agents, createTerminal, recordLaunch, workspaces]);

  const recentActivity = React.useMemo(() => {
    const terminalEvents = terminals
      .filter((terminal) => !workspaceId || scopedAgents.some((agent) => agent.id === terminal.agentId))
      .map((terminal) => ({
        id: terminal.id,
        title: terminal.agentName || terminal.label,
        subtitle: terminal.currentCommand || terminal.terminalPurpose || 'Interactive',
        timestamp: terminal.createdAt
      }));

    const deskEvents = history
      .filter((entry) => !workspaceId || entry.workspaceId === workspaceId)
      .map((entry) => ({
        id: entry.id,
        title: entry.profileName,
        subtitle: entry.commands.join(' • '),
        timestamp: entry.launchedAt
      }));

    return [...terminalEvents, ...deskEvents]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
  }, [history, scopedAgents, terminals, workspaceId]);

  return (
    <div style={boardStyle}>
      <div style={boardHeaderStyle}>
        <div>
          <div style={boardEyebrowStyle}>Agent Fleet</div>
          <div style={boardTitleStyle}>Who is running, with which engine, and where to focus.</div>
        </div>
      </div>

      <div style={fleetGridStyle}>
        <div style={{ display: 'grid', gap: '10px' }}>
          {scopedAgents.length === 0 ? (
            <div style={emptyStyle}>No agents in this desk.</div>
          ) : (
            scopedAgents.map((agent) => {
              const provider = getProviderMeta(agent.provider);
              const workspace = workspaces.find((item) => item.id === agent.workspaceId);
              const agentTerminals = terminals.filter((terminal) => terminal.agentId === agent.id);
              const latestDesk = history.find((entry) => entry.workspaceId === agent.workspaceId && entry.profileId === agent.defaultLaunchProfileId);

              return (
                <div key={agent.id} style={agentCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ color: '#f8fafc', fontSize: '14px', fontWeight: 800 }}>{agent.name}</div>
                        <div style={{
                          padding: '3px 8px',
                          borderRadius: '999px',
                          background: `${agent.accentColor}20`,
                          color: agent.accentColor,
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em'
                        }}>
                          {agent.role}
                        </div>
                      </div>
                      <div style={{ color: '#64748b', fontSize: '11px', marginTop: '6px' }}>
                        {workspace?.name || agent.workspaceId} • {agentTerminals.length} terminals • last {formatRelativeTime(latestDesk?.launchedAt)}
                      </div>
                    </div>

                    <button type="button" onClick={() => launchAgent(agent.id)} style={launchStyle}>
                      Send Agent
                    </button>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {AGENT_PROVIDERS.map((providerId) => {
                      const meta = getProviderMeta(providerId);
                      const active = agent.provider === providerId;
                      return (
                        <button
                          key={providerId}
                          type="button"
                          onClick={() => upsertAgent({ ...agent, provider: providerId })}
                          style={{
                            padding: '7px 10px',
                            borderRadius: '999px',
                            border: active ? `1px solid ${meta.accent}55` : '1px solid rgba(148, 163, 184, 0.12)',
                            background: active ? meta.glow : 'rgba(15, 23, 42, 0.55)',
                            color: active ? meta.accent : '#cbd5e1',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 700
                          }}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>

                  <div style={runtimeStripStyle}>
                    <div style={runtimeBoxStyle}>
                      <div style={stripLabelStyle}>Runtime</div>
                      <div style={{ color: provider.accent, fontSize: '13px', fontWeight: 800 }}>{provider.label}</div>
                    </div>
                    <div style={runtimeBoxStyle}>
                      <div style={stripLabelStyle}>Focus</div>
                      <div style={{ color: '#f8fafc', fontSize: '13px', fontWeight: 700 }}>{agent.autoAssignTerminalPurpose}</div>
                    </div>
                    <div style={runtimeBoxStyle}>
                      <div style={stripLabelStyle}>Prompt</div>
                      <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.4 }}>{agent.promptTemplate}</div>
                    </div>
                  </div>

                  {agent.objective ? (
                    <div style={{ marginTop: '10px', color: '#e2e8f0', fontSize: '11px', lineHeight: 1.45 }}>
                      {agent.objective}
                    </div>
                  ) : null}

                  {agent.collaboratesWith && agent.collaboratesWith.length > 0 ? (
                    <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {agent.collaboratesWith.map((role) => (
                        <div
                          key={role}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '999px',
                            border: '1px solid rgba(148, 163, 184, 0.12)',
                            background: 'rgba(15, 23, 42, 0.5)',
                            color: '#94a3b8',
                            fontSize: '10px',
                            fontWeight: 700
                          }}
                        >
                          {role}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                    {agentTerminals.length === 0 ? (
                      <div style={emptyStyle}>No live terminal for this agent.</div>
                    ) : (
                      agentTerminals.slice(0, 2).map((terminal) => (
                        <button
                          key={terminal.id}
                          type="button"
                          onClick={() => setActiveTerminal(terminal.id)}
                          style={{
                            padding: '11px 12px',
                            borderRadius: '14px',
                            border: activeTerminalId === terminal.id ? `1px solid ${provider.accent}55` : '1px solid rgba(148, 163, 184, 0.12)',
                            background: activeTerminalId === terminal.id ? provider.glow : 'rgba(2, 6, 23, 0.7)',
                            color: '#f8fafc',
                            textAlign: 'left',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ fontSize: '12px', fontWeight: 700 }}>{terminal.label}</div>
                          <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '5px' }}>
                            {terminal.currentCommand || 'interactive shell'}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={activityCardStyle}>
          <div style={stripLabelStyle}>Recent Activity</div>
          <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
            {recentActivity.length === 0 ? (
              <div style={emptyStyle}>Nothing launched yet.</div>
            ) : (
              recentActivity.map((item) => (
                <div key={item.id} style={activityItemStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>{item.title}</div>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>{formatRelativeTime(item.timestamp)}</div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '5px', lineHeight: 1.4 }}>{item.subtitle}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const boardStyle: React.CSSProperties = {
  borderRadius: '24px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.96) 0%, rgba(15, 23, 42, 0.92) 100%)',
  padding: '18px'
};

const boardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center'
};

const boardEyebrowStyle: React.CSSProperties = {
  color: '#22c55e',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.14em'
};

const boardTitleStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '20px',
  fontWeight: 800,
  marginTop: '6px'
};

const fleetGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: '14px',
  marginTop: '16px'
};

const agentCardStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '20px',
  background: 'rgba(15, 23, 42, 0.58)',
  border: '1px solid rgba(148, 163, 184, 0.12)'
};

const runtimeStripStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '8px',
  marginTop: '12px'
};

const runtimeBoxStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: '14px',
  background: 'rgba(2, 6, 23, 0.7)',
  border: '1px solid rgba(148, 163, 184, 0.1)'
};

const stripLabelStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '10px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.08em'
};

const launchStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: '12px',
  border: '1px solid rgba(34, 197, 94, 0.22)',
  background: 'rgba(34, 197, 94, 0.12)',
  color: '#dcfce7',
  fontSize: '12px',
  fontWeight: 800,
  cursor: 'pointer'
};

const activityCardStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '20px',
  background: 'rgba(15, 23, 42, 0.58)',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  alignSelf: 'start'
};

const activityItemStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: '14px',
  background: 'rgba(2, 6, 23, 0.7)',
  border: '1px solid rgba(148, 163, 184, 0.1)'
};

const emptyStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: '14px',
  background: 'rgba(15, 23, 42, 0.45)',
  border: '1px dashed rgba(148, 163, 184, 0.14)',
  color: '#64748b',
  fontSize: '12px'
};
