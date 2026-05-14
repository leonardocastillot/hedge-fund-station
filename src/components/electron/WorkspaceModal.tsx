import React, { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { DeskBrowserTab, Workspace, WorkspaceKind } from '../../types/electron';
import { formatLaunchProfiles, parseLaunchProfiles } from '../../utils/workspaceLaunchProfiles';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (workspace: Workspace) => Promise<void>;
  existingWorkspace?: Workspace | null;
}

const ICONS = [
  { value: 'briefcase', label: 'Briefcase', code: 'BK' },
  { value: 'code', label: 'Code', code: '</>' },
  { value: 'folder', label: 'Folder', code: 'DIR' },
  { value: 'rocket', label: 'Rocket', code: 'RUN' },
  { value: 'chart', label: 'Chart', code: 'MKT' },
  { value: 'database', label: 'Database', code: 'DB' },
  { value: 'server', label: 'Server', code: 'SRV' },
  { value: 'cloud', label: 'Cloud', code: 'CLD' }
];

const COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#a855f7',
  '#ec4899'
];

const WORKSPACE_KIND_OPTIONS: Array<{ value: WorkspaceKind; label: string; description: string }> = [
  { value: 'command-hub', label: 'Command Hub', description: 'Global terminal and AI runtime desk.' },
  { value: 'hedge-fund', label: 'Hedge Fund', description: 'Research, validation, paper review, and backend commands.' },
  { value: 'project', label: 'Project', description: 'Normal code, notes, agents, and terminal work.' },
  { value: 'ops', label: 'Ops', description: 'Services, tunnels, diagnostics, and runtime health.' }
];

function defaultDescription(kind: WorkspaceKind): string {
  return WORKSPACE_KIND_OPTIONS.find((item) => item.value === kind)?.description || '';
}

function defaultRouteForKind(kind: WorkspaceKind): string {
  void kind;
  return '/workbench';
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tab';
}

