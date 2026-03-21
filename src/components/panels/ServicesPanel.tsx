import React from 'react';

export const ServicesPanel: React.FC = () => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#000000',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
        background: 'rgba(239, 68, 68, 0.05)'
      }}>
        <h2 style={{
          color: '#ef4444',
          fontSize: '18px',
          fontWeight: '700',
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>🏢</span>
          Services Panel
        </h2>
        <p style={{
          color: '#9ca3af',
          fontSize: '12px',
          margin: '4px 0 0 0'
        }}>
          Gestión de proyectos de clientes y servicios
        </p>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '20px'
      }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(239, 68, 68, 0.15)',
          borderRadius: '12px',
          padding: '40px 20px',
          textAlign: 'center'
        }}>
          <span style={{ fontSize: '48px' }}>🏗️</span>
          <h3 style={{
            color: '#e0e0e0',
            fontSize: '16px',
            fontWeight: '600',
            margin: '16px 0 8px 0'
          }}>
            Coming Soon
          </h3>
          <p style={{
            color: '#9ca3af',
            fontSize: '12px',
            lineHeight: '1.6',
            margin: 0
          }}>
            Gestión de proyectos de clientes,<br />
            tracking de tiempo, deliverables y más.
          </p>
        </div>
      </div>
    </div>
  );
};
