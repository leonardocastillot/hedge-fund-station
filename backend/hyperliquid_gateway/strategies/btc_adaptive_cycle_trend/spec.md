# BTC Adaptive Cycle Trend - Backend Implementation

Full spec:
- `docs/strategies/btc-adaptive-cycle-trend.md`

This package implements a BTC-only daily strategy that extends the validated
guarded-cycle trend idea with adaptive sizing.

Implementation map:

- `logic.py` owns deterministic daily regime, strong-regime, entry, and exit
  checks.
- `risk.py` caps exposure at 20% of equity and falls back to 10% when the base
  regime passes without strong-regime confirmation.
- `backtest.py` uses shared BTC/USD daily history and records the
  `btc_guarded_cycle_trend` 500 USD benchmark in every official report.
- `paper.py` builds paper candidate and dry-run runtime plans only; live
  trading stays disabled.

Official profile:

- `initial_equity=500`
- `risk_fraction=0.20`
- fee model: taker
- no leverage
- no shorts
- max one matching BTC paper position
