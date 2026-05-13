# BTC 500 USD Validated Profile Handoff

## Objective

Implement the approved `500_usd_validated` operator profile for
`btc_guarded_cycle_trend`: start from `500 USD`, use the validated unlevered
10% exposure profile, generate official evidence, and keep leverage
research-only.

## Changes Made

- Documented the official profile in `docs/strategies/btc-guarded-cycle-trend.md`
  and mirrored it in the backend strategy spec.
- Updated readiness and paper review docs so future agents know the profile is
  `--equity 500 --risk-fraction 0.10 --fee-model taker`, no leverage, no
  shorts, and one matching BTC paper position.
- Added a focused runtime test that proves `portfolio_value=500` creates a
  `50 USD` entry plan and blocks a duplicate BTC guarded-cycle position.
- Generated official repo evidence for backtest, validation, paper candidate,
  and stability audit.
- Added narrow `.gitignore` exceptions for only these official 500 USD
  artifacts so they are reviewable without unignoring generated data broadly.

## Evidence

- Backtest:
  `backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T181241Z.json`
  - initial equity: `500.00`
  - final equity: `947.65`
  - net profit: `447.65`
  - return: `89.53%`
  - trades: `48`
  - win rate: `41.67%`
  - profit factor: `2.93`
  - max drawdown: `8.79%`
  - robust status: `passes`
- Validation:
  `backend/hyperliquid_gateway/data/validations/btc_guarded_cycle_trend-20260513T181246Z.json`
  - status: `ready-for-paper`
  - blockers: none
- Paper candidate:
  `backend/hyperliquid_gateway/data/paper/btc_guarded_cycle_trend-20260513T181250Z.json`
  - promotion gate: `eligible-for-paper-review`
  - latest signal: `none`
- Stability audit:
  `backend/hyperliquid_gateway/data/audits/btc_guarded_cycle_trend-doubling-stability-20260513T181253Z.json`
  - status: `stable`
  - positive slice ratio: `100%`
  - largest positive slice PnL share: `48.69%`

## Verification

Passed:

```bash
rtk npm run agent:check
rtk python3 -m unittest tests.test_btc_guarded_cycle_trend
rtk npm run hf:backtest -- --strategy btc_guarded_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.10 --equity 500
rtk npm run hf:validate -- --strategy btc_guarded_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T181241Z.json
rtk npm run hf:paper -- --strategy btc_guarded_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T181241Z.json --validation backend/hyperliquid_gateway/data/validations/btc_guarded_cycle_trend-20260513T181246Z.json
rtk npm run hf:doubling:stability -- --strategy btc_guarded_cycle_trend --report backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T181241Z.json --validation backend/hyperliquid_gateway/data/validations/btc_guarded_cycle_trend-20260513T181246Z.json
rtk npm run hf:status
rtk git diff --check
```

## Risks And Notes

- This profile is paper-candidate evidence only. No live routing, credentials,
  or production promotion occurred.
- The strategy is slow: `48` trades over the BTC daily history window from
  2014-09-17 through 2026-05-13. It should not be sold as frequent income.
- Latest daily signal is `none`; paper runtime should wait for the next valid
  guarded daily uptrend signal before opening.
- Leverage is intentionally not implemented in the validated profile. Any `2x`
  or `3x` variant must be a separate research/audit path and must be blocked if
  drawdown exceeds `15%`, worst trade loses more than `50 USD` on `500 USD`
  equity, robust assessment fails, or any multi-year slice is fragile.

## Memory

Intentionally unchanged. The durable lesson is captured in the strategy docs,
official 500 USD artifacts, tests, and this handoff.

## Next Best Step

Start paper collection for `btc_guarded_cycle_trend` with `portfolio_value=500`
only when the operator wants active paper monitoring. For more frequent income,
create a separate intraday strategy research task; the current frequent local
scalpers remain validation-blocked.
