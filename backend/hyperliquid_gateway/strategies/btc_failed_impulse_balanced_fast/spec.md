# BTC Failed Impulse Balanced Fast - Backend Implementation

Full spec:
- `docs/strategies/btc-failed-impulse-balanced-fast.md`

This package promotes the optimizer variant
`default_signal__balanced_fast` into a named research strategy so it appears in
the normal strategy catalog and can run through the stable `hf:*` workflow.

The strategy wraps `btc_failed_impulse_reversal` with fixed parameters:

- same signal thresholds as the parent strategy
- 0.65% stop
- 1.45% target
- 360 minute time stop
- 10% base paper/backtest size

This does not change the parent strategy or the running paper loop.
