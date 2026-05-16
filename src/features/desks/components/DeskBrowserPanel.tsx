import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { recordTelemetry } from '@/services/performanceTelemetry';
import type { DeskBrowserTab, Workspace } from '@/types/electron';
import { useDeskSpaceContext } from '../DeskSpaceContext';

interface DeskBrowserPanelProps {
  workspace: Workspace;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<void>;
  compact?: boolean;
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

function normalizeBrowserUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'about:blank';
  }

  if (trimmed === 'about:blank') {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    if (/^[^\s]+\.[^\s]+$/.test(trimmed)) {
      return `https://${trimmed}`;
    }

    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
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

export function DeskBrowserPanel({ workspace, updateWorkspace, compact = false }: DeskBrowserPanelProps) {
  const { getDeskState, setDeskState } = useDeskSpaceContext();
  const deskState = getDeskState(workspace.id);
  const tabs = workspace.browser_tabs.length > 0 ? workspace.browser_tabs : [fallbackTab(workspace)];
  const activeTab = tabs.find((tab) => tab.id === deskState.activeBrowserTabId) || tabs[0];
  const safeUrl = isSafeBrowserUrl(activeTab.url) ? activeTab.url : 'about:blank';
  const partition = `persist:desk-${sanitizePartition(workspace.id)}`;
  const webviewRef = useRef<any>(null);
  const [draftTitle, setDraftTitle] = useState(activeTab.title);
  const [draftUrl, setDraftUrl] = useState(activeTab.url);
  const [currentUrl, setCurrentUrl] = useState(safeUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!deskState.activeBrowserTabId || !tabs.some((tab) => tab.id === deskState.activeBrowserTabId)) {
      setDeskState(workspace.id, { activeBrowserTabId: tabs[0]?.id });
    }
  }, [deskState.activeBrowserTabId, setDeskState, tabs, workspace.id]);

  useEffect(() => {
    setDraftTitle(activeTab.title);
    setDraftUrl(safeUrl);
    setCurrentUrl(safeUrl);
    setNotice(null);
  }, [activeTab.id, activeTab.title, safeUrl]);

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

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    const updateNavigationState = () => {
      try {
        setCanGoBack(Boolean(webview.canGoBack?.()));
        setCanGoForward(Boolean(webview.canGoForward?.()));
      } catch {
        setCanGoBack(false);
        setCanGoForward(false);
      }
    };
    const commitLocation = (url?: string, title?: string) => {
      if (!url || !isSafeBrowserUrl(url)) {
        return;
      }

      setCurrentUrl(url);
      setDraftUrl(url);
      updateNavigationState();

      const nextTitle = title?.trim() || draftTitle.trim() || activeTab.title || url;
      if (activeTab.url === url && activeTab.title === nextTitle) {
        return;
      }

      void persistTabs(tabs.map((tab) => (
        tab.id === activeTab.id
          ? { ...tab, url, title: nextTitle }
          : tab
      )));
    };
    const handleStartLoading = () => {
      setIsLoading(true);
      updateNavigationState();
    };
    const handleStopLoading = () => {
      setIsLoading(false);
      updateNavigationState();
      try {
        commitLocation(webview.getURL?.(), webview.getTitle?.());
      } catch {
        updateNavigationState();
      }
    };
    const handleNavigate = (event: { url?: string }) => {
      commitLocation(event.url);
    };
    const handleTitle = (event: { title?: string }) => {
      const title = event.title?.trim();
      if (!title) {
        return;
      }
      setDraftTitle(title);
      try {
        commitLocation(webview.getURL?.() || currentUrl, title);
      } catch {
        commitLocation(currentUrl, title);
      }
    };
    const handleFail = (event: { errorCode?: number; errorDescription?: string }) => {
      setIsLoading(false);
      if (event.errorCode === -3) {
        return;
      }
      setNotice(event.errorDescription || 'Could not load this page.');
    };

    webview.addEventListener?.('did-start-loading', handleStartLoading);
    webview.addEventListener?.('did-stop-loading', handleStopLoading);
    webview.addEventListener?.('did-navigate', handleNavigate);
    webview.addEventListener?.('did-navigate-in-page', handleNavigate);
    webview.addEventListener?.('page-title-updated', handleTitle);
    webview.addEventListener?.('did-fail-load', handleFail);
    updateNavigationState();

    return () => {
      webview.removeEventListener?.('did-start-loading', handleStartLoading);
      webview.removeEventListener?.('did-stop-loading', handleStopLoading);
      webview.removeEventListener?.('did-navigate', handleNavigate);
      webview.removeEventListener?.('did-navigate-in-page', handleNavigate);
      webview.removeEventListener?.('page-title-updated', handleTitle);
      webview.removeEventListener?.('did-fail-load', handleFail);
    };
  }, [activeTab.id, activeTab.title, activeTab.url, currentUrl, draftTitle, tabs]);

  const persistTabs = async (nextTabs: DeskBrowserTab[]) => {
    await updateWorkspace(workspace.id, { browser_tabs: nextTabs });
  };

  const navigateToDraftUrl = async () => {
    const nextUrl = normalizeBrowserUrl(draftUrl);
    if (!nextUrl || !isSafeBrowserUrl(nextUrl)) {
      setNotice('Blocked URL. Use http, https, about:blank, or a search.');
      return;
    }

    setNotice(null);
    setCurrentUrl(nextUrl);
    setDraftUrl(nextUrl);
    await persistTabs(tabs.map((tab) => (
      tab.id === activeTab.id
        ? { ...tab, title: draftTitle.trim() || activeTab.title, url: nextUrl }
        : tab
    )));

    try {
      await webviewRef.current?.loadURL?.(nextUrl);
    } catch {
      setNotice('Could not navigate this webview.');
    }
  };

  const saveActiveTab = async () => {
    const title = draftTitle.trim() || activeTab.title;
    const url = normalizeBrowserUrl(draftUrl);
    if (!url || !isSafeBrowserUrl(url)) {
      setNotice('Blocked URL. Use http, https, about:blank, or a search.');
      return;
    }

    await persistTabs(tabs.map((tab) => (
      tab.id === activeTab.id
        ? { ...tab, title, url }
        : tab
    )));
    try {
      await webviewRef.current?.loadURL?.(url);
    } catch {
      // Persisting the tab is enough; Electron will also receive the src update.
    }
    setNotice('Tab saved.');
  };

  const addTab = async () => {
    const title = compact ? 'New Tab' : draftTitle.trim() || 'New Tab';
    const url = compact ? 'about:blank' : normalizeBrowserUrl(draftUrl);
    if (!url || !isSafeBrowserUrl(url)) {
      setNotice('Blocked URL. Use http, https, about:blank, or a search.');
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

  const goBack = () => {
    try {
      webviewRef.current?.goBack?.();
    } catch {
      setNotice('Could not go back.');
    }
  };

  const goForward = () => {
    try {
      webviewRef.current?.goForward?.();
    } catch {
      setNotice('Could not go forward.');
    }
  };

  const externalUrl = useMemo(() => (
    currentUrl === 'about:blank' ? null : currentUrl
  ), [currentUrl]);

  const renderTabs = () => (
    <div style={{ ...tabListStyle, ...(compact ? compactTabListStyle : {}) }}>
      {tabs.map((tab) => {
        const selected = tab.id === activeTab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setDeskState(workspace.id, { activeBrowserTabId: tab.id })}
            style={{
              ...tabButtonStyle,
              background: selected ? 'var(--app-accent-soft)' : 'var(--app-panel-muted)',
              borderColor: selected ? 'var(--app-border-strong)' : 'var(--app-border)',
              color: selected ? 'var(--app-accent)' : 'var(--app-muted)',
              maxWidth: compact ? '122px' : tabButtonStyle.maxWidth
            }}
          >
            {tab.title}
          </button>
        );
      })}
    </div>
  );

  return (
    <section style={{ ...panelStyle, ...(compact ? compactPanelStyle : {}) }}>
      {compact ? (
        <>
          <form
            style={compactAddressBarStyle}
            onSubmit={(event) => {
              event.preventDefault();
              void navigateToDraftUrl();
            }}
          >
            <button type="button" onClick={goBack} disabled={!canGoBack} title="Back" aria-label="Back" style={{ ...iconButtonStyle, opacity: canGoBack ? 1 : 0.42 }}>
              <ArrowLeft size={14} />
            </button>
            <button type="button" onClick={goForward} disabled={!canGoForward} title="Forward" aria-label="Forward" style={{ ...iconButtonStyle, opacity: canGoForward ? 1 : 0.42 }}>
              <ArrowRight size={14} />
            </button>
            <button type="button" onClick={reload} title="Reload" aria-label="Reload" style={iconButtonStyle}>
              <RefreshCw size={14} />
            </button>
            <input
              value={draftUrl}
              onChange={(event) => setDraftUrl(event.target.value)}
              placeholder="Search or enter URL"
              style={{ ...inputStyle, ...addressInputStyle }}
            />
            {externalUrl ? (
              <a href={externalUrl} title="Open URL" aria-label="Open URL" style={iconButtonStyle}>
                <ExternalLink size={14} />
              </a>
            ) : null}
          </form>

          <div style={compactTabsRowStyle}>
            {renderTabs()}
            <div style={actionRowStyle}>
              <button type="button" onClick={() => void addTab()} title="New tab" aria-label="New tab" style={iconButtonStyle}>
                <Plus size={14} />
              </button>
              <button type="button" onClick={() => void removeActiveTab()} title="Close tab" aria-label="Close tab" style={dangerIconButtonStyle}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={toolbarStyle}>
            {renderTabs()}

            <div style={actionRowStyle}>
              <button type="button" onClick={goBack} disabled={!canGoBack} title="Back" aria-label="Back" style={{ ...iconButtonStyle, opacity: canGoBack ? 1 : 0.42 }}>
                <ArrowLeft size={14} />
              </button>
              <button type="button" onClick={goForward} disabled={!canGoForward} title="Forward" aria-label="Forward" style={{ ...iconButtonStyle, opacity: canGoForward ? 1 : 0.42 }}>
                <ArrowRight size={14} />
              </button>
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
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void navigateToDraftUrl();
                }
              }}
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
        </>
      )}

      {notice ? <div style={noticeStyle}>{notice}</div> : null}
      {isLoading ? (
        <div style={loadingStripStyle}>
          <span style={loadingDotStyle} />
        </div>
      ) : null}

      <div style={{ ...webviewHostStyle, ...(compact ? compactWebviewHostStyle : {}) }}>
        <webview
          ref={(node) => {
            webviewRef.current = node;
          }}
          key={`${workspace.id}:${activeTab.id}`}
          src={safeUrl}
          partition={partition}
          allowpopups={false}
          style={{ width: '100%', height: '100%', background: 'var(--app-bg)' }}
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
  border: '1px solid var(--app-border)',
  borderRadius: '8px',
  background: 'var(--app-panel)',
  overflow: 'hidden'
};

