import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bitcoin,
  Bot,
  CalendarDays,
  CandlestickChart,
  Database,
  Droplets,
  FlaskConical,
  Network,
  ShieldCheck,
  RadioTower,
  Settings,
  Terminal,
  Wallet
} from 'lucide-react';

import { LiquidationsProvider } from '@/contexts/LiquidationsContext';
import { recordTelemetry } from '@/services/performanceTelemetry';
import { CENTER_NAVIGATION_EVENT, publishCenterRouteChanged, type CenterNavigationDetail } from '@/utils/centerNavigation';

const HedgeFundStationPage = React.lazy(() => import('@/features/stations/pages/HedgeFundStationPage'));
const LiveTradingStationPage = React.lazy(() => import('@/features/stations/pages/LiveTradingStationPage'));
const TradingCockpitPage = React.lazy(() => import('./pages/TradingCockpitPage'));
const BtcAnalysisPage = React.lazy(() => import('./pages/BtcAnalysisPage'));
const EconomicCalendarPage = React.lazy(() => import('./pages/EconomicCalendarPage'));
const PolymarketPage = React.lazy(() => import('./pages/PolymarketPage'));
const StrategyLibraryPage = React.lazy(() => import('@/features/strategies/pages/StrategyLibraryPage'));
const StrategyDetailPage = React.lazy(() => import('@/features/strategies/pages/StrategyDetailPage'));
const StrategyAuditPage = React.lazy(() => import('@/features/strategies/pages/StrategyAuditPage'));
const MemoryGraphPage = React.lazy(() => import('@/features/memory/pages/MemoryGraphPage'));
const HyperliquidDataPage = React.lazy(() => import('@/features/hyperliquid/pages/HyperliquidDataPage'));
const HyperliquidIntelligencePage = React.lazy(() => import('@/features/hyperliquid/pages/HyperliquidIntelligencePage'));
const HyperliquidPaperLabPage = React.lazy(() => import('@/features/paper/pages/HyperliquidPaperLabPage'));
const LiquidationsPage = React.lazy(() => import('@/features/liquidations/pages/LiquidationsPage'));
const PortfolioDashboardPage = React.lazy(() => import('@/features/paper/pages/PortfolioDashboardPage'));
const AgentsPanel = React.lazy(() => import('@/features/agents/panels/AgentsPanel').then((module) => ({ default: module.AgentsPanel })));
const SettingsPage = React.lazy(() => import('@/features/settings/pages/SettingsPage'));
const DiagnosticsPage = React.lazy(() => import('@/features/diagnostics/pages/DiagnosticsPage'));
const TerminalGrid = React.lazy(() => import('@/components/electron/TerminalGrid').then((module) => ({ default: module.TerminalGrid })));

const navItems = [
  { path: '/station/hedge-fund', label: 'Hedge Fund', icon: ShieldCheck },
  { path: '/station/live', label: 'Live', icon: Activity },
  { path: '/cockpit', label: 'Cockpit', icon: RadioTower },
  { path: '/btc', label: 'BTC', icon: Bitcoin },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/hyperliquid', label: 'Hyperliquid', icon: CandlestickChart },
  { path: '/strategies', label: 'Pipeline', icon: FlaskConical },
  { path: '/strategy-audit', label: 'Audit Focus', icon: ShieldCheck },
  { path: '/memory', label: 'Memory', icon: Network },
  { path: '/paper', label: 'Paper', icon: BarChart3 },
  { path: '/liquidations', label: 'Liquidations', icon: Droplets },
  { path: '/portfolio', label: 'Portfolio', icon: Wallet },
  { path: '/data', label: 'Data', icon: Database },
  { path: '/terminals', label: 'Terminales / CLI', icon: Terminal },
  { path: '/workbench', label: 'Workbench', icon: Bot },
  { path: '/diagnostics', label: 'Diagnostics', icon: Activity },
  { path: '/settings', label: 'Settings', icon: Settings }
];

const LiquidationsRoute: React.FC = () => (
  <LiquidationsProvider>
    <LiquidationsPage />
  </LiquidationsProvider>
);

