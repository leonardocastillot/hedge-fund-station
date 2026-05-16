# BTC Asymmetric Vol Carry

BTC Asymmetric Vol Carry is a **dual-sided** (long AND short) BTC daily
strategy that exploits volatility regime asymmetry. It competes against
`btc_convex_cycle_trend`, the current BTC daily champion with `115.78%` net
return after taker fees.

## Hypothesis

BTC exhibits asymmetric volatility: extreme fear (high vol + deeply oversold)
produces snap-back rallies, while extreme euphoria (low vol + very overbought
at extended prices) fades reliably. Additionally, volatility compression
precedes directional expansion, and trend breakdowns during high vol create
shortable momentum failures.

Existing strategies in the registry are all **long-only** (trend, cycle,
momentum, breakout). This is the first strategy to trade both directions using
volatility regime as the primary signal.

## Edge

1. **Panic buying edge**: When ATR is at its 80th+ percentile AND RSI < 38,
   BTC has historically snap-backed within 5-15 days as selling exhausts.
2. **Euphoria fading edge**: When ATR is at its 30th percentile or below AND
   RSI > 78 AND price is 50%+ above the 200-day MA, the rally is extended
   beyond what low-vol regimes can sustain.
3. **Compression breakout edge**: When ATR is at its 20th percentile or below
   AND price breaks above SMA50, the compression release tends to sustain in
   the direction of the breakout.
4. **Breakdown short edge**: When ATR is elevated (70th+ percentile) AND
   short-term trend (SMA5 < SMA20) breaks AND close < SMA20, the selling
   momentum tends to continue.

## Market Regime

Each trade type activates in a distinct regime:

- **Panic**: ATR percentile >= 80 (extreme volatility), RSI <= 38 (oversold),
  close < SMA50
- **Compression**: ATR percentile <= 20 (extreme calm), RSI > 50, close > SMA50
- **Euphoria**: ATR percentile <= 30 (calm), RSI >= 78, close > SMA200 * 1.5
- **Breakdown**: ATR percentile >= 70 (high vol), SMA5 < SMA20, close < SMA20

Regimes are mutually exclusive within a single bar.

## Inputs

- BTC/USD daily OHLCV history from the shared backend loader
- default dataset:
  `backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json`
- backend `BacktestConfig` fees, with taker fees as the official validation
  profile
- indicators: SMA5, SMA20, SMA50, SMA200, RSI14, ATR14, ATR 180d percentile

## Entry

| Setup | Direction | Exposure | Conditions |
|-------|-----------|----------|------------|
| panic_long | LONG | 8% equity | ATR% >= 80, RSI <= 38, close < SMA50 |
| compression_long | LONG | 18% equity | ATR% <= 20, RSI > 50, close > SMA50 |
| euphoria_short | SHORT | 6% equity | ATR% <= 30, RSI >= 78, close > SMA200 * 1.5 |
| breakdown_short | SHORT | 12% equity | ATR% >= 70, SMA5 < SMA20, close < SMA20 |

Only one position at a time. No leverage.

## Invalidation / Exit

**LONG exits** (any trigger):
- RSI > 58 (profit: mean reversion complete)
- drawdown >= 14% from trade peak close (stop loss)
- 25 days in trade (time stop)

**SHORT exits** (any trigger):
- RSI < 48 (profit: mean reversion complete)
- drawdown >= 10% from trade peak close (stop loss)
- 12 days in trade (time stop)

## Risk

- official smoke profile uses **500 USD**
- official risk fraction is **0.18** (max per position)
- per-setup exposure: 8% (panic), 18% (compression), 6% (euphoria), 12%
  (breakdown)
- max one position (long or short)
- no leverage
- no live trading or production routing

## Costs

Official backtests use Hyperliquid-style taker fees through the existing backend
fee model. Short positions pay entry fee on notional and exit fee on buyback
notional.

## Validation

Paper review is allowed only if backend validation returns `ready-for-paper`.
The strategy must beat the comparable champion:

- champion strategy: `btc_convex_cycle_trend`
- champion profile: `500_usd_validated`
- champion return: `115.78%`

Initial gates:

- net backtest return must exceed `116.0%`
- at least `15` closed trades
- profit factor at least `1.8`
- win rate at least `35%`
- max drawdown at or below `22%`

Commands:

```bash
rtk npm run hf:backtest -- --strategy btc_convex_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.25 --equity 500
rtk npm run hf:backtest -- --strategy btc_asymmetric_vol_carry --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.18 --equity 500
rtk npm run hf:validate -- --strategy btc_asymmetric_vol_carry --report <report>
rtk npm run hf:paper -- --strategy btc_asymmetric_vol_carry --report <report> --validation <validation>
```

## Failure Modes

- **Sustained bull markets**: Short euphoria entries may get stopped out
  repeatedly as BTC continues rallying with low volatility.
- **Cascading crashes**: Panic long entries may catch a falling knife if the
  sell-off is a structural breakdown rather than a healthy correction.
- **Low volatility grind**: Compression signals may fire on false breakouts in
  directionless markets.
- **Parameter sensitivity**: ATR percentile thresholds and RSI boundaries may
  need recalibration as BTC's vol profile changes over time.
- **Short bias risk**: Short positions have asymmetric downside in a
  long-biased asset like BTC.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/btc_asymmetric_vol_carry/`
- `backend/hyperliquid_gateway/strategies/btc_asymmetric_vol_carry/backtest.py`
- `backend/hyperliquid_gateway/backtesting/registry.py`
