# Backend Runtime Contract

## Runtime topology

This app currently depends on two backend services with different responsibilities:

- `backend/hyperliquid_gateway/`
  - app-facing URL: `http://127.0.0.1:18500`
  - Docker direct map: host `18001` -> container `18400`
  - tunnel/process tooling may bridge `18500` to the active gateway runtime
  - owns live market overview, liquidations, polymarket, paper signals, paper trades, session analytics, macro calendar, macro news, bank holidays, and weekly macro briefs
- legacy trading backend
  - host URL: `http://127.0.0.1:18000`
  - Docker map: host `18000` -> container `8000`
  - owns economic calendar scraping, legacy strategy cache, backtest history, portfolio deployments

## Feature ownership

- Dashboard / Hyperliquid views / liquidations:
  - primary service: Hyperliquid gateway
- Economic calendar:
  - primary service: Hyperliquid gateway / alpha engine at `http://127.0.0.1:18500`
  - source: Forex Factory weekly JSON when available
  - fallback: deterministic macro risk markers with an explicit warning when Forex Factory is rate-limited or unavailable
- Strategy library:
  - primary service: legacy trading backend
  - fallback: Hyperliquid gateway market overview
- Strategy detail:
  - primary service: legacy backtest history
  - fallback: Hyperliquid gateway market detail
- Portfolio:
  - primary service: legacy portfolio endpoints
  - supplemental telemetry: Hyperliquid gateway paper trades and session analytics

## Source of truth in this repo

- frontend backend URLs: `src/services/backendConfig.ts`
- Hyperliquid runtime: `docker-compose.yml`
- Hyperliquid implementation: `backend/hyperliquid_gateway/app.py`
- legacy runtime bootstrap: `electron/main/index.ts`
- backend status indicator: `src/components/electron/BackendStatus.tsx`
- port and environment convention: `docs/project-architecture.md`
- macro intelligence provider logic: `backend/hyperliquid_gateway/macro_intelligence.py`

## Rules for agents

- Do not collapse both backends into one mental model.
- Do not point every page at `18001` just because Docker exposes the gateway there.
- Do not point new UI at `localhost:8000`; use the explicit app-facing ports
  `18500` for the Hyperliquid gateway and `18000` for the legacy backend.
- Do not treat an empty macro calendar as low risk when the payload includes a
  provider warning. Forex Factory can rate-limit VM traffic; the fallback is a
  risk marker, not scheduled release data.
- If a feature still belongs to the legacy backend, either:
  1. keep the contract explicit, or
  2. migrate the capability into `backend/hyperliquid_gateway/` and then switch the UI.

## Migration standard

If a legacy capability is moved into this repo, complete all of these steps:

1. add the backend endpoint in `backend/hyperliquid_gateway/`
2. move or re-implement the data pipeline
3. update `src/services/` to target the new owner
4. update this contract and the README
5. remove the old fallback only after runtime validation
