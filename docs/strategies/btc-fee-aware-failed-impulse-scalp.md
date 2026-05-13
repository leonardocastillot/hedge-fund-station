# BTC Fee-Aware Failed Impulse Scalp

## Name

BTC Fee-Aware Failed Impulse Scalp - BTC-only scalp that fades late failed
impulses only when the expected move clears taker costs.

## Hypothesis

BTC perp impulses can attract late leveraged flow. If the one-hour move stalls
over the next fifteen minutes while open interest is stable or rising, the late
side may be trapped. A small counter-impulse scalp can be viable only when the
target is wide enough to clear fees and deterministic slippage.

## Market Regime

Works best in:

- liquid BTC Hyperliquid perps
- choppy or two-way sessions after a visible one-hour impulse
- stable or rising open interest during the impulse
- funding, crowding, or setup scores that identify the trapped side

Avoid in:

- clean trend expansion
- low-liquidity or stale snapshot windows
- event-driven candles
- windows where BTC buy-and-hold dominates the strategy after fees

## Inputs

- Hyperliquid gateway `market_snapshots`
- BTC price sampled into 5m buckets
- 5m, 15m, 1h, and 4h displacement
- 1h and 4h open-interest delta
- volume, open interest, funding rate, and funding percentile
- crowding bias, primary setup, and setup score JSON
- fee model from the shared `BacktestConfig`

## Entry

Long entry:

- BTC only
- 1h price impulse is down at least `0.30%`
- 15m downside follow-through has failed, at least `-0.06%`
- 5m price is not reaccelerating down worse than `-0.10%`
- open interest is stable or rising
- funding/crowding/setup scores suggest shorts are trapped
- 4h extension is not extreme
- target edge clears round-trip taker fees

Short entry:

- BTC only
- 1h price impulse is up at least `0.30%`
- 15m upside follow-through has failed, at most `0.06%`
- 5m price is not reaccelerating up stronger than `0.10%`
- open interest is stable or rising
- funding/crowding/setup scores suggest longs are trapped
- 4h extension is not extreme
- target edge clears round-trip taker fees

## Invalidation

- `0.45%` stop
- no-progress exit after `20` minutes without `0.12%` favorable movement
- impulse reassertion exit if 15m movement resumes against the fade
- `90` minute max hold
- one BTC position at a time
- post-exit cooldown; longer after losses

## Exit

- take profit at `0.90%`
- stop loss at `0.45%`
- no-progress exit after `20` minutes
- time stop after `90` minutes
- forced close at dataset end

## Risk

- baseline size is `6%` of equity, capped by shared backtest `risk_fraction`
- one BTC position maximum
- no live trading, credential use, or production routing from this package
- paper candidate only if validation returns `ready-for-paper`

## Costs

- conservative baseline uses Hyperliquid taker/taker fees: `0.045%` per side
- maker and mixed fee models can be tested, but mixed maker-ratio runs are
  maker-feasibility evidence only
- deterministic slippage is applied by execution quality

Sources:

- Hyperliquid fees: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees
- Hyperliquid funding: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding
- Hyperliquid order types: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types
- Open interest caution: https://arxiv.org/abs/2310.14973
- Perpetual futures return factors: https://www.research.ed.ac.uk/en/publications/anatomy-of-cryptocurrency-perpetual-futures-returns/

## Validation

Run the local smoke first:

```bash
npm run hf:backtest -- --strategy btc_fee_aware_failed_impulse_scalp --symbol BTC --fee-model taker --lookback-days 3
npm run hf:validate -- --strategy btc_fee_aware_failed_impulse_scalp --report <report>
```

Meaningful evidence must run on the VM data root when at least 30 days of BTC
snapshots are available:

```bash
HYPERLIQUID_DATA_ROOT=/data npm run hf:backtest -- --strategy btc_fee_aware_failed_impulse_scalp --symbol BTC --fee-model taker --lookback-days 30
HYPERLIQUID_DATA_ROOT=/data npm run hf:backtest -- --strategy btc_fee_aware_failed_impulse_scalp --symbol BTC --fee-model taker --lookback-days 60
HYPERLIQUID_DATA_ROOT=/data npm run hf:backtest -- --strategy btc_fee_aware_failed_impulse_scalp --symbol BTC --fee-model taker --lookback-days 90
```

Gate for paper review:

- at least `60` trades
- positive net return after fees
- positive excess return versus same-window BTC hold
- profit factor at least `1.30`
- max drawdown at or below `3.5%`
- average net trade return at least `0.12%`
- no one-trade or one-exit-reason concentration

## Failure Modes

- taker fees erase the scalp
- no-progress exits reveal chop rather than reversal
- same-window BTC hold beats the strategy
- OI is stale or misleading
- one small subwindow contributes most PnL
- mixed/maker assumptions do not survive paper execution

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/btc_fee_aware_failed_impulse_scalp/`
- `backend/hyperliquid_gateway/strategies/btc_fee_aware_failed_impulse_scalp/backtest.py`
- `backend/hyperliquid_gateway/backtesting/registry.py`
