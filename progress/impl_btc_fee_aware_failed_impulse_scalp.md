# BTC Fee-Aware Failed Impulse Scalp Handoff

## Objective

Repair the stale BTC scalp handoff with one backend-first,
fee-aware failed-impulse candidate and leave evidence instead of promotion.

## Scope

- Strategy docs: `docs/strategies/`
- Backend strategy package: `backend/hyperliquid_gateway/strategies/`
- Backtest registry and validation thresholds
- Focused strategy/backtest tests
- Local and VM BTC data availability checks

## Changes Made

- Added strategy ID `btc_fee_aware_failed_impulse_scalp`.
- Added deterministic BTC-only signal logic requiring valid price, volume, OI,
  funding/crowding/setup context, a 1h impulse, failed 15m follow-through, and
  no extreme 4h overextension.
- Added fee-aware risk/scoring/backtest/paper modules with conservative taker
  fee baseline assumptions.
- Added 27 default backtest variants:
  - target: `0.75`, `0.90`, `1.10`
  - stop: `0.35`, `0.45`, `0.60`
  - max hold: `45`, `90`, `180` minutes
- Added same-window BTC hold benchmark fields:
  `btc_hold_return_pct`, `excess_vs_btc_hold_pct`, and `benchmark_window`.
- Registered the strategy and documented stricter scalp gates:
  minimum 60 trades, positive net return, positive excess vs BTC hold, profit
  factor at least 1.30, max drawdown at most 3.5%, average net trade return at
  least 0.12%, and no dominant one-trade or one-exit-reason concentration.
- Added tests covering signal logic, no-trade filters, scoring, risk exits,
  benchmark fields, default loader behavior, paper gating, and registry
  exposure.

## Files Changed

- `docs/strategies/btc-fee-aware-failed-impulse-scalp.md`: strategy thesis,
  rules, failure modes, validation gates, and backend mapping.
- `backend/hyperliquid_gateway/strategies/btc_fee_aware_failed_impulse_scalp/`:
  new strategy package.
- `backend/hyperliquid_gateway/backtesting/registry.py`: strategy catalog entry.
- `docs/operations/strategy-validation-thresholds.md`: validation threshold row.
- `docs/operations/strategy-readiness-matrix.md`: readiness row and repair note.
- `tests/test_btc_fee_aware_failed_impulse_scalp.py`: focused unit/backtest
  coverage.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md`: harness
  state and evidence.

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk python3 -m unittest tests.test_btc_fee_aware_failed_impulse_scalp
rtk python3 -m unittest tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper tests.test_btc_fee_aware_failed_impulse_scalp
rtk npm run hf:backtest -- --strategy btc_fee_aware_failed_impulse_scalp --symbol BTC --fee-model taker --lookback-days 3
rtk npm run hf:validate -- --strategy btc_fee_aware_failed_impulse_scalp --report backend/hyperliquid_gateway/data/backtests/btc_fee_aware_failed_impulse_scalp-hyperliquid-20260513T150908Z.json
rtk npm run hf:status
rtk npm run build
rtk git diff --check
```

Result:

- Unit/catalog/backtest tests passed: 41 tests.
- Build passed.
- Harness check passed after adding the full promotion-gate language to the
  task.
- Diff whitespace check passed.
- `hf:validate` exited non-zero by design because the strategy is blocked.

## Findings

- VM BTC data at `/data/hedge-fund-station/hyperliquid_gateway/data` only spans
  about 10.72 days:
  `BTC|105866|2026-05-02T21:59:54Z|2026-05-13T15:09:37Z|days=10.72`.
  The required 30/60/90 day VM backtests were skipped as a data-quality
  blocker.
- New 3-day local taker baseline:
  - artifact:
    `backend/hyperliquid_gateway/data/backtests/btc_fee_aware_failed_impulse_scalp-hyperliquid-20260513T150908Z.json`
  - return: `-0.09%`
  - trades: `5`
  - win rate: `0.00%`
  - profit factor: `0.00`
  - max drawdown: `0.09%`
  - fees: `26.99`
  - BTC hold: `-0.80%`
  - excess vs BTC hold: `+0.71%`
  - robust status: `insufficient-sample`
- Validation artifact:
  `backend/hyperliquid_gateway/data/validations/btc_fee_aware_failed_impulse_scalp-20260513T150918Z.json`.
  Status is blocked by insufficient trades, negative net return, weak profit
  factor, and weak average net trade return.
- Same-window local taker audit of existing BTC scalp references:
  - `btc_failed_impulse_reversal`: `-0.18%`, 8 trades, profit factor `0.63`,
    blocked.
  - `btc_failed_impulse_balanced_fast`: `-0.14%`, 8 trades, profit factor
    `0.70`, blocked.
  - `btc_crowding_scalper`: `-0.06%`, 56 trades, profit factor `0.10`,
    insufficient sample/blocked.
  - `oi_expansion_failure_fade`: `-0.04%`, 21 trades, profit factor `0.05`,
    insufficient sample/blocked.
  - `short_squeeze_continuation`: `-0.02%`, 9 trades, profit factor `0.34`,
    insufficient sample/blocked.

## Memory Updated

intentionally unchanged: the durable lesson is captured in strategy docs,
validation thresholds, readiness matrix, and this handoff; no separate memory
promotion was needed.

## Assumptions

- No live trading, credential changes, production promotion, or paper runtime
  changes were allowed.
- Conservative evidence uses taker fees first. Mixed maker/taker evidence is a
  later feasibility test only.
- Paper candidate generation is allowed only after validation returns
  `ready-for-paper`.

## Next Best Step

Backfill or collect at least 30 days of BTC snapshots on the VM, then run the
30/60/90 day taker baseline and compare the new strategy against the five
reference scalpers on identical windows.
