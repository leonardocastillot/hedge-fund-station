# Polymarket BTC Up/Down 5m Oracle Lag

Short-horizon binary-event strategy for `BTC Up/Down 5m` markets that only enters when the modeled edge survives Polymarket fees, expected slippage, and stale-reference risk.

## Hypothesis

The edge is not "BTC moves a lot". The edge is a temporary mismatch between:

- current external BTC spot,
- Polymarket market-implied probability for `UP` / `DOWN`,
- the oracle / resolution lag window,
- and the cost of entering and exiting.

This should only trade when the mispricing is large enough that net expected value remains positive after fees and slippage.

## Market Regime

Best regime:

- active BTC tape with consistent short-term momentum
- low-to-moderate book spread on the target market
- enough time remaining to avoid last-second adverse selection

Avoid regime:

- first seconds after market opens
- final seconds before resolution
- thin books or wide spreads
- unclear market metadata or missing token ids
- times where external spot and Polymarket disagree but fees consume the edge

## Inputs

- Polymarket market metadata from Gamma API
- Polymarket orderbook / best prices from CLOB
- external BTC reference price
- market countdown / end time
- account cash balance and open exposure
- realized fills and settled outcomes

## Entry

Enter only when all conditions hold:

1. Market is the configured `BTC Up/Down 5m` slug and is active.
2. Time-to-expiry is inside the allowed window.
3. Estimated directional edge exceeds:
   - entry fee
   - expected exit fee
   - slippage reserve
   - explicit safety margin
4. Position size fits balance, max exposure, and session kill-switch rules.

## Invalidation

Do not enter or force reduce when:

- fee model is missing or uncertain
- spread exceeds configured max
- account is already holding exposure for the same event
- session daily drawdown or consecutive-loss limit is breached
- time-to-expiry falls below the minimum close window

## Exit

- default: hold binary position until event resolution
- optional early exit only if modeled unwind materially improves realized EV after fees
- always write settlement and fee data to the journal for realized ROI

## Risk

- micro-live only
- one position per event
- default stake small relative to balance
- hard session stop after consecutive losses or drawdown breach
- dry-run remains default until credentials and venue behavior are validated
- live routing must stay behind an explicit backend flag (`POLYMARKET_LIVE_ENABLED=true`)
- first live validation should use the smallest practical USD notional and a fill-or-kill order
- for `BTC 5m`, the venue can require a minimum order size in shares; a `$1` pilot is only executable when the entry price is cheap enough to clear that floor
- live mode must use a stricter gate than paper:
  - very high minimum confidence
  - materially positive net edge after realistic fees
  - no mid-price live entries
  - only `cheap-tail` or `discount` entry buckets
  - confirmation across multiple consecutive snapshots in the same direction
  - tighter spread ceiling and narrower time window

## Costs

Must include:

- Polymarket trading fees
- spread crossing
- slippage reserve
- settlement mismatch / bad metadata risk

As of March 6, 2026, Polymarket applies fees to crypto markets, so any `BTC 5m` automation must model fees before calling something arbitrage.

## Validation

1. Replay with recorded market snapshots and external BTC reference.
2. Compare multiple taker variants, not only one threshold set.
3. Dry-run journal on the exact target slug for several sessions.
4. Compare expected edge vs realized fills.
5. Only then allow micro-live with explicit account credentials.
6. For first live validation, verify that the backend journal captures the real `orderId`, exchange status, and wallet position change.
7. Treat any first-loss live probe as a reason to tighten gates further before the next trade.

## Failure Modes

- fee model understated
- fills worse than best bid/ask snapshots
- stale or wrong token ids
- event-resolution interpretation mismatch
- signal overtrading during noise
- live account permissions / proxy wallet configuration broken

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/polymarket_btc_updown_5m_oracle_lag/`
- `scripts/polymarket_btc_5m_runner.py`
