# Implementation Report: dual_hyperliquid_strategy_candidates

## Objective

Create two backend-first Hyperliquid strategy candidates in parallel-style
workstreams, with specs, backend mapping, initial validation, risks, costs,
failure modes, and handoffs.

## Scope

- `breakout_oi_confirmation`
- `liquidation_pressure_flip_reversal`
- strategy registry and validation thresholds
- readiness matrix and harness task state

## Changes Made

- Added two full backend strategy packages with deterministic `logic.py`,
  `scoring.py`, `risk.py`, `paper.py`, `backtest.py`, `spec.md`, and package
  init files.
- Added public strategy docs under `docs/strategies/`.
- Registered both strategies in `backend/hyperliquid_gateway/backtesting/registry.py`.
- Added validation thresholds to `docs/operations/strategy-validation-thresholds.md`
  and readiness rows to `docs/operations/strategy-readiness-matrix.md`.
- Added focused unit tests for both strategies.
- Added initial backtest artifacts and generated validation reports; both are
  blocked and not paper/live candidates.

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk python3 -m unittest tests.test_strategy_catalog
rtk python3 -m unittest tests.test_breakout_oi_confirmation tests.test_liquidation_pressure_flip_reversal
rtk npm run hf:backtest -- --strategy breakout_oi_confirmation --symbols BTC,SOL,HYPE --lookback-days 30 --output backend/hyperliquid_gateway/data/backtests/breakout_oi_confirmation-initial.json
rtk npm run hf:backtest -- --strategy liquidation_pressure_flip_reversal --symbols BTC,SOL,HYPE --lookback-days 30 --output backend/hyperliquid_gateway/data/backtests/liquidation_pressure_flip_reversal-initial.json
rtk npm run hf:validate -- --strategy breakout_oi_confirmation --report backend/hyperliquid_gateway/data/backtests/breakout_oi_confirmation-initial.json
rtk npm run hf:validate -- --strategy liquidation_pressure_flip_reversal --report backend/hyperliquid_gateway/data/backtests/liquidation_pressure_flip_reversal-initial.json
rtk npm run build
rtk npm run hf:status
rtk git diff --check
rtk python3 -m py_compile backend/hyperliquid_gateway/strategies/breakout_oi_confirmation/*.py backend/hyperliquid_gateway/strategies/liquidation_pressure_flip_reversal/*.py backend/hyperliquid_gateway/backtesting/registry.py
```

Result:

- harness, strategy catalog tests, new strategy tests, build, status, diff
  check, JSON parse, and Python compile passed
- `hf:validate` exited non-zero for both strategies because validation is
  blocked; this is expected evidence, not hidden failure

## Findings

- `breakout_oi_confirmation`: 52 trades, -0.10% return, 13.46% win rate,
  profit factor 0.27, blocked by return/profit/win-rate/robust gates.
- `liquidation_pressure_flip_reversal`: 2 trades, -0.01% return, 0.00% win
  rate, profit factor 0.00, blocked by sample size and profitability gates.
- Both packages are now visible in `hf:status` as registered strategies with
  validation-blocked promotion stage.

## Memory Updated

Intentionally unchanged: strategy docs, backend modules, generated evidence, and
progress reports are the right artifact layer for this work.

## Assumptions

- V1 uses existing `market_snapshots` only.
- Paper runtime loops, live trading, credentials, and production promotion stay
  out of scope.
- Passing future validation only permits paper review, not live execution.

## Next Best Step

Retune or reject `breakout_oi_confirmation` first because it has enough sample
to diagnose; defer `liquidation_pressure_flip_reversal` until liquidation
estimate coverage is audited.
