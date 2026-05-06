# OI Expansion Failure Fade

## Name

OI Expansion Failure Fade - counter-impulse strategy for leveraged moves that
add open interest but lose short-term follow-through.

## Hypothesis

When a perp impulse expands open interest but then stalls over the next 5 to 15
minutes, fresh leveraged positioning may be trapped. Fading that failed impulse
can capture a short-horizon unwind if liquidity is acceptable and continuation
scores are not extreme.

## Market Regime

Works best in:

- Liquid Hyperliquid perps with active 24h volume and meaningful open interest.
- Short-horizon chop after a sharp one-hour impulse.
- `fade`-tagged setups where open interest is still rising.
- Markets where taker fees are still covered by a target near 0.85% to 1.10%.

Avoid in:

- Clean trend expansion where continuation scores remain extreme.
- Thin symbols where slippage can erase the edge.
- Market-wide liquidation cascades.
- Datasets with too few symbols or too short a replay window to separate
  symbol luck from strategy edge.

## Inputs

- `market_snapshots` from the gateway SQLite database.
- Price, 5m, 15m, 1h, and 4h displacement.
- Current open interest and one-hour open-interest delta.
- 24h volume and opportunity score.
- Funding rate and rolling funding percentile.
- `primary_setup`, `crowding_bias`, and `setup_scores_json`.
- Backtest fee model from the shared `BacktestConfig`.

## Entry

Long entry:

- 1h price impulse is down.
- Open interest is rising over 1h.
- `fade` score is at least 68 or `primary_setup == "fade"`.
- 5m or 15m price action shows downside follow-through is stalling.
- Volume is at least 10M USD and open interest is at least 1M USD.
- `longFlush` continuation score is not extreme.

Short entry:

- 1h price impulse is up.
- Open interest is rising over 1h.
- `fade` score is at least 68 or `primary_setup == "fade"`.
- 5m or 15m price action shows upside follow-through is stalling.
- Volume is at least 10M USD and open interest is at least 1M USD.
- `shortSqueeze` or breakout-continuation score is not extreme.

Default replay universe is `BTC,SOL,HYPE`. Other symbols are included only when
passed through `--symbols` or `--universe all`.

## Invalidation

- Stop loss between 0.45% and 0.65%, depending on execution quality.
- Exit when the original impulse reasserts in the last 15m.
- Exit after 20 minutes if the trade has not moved at least 0.12% in favor.
- Exit after 60 minutes if target is not reached.
- Pause a symbol for 30 minutes after a losing trade.

## Exit

- Take profit between 0.85% and 1.10%, depending on execution quality.
- Stop loss from the risk plan.
- No-progress exit after 20 minutes.
- Time stop after 60 minutes.
- Forced close at dataset end.

## Risk

- One open position per symbol.
- Maximum three concurrent positions.
- Baseline size is 0.5% to 0.8% of equity based on execution quality.
- Position size is capped by the shared backtest `risk_fraction`.
- No live trading or production promotion is allowed from this strategy package.

## Costs

- Hyperliquid perps Tier 0 base fees: 0.045% taker and 0.015% maker.
- Default backtests use taker/taker unless a maker or mixed fee model is passed.
- Slippage is deterministic and worsens when execution quality is poor.
- The strategy must clear fees and slippage before paper review is credible.

Sources:

- Hyperliquid fees: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees
- Hyperliquid funding: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding
- Open interest research: https://arxiv.org/abs/2310.14973
- Perpetual futures return anatomy: https://www.research.ed.ac.uk/en/publications/anatomy-of-cryptocurrency-perpetual-futures-returns/

## Validation

Run:

```bash
npm run hf:backtest -- --strategy oi_expansion_failure_fade --symbols BTC,SOL,HYPE --fee-model taker --lookback-days 3
npm run hf:backtest -- --strategy oi_expansion_failure_fade --symbols BTC,SOL,HYPE --fee-model mixed --maker-ratio 0.35 --lookback-days 3
npm run hf:validate -- --strategy oi_expansion_failure_fade --report <primary_report>
```

Paper candidate generation is allowed only when validation returns
`ready-for-paper`.

Initial validation gates:

- At least 30 trades.
- Return at least 0.10%.
- Profit factor at least 1.20.
- Win rate at least 42%.
- Max drawdown at or below 5.0%.

## Failure Modes

- The impulse is not actually exhausted and resumes through the stop.
- Rising OI reflects real trend participation, not trapped leverage.
- Results depend on one symbol, especially SOL or HYPE.
- Taker fees erase small mean-reversion targets.
- Snapshot data lacks orderbook depth and trade-flow detail needed for final
  execution review.
- Robust assessment fails because one exit reason or one trade dominates PnL.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/oi_expansion_failure_fade/`
- `backend/hyperliquid_gateway/strategies/oi_expansion_failure_fade/backtest.py`
- `backend/hyperliquid_gateway/backtesting/registry.py`
