# BTC Dual Momentum Trend

## Name

BTC Dual Momentum Trend (`btc_dual_momentum_trend`)

## Hypothesis

BTC daily trends produce the strongest risk-adjusted returns during momentum acceleration phases — when short-term (20-day) rate of change exceeds long-term (90-day) rate of change. Entering only when momentum is accelerating avoids mature/decelerating trends and chop. Exiting on momentum divergence (short-term momentum turns negative while long-term is still positive) provides early exits before trend breaks fully develop.

## Edge

1. **Momentum acceleration filter** (ROC20 > ROC90): Only enter when short-term momentum is strengthening faster than long-term momentum. This is a forward-looking signal that captures explosive trending periods and avoids sideways chop.
2. **Momentum divergence exit** (ROC20 < 0 < ROC20/ROC90 divergence): Exit when short-term momentum turns negative while still above long-term — catches trend fatigue before a full breakdown.
3. **Fast ATR trailing** (4.0x vs vol_atr's 4.8x): Tighter stop locks profits faster while still letting winners run in low vol.
4. **Momentum bonus sizing**: When ROC20 > 2x ROC90 (strong acceleration), target risk gets a 1.3x multiplier — larger position when the signal is strongest.

## Market Regime

- **Works**: Sustained BTC bull trends with accelerating momentum — captures the meat of the move.
- **Fails**: Choppy sideways markets where ROC oscillates around zero; sharp V-reversals that blow through ATR stops.
- **Anti-regime**: Low-volatility grind higher where ROC acceleration is weak but trend persists.

## Inputs

- BTC/USD daily OHLC (Yahoo Finance `btc_usd_daily_yahoo.json`)
- SMA50, SMA200, RSI14, ATR14, 252-day ATR percentile
- ROC20, ROC90 (rate of change over 20 and 90 days)

## Entry

All must pass:
1. `close > SMA200` — long-term bull trend
2. `SMA50 > SMA200` — medium-term momentum alignment
3. `RSI14 > 40` — not oversold/bearish
4. `ATR_percentile < 85` — vol not extreme
5. `ROC20 > ROC90` — momentum accelerating (core edge)
6. `ROC20 > -2%` — not in sharp short-term decline

## Sizing

Risk-budgeting via ATR stop distance (same method as vol_atr):

- Base target risk: 0.5–2.0% of equity (inverse ATR percentile)
- **Momentum bonus**: When ROC20 > 2 * ROC90 > 0 (strong acceleration), multiply target risk by 1.3
- Max exposure: 7–28% of equity (inverse ATR percentile, same as vol_atr)
- Position size = equity * target_risk_pct / atr_stop_distance_pct

## Invalidation

- ATR percentile >= 85: no new entries
- SMA50 crosses below SMA200 or close below SMA200: confirms trend break
- ROC20 <= ROC90: momentum deceleration (no new entry while in this state)

## Exit

First trigger exits:

1. **ATR trailing stop**: 4.0 × ATR14 from highest close since entry. Tighter than vol_atr's 4.8x.
2. **Momentum divergence**: `ROC20 < 0` AND `ROC20 < ROC90` — short-term momentum turned negative AND decelerating below long-term. Catches trend fatigue early.
3. **Trend break**: `close < SMA200` AND `SMA50 < SMA200`
4. **Time stop**: 200 calendar days

## Risk

- **Sizing method**: Risk-budgeting via ATR stop distance.
- **Target risk per trade**: 0.5–2.0% of equity (varies inversely with ATR percentile; 1.3x bonus under strong acceleration).
- **Max exposure**: 7–28% of equity (varies inversely with ATR percentile).
- **Positions**: Max 1 concurrent (BTC only).
- **Kill switches**: Extreme vol block, trend break exit, momentum divergence exit.

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

Commands:
```bash
rtk npm run hf:backtest -- --strategy btc_dual_momentum_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.20 --equity 500
rtk npm run hf:backtest -- --strategy btc_vol_atr_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.20 --equity 500
rtk npm run hf:validate -- --strategy btc_dual_momentum_trend --report <report>
rtk npm run hf:paper -- --strategy btc_dual_momentum_trend --report <report> --validation <validation>
```

## Failure Modes

1. **Momentum acceleration lag**: ROC20 > ROC90 is a lagging indicator — by the time it triggers, part of the move may be missed.
2. **Whiplash in choppy trends**: If ROC20 oscillates around ROC90, the strategy may flip between entry and no-entry frequently.
3. **Concentrated returns**: Like all trend-following, a few big trades may dominate PnL.
4. **ATR trailing too tight in vol expansion**: 4.0x may exit prematurely if vol expands suddenly.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/btc_dual_momentum_trend/logic.py` — signal logic
- `backend/hyperliquid_gateway/strategies/btc_dual_momentum_trend/scoring.py` — setup ranking
- `backend/hyperliquid_gateway/strategies/btc_dual_momentum_trend/risk.py` — ATR risk-budgeting + momentum bonus
- `backend/hyperliquid_gateway/strategies/btc_dual_momentum_trend/paper.py` — paper candidate
- `backend/hyperliquid_gateway/strategies/btc_dual_momentum_trend/backtest.py` — backtest adapter
