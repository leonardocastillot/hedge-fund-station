# BTC Convex Cycle Trend

BTC Convex Cycle Trend is a BTC-only daily trend strategy created by the
manual Strategy Factory smoke test. It competes directly against
`btc_adaptive_cycle_trend`, the current BTC daily 500 USD paper-ready champion
with `94.39%` net return after taker fees.

## Hypothesis

BTC cycle upside is concentrated in clean daily uptrends. The current adaptive
strategy proved that partial exposure can pass paper gates. Convex Cycle Trend
tests whether a slightly larger unlevered allocation, activated only when
trend, RSI, drawdown, and 30-day momentum filters align, can improve the
champion result without breaking drawdown and robustness limits.

## Market Regime

Base active regime:

- close > SMA150
- SMA50 > SMA150
- RSI14 > `42`

Convex regime:

- base regime passes
- close > SMA50
- RSI14 between `48` and `76`
- 180-day close drawdown <= `28%`
- 30-day close momentum >= `-4%`

The strategy stands aside when BTC loses the slow trend, suffers a deep cycle
drawdown, or lacks enough daily history.

## Inputs

- BTC/USD daily OHLCV history from the shared backend loader
- default dataset:
  `backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json`
- backend `BacktestConfig` fees, with taker fees as the official validation
  path

## Entry

Enter long on the daily close when the base regime passes and no matching BTC
convex-cycle position is open.

Sizing:

- `25%` of equity in the convex regime
- `12%` of equity in the base regime
- `0%` when no entry signal exists

The strategy is long-only, unlevered, and BTC-only.

## Invalidation

Exit when any guard triggers:

- close is at least `15%` below the trade peak close
- close < SMA150 * `0.96` and SMA50 < SMA150
- 180-day close drawdown > `45%` and RSI14 < `35`

## Exit

There is no fixed take-profit. Profitable trades stay open until a trailing,
slow-trend, crash, or dataset-end forced-close exit.

## Risk

- official smoke profile uses `500 USD`
- official risk fraction is `0.25`
- max first position is `125 USD`
- max one BTC convex-cycle position
- no leverage
- no shorts
- no live trading or production routing

## Costs

Official backtests use Hyperliquid-style taker fees through the existing backend
fee model.

## Validation

Paper review is allowed only if backend validation returns `ready-for-paper`.
The strategy must beat the comparable champion:

- champion strategy: `btc_adaptive_cycle_trend`
- champion profile: `500_usd_validated`
- champion return: `94.39%`

Initial gates:

- net backtest return must exceed `95.0%`
- at least `10` closed trades
- profit factor at least `2.0`
- win rate at least `40%`
- max drawdown at or below `20%`

Commands:

```bash
rtk npm run hf:backtest -- --strategy btc_adaptive_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.20 --equity 500
rtk npm run hf:backtest -- --strategy btc_convex_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.25 --equity 500
rtk npm run hf:validate -- --strategy btc_convex_cycle_trend --report <report>
rtk npm run hf:paper -- --strategy btc_convex_cycle_trend --report <report> --validation <validation>
```

## Failure Modes

- The larger convex exposure can amplify BTC daily trend drawdowns.
- The 30-day momentum floor may still admit late-cycle exhaustion.
- Daily close exits can react slowly during violent crashes.
- A single BTC cycle history can overfit if future market structure changes.
- The strategy may underperform buy-and-hold in long uninterrupted bull markets.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/btc_convex_cycle_trend/`
- `backend/hyperliquid_gateway/strategies/btc_convex_cycle_trend/backtest.py`
- `backend/hyperliquid_gateway/backtesting/registry.py`
