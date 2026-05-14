import { useEffect, useState } from 'react';
import type React from 'react';
import {
  Bell,
  Bot,
  Check,
  Gauge,
  KeyRound,
  Palette,
  PlugZap,
  RotateCcw,
  Save,
  TerminalSquare
} from 'lucide-react';
import {
  APP_THEMES,
  AppSettings,
  applyAppTheme,
  loadAppSettings,
  resetAppSettings,
  saveAppSettings
} from '@/utils/appSettings';
import { getTerminalShellOptions, resolveTerminalShell } from '@/utils/terminalShell';
import { alphaEngineApi, type AiStatus, type AiTestResult } from '@/services/alphaEngineApi';
import { hyperliquidService, type HyperliquidAgentRuntimeStatus } from '@/services/hyperliquidService';

const PERFORMANCE_PROFILE_OPTIONS: Array<{
  id: AppSettings['performanceProfile'];
  label: string;
  detail: string;
}> = [
  {
    id: 'daily-light',
    label: 'Daily Light',
    detail: 'Default for daily use: fewer background polls and lighter media.'
  },
  {
    id: 'full',
    label: 'Full Visual',
    detail: 'Keeps richer visuals and normal refresh cadence for active review.'
  },
  {
    id: 'ultra-light',
    label: 'Ultra Light',
    detail: 'Maximum restraint for weak batteries, heat, or long sessions.'
  }
];

