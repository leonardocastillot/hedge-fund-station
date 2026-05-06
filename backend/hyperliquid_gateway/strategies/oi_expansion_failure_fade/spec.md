# OI Expansion Failure Fade - Backend Implementation

Full spec:

- `docs/strategies/oi-expansion-failure-fade.md`

The backend package owns deterministic signal evaluation, scoring, risk,
paper-candidate generation, and SQLite replay. The renderer should consume the
registered strategy and generated artifacts; it must not duplicate strategy
logic.

## Modules

- `logic.py`: evaluates long, short, and no-trade signals from gateway snapshot
  features.
- `scoring.py`: ranks candidate setups and execution quality.
- `risk.py`: creates stop/target plans, sizing rules, concurrent-position
  blocks, and cooldown blocks.
- `backtest.py`: samples SQLite snapshots to 5-minute buckets, simulates
  entries/exits with fees and deterministic slippage, and emits diagnostics.
- `paper.py`: produces a paper-review payload from backtest and validation
  artifacts.

## Promotion Boundary

Passing a backtest or validation only makes the strategy eligible for paper
review. It does not permit live trading or production routing.
