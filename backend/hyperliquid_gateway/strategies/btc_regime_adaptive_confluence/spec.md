# BTC Regime-Adaptive Confluence Trend

See `docs/strategies/btc-regime-adaptive-confluence.md` for the full spec.

## Key Parameters

- SMA fast/slow: 50/150
- ATR period: 14
- ATR percentile lookback: 252
- Max vol percentile: 82
- Min entry RSI: 42
- Progressive trail: 3.5x ATR (days 0-14), 5.5x ATR (day 15+)
- Time stop: 200 days
- Entry: pullback (near SMA50 + RSI < 55) or momentum (above SMA50 + RSI 48-78)