const Navigation: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    publishCenterRouteChanged(location.pathname);
    const startedAt = performance.now();
    return () => {
      recordTelemetry({
        type: 'route',
        label: location.pathname,
        durationMs: Math.round(performance.now() - startedAt),
        status: 'unmounted'
      });
    };
  }, [location.pathname]);

  return (
    <nav
      style={{
        display: 'flex',
        gap: '3px',
        padding: '8px 12px',
        background: 'rgba(4, 8, 16, 0.4)',
        backdropFilter: 'blur(28px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.2)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
        overflowX: 'auto',
        boxShadow: 'inset 0 -1px 0 rgba(0, 0, 0, 0.3)'
      }}
    >
      {navItems.map((item) => {
        const isActive =
          item.path === '/'
            ? location.pathname === '/'
            : location.pathname === item.path ||
              location.pathname.startsWith(`${item.path}/`) ||
              (item.path === '/strategies' && location.pathname.startsWith('/strategy/'));

        return (
          <Link
            key={item.path}
            to={item.path}
            title={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              borderRadius: '6px',
              background: isActive ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
              color: isActive ? 'var(--app-text)' : 'var(--app-subtle)',
              textDecoration: 'none',
              fontSize: '12px',
              fontWeight: isActive ? 600 : 400,
              border: isActive ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid transparent',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
              boxShadow: isActive ? '0 0 12px var(--app-glow)' : 'none'
            }}
          >
            <item.icon size={13} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey: string },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode; resetKey: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'Route failed.' };
  }

  componentDidCatch(error: Error) {
    recordTelemetry({ type: 'error', label: `route:${this.props.resetKey}`, status: 'render-error', detail: error.message });
    if (isDynamicImportError(error)) {
      const reloadKey = `route-reload:${this.props.resetKey}`;
      const lastReloadAt = Number(window.sessionStorage.getItem(reloadKey) ?? 0);
      if (Date.now() - lastReloadAt > 15_000) {
        window.sessionStorage.setItem(reloadKey, String(Date.now()));
        window.setTimeout(() => window.location.reload(), 100);
      }
    }
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-100">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-red-200/80">Module Error</div>
          <div className="mt-2">{this.state.message}</div>
          {isDynamicImportMessage(this.state.message) ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 rounded-md border border-red-200/20 bg-red-200/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-50 transition hover:bg-red-200/20"
            >
              Reload module
            </button>
          ) : null}
        </div>
      );
    }

    return this.props.children;
  }
}

function isDynamicImportMessage(message: string): boolean {
  return message.includes('Failed to fetch dynamically imported module') || message.includes('Importing a module script failed');
}

function isDynamicImportError(error: Error): boolean {
  return isDynamicImportMessage(error.message || '');
}

const RouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return <RouteErrorBoundary resetKey={location.pathname}>{children}</RouteErrorBoundary>;
};

const CenterNavigationBridge: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as CenterNavigationDetail | undefined : undefined;
      if (!detail?.path || !detail.path.startsWith('/')) {
        return;
      }

      navigate(detail.path);
    };

    window.addEventListener(CENTER_NAVIGATION_EVENT, handleNavigate);
    return () => window.removeEventListener(CENTER_NAVIGATION_EVENT, handleNavigate);
  }, [navigate]);

  return null;
};

export const WidgetPanel: React.FC = () => {
  return (
    <BrowserRouter>
      <CenterNavigationBridge />
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(2, 4, 8, 0.6)',
          overflow: 'hidden'
        }}
      >
        <Navigation />

        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            style={{
              flex: 1,
              overflow: 'auto'
            }}
          >
            <RouteGuard>
              <Suspense fallback={<ModuleLoading />}>
                <Routes>
                  <Route path="/" element={<Navigate replace to="/station/hedge-fund" />} />
                  <Route path="/station/hedge-fund" element={<HedgeFundStationPage />} />
                  <Route path="/station/live" element={<LiveTradingStationPage />} />
                  <Route path="/cockpit" element={<TradingCockpitPage />} />
                  <Route path="/btc" element={<BtcAnalysisPage />} />
                  <Route path="/calendar" element={<EconomicCalendarPage />} />
                  <Route path="/strategies" element={<StrategyLibraryPage />} />
                  <Route path="/strategy/:strategyName/:timeframe" element={<StrategyDetailPage />} />
                  <Route path="/strategy-audit" element={<StrategyAuditPage />} />
                  <Route path="/memory" element={<MemoryGraphPage />} />
                  <Route path="/hyperliquid" element={<HyperliquidIntelligencePage />} />
                  <Route path="/paper" element={<HyperliquidPaperLabPage />} />
                  <Route path="/polymarket" element={<PolymarketPage />} />
                  <Route path="/portfolio" element={<PortfolioDashboardPage />} />
                  <Route path="/liquidations" element={<LiquidationsRoute />} />
                  <Route path="/data" element={<HyperliquidDataPage />} />
                  <Route path="/terminals" element={<TerminalGrid />} />
                  <Route path="/workbench" element={<AgentsPanel />} />
                  <Route path="/diagnostics" element={<DiagnosticsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate replace to="/station/hedge-fund" />} />
                </Routes>
              </Suspense>
            </RouteGuard>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
};

const ModuleLoading: React.FC = () => (
  <div
    style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#545e6e',
      fontSize: '12px',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      background: 'transparent',
      fontFamily: "'JetBrains Mono', monospace"
    }}
  >
    Loading module...
  </div>
);
