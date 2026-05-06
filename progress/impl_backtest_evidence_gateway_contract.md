# Backtest Evidence Gateway Contract Fix

## Objective

Make strategy detail pages show inspectable backend backtest trades from the
same Hyperliquid gateway that powers the Strategy Pipeline.

## Scope

- Strategy detail evidence loading for Hyperliquid strategies.
- Hyperliquid service backtest endpoints.
- Local browser verification on `/strategy/bb_squeeze_adx/paper`.

## Changes Made

- Fixed the frontend Hyperliquid service so backtest evidence/actions use the
  local Hyperliquid gateway contract on `127.0.0.1:18001`.
- This keeps `getLatestBacktest`, `ensureBacktest`, `runBacktest`,
  `runAllBacktests`, and `buildPaperCandidate` aligned with the backend catalog
  and artifact source of truth.
- Verified `bb_squeeze_adx` latest backtest artifact loads from the gateway with
  203 trades.

## Files Changed

- `src/services/hyperliquidService.ts`: uses
  `HYPERLIQUID_GATEWAY_HTTP_URL` for Hyperliquid backtest and paper-candidate
  operations instead of the alpha engine URL.
- `progress/current.md`: session state updated with root cause and verification.

## Verification

Commands run:

```bash
curl -fsS http://127.0.0.1:18001/api/hyperliquid/backtests/bb_squeeze_adx/latest
npm run build
python3 -m unittest tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper
npm run gateway:probe
npm run hf:status
npm run agent:check
```

Browser smoke:

```text
http://localhost:5173/strategy/bb_squeeze_adx/paper
```

Result:

- passed
- `bb_squeeze_adx` detail showed `Trades Ledger`, `203 expected`, and
  `backtest loaded`.
- The previous `Strategy bb_squeeze_adx is not registered for backtesting`
  message was absent.
- Local dev server is listening on `5173`; Hyperliquid gateway is listening on
  `18001`.

## Findings

- The Pipeline catalog and artifacts came from the local Hyperliquid gateway,
  but the Strategy Detail page was asking the alpha engine for backtest
  artifacts.
- The alpha engine returned not found/not registered for this strategy, while
  the local gateway had the actual artifact and trades.

## Memory Updated

intentionally unchanged: this is a local contract bug fixed in source and
handoff; no broader durable memory entry is needed beyond the existing backend
connectivity runbook.

## Assumptions

- Hyperliquid strategy artifacts should be read from the local gateway contract
  that powers `/api/hyperliquid/strategies/catalog`.
- No live trading, credential changes, or production promotion were in scope.

## Next Best Step

Add a compact artifact selector to Strategy Detail so old smoke reports and new
full backtests can be compared without leaving the app.
