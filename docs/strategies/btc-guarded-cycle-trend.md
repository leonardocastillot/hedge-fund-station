# BTC Guarded Cycle Trend

BTC Guarded Cycle Trend is a BTC-only daily trend strategy. It attempts to
capture structural BTC upside with partial exposure while using simple cycle
guards to avoid turning a spot accumulation thesis into an unbounded execution
claim.

## Hypothesis

BTC has historically produced most of its long-horizon return during broad
cycle uptrends. A daily filter using price above SMA150, SMA50 above SMA150, and
RSI14 above a low momentum floor can participate in those regimes without the
high taker-fee churn that blocked the local scalper strategies.

## Market Regime

Active when BTC is in a broad daily uptrend:

- close is above SMA150
- SMA50 is above SMA150
- RSI14 is above `42`

Stand aside when BTC loses the slow trend or enters a deep cycle drawdown.

## Inputs

- BTC/USD daily OHLCV history from the shared backend loader
- default dataset: `backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json`
- `BacktestConfig` fee model, with taker fees as the default validation path

## Entry

Enter long on the daily close when:

- close > SMA150
- SMA50 > SMA150
- RSI14 > 42
- no matching BTC guarded-cycle position is open

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

- default exposure is capped at `10%` of equity
- `config.risk_fraction` may reduce exposure but cannot increase it above 10%
- max one BTC guarded-cycle position
- no leverage assumption beyond the notional exposure used in the simulator
- no live trading or production routing

## Official 500 USD Profile

Profile ID: `500_usd_validated`.

This is the operator-sized profile for deciding whether the strategy deserves
more capital later:

- `initial_equity`: `500 USD`
- `risk_fraction`: `0.10`
- estimated first position size: `50 USD`
- fee model: taker
- leverage: none
- shorts: none
- max matching BTC guarded-cycle position: `1`
- external loss cap: the allocated `500 USD`; do not add capital to rescue a
  failed profile

The 500 USD profile preserves the validated strategy shape instead of creating
a larger untested exposure. Its purpose is evidence collection and capital
discipline, not frequent income. On the current multi-year BTC daily sample
from 2014-09-17 through 2026-05-13, this profile returned `89.53%` net after
fees, ending at `947.65 USD` from `500 USD`, across `48` trades with `2.93`
profit factor and `8.79%` max drawdown.

Official profile evidence:

- backtest:
  `backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T181241Z.json`
- validation:
  `backend/hyperliquid_gateway/data/validations/btc_guarded_cycle_trend-20260513T181246Z.json`
- paper candidate:
  `backend/hyperliquid_gateway/data/paper/btc_guarded_cycle_trend-20260513T181250Z.json`
- stability audit:
  `backend/hyperliquid_gateway/data/audits/btc_guarded_cycle_trend-doubling-stability-20260513T181253Z.json`

## Research-Only Leverage Variants

Leverage must not change the `500_usd_validated` profile. Any `2x` or `3x`
variant is research-only until it has separate backtest, validation, paper, and
stability evidence.

Block a leveraged variant if any of these are true:

- max drawdown is above `15%`
- worst closed trade loses more than `50 USD` on `500 USD` equity
- robust assessment fails
- any multi-year stability slice is fragile or negative
- paper review has not proved drift, fills, and operator controls are stable

## Costs

Backtests use the existing backend fee model. The paper target path uses
Hyperliquid-style taker fees unless the operator explicitly runs a different
fee model for research comparison.

## Validation

Paper review is allowed only if backend validation returns `ready-for-paper`.
Initial gates:

- net backtest return at least `50%`
- at least `10` closed trades
- profit factor at least `2.0`
- win rate at least `40%`
- max drawdown at or below `25%`
- robust gate passes on return, trade count, profit factor, drawdown, average
  trade return, and largest-trade concentration

Commands:

```bash
rtk npm run hf:backtest -- --strategy btc_guarded_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.10
rtk npm run hf:backtest -- --strategy btc_guarded_cycle_trend --dataset backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json --fee-model taker --risk-fraction 0.10 --equity 500
rtk npm run hf:validate -- --strategy btc_guarded_cycle_trend --report <report>
rtk npm run hf:paper -- --strategy btc_guarded_cycle_trend --report <report> --validation <validation>
rtk npm run hf:paper:loop -- --strategy btc_guarded_cycle_trend --dry-run --max-ticks 1 --interval-seconds 1
```

## Failure Modes

- BTC buy-and-hold may outperform in full-cycle bull markets.
- Daily close exits can react late during violent crashes.
- A single long BTC history can overstate robustness if future cycle structure
  changes.
- Paper runtime depends on daily history freshness, so it must not be treated
  as high-frequency execution.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/btc_guarded_cycle_trend/`
- `backend/hyperliquid_gateway/strategies/btc_guarded_cycle_trend/backtest.py`
- `backend/hyperliquid_gateway/backtesting/registry.py`
