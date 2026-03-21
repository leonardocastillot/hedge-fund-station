import { useCallback, useEffect, useState } from 'react';
import type { LaunchDeskRecord } from '../utils/workspaceLaunch';

const STORAGE_KEY = 'hedge-station:desk-history';

function loadDeskHistory(): LaunchDeskRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as LaunchDeskRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useDeskHistory() {
  const [history, setHistory] = useState<LaunchDeskRecord[]>(() => loadDeskHistory());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const recordLaunch = useCallback((record: LaunchDeskRecord) => {
    setHistory((prev) => [record, ...prev.filter((item) => item.id !== record.id)].slice(0, 20));
  }, []);

  return {
    history,
    recordLaunch
  };
}
