# BTC Multi-Timeframe Trend Ensemble

## Hypothesis
Trend-following robustness improves when signals from multiple independent timeframes vote in consensus. No single MA pair captures all regimes, but an ensemble of 4 pairs filters noise without overfitting.

## Edge
- **Ensemble voting** filters false trends better than any single MA pair
- **Smooth vol scaling** avoids step-function regime boundaries
- **Structure-break exit** catches trend deterioration before price-level invalidation
- **Conviction sizing** allocates more capital when consensus is stronger

## Market Regime
Bull trending, pullback-in-trend, moderate vol. Fails in: extended chop/no-trend (score < 3/4), extreme vol (ATR pct > 85), structural bear (close < MA200).

## Inputs
BTC/USD daily OHLCV (Yahoo Finance primary).

## Entry
Long when:
- Trend score >= 3/4 (consensus from 4 MA pairs)
- RSI 14 between 40 and 75
- ATR percentile < 85
- AND pullback (price between MA20/MA50, RSI < 58) OR momentum (price > MA20, MA20 slope > 0.1%, RSI >= 48)

## Invalidation
- ATR trailing stop: `2.5 + atr_pct * 0.035` (smooth 2.5x-6.0x range)
- Trend structure break: trend score drops to <= 1
- Time stop: 250 days

## Exit
Same as invalidation: first trigger exits.

## Risk
| Parameter | Value |
|---|---|
| Position sizing | Smooth inverse vol + conviction bonus |
| Max exposure | 25% of equity |
| Stop loss | ATR trailing (vol-scaled) |
| Max drawdown target | < 22% |

## Costs
Taker fee 0.045% per leg on Yahoo daily simulation. No slippage model.

## Validation
- Backtest: 500 USD taker, BTC daily Yahoo (2014-2026)
- Min trades: 8
- Min return: champion (263.78%)
- Min profit factor: 2.0
- Max drawdown: 22%

## Failure Modes
- Extended sideways with noise giving false trend score >= 3
- Gap moves exceeding ATR stop distance
- Regime shifts faster than MA crossover response (2020 crash, 2022 unwind)

## Backend Mapping
Module: `backend/hyperliquid_gateway/strategies/btc_multiframe_trend_ensemble/`
