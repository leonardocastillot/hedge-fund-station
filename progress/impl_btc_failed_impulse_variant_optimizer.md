# BTC Failed Impulse Variant Optimizer

## Objective

Compare BTC Failed Impulse Reversal parameter variants to find a faster credible capital-doubling candidate without changing the running paper strategy.

## Scope

- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/`
- `backend/hyperliquid_gateway/backtesting/`
- `backend/hyperliquid_gateway/cli.py`
- `backend/hyperliquid_gateway/app.py`
- `src/services/hyperliquidService.ts`
- `src/features/strategies/pages/StrategyDetailPage.tsx`
- `tests/`
- `agent_tasks.json`, `package.json`, `progress/`

## Changes Made

- Added explicit research variant parameters for BTC Failed Impulse signal and risk settings while preserving default behavior.
- Added `run_backtest_with_params` for research-only variant replay.
- Added a BTC optimizer report builder that ranks variants by local validation status, doubling estimate, stability, and concentration.
- Added stable command `npm run hf:btc:optimize -- --strategy btc_failed_impulse_reversal`.
- Surfaced latest optimizer status, top variant, and artifact path in the strategy catalog and Strategy Detail artifacts.

## Files Changed

- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/logic.py` - parameterized signal thresholds with defaults unchanged.
- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/risk.py` - parameterized risk settings with defaults unchanged.
- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/backtest.py` - added variant backtest execution.
- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/optimizer.py` - added optimizer grid, ranking, and artifact payload.
- `backend/hyperliquid_gateway/backtesting/workflow.py` - writes optimizer audit artifacts.
- `backend/hyperliquid_gateway/cli.py` and `package.json` - added the stable command.
- `backend/hyperliquid_gateway/app.py`, `src/services/hyperliquidService.ts`, `src/features/strategies/pages/StrategyDetailPage.tsx` - made optimizer evidence visible.
- `tests/test_btc_failed_impulse_reversal.py`, `tests/test_strategy_catalog.py` - added regression coverage.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_btc_failed_impulse_reversal tests.test_strategy_catalog
npm run hf:btc:optimize -- --strategy btc_failed_impulse_reversal
npm run build
npm run gateway:restart
npm run gateway:probe
npm run hf:paper:supervisor -- status
npm run agent:check
```

Result:

- passed
- Generated artifact:
  `backend/hyperliquid_gateway/data/audits/btc_failed_impulse_reversal-variant-optimizer-20260506T231057Z.json`.
- Catalog smoke confirmed `btcOptimization.status=stable-candidate-found` and the optimizer artifact path are exposed for `btc_failed_impulse_reversal`.
- Supervisor smoke confirmed the existing paper-only loop is still running with `screen_session=btc-paper-runtime-loop`, `dryRun=false`.
- Supervisor endpoint smoke reported `healthStatus=healthy`, no blockers, and latest tick `managing-open-trade`.
- Final harness check passed with 17 tasks and 0 warnings.

## Findings

- The optimizer tested 20 variants.
- One stable candidate was found: `default_signal__balanced_fast`.
- Top stable candidate:
  - return: 0.54%
  - trades: 12
  - win rate: 58.33%
  - profit factor: 3.27
  - max drawdown: 0.11%
  - projected days to double: 385.8
  - stability: stable
  - largest positive slice PnL share: 43.77%
- The previous faster default-style configuration remains less credible: in the latest rolling window the default ranks 5th, projects 242.6 days to double, but is blocked by robust exit-reason concentration and fragile stability.

## Memory Updated

- intentionally unchanged: optimizer evidence is captured in the artifact and handoff; no durable policy change was needed.

## Assumptions

- The local Hyperliquid snapshot DB and trailing 3-day BTC window are the correct comparison surface for this iteration.
- Optimizer-local validation is not a promotion gate; any chosen variant still needs a registered backtest, validation artifact, paper sample, risk review, and operator sign-off.
- The running paper loop should stay on the registered default strategy until a human explicitly approves a variant promotion task.

## Next Best Step

Convert `default_signal__balanced_fast` into a named research variant or candidate strategy package, then run the normal backtest, validation, paper baseline, and paper-readiness workflow against it.
