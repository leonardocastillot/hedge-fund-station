# BTC Failed Impulse Reversal - Backend Implementation

Full spec:

- `docs/strategies/btc-failed-impulse-reversal.md`

## Backend Notes

- `logic.py` evaluates BTC-only long/short reversal signals from 1h impulse
  and failed 15m follow-through.
- `scoring.py` ranks candidate setups by signal confidence, BTC execution
  quality, impulse size, failed-follow-through quality, and 4h extension.
- `risk.py` defines the 0.65% stop, 1.75% target, 8h hold, one-position cap,
  10% baseline notional, and cooldowns.
- `backtest.py` replays Hyperliquid gateway snapshots sampled into 5m buckets.
- `paper.py` can emit a paper review payload only after validation reaches
  `ready-for-paper`.

No live trading, credentials, production routing, or promotion is implemented
in this package.