const compactPanelStyle: React.CSSProperties = {
  minHeight: 0,
  borderRadius: '8px'
};

const toolbarStyle: React.CSSProperties = {
  minHeight: '48px',
  padding: '8px',
  borderBottom: '1px solid var(--app-border)',
  display: 'flex',
  gap: '8px',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const compactAddressBarStyle: React.CSSProperties = {
  minHeight: '44px',
  padding: '7px',
  borderBottom: '1px solid var(--app-border)',
  display: 'grid',
  gridTemplateColumns: '30px 30px 30px minmax(0, 1fr) 30px',
  gap: '6px',
  alignItems: 'center'
};

const tabListStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  gap: '6px',
  overflowX: 'auto'
};

const compactTabListStyle: React.CSSProperties = {
  flex: '1 1 auto'
};

const compactTabsRowStyle: React.CSSProperties = {
  minHeight: '42px',
  padding: '6px 7px',
  borderBottom: '1px solid var(--app-border)',
  display: 'flex',
  gap: '6px',
  alignItems: 'center',
  justifyContent: 'space-between'
};

const tabButtonStyle: React.CSSProperties = {
  height: '30px',
  maxWidth: '180px',
  borderRadius: '6px',
  border: '1px solid var(--app-border)',
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
  borderBottom: '1px solid var(--app-border)',
  display: 'grid',
  gridTemplateColumns: 'minmax(120px, 0.4fr) minmax(180px, 1fr) 32px 32px 32px',
  gap: '6px'
};

