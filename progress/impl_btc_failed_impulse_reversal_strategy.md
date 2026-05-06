# BTC Failed Impulse Reversal Strategy Implementation

## Objective

Find the best current Bitcoin strategy candidate in the local backtesting stack,
implement it backend-first, validate it, and create a paper candidate only if
the gates pass.

## Scope

- `docs/strategies/`
- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/`
- `backend/hyperliquid_gateway/backtesting/registry.py`
- `backend/hyperliquid_gateway/data/backtests/`
- `backend/hyperliquid_gateway/data/validations/`
- `backend/hyperliquid_gateway/data/paper/`
- `tests/`
- `agent_tasks.json`
- `progress/`

## Changes Made

- Compared registered Hyperliquid BTC strategies on the current local
  three-day BTC snapshot window; all existing registered BTC candidates were
  negative after taker fees.
- Added `docs/strategies/btc-failed-impulse-reversal.md` with hypothesis,
  regimes, inputs, entry, invalidation, exit, risk, costs, validation, and
  failure modes.
- Added backend package `btc_failed_impulse_reversal` with deterministic signal
  logic, scoring, risk sizing/cooldown, paper candidate payload, and SQLite
  snapshot replay.
- Registered `btc_failed_impulse_reversal` in the backtesting registry with
  validation policy:
  - min trades: 8
  - min return: 0.50%
  - min profit factor: 1.50
  - min win rate: 55.0%
  - max drawdown: 4.0%
- Added focused unit tests for long/short/no-trade signal behavior, scoring,
  risk blocks, default BTC loader behavior, synthetic backtest trade generation,
  and registry visibility.

## Files Changed

- `docs/strategies/btc-failed-impulse-reversal.md`: strategy research/spec.
- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/`:
  backend implementation.
- `backend/hyperliquid_gateway/backtesting/registry.py`: strategy registration.
- `tests/test_btc_failed_impulse_reversal.py`: focused strategy tests.
- `agent_tasks.json`, `progress/current.md`: file harness state.

## Verification

Commands run:

```bash
npm run agent:check
npm run hf:status
npm run hf:backtest -- --strategy btc_crowding_scalper --symbol BTC --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy short_squeeze_continuation --symbol BTC --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy funding_exhaustion_snap --symbol BTC --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy oi_expansion_failure_fade --symbol BTC --fee-model taker --lookback-days 3
python3 -m unittest tests.test_btc_failed_impulse_reversal
python3 -m unittest tests.test_backtest_filters tests.test_backtest_fees_and_scalper tests.test_strategy_catalog tests.test_btc_failed_impulse_reversal
npm run hf:backtest -- --strategy btc_failed_impulse_reversal --symbol BTC --fee-model taker --lookback-days 3
npm run hf:validate -- --strategy btc_failed_impulse_reversal --report backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260506T165516Z.json
npm run hf:paper -- --strategy btc_failed_impulse_reversal --report backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260506T165516Z.json --validation backend/hyperliquid_gateway/data/validations/btc_failed_impulse_reversal-20260506T165520Z.json
npm run hf:backtest -- --strategy btc_failed_impulse_reversal --symbol BTC --fee-model taker
```

Results:

- `npm run agent:check`: passed.
- Unit suite: passed, 21 tests.
- Registered BTC strategy comparison, taker-fee, three-day BTC window:
  - `btc_crowding_scalper`: -0.08%, 83 trades, profit factor 0.16.
  - `short_squeeze_continuation`: -0.07%, 27 trades, profit factor 0.27.
  - `funding_exhaustion_snap`: 0 trades.
  - `oi_expansion_failure_fade`: -0.06%, 38 trades, profit factor 0.10.
- Primary backtest artifact:
  `backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260506T165516Z.json`
  - return: 0.97%
  - trades: 9
  - win rate: 88.89%
  - profit factor: 22.68
  - max drawdown: 0.05%
  - fees paid: 81.43
  - robust status: passes
- Validation artifact:
  `backend/hyperliquid_gateway/data/validations/btc_failed_impulse_reversal-20260506T165520Z.json`
  - status: `ready-for-paper`
  - blocking reasons: none
- Paper artifact:
  `backend/hyperliquid_gateway/data/paper/btc_failed_impulse_reversal-20260506T165525Z.json`
  - promotion gate: `eligible-for-paper-review`
  - status: `standby`
  - latest signal: `none`
- Full local BTC snapshot check:
  `backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260506T165646Z.json`
  - return: 0.97%
  - trades: 10
  - win rate: 90.0%
  - profit factor: 22.77
  - robust status: passes

## Findings

- The best current local BTC candidate is not one of the pre-existing scalpers;
  it is a lower-frequency failed-impulse reversal with wider target and longer
  max hold.
- The result is promising but still based on a short local window from
  2026-05-03 to 2026-05-06. It should be treated as a paper-candidate research
  result, not proof of durable edge.
- Dominant positive PnL comes mostly from take-profit exits. The robust gate
  allows this because a target-driven strategy should naturally concentrate
  positive exits, but the next reviewer should inspect that assumption.

## Memory Updated

intentionally unchanged: this is strategy-specific evidence captured in backend
artifacts and this handoff. No new durable operating rule belongs in shared
memory.

## Assumptions

- This is research, backtesting, validation, and paper-candidate preparation
  only.
- No live trading, credentials, production routing, or promotion is allowed.
- Conservative taker/taker fees are the primary validation model.
- The local BTC snapshot dataset is adequate for a first paper-candidate gate
  but not adequate for production decisions.

## Next Best Step

Run longer out-of-sample/replay validation for `btc_failed_impulse_reversal`,
then paper trade in standby/trigger mode before considering any production gate.
