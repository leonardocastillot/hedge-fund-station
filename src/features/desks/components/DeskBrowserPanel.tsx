import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { recordTelemetry } from '@/services/performanceTelemetry';
import type { DeskBrowserTab, Workspace } from '@/types/electron';
import { useDeskSpaceContext } from '../DeskSpaceContext';

interface DeskBrowserPanelProps {
  workspace: Workspace;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<void>;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tab';
}

function sanitizePartition(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'desk';
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

function fallbackTab(workspace: Workspace): DeskBrowserTab {
  return {
    id: `${workspace.id}-blank`,
    title: 'Blank',
    url: 'about:blank'
  };
}

function cleanupWebview(webview: any) {
  try {
    webview.stop?.();
  } catch {
    // Best effort for Electron webview cleanup.
  }

  try {
    webview.loadURL?.('about:blank');
  } catch {
    try {
      webview.src = 'about:blank';
    } catch {
      // Best effort for Electron webview cleanup.
    }
  }
}

export function DeskBrowserPanel({ workspace, updateWorkspace }: DeskBrowserPanelProps) {
  const { getDeskState, setDeskState } = useDeskSpaceContext();
  const deskState = getDeskState(workspace.id);
  const tabs = workspace.browser_tabs.length > 0 ? workspace.browser_tabs : [fallbackTab(workspace)];
  const activeTab = tabs.find((tab) => tab.id === deskState.activeBrowserTabId) || tabs[0];
  const safeUrl = isSafeBrowserUrl(activeTab.url) ? activeTab.url : 'about:blank';
  const partition = `persist:desk-${sanitizePartition(workspace.id)}`;
  const webviewRef = useRef<any>(null);
  const [draftTitle, setDraftTitle] = useState(activeTab.title);
  const [draftUrl, setDraftUrl] = useState(activeTab.url);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!deskState.activeBrowserTabId || !tabs.some((tab) => tab.id === deskState.activeBrowserTabId)) {
      setDeskState(workspace.id, { activeBrowserTabId: tabs[0]?.id });
    }
  }, [deskState.activeBrowserTabId, setDeskState, tabs, workspace.id]);

  useEffect(() => {
    setDraftTitle(activeTab.title);
    setDraftUrl(activeTab.url);
    setNotice(null);
  }, [activeTab.id, activeTab.title, activeTab.url]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    recordTelemetry({ type: 'webview', label: `desk:${workspace.id}`, status: 'mounted', detail: safeUrl });
    return () => {
      cleanupWebview(webview);
      recordTelemetry({ type: 'webview', label: `desk:${workspace.id}`, status: 'unmounted', detail: safeUrl });
    };
  }, [safeUrl, workspace.id]);

  const persistTabs = async (nextTabs: DeskBrowserTab[]) => {
    await updateWorkspace(workspace.id, { browser_tabs: nextTabs });
  };

  const saveActiveTab = async () => {
    const title = draftTitle.trim() || activeTab.title;
    const url = draftUrl.trim();
    if (!isSafeBrowserUrl(url)) {
      setNotice('Blocked URL. Use http, https, or about:blank.');
      return;
    }

    await persistTabs(tabs.map((tab) => (
      tab.id === activeTab.id
        ? { ...tab, title, url }
        : tab
    )));
    setNotice('Tab saved.');
  };

  const addTab = async () => {
    const title = draftTitle.trim() || 'New Tab';
    const url = draftUrl.trim() || 'about:blank';
    if (!isSafeBrowserUrl(url)) {
      setNotice('Blocked URL. Use http, https, or about:blank.');
      return;
    }

    const nextTab = {
      id: `${slugify(title)}-${Date.now()}`,
      title,
      url
    };
    await persistTabs([...tabs, nextTab]);
    setDeskState(workspace.id, { activeBrowserTabId: nextTab.id });
    setNotice('Tab added.');
  };

  const removeActiveTab = async () => {
    const nextTabs = tabs.filter((tab) => tab.id !== activeTab.id);
    const safeTabs = nextTabs.length > 0 ? nextTabs : [fallbackTab(workspace)];
    await persistTabs(safeTabs);
    setDeskState(workspace.id, { activeBrowserTabId: safeTabs[0].id });
    setNotice('Tab removed.');
  };

  const reload = () => {
    try {
      webviewRef.current?.reload?.();
    } catch {
      setNotice('Could not reload this webview.');
    }
  };

  const externalUrl = useMemo(() => (
    safeUrl === 'about:blank' ? null : safeUrl
  ), [safeUrl]);

  return (
    <section style={panelStyle}>
      <div style={toolbarStyle}>
        <div style={tabListStyle}>
          {tabs.map((tab) => {
            const selected = tab.id === activeTab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDeskState(workspace.id, { activeBrowserTabId: tab.id })}
                style={{
                  ...tabButtonStyle,
                  background: selected ? 'rgba(56, 189, 248, 0.14)' : 'rgba(15, 23, 42, 0.56)',
                  borderColor: selected ? 'rgba(56, 189, 248, 0.32)' : 'rgba(148, 163, 184, 0.12)',
                  color: selected ? '#bae6fd' : '#cbd5e1'
                }}
              >
                {tab.title}
              </button>
            );
          })}
        </div>

        <div style={actionRowStyle}>
          <button type="button" onClick={reload} title="Reload" aria-label="Reload" style={iconButtonStyle}>
            <RefreshCw size={14} />
          </button>
          {externalUrl ? (
            <a href={externalUrl} title="Open URL" aria-label="Open URL" style={iconButtonStyle}>
              <ExternalLink size={14} />
            </a>
          ) : null}
        </div>
      </div>

      <div style={editorStyle}>
        <input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          placeholder="Tab title"
          style={inputStyle}
        />
        <input
          value={draftUrl}
          onChange={(event) => setDraftUrl(event.target.value)}
          placeholder="https://..."
          style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
        />
        <button type="button" onClick={() => void saveActiveTab()} title="Save tab" aria-label="Save tab" style={iconButtonStyle}>
          <Save size={14} />
        </button>
        <button type="button" onClick={() => void addTab()} title="Add tab" aria-label="Add tab" style={iconButtonStyle}>
          <Plus size={14} />
        </button>
        <button type="button" onClick={() => void removeActiveTab()} title="Remove tab" aria-label="Remove tab" style={dangerIconButtonStyle}>
          <Trash2 size={14} />
        </button>
      </div>

      {notice ? <div style={noticeStyle}>{notice}</div> : null}

      <div style={webviewHostStyle}>
        <webview
          ref={(node) => {
            webviewRef.current = node;
          }}
          key={`${workspace.id}:${activeTab.id}:${safeUrl}`}
          src={safeUrl}
          partition={partition}
          allowpopups={false}
          style={{ width: '100%', height: '100%', background: '#020617' }}
        />
      </div>
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  height: '100%',
  minHeight: '520px',
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  borderRadius: '8px',
  background: 'rgba(2, 6, 23, 0.72)',
  overflow: 'hidden'
};