const SHELL_OPTIONS = getTerminalShellOptions();

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [saved, setSaved] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiTest, setAiTest] = useState<AiTestResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<{ isConfigured: boolean; model: string; keyPreview: string | null } | null>(null);
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [geminiMessage, setGeminiMessage] = useState<string | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [agentRuntimeStatus, setAgentRuntimeStatus] = useState<HyperliquidAgentRuntimeStatus | null>(null);
  const [agentRuntimeError, setAgentRuntimeError] = useState<string | null>(null);
  const [codexLoginMessage, setCodexLoginMessage] = useState<string | null>(null);
  const [claudeStatus, setClaudeStatus] = useState<{ available: boolean; resolvedPath?: string | null } | null>(null);

  useEffect(() => {
    alphaEngineApi.aiStatus()
      .then((status) => setAiStatus(status))
      .catch((error) => setAiError(error instanceof Error ? error.message : 'Unable to load AI provider status.'));
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.voice?.getLiveStatus) {
      return;
    }

    window.electronAPI.voice.getLiveStatus()
      .then((status) => setGeminiStatus(status))
      .catch((error) => setGeminiError(error instanceof Error ? error.message : 'Unable to load Gemini Live status.'));
  }, []);

  const refreshAgentRuntimeStatus = async () => {
    try {
      const [status, commands] = await Promise.all([
        hyperliquidService.getAgentRuntimeStatus(),
        window.electronAPI?.diagnostics?.checkCommands
          ? window.electronAPI.diagnostics.checkCommands(['claude']).catch(() => [])
          : Promise.resolve([])
      ]);
      setAgentRuntimeStatus(status);
      const claude = commands.find((command) => command.command === 'claude') ?? null;
      setClaudeStatus(claude ? { available: claude.available, resolvedPath: claude.resolvedPath } : null);
      setAgentRuntimeError(null);
    } catch (error) {
      setAgentRuntimeError(error instanceof Error ? error.message : 'Unable to load agent runtime status.');
    }
  };

  useEffect(() => {
    void refreshAgentRuntimeStatus();
  }, []);

  const updateSettings = (nextSettings: AppSettings) => {
    const normalizedSettings = {
      ...nextSettings,
      defaultShell: resolveTerminalShell(nextSettings.defaultShell).shell
    };
    setSettings(normalizedSettings);
    applyAppTheme(normalizedSettings.theme);
  };

  const handleAiTest = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await alphaEngineApi.aiTest();
      setAiTest(result);
      setAiStatus(result.status);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Unable to test AI provider.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveGeminiKey = async () => {
    const trimmed = geminiKey.trim();
    if (!trimmed) {
      setGeminiError('Paste a Gemini API key before saving.');
      setGeminiMessage(null);
      return;
    }

    if (!window.electronAPI?.ai?.saveGeminiApiKey || !window.electronAPI?.voice?.getLiveStatus) {
      setGeminiError('AI provider settings bridge is not available in this build.');
      setGeminiMessage(null);
      return;
    }

    setGeminiSaving(true);
    setGeminiError(null);
    setGeminiMessage(null);
    try {
      await window.electronAPI.ai.saveGeminiApiKey(trimmed);
      const nextStatus = await window.electronAPI.voice.getLiveStatus();
      setGeminiStatus(nextStatus);
      setGeminiKey('');
      setGeminiMessage('Gemini Live key saved. Start Live can now create voice sessions.');
    } catch (error) {
      setGeminiError(error instanceof Error ? error.message : 'Unable to save Gemini API key.');
    } finally {
      setGeminiSaving(false);
    }
  };

  const handleLaunchCodexLogin = async () => {
    if (!window.electronAPI?.diagnostics?.launchCodexLogin) {
      setCodexLoginMessage('Codex login launcher is not available in this build.');
      return;
    }

    const result = await window.electronAPI.diagnostics.launchCodexLogin();
    if (result.success) {
      setCodexLoginMessage('Codex login opened in Terminal. Complete the browser/device flow, then refresh status.');
    } else {
      setCodexLoginMessage(result.error || 'Unable to launch codex login.');
    }
  };

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSave = () => {
    setSettings(saveAppSettings(settings));
    flashSaved();
  };

  const handleReset = () => {
    setSettings(resetAppSettings());
    flashSaved();
  };

  return (
    <div style={pageStyle}>
      <div style={contentStyle}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>Operator Settings</div>
            <h1 style={titleStyle}>Control de apariencia y sistema</h1>
            <p style={subtitleStyle}>
              Elige una combinación de colores para el cockpit y ajusta la terminal sin tocar la capa de trading.
            </p>
          </div>
          <div style={themeSummaryStyle}>
            {APP_THEMES.find((theme) => theme.id === settings.theme)?.swatches.map((color) => (
              <span key={color} style={{ ...summarySwatchStyle, background: color }} />
            ))}
          </div>
        </header>

        <div style={sectionStackStyle}>
          <section style={sectionStyle}>
            <SectionTitle icon={<Palette size={18} />} title="Temas de color" />
            <div style={themeGridStyle}>
              {APP_THEMES.map((theme) => {
                const active = settings.theme === theme.id;

                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => updateSettings({ ...settings, theme: theme.id })}
                    style={{
                      ...themeCardStyle,
                      borderColor: active ? 'var(--app-accent)' : 'var(--app-border)',
                      background: active
                        ? 'linear-gradient(135deg, var(--app-accent-soft), rgba(255,255,255,0.035))'
                        : 'rgba(255,255,255,0.025)',
                      boxShadow: active ? '0 18px 42px var(--app-glow)' : 'none'
                    }}
                  >
                    <span style={themePreviewStyle}>
                      {theme.swatches.map((color) => (
                        <span key={color} style={{ ...themeSwatchStyle, background: color }} />
                      ))}
                    </span>
                    <span style={themeNameRowStyle}>
                      <span style={themeNameStyle}>{theme.name}</span>
                      {active ? <Check size={16} color="var(--app-accent)" /> : null}
                    </span>
                    <span style={themeDescriptionStyle}>{theme.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section style={sectionStyle}>
            <SectionTitle icon={<Gauge size={18} />} title="Performance Profile" />
            <div style={themeGridStyle}>
              {PERFORMANCE_PROFILE_OPTIONS.map((profile) => {
                const active = settings.performanceProfile === profile.id;

                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => updateSettings({ ...settings, performanceProfile: profile.id })}
                    style={{
                      ...themeCardStyle,
                      minHeight: '112px',
                      borderColor: active ? 'var(--app-accent)' : 'var(--app-border)',
                      background: active
                        ? 'linear-gradient(135deg, var(--app-accent-soft), rgba(255,255,255,0.035))'
                        : 'rgba(255,255,255,0.025)',
                      boxShadow: active ? '0 18px 42px var(--app-glow)' : 'none'
                    }}
                  >
                    <span style={themeNameRowStyle}>
                      <span style={themeNameStyle}>{profile.label}</span>
                      {active ? <Check size={16} color="var(--app-accent)" /> : null}
                    </span>
                    <span style={themeDescriptionStyle}>{profile.detail}</span>
                  </button>
                );
              })}
            </div>
            <div style={helperStyle}>
              Daily Light is the default: it slows automatic polling, reduces background media work, and keeps heavy visuals opt-in.
            </div>
          </section>

          <section style={sectionStyle}>
            <SectionTitle icon={<TerminalSquare size={18} />} title="Terminal" />
            <SettingLabel label={`Terminal Font Size: ${settings.fontSize}px`} />
            <input
              type="range"
              min="10"
              max="24"
              value={settings.fontSize}
              onChange={(event) => updateSettings({ ...settings, fontSize: parseInt(event.target.value) })}
              style={rangeStyle}
            />
            <div style={rangeHintStyle}>
              <span>Small</span>
              <span>Large</span>
            </div>

            <div style={{ height: '20px' }} />

            <SettingLabel label="Default Shell" />
            <select
              value={settings.defaultShell}
              onChange={(event) => updateSettings({ ...settings, defaultShell: event.target.value })}
              style={controlStyle}
            >
              {SHELL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
              {SHELL_OPTIONS.some((option) => option.value === settings.defaultShell) ? null : (
                <option value={settings.defaultShell}>{settings.defaultShell}</option>
              )}
            </select>

            <div style={{ height: '20px' }} />

            <SettingLabel label={`Scrollback Lines: ${settings.scrollbackLines.toLocaleString()}`} />
            <input
              type="range"
              min="1000"
              max="50000"
              step="1000"
              value={settings.scrollbackLines}
              onChange={(event) => updateSettings({ ...settings, scrollbackLines: parseInt(event.target.value) })}
              style={rangeStyle}
            />
            <div style={helperStyle}>Number of lines to keep in terminal history.</div>
          </section>

          <section style={sectionStyle}>
            <SectionTitle icon={<Bot size={18} />} title="AI Providers" />
            <div style={metricGridStyle}>
              <AiMetric label="Active Provider" value={aiStatus?.activeProvider || 'unknown'} />
              <AiMetric label="Active Model" value={aiStatus?.activeModel || 'deterministic'} />
              <AiMetric label="DeepSeek" value={aiStatus?.deepseek.configured ? 'configured' : 'missing'} />
              <AiMetric label="OpenAI Fallback" value={aiStatus?.openai.configured ? 'configured' : 'missing'} />
            </div>

            <div style={helperStyle}>
              Provider order: {(aiStatus?.providerOrder ?? ['deepseek', 'openai']).join(' -> ')}. Keys are loaded
              server-side from local environment files and are never shown here.
            </div>

            {aiError ? <Notice tone="danger">{aiError}</Notice> : null}

            {aiTest ? (
              <Notice tone={aiTest.success ? 'success' : 'warning'}>
                {aiTest.success
                  ? `AI test ok via ${aiTest.ai?.provider ?? aiStatus?.activeProvider ?? 'provider'} (${aiTest.ai?.model ?? aiStatus?.activeModel ?? 'model'}).`
                  : `AI test failed: ${aiTest.error ?? 'unknown error'}`}
              </Notice>
            ) : null}

            <button
              type="button"
              onClick={() => void handleAiTest()}
              disabled={aiLoading}
              style={secondaryButtonStyle}
            >
              {aiLoading ? 'Testing...' : 'Test AI Analysis'}
            </button>
          </section>

          <section style={sectionStyle}>
            <SectionTitle icon={<Bot size={18} />} title="Agentic Research OS" />
            <div style={metricGridStyle}>
              <AiMetric label="Runtime" value={agentRuntimeStatus?.runtimeMode || 'unknown'} />
              <AiMetric label="Codex" value={agentRuntimeStatus?.codexAuthenticated ? 'connected' : (agentRuntimeStatus?.codexAvailable ? 'login needed' : 'missing')} />
              <AiMetric label="Claude" value={claudeStatus?.available ? 'available' : 'optional'} />
              <AiMetric label="Codex Model" value={agentRuntimeStatus?.defaultModel || 'default'} />
              <AiMetric label="API Fallback" value={agentRuntimeStatus?.apiProviderAvailable ? 'available' : 'not configured'} />
            </div>

            <div style={helperStyle}>
              Runtime matrix: Research OS prefers your local Codex login, then API providers, then deterministic mode.
              Claude is detected as a frontier terminal runtime when its CLI is installed. The app never reads Codex or Claude secrets.
            </div>

            {agentRuntimeError ? <Notice tone="danger">{agentRuntimeError}</Notice> : null}
            {codexLoginMessage ? <Notice tone={codexLoginMessage.includes('Unable') ? 'danger' : 'success'}>{codexLoginMessage}</Notice> : null}
            {!agentRuntimeStatus?.codexAuthenticated ? (
              <Notice tone="warning">
                Run Codex login once to activate the local agent runtime from your ChatGPT/Codex account.
              </Notice>
            ) : null}

            <div style={buttonRowStyle}>
              <button
                type="button"
                onClick={() => void handleLaunchCodexLogin()}
                style={secondaryButtonStyle}
              >
                Login with Codex
              </button>
              <button
                type="button"
                onClick={() => void refreshAgentRuntimeStatus()}
                style={secondaryButtonStyle}
              >
                Refresh Runtime Status
              </button>
            </div>
          </section>

          <section style={sectionStyle}>
            <SectionTitle icon={<KeyRound size={18} />} title="Gemini Live Voice" />
            <div style={metricGridStyle}>
              <AiMetric label="Voice Status" value={geminiStatus?.isConfigured ? 'configured' : 'missing'} />
              <AiMetric label="Live Model" value={geminiStatus?.model || 'gemini-3.1-flash-live-preview'} />
              <AiMetric label="Key" value={geminiStatus?.keyPreview || 'not saved'} />
            </div>

            <div style={helperStyle}>
              Guarda una Gemini API key para la voz del Workbench. La key queda en la configuración local de Electron;
              el renderer solo recibe tokens efímeros de Gemini Live.
            </div>

            <div style={{ height: '14px' }} />

            <SettingLabel label="Gemini API Key" />
            <input
              type="password"
              value={geminiKey}
              onChange={(event) => setGeminiKey(event.target.value)}
              placeholder="Paste a new Gemini API key"
              style={{ ...controlStyle, fontFamily: 'monospace' }}
            />

            {geminiError ? <Notice tone="danger">{geminiError}</Notice> : null}
            {geminiMessage ? <Notice tone="success">{geminiMessage}</Notice> : null}

            <button
              type="button"
              onClick={() => void handleSaveGeminiKey()}
              disabled={geminiSaving}
              style={secondaryButtonStyle}
            >
              {geminiSaving ? 'Saving...' : 'Save Gemini Live Key'}
            </button>
          </section>

          <section style={sectionStyle}>
            <SectionTitle icon={<PlugZap size={18} />} title="API Connection" />
            <SettingLabel label="Backend API URL" />
            <input
              type="text"
              value={settings.apiUrl}
              onChange={(event) => updateSettings({ ...settings, apiUrl: event.target.value })}
              placeholder="http://127.0.0.1:18001"
              style={{ ...controlStyle, fontFamily: 'monospace' }}
            />
            <div style={helperStyle}>Restart required to apply connection changes.</div>
          </section>

          <section style={sectionStyle}>
            <SectionTitle icon={<Bell size={18} />} title="Notifications" />
            <ToggleRow
              label="Enable desktop notifications"
              checked={settings.enableNotifications}
              onChange={(checked) => updateSettings({ ...settings, enableNotifications: checked })}
            />
            <ToggleRow
              label="Enable sound alerts"
              checked={settings.enableSounds}
              onChange={(checked) => updateSettings({ ...settings, enableSounds: checked })}
            />
          </section>
        </div>

        <footer style={footerStyle}>
          <button type="button" onClick={handleSave} style={primaryButtonStyle}>
            {saved ? <Check size={17} /> : <Save size={17} />}
            {saved ? 'Saved' : 'Save Settings'}
          </button>
          <button type="button" onClick={handleReset} style={resetButtonStyle}>
            <RotateCcw size={16} />
            Reset to Defaults
          </button>
        </footer>

        <div style={noteStyle}>
          <strong style={{ color: 'var(--app-text)' }}>Note:</strong> appearance updates are previewed immediately;
          terminal and API changes may need a new terminal or app restart.
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={sectionTitleStyle}>
      <span style={sectionIconStyle}>{icon}</span>
      <h2 style={sectionHeadingStyle}>{title}</h2>
    </div>
  );
}

function SettingLabel({ label }: { label: string }) {
  return <label style={labelStyle}>{label}</label>;
}

function AiMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: 'success' | 'warning' | 'danger' }) {
  const colors = {
    success: ['rgba(16,185,129,0.14)', 'rgba(52,211,153,0.34)', '#bbf7d0'],
    warning: ['rgba(245,158,11,0.14)', 'rgba(251,191,36,0.34)', '#fde68a'],
    danger: ['rgba(239,68,68,0.14)', 'rgba(248,113,113,0.34)', '#fecaca']
  }[tone];

  return (
    <div style={{ ...noticeStyle, background: colors[0], borderColor: colors[1], color: colors[2] }}>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={toggleRowStyle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={checkboxStyle}
      />
      <span>{label}</span>
    </label>
  );
}

const pageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  overflowY: 'auto',
  background: 'var(--app-bg)',
  padding: '34px'
};

