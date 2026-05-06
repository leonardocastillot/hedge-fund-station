type CacheEntry<T> = {
  expiresAt: number;
  fetchedAt?: number;
  latencyMs?: number;
  promise?: Promise<T>;
  value?: T;
};

const requestCache = new Map<string, CacheEntry<unknown>>();

export type ServiceStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error';
export type ServiceResultSource = 'network' | 'cache' | 'stale-cache';

export interface ServiceResult<T> {
  data: T | null;
  status: ServiceStatus;
  error: string | null;
  fetchedAt: number | null;
  latencyMs: number | null;
  source: ServiceResultSource;
}

export interface RequestCacheMetadata {
  key: string;
  fetchedAt: number | null;
  latencyMs: number | null;
  expiresAt: number | null;
  hasValue: boolean;
  inFlight: boolean;
}

export async function withRequestCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = requestCache.get(key) as CacheEntry<T> | undefined;

  if (cached?.value !== undefined && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const startedAt = performance.now();
  const promise = fetcher()
    .then((value) => {
      requestCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
        fetchedAt: Date.now(),
        latencyMs: Math.round(performance.now() - startedAt)
      });
      return value;
    })
    .catch((error) => {
      requestCache.delete(key);
      throw error;
    });

  requestCache.set(key, {
    expiresAt: now + ttlMs,
    fetchedAt: cached?.fetchedAt,
    latencyMs: cached?.latencyMs,
    promise
  });

  return promise;
}

export function getRequestCacheMetadata(key: string): RequestCacheMetadata | null {
  const cached = requestCache.get(key);
  if (!cached) {
    return null;
  }

  return {
    key,
    fetchedAt: cached.fetchedAt ?? null,
    latencyMs: cached.latencyMs ?? null,
    expiresAt: cached.expiresAt ?? null,
    hasValue: cached.value !== undefined,
    inFlight: Boolean(cached.promise)
  };
}

export function normalizeServiceError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Request failed.';
}

export function createServiceResult<T>(
  data: T | null,
  status: ServiceStatus,
  options: Partial<Omit<ServiceResult<T>, 'data' | 'status'>> = {}
): ServiceResult<T> {
  return {
    data,
    status,
    error: options.error ?? null,
    fetchedAt: options.fetchedAt ?? null,
    latencyMs: options.latencyMs ?? null,
    source: options.source ?? 'network'
  };
}

export function invalidateRequestCache(prefix?: string): void {
  if (!prefix) {
    requestCache.clear();
    return;
  }

  for (const key of requestCache.keys()) {
    if (key.startsWith(prefix)) {
      requestCache.delete(key);
    }
  }
}
