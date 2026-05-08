import React from 'react';
import {
  ALPHA_ENGINE_HTTP_URL,
  HYPERLIQUID_GATEWAY_HTTP_URL,
  LEGACY_TRADING_HTTP_URL
} from '../../services/backendConfig';
import { hyperliquidService, type HyperliquidAppReadiness } from '../../services/hyperliquidService';
import { invalidateRequestCache, withRequestCache } from '../../services/requestCache';
import { useMarketPolling } from '../../hooks/useMarketPolling';

const BACKEND_HEALTH_TIMEOUT_MS = 6_000;

type ContractState = 'online' | 'offline' | 'mismatch';

interface BackendProbe {
  id: 'alpha' | 'gateway' | 'legacy';
  label: string;
  baseUrl: string;
  contractPath: string;
  optional?: boolean;
  validateContract: (payload: unknown) => boolean;
}

interface BackendProbeResult {
  state: ContractState;
  latencyMs: number | null;
  httpStatus: number | null;
  detail: string;
}

const probes: BackendProbe[] = [
  {
    id: 'alpha',
    label: 'Alpha VM',
    baseUrl: ALPHA_ENGINE_HTTP_URL,
    contractPath: '/status',
    validateContract: (payload) => {
      const engine = (payload as { engine?: unknown })?.engine;
      return typeof engine === 'string' && engine.includes('alpha-engine');
    }
  },
  {
    id: 'gateway',
    label: 'Gateway Local',
    baseUrl: HYPERLIQUID_GATEWAY_HTTP_URL,
    contractPath: '/api/hyperliquid/overview?limit=5',
    optional: true,
    validateContract: (payload) => Array.isArray((payload as { markets?: unknown })?.markets)
  },
  {
    id: 'legacy',
    label: 'Legacy',
    baseUrl: LEGACY_TRADING_HTTP_URL,
    contractPath: '/health',
    optional: true,
    validateContract: () => true
  }
];

const initialResults = Object.fromEntries(
  probes.map((probe) => [
    probe.id,
    {
      state: 'offline',
      latencyMs: null,
      httpStatus: null,
      detail: 'Not checked yet'
    } satisfies BackendProbeResult
  ])
) as Record<BackendProbe['id'], BackendProbeResult>;

async function probeBackend(probe: BackendProbe): Promise<BackendProbeResult> {
  const startedAt = performance.now();

  try {
    const response = await fetch(`${probe.baseUrl}${probe.contractPath}`, {
      method: 'GET',
      signal: AbortSignal.timeout(BACKEND_HEALTH_TIMEOUT_MS),
      headers: {
        Accept: 'application/json'
      }
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      return {
        state: response.status === 404 ? 'mismatch' : 'offline',
        latencyMs,
        httpStatus: response.status,
        detail: response.status === 404 ? `Missing ${probe.contractPath}` : `HTTP ${response.status}`
      };
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!probe.validateContract(payload)) {
      return {
        state: 'mismatch',
        latencyMs,
        httpStatus: response.status,
        detail: `Unexpected response for ${probe.contractPath}`
      };
    }

    return {
      state: 'online',
      latencyMs,
      httpStatus: response.status,
      detail: `OK ${probe.contractPath}`
    };
  } catch (error) {
    return {
      state: 'offline',
      latencyMs: Math.round(performance.now() - startedAt),
      httpStatus: null,
      detail: error instanceof Error ? error.message : 'Connection failed'
    };
  }
}

function resultTone(result: BackendProbeResult, optional?: boolean) {
  if (result.state === 'online') {
    return {
      background: 'rgba(34, 197, 94, 0.1)',
      border: 'rgba(34, 197, 94, 0.25)',
      color: '#22c55e',
      dot: '#22c55e'
    };
  }
  if (result.state === 'mismatch') {
    return {
      background: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.25)',
      color: '#fbbf24',
      dot: '#f59e0b'
    };
  }
  if (optional) {
    return {
      background: 'rgba(100, 116, 139, 0.12)',
      border: 'rgba(148, 163, 184, 0.22)',
      color: '#94a3b8',
      dot: '#64748b'
    };
  }
  return {
    background: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.25)',
    color: '#ef4444',
    dot: '#ef4444'
  };
}

function labelFor(result: BackendProbeResult, optional?: boolean): string {
  if (result.state === 'online') return 'on';
  if (result.state === 'mismatch') return 'contract';
  return optional ? 'off' : 'down';
}

