# short-squeeze-continuation

## Name

Short Squeeze Continuation

## Hypothesis

When shorts are crowded, funding is negative or recently normalized, price impulsively reclaims structure, and microstructure confirms aggression, continuation moves can persist long enough for repeatable short-horizon trades.

## Market Regime

Works best in:

- trend expansion
- squeeze regime
- strong rotation after crowding build-up

Avoid in:

- low-liquidity chop
- post-move exhaustion without follow-through
- event-driven disorder with unstable spread and fills

## Inputs

- price displacement
- open interest delta
- funding rate percentile
- liquidation pressure
- orderbook imbalance
- trade-flow imbalance
- recent alert state

## Entry

Define exact trigger conditions here.

## Invalidation

Define structure loss, flow reversal, or time-based invalidation here.

## Exit

Define target, trailing, and time-stop rules here.

## Risk

Define sizing, max concurrent exposure, and kill-switches here.

## Costs

Define fee, slippage, and latency assumptions here.

## Validation

- replay
- paper trade journal
- by-regime analysis
- by-liquidity analysis

## Failure Modes

- fake squeeze into resistance
- poor fill quality
- OI expansion without trapped shorts
- low-liquidity overshoot then reversal

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/short_squeeze_continuation/`
