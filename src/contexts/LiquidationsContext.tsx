/**
 * Liquidations Context - Proveedor global de datos de liquidaciones
 * Disponible en toda la aplicación para informar decisiones de trading
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { liquidationsService, LiquidationsStats, HedgeFundInsights, LiquidationSnapshot, LiquidationAlert, LiquidationChartData } from "../services/liquidationsService";
import { useMarketPolling } from "@/hooks/useMarketPolling";

interface LiquidationsContextType {
  stats: LiquidationsStats | null;
  insights: HedgeFundInsights | null;
  snapshots: LiquidationSnapshot[];
  chartData: LiquidationChartData | null;
  chartHours: number;
  recentAlerts: LiquidationAlert[];
  isConnected: boolean;
  isLoading: boolean;
  isStale: boolean;
  error: string | null;
  setChartHours: (hours: number) => void;
  refreshStats: () => Promise<void>;
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
}

const LiquidationsContext = createContext<LiquidationsContextType | undefined>(undefined);

export function LiquidationsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<LiquidationsStats | null>(null);
  const [insights, setInsights] = useState<HedgeFundInsights | null>(null);
  const [snapshots, setSnapshots] = useState<LiquidationSnapshot[]>([]);
  const [chartData, setChartData] = useState<LiquidationChartData | null>(null);
  const [chartHours, setChartHours] = useState(24);
  const [recentAlerts, setRecentAlerts] = useState<LiquidationAlert[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSnapshot, setHasSnapshot] = useState(false);

  const poll = useMarketPolling(
    `liquidations:context:${chartHours}`,
    async () => {
      const [statusData, insightsData, snapshotsData, alertsData, chartDataResponse] = await Promise.all([
        liquidationsService.getStatus(),
        liquidationsService.getInsights(),
        liquidationsService.getSnapshots(20),
        liquidationsService.getAlerts(10),
        liquidationsService.getChartData(chartHours)
      ]);
      return { statusData, insightsData, snapshotsData, alertsData, chartDataResponse };
    },
    { intervalMs: 12_000, staleAfterMs: 35_000 }
  );

  useEffect(() => {
    if (poll.data) {
      setStats(poll.data.statusData);
      setInsights(poll.data.insightsData);
      setSnapshots(poll.data.snapshotsData);
      setChartData(poll.data.chartDataResponse);
      setRecentAlerts(poll.data.alertsData);
      setIsConnected(true);
      setIsLoading(false);
      setIsStale(poll.status === 'stale');
      setError(null);
      setHasSnapshot(poll.data.snapshotsData.length > 0);
      return;
    }

    if (poll.status === 'error' || poll.status === 'stale') {
      console.error("Error loading liquidations data:", poll.error);
      setIsConnected(false);
      setIsLoading(false);
      setIsStale(hasSnapshot || poll.status === 'stale');
      setError(poll.error || "Failed to load liquidations data");
    }
  }, [hasSnapshot, poll.data, poll.error, poll.status]);

  const loadData = useCallback(async () => {
    await poll.refresh();
  }, [poll]);

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
    chartData,
    chartHours,
    recentAlerts,
    isConnected,
    isLoading: isLoading || poll.status === 'loading',
    isStale,
    error,
    setChartHours,
    refreshStats: loadData,
    startMonitoring,
    stopMonitoring
  }), [stats, insights, snapshots, chartData, chartHours, recentAlerts, isConnected, isLoading, isStale, error, loadData, startMonitoring, stopMonitoring, poll.status]);

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
