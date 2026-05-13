# BTC Guarded Cycle Trend - Backend Implementation

Full spec:
- `docs/strategies/btc-guarded-cycle-trend.md`

This package implements a BTC-only daily trend strategy built from the repo's
existing lessons:

- structural BTC upside matters, but deposit-driven accumulation math is not a
  paper-trading return claim
- frequent taker-fee scalping has been weak in local evidence
- paper promotion must pass backend backtest and validation gates first

Default rules:

- enter long when daily close is above SMA150, SMA50 is above SMA150, and RSI14
  is above 42
- use at most 10% equity exposure
- exit on a 15% close drawdown from trade peak, slow-trend break, or crash
  guard
- no shorts, no live routing, no production promotion

Official operator profile:

- `500_usd_validated`
- `initial_equity=500`
- `risk_fraction=0.10`
- estimated first position size `50 USD`
- unlevered only
- max one matching BTC guarded-cycle paper position

Leverage remains research-only. Test `2x` or `3x` variants only as separate
backtest/audit experiments, and block them if drawdown exceeds 15%, worst trade
loss exceeds 50 USD on 500 USD equity, robust assessment fails, or any
multi-year stability slice is fragile.
