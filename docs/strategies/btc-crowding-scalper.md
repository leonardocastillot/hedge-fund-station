# BTC Crowding Scalper

## Name

BTC Crowding Scalper - high-frequency BTC-first long scalper around crowding tailwinds and micro impulse.

## Hypothesis

When shorts are at risk, funding is low or negative, price is already showing a small upward impulse, and open interest is not collapsing, a short-horizon long scalp can capture follow-through before the larger continuation setup matures.

## Market Regime

Works best in:

- liquid BTC perps with tight execution
- short-horizon squeeze or trend-expansion regimes
- markets where crowding data agrees with price impulse

Avoid in:

- low-liquidity chop
- wide-spread or event-driven candles
- overextended one-way moves where fees and slippage consume the scalp

## Inputs

- gateway `market_snapshots` from `hyperliquid.db`
- 5m, 15m, 1h, and 4h price displacement
- open-interest delta
- funding rate percentile
- crowding bias
- short-squeeze, breakout-continuation, and opportunity scores
- volume and execution-quality proxy

## Entry

Enter long only when most of these align:

- liquid market
- crowding tailwind from `shorts-at-risk`, low funding, or negative funding
- positive 5m/15m/1h impulse
- move is not overextended
- open interest is stable instead of collapsing
- setup score confirms the scalp

BTC is the default replay universe. Other symbols are only included when explicitly passed through `--symbols` or `--universe all`.

## Invalidation

- hard stop at 0.25% below entry
- no-progress exit after 10 minutes
- time stop after 20 minutes
- micro-reversal exit after short-horizon impulse fails
- 30-minute cooldown after losing scalps

## Exit

- take profit at 0.35%
- stop loss at 0.25%
- no-progress exit at 10 minutes
- time stop at 20 minutes
- forced close at dataset end

## Risk

- one open position maximum
- baseline size is 0.4% to 0.6% of portfolio depending on execution quality
- capped by shared backtest risk fraction
- post-loss cooldown protects against repeated chop losses

## Costs

- Hyperliquid perps Tier 0 fee model: taker 0.0450% per side, maker 0.0150% per side
- default backtests are conservative taker/taker unless a trade declares maker or a mixed fee model is requested
- deterministic slippage proxy is applied by execution quality

## Validation

- run `npm run hf:backtest -- --strategy btc_crowding_scalper --symbol BTC --fee-model taker`
- run `npm run hf:validate -- --strategy btc_crowding_scalper`
- inspect symbol leaderboard, exit reasons, robust gate blockers, and fee metadata
- only repeat on `BTC,ETH,SOL,HYPE` after the BTC-first result is understood

## Failure Modes

- micro impulse reverses before the target
- trade count rises but net edge disappears after taker fees
- repeated no-progress exits reveal chop rather than squeeze
- results depend on one window or one exit reason
- snapshot data lacks orderbook detail needed for final execution review

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/btc_crowding_scalper/`
- `backend/hyperliquid_gateway/strategies/btc_crowding_scalper/backtest.py`
- `backend/hyperliquid_gateway/backtesting/registry.py`
