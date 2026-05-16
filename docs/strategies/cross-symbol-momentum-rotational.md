# Cross-Symbol Momentum Rotational

Market-neutral long-short strategy ranking all Hyperliquid perps by multi-timeframe momentum and going long the strongest, short the weakest.

## Hypothesis

Momentum persists across the cross-section of perps within a 1-4h window. Symbols that have performed best over the last 1-4h tend to continue outperforming, and the worst tend to continue underperforming. By going long the top N and short the bottom N with equal notional, the strategy captures cross-sectional momentum while remaining market-neutral.

**Why this should have edge:**
1. **Cross-sectional momentum** is a well-documented factor across asset classes (Jegadeesh & Titman 1993). Crypto perps on the same exchange share this factor with lower transaction costs.
2. **Market neutrality** eliminates directional BTC risk. Returns come from relative strength, not market direction.
3. **Multi-timeframe ranking** (1h + 4h + 24h) captures momentum at different horizons while filtering noise.
4. **Funding and volume filters** prevent entering crowded, illiquid positions.

## Market Regime

**Active:**
- Normal-to-high volume environment
- At least 8 symbols with >$10M 24h volume
- Cross-sectional dispersion > 2% (top vs bottom decile)

**Inactive / avoid:**
- Market-wide crash (all symbols dropping >5% in 1h)
- Extreme funding events (all perps at max funding)
- Less than 8 liquid symbols

## Inputs

Per-symbol data from `market_snapshots`:
- 1-hour price change
- 4-hour price change
- 24-hour price change
- 24-hour volume
- Funding rate
- Open interest (for position sizing)
- Opportunity score (for quality filter)

## Ranking

Rank symbols by composite momentum score:

```
momentum_score = change1h * 0.50 + change4h * 0.30 + change24h * 0.20
```

Filter: volume > $10M, opportunity_score > 30.

Select:
- **Long basket**: Top 3 symbols by momentum_score
- **Short basket**: Bottom 3 symbols by momentum_score

## Entry

- Rebalance every 15 minutes (or every new market_snapshot)
- Open long positions on top 3, short positions on bottom 3
- Equal notional per position (1/3 of total allocation per side)
- All entries as taker (market orders)

## Invalidation

Exit individual position if:
- **Rank drops below top 5** (for longs): The symbol is no longer in the momentum leaders
- **Rank rises above bottom 5** (for shorts): The symbol is no longer in the laggards
- **Volume drops below $5M**: Liquidity concern
- **Funding flips against**: Funding becomes strongly adverse (> 0.1% for long, < -0.1% for short)

## Exit

- **Scheduled**: Every 15-minute rebalance (positions rotate naturally)
- **Emergency**: Exit all if market-wide drawdown > 3% in 1h (cascade protection)
- **Time stop**: Any position held > 2 hours is closed regardless
- **Spread kill**: If aggregate spread across all symbols widens > 2x normal

## Risk

- **Per-position risk**: Equal notional (portfolio / 6 per side)
- **Max exposure per side**: 3 positions, each 1/6 of allocated capital
- **Portfolio heat**: 2/3 of capital deployed (1/3 long + 1/3 short)
- **Max leverage**: None (1x notional)
- **Drawdown kill**: -1% daily PnL pauses for 4 hours
- **Consecutive loss**: 3 negative rebalances pauses for 2 hours

## Costs

- **Taker fee**: 0.045% per leg (Hyperliquid Tier 0)
- **Round-trip per position**: 0.09%
- **Slippage**: 0.05-0.10% per leg (liquid perps)
- **Total per rebalance**: ~0.15-0.20% per position
- **Rebalances per day**: ~96 (4 per hour × 24h)
- **Daily cost estimate**: ~0.3-0.5% of deployed capital (optimistic: many positions held across rebalances)

Note: High rebalance frequency means costs matter. In practice, positions that hold their rank don't need to be traded. Only actual rank changes trigger trades.

## Validation

### Backtest (Phase 1)
Since data exists in `market_snapshots`, backtest immediately:
- Use 5-minute sampled snapshots over last 7+ days
- Measure signal frequency (expect 15-30 rebalances per day)
- Win rate (expect > 52%)
- Sharpe ratio (expect > 1.0)
- Market-neutrality: check correlation to BTC returns (expect < 0.3)

### Paper Trading (Phase 2)
- Run real-time with 15-min rebalance
- Track transaction costs
- Monitor rank stability
- Measure actual vs theoretical returns

### Regime Analysis (Phase 3)
- Segment by volatility regime
- Segment by time of day
- Identify best/worst conditions

## Failure Modes

1. **Momentum crash** — During regime changes, momentum reverses violently. Mitigation: 15-min rebalance catches reversals quickly.
2. **Funding cost drag** — Shorting positive-funding perps costs money. Mitigation: apply funding filter to avoid strongly adverse funding.
3. **Low dispersion regime** — All symbols move together, reducing cross-sectional spread. Mitigation: pause when dispersion < 1%.
4. **Slippage in thin perps** — Bottom-ranked perps may have low liquidity. Mitigation: volume filter.
5. **Rebalance frequency vs cost** — Trading too often eats returns. Mitigation: only rebalance when ranks actually change.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/cross_symbol_momentum_rotational/`
