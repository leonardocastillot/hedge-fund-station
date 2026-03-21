import { TerminalColor } from '@/contexts/TerminalContext';

export interface ColorScheme {
  name: string;
  primary: string;
  light: string;
  glow: string;
  border: string;
  borderActive: string;
  shadow: string;
  shadowActive: string;
  badge: string;
  badgeBorder: string;
  icon: string;
}

export const COLOR_SCHEMES: Record<TerminalColor, ColorScheme> = {
  red: {
    name: '🔴 Red',
    primary: '#ef4444',
    light: '#ff6b6b',
    glow: 'rgba(239, 68, 68, 0.3)',
    border: 'rgba(239, 68, 68, 0.2)',
    borderActive: 'rgba(239, 68, 68, 0.5)',
    shadow: '0 4px 16px rgba(239, 68, 68, 0.2)',
    shadowActive: '0 0 20px rgba(239, 68, 68, 0.3), 0 8px 32px rgba(0, 0, 0, 0.5)',
    badge: 'rgba(239, 68, 68, 0.15)',
    badgeBorder: 'rgba(239, 68, 68, 0.25)',
    icon: '🔴'
  },
  green: {
    name: '🟢 Green',
    primary: '#10b981',
    light: '#51cf66',
    glow: 'rgba(16, 185, 129, 0.3)',
    border: 'rgba(16, 185, 129, 0.2)',
    borderActive: 'rgba(16, 185, 129, 0.5)',
    shadow: '0 4px 16px rgba(16, 185, 129, 0.2)',
    shadowActive: '0 0 20px rgba(16, 185, 129, 0.3), 0 8px 32px rgba(0, 0, 0, 0.5)',
    badge: 'rgba(16, 185, 129, 0.15)',
    badgeBorder: 'rgba(16, 185, 129, 0.25)',
    icon: '🟢'
  },
  blue: {
    name: '🔵 Blue',
    primary: '#3b82f6',
    light: '#74c0fc',
    glow: 'rgba(59, 130, 246, 0.3)',
    border: 'rgba(59, 130, 246, 0.2)',
    borderActive: 'rgba(59, 130, 246, 0.5)',
    shadow: '0 4px 16px rgba(59, 130, 246, 0.2)',
    shadowActive: '0 0 20px rgba(59, 130, 246, 0.3), 0 8px 32px rgba(0, 0, 0, 0.5)',
    badge: 'rgba(59, 130, 246, 0.15)',
    badgeBorder: 'rgba(59, 130, 246, 0.25)',
    icon: '🔵'
  },
  yellow: {
    name: '🟡 Yellow',
    primary: '#eab308',
    light: '#ffd93d',
    glow: 'rgba(234, 179, 8, 0.3)',
    border: 'rgba(234, 179, 8, 0.2)',
    borderActive: 'rgba(234, 179, 8, 0.5)',
    shadow: '0 4px 16px rgba(234, 179, 8, 0.2)',
    shadowActive: '0 0 20px rgba(234, 179, 8, 0.3), 0 8px 32px rgba(0, 0, 0, 0.5)',
    badge: 'rgba(234, 179, 8, 0.15)',
    badgeBorder: 'rgba(234, 179, 8, 0.25)',
    icon: '🟡'
  },
  purple: {
    name: '🟣 Purple',
    primary: '#a855f7',
    light: '#d0bfff',
    glow: 'rgba(168, 85, 247, 0.3)',
    border: 'rgba(168, 85, 247, 0.2)',
    borderActive: 'rgba(168, 85, 247, 0.5)',
    shadow: '0 4px 16px rgba(168, 85, 247, 0.2)',
    shadowActive: '0 0 20px rgba(168, 85, 247, 0.3), 0 8px 32px rgba(0, 0, 0, 0.5)',
    badge: 'rgba(168, 85, 247, 0.15)',
    badgeBorder: 'rgba(168, 85, 247, 0.25)',
    icon: '🟣'
  },
  cyan: {
    name: '🔷 Cyan',
    primary: '#06b6d4',
    light: '#66d9ef',
    glow: 'rgba(6, 182, 212, 0.3)',
    border: 'rgba(6, 182, 212, 0.2)',
    borderActive: 'rgba(6, 182, 212, 0.5)',
    shadow: '0 4px 16px rgba(6, 182, 212, 0.2)',
    shadowActive: '0 0 20px rgba(6, 182, 212, 0.3), 0 8px 32px rgba(0, 0, 0, 0.5)',
    badge: 'rgba(6, 182, 212, 0.15)',
    badgeBorder: 'rgba(6, 182, 212, 0.25)',
    icon: '🔷'
  },
  orange: {
    name: '🟠 Orange',
    primary: '#f97316',
    light: '#ff8c42',
    glow: 'rgba(249, 115, 22, 0.3)',
    border: 'rgba(249, 115, 22, 0.2)',
    borderActive: 'rgba(249, 115, 22, 0.5)',
    shadow: '0 4px 16px rgba(249, 115, 22, 0.2)',
    shadowActive: '0 0 20px rgba(249, 115, 22, 0.3), 0 8px 32px rgba(0, 0, 0, 0.5)',
    badge: 'rgba(249, 115, 22, 0.15)',
    badgeBorder: 'rgba(249, 115, 22, 0.25)',
    icon: '🟠'
  },
  pink: {
    name: '🩷 Pink',
    primary: '#ec4899',
    light: '#f472b6',
    glow: 'rgba(236, 72, 153, 0.3)',
    border: 'rgba(236, 72, 153, 0.2)',
    borderActive: 'rgba(236, 72, 153, 0.5)',
    shadow: '0 4px 16px rgba(236, 72, 153, 0.2)',
    shadowActive: '0 0 20px rgba(236, 72, 153, 0.3), 0 8px 32px rgba(0, 0, 0, 0.5)',
    badge: 'rgba(236, 72, 153, 0.15)',
    badgeBorder: 'rgba(236, 72, 153, 0.25)',
    icon: '🩷'
  }
};
