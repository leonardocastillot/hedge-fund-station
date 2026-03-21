import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LiquidationsProvider } from '../../contexts/LiquidationsContext';

import DashboardPage from '../../pages/DashboardPage';

const StrategyLibraryPage = React.lazy(() => import('../../pages/StrategyLibraryPage'));
const StrategyDetailPage = React.lazy(() => import('../../pages/StrategyDetailPage'));
const PortfolioDashboardPage = React.lazy(() => import('../../pages/PortfolioDashboardPage'));
const LiquidationsPage = React.lazy(() => import('../../pages/LiquidationsPage'));
const EconomicCalendarPage = React.lazy(() => import('../../pages/EconomicCalendarPage'));
const PolymarketPage = React.lazy(() => import('../../pages/PolymarketPage'));
const HyperliquidIntelligencePage = React.lazy(() => import('../../pages/HyperliquidIntelligencePage'));
const HyperliquidDataPage = React.lazy(() => import('../../pages/HyperliquidDataPage'));
const HyperliquidPaperLabPage = React.lazy(() => import('../../pages/HyperliquidPaperLabPage'));
const SettingsPage = React.lazy(() => import('../../pages/SettingsPage'));

const LiquidationsRoute: React.FC = () => (
  <LiquidationsProvider>
    <LiquidationsPage />
  </LiquidationsProvider>
);

const navItems = [
  { path: '/', label: 'Dashboard', icon: 'D' },
  { path: '/calendar', label: 'Calendar', icon: 'C' },
  { path: '/strategies', label: 'Strategies', icon: 'S' },
  { path: '/portfolio', label: 'Portfolio', icon: 'P' },
  { path: '/liquidations', label: 'Liquidations', icon: 'L' },
  { path: '/hyperliquid', label: 'Hyperliquid', icon: 'H' },
  { path: '/paper', label: 'Paper', icon: 'R' },
  { path: '/data', label: 'DATA', icon: 'D' },
  { path: '/polymarket', label: 'Polymarket', icon: 'M' },
  { path: '/settings', label: 'Settings', icon: 'T' }
];

const Navigation: React.FC = () => {
  const location = useLocation();

  return (
    <nav
      style={{
        display: 'flex',
        gap: '4px',
        padding: '12px 16px',
        background: 'rgba(0, 0, 0, 0.8)',
        borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
        overflowX: 'auto'
      }}
    >
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;

        return (
          <Link
            key={item.path}
            to={item.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: isActive ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
              color: isActive ? '#ef4444' : '#9ca3af',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 500,
              border: isActive ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid transparent',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            <span>{item.icon}</span>
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
          background: '#000000',
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
                    color: '#9ca3af',
                    fontSize: '14px',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    background: '#05070b'
                  }}
                >
                  Loading module...
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/calendar" element={<EconomicCalendarPage />} />
                <Route path="/strategies" element={<StrategyLibraryPage />} />
                <Route path="/strategy/:strategyName/:timeframe" element={<StrategyDetailPage />} />
                <Route path="/portfolio" element={<PortfolioDashboardPage />} />
                <Route path="/liquidations" element={<LiquidationsRoute />} />
                <Route path="/hyperliquid" element={<HyperliquidIntelligencePage />} />
                <Route path="/paper" element={<HyperliquidPaperLabPage />} />
                <Route path="/data" element={<HyperliquidDataPage />} />
                <Route path="/polymarket" element={<PolymarketPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
};
