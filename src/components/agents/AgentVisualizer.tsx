import React from 'react';
import type { AgentProfile } from '../../types/agents';
import type { TerminalSession } from '../../contexts/TerminalContext';
import { getProviderMeta } from '../../utils/agentRuntime';

interface AgentVisualizerProps {
    agents: AgentProfile[];
    terminals: TerminalSession[];
    onAgentClick: (agentId: string) => void;
    activeAgentId?: string | null;
}

export const AgentVisualizer: React.FC<AgentVisualizerProps> = ({
    agents,
    terminals,
    onAgentClick,
    activeAgentId
}) => {
    // Static layout
    const radiusOuter = 220; // px
    const radiusInner = 110; // px
    const totalAgents = Math.max(agents.length, 1);

    // Determine global state
    const isRouting = terminals.some(t => t.currentCommand?.toLowerCase().includes('routing'));
    const isRunning = terminals.length > 0;

    const coreGlow = isRouting
        ? 'rgba(255, 255, 255, 0.4)' // routing = white glow
        : isRunning
            ? 'rgba(220, 38, 38, 0.6)' // running = red glow
            : 'rgba(255, 255, 255, 0.1)'; // standby = faint white

    const coreColor = isRouting ? '#ffffff' : isRunning ? '#ef4444' : '#64748b';

    return (
        <div style={containerStyle}>
            <div style={visualizerWrapperStyle}>

                {/* Background Grid & Depth effects */}
                <div style={gridBackgroundStyle} />

                {/* Center Core */}
                <div style={{
                    ...coreContainerStyle,
                    boxShadow: `0 0 60px ${coreGlow}, inset 0 0 20px ${coreColor}`,
                    borderColor: `${coreColor}60`
                }} className="animate-pulse-slow">
                    <div style={{ ...coreInnerStyle, background: coreColor }}>
                        <div style={coreIconStyle}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                        </div>
                    </div>
                    <div style={coreLabelStyle}>AI CORE</div>
                </div>

                {/* Orbit Rings */}
                <div style={{ ...orbitRingStyle, width: radiusInner * 2, height: radiusInner * 2, border: '1px dashed rgba(148, 163, 184, 0.15)' }} />
                <div style={{ ...orbitRingStyle, width: radiusOuter * 2, height: radiusOuter * 2, border: '1px solid rgba(148, 163, 184, 0.05)' }} />

                {/* Agent Nodes */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 0,
                    height: 0
                }}>
                    {agents.map((agent, index) => {
                        // Determine Agent State
                        const agentTerminals = terminals.filter((t) => t.agentId === agent.id);
                        const isAgentActive = agentTerminals.length > 0;
                        const currentSession = isAgentActive ? agentTerminals[0] : null;

                        // Position Logic: Active agents are on inner radius, Idle on outer radius
                        const distance = isAgentActive ? radiusInner : radiusOuter;
                        const angle = (index / totalAgents) * Math.PI * 2;
                        const x = Math.cos(angle) * distance;
                        const y = Math.sin(angle) * distance;

                        const providerMeta = getProviderMeta(agent.provider);
                        const isSelected = activeAgentId === agent.id;

                        // Force red/white/dark theme on nodes instead of provider colors
                        const nodeGlow = isAgentActive ? 'rgba(220, 38, 38, 0.6)' : 'rgba(15, 23, 42, 0.8)';
                        const nodeBorder = isAgentActive ? '#ef4444' : 'rgba(148, 163, 184, 0.2)';
                        const nodeBg = isAgentActive ? 'rgba(220, 38, 38, 0.15)' : 'rgba(2, 6, 23, 0.8)';
                        const lineStroke = '#ef4444';

                        return (
                            <div
                                key={agent.id}
                                onClick={() => onAgentClick(agent.id)}
                                style={{
                                    ...nodeStyle,
                                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                                    boxShadow: `0 0 15px ${nodeGlow}`,
                                    borderColor: isSelected ? '#ffffff' : nodeBorder,
                                    background: nodeBg,
                                    zIndex: 10
                                }}
                                className={`transition-all duration-300 hover:scale-105 ${isAgentActive ? 'animate-glow' : ''}`}
                                title={agent.name}
                            >
                                {/* Connection Line back to center if active */}
                                {isAgentActive && (
                                    <svg style={connectionLineStyle}>
                                        <line
                                            x1="50%" y1="50%"
                                            x2={`calc(50% - ${x}px)`} y2={`calc(50% - ${y}px)`}
                                            stroke={lineStroke}
                                            strokeWidth="2"
                                            strokeDasharray="4 4"
                                            opacity="0.5"
                                        />
                                    </svg>
                                )}

                                <div style={{ color: isSelected ? '#f8fafc' : '#e2e8f0', fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                                    {agent.name.substring(0, 20)}
                                </div>
                                <div style={{ color: isAgentActive ? '#ef4444' : '#64748b', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', marginTop: '4px', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                                    {providerMeta.shortLabel} {isAgentActive ? '• RUNNING' : '• STANDBY'}
                                </div>

                                {isAgentActive && currentSession?.currentCommand && (
                                    <div style={{ color: '#f8fafc', fontSize: '10px', marginTop: '6px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>
                                        &gt; {currentSession.currentCommand}
                                    </div>
                                )}

                                {isAgentActive && (
                                    <div style={terminalBadgeStyle}>
                                        {agentTerminals.length > 1 ? `${agentTerminals.length} TTY` : 'TTY'}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

            </div>
        </div>
    );
};

// Styles

const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    minHeight: '400px',
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: '24px',
    border: '1px solid rgba(148, 163, 184, 0.08)',
    background: 'linear-gradient(135deg, rgba(2, 6, 23, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)',
    boxShadow: 'inset 0 0 100px rgba(0,0,0,0.5)'
};

const gridBackgroundStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
    linear-gradient(rgba(220, 38, 38, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(220, 38, 38, 0.05) 1px, transparent 1px)
  `,
    backgroundSize: '40px 40px',
    backgroundPosition: 'center center',
    perspective: '1000px',
    transform: 'rotateX(60deg) scale(2.5) translateY(-50px)',
    transformOrigin: 'top center',
    opacity: 0.6,
    pointerEvents: 'none'
};

const visualizerWrapperStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
};

const orbitRingStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    pointerEvents: 'none'
};

const coreContainerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    background: 'rgba(2, 6, 23, 0.8)',
    border: '2px solid',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'column',
    zIndex: 20,
    backdropFilter: 'blur(8px)'
};

const coreInnerStyle: React.CSSProperties = {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: '#020617'
};

const coreIconStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
};

const coreLabelStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '-28px',
    color: '#f8fafc',
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    textShadow: '0 2px 4px rgba(0,0,0,0.8)'
};

const nodeStyle: React.CSSProperties = {
    position: 'absolute',
    padding: '12px 16px',
    borderRadius: '16px',
    border: '1px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(10px)',
    cursor: 'pointer',
    minWidth: '120px',
    whiteSpace: 'nowrap'
};

const terminalBadgeStyle: React.CSSProperties = {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    background: '#e2e8f0',
    color: '#0f172a',
    fontSize: '9px',
    fontWeight: 900,
    padding: '2px 6px',
    borderRadius: '8px',
    boxShadow: '0 0 10px rgba(226,232,240,0.5)'
};

const connectionLineStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
    zIndex: -1
};
