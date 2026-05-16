import {
  Activity,
  BarChart3,
  Bitcoin,
  Blocks,
  CalendarDays,
  CandlestickChart,
  Database,
  Droplets,
  FlaskConical,
  GitBranch,
  Network,
  RadioTower,
  Settings,
  ShieldCheck,
  Terminal,
  Wallet,
  type LucideIcon
} from 'lucide-react';

export type AppNavGroup = 'core' | 'research' | 'ops' | 'system';

export type AppNavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  group: AppNavGroup;
};

export const APP_NAV_GROUPS: readonly AppNavGroup[] = ['core', 'research', 'ops', 'system'];

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { path: '/workbench', label: 'Strategy Pods', icon: Blocks, group: 'core' },
  { path: '/station/hedge-fund', label: 'Hedge Fund', icon: ShieldCheck, group: 'core' },
  { path: '/station/live', label: 'Live', icon: Activity, group: 'core' },
  { path: '/cockpit', label: 'Cockpit', icon: RadioTower, group: 'core' },
  { path: '/btc', label: 'BTC', icon: Bitcoin, group: 'core' },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays, group: 'core' },
  { path: '/hyperliquid', label: 'Hyperliquid', icon: CandlestickChart, group: 'core' },
  { path: '/strategies', label: 'Pipeline', icon: FlaskConical, group: 'research' },
  { path: '/strategy-audit', label: 'Audit Focus', icon: ShieldCheck, group: 'research' },
  { path: '/memory', label: 'Memory', icon: Network, group: 'research' },
  { path: '/repo-graph', label: 'Repo Graph', icon: GitBranch, group: 'research' },
  { path: '/paper', label: 'Paper', icon: BarChart3, group: 'ops' },
  { path: '/liquidations', label: 'Liquidations', icon: Droplets, group: 'ops' },
  { path: '/portfolio', label: 'Portfolio', icon: Wallet, group: 'ops' },
  { path: '/data', label: 'Data', icon: Database, group: 'ops' },
  { path: '/terminals', label: 'Code / CLI', icon: Terminal, group: 'ops' },
  { path: '/diagnostics', label: 'Diagnostics', icon: Activity, group: 'system' },
  { path: '/settings', label: 'Settings', icon: Settings, group: 'system' }
] as const;

export const APP_NAV_ITEMS_BY_GROUP: Readonly<Record<AppNavGroup, readonly AppNavItem[]>> = {
  core: APP_NAV_ITEMS.filter((item) => item.group === 'core'),
  research: APP_NAV_ITEMS.filter((item) => item.group === 'research'),
  ops: APP_NAV_ITEMS.filter((item) => item.group === 'ops'),
  system: APP_NAV_ITEMS.filter((item) => item.group === 'system')
};

export function isAppRouteActive(currentPath: string, itemPath: string): boolean {
  return (
    currentPath === itemPath ||
    currentPath.startsWith(`${itemPath}/`) ||
    (itemPath === '/strategies' && currentPath.startsWith('/strategy/'))
  );
}
