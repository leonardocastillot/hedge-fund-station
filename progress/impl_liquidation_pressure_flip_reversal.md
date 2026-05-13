# Implementation Report: liquidation_pressure_flip_reversal

## Objective

Create a backend-first Hyperliquid liquidation-pressure reversal candidate
without live trading or production promotion.

## Scope

Inspected existing gateway snapshot strategy patterns and implemented:

- `backend/hyperliquid_gateway/strategies/liquidation_pressure_flip_reversal/`
- `docs/strategies/liquidation-pressure-flip-reversal.md`
- `tests/test_liquidation_pressure_flip_reversal.py`

## Changes Made

- Added deterministic long/short/no-trade signal logic using persisted
  `market_snapshots`: estimated liquidation pressure, crowding, setup scores,
  OI, funding, liquidity, and short-window stall behavior.
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
rtk npm run hf:backtest -- --strategy liquidation_pressure_flip_reversal --symbols BTC,SOL,HYPE --lookback-days 30 --output backend/hyperliquid_gateway/data/backtests/liquidation_pressure_flip_reversal-initial.json
rtk npm run hf:validate -- --strategy liquidation_pressure_flip_reversal --report backend/hyperliquid_gateway/data/backtests/liquidation_pressure_flip_reversal-initial.json
```

Result:

- tests passed
- backtest generated `backend/hyperliquid_gateway/data/backtests/liquidation_pressure_flip_reversal-initial.json`
- validation generated blocked report at `backend/hyperliquid_gateway/data/validations/liquidation_pressure_flip_reversal-20260513T142258Z.json`

Backtest summary:

- total trades: 2
- return: -0.01%
- win rate: 0.00%
- profit factor: 0.00
- max drawdown: 0.01%
- fees paid: 1.44

Validation blockers:

- `min_trades`
- `min_return_pct`
- `min_profit_factor`
- `min_win_rate_pct`
- `robust_gate`
- `robust:min_trades`
- `robust:positive_net_return`
- `robust:min_profit_factor`
- `robust:min_avg_net_trade_return_pct`

## Findings

The candidate is research/backtest blocked. It is too selective on the current
30-day BTC/SOL/HYPE replay and the two trades both lost after fees. BTC produced
no trades in the initial run.

## Memory Updated

Intentionally unchanged: this produced strategy artifacts and handoffs, not a
durable company-level rule that belongs in curated shared memory.

## Assumptions

V1 uses persisted gateway snapshots only. No raw orderbook, depth, or
trade-aggression claim was made.

## Next Best Step

Audit liquidation estimate coverage and relax/retune pressure thresholds only
after checking whether the field is sparse or stale in the replay window.
