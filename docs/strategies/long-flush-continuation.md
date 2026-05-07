# Long Flush Continuation

## Name

Long Flush Continuation - short continuation after crowded longs start losing
control.

## Hypothesis

When longs are crowded or long-flush pressure is high, funding is positive or
high, price breaks downward, and open interest does not immediately collapse,
forced long liquidation can keep pressure on the downside long enough to cover
fees and produce short-horizon short trades.

## Market Regime

Works best in:

- squeeze and trend-expansion regimes
- liquid Hyperliquid perps with strong 24h volume
- markets where longs remain crowded after the first downside impulse

Avoid in:

- low-liquidity chop
- post-flush exhaustion where OI has already vanished
- news spikes where spreads, fills, and orderbook depth are unstable

## Inputs

- gateway `market_snapshots` from `hyperliquid.db`
- price displacement over 1h and 4h
- open interest delta
- funding rate percentile
- crowding bias and score-derived long-pressure proxy
- setup scores for `longFlush` and `fade`
- volume and execution-quality proxy

## Entry

Enter short only when most of these align:

- funding is positive or in the higher percentile range
- crowding bias is `longs-at-risk` or `longFlush`/`fade` scores show long
  pressure before the label flips
- price has a negative 1h, 4h, or 24h impulse
- open interest is stable instead of collapsing
- 24h volume is above the liquidity threshold
- `longFlush` or `fade` setup score confirms
- opportunity score clears the backend threshold

## Invalidation

- hard stop at 0.8% above entry
- open interest drops more than 6% from entry
- crowding and long-pressure scores fade
- no target within 120 minutes

## Exit

- take profit at 1.4%
- stop loss at 0.8%
- time stop at 120 minutes
- forced close at dataset end

## Risk

- baseline size is 0.8% to 1.2% of portfolio depending on execution quality
- cap by the shared backtest risk fraction
- max three concurrent backend replay positions

## Costs

- default gateway backtest fee model: Hyperliquid perps Tier 0 taker 4.5 bps per
  side unless maker/mixed fees are explicitly configured
- deterministic slippage proxy based on execution quality
- production validation still needs orderbook and trade-flow replay

## Validation

- run `npm run hf:backtest -- --strategy long_flush_continuation`
- run `npm run hf:validate -- --strategy long_flush_continuation`
- inspect JSON backtest, validation, and paper candidate artifacts
- segment results by liquidity, funding percentile, long-flush score, and
  long-pressure persistence before production review

## Failure Modes

- fake flush into immediate reclaim
- OI expansion without genuinely trapped longs
- low-liquidity overshoot then violent bounce
- proxy setup score misses orderbook absorption
- costs overwhelm small continuation targets

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/long_flush_continuation/`
- `backend/hyperliquid_gateway/strategies/long_flush_continuation/backtest.py`
- `backend/hyperliquid_gateway/backtesting/registry.py`
