# BTC Fee-Aware Failed Impulse Scalp - Backend Implementation

Backend home for `btc_fee_aware_failed_impulse_scalp`.

## Modules

- `logic.py`: BTC-only failed impulse signal with OI, funding, crowding, and fee-edge filters.
- `risk.py`: 0.45% stop, 0.90% target, 20m no-progress exit, 90m time stop, and cooldowns.
- `scoring.py`: setup ranking and execution-quality scoring.
- `backtest.py`: deterministic Hyperliquid snapshot replay with BTC buy-and-hold benchmark fields.
- `paper.py`: paper candidate payload only after validation returns `ready-for-paper`.

## Evidence Rules

The strategy is research-only until backtest, validation, paper sample, risk
review, and operator sign-off are complete. No live routing or credentials are
owned by this package.