function readinessTone(readiness: HyperliquidAppReadiness | null | undefined, fallback: BackendProbeResult) {
  if (!readiness) {
    return resultTone(fallback);
  }
  if (readiness.overallStatus === 'ready') {
    return {
      background: 'rgba(34, 197, 94, 0.1)',
      border: 'rgba(34, 197, 94, 0.25)',
      color: '#22c55e',
      dot: '#22c55e'
    };
  }
  if (readiness.overallStatus === 'blocked') {
    return {
      background: 'rgba(239, 68, 68, 0.1)',
      border: 'rgba(239, 68, 68, 0.25)',
      color: '#ef4444',
      dot: '#ef4444'
    };
  }
  return {
    background: 'rgba(245, 158, 11, 0.1)',
    border: 'rgba(245, 158, 11, 0.25)',
    color: '#fbbf24',
    dot: '#f59e0b'
  };
}

export const BackendStatus: React.FC = () => {
  const poll = useMarketPolling(
    'backend:status-pill',
    async () => {
      const entries = await Promise.all(probes.map(async (probe) => {
        const result = await withRequestCache(`backend:${probe.id}`, 4_000, () => probeBackend(probe));
        return [probe.id, result] as const;
      }));
      return Object.fromEntries(entries) as Record<BackendProbe['id'], BackendProbeResult>;
    },
    { intervalMs: 60_000, staleAfterMs: 90_000 }
  );
  const readinessPoll = useMarketPolling(
    'backend:status-readiness-pill',
    () => hyperliquidService.getAppReadiness(500),
    { intervalMs: 60_000, staleAfterMs: 90_000 }
  );

  const checkBackend = async (force = false) => {
    if (force) {
      probes.forEach((probe) => invalidateRequestCache(`backend:${probe.id}`));
    }
    await Promise.all([poll.refresh(), readinessPoll.refresh()]);
  };

  const results = poll.data || initialResults;
  const readiness = readinessPoll.data;
  const isChecking = poll.status === 'loading' || poll.isRefreshing || readinessPoll.status === 'loading' || readinessPoll.isRefreshing;

  const alpha = results.alpha;
  const gateway = results.gateway;
  const legacy = results.legacy;
  const tone = readinessTone(readiness, alpha);
  const probeTitle = probes.map((probe) => {
    const result = results[probe.id];
    const latency = result.latencyMs === null ? 'n/a' : `${result.latencyMs}ms`;
    return `${probe.label}: ${result.state} (${latency}) ${probe.baseUrl} - ${result.detail}`;
  }).join('\n');
  const readinessTitle = readiness
    ? `Readiness: ${readiness.overallStatus} (${readiness.summary.readyChecks} ready, ${readiness.summary.attentionChecks} attention, ${readiness.summary.blockedChecks} blocked)`
    : 'Readiness: not checked yet';
  const title = `${readinessTitle}\n${probeTitle}`;
  const readinessLabel = readiness?.overallStatus === 'ready'
    ? 'Ready'
    : readiness?.overallStatus === 'blocked'
      ? 'Block'
      : readiness
        ? 'Check'
        : 'Readiness';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        padding: '4px 10px',
        background: tone.background,
        borderRadius: '6px',
        border: `1px solid ${tone.border}`,
        fontSize: '10px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}
      onClick={() => void checkBackend(true)}
      title={title}
    >
      <div
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: isChecking ? '#f59e0b' : tone.dot,
          boxShadow: `0 0 8px ${isChecking ? 'rgba(245, 158, 11, 0.6)' : tone.background}`,
          animation: isChecking ? 'pulseGlow 1.5s ease-in-out infinite' : 'none'
        }}
      />
      <span style={{ color: isChecking ? '#fbbf24' : tone.color }}>
        {isChecking ? 'Checking' : readinessLabel}
      </span>
      <span style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
        VM {labelFor(alpha)}
      </span>
      <span style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
        H {labelFor(gateway, true)}
      </span>
      <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
        L {labelFor(legacy, true)}
      </span>
      <span style={{ color: 'rgba(255, 255, 255, 0.45)', textTransform: 'none', letterSpacing: 0 }}>
        {poll.status === 'stale' ? 'stale' : alpha.latencyMs === null ? 'n/a' : `${alpha.latencyMs}ms`}
      </span>
    </div>
  );
};
