# BTC Adaptive Cycle Trend

BTC Adaptive Cycle Trend is a BTC-only daily trend strategy. It competes
against the current paper-ready 500 USD benchmark from
`btc_guarded_cycle_trend`, which returned `89.53%` net after taker fees.

## Hypothesis

BTC has historically concentrated long-horizon upside in broad cycle uptrends.
The existing guarded-cycle filter proves this can be paper-candidate quality at
10% exposure. Adaptive Cycle Trend tests whether exposure can increase only
during cleaner daily trend regimes while staying long-only, unlevered, and
reviewable.

## Market Regime

Base active regime:

- close > SMA150
- SMA50 > SMA150
- RSI14 > `42`

Strong adaptive regime:

- base regime passes
- close > SMA50
- RSI14 is between `50` and `75`
- 180-day close drawdown is at or below `25%`

Stand aside when BTC loses the slow trend or enters a deep cycle drawdown.

## Inputs

- BTC/USD daily OHLCV history from the shared backend loader
- default dataset: `backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json`
- `BacktestConfig` fee model, with taker fees as the official validation path

## Entry

Enter long on the daily close when the base regime passes and no matching BTC
adaptive-cycle position is open.

Sizing is adaptive:

- `20%` of equity when the strong adaptive regime passes
- `10%` of equity when only the base regime passes
- `0%` when no entry signal exists

The strategy is long-only. It does not short BTC.

## Invalidation

Exit when any guard triggers:

- close is at least `15%` below the trade peak close
- close < SMA150 * `0.96` and SMA50 < SMA150
- 180-day close drawdown > `45%` and RSI14 < `35`

## Exit

There is no fixed take-profit. Profitable trades remain open until the trailing
or regime guard exits. Dataset-end positions are force-closed in the backtest.

## Risk

- official operator profile starts with `500 USD`
- `risk_fraction=0.20`
- first position maximum is `100 USD`
- max one BTC adaptive-cycle position
- no leverage
- no shorts
- no live trading or production routing

## Costs

Official backtests use Hyperliquid-style taker fees through the existing backend
fee model.

## Validation

Paper review is allowed only if backend validation returns `ready-for-paper`.
The new strategy must beat the existing paper-ready benchmark:

- benchmark strategy: `btc_guarded_cycle_trend`
- benchmark profile: `500_usd_validated`
- benchmark return: `89.53%`

Initial gates:

- net backtest return must exceed `89.53%`
- registry threshold uses `90.0%` minimum return
- at least `10` closed trades
- profit factor at least `2.0`
- win rate at least `40%`
- max drawdown at or below `20%`
- robust gate passes on return, trade count, profit factor, drawdown, average
  trade return, and largest-trade concentration

Commands:

```bash
rtk npm run hf:market-data:btc-daily -- --start 2014-09-17 --force
rtk npm run hf:backtest -- --strategy btc_guarded_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.10 --equity 500
rtk npm run hf:backtest -- --strategy btc_adaptive_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.20 --equity 500
rtk npm run hf:validate -- --strategy btc_adaptive_cycle_trend --report <report>
rtk npm run hf:paper -- --strategy btc_adaptive_cycle_trend --report <report> --validation <validation>
rtk npm run hf:doubling:stability -- --strategy btc_adaptive_cycle_trend --report <report> --validation <validation>
rtk npm run hf:paper:loop -- --strategy btc_adaptive_cycle_trend --dry-run --portfolio-value 500 --max-ticks 1 --interval-seconds 1
```

Official implementation evidence:

- BTC data refresh:
  `backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json`
  refreshed with `4,257` rows from `2014-09-17` through `2026-05-13`
- benchmark backtest:
  `backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T183751Z.json`
- new strategy backtest:
  `backend/hyperliquid_gateway/data/backtests/btc_adaptive_cycle_trend-btc_usd_daily_yahoo-20260513T183755Z.json`
- validation:
  `backend/hyperliquid_gateway/data/validations/btc_adaptive_cycle_trend-20260513T183803Z.json`
- paper candidate:
  `backend/hyperliquid_gateway/data/paper/btc_adaptive_cycle_trend-20260513T183807Z.json`
- stability audit:
  `backend/hyperliquid_gateway/data/audits/btc_adaptive_cycle_trend-doubling-stability-20260513T183812Z.json`

Official result: `94.39%` net return after fees, ending at `971.97 USD` from
`500 USD`, across `48` trades with `2.59` profit factor, `41.67%` win rate,
`11.13%` max drawdown, and `4.86` percentage points of excess return over the
paper-ready benchmark.

## Failure Modes

- Adaptive sizing may amplify drawdowns if the strong-regime filter is too
  permissive.
- Daily close exits can react late during violent crashes.
- BTC buy-and-hold may outperform in full-cycle bull markets.
- A single long BTC history can overstate robustness if future cycle structure
  changes.
- Paper runtime depends on daily history freshness, so it must not be treated
  as high-frequency execution.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/btc_adaptive_cycle_trend/`
- `backend/hyperliquid_gateway/strategies/btc_adaptive_cycle_trend/backtest.py`
- `backend/hyperliquid_gateway/backtesting/registry.py`