const inputStyle: React.CSSProperties = {
  minWidth: 0,
  height: '32px',
  borderRadius: '6px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-surface)',
  color: 'var(--app-text)',
  padding: '0 9px',
  fontSize: '12px',
  outline: 'none'
};

const addressInputStyle: React.CSSProperties = {
  height: '30px',
  borderRadius: '7px',
  fontFamily: "'JetBrains Mono', monospace"
};

const iconButtonStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '6px',
  border: '1px solid var(--app-border)',
  background: 'var(--app-panel-muted)',
  color: 'var(--app-muted)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none'
};

const dangerIconButtonStyle: React.CSSProperties = {
  ...iconButtonStyle,
  color: 'var(--app-negative)',
  border: '1px solid var(--app-negative)'
};

const noticeStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderBottom: '1px solid var(--app-border)',
  color: 'var(--app-muted)',
  fontSize: '11px'
};

const loadingStripStyle: React.CSSProperties = {
  height: '2px',
  background: 'var(--app-panel-muted)',
  overflow: 'hidden'
};

const loadingDotStyle: React.CSSProperties = {
  display: 'block',
  width: '34%',
  height: '100%',
  background: 'var(--app-accent)',
  boxShadow: '0 0 12px var(--app-glow)'
};

const webviewHostStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  background: 'var(--app-bg)'
};

const compactWebviewHostStyle: React.CSSProperties = {
  minHeight: '260px'
};
