import { useEffect, useRef } from 'react';

interface UseVisibilityPollingOptions {
  enabled?: boolean;
  runImmediately?: boolean;
}

export function useVisibilityPolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  options: UseVisibilityPollingOptions = {}
) {
  const { enabled = true, runImmediately = true } = options;
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let intervalId: number | null = null;

    const tick = () => {
      void callbackRef.current();
    };

    const start = () => {
      if (document.hidden || intervalId !== null) {
        return;
      }

      if (runImmediately) {
        tick();
      }

      intervalId = window.setInterval(tick, intervalMs);
    };

    const stop = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
        return;
      }

      start();
    };

    start();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, intervalMs, runImmediately]);
}
