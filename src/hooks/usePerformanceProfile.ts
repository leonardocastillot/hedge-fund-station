import { useEffect, useState } from 'react';
import {
  APP_SETTINGS_CHANGED_EVENT,
  loadAppSettings,
  normalizePerformanceProfile,
  type AppSettings,
  type PerformanceProfile
} from '@/utils/appSettings';

const VISIBLE_POLLING_MULTIPLIER: Record<PerformanceProfile, number> = {
  full: 1,
  'daily-light': 2,
  'ultra-light': 4
};

const HIDDEN_POLLING_MIN_MS: Record<PerformanceProfile, number> = {
  full: 60_000,
  'daily-light': 180_000,
  'ultra-light': 300_000
};

function readPerformanceProfile(): PerformanceProfile {
  return loadAppSettings().performanceProfile;
}

export function usePerformanceProfile(): PerformanceProfile {
  const [profile, setProfile] = useState<PerformanceProfile>(() => readPerformanceProfile());

  useEffect(() => {
    const syncProfile = (event?: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as Partial<AppSettings> | undefined : undefined;
      setProfile(detail?.performanceProfile ? normalizePerformanceProfile(detail.performanceProfile) : readPerformanceProfile());
    };

    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, syncProfile);
    window.addEventListener('storage', syncProfile);
    return () => {
      window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, syncProfile);
      window.removeEventListener('storage', syncProfile);
    };
  }, []);

  return profile;
}

export function scalePollingInterval(intervalMs: number, profile: PerformanceProfile): number {
  return Math.max(intervalMs, Math.round(intervalMs * VISIBLE_POLLING_MULTIPLIER[profile]));
}

export function getHiddenPollingDelay(intervalMs: number, profile: PerformanceProfile): number {
  return Math.max(scalePollingInterval(intervalMs, profile), HIDDEN_POLLING_MIN_MS[profile]);
}

export function shouldSuspendBackgroundMedia(profile: PerformanceProfile): boolean {
  return profile !== 'full';
}