const contentStyle: React.CSSProperties = {
  maxWidth: '1040px',
  margin: '0 auto'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '20px',
  marginBottom: '26px'
};

const eyebrowStyle: React.CSSProperties = {
  color: 'var(--app-accent)',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase'
};

const titleStyle: React.CSSProperties = {
  margin: '8px 0 8px',
  color: 'var(--app-text)',
  fontSize: '30px',
  fontWeight: 800,
  letterSpacing: 0
};

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--app-muted)',
  fontSize: '14px',
  lineHeight: 1.55,
  maxWidth: '680px'
};

const themeSummaryStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  padding: '10px',
  borderRadius: '8px',
  background: 'var(--app-surface)',
  border: '1px solid var(--app-border)'
};

const summarySwatchStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '7px',
  border: '1px solid rgba(255,255,255,0.16)'
};

const sectionStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '18px'
};

const sectionStyle: React.CSSProperties = {
  background: 'var(--app-surface)',
  border: '1px solid var(--app-border)',
  borderRadius: '8px',
  padding: '22px',
  boxShadow: '0 18px 42px rgba(0, 0, 0, 0.22)'
};

const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '18px'
};

const sectionIconStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  background: 'var(--app-accent-soft)',
  border: '1px solid var(--app-border-strong)',
  color: 'var(--app-accent)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const sectionHeadingStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--app-text)',
  fontSize: '17px',
  fontWeight: 800
};

const themeGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: '12px'
};

const themeCardStyle: React.CSSProperties = {
  minHeight: '138px',
  borderRadius: '8px',
  border: '1px solid var(--app-border)',
  color: 'var(--app-text)',
  cursor: 'pointer',
  padding: '14px',
  textAlign: 'left',
  transition: 'border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease'
};

const themePreviewStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '6px',
  marginBottom: '14px'
};

const themeSwatchStyle: React.CSSProperties = {
  height: '28px',
  borderRadius: '7px',
  border: '1px solid rgba(255,255,255,0.12)'
};

const themeNameRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px'
};

const themeNameStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 800
};

const themeDescriptionStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--app-muted)',
  fontSize: '12px',
  lineHeight: 1.45,
  marginTop: '7px'
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--app-text)',
  fontSize: '13px',
  fontWeight: 700,
  marginBottom: '8px'
};

const rangeStyle: React.CSSProperties = {
  width: '100%',
  accentColor: 'var(--app-accent)'
};

const rangeHintStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  color: 'var(--app-subtle)',
  fontSize: '12px',
  marginTop: '4px'
};

const helperStyle: React.CSSProperties = {
  marginTop: '8px',
  color: 'var(--app-muted)',
  fontSize: '12px',
  lineHeight: 1.55
};

const controlStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  background: 'var(--app-bg)',
  border: '1px solid var(--app-border)',
  borderRadius: '8px',
  color: 'var(--app-text)',
  fontSize: '14px',
  outline: 'none'
};

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '12px'
};

const metricStyle: React.CSSProperties = {
  background: 'var(--app-bg)',
  border: '1px solid var(--app-border)',
  borderRadius: '8px',
  padding: '12px'
};

const metricLabelStyle: React.CSSProperties = {
  color: 'var(--app-subtle)',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase'
};

const metricValueStyle: React.CSSProperties = {
  marginTop: '6px',
  color: 'var(--app-text)',
  fontSize: '14px',
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const noticeStyle: React.CSSProperties = {
  marginTop: '12px',
  border: '1px solid',
  borderRadius: '8px',
  padding: '10px',
  fontSize: '13px',
  lineHeight: 1.45
};

const secondaryButtonStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '10px 14px',
  background: 'var(--app-accent-soft)',
  border: '1px solid var(--app-border-strong)',
  borderRadius: '8px',
  color: 'var(--app-text)',
  fontSize: '14px',
  fontWeight: 800,
  cursor: 'pointer'
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px'
};

const toggleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  color: 'var(--app-text)',
  fontSize: '14px',
  cursor: 'pointer',
  marginBottom: '14px'
};

const checkboxStyle: React.CSSProperties = {
  width: '18px',
  height: '18px',
  accentColor: 'var(--app-accent)',
  cursor: 'pointer'
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  marginTop: '26px',
  paddingTop: '24px',
  borderTop: '1px solid var(--app-border)'
};

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 18px',
  background: 'linear-gradient(135deg, var(--app-accent), var(--app-accent-2))',
  border: 'none',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px'
};

const resetButtonStyle: React.CSSProperties = {
  padding: '12px 18px',
  background: 'var(--app-surface-raised)',
  border: '1px solid var(--app-border)',
  borderRadius: '8px',
  color: 'var(--app-text)',
  fontSize: '15px',
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px'
};

const noteStyle: React.CSSProperties = {
  marginTop: '18px',
  padding: '14px',
  background: 'var(--app-surface)',
  border: '1px solid var(--app-border)',
  borderRadius: '8px',
  color: 'var(--app-muted)',
  fontSize: '13px',
  lineHeight: 1.55
};
