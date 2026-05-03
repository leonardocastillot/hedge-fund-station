import React, { useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import {
  Bot,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { WidgetPanel } from '@/features/cockpit/WidgetPanel';
import { MissionChatWorkbench } from '@/features/agents/components/MissionChatWorkbench';

export const ElectronLayout: React.FC = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isVoicePanelCollapsed, setIsVoicePanelCollapsed] = useState(false);
  const centerDefaultSize = !isSidebarCollapsed && !isVoicePanelCollapsed
    ? 52
    : !isSidebarCollapsed
      ? 78
      : !isVoicePanelCollapsed
        ? 66
        : 92;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <PanelGroup key={`${isSidebarCollapsed}-${isVoicePanelCollapsed}`} direction="horizontal">
          {isSidebarCollapsed ? (
            <Panel
              defaultSize={4}
              minSize={4}
              maxSize={4}
              id="sidebar-rail"
              order={1}
            >
              <CollapsedRail
                side="left"
                title="Open workspace panel"
                icon={<Monitor size={17} />}
                actionIcon={<PanelLeftOpen size={15} />}
                onExpand={() => setIsSidebarCollapsed(false)}
              />
            </Panel>
          ) : (
            <>
              <Panel
                defaultSize={18}
                minSize={14}
                maxSize={26}
                id="sidebar"
                order={1}
              >
                <Sidebar />
              </Panel>

              <ResizeHandle
                title="Collapse workspace panel"
                onCollapse={() => setIsSidebarCollapsed(true)}
                icon={<PanelLeftClose size={14} />}
              />
            </>
          )}

          <Panel
            defaultSize={centerDefaultSize}
            minSize={!isSidebarCollapsed || !isVoicePanelCollapsed ? 42 : 70}
            id="center-panel"
            order={2}
          >
            <WidgetPanel />
          </Panel>

          {isVoicePanelCollapsed ? (
            <Panel
              defaultSize={4}
              minSize={4}
              maxSize={4}
              id="voice-rail"
              order={3}
            >
              <CollapsedRail
                side="right"
                title="Open voice mission source"
                icon={<Bot size={17} />}
                actionIcon={<PanelRightOpen size={15} />}
                onExpand={() => setIsVoicePanelCollapsed(false)}
              />
            </Panel>
          ) : (
            <>
              <ResizeHandle
                title="Collapse voice mission source"
                onCollapse={() => setIsVoicePanelCollapsed(true)}
                icon={<PanelRightClose size={14} />}
              />

              <Panel
                defaultSize={30}
                minSize={22}
                id="voice-mission-source"
                order={3}
              >
                <MissionChatWorkbench variant="dock" />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  );
};

type ResizeHandleProps = {
  title: string;
  icon: React.ReactNode;
  onCollapse: () => void;
};

const ResizeHandle: React.FC<ResizeHandleProps> = ({ title, icon, onCollapse }) => (
  <PanelResizeHandle
    style={resizeHandleStyle}
    onMouseEnter={(e) => {
      const handle = e.currentTarget as unknown as HTMLElement;
      handle.style.background = 'var(--app-focus)';
      handle.style.boxShadow = '0 0 20px var(--app-glow)';
    }}
    onMouseLeave={(e) => {
      const handle = e.currentTarget as unknown as HTMLElement;
      handle.style.background = resizeHandleStyle.background as string;
      handle.style.boxShadow = 'none';
    }}
  >
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCollapse();
      }}
      style={handleButtonStyle}
    >
      {icon}
    </button>
  </PanelResizeHandle>
);

type CollapsedRailProps = {
  side: 'left' | 'right';
  title: string;
  icon: React.ReactNode;
  actionIcon: React.ReactNode;
  onExpand: () => void;
};

const CollapsedRail: React.FC<CollapsedRailProps> = ({ side, title, icon, actionIcon, onExpand }) => (
  <div
    style={{
      ...collapsedRailStyle,
      borderLeft: side === 'right' ? '1px solid var(--app-border)' : undefined,
      borderRight: side === 'left' ? '1px solid var(--app-border)' : undefined
    }}
  >
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onExpand}
      style={railButtonStyle}
    >
      <span style={railPrimaryIconStyle}>{icon}</span>
      <span style={railActionIconStyle}>{actionIcon}</span>
    </button>
  </div>
);

const resizeHandleStyle: React.CSSProperties = {
  width: '8px',
  background: 'rgba(255, 255, 255, 0.015)',
  cursor: 'col-resize',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  position: 'relative',
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderLeft: '1px solid rgba(255, 255, 255, 0.03)',
  borderRight: '1px solid rgba(255, 255, 255, 0.03)'
};

const handleButtonStyle: React.CSSProperties = {
  width: '22px',
  height: '32px',
  borderRadius: '6px',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  background: 'rgba(6, 10, 20, 0.6)',
  backdropFilter: 'blur(12px)',
  color: 'var(--app-accent)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  transition: 'all 0.2s ease'
};

const collapsedRailStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'rgba(6, 10, 20, 0.35)',
  backdropFilter: 'blur(24px) saturate(1.2)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '14px',
  boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.2)'
};

const railButtonStyle: React.CSSProperties = {
  width: '32px',
  height: '44px',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  background: 'rgba(255, 255, 255, 0.02)',
  color: 'var(--app-accent)',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '3px',
  padding: 0,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
  transition: 'all 0.2s ease'
};

const railPrimaryIconStyle: React.CSSProperties = {
  display: 'flex',
  color: 'var(--app-muted)'
};

const railActionIconStyle: React.CSSProperties = {
  display: 'flex',
  color: 'var(--app-accent)',
  opacity: 0.7
};
