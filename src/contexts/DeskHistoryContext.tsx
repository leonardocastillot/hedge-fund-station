import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { LaunchDeskRecord } from '../utils/workspaceLaunch';

const STORAGE_KEY = 'hedge-station:desk-history';

interface DeskHistoryContextValue {
  history: LaunchDeskRecord[];
  recordLaunch: (record: LaunchDeskRecord) => void;
}

const DeskHistoryContext = createContext<DeskHistoryContextValue | undefined>(undefined);

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

export const DeskHistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [history, setHistory] = useState<LaunchDeskRecord[]>(() => loadDeskHistory());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const value = useMemo<DeskHistoryContextValue>(() => ({
    history,
    recordLaunch: (record) => {
      setHistory((prev) => [record, ...prev.filter((item) => item.id !== record.id)].slice(0, 20));
    }
  }), [history]);

  return (
    <DeskHistoryContext.Provider value={value}>
      {children}
    </DeskHistoryContext.Provider>
  );
};

export function useDeskHistoryContext() {
  const context = useContext(DeskHistoryContext);
  if (!context) {
    throw new Error('useDeskHistoryContext must be used within DeskHistoryProvider');
  }
  return context;
}
