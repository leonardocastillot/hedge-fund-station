import React from 'react';
import { recordTelemetry } from '@/services/performanceTelemetry';

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: ''
    };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Unknown renderer error'
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AppErrorBoundary caught renderer error:', error, errorInfo);
    recordTelemetry({ type: 'error', label: 'app:error-boundary', status: 'render-error', detail: error.message });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            background: '#05070b',
            color: '#f9fafb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            style={{
              width: 'min(720px, 100%)',
              borderRadius: '18px',
              border: '1px solid rgba(239, 68, 68, 0.24)',
              background: 'rgba(11, 15, 25, 0.96)',
              padding: '24px',
              boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)'
            }}
          >
            <div
              style={{
                color: '#fca5a5',
                fontSize: '11px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.14em'
              }}
            >
              Renderer Error
            </div>
            <h1 style={{ margin: '10px 0 8px 0', fontSize: '22px' }}>The app hit a runtime error</h1>
            <p style={{ margin: 0, color: '#9ca3af', fontSize: '13px', lineHeight: 1.6 }}>
              Open DevTools or the terminal logs and inspect the error below. The renderer no longer fails silently.
            </p>
            <pre
              style={{
                marginTop: '16px',
                padding: '14px',
                borderRadius: '12px',
                background: '#020617',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#e5e7eb',
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {this.state.errorMessage}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: '16px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(239, 68, 68, 0.24)',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#fecaca',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
              Reload Renderer
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
