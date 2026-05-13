# Liquidation Pressure Flip Reversal - Backend Implementation

Full spec:

- `docs/strategies/liquidation-pressure-flip-reversal.md`

This package owns deterministic signal evaluation, scoring, risk,
paper-candidate generation, and SQLite snapshot replay for a liquidation
pressure reversal candidate. The renderer may inspect generated artifacts, but
it must not duplicate the strategy logic.

## Modules

- `logic.py`: evaluates long, short, and no-trade reversal signals from gateway
  snapshot features.
- `scoring.py`: ranks reversal quality from pressure scores, liquidation
  estimate, stall quality, and execution quality.
- `risk.py`: defines dynamic stops, targets, cooldowns, position sizing, and
  invalidation.
- `backtest.py`: samples SQLite `market_snapshots`, simulates fees/slippage, and
  emits diagnostics.
- `paper.py`: converts validated backtest evidence into a paper-review payload.

## Promotion Boundary

Passing validation only permits paper review. It does not permit live trading or
production routing.
