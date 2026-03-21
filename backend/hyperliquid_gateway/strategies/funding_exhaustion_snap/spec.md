# Funding Exhaustion Snap - Backend Implementation

This folder contains the backend implementation for the funding exhaustion snap strategy.

## Module Structure

- `logic.py` - Entry signal evaluation with all filter conditions
- `scoring.py` - Setup ranking and watchlist prioritization
- `risk.py` - Invalidation logic and position sizing rules
- `paper.py` - Paper trading helpers and simulation functions

## Strategy Overview

Mean reversion strategy that exploits funding rate extremes combined with momentum exhaustion.

**Core Edge**: When funding hits extremes (>85th or <15th percentile) and price momentum stalls, trapped capital often unwinds within 15min-4hrs.

## Full Specification

See: `docs/strategies/funding-exhaustion-snap.md`

## Integration

The strategy modules are called by the main backend API to:
1. Evaluate real-time signals across all symbols
2. Rank opportunities for watchlist display
3. Check invalidations for active positions
4. Simulate paper trades with realistic execution

## Required Data

- Funding rate + 7-day history
- Price (current + 1hr/4hr/24hr change)
- Open Interest + delta
- Volume 24h
- Crowding bias
- Liquidation pressure
- Opportunity score
- Setup scores
