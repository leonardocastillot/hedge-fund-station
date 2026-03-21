# Polymarket BTC Up/Down 5m Maker Basis Skew

See the main strategy document at:

- `docs/strategies/polymarket-btc-updown-5m-maker-basis-skew.md`

Implementation modules:

- `logic.py`: maker-side bias and quote construction
- `scoring.py`: ranking helpers
- `risk.py`: conservative maker-entry gates
- `paper.py`: rebate-aware ROI helpers
- `backtest.py`: conservative maker replay on gateway snapshots
