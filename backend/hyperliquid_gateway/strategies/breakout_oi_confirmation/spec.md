# Breakout OI Confirmation - Backend Implementation

Full spec:

- `docs/strategies/breakout-oi-confirmation.md`

This package owns deterministic signal evaluation, scoring, risk, paper-candidate
generation, and SQLite snapshot replay for a breakout continuation candidate.
The renderer may inspect generated artifacts, but it must not duplicate the
strategy logic.

## Modules

- `logic.py`: evaluates long, short, and no-trade breakout signals from gateway
  snapshot features.
- `scoring.py`: ranks breakout quality from confidence, OI expansion, liquidity,
  and existing setup scores.
- `risk.py`: defines dynamic stops, targets, cooldowns, position sizing, and
  invalidation.
- `backtest.py`: samples SQLite `market_snapshots`, simulates fees/slippage, and
  emits diagnostics.
- `paper.py`: converts validated backtest evidence into a paper-review payload.

## Promotion Boundary

Passing validation only permits paper review. It does not permit live trading or
production routing.
