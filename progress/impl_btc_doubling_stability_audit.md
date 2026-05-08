# BTC Doubling Stability Audit

## Objective

Add a stable command and UI-visible artifact for testing whether the fastest BTC doubling estimate is distributed across the matched backtest window.

## Scope

- `backend/hyperliquid_gateway/backtesting/`
- `backend/hyperliquid_gateway/cli.py`
- `backend/hyperliquid_gateway/app.py`
- `src/services/hyperliquidService.ts`
- `src/features/strategies/pages/StrategyDetailPage.tsx`
- `tests/`
- `agent_tasks.json`, `package.json`, `progress/`

## Changes Made

- Added a doubling stability audit builder that splits the backtest dataset window into subwindows and reports return, trade count, win rate, profit factor, projected days to double, concentration, blockers, and status.
- Added `npm run hf:doubling:stability -- --strategy <strategy_id>` through the stable `hf` CLI.
- Generated a BTC audit artifact:
  `backend/hyperliquid_gateway/data/audits/btc_failed_impulse_reversal-doubling-stability-20260506T230254Z.json`.
- Surfaced latest doubling stability status and artifact path in the backend catalog and Strategy Detail artifacts.
- Added focused tests for stable versus concentrated subwindow distributions and catalog serialization.

## Files Changed

- `backend/hyperliquid_gateway/backtesting/doubling.py` - doubling estimate, paper baseline/readiness, and new stability audit math.
- `backend/hyperliquid_gateway/backtesting/workflow.py` - writes `doubling_stability_audit` artifacts.
- `backend/hyperliquid_gateway/cli.py` - adds the `doubling-stability` command.
- `package.json` - adds `hf:doubling:stability`.
- `backend/hyperliquid_gateway/app.py` - includes latest stability audit summary and path in strategy catalog rows.
- `src/services/hyperliquidService.ts` - adds stability types and normalization.
- `src/features/strategies/pages/StrategyDetailPage.tsx` - shows stability status and artifact path.
- `tests/test_strategy_catalog.py` - covers audit concentration and catalog fields.

## Verification

Commands run:

```bash
python3 -m unittest tests.test_strategy_catalog tests.test_btc_failed_impulse_reversal
npm run hf:doubling:stability -- --strategy btc_failed_impulse_reversal
npm run build
npm run gateway:restart
npm run gateway:probe
npm run hf:paper:supervisor -- status
npm run agent:check
```

Result:

- passed
- Catalog smoke confirmed `btc_failed_impulse_reversal` exposes `doublingStability.status=fragile` and the generated audit path.
- Supervisor smoke confirmed the paper-only loop is still running in `screen_session=btc-paper-runtime-loop`, `dryRun=false`.
- Supervisor endpoint smoke reported `healthStatus=healthy`, no blockers, and latest tick `managing-open-trade`.
- Final harness check passed with 16 tasks and 0 warnings.

## Findings

- The doubling estimate remains a research/backtest candidate, but the stability audit marks it `fragile`.
- All three subwindows were positive, with 3 trades per slice.
- The first slice contributed 56.6% of net PnL, tripping the `return_concentration` blocker.
- The generated audit should be treated as a warning against over-trusting the 211 day projected doubling estimate until paper evidence and more history reduce concentration risk.

## Memory Updated

- intentionally unchanged: this task generated an inspectable artifact and handoff, but did not create a durable operating rule beyond the existing promotion gates.

## Assumptions

- The latest matched BTC backtest and validation artifacts are the correct inputs for this audit.
- Three equal time slices are enough for this first stability screen; more regimes/history should be added before any production review.
- The existing paper runtime stays paper-only and does not change production/live routing.

## Next Best Step

Let the running paper loop collect closed trades, then compare paper trade distribution against this fragile backtest baseline before improving sizing or trigger aggressiveness.
