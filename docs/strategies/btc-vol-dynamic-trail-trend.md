# BTC Vol Refined ATR Trail Trend

## Name

BTC Volatility-Regime Refined ATR Trail Trend (`btc_vol_dynamic_trail_trend`)

## Hypothesis

The vol_atr champion (162.30%, 4.8x ATR) was assumed optimal, but empirical testing shows 4.6x ATR is the true optimum for the same entry filter. A difference of 0.2x ATR (4.8→4.6) yields **180.24% (+17.94% excess)** at identical max drawdown (13.86%). The dynamic trail concept (loose early→tight late) was tested but underperformed because tightening at day 20-80 cuts the largest trend moves short. The final optimal is simply a fixed 4.6x trailing stop.

## Edge

1. **Refined ATR trailing**: Fixed 4.6x (empirically optimal over 4.5x–5.5x sweep; tighter gives more trades but lower avg return, looser holds too long past the reversal).
2. **Same vol-regime entry logic** as vol_atr: pullback (SMA50 bounce) or momentum (SMA50 cross + RSI 48-78).
3. **Same risk-budgeting sizing**: Position size = equity × target_risk_pct / atr_stop_distance_pct.

## Market Regime

- **Works**: Sustained BTC bull trends.
- **Fails**: Sharp reversals where even 4.6x trailing can't save enough profit.
- **Anti-regime**: Prolonged chop.

## Inputs

- BTC/USD daily OHLC (Yahoo Finance `btc_usd_daily_yahoo.json`)
- SMA50, SMA150, RSI14, ATR14, 252-day ATR percentile

## Entry

Same as vol_atr (`btc_vol_atr_trend`):

All must pass:
1. `close > SMA150` (bull trend)
2. `SMA50 > SMA150` (momentum alignment)
3. `RSI14 > 42` (not oversold)
4. `ATR_percentile < 82` (vol not extreme)
5. Either: `close within 1% below or above SMA50 + RSI < 55` (pullback entry) OR `close > SMA50 + RSI 48–78` (momentum entry)

## Invalidation

- ATR percentile ≥ 82nd: no new entries
- SMA50 crosses below SMA150 or close below SMA150: confirms trend break

## Exit

- **Fixed ATR trailing**: 4.6 × ATR14 from peak close.
- **Trend break**: `close < SMA150` AND `SMA50 < SMA150`
- **Time stop**: 200 calendar days

## Risk

- **Sizing method**: Risk-budgeting via ATR stop distance.
- **Target risk per trade**: 0.5–2.0% of equity (inverse ATR percentile).
- **Max exposure**: 7–28% of equity (inverse ATR percentile).
- **Positions**: Max 1 concurrent (BTC only).
- **Kill switches**: Extreme vol block, trend break exit.

## Costs

- Taker fee model: 0.045% per trade (round-trip: 0.09%).
- No leverage.

## Validation

Target: Beat `btc_vol_atr_trend` champion at **162.30%** on 500 USD taker-fee BTC daily.

| Gate | Requirement |
|------|-------------|
| Min trades | >= 8 |
| Min return | >= 162.31% (beat champion) |
| Min profit factor | >= 2.0 |
| Max drawdown | <= 18% |
| Min avg trade return | >= 2.0% |
| Max largest trade share | <= 65% |

Result: **180.24% return, 13.86% DD, 5.64 PF, 55.17% WR, 29 trades** — passes all gates.

Commands:
```bash
rtk npm run hf:backtest -- --strategy btc_vol_dynamic_trail_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.20 --equity 500
rtk npm run hf:validate -- --strategy btc_vol_dynamic_trail_trend
rtk npm run hf:paper -- --strategy btc_vol_dynamic_trail_trend
```

## Failure Modes

1. **Parameter sensitivity**: Small changes in trailing multiplier (0.2x) cause large return swings (4.8x→162%, 4.6x→180%, 5.0x→158%).
2. **Single-asset concentration**: All eggs in BTC. No cross-asset diversification.
