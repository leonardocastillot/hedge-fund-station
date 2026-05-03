import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Bitcoin,
  Bot,
  CandlestickChart,
  Database,
  Droplets,
  FlaskConical,
  ShieldCheck,
  RadioTower,
  Settings,
  Wallet
} from 'lucide-react';

import TradingCockpitPage from './pages/TradingCockpitPage';
import BtcAnalysisPage from './pages/BtcAnalysisPage';
import EconomicCalendarPage from './pages/EconomicCalendarPage';
import PolymarketPage from './pages/PolymarketPage';
import StrategyLibraryPage from '@/features/strategies/pages/StrategyLibraryPage';
import StrategyDetailPage from '@/features/strategies/pages/StrategyDetailPage';
import StrategyAuditPage from '@/features/strategies/pages/StrategyAuditPage';
import HyperliquidDataPage from '@/features/hyperliquid/pages/HyperliquidDataPage';
import HyperliquidIntelligencePage from '@/features/hyperliquid/pages/HyperliquidIntelligencePage';
import HyperliquidPaperLabPage from '@/features/paper/pages/HyperliquidPaperLabPage';
import LiquidationsPage from '@/features/liquidations/pages/LiquidationsPage';
import PortfolioDashboardPage from '@/features/paper/pages/PortfolioDashboardPage';
import { LiquidationsProvider } from '@/contexts/LiquidationsContext';
import { AgentsPanel } from '@/features/agents/panels/AgentsPanel';

const SettingsPage = React.lazy(() => import('@/features/settings/pages/SettingsPage'));

const navItems = [
  { path: '/', label: 'Cockpit', icon: RadioTower },
  { path: '/btc', label: 'BTC', icon: Bitcoin },
  { path: '/hyperliquid', label: 'Hyperliquid', icon: CandlestickChart },
  { path: '/strategies', label: 'Strategies', icon: FlaskConical },
  { path: '/strategy-audit', label: 'Audit', icon: ShieldCheck },
  { path: '/paper', label: 'Paper', icon: BarChart3 },
  { path: '/liquidations', label: 'Liquidations', icon: Droplets },
  { path: '/portfolio', label: 'Portfolio', icon: Wallet },
  { path: '/data', label: 'Data', icon: Database },
  { path: '/workbench', label: 'Workbench', icon: Bot },
  { path: '/settings', label: 'Settings', icon: Settings }
];

const LiquidationsRoute: React.FC = () => (
  <LiquidationsProvider>
    <LiquidationsPage />
  </LiquidationsProvider>
);

const Navigation: React.FC = () => {
  const location = useLocation();

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

export const WidgetPanel: React.FC = () => {
  return (
    <BrowserRouter>
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
            <Suspense
              fallback={
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
              }
            >
              <Routes>
                <Route path="/" element={<TradingCockpitPage />} />
                <Route path="/btc" element={<BtcAnalysisPage />} />
                <Route path="/calendar" element={<EconomicCalendarPage />} />
                <Route path="/strategies" element={<StrategyLibraryPage />} />
                <Route path="/strategy/:strategyName/:timeframe" element={<StrategyDetailPage />} />
                <Route path="/strategy-audit" element={<StrategyAuditPage />} />
                <Route path="/hyperliquid" element={<HyperliquidIntelligencePage />} />
                <Route path="/paper" element={<HyperliquidPaperLabPage />} />
                <Route path="/polymarket" element={<PolymarketPage />} />
                <Route path="/portfolio" element={<PortfolioDashboardPage />} />
                <Route path="/liquidations" element={<LiquidationsRoute />} />
                <Route path="/data" element={<HyperliquidDataPage />} />
                <Route path="/workbench" element={<AgentsPanel />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<TradingCockpitPage />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
};
