# Liquidation Pressure Flip Reversal

Reversal candidate that fades stretched liquidation pressure only after the
recent impulse starts to fail.

## Hypothesis

Liquidation pressure can overshoot when crowded positioning is forced out. The
candidate looks for the point where pressure is visible, crowding is stretched,
and 5m/15m continuation starts to stall. The edge is a constrained reversal, not
a blind catch-the-knife trade.

## Market Regime

Best in mean-reversion or post-liquidation exhaustion regimes. Avoid strong
trend expansion, fresh breakout continuation, and macro/news windows where
liquidations can cascade without normal stall behavior.

## Inputs

- Hyperliquid gateway `market_snapshots`
- price, 5m/15m/1h/4h displacement derived from snapshots
- estimated liquidation pressure
- crowding bias and primary setup
- open interest and 1h OI delta
- funding rate and local funding percentile
- 24h volume and opportunity score
- existing `fade`, `longFlush`, `shortSqueeze`, and `breakoutContinuation`
  scores

V1 does not use raw orderbook or trade-aggression data unless those fields are
persisted later.

## Entry

Go long when downside liquidation pressure is visible, crowding or `longFlush`
pressure is stretched, and 5m/15m downside continuation starts to fail.

Go short when upside liquidation pressure is visible, crowding or `shortSqueeze`
pressure is stretched, and 5m/15m upside continuation starts to fail.

## Invalidation

- dynamic stop is touched
- the original liquidation impulse reasserts
- OI reloads aggressively with the original impulse
- trade has no progress after 20 minutes
- trade reaches 60 minute time stop
- symbol enters cooldown after a losing trade

## Exit

Use dynamic stop/target levels from backend risk logic. High-quality setups use
tighter stops and closer targets because the thesis is a fast pressure flip.

## Risk

Initial V1 sizing is intentionally small: 0.4% to 0.8% of portfolio value per
position depending on execution quality, capped by the backtest risk fraction.
Max concurrent positions is 3, with one open position per symbol.

## Costs

Backtests use Hyperliquid-style taker fees by default through the shared
`BacktestConfig`, plus deterministic slippage based on execution quality. The
strategy should be rejected or revised if reversal captures are too small after
fees and slippage.

## Validation

Initial validation thresholds:

- min trades: 15
- min return: 0.10%
- min profit factor: 1.20
- min win rate: 42%
- max drawdown: 5.5%

Passing validation only allows paper review. It does not allow live trading.

## Failure Modes

- A true liquidation cascade continues through the stall filters.
- Estimated liquidation pressure is stale, noisy, or too coarse.
- The strategy fades a real breakout continuation.
- Snapshot cadence enters late after the best reversal price.
- Results depend on one symbol, one exit reason, or one large trade.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/liquidation_pressure_flip_reversal/logic.py`
- `backend/hyperliquid_gateway/strategies/liquidation_pressure_flip_reversal/scoring.py`
- `backend/hyperliquid_gateway/strategies/liquidation_pressure_flip_reversal/risk.py`
- `backend/hyperliquid_gateway/strategies/liquidation_pressure_flip_reversal/backtest.py`
- `backend/hyperliquid_gateway/strategies/liquidation_pressure_flip_reversal/paper.py`
