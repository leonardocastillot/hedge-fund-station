# BTC Multi-Timeframe Trend Ensemble

## Signal Logic

4 independent MA pairs vote on trend quality:
- MA20 > MA50 with positive 5d slope
- MA50 > MA100 with positive 5d slope
- MA100 > MA200 with positive 5d slope
- Close > MA200

**Score** = 0-4 based on votes.

### Entry
- Trend score >= 2
- RSI 14 between 40-75
- ATR percentile < 85
- Pullback (price between MA20/MA50, RSI < 58) OR momentum (price > MA20 with slope, RSI >= 48)

### Exit
1. Smooth ATR trail: `2.0 + atr_pct * 0.035` (2.0x-5.5x continuous)
2. Structure break: score <= 0 + close < MA50 + min 5 days held
3. Time stop: 250 days

## Position Sizing
- Risk % = `2.2% * (1 - atr_pct*0.007) * conviction_bonus`
- Max exposure = `28% * (1 - atr_pct*0.0065) * conviction_bonus`
- Conviction bonus = `0.8 + (score - 2) * 0.15`

## Risk
- Long-only, max 1 position
- No leverage
- Taker fee 0.045%
- Target max drawdown < 22%
