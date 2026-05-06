import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createServiceResult,
  normalizeServiceError,
  type ServiceResult
} from '@/services/requestCache';
import { recordTelemetry } from '@/services/performanceTelemetry';

interface UseMarketPollingOptions {
  enabled?: boolean;
  intervalMs: number;
  staleAfterMs: number;
  runImmediately?: boolean;
}

interface UseMarketPollingResult<T> extends ServiceResult<T> {
  refresh: () => Promise<void>;
  isRefreshing: boolean;
  failureCount: number;
}

const inFlightByKey = new Map<string, Promise<unknown>>();

function backoffDelay(intervalMs: number, failureCount: number) {
  if (failureCount <= 0) {
    return intervalMs;
  }
  const multiplier = Math.min(8, 2 ** Math.min(failureCount, 3));
  return intervalMs * multiplier;
}

export function useMarketPolling<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseMarketPollingOptions
): UseMarketPollingResult<T> {
  const {
    enabled = true,
    intervalMs,
    staleAfterMs,
    runImmediately = true
  } = options;
  const [result, setResult] = useState<ServiceResult<T>>(() => createServiceResult<T>(null, 'idle'));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [failureCount, setFailureCount] = useState(0);
  const fetcherRef = useRef(fetcher);
  const resultRef = useRef(result);
  const mountedRef = useRef(true);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const refresh = useCallback(async () => {
    if (!enabled || !mountedRef.current) {
      return;
    }

    const previous = resultRef.current;
    const startedAt = performance.now();
    setIsRefreshing(true);
    setResult((current) => createServiceResult(
      current.data,
      current.data ? current.status : 'loading',
      {
        error: null,
        fetchedAt: current.fetchedAt,
        latencyMs: current.latencyMs,
        source: current.source
      }
    ));

    try {
      const existing = inFlightByKey.get(key) as Promise<T> | undefined;
      const promise = existing ?? fetcherRef.current();
      if (!existing) {
        inFlightByKey.set(key, promise);
      }
      const data = await promise;
      const latencyMs = Math.round(performance.now() - startedAt);

      if (!mountedRef.current) {
        return;
      }

      setFailureCount(0);
      setResult(createServiceResult<T>(data, 'ready', {
        fetchedAt: Date.now(),
        latencyMs,
        source: existing ? 'cache' : 'network'
      }));
      recordTelemetry({ type: 'api', label: key, durationMs: latencyMs, status: existing ? 'deduped' : 'ok' });
    } catch (error) {
      const message = normalizeServiceError(error);
      const latencyMs = Math.round(performance.now() - startedAt);

      if (!mountedRef.current) {
        return;
      }

      setFailureCount((count) => count + 1);
      setResult(createServiceResult<T>(previous.data, previous.data ? 'stale' : 'error', {
        error: message,
        fetchedAt: previous.fetchedAt,
        latencyMs,
        source: previous.data ? 'stale-cache' : 'network'
      }));
      recordTelemetry({ type: previous.data ? 'stale' : 'error', label: key, durationMs: latencyMs, status: previous.data ? 'stale' : 'error', detail: message });
    } finally {
      if (inFlightByKey.get(key)) {
        inFlightByKey.delete(key);
      }
      if (mountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [enabled, key]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      return undefined;
    }

    let timeoutId: number | null = null;

    const schedule = () => {
      if (!mountedRef.current || !enabled) {
        return;
      }
      if (document.hidden) {
        timeoutId = window.setTimeout(schedule, Math.max(intervalMs, 60_000));
        return;
      }
      const delay = backoffDelay(intervalMs, failureCount);
      timeoutId = window.setTimeout(async () => {
        await refresh();
        schedule();
      }, delay);
    };

    if (runImmediately && resultRef.current.status === 'idle') {
      void refresh().finally(schedule);
    } else {
      schedule();
    }

    return () => {
      mountedRef.current = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [enabled, failureCount, intervalMs, refresh, runImmediately]);

  useEffect(() => {
    if (!result.fetchedAt || result.status !== 'ready') {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setResult((current) => {
        if (!current.fetchedAt || Date.now() - current.fetchedAt < staleAfterMs || current.status !== 'ready') {
          return current;
        }
        recordTelemetry({ type: 'stale', label: key, status: 'stale-after-timeout' });
        return createServiceResult(current.data, 'stale', {
          error: current.error,
          fetchedAt: current.fetchedAt,
          latencyMs: current.latencyMs,
          source: 'stale-cache'
        });
      });
    }, staleAfterMs);

    return () => window.clearTimeout(timeout);
  }, [key, result.fetchedAt, result.status, staleAfterMs]);

  return {
    ...result,
    refresh,
    isRefreshing,
    failureCount
  };
}
