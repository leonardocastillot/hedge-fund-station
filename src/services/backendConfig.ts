const DEFAULT_ALPHA_ENGINE_HTTP_URL = 'http://127.0.0.1:18500';
const DEFAULT_HYPERLIQUID_GATEWAY_HTTP_URL = 'http://127.0.0.1:18001';
const DEFAULT_LEGACY_HTTP_URL = 'http://127.0.0.1:18000';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function toWebSocketUrl(value: string): string {
  if (value.startsWith('https://')) {
    return `wss://${value.slice('https://'.length)}`;
  }
  if (value.startsWith('http://')) {
    return `ws://${value.slice('http://'.length)}`;
  }
  return value;
}

export const ALPHA_ENGINE_HTTP_URL = trimTrailingSlash(
  import.meta.env.VITE_ALPHA_ENGINE_API_URL ||
  import.meta.env.VITE_HYPERLIQUID_API_URL ||
  import.meta.env.VITE_API_URL ||
  DEFAULT_ALPHA_ENGINE_HTTP_URL
);

export const ALPHA_ENGINE_WS_URL = trimTrailingSlash(
  import.meta.env.VITE_ALPHA_ENGINE_WS_URL ||
  import.meta.env.VITE_HYPERLIQUID_WS_URL ||
  import.meta.env.VITE_WS_URL ||
  toWebSocketUrl(ALPHA_ENGINE_HTTP_URL)
);

export const HYPERLIQUID_GATEWAY_HTTP_URL = trimTrailingSlash(
  import.meta.env.VITE_HYPERLIQUID_GATEWAY_API_URL ||
  DEFAULT_HYPERLIQUID_GATEWAY_HTTP_URL
);

export const HYPERLIQUID_GATEWAY_WS_URL = trimTrailingSlash(
  import.meta.env.VITE_HYPERLIQUID_GATEWAY_WS_URL ||
  toWebSocketUrl(HYPERLIQUID_GATEWAY_HTTP_URL)
);

export const LEGACY_TRADING_HTTP_URL = trimTrailingSlash(
  import.meta.env.VITE_LEGACY_API_URL ||
  DEFAULT_LEGACY_HTTP_URL
);

// Compatibility aliases for older services. New code should pick the explicit
// backend contract above instead of treating every backend as one gateway.
export const GATEWAY_HTTP_URL = ALPHA_ENGINE_HTTP_URL;
export const GATEWAY_WS_URL = ALPHA_ENGINE_WS_URL;
