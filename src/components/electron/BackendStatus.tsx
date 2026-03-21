import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GATEWAY_HTTP_URL, LEGACY_TRADING_HTTP_URL } from '../../services/backendConfig';
import { withRequestCache, invalidateRequestCache } from '../../services/requestCache';
import { useVisibilityPolling } from '../../hooks/useVisibilityPolling';

const GATEWAY_HEALTH_CACHE_KEY = 'backend:gateway-health';
const LEGACY_HEALTH_CACHE_KEY = 'backend:legacy-health';
const BACKEND_HEALTH_TIMEOUT_MS = 12_000;

async function fetchHealth(baseUrl: string, cacheKey: string): Promise<boolean> {
  return withRequestCache(cacheKey, 4_000, async () => {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(BACKEND_HEALTH_TIMEOUT_MS)
    });

    return response.ok;
  });
}

export const BackendStatus: React.FC = () => {
  const [gatewayConnected, setGatewayConnected] = useState(false);
  const [legacyConnected, setLegacyConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const requestInFlightRef = useRef(false);

  const checkBackend = useCallback(async (force = false) => {
    if (requestInFlightRef.current) {
      return;
    }

    if (force) {
      invalidateRequestCache(GATEWAY_HEALTH_CACHE_KEY);
      invalidateRequestCache(LEGACY_HEALTH_CACHE_KEY);
    }

    requestInFlightRef.current = true;

    try {
      const [gatewayHealth, legacyHealth] = await Promise.allSettled([
        fetchHealth(GATEWAY_HTTP_URL, GATEWAY_HEALTH_CACHE_KEY),
        fetchHealth(LEGACY_TRADING_HTTP_URL, LEGACY_HEALTH_CACHE_KEY)
      ]);

      setGatewayConnected(gatewayHealth.status === 'fulfilled' ? gatewayHealth.value : false);
      setLegacyConnected(legacyHealth.status === 'fulfilled' ? legacyHealth.value : false);
    } finally {
      setIsChecking(false);
      requestInFlightRef.current = false;
    }
  }, []);

  useVisibilityPolling(() => checkBackend(false), 60_000);

  useEffect(() => {
    void checkBackend(false);
  }, [checkBackend]);

  const bothConnected = gatewayConnected && legacyConnected;
  const partiallyConnected = !bothConnected && (gatewayConnected || legacyConnected);
  const statusLabel = bothConnected ? 'Backends' : isChecking ? 'Checking' : partiallyConnected ? 'Partial' : 'Offline';
  const title = [
    `Gateway: ${gatewayConnected ? 'online' : 'offline'} (${GATEWAY_HTTP_URL})`,
    `Legacy: ${legacyConnected ? 'online' : 'offline'} (${LEGACY_TRADING_HTTP_URL})`
  ].join('\n');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        background: bothConnected
          ? 'rgba(34, 197, 94, 0.1)'
          : partiallyConnected
            ? 'rgba(59, 130, 246, 0.1)'
            : isChecking
              ? 'rgba(245, 158, 11, 0.1)'
              : 'rgba(239, 68, 68, 0.1)',
        borderRadius: '6px',
        border: `1px solid ${
          bothConnected
            ? 'rgba(34, 197, 94, 0.25)'
            : partiallyConnected
              ? 'rgba(59, 130, 246, 0.25)'
              : isChecking
                ? 'rgba(245, 158, 11, 0.25)'
                : 'rgba(239, 68, 68, 0.25)'
        }`,
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
          background: bothConnected
            ? '#22c55e'
            : partiallyConnected
              ? '#60a5fa'
              : isChecking
                ? '#f59e0b'
                : '#ef4444',
          boxShadow: bothConnected
            ? '0 0 8px rgba(34, 197, 94, 0.6)'
            : partiallyConnected
              ? '0 0 8px rgba(96, 165, 250, 0.6)'
              : isChecking
                ? '0 0 8px rgba(245, 158, 11, 0.6)'
                : '0 0 8px rgba(239, 68, 68, 0.6)',
          animation: isChecking ? 'pulseGlow 1.5s ease-in-out infinite' : 'none'
        }}
      />
      <span
        style={{
          color: bothConnected
            ? '#22c55e'
            : partiallyConnected
              ? '#93c5fd'
              : isChecking
                ? '#fbbf24'
                : '#ef4444'
        }}
      >
        {statusLabel}
      </span>
      <span style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
        {gatewayConnected ? 'G' : '-'} / {legacyConnected ? 'L' : '-'}
      </span>
    </div>
  );
};
