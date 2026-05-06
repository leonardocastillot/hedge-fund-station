# BTC Crowding Scalper

Backend-native BTC-first scalper derived from the short squeeze continuation research line.

Intended module split:

- `logic.py`: deterministic BTC crowding and micro-impulse trigger logic
- `scoring.py`: ranking and execution-quality score
- `risk.py`: scalper invalidation, cooldown, and sizing rules
- `paper.py`: paper-candidate helper
- `backtest.py`: Hyperliquid snapshot replay adapter

The matching strategy document lives at:

- `docs/strategies/btc-crowding-scalper.md`
