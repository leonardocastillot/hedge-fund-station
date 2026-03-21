# Backend Runtime Contract

## Runtime topology

This app currently depends on two backend services with different responsibilities:

- `backend/hyperliquid_gateway/`
  - host URL: `http://127.0.0.1:18001`
  - Docker map: host `18001` -> container `18400`
  - owns live market overview, liquidations, polymarket, paper signals, paper trades, session analytics
- `C:\Users\leonard\Documents\trading\backend`
  - host URL: `http://127.0.0.1:18000`
  - Docker map: host `18000` -> container `8000`
  - owns economic calendar scraping, legacy strategy cache, backtest history, portfolio deployments

## Feature ownership

- Dashboard / Hyperliquid views / liquidations:
  - primary service: Hyperliquid gateway
- Economic calendar:
  - primary service: legacy trading backend
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

## Rules for agents

- Do not collapse both backends into one mental model.
- Do not point every page at `18001` just because it is the backend inside this repo.
- Do not point new UI at `localhost:8000`; use the explicit host ports `18000` and `18001`.
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
