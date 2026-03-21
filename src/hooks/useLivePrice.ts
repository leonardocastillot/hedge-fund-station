import { useEffect, useRef, useState } from 'react';
import { apiService } from '../services/api';

interface PriceData {
  price: number | null;
  change24h: number;
  volume24h: number;
  isLoading: boolean;
  error: string | null;
}

export function useLivePrice() {
  const [data, setData] = useState<PriceData>({
    price: null,
    change24h: 0,
    volume24h: 0,
    isLoading: true,
    error: null,
  });
  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    let ws: WebSocket | null = null;
    let interval: number | null = null;

    const fetchPrice = async () => {
      if (document.hidden || isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;

      try {
        const response = await apiService.getCurrentPrice();
        if (!isMountedRef.current) {
          return;
        }

        setData(prev => ({
          ...prev,
          price: response.last_price,
          change24h: response.price_change_pct_24h,
          volume24h: response.volume_24h,
          isLoading: false,
          error: null,
        }));
      } catch (error) {
        console.error('useLivePrice: Error fetching price:', error);
        if (!isMountedRef.current) {
          return;
        }

        setData(prev => ({
          ...prev,
          error: 'Failed to fetch price data',
          isLoading: false,
        }));
      } finally {
        isFetchingRef.current = false;
      }
    };

    const startPolling = () => {
      if (interval !== null || document.hidden) {
        return;
      }

      interval = window.setInterval(fetchPrice, 30000);
    };

    const stopPolling = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }

      fetchPrice();
      startPolling();
    };

    fetchPrice();

    try {
      ws = apiService.connectWebSocket((message) => {
        if (!isMountedRef.current || message.type !== 'price_update') {
          return;
        }

        setData(prev => ({
          ...prev,
          price: message.data.price,
          change24h: message.data.change_24h,
          volume24h: message.data.volume_24h,
          isLoading: false,
          error: null,
        }));
      });
    } catch (error) {
      console.error('WebSocket connection error:', error);
    }

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      if (ws) {
        ws.close();
      }
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return data;
}
