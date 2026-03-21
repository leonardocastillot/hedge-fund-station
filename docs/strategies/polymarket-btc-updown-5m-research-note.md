# Polymarket BTC 5m Research Note

## Current Conclusion

The current `polymarket_btc_updown_5m_oracle_lag` strategy is operational as a backend workflow, but it should not be treated as proven edge for live scaling.

Reason:

- crypto fees on Polymarket are materially larger than a naive flat-bps assumption
- taker-only entry on 5-minute binaries leaves very little room for error
- the current local dataset is too small to prove persistent positive expectancy

## Best Near-Term Strategy Candidate

For this workspace, the best next Polymarket strategy candidate is:

- maker-biased or quote-improving BTC 5m basis strategy

Why:

- fee pressure is the main enemy
- a maker-biased approach attacks the correct bottleneck
- the existing oracle-lag logic can still be reused as a filter for directional bias

## Tactical Ranking

1. Maker-biased BTC 5m basis skew
2. Cheap-tail taker oracle lag with much stricter edge thresholds
3. Pure spread-crossing momentum entry

## What To Validate Next

- actual fee-adjusted edge after side-specific YES/NO pricing
- fill quality vs best bid/ask snapshots
- whether positive expectancy only exists when basis is very extreme
- whether any live opportunity remains after realistic costs
- whether entry quality only survives when the taker entry is in the cheap tail (`<= 0.20` entry price)

## Current Backend Stance

The backend should treat the current implementation as two separate modes:

- `dry-run candidate`: broader taker research, still useful for snapshot collection and paper evidence
- `micro-live pilot`: only for extreme confirmed entries with narrow price buckets, multi-snapshot confirmation, tighter spread, and strong fee-adjusted edge

This is deliberate. A setup can be interesting enough for paper and still be too expensive for live.

## Live Validation Rule

Do not treat `ready-for-paper` as permission to scale live.

For the first live validation:

- use minimum practical notional
- require explicit CLOB readiness
- require the stricter micro-live gate, not only the generic `ENTER` signal
- log order id, exchange status, average fill price, and wallet balance change
- stop immediately after the first unexpected rejection or fee mismatch

## Post-Trade Update

The first real live probe lost the full notional. That does not prove the market is untradeable, but it does prove the previous gate was not selective enough.

The live gate should now assume:

- single-snapshot basis is not enough
- mid-price taker entries are too fragile for live
- live oracle-lag should be treated as a sparse, extreme-entry probe only
