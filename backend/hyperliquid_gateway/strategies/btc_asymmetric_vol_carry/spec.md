# BTC Asymmetric Vol Carry - Backend Implementation

Full spec:

- `docs/strategies/btc-asymmetric-vol-carry.md`

Backend files:

- `logic.py`: dual-sided vol-regime logic, panic/compression/euphoria/breakdown.
- `scoring.py`: setup rank and execution-quality score for operator review.
- `risk.py`: per-setup exposure sizing and non-live risk plan.
- `paper.py`: paper candidate payload and review fields.
- `backtest.py`: deterministic BTC daily replay adapter with long+short support.

Validation target:

- Compare against `btc_convex_cycle_trend` on the 500 USD taker-fee BTC daily
  profile.
- Paper review requires `ready-for-paper`; live remains blocked behind explicit
  operator sign-off and a separate live-gate package.
