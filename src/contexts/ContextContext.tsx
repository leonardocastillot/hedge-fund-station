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
    color: '#22d3ee',
    description: 'Trading cockpit, strategy lab, macro calendar and backend operations'
  }
];

const ContextContext = createContext<ContextContextValue | undefined>(undefined);

export const ContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeContext, setActiveContextState] = useState<string>(() => {
    return 'hedge';
  });

  const setActiveContext = useCallback((id: string) => {
    const nextContext = CONTEXTS.some((context) => context.id === id) ? id : 'hedge';
    setActiveContextState(nextContext);
    localStorage.setItem('activeContextV2', nextContext);
    localStorage.setItem('activeContext', nextContext);
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
