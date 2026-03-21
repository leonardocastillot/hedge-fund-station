import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService, Candle } from '../services/api';

interface ChartDataHook {
  data: Candle[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useChartData(timeframe: string, limit?: number): ChartDataHook {
  const [data, setData] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (document.hidden || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;

    try {
      setIsLoading(true);
      setError(null);

      const limitMap: Record<string, number> = {
        '5m': 120,
        '15m': 120,
        '1h': 168,
        '4h': 180,
      };

      const dataLimit = limit || limitMap[timeframe] || 100;
      const candles = await apiService.getPriceHistory(timeframe, dataLimit);

      if (!isMountedRef.current) {
        return;
      }

      setData(candles || []);
    } catch (err) {
      console.error('useChartData: Error fetching chart data:', err);
      if (!isMountedRef.current) {
        return;
      }

      setError('Failed to load chart data');
      setData([]);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, [limit, timeframe]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();

    let interval: number | null = window.setInterval(fetchData, 60000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (interval !== null) {
          clearInterval(interval);
          interval = null;
        }
        return;
      }

      fetchData();
      if (interval === null) {
        interval = window.setInterval(fetchData, 60000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      if (interval !== null) {
        clearInterval(interval);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
