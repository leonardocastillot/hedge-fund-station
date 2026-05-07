# BTC Failed Impulse Balanced Fast

## Name

BTC Failed Impulse Balanced Fast

## Hypothesis

The original BTC Failed Impulse Reversal edge becomes more stable when the
target and time stop are tightened: keep the same failed-follow-through entry,
but use a 1.45% target and 6 hour time stop so returns are less concentrated in
one subwindow.

## Market Regime

Best regime:

- liquid BTC perpetual market
- one-hour impulse has already stretched
- fifteen-minute continuation fails or reverses
- open interest and volume are high enough for tight execution

Avoid regime:

- low liquidity
- extreme four-hour extension
- continuation still accelerating
- wider spreads or poor execution quality

## Inputs

- Hyperliquid BTC market snapshots
- BTC price history at 5m, 15m, 1h, and 4h lookbacks
- open interest USD
- 24h volume
- funding percentile
- setup scores and execution quality

## Entry

Use the same entry filters as `btc_failed_impulse_reversal`:

- BTC only
- minimum 1h impulse of 0.30%
- long after downside impulse when 15m follow-through fails
- short after upside impulse when 15m follow-through reverses
- volume and open interest filters must pass
- four-hour extension must not be extreme

## Invalidation

- one BTC position maximum
- cooldown after each exit
- longer cooldown after losses
- no entry when a matching paper/runtime trade is already open

## Exit

- 0.65% stop
- 1.45% target
- 360 minute time stop

## Risk

The strategy uses the same base 10% paper/backtest sizing model as the parent
research strategy. Any production sizing remains blocked behind paper evidence,
risk review, and operator sign-off.

## Costs

Backtests use Hyperliquid taker fee assumptions unless explicitly overridden by
the stable CLI.

## Validation

Initial optimizer evidence:

- artifact:
  `backend/hyperliquid_gateway/data/audits/btc_failed_impulse_reversal-variant-optimizer-20260506T231057Z.json`
- variant: `default_signal__balanced_fast`
- 0.54% return
- 12 trades
- 58.33% win rate
- 3.27 profit factor
- 0.11% max drawdown
- stable subwindows
- 43.77% largest positive slice PnL share
- projected 385.8 days to double

Next validation must use the normal registered strategy workflow:

1. `npm run hf:backtest -- --strategy btc_failed_impulse_balanced_fast --symbol BTC --fee-model taker --lookback-days 3`
2. `npm run hf:validate -- --strategy btc_failed_impulse_balanced_fast --report <report>`
3. paper candidate only if validation is ready
4. paper readiness only after enough closed paper trades

## Failure Modes

- the stable optimizer result may be specific to the current three-day window
- tighter target can reduce upside in high-volatility reversals
- more trades can increase fee drag
- still not enough history for production confidence

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_balanced_fast/`
- wraps `btc_failed_impulse_reversal` with fixed research parameters
- does not change the running paper loop for the parent strategy
