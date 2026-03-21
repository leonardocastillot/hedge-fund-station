import React from 'react';
import { useContextContext } from '../contexts/ContextContext';

export const ContextSwitcher: React.FC = () => {
  const { activeContext, contexts, setActiveContext } = useContextContext();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '6px 16px',
      background: 'rgba(0, 0, 0, 0.95)',
      borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
      boxShadow: '0 2px 12px rgba(239, 68, 68, 0.15)'
    }}>
      {/* Context Tabs */}
      <div style={{
        display: 'flex',
        gap: '2px',
        flex: 1
      }}>
        {contexts.map((ctx) => {
          const isActive = activeContext === ctx.id;

          return (
            <button
              key={ctx.id}
              onClick={() => setActiveContext(ctx.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: isActive
                  ? `linear-gradient(135deg, ${ctx.color}22 0%, ${ctx.color}11 100%)`
                  : 'rgba(255, 255, 255, 0.02)',
                border: 'none',
                borderBottom: isActive ? `2px solid ${ctx.color}` : '2px solid transparent',
                borderRadius: '8px 8px 0 0',
                color: isActive ? ctx.color : '#9ca3af',
                fontSize: '12px',
                fontWeight: isActive ? '600' : '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = '#e0e0e0';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                  e.currentTarget.style.color = '#9ca3af';
                }
              }}
              title={ctx.description}
            >
              {/* Active indicator glow */}
              {isActive && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: `linear-gradient(90deg, transparent, ${ctx.color}, transparent)`,
                  boxShadow: `0 0 10px ${ctx.color}`,
                  animation: 'pulse 2s ease-in-out infinite'
                }} />
              )}

              <span style={{ fontSize: '14px' }}>{ctx.icon}</span>
              <span style={{ letterSpacing: '0.3px' }}>{ctx.name}</span>

              {/* Active dot */}
              {isActive && (
                <span style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: ctx.color,
                  boxShadow: `0 0 8px ${ctx.color}`,
                  animation: 'pulse 2s ease-in-out infinite'
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Status indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        background: 'rgba(239, 68, 68, 0.08)',
        borderRadius: '6px',
        border: '1px solid rgba(239, 68, 68, 0.2)'
      }}>
        <div style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: '#ef4444',
          boxShadow: '0 0 10px #ef4444',
          animation: 'pulse 2s ease-in-out infinite'
        }} />
        <span style={{
          fontSize: '10px',
          color: '#ef4444',
          fontWeight: '600',
          letterSpacing: '0.5px',
          textTransform: 'uppercase'
        }}>
          Live
        </span>
      </div>
    </div>
  );
};

// Add keyframes animation
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;
document.head.appendChild(style);
