import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface ContextConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

interface ContextContextValue {
  activeContext: string;
  contexts: ContextConfig[];
  setActiveContext: (id: string) => void;
}

const CONTEXTS: ContextConfig[] = [
  {
    id: 'hedge',
    name: 'Hedge Fund',
    icon: 'HF',
    color: '#ef4444',
    description: 'Trading, strategies, market review and legacy hedge modules'
  },
  {
    id: 'dev',
    name: 'Development',
    icon: 'DEV',
    color: '#dc2626',
    description: 'Workstation, commands, launch profiles and local engineering flow'
  },
  {
    id: 'agents',
    name: 'Agents',
    icon: 'AI',
    color: '#f97316',
    description: 'Commander, specialist agents and operational supervision'
  },
  {
    id: 'services',
    name: 'Services',
    icon: 'OPS',
    color: '#b91c1c',
    description: 'Client projects and service workflows'
  },
  {
    id: 'marketing',
    name: 'Marketing',
    icon: 'MKT',
    color: '#991b1b',
    description: 'Content, landing pages and social distribution'
  }
];

const ContextContext = createContext<ContextContextValue | undefined>(undefined);

export const ContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeContext, setActiveContextState] = useState<string>(() => {
    return localStorage.getItem('activeContext') || 'dev';
  });

  const setActiveContext = useCallback((id: string) => {
    setActiveContextState(id);
    localStorage.setItem('activeContext', id);
  }, []);

  const value = useMemo<ContextContextValue>(() => ({
    activeContext,
    contexts: CONTEXTS,
    setActiveContext
  }), [activeContext, setActiveContext]);

  return (
    <ContextContext.Provider value={value}>
      {children}
    </ContextContext.Provider>
  );
};

export const useContextContext = () => {
  const context = useContext(ContextContext);
  if (!context) {
    throw new Error('useContextContext must be used within ContextProvider');
  }
  return context;
};