const toolbarStyle: React.CSSProperties = {
  minHeight: '48px',
  padding: '8px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  display: 'flex',
  gap: '8px',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const tabListStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  gap: '6px',
  overflowX: 'auto'
};

const tabButtonStyle: React.CSSProperties = {
  height: '30px',
  maxWidth: '180px',
  borderRadius: '6px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  padding: '0 10px',
  fontSize: '11px',
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flex: '0 0 auto'
};

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  flex: '0 0 auto'
};

const editorStyle: React.CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  display: 'grid',
  gridTemplateColumns: 'minmax(120px, 0.4fr) minmax(180px, 1fr) 32px 32px 32px',
  gap: '6px'
};

const inputStyle: React.CSSProperties = {
  minWidth: 0,
  height: '32px',
  borderRadius: '6px',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'rgba(15, 23, 42, 0.82)',
  color: '#e2e8f0',
  padding: '0 9px',
  fontSize: '12px',
  outline: 'none'
};

const iconButtonStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '6px',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'rgba(15, 23, 42, 0.82)',
  color: '#cbd5e1',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none'
};

const dangerIconButtonStyle: React.CSSProperties = {
  ...iconButtonStyle,
  color: '#fca5a5',
  border: '1px solid rgba(248, 113, 113, 0.22)'
};

const noticeStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  color: '#94a3b8',
  fontSize: '11px'
};

const webviewHostStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  background: '#020617'
};