function isSafeBrowserUrl(url: string): boolean {
  if (url === 'about:blank') {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatBrowserTabs(tabs: DeskBrowserTab[]): string {
  return tabs.map((tab) => `${tab.title} | ${tab.url}`).join('\n');
}

function parseBrowserTabs(value: string): DeskBrowserTab[] {
  return value
    .split('\n')
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return null;
      }

      const [titlePart, ...urlParts] = trimmed.split('|');
      const url = (urlParts.join('|') || titlePart).trim();
      if (!isSafeBrowserUrl(url)) {
        return null;
      }

      const title = urlParts.length > 0 && titlePart.trim()
        ? titlePart.trim()
        : `Tab ${index + 1}`;

      return {
        id: `${slugify(title)}-${index + 1}`,
        title,
        url
      };
    })
    .filter((tab): tab is DeskBrowserTab => tab !== null);
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  existingWorkspace
}) => {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [kind, setKind] = useState<WorkspaceKind>('project');
  const [description, setDescription] = useState('');
  const [pinned, setPinned] = useState(false);
  const [defaultRoutePath, setDefaultRoutePath] = useState('/workbench');
  const [icon, setIcon] = useState('briefcase');
  const [color, setColor] = useState('#ef4444');
  const [shell, setShell] = useState('/bin/zsh');
  const [obsidianVaultPath, setObsidianVaultPath] = useState('');
  const [defaultCommands, setDefaultCommands] = useState('');
  const [launchProfiles, setLaunchProfiles] = useState('');
  const [browserTabs, setBrowserTabs] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (existingWorkspace) {
      setName(existingWorkspace.name);
      setPath(existingWorkspace.path);
      setKind(existingWorkspace.kind || 'project');
      setDescription(existingWorkspace.description || defaultDescription(existingWorkspace.kind || 'project'));
      setPinned(Boolean(existingWorkspace.pinned));
      setDefaultRoutePath(existingWorkspace.default_route || defaultRouteForKind(existingWorkspace.kind || 'project'));
      setIcon(existingWorkspace.icon);
      setColor(existingWorkspace.color);
      setShell(existingWorkspace.shell);
      setObsidianVaultPath(existingWorkspace.obsidian_vault_path || '');
      setDefaultCommands(existingWorkspace.default_commands.join('\n'));
      setLaunchProfiles(formatLaunchProfiles(existingWorkspace.launch_profiles || []));
      setBrowserTabs(formatBrowserTabs(existingWorkspace.browser_tabs || []));
    } else {
      setName('');
      setPath('');
      setKind('project');
      setDescription(defaultDescription('project'));
      setPinned(false);
      setDefaultRoutePath(defaultRouteForKind('project'));
      setIcon('briefcase');
      setColor('#ef4444');
      setShell('/bin/zsh');
      setObsidianVaultPath('');
      setDefaultCommands('');
      setLaunchProfiles('');
      setBrowserTabs('');
    }
    setIsAdvancedOpen(false);
    setError('');
  }, [existingWorkspace, isOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Desk name is required.');
      return;
    }

    if (!path.trim()) {
      setError('Desk path is required.');
      return;
    }

    setIsLoading(true);

    try {
      const workspace: Workspace = {
        id: existingWorkspace?.id || `workspace-${uuidv4()}`,
        name: name.trim(),
        path: path.trim(),
        kind,
        description: description.trim() || defaultDescription(kind),
        pinned,
        default_route: defaultRoutePath.trim() || defaultRouteForKind(kind),
        icon,
        color,
        shell,
        obsidian_vault_path: obsidianVaultPath.trim() || undefined,
        default_commands: defaultCommands
          .split('\n')
          .map((command) => command.trim())
          .filter(Boolean),
        launch_profiles: parseLaunchProfiles(launchProfiles),
        browser_tabs: parseBrowserTabs(browserTabs)
      };

      await onSave(workspace);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save desk.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBrowsePath = async () => {
    try {
      const selectedPath = await window.electronAPI.workspace.pickDirectory();
      if (selectedPath) {
        setPath(selectedPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open directory picker.');
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 23, 0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '24px'
      }}
    >
      <div
        style={{
          width: 'min(760px, 100%)',
          maxHeight: '88vh',
          overflow: 'auto',
          borderRadius: '20px',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          background: 'linear-gradient(180deg, rgba(10, 14, 24, 0.98) 0%, rgba(5, 7, 11, 0.98) 100%)',
          boxShadow: '0 30px 120px rgba(0, 0, 0, 0.45)'
        }}
      >
        <div
          style={{
            padding: '18px 20px 16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px'
          }}
        >
          <div>
            <div
              style={{
                fontSize: '11px',
                color: '#ef4444',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.14em'
              }}
            >
              Desk Config
            </div>
            <h2 style={{ margin: '8px 0 4px 0', color: '#f9fafb', fontSize: '22px', fontWeight: 800 }}>
              {existingWorkspace ? 'Edit Desk' : 'Create Desk'}
            </h2>
            <p style={{ margin: 0, color: '#9ca3af', fontSize: '12px', lineHeight: 1.55, maxWidth: '560px' }}>
              Edit the desk essentials. Commands, colors and launch profiles are tucked away under Advanced.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 700
            }}
          >
            X
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              padding: '16px 20px',
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '14px'
            }}
          >
            <SectionCard title="Basics" subtitle="Name, kind, path and shell.">
                <Field label="Desk Name *">
                  <Input value={name} onChange={setName} placeholder="Command Hub" />
                </Field>

                <Field label="Desk Type">
                  <select
                    value={kind}
                    onChange={(event) => {
                      const nextKind = event.target.value as WorkspaceKind;
                      setKind(nextKind);
                      setDescription((current) => (
                        !current.trim() || WORKSPACE_KIND_OPTIONS.some((option) => option.description === current.trim())
                          ? defaultDescription(nextKind)
                          : current
                      ));
                      setDefaultRoutePath((current) => (
                        !current.trim() || ['/station/hedge-fund', '/terminals', '/diagnostics', '/workbench'].includes(current.trim())
                          ? defaultRouteForKind(nextKind)
                          : current
                      ));
                    }}
                    style={selectStyle}
                  >
                    {WORKSPACE_KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Description">
                  <Input value={description} onChange={setDescription} placeholder={defaultDescription(kind)} />
                </Field>

                <Field label="Project Path *">
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <Input value={path} onChange={setPath} placeholder="/Users/optimus/Documents/project" mono />
                    <ActionButton type="button" onClick={handleBrowsePath}>
                      Browse
                    </ActionButton>
                  </div>
                </Field>

                <Field label="Default Shell">
                  <Input value={shell} onChange={setShell} placeholder="/bin/zsh" mono />
                </Field>

                <Field label="Default Route">
                  <Input value={defaultRoutePath} onChange={setDefaultRoutePath} placeholder={defaultRouteForKind(kind)} mono />
                </Field>

                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(event) => setPinned(event.target.checked)}
                  />
                  <span>Pin this desk near the top of the sidebar</span>
                </label>

                <Field label="Obsidian Vault Path">
                  <Input
                    value={obsidianVaultPath}
                    onChange={setObsidianVaultPath}
                    placeholder="Optional. Leave empty to auto-detect in workspace path"
                    mono
                  />
                </Field>
              </SectionCard>

            <button
              type="button"
              onClick={() => setIsAdvancedOpen((current) => !current)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(255, 255, 255, 0.03)',
                color: '#e5e7eb',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>Advanced</span>
              <span style={{ color: '#9ca3af', fontSize: '12px' }}>{isAdvancedOpen ? 'Hide' : 'Show'}</span>
            </button>

            {isAdvancedOpen && (
              <>
              <SectionCard title="Appearance" subtitle="Compact identity for the sidebar.">
                <Field label="Icon">
                  <div style={iconGridStyle}>
                    {ICONS.map((iconOption) => {
                      const selected = icon === iconOption.value;
                      return (
                        <button
                          key={iconOption.value}
                          type="button"
                          onClick={() => setIcon(iconOption.value)}
                          style={{
                            ...iconButtonStyle,
                            border: selected ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                            background: selected ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.03)'
                          }}
                        >
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#f9fafb' }}>{iconOption.code}</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>{iconOption.label}</div>
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Accent Color">
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {COLORS.map((colorOption) => (
                      <button
                        key={colorOption}
                        type="button"
                        onClick={() => setColor(colorOption)}
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '12px',
                          border: color === colorOption ? '2px solid #fff' : '1px solid rgba(255, 255, 255, 0.08)',
                          outline: color === colorOption ? `2px solid ${colorOption}` : 'none',
                          outlineOffset: '2px',
                          background: colorOption,
                          cursor: 'pointer'
                        }}
                      />
                    ))}
                  </div>
                </Field>
              </SectionCard>

              <SectionCard title="Saved Commands" subtitle="One command per line for quick launch.">
                <textarea
                  value={defaultCommands}
                  onChange={(event) => setDefaultCommands(event.target.value)}
                  placeholder={'claude\ngit status\nnpm run dev'}
                  rows={5}
                  style={textareaStyle}
                />
              </SectionCard>

              <SectionCard
                title="Launch Profiles"
                subtitle="Optional desk launch presets. Use one line per desk."
              >
                <textarea
                  value={launchProfiles}
                  onChange={(event) => setLaunchProfiles(event.target.value)}
                  placeholder={
                    'AI Dev Desk | 0>agent-runtime ::: 300>git status ::: 700>npm run dev\n' +
                    'AI Trading Desk | 0>agent-runtime ::: 300>docker compose ps ::: 700>git status'
                  }
                  rows={7}
                  style={textareaStyle}
                />
              </SectionCard>

              <SectionCard
                title="Browser Tabs"
                subtitle="One tab per line: Title | URL. Only http, https and about:blank are allowed."
              >
                <textarea
                  value={browserTabs}
                  onChange={(event) => setBrowserTabs(event.target.value)}
                  placeholder={
                    'Local App | http://localhost:3000\n' +
                    'Gateway Health | http://127.0.0.1:18001/health\n' +
                    'TradingView BTC | https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT'
                  }
                  rows={5}
                  style={textareaStyle}
                />
              </SectionCard>
              </>
            )}
          </div>

          {error && (
            <div
              style={{
                margin: '0 20px 14px 20px',
                padding: '12px 14px',
                borderRadius: '14px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#fecaca',
                fontSize: '13px'
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              padding: '14px 20px 18px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '16px',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ color: '#6b7280', fontSize: '11px' }}>
              Desks are stored locally and do not modify folders on disk.
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <ActionButton type="button" onClick={onClose} subtle disabled={isLoading}>
                Cancel
              </ActionButton>
              <ActionButton type="submit" primary disabled={isLoading}>
                {isLoading ? 'Saving...' : existingWorkspace ? 'Save Changes' : 'Create Desk'}
              </ActionButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

function SectionCard({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: '14px',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        background: 'rgba(255, 255, 255, 0.025)'
      }}
    >
      <div style={{ color: '#f9fafb', fontSize: '16px', fontWeight: 700 }}>{title}</div>
      <div style={{ color: '#9ca3af', fontSize: '11px', marginTop: '4px', lineHeight: 1.45 }}>{subtitle}</div>
      <div style={{ display: 'grid', gap: '12px', marginTop: '14px' }}>{children}</div>
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'grid', gap: '8px' }}>
      <span style={{ color: '#e5e7eb', fontSize: '13px', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  mono = false
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      style={{
        ...inputStyle,
        fontFamily: mono ? 'Consolas, monospace' : 'inherit'
      }}
    />
  );
}

function ActionButton({
  children,
  primary = false,
  subtle = false,
  disabled = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean;
  subtle?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        padding: '11px 16px',
        borderRadius: '12px',
        border: primary
          ? '1px solid rgba(239, 68, 68, 0.3)'
          : '1px solid rgba(255, 255, 255, 0.08)',
        background: primary
          ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
          : subtle
            ? 'rgba(255, 255, 255, 0.03)'
            : 'rgba(255, 255, 255, 0.05)',
        color: primary ? '#fff' : '#e5e7eb',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontSize: '13px',
        fontWeight: 700,
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: '#0b0f19',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '12px',
  color: '#f9fafb',
  fontSize: '12px',
  outline: 'none'
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  cursor: 'pointer'
};

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  color: '#e5e7eb',
  fontSize: '12px',
  fontWeight: 600
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: '#0b0f19',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '12px',
  color: '#f9fafb',
  fontSize: '12px',
  fontFamily: 'Consolas, monospace',
  outline: 'none',
  resize: 'vertical',
  lineHeight: 1.55
};

const iconGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '8px'
};

const iconButtonStyle: React.CSSProperties = {
  padding: '10px 8px',
  borderRadius: '12px',
  cursor: 'pointer',
  textAlign: 'center'
};
