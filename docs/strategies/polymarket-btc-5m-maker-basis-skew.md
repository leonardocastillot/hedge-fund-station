# Polymarket BTC 5m Maker Basis Skew

## Name

Polymarket BTC 5m Maker Basis Skew

## Hypothesis

The best opportunity in `BTC Up/Down 5m` is usually not aggressive taker direction. It is posting passive liquidity on the side favored by BTC-vs-`priceToBeat`, then only getting filled when the market briefly offers a favorable entry before repricing.

## Market Regime

Best regime:

- active BTC tape with a stable directional basis
- market still accepting orders
- at least moderate spread so passive improvement is meaningful
- enough time left to get passive fill and still exit before the final seconds

Avoid regime:

- missing `priceToBeat`
- flat basis
- very narrow books with no maker advantage
- final seconds where queue priority and repricing risk dominate
- wide panic books where fill quality becomes unclear

## Inputs

- Polymarket BTC 5m snapshots from gateway SQLite
- `priceToBeat`
- external BTC spot-derived basis stored in snapshots
- YES/NO implied book derived from bid/ask
- time-to-expiry

## Entry

Enter only when all conditions hold:

1. `priceToBeat` is available.
2. `seconds_to_expiry` is inside the maker window.
3. absolute basis exceeds the minimum threshold.
4. entry bucket is not rich or very-rich.
5. spread is wide enough to justify passive improvement.
6. side remains consistent with the favored maker quote.
7. passive quote can be posted at least one tick better than the current bid without crossing the ask.

## Invalidation

Do not enter when:

- basis weakens below threshold
- spread collapses below the maker minimum
- price bucket becomes too expensive
- there is already open exposure for the event

## Exit

- preferred: passive take-profit before final seconds
- fallback: event resolution
- emergency: time-stop near expiry if the target was not reached

## Risk

- one position per event
- small notional only
- no aggressive taker chase
- no live routing until replay and paper show real evidence

## Costs

- maker entry should avoid taker fees
- exit may still pay execution cost depending on fill assumption
- replay must stay conservative about fill probability

## Validation

1. replay on recorded snapshots with conservative maker fill assumptions
2. compare against taker variants on the same dataset
3. verify that trade count stays low and quality stays high
4. only then expose as paper/live candidate

## Failure Modes

- maker fills are overestimated in replay
- queue priority in real order book is worse than assumed
- basis mean-reverts too late for passive fills to matter
- target exits are too optimistic

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/polymarket_btc_5m_maker_basis_skew/`
