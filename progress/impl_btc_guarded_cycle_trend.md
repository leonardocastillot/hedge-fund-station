# BTC Guarded Cycle Trend Handoff

## Objective

Implement a new backend-first BTC strategy that reaches at least `50%` net
return in official backtesting, reaches paper candidate only after validation,
and verifies paper runtime with a dry-run tick only.

## Changes Made

- Added strategy ID `btc_guarded_cycle_trend`.
- Added backend strategy package with deterministic daily logic, scoring, risk,
  backtest, paper candidate, runtime planning, and mirrored backend spec.
- Registered the strategy with BTC daily history as the default dataset and
  validation gates: 10 trades, 50% net return, 2.0 profit factor, 40% win rate,
  and 25% max drawdown.
- Extended the paper runtime tick endpoint to dispatch this strategy using the
  BTC daily cache while preserving the existing BTC Failed Impulse runtime.
- Added docs rows for validation thresholds, readiness matrix, and paper review
  criteria.
- Added focused unit tests for signal rules, exits, backtest behavior,
  registration, paper candidate blocking, and dry-run runtime safety.

## Important Files

- `docs/strategies/btc-guarded-cycle-trend.md`
- `backend/hyperliquid_gateway/strategies/btc_guarded_cycle_trend/`
- `backend/hyperliquid_gateway/backtesting/registry.py`
- `backend/hyperliquid_gateway/app.py`
- `tests/test_btc_guarded_cycle_trend.py`

## Generated Evidence

- Backtest:
  `backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T171411Z.json`
  - return: `89.53%`
  - trades: `48`
  - win rate: `41.67%`
  - profit factor: `2.93`
  - max drawdown: `8.79%`
  - robust status: `passes`
- Validation:
  `backend/hyperliquid_gateway/data/validations/btc_guarded_cycle_trend-20260513T171421Z.json`
  - status: `ready-for-paper`
  - blockers: none
- Paper candidate:
  `backend/hyperliquid_gateway/data/paper/btc_guarded_cycle_trend-20260513T171426Z.json`
  - promotion gate: `eligible-for-paper-review`
- Doubling stability:
  `backend/hyperliquid_gateway/data/audits/btc_guarded_cycle_trend-doubling-stability-20260513T171436Z.json`
  - status: `stable`
  - positive slice ratio: `100%`
  - largest positive slice PnL share: `48.69%`
- Dry-run paper loop:
  - status: `flat-no-signal`
  - dry run: `true`
  - opened trade: none
  - history points: `4257`

## Verification

Passed:

```bash
rtk npm run agent:check
rtk npm run hf:market-data:btc-daily -- --start 2014-09-17 --force
rtk python3 -m unittest tests.test_btc_guarded_cycle_trend
rtk python3 -m py_compile backend/hyperliquid_gateway/strategies/btc_guarded_cycle_trend/logic.py backend/hyperliquid_gateway/strategies/btc_guarded_cycle_trend/backtest.py backend/hyperliquid_gateway/strategies/btc_guarded_cycle_trend/paper.py backend/hyperliquid_gateway/app.py backend/hyperliquid_gateway/backtesting/registry.py
rtk python3 -m unittest tests.test_strategy_catalog tests.test_one_bitcoin tests.test_btc_guarded_cycle_trend
rtk npm run hf:backtest -- --strategy btc_guarded_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.10
rtk npm run hf:validate -- --strategy btc_guarded_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T171411Z.json
rtk npm run hf:paper -- --strategy btc_guarded_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T171411Z.json --validation backend/hyperliquid_gateway/data/validations/btc_guarded_cycle_trend-20260513T171421Z.json
rtk npm run hf:doubling:stability -- --strategy btc_guarded_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T171411Z.json --validation backend/hyperliquid_gateway/data/validations/btc_guarded_cycle_trend-20260513T171421Z.json
rtk npm run hf:paper:supervisor -- status
rtk npm run gateway:restart
rtk npm run hf:paper:loop -- --strategy btc_guarded_cycle_trend --dry-run --max-ticks 1 --interval-seconds 1
rtk npm run hf:status
rtk npm run gateway:probe
rtk npm run build
```

Final `agent:check` and `git diff --check` should be run after this handoff is
written.

## Risks And Notes

- This reached paper candidate, not production. Live remains blocked.
- Paper runtime was verified only in dry-run mode by operator choice; no
  non-dry-run supervisor was started or replaced.
- Current dry-run signal is `none`, so paper collection would wait for the next
  guarded daily uptrend signal.
- The strategy is daily BTC history based; it should not be used as an intraday
  scalp or order-flow strategy.
- Dominant exit PnL is concentrated in trailing exits by design. The robust gate
  tracks largest-trade concentration, and the stability audit passed, but future
  review should still compare paper drift against the long-window backtest.

## Memory

Intentionally unchanged. The durable lesson is captured in the strategy doc,
validation thresholds, paper artifact, stability audit, and this handoff.

## Next Best Step

If the operator wants active paper collection later, start a non-dry-run loop
only when they choose to replace or separately supervise the current BTC paper
runtime. Until then, inspect the paper candidate and wait for a dry-run signal
to move from `flat-no-signal` to `entry-ready`.
