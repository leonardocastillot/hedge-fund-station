# Short Squeeze Continuation

## Name

Short Squeeze Continuation - long continuation after trapped shorts start losing control.

## Hypothesis

When shorts are crowded, funding is negative or low, price reclaims upward, and open interest does not collapse, forced short covering can continue long enough to cover fees and produce short-horizon long trades.

## Market Regime

Works best in:

- squeeze and trend-expansion regimes
- liquid Hyperliquid perps with strong 24h volume
- markets where shorts remain crowded after the first impulse

Avoid in:

- low-liquidity chop
- post-move exhaustion without fresh follow-through
- events where spread, fills, and orderbook depth are unstable

## Inputs

- gateway `market_snapshots` from `hyperliquid.db`
- price displacement over 1h and 4h
- open interest delta
- funding rate percentile
- crowding bias
- setup scores for short squeeze and breakout continuation
- volume and execution-quality proxy

## Entry

Enter long only when most of these align:

- funding is negative or in the lower percentile range
- crowding bias is `shorts-at-risk`
- price has a positive 1h or 4h impulse
- open interest is stable instead of collapsing
- 24h volume is above the liquidity threshold
- short-squeeze or breakout-continuation setup score confirms
- opportunity score clears the backend threshold

## Invalidation

- hard stop at 0.8% below entry
- open interest drops more than 6% from entry
- crowding flips away from `shorts-at-risk`
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

- default gateway backtest fee model: Hyperliquid perps Tier 0 taker 4.5 bps per side unless maker/mixed fees are explicitly configured
- deterministic slippage proxy based on execution quality
- production validation still needs orderbook and trade-flow replay

## Validation

- run `npm run hf:backtest -- --strategy short_squeeze_continuation`
- run `npm run hf:validate -- --strategy short_squeeze_continuation`
- inspect JSON backtest, validation, and paper candidate artifacts
- segment results by liquidity, funding percentile, and squeeze score before production review

## Failure Modes

- fake squeeze into resistance
- OI expansion without genuinely trapped shorts
- low-liquidity overshoot then reversal
- proxy setup score misses orderbook absorption
- costs overwhelm small continuation targets

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/short_squeeze_continuation/`
- `backend/hyperliquid_gateway/strategies/short_squeeze_continuation/backtest.py`
- `backend/hyperliquid_gateway/backtesting/registry.py`
