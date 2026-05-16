# BTC Vol Tight Trail Trend

## Name

BTC Volatility-Regime Tight Trail Trend (`btc_vol_tight_trail_trend`)

## Hypothesis

The vol_atr_trend champion (162.30%) uses a 4.8x ATR trailing stop. A tighter 3.5x ATR trailing may lock profits faster, reduce drawdown, and allow more re-entries during the same trend — potentially improving total return and risk-adjusted metrics despite exiting individual trades earlier.

## Edge

1. **Faster trailing** (3.5× vs 4.8× ATR): Exits trades earlier, which may reduce the largest-trade concentration and allow capital to re-deploy into the next entry signal sooner.
2. **Same vol-regime entry logic** as vol_atr: Pullback (SMA50 bounce) or momentum (SMA50 cross + RSI 48-78) entry.
3. **Same risk-budgeting sizing**: Position size = equity × target_risk_pct / atr_stop_distance_pct.

## Market Regime

- **Works**: Sustained BTC bull trends — tighter trailing may exit during pullbacks but re-enter quickly.
- **Fails**: Strong trends where early exit misses most of the move and re-entry at a worse price.
- **Anti-regime**: Choppy markets where tight trailing causes constant whipsaw.

## Inputs

- BTC/USD daily OHLC (Yahoo Finance `btc_usd_daily_yahoo.json`)
- SMA50, SMA200, RSI14, ATR14, 252-day ATR percentile

## Entry

Same as vol_atr:

All must pass:
1. `close > SMA200` (bull trend)
2. `SMA50 > SMA200` (momentum alignment)
3. `RSI14 > 42` (not oversold)
4. `ATR_percentile < 82` (vol not extreme)
5. Either: `close within 1% below or above SMA50 + RSI < 55` (pullback entry) OR `close > SMA50 + RSI 48–78` (momentum entry)

## Invalidation

- ATR percentile ≥ 82nd: no new entries
- SMA50 crosses below SMA200 or close below SMA200: confirms trend break

## Exit

- **ATR trailing stop**: `3.5 × ATR14` from highest close since entry (tighter than vol_atr's 4.8x).
- **Trend break**: `close < SMA200` AND `SMA50 < SMA200`
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

Commands:
```bash
rtk npm run hf:backtest -- --strategy btc_vol_atr_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.20 --equity 500
rtk npm run hf:backtest -- --strategy btc_vol_tight_trail_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.20 --equity 500
rtk npm run hf:validate -- --strategy btc_vol_tight_trail_trend --report <report>
rtk npm run hf:paper -- --strategy btc_vol_tight_trail_trend --report <report> --validation <validation>
```

## Failure Modes

1. **Early exit in strong trends**: 3.5x trailing may stop out before a major move completes, and re-entry may be at a worse price.
2. **More trades, more fees**: More frequent exits and re-entries increase transaction costs.
3. **Same concentration risk**: Single trade concentration may remain if one massive trend dominates.
