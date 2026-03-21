import React from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Sidebar } from './Sidebar';
import { TerminalGrid } from './TerminalGrid';
import { WidgetPanel } from '../widgets/WidgetPanel';
import { DevPanel } from '../panels/DevPanel';
import { AgentsPanel } from '../panels/AgentsPanel';
import { ServicesPanel } from '../panels/ServicesPanel';
import { MarketingPanel } from '../panels/MarketingPanel';
import { ContextSwitcher } from '../ContextSwitcher';
import { useContextContext } from '../../contexts/ContextContext';

export const ElectronLayout: React.FC = () => {
  const { activeContext } = useContextContext();

  // Render appropriate panel based on active context
  const renderCentralPanel = () => {
    switch (activeContext) {
      case 'hedge':
        return <WidgetPanel />;
      case 'dev':
        return <DevPanel />;
      case 'agents':
        return <AgentsPanel />;
      case 'services':
        return <ServicesPanel />;
      case 'marketing':
        return <MarketingPanel />;
      default:
        return <WidgetPanel />;
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Context Switcher */}
      <ContextSwitcher />

      {/* 3-Panel Layout */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <PanelGroup direction="horizontal">
        {/* Left Panel: Workspace Sidebar */}
        <Panel
          defaultSize={20}
          minSize={15}
          maxSize={30}
          id="sidebar"
          collapsible={false}
        >
          <Sidebar />
        </Panel>

        <PanelResizeHandle
          style={{
            width: '6px',
            background: 'rgba(239, 68, 68, 0.2)',
            cursor: 'col-resize',
            transition: 'all 0.2s ease',
            position: 'relative',
            zIndex: 5
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = 'rgba(239, 68, 68, 0.5)';
            (e.target as HTMLElement).style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.6)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = 'rgba(239, 68, 68, 0.2)';
            (e.target as HTMLElement).style.boxShadow = 'none';
          }}
        />

        {/* Center Panel: Dynamic based on active context */}
        <Panel
          defaultSize={45}
          minSize={30}
          id="center-panel"
        >
          {renderCentralPanel()}
        </Panel>

        <PanelResizeHandle
          style={{
            width: '6px',
            background: 'rgba(239, 68, 68, 0.2)',
            cursor: 'col-resize',
            transition: 'all 0.2s ease',
            position: 'relative',
            zIndex: 5
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = 'rgba(239, 68, 68, 0.5)';
            (e.target as HTMLElement).style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.6)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = 'rgba(239, 68, 68, 0.2)';
            (e.target as HTMLElement).style.boxShadow = 'none';
          }}
        />

        {/* Right Panel: Terminal Grid */}
        <Panel
          defaultSize={40}
          minSize={20}
          id="terminals"
        >
          <TerminalGrid />
        </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};
