# BB Squeeze ADX

## Name

BB Squeeze ADX - volatility compression breakout with trend-strength confirmation

## Hypothesis

When Bollinger Bands contract inside Keltner Channels and then release into a breakout with ADX already elevated, volatility expansion can continue far enough to cover costs and produce short-horizon trend trades.

## Market Regime

Works best in:
- liquid trend transitions
- post-compression expansion
- symbols with clean directional follow-through

Avoid in:
- flat chop after squeeze release
- illiquid symbols with poor candle quality
- structurally mean-reverting sessions

## Inputs

- OHLCV candles
- Bollinger Bands over close
- Keltner Channels using ATR
- ADX trend-strength filter

## Entry

- detect squeeze when Bollinger Bands sit inside Keltner Channels
- mark a release when squeeze changes from on to off
- after release, enter long if close breaks above upper Bollinger Band and ADX >= 25
- after release, enter short if close breaks below lower Bollinger Band and ADX >= 25

## Invalidation

- hard stop at 3% from entry
- forced close at dataset end in milestone 1 backtests

## Exit

- take profit at 5%
- stop loss at 3%
- milestone 1 keeps one position at a time for deterministic baseline reporting

## Risk

- baseline risk fraction: 10% of equity per trade in the local backtest harness
- paper and production sizing must be tightened later through gateway-level heat controls

## Costs

- default fee model: Hyperliquid perps Tier 0 taker 4.5 bps per side unless maker/mixed fees are explicitly configured
- milestone 1 does not model slippage yet

## Validation

- donor audit documents source material
- run backend backtest against explicit CSV datasets
- inspect JSON trade ledger and equity curve
- only promote to paper after report review

## Failure Modes

- false breakout right after squeeze release
- ADX lag confirming too late
- profit target too far for current volatility
- dataset regime mismatch

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/bb_squeeze_adx/`
- `backend/hyperliquid_gateway/backtesting/`
