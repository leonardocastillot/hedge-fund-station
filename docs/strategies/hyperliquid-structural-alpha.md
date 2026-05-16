# Hyperliquid Structural Alpha

## Hypothesis
Perpetual futures markets have structural inefficiencies that can be systematically exploited: funding rate extremes reveal retail crowding, OI/price divergence reveals smart money positioning, and setup score confluence reveals regime clarity.

## Edge
- **Funding extremes** (retail crowding): Most reliable non-OHLCV signal in crypto perps
- **OI divergence** (trend health): Price without OI confirmation is a trap
- **Setup confluence** (regime clarity): When breakout >> fade, directional edge exists
- **Multi-TF momentum** (saturation): All timeframes aligned = move is extended
- **Multi-symbol ranking**: Always trades the best opportunity across 190+ markets

## Market Regime
Works in trending and mean-reverting regimes. Fails in: extremely low volatility chop (no funding extremes), illiquid symbols, sudden gap moves.

## Inputs
Hyperliquid market_snapshots (5-min buckets): funding rate, OI, volume, setup scores, crowding bias, price changes.

## Signal
5-factor composite score (-100 to +100):

| Factor | Weight | Signal |
|---|---|---|
| Funding | 28% | -100 at pct>90, +100 at pct<10 |
| OI Divergence | 22% | +75 if price down + OI up, -75 if price up + OI down |
| Setup Confluence | 22% | (breakout+squeeze - fade+flush) / total * 120 |
| Momentum | 18% | Weighted TF composite, saturation penalty |
| Crowding | 10% | +80 shorts-at-risk, -80 longs-at-risk |

Entry: |composite| >= 50, >= 2/4 timeframes agree, liquid.

## Invalidation
- Stop loss (0.35-1.5% vol-adaptive)
- Take profit (1.5-2.5x risk)
- OI contraction > 2.5% from entry
- 15m direction reversal
- 25m no progress
- 120m time stop

## Risk
Max 3 concurrent, 15min cooldown after loss, 0.8-2.5% per position.

## Backend Mapping
Module: `backend/hyperliquid_gateway/strategies/hyperliquid_structural_alpha/`
