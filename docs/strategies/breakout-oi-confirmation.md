# Breakout OI Confirmation

Continuation candidate that follows liquid breakouts only when open interest
expands with the move.

## Hypothesis

Breakouts with rising open interest can persist longer than simple price-only
breakouts because new risk is entering in the direction of the move. The edge is
not the breakout alone; it is the combination of displacement, OI confirmation,
liquidity, and the gateway's existing `breakoutContinuation` setup score.

## Market Regime

Best in trend expansion or early crowded-trend regimes where momentum has room
to continue. Avoid chop, late exhaustion, news whipsaws, and cases where the
gateway marks fade pressure as dominant.

## Inputs

- Hyperliquid gateway `market_snapshots`
- price, 5m/15m/1h/4h displacement derived from snapshots
- open interest and 1h OI delta
- funding rate and local funding percentile
- 24h volume and opportunity score
- crowding bias, primary setup, and setup scores
- existing `breakoutContinuation`, `fade`, `shortSqueeze`, and `longFlush`
  scores

V1 does not use raw orderbook or trade-aggression data unless those fields are
persisted later.

## Entry

Go long when upside displacement, OI expansion, sufficient liquidity, a strong
breakout score, and acceptable funding/crowding context align.

Go short when downside displacement, OI expansion, sufficient liquidity, a
strong breakout score, and acceptable funding/crowding context align.

## Invalidation

- dynamic stop is touched
- OI confirmation contracts materially after entry
- 15m price action reverses against the breakout
- trade has no progress after 25 minutes
- trade reaches 90 minute time stop
- symbol enters cooldown after a losing trade

## Exit

Use dynamic stop/target levels from backend risk logic. High-quality setups use
tighter stops and closer targets; weaker accepted setups use wider protection
and smaller sizing.

## Risk

Initial V1 sizing is intentionally small: 0.5% to 1.0% of portfolio value per
position depending on execution quality, capped by the backtest risk fraction.
Max concurrent positions is 3, with one open position per symbol.

## Costs

Backtests use Hyperliquid-style taker fees by default through the shared
`BacktestConfig`, plus deterministic slippage based on execution quality. The
strategy should be rejected or revised if average net trade return does not
survive fees and slippage.

## Validation

Initial validation thresholds:

- min trades: 20
- min return: 0.15%
- min profit factor: 1.15
- min win rate: 40%
- max drawdown: 6.0%

Passing validation only allows paper review. It does not allow live trading.

## Failure Modes

- OI expands because late entrants are being trapped, not because continuation
  is healthy.
- Funding is already stretched and the breakout becomes an exhaustion wick.
- Snapshot cadence misses the real microstructure turn.
- Fees and slippage consume small continuation moves.
- Results depend on one symbol, one exit reason, or one large trade.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/breakout_oi_confirmation/logic.py`
- `backend/hyperliquid_gateway/strategies/breakout_oi_confirmation/scoring.py`
- `backend/hyperliquid_gateway/strategies/breakout_oi_confirmation/risk.py`
- `backend/hyperliquid_gateway/strategies/breakout_oi_confirmation/backtest.py`
- `backend/hyperliquid_gateway/strategies/breakout_oi_confirmation/paper.py`
