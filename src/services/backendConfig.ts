const DEFAULT_GATEWAY_HTTP_URL = 'http://127.0.0.1:18001';
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

export const GATEWAY_HTTP_URL = trimTrailingSlash(
  import.meta.env.VITE_HYPERLIQUID_API_URL ||
  import.meta.env.VITE_API_URL ||
  DEFAULT_GATEWAY_HTTP_URL
);

export const GATEWAY_WS_URL = trimTrailingSlash(
  import.meta.env.VITE_HYPERLIQUID_WS_URL ||
  import.meta.env.VITE_WS_URL ||
  toWebSocketUrl(GATEWAY_HTTP_URL)
);

export const LEGACY_TRADING_HTTP_URL = trimTrailingSlash(
  import.meta.env.VITE_LEGACY_API_URL ||
  DEFAULT_LEGACY_HTTP_URL
);
