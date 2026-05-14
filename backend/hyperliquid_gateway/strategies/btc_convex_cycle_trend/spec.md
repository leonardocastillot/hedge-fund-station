# BTC Convex Cycle Trend - Backend Implementation

Full spec:

- `docs/strategies/btc-convex-cycle-trend.md`

Backend files:

- `logic.py`: daily BTC trend, momentum, RSI, drawdown, and exit guards.
- `scoring.py`: setup rank and execution-quality score for operator review.
- `risk.py`: partial-exposure sizing and non-live risk plan.
- `paper.py`: paper candidate payload and review fields.
- `backtest.py`: deterministic BTC daily replay adapter using the shared BTC
  daily history loader and backend fee model.

Validation target:

- Compare against `btc_adaptive_cycle_trend` on the 500 USD taker-fee BTC daily
  profile.
- Paper review requires `ready-for-paper`; live remains blocked behind explicit
  operator sign-off and a separate live-gate package.
