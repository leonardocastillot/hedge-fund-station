# Pipeline 404 Stale Gateway Follow-Up

## Objective

Fix the `/strategies` Pipeline `404 Not Found` caused by a stale local
Hyperliquid gateway on `127.0.0.1:18001`.

## Scope

- Local Hyperliquid gateway process on `18001`.
- Strategy Pipeline API client and `/strategies` page.
- Local backend connectivity runbook and command surface.

## Changes Made

- Restarted the stale gateway and verified the current backend now exposes the
  strategy catalog and paper-candidate build routes.
- Added `npm run gateway:restart`, backed by
  `scripts/restart-hyperliquid-gateway.sh`, to stop the listener on `18001`
  and relaunch the gateway in a detached `screen` session.
- Set local restart defaults for `HYPERLIQUID_DATA_ROOT` and
  `HYPERLIQUID_DB_PATH` so macOS process mode does not try to write to `/data`.
- Hardened `hyperliquidService.getStrategyCatalog`: a 404 from
  `/api/hyperliquid/strategies/catalog` falls back to
  `/api/hyperliquid/strategy-audit`, normalizes missing pipeline gate fields,
  and returns a non-fatal warning.
- Updated `/strategies` to display the catalog fallback warning instead of
  failing the board.
- Documented the stale-gateway diagnosis and restart command in the backend
  connectivity runbook.

## Files Changed

- `src/services/hyperliquidService.ts`: catalog 404 fallback, HTTP status
  preservation, and fallback row normalization.
- `src/features/strategies/pages/StrategyLibraryPage.tsx`: visible warning for
  stale-gateway fallback mode.
- `scripts/restart-hyperliquid-gateway.sh`: stable local gateway restart
  helper.
- `package.json`: `gateway:restart` command.
- `docs/operations/backend-connectivity-runbook.md`: operational restart and
  endpoint verification notes.

## Verification

Commands run:

```bash
npm run gateway:restart
curl -fsS http://127.0.0.1:18001/api/hyperliquid/strategies/catalog?limit=500
curl -fsS http://127.0.0.1:18001/api/hyperliquid/strategy-audit?limit=20
curl -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:18001/api/hyperliquid/paper/candidates/build
npm run gateway:probe
npm run build
npm run agent:check
npm run hf:status
python3 -m unittest tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper
```

Result:

- passed
- `/api/hyperliquid/strategies/catalog?limit=500` returned HTTP 200.
- `/api/hyperliquid/strategy-audit?limit=20` returned HTTP 200.
- `/api/hyperliquid/paper/candidates/build` returned HTTP 422 for an empty
  body, confirming the route exists without creating a candidate.
- Browser smoke on `http://localhost:5173/strategies` showed the Strategy
  Pipeline board with no visible `MODULE ERROR`, `Not Found`, or fallback
  warning.

## Findings

- The React route and dynamic module were healthy; the 404 was the gateway API
  route.
- The running gateway was stale and still serving an older OpenAPI contract.
- A clean local restart initially failed because `polymarket_api.py` defaulted
  `HYPERLIQUID_DB_PATH` to `/data/hyperliquid.db`; the restart command now
  sets local data paths explicitly.

## Memory Updated

promoted: `docs/operations/backend-connectivity-runbook.md` now owns the
stale-gateway restart procedure.

## Assumptions

- No live trading, credential changes, or production promotion were in scope.
- Local dev process mode should write runtime state under
  `backend/hyperliquid_gateway/data` unless the operator sets explicit
  environment variables.

## Next Best Step

Review the Strategy Pipeline action buttons end-to-end from `/strategies` into
one blocked strategy and one paper candidate.
