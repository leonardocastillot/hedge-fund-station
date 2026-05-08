# Paper Trade Review Criteria

Paper review maps observed outcomes back to strategy rules. It is not live
trading approval, and it must not enable routing, credentials, or production
promotion.

## Minimum Review Standard

Every closed paper trade used as evidence should answer:

- Which backend strategy or runtime setup created the trade?
- Did the entry match the strategy trigger?
- Did the invalidation rule remain clear during the trade?
- Was execution quality good enough for the strategy horizon?
- Did the exit follow the planned target, stop, time stop, or invalidation?
- What rule or filter should change, if any?

## Review Criteria

| Criterion | What To Check | Evidence |
| --- | --- | --- |
| Trigger quality | Signal direction, setup tag, score, setup fields, and trigger plan matched the strategy doc/backend `logic.py`. | Paper signal payload, latest backtest/validation artifact, strategy doc. |
| Invalidation discipline | Stop, time stop, crowding flip, OI collapse, failed continuation, or strategy-specific invalidation stayed explicit. | `invalidationPlan`, strategy `risk.py`, close reason, reviewer note. |
| Fill quality | Entry/exit price, size, slippage assumption, latency, execution quality, and missed fills were reasonable for the horizon. | Paper trade row, execution quality, market snapshot at entry/exit. |
| Drift from backtest | Paper return, profit factor, average trade return, drawdown, and trade frequency did not drift beyond the paper baseline. | `/api/hyperliquid/paper/readiness/{strategy_id}` and paper baseline. |
| Regime fit | Market regime matched the strategy's intended environment and avoided anti-regimes. | Strategy doc, liquidation pressure, funding/OI/volume context. |
| Lesson capture | The review records what to keep, tighten, remove, or retest. | `paper_trade_reviews` row and strategy learning event when durable. |

## Strategy Rule Mapping

| Strategy Or Setup | Trigger Focus | Invalidation Focus | Paper Review Focus |
| --- | --- | --- | --- |
| `btc_failed_impulse_reversal` | failed impulse, trap, and reversal confirmation | no progress, adverse continuation, crowding/flow flip | whether the reversal was real or only local noise |
| `btc_failed_impulse_balanced_fast` | faster balanced variant of failed impulse reversal | tight adverse move and no-progress guard | whether speed improved quality without overtrading |
| `btc_crowding_scalper` | frequent BTC crowding and execution-quality setups | small drawdown, poor fill, weak continuation | fees, slippage, and overtrading pressure |
| `short_squeeze_continuation` | shorts trapped with price staying bid | squeeze stalls or aggressive buyers disappear | continuation quality after the initial squeeze |
| `long_flush_continuation` | crowded longs failing to bounce | sellers fail to press lows or shorts lose momentum | downside follow-through after failed support |
| `oi_expansion_failure_fade` | OI expands without price follow-through | trend expansion resumes with volume/OI | whether the fade is exhaustion or early trend fighting |
| `funding_exhaustion_snap` | extreme funding with exhaustion context | funding normalizes, OI collapses, momentum re-accelerates | whether snapback timing is realistic |
| Polymarket BTC 5m strategies | extreme edge, price bucket, spread, and fill assumptions | basis weakens, spread collapses, event/expiry risk rises | conservative fill quality and fee-adjusted expectancy |

## Promotion Boundary

The current paper baseline requires at least 14 calendar days, 30 closed
matching paper trades, 90% review coverage, positive fee-adjusted paper return,
profit factor above threshold, average-trade drift checks, drawdown guard,
regime review, risk review, and operator sign-off.

Even after those checks, production remains blocked until a human creates and
approves a separate live gate package with monitoring, kill-switches, rollback,
and runbook evidence.
