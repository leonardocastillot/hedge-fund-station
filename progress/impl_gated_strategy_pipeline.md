# Gated Strategy Pipeline Implementation

## Objective

Make strategy promotion behave like a hedge-fund filtering pipeline:
Research -> Backtesting -> Audit -> Paper, with failed gates staying Blocked.

## Scope

- Backend evidence aggregation and Hyperliquid strategy APIs.
- Strategy pipeline, audit focus, strategy detail, and station navigation UI.
- Strategy catalog tests and stable harness/build verification.

## Changes Made

- Added backend-derived `pipelineStage`, `gateStatus`, `gateReasons`, and
  `nextAction` fields to strategy evidence rows and catalog cards.
- Added one backend gate helper so audit eligibility is derived from robust
  backtest evidence and validation artifacts, not frontend ranking logic.
- Added an explicit paper candidate build endpoint that requires a
  `ready-for-paper` validation artifact.
- Refactored `/strategies` into the main Strategy Pipeline board with columns
  for Research, Backtesting, Audit, Paper, and Blocked.
- Kept `/strategy-audit` as an audit-focused compatibility surface filtered to
  the Audit pipeline stage by default.
- Changed backtest actions to run validation without creating paper candidates.
- Removed the misleading `runAllBacktests` fallback that seeded paper signals.
- Added a one-shot retry/reload path for stale dynamic import failures so a
  fixed Vite module does not leave the app stuck on `Module Error`.

## Files Changed

- `backend/hyperliquid_gateway/app.py`: pipeline gate derivation, catalog API
  fields, paper candidate endpoint, safer backtest defaults.
- `src/services/hyperliquidService.ts`: pipeline API types and paper candidate
  client method.
- `src/features/strategies/pages/StrategyLibraryPage.tsx`: new pipeline board.
- `src/features/strategies/pages/StrategyAuditPage.tsx`: audit-focused view and
  locked audit action.
- `src/features/strategies/pages/StrategyDetailPage.tsx`: backtest no longer
  builds paper candidates.
- `src/services/strategyService.ts`: backend-only strategy library and real
  backend run-all backtests.
- `src/features/stations/pages/HedgeFundStationPage.tsx` and
  `src/features/cockpit/WidgetPanel.tsx`: pipeline naming and gate counts.
- `src/features/cockpit/WidgetPanel.tsx`: dynamic-import error retry UI.
- `tests/test_strategy_catalog.py`: focused pipeline gate derivation tests.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper
npm run hf:status
npm run build
curl -sS -o /dev/null -w 'strategy_module_http=%{http_code} total=%{time_total}s\n' --max-time 10 'http://localhost:5173/src/features/strategies/pages/StrategyLibraryPage.tsx?t=1778087551289'
```

Result:

- passed: harness check
- passed: 20 focused backend tests
- passed: `hf:status`
- passed: Electron/Vite production build
- passed: dev server returns HTTP 200 for `StrategyLibraryPage.tsx`

## Findings

- The old UI mixed backend catalog, alpha, legacy, and live gateway fallback
  opportunities inside one strategy ranking surface. That made promotion status
  feel arbitrary.
- The old detail action could build a paper candidate as part of running a
  backtest. That now stays separate behind the paper gate.
- Runtime setups still exist in backend audit evidence, but the strategy catalog
  and main pipeline keep runtime rows out of promotion.

## Memory Updated

Intentionally unchanged: this work implemented an explicit product contract
already covered by the existing architecture and product objective docs.

## Assumptions

- A strategy passes backtesting only when the latest backend robust assessment
  has `status: "passes"`.
- `ready-for-paper` validation or existing paper candidate/runtime evidence
  moves a strategy into Paper.
- No live trading, credentials, production promotion, or artifact deletion was
  in scope.

## Next Best Step

Run the app against the live/tunneled Hyperliquid gateway and visually smoke
test `/strategies`, `/strategy-audit`, and one strategy detail action path.
