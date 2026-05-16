# BTC ATR Channel Breakout (btc_zscore_atr_trend)

## Name

BTC ATR Channel Breakout Trend

## Hypothesis

When BTC price breaks out of an ATR-based volatility channel (SMA50 ± 2×ATR) within a confirmed bull trend (SMA50 > SMA200, close > SMA200), the momentum is likely to persist. The channel provides a volatility-normalized entry that adapts to market conditions automatically.

## Edge

1. **Volatility-normalized entry**: Channel width adapts to market vol (2×ATR around SMA50). Entries only when vol is low enough (ATR percentile < 85) and price demonstrates directional conviction by breaking the channel.
2. **Channel re-entry exit**: If price drops back into the channel, the breakout failed — exit immediately (15 of 28 exits via channel_exit). This captures quick breakouts and limits false starts.
3. **ATR trailing backstop**: 4×ATR trailing stop from trade peak as a hard backstop.
4. **SMA200 trend filter**: Ensures only bull market breakouts are taken.

## Market Regime

- **Works**: Sustained BTC bull trends after vol contraction + channel breakout
- **Fails**: Choppy sideways markets where price oscillates around channel boundaries
- **Anti-regime**: Sharp V-reversals that breach channel then immediately reverse

## Inputs

- BTC/USD daily OHLC (Yahoo Finance `btc_usd_daily_yahoo.json`)
- SMA50, SMA200, RSI14, ATR14, 252-day ATR percentile

## Entry

All must pass:
1. `close > SMA200` (bull trend)
2. `SMA50 > SMA200` (momentum alignment)
3. `close > SMA50 + 2×ATR` (channel breakout)
4. `RSI14 > 40` (not oversold)
5. `ATR percentile < 85` (vol not extreme)

## Invalidation

- Price drops below channel_low (SMA50 - 2×ATR): breakout failed
- ATR percentile ≥ 85: no new entries

## Exit

- **Channel exit**: `close < SMA50 - 2×ATR` — breakout invalidated
- **ATR trailing stop**: 4×ATR from highest close since entry
- **Trend break**: `close < SMA200` AND `SMA50 < SMA200`
- **Time stop**: 180 calendar days

## Risk

- **Sizing method**: Risk-budgeting via ATR stop distance (same as btc_vol_atr_trend)
- **Target risk per trade**: 0.6–2.2% of equity (varies inversely with ATR percentile)
- **Max exposure**: 7–28% of equity (varies inversely with ATR percentile)
- **Positions**: Max 1 concurrent (BTC only)
- **Kill switches**: Channel exit, ATR trailing, trend break, time stop

## Costs

- Taker fee model: 0.045% per trade (round-trip: 0.09%)
- No leverage
- Total fees: $4.49 on 500 USD starting equity, 28 trades

## Validation

| Metric | Value | Previous Champion | Delta |
|--------|-------|-------------------|-------|
| Return (500 USD taker) | **277.55%** | 162.30% | **+115.25%** |
| Profit factor | **8.78** | 6.00 | **+2.78** |
| Win rate | 46.43% | 53.85% | -7.42pp |
| Max drawdown | **14.39%** | 13.86% | +0.53pp |
| Trades | 28 | 26 | +2 |
| Avg net trade return | **29.67%** | 45.54% | — |
| Largest trade PnL share | 67.10% | 60.81% | — |

**Robust gate**: PASSES (8 min trades ✓, 162.3% min return ✓, 3.0 min profit factor ✓, 18% max drawdown ✓, 70% max concentration ✓)

**Validation status**: `ready-for-paper`

## Failure Modes

1. **Concentrated returns**: 67.1% of PnL from one trade — typical for trend breakout strategies
2. **Channel whipsaw**: In choppy markets, price may oscillate around channel boundaries triggering false breakouts
3. **ATR lag**: ATR is lagging; a sudden vol spike may not be caught in channel computation
4. **No short side**: Long-only — misses bear market opportunities

## Backend Mapping

- `backend/.../strategies/btc_zscore_atr_trend/logic.py` — signal logic (ATR channel breakout)
- `backend/.../strategies/btc_zscore_atr_trend/scoring.py` — setup ranking
- `backend/.../strategies/btc_zscore_atr_trend/risk.py` — ATR risk-budgeting
- `backend/.../strategies/btc_zscore_atr_trend/paper.py` — paper candidate
- `backend/.../strategies/btc_zscore_atr_trend/backtest.py` — backtest adapter
