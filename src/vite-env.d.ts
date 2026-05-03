/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALPHA_ENGINE_API_URL: string
  readonly VITE_ALPHA_ENGINE_WS_URL: string
  readonly VITE_HYPERLIQUID_GATEWAY_API_URL: string
  readonly VITE_HYPERLIQUID_GATEWAY_WS_URL: string
  readonly VITE_HYPERLIQUID_API_URL: string
  readonly VITE_HYPERLIQUID_WS_URL: string
  readonly VITE_LEGACY_API_URL: string
  readonly VITE_POLYMARKET_API_URL: string
  readonly VITE_POLYMARKET_BACKEND_URL: string
  readonly VITE_API_URL: string
  readonly VITE_WS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
