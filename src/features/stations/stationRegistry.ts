export type StationId = 'hedge-fund-station' | 'live-trading';

export type StationIcon = 'research' | 'live';

export interface StationDefinition {
  id: StationId;
  label: string;
  route: string;
  icon: StationIcon;
  description: string;
}

export const TRADING_STATIONS: StationDefinition[] = [
  {
    id: 'hedge-fund-station',
    label: 'Hedge Fund Station',
    route: '/station/hedge-fund',
    icon: 'research',
    description: 'Research OS, validation, agents, evidence, and stable commands'
  },
  {
    id: 'live-trading',
    label: 'Live Trading',
    route: '/station/live',
    icon: 'live',
    description: 'Safe monitor for market state, paper risk, readiness, and review'
  }
];

export function isStationRoute(pathname: string, station: StationDefinition): boolean {
  return pathname === station.route || pathname.startsWith(`${station.route}/`);
}
