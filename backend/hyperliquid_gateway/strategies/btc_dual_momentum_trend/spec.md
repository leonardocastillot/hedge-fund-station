# BTC Dual Momentum Trend - Backend Implementation

Full spec: `docs/strategies/btc-dual-momentum-trend.md`

Backend files:
- `logic.py`: Dual momentum trend — ROC20/ROC90 acceleration entry, ROC20/ROC90 divergence exit, ATR trailing, vol-regime awareness.
- `scoring.py`: Setup rank with momentum acceleration, vol regime, stop quality, and trend spread.
- `risk.py`: ATR-based risk-budgeting position sizing with 1.3x momentum bonus.
- `paper.py`: Paper candidate payload and review fields.
- `backtest.py`: Deterministic BTC daily backtest adapter using shared BTC daily history loader.

Validation target:
- Compare against `btc_vol_atr_trend` (162.30% champion) on 500 USD taker-fee BTC daily profile.
- Paper review requires `ready-for-paper`; live remains blocked behind explicit operator sign-off.

## Parameters (final)

- SMA50, SMA200, RSI14(40), ATR14
- ROC20, ROC90 for momentum acceleration detection
- ATR trailing stop: 4.0x peak-to-ATR
- Vol filter: ATR percentile < 85
- Momentum floor: ROC20 > -2%
- Time stop: 200 days
- Target risk per trade: 0.6-2.0% (inverse ATR), 1.3x bonus under strong acceleration
- Max exposure: 7-28% (inverse ATR)
- Entry: ROC20 > ROC90 (momentum accelerating)
- Exit: momentum divergence (ROC20<0 && ROC20<ROC90), 4.0x ATR stop, trend break, or time stop
