/**
 * Liquidations Context - Proveedor global de datos de liquidaciones
 * Disponible en toda la aplicación para informar decisiones de trading
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from "react";
import { liquidationsService, LiquidationsStats, HedgeFundInsights, LiquidationSnapshot, LiquidationAlert } from "../services/liquidationsService";

interface LiquidationsContextType {
  stats: LiquidationsStats | null;
  insights: HedgeFundInsights | null;
  snapshots: LiquidationSnapshot[];
  recentAlerts: LiquidationAlert[];
  isConnected: boolean;
  error: string | null;
  refreshStats: () => Promise<void>;
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
}

const LiquidationsContext = createContext<LiquidationsContextType | undefined>(undefined);

export function LiquidationsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<LiquidationsStats | null>(null);
  const [insights, setInsights] = useState<HedgeFundInsights | null>(null);
  const [snapshots, setSnapshots] = useState<LiquidationSnapshot[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<LiquidationAlert[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const loadData = useCallback(async () => {
    try {
      const [statusData, insightsData, snapshotsData, alertsData] = await Promise.all([
        liquidationsService.getStatus(),
        liquidationsService.getInsights(),
        liquidationsService.getSnapshots(20),
        liquidationsService.getAlerts(10)
      ]);

      if (isMountedRef.current) {
        setStats(statusData);
        setInsights(insightsData);
        setSnapshots(snapshotsData);
        setRecentAlerts(alertsData);
        setIsConnected(true);
        setError(null);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        console.error("Error loading liquidations data:", err);
        setIsConnected(false);
        setError(err.message || "Failed to load liquidations data");
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadData();
    const interval = window.setInterval(() => {
      void loadData();
    }, 12_000);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(interval);
    };
  }, [loadData]);

  const startMonitoring = useCallback(async () => {
    try {
      await liquidationsService.startMonitoring();
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to start monitoring");
    }
  }, [loadData]);

  const stopMonitoring = useCallback(async () => {
    try {
      await liquidationsService.stopMonitoring();
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to stop monitoring");
    }
  }, [loadData]);

  const value = useMemo<LiquidationsContextType>(() => ({
    stats,
    insights,
    snapshots,
    recentAlerts,
    isConnected,
    error,
    refreshStats: loadData,
    startMonitoring,
    stopMonitoring
  }), [stats, insights, snapshots, recentAlerts, isConnected, error, loadData, startMonitoring, stopMonitoring]);

  return (
    <LiquidationsContext.Provider value={value}>
      {children}
    </LiquidationsContext.Provider>
  );
}

export function useLiquidations() {
  const context = useContext(LiquidationsContext);
  if (context === undefined) {
    throw new Error("useLiquidations must be used within a LiquidationsProvider");
  }
  return context;
}
