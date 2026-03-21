import { useState, useEffect } from 'react';
import { AppSettings, DEFAULT_APP_SETTINGS, SETTINGS_STORAGE_KEY } from '../utils/appSettings';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [saved, setSaved] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (savedSettings) {
      try {
        setSettings({ ...DEFAULT_APP_SETTINGS, ...JSON.parse(savedSettings) });
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings(DEFAULT_APP_SETTINGS);
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflowY: 'auto',
      background: '#0B0F19',
      padding: '40px'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 700,
            color: '#fff',
            marginBottom: '8px'
          }}>
            ⚙️ Settings
          </h1>
          <p style={{
            fontSize: '16px',
            color: '#9ca3af'
          }}>
            Customize your Hedge Fund Station experience
          </p>
        </div>

        {/* Settings Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Appearance */}
          <div style={{
            background: '#1a1f2e',
            border: '1px solid #2d3748',
            borderRadius: '12px',
            padding: '24px'
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#fff',
              marginBottom: '20px'
            }}>
              🎨 Appearance
            </h2>

            {/* Theme */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#e5e7eb',
                marginBottom: '8px'
              }}>
                Theme
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setSettings({ ...settings, theme: 'dark' })}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: settings.theme === 'dark' ? '#8b5cf622' : '#0B0F19',
                    border: settings.theme === 'dark' ? '2px solid #8b5cf6' : '1px solid #2d3748',
                    borderRadius: '8px',
                    color: '#e5e7eb',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  🌙 Dark
                </button>
                <button
                  onClick={() => setSettings({ ...settings, theme: 'light' })}
                  disabled
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#0B0F19',
                    border: '1px solid #2d3748',
                    borderRadius: '8px',
                    color: '#6b7280',
                    cursor: 'not-allowed',
                    fontSize: '14px'
                  }}
                >
                  ☀️ Light (Coming Soon)
                </button>
              </div>
            </div>

            {/* Font Size */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#e5e7eb',
                marginBottom: '8px'
              }}>
                Terminal Font Size: {settings.fontSize}px
              </label>
              <input
                type="range"
                min="10"
                max="24"
                value={settings.fontSize}
                onChange={(e) => setSettings({ ...settings, fontSize: parseInt(e.target.value) })}
                style={{
                  width: '100%',
                  accentColor: '#8b5cf6'
                }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: '#6b7280',
                marginTop: '4px'
              }}>
                <span>Small</span>
                <span>Large</span>
              </div>
            </div>
          </div>

          {/* Terminal */}
          <div style={{
            background: '#1a1f2e',
            border: '1px solid #2d3748',
            borderRadius: '12px',
            padding: '24px'
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#fff',
              marginBottom: '20px'
            }}>
              💻 Terminal
            </h2>

            {/* Default Shell */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#e5e7eb',
                marginBottom: '8px'
              }}>
                Default Shell
              </label>
              <select
                value={settings.defaultShell}
                onChange={(e) => setSettings({ ...settings, defaultShell: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#0B0F19',
                  border: '1px solid #2d3748',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                <option value="powershell.exe">PowerShell</option>
                <option value="cmd.exe">Command Prompt</option>
                <option value="bash">Bash (WSL)</option>
              </select>
            </div>

            {/* Scrollback Lines */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#e5e7eb',
                marginBottom: '8px'
              }}>
                Scrollback Lines: {settings.scrollbackLines.toLocaleString()}
              </label>
              <input
                type="range"
                min="1000"
                max="50000"
                step="1000"
                value={settings.scrollbackLines}
                onChange={(e) => setSettings({ ...settings, scrollbackLines: parseInt(e.target.value) })}
                style={{
                  width: '100%',
                  accentColor: '#8b5cf6'
                }}
              />
              <div style={{
                fontSize: '12px',
                color: '#6b7280',
                marginTop: '4px'
              }}>
                Number of lines to keep in terminal history
              </div>
            </div>
          </div>

          {/* API */}
          <div style={{
            background: '#1a1f2e',
            border: '1px solid #2d3748',
            borderRadius: '12px',
            padding: '24px'
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#fff',
              marginBottom: '20px'
            }}>
              🔌 API Connection
            </h2>

            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#e5e7eb',
                marginBottom: '8px'
              }}>
                Backend API URL
              </label>
              <input
                type="text"
                value={settings.apiUrl}
                onChange={(e) => setSettings({ ...settings, apiUrl: e.target.value })}
                placeholder="http://127.0.0.1:18001"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#0B0F19',
                  border: '1px solid #2d3748',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  fontFamily: 'monospace'
                }}
              />
              <div style={{
                fontSize: '12px',
                color: '#6b7280',
                marginTop: '4px'
              }}>
                Restart required to apply changes
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div style={{
            background: '#1a1f2e',
            border: '1px solid #2d3748',
            borderRadius: '12px',
            padding: '24px'
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#fff',
              marginBottom: '20px'
            }}>
              🔔 Notifications
            </h2>

            {/* Enable Notifications */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={settings.enableNotifications}
                  onChange={(e) => setSettings({ ...settings, enableNotifications: e.target.checked })}
                  style={{
                    width: '18px',
                    height: '18px',
                    accentColor: '#8b5cf6',
                    cursor: 'pointer'
                  }}
                />
                <span style={{
                  fontSize: '14px',
                  color: '#e5e7eb'
                }}>
                  Enable desktop notifications
                </span>
              </label>
            </div>

            {/* Enable Sounds */}
            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={settings.enableSounds}
                  onChange={(e) => setSettings({ ...settings, enableSounds: e.target.checked })}
                  style={{
                    width: '18px',
                    height: '18px',
                    accentColor: '#8b5cf6',
                    cursor: 'pointer'
                  }}
                />
                <span style={{
                  fontSize: '14px',
                  color: '#e5e7eb'
                }}>
                  Enable sound alerts
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginTop: '32px',
          paddingTop: '32px',
          borderTop: '1px solid #2d3748'
        }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: '12px 24px',
              background: '#8b5cf6',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {saved ? '✓ Saved!' : 'Save Settings'}
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: '12px 24px',
              background: '#2d3748',
              border: 'none',
              borderRadius: '8px',
              color: '#e5e7eb',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Reset to Defaults
          </button>
        </div>

        {/* Info */}
        <div style={{
          marginTop: '24px',
          padding: '16px',
          background: '#1a1f2e',
          border: '1px solid #2d3748',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#9ca3af'
        }}>
          <strong style={{ color: '#e5e7eb' }}>Note:</strong> Some settings require restarting the application to take effect.
        </div>
      </div>
    </div>
  );
}
