# BTC Failed Impulse Reversal

## Name

BTC Failed Impulse Reversal - BTC-only counter-impulse strategy that fades a
one-hour move after fifteen-minute follow-through stalls.

## Hypothesis

BTC short-horizon perp moves often overshoot when a one-hour impulse attracts
late leverage, but the next fifteen minutes fail to extend. Fading that failed
follow-through can capture the retrace with fewer, longer-held trades than the
existing scalpers.

## Market Regime

Works best in:

- Liquid BTC Hyperliquid perps with stable volume and open interest.
- Choppy or two-way sessions where one-hour impulse traders are late.
- Markets where the 4h move is not already extremely extended.
- Windows where a wider target can cover taker fees and deterministic
  slippage.

Avoid in:

- Clean trend expansion where every stalled 15m candle is only a pause.
- Thin or stale snapshot data.
- Event/news moves where a one-hour impulse is information-driven.
- Live production. This is research/backtesting only until paper evidence and
  operator sign-off exist.

## Inputs

- Hyperliquid gateway `market_snapshots`.
- BTC price sampled into 5m buckets.
- 5m, 15m, 1h, and 4h displacement.
- 24h volume, open interest, funding rate, and funding percentile.
- Crowding bias, primary setup, opportunity score, and setup score JSON for
  explainability and ranking.

## Entry

Long entry:

- Symbol is BTC.
- Price, volume, and open interest are valid and liquid.
- 1h price change is at or below -0.30%.
- 15m price change is no worse than -0.08%, meaning downside follow-through is
  failing.
- 4h absolute extension is no greater than 5.0%.
- No BTC position is already open and cooldown has expired.

Short entry:

- Symbol is BTC.
- Price, volume, and open interest are valid and liquid.
- 1h price change is at or above +0.30%.
- 15m price change is at or below -0.18%, meaning upside follow-through has
  reversed rather than merely paused.
- 4h absolute extension is no greater than 5.0%.
- No BTC position is already open and cooldown has expired.

## Invalidation

- 0.65% stop from entry.
- 8h time stop.
- One open BTC position maximum.
- 15m cooldown after winning or neutral exits.
- 30m cooldown after a losing exit.

## Exit

- Take profit at 1.75%.
- Stop loss at 0.65%.
- Time stop after 480 minutes.
- Forced close at dataset end for replay completeness.

## Risk

- Baseline notional size is 10% of equity and remains capped by the shared
  backtest `risk_fraction`.
- One BTC position at a time.
- No live trading, credential use, or production routing is allowed from this
  package.
- A future paper candidate is allowed only if validation returns
  `ready-for-paper`.

## Costs

- Hyperliquid Tier 0 taker fees are modeled as 0.045% per side by default.
- Maker and mixed fee models are available through the shared backtest config,
  but the primary validation uses taker/taker.
- Deterministic adverse slippage is applied at entry and exit, scaled by
  execution quality.

Sources:

- Hyperliquid fees: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees
- Hyperliquid funding: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding

## Validation

Run:

```bash
npm run hf:backtest -- --strategy btc_failed_impulse_reversal --symbol BTC --fee-model taker --lookback-days 3
npm run hf:validate -- --strategy btc_failed_impulse_reversal --report <primary_report>
```

Initial gates:

- At least 8 trades.
- Return above 0.50%.
- Profit factor at least 1.50.
- Win rate at least 55%.
- Max drawdown at or below 4.0%.
- Robust assessment must pass, including average net trade return and
  concentration checks.

Paper candidate generation is allowed only when validation returns
`ready-for-paper`.

## Failure Modes

- The one-hour impulse is the start of a real trend, not an overshoot.
- The backtest overfits a short three-day bullish local sample.
- Low trade count hides future regime weakness.
- Snapshot close sampling misses intrabar stop/target path.
- Wider stops create lower observed drawdown in short samples than live trading
  would experience.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/`
- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/backtest.py`
- `backend/hyperliquid_gateway/backtesting/registry.py`
