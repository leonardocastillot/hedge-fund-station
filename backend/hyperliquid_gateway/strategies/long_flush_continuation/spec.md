# Long Flush Continuation

Backend strategy package for short continuation after crowded longs start
losing control.

## Hypothesis

When longs are crowded or long-flush pressure is high, funding is positive or
high, price breaks downward, and open interest remains elevated, forced long
exits can continue the downside move over the next 5 to 120 minutes.

## Inputs

- Hyperliquid gateway `market_snapshots`
- price, 1h/4h/24h displacement, OI, funding, volume
- `crowdingBias`
- score-derived long-pressure proxy from `longFlush`, `fade`, and funding
- setup score JSON, especially `longFlush` and `fade`

## Deterministic Rules

Entry requires most of:

- high or positive funding
- `crowdingBias == "longs-at-risk"` or high score-derived long pressure
- negative price impulse
- OI not collapsing
- liquid market
- `longFlush` or `fade` score confirmation
- opportunity score threshold

The backtest opens short positions only when `evaluate_signal()` returns
`short`.

## Risk And Exit

- stop loss: 0.8% above entry
- take profit: 1.4% below entry
- exit on OI collapse greater than 6% from entry
- exit on pressure fade after one hour
- time stop after 120 minutes
- max three concurrent replay positions

## Promotion State

Research and backtesting only. Paper candidate creation is allowed only after
validation returns `ready-for-paper`. Live trading, credentials, production
routing, and promotion are out of scope.
