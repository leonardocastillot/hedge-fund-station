# Implementation Report: breakout_oi_confirmation

## Objective

Create a backend-first Hyperliquid breakout continuation candidate without live
trading or production promotion.

## Scope

Inspected existing gateway snapshot strategy patterns and implemented:

- `backend/hyperliquid_gateway/strategies/breakout_oi_confirmation/`
- `docs/strategies/breakout-oi-confirmation.md`
- `tests/test_breakout_oi_confirmation.py`

## Changes Made

- Added deterministic long/short/no-trade signal logic using persisted
  `market_snapshots`: price displacement, OI, funding, liquidity, crowding,
  primary setup, and setup scores.
- Added scoring, risk, paper-candidate helper, SQLite replay backtest, and
  backend implementation spec.
- Added public strategy spec with hypothesis, regimes, inputs, entry,
  invalidation, risk, costs, validation thresholds, failure modes, and backend
  mapping.
- Added focused synthetic tests for signal logic, scoring/risk, replay with
  fees, paper-candidate gating, and registry discovery.

## Verification

Commands run:

```bash
rtk python3 -m unittest tests.test_breakout_oi_confirmation tests.test_liquidation_pressure_flip_reversal
rtk npm run hf:backtest -- --strategy breakout_oi_confirmation --symbols BTC,SOL,HYPE --lookback-days 30 --output backend/hyperliquid_gateway/data/backtests/breakout_oi_confirmation-initial.json
rtk npm run hf:validate -- --strategy breakout_oi_confirmation --report backend/hyperliquid_gateway/data/backtests/breakout_oi_confirmation-initial.json
```

Result:

- tests passed
- backtest generated `backend/hyperliquid_gateway/data/backtests/breakout_oi_confirmation-initial.json`
- validation generated blocked report at `backend/hyperliquid_gateway/data/validations/breakout_oi_confirmation-20260513T142258Z.json`

Backtest summary:

- total trades: 52
- return: -0.10%
- win rate: 13.46%
- profit factor: 0.27
- max drawdown: 0.11%
- fees paid: 43.00

Validation blockers:

- `min_return_pct`
- `min_profit_factor`
- `min_win_rate_pct`
- `robust_gate`
- `robust:positive_net_return`
- `robust:min_profit_factor`
- `robust:min_avg_net_trade_return_pct`

## Findings

The candidate is research/backtest blocked. It has enough initial trades, but
the current trigger loses after fees and slippage. SOL contributed most trades
and losses; BTC had only one trade in the 30-day BTC/SOL/HYPE run.

## Memory Updated

Intentionally unchanged: this produced strategy artifacts and handoffs, not a
durable company-level rule that belongs in curated shared memory.

## Assumptions

V1 uses persisted gateway snapshots only. No raw orderbook, depth, or
trade-aggression claim was made.

## Next Best Step

Tighten breakout filters around SOL/HYPE false continuations before another
multi-symbol replay; likely require stronger 4h alignment or reduce entries
where 15m reversal is common.
