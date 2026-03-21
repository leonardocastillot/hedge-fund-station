import React, { useState, useEffect } from 'react';
import type { UpdateStatus } from '../../types/electron';

export const UpdateNotification: React.FC = () => {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const cleanup = window.electronAPI.update.onStatus((status) => {
      setUpdateStatus(status);

      if (status.status === 'downloading') {
        setIsDownloading(true);
      } else if (status.status === 'downloaded') {
        setIsDownloading(false);
      }
    });

    return cleanup;
  }, []);

  const handleDownload = async () => {
    try {
      await window.electronAPI.update.download();
    } catch (error) {
      console.error('Failed to download update:', error);
    }
  };

  const handleInstall = async () => {
    try {
      await window.electronAPI.update.install();
    } catch (error) {
      console.error('Failed to install update:', error);
    }
  };

  const handleDismiss = () => {
    setUpdateStatus(null);
  };

  // Don't show notification for checking or not-available states
  if (!updateStatus ||
      updateStatus.status === 'checking' ||
      updateStatus.status === 'not-available') {
    return null;
  }

  // Available - show download button
  if (updateStatus.status === 'available') {
    return (
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '400px',
        background: '#1a1f2e',
        border: '2px solid #ef4444',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        zIndex: 10000,
        animation: 'slideIn 0.3s ease-out'
      }}>
        <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
          <div style={{ fontSize: '32px' }}>🎉</div>
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#fff'
            }}>
              Update Available!
            </h3>
            <p style={{
              margin: '0 0 12px 0',
              fontSize: '14px',
              color: '#9ca3af',
              lineHeight: '1.5'
            }}>
              Version {updateStatus.data.version} is ready to download.
            </p>
            {updateStatus.data.releaseNotes && (
              <div style={{
                fontSize: '12px',
                color: '#6b7280',
                marginBottom: '12px',
                maxHeight: '60px',
                overflow: 'auto',
                padding: '8px',
                background: '#0B0F19',
                borderRadius: '6px'
              }}>
                {updateStatus.data.releaseNotes}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleDownload}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Download Update
              </button>
              <button
                onClick={handleDismiss}
                style={{
                  padding: '10px 16px',
                  background: '#2d3748',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Downloading - show progress
  if (updateStatus.status === 'downloading' && isDownloading) {
    const percent = updateStatus.data.percent || 0;
    const transferred = updateStatus.data.transferred || 0;
    const total = updateStatus.data.total || 0;
    const speed = updateStatus.data.bytesPerSecond || 0;

    return (
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '400px',
        background: '#1a1f2e',
        border: '2px solid #ef4444',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        zIndex: 10000
      }}>
        <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
          <div style={{ fontSize: '32px' }}>⬇️</div>
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#fff'
            }}>
              Downloading Update...
            </h3>
            <div style={{
              width: '100%',
              height: '8px',
              background: '#0B0F19',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '8px'
            }}>
              <div style={{
                width: `${percent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #ef4444, #dc2626)',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#9ca3af'
            }}>
              <span>{percent}%</span>
              <span>{transferred}MB / {total}MB</span>
              <span>{speed} KB/s</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Downloaded - show install button
  if (updateStatus.status === 'downloaded') {
    return (
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '400px',
        background: '#1a1f2e',
        border: '2px solid #10b981',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        zIndex: 10000,
        animation: 'slideIn 0.3s ease-out'
      }}>
        <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
          <div style={{ fontSize: '32px' }}>✅</div>
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#fff'
            }}>
              Update Ready!
            </h3>
            <p style={{
              margin: '0 0 12px 0',
              fontSize: '14px',
              color: '#9ca3af',
              lineHeight: '1.5'
            }}>
              Version {updateStatus.data.version} has been downloaded. Restart to apply.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleInstall}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Restart Now
              </button>
              <button
                onClick={handleDismiss}
                style={{
                  padding: '10px 16px',
                  background: '#2d3748',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error - show error message
  if (updateStatus.status === 'error') {
    return (
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '400px',
        background: '#1a1f2e',
        border: '2px solid #ef4444',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        zIndex: 10000
      }}>
        <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
          <div style={{ fontSize: '32px' }}>❌</div>
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#fff'
            }}>
              Update Error
            </h3>
            <p style={{
              margin: '0 0 12px 0',
              fontSize: '14px',
              color: '#9ca3af',
              lineHeight: '1.5'
            }}>
              {updateStatus.data.message}
            </p>
            <button
              onClick={handleDismiss}
              style={{
                width: '100%',
                padding: '10px',
                background: '#2d3748',
                border: 'none',
                borderRadius: '8px',
                color: '#e5e7eb',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
