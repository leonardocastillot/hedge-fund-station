# BTC Vol Dynamic Trail Trend - Backend Implementation

Full spec: `docs/strategies/btc-vol-dynamic-trail-trend.md`

Backend files:
- `logic.py`: Volatility-regime refined ATR trail trend — SMA150/SMA50/RSI14 entry, 4.6x ATR trailing (refined from 4.8x champion), risk-budgeting sizing.
- `scoring.py`: Setup rank with vol regime, ATR percentile, and stop quality.
- `risk.py`: ATR-based risk-budgeting position sizing.
- `paper.py`: Paper candidate payload and review fields.
- `backtest.py`: Deterministic BTC daily backtest adapter using shared BTC daily history loader.

Validation target:
- Compare against `btc_vol_atr_trend` (162.30% champion) on 500 USD taker-fee BTC daily profile.
- Paper review requires `ready-for-paper`; live remains blocked behind explicit operator sign-off.

## Parameters (final)

- SMA50, SMA150, RSI14(42), ATR14
- ATR trailing: 4.6x fixed (optimal — beats champion 4.8x by 17.94%; tightens too early reduces returns)
- Vol filter: ATR percentile < 82
- Time stop: 200 days
- Target risk per trade: 0.5-2.0% (inverse ATR)
- Max exposure: 7-28% (inverse ATR)
- Entry: pullback (SMA50 bounce) or momentum (SMA50 cross + RSI 48-78)
- Exit: 4.6x ATR trailing stop, trend break, or time stop
