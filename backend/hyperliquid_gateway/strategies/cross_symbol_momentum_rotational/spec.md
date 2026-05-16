# Cross-Symbol Momentum Rotational - Backend Spec

## Strategy ID

`cross_symbol_momentum_rotational`

## Overview

Market-neutral long-short strategy ranking all Hyperliquid perps by multi-TF momentum. Goes long top N, short bottom N. Rebalances every 15 minutes.

## Modules

### `logic.py`
- `compute_momentum_score(data)` — weighted momentum: 1h*0.5 + 4h*0.3 + 24h*0.2
- `rank_symbols(all_data)` — filter by volume/score, sort by momentum
- `select_baskets(ranked)` — pick long top N, short bottom N, check dispersion
- `evaluate_signal(all_data)` — full signal pipeline

### `risk.py`
- `check_invalidation(pos, data, entry, ranked?)` — rank drop, volume dry, funding adverse, time stop
- `check_market_wide_kill(all_data)` — crash protection (avg 1h < -5%)
- `check_session_killswitch(stats)` — daily drawdown, consecutive losses
- `calculate_position_size(pf_value, baskets, positions)` — equal-weight per side

### `scoring.py`
- `score_setup(all_data, signal_eval)` — multi-factor basket quality
- `get_top_opportunities(all_data)` — one-shot signal + scoring

### `paper.py`
- `paper_candidate(payload)` — gate check
- `simulate_entry_execution(info, data, size)` — volume-based slippage
- `simulate_exit_execution(pos, data, reason)` — exit simulation
- `calculate_paper_pnl(...)` — full cost PnL

## Data Dependencies

Uses existing `market_snapshots` fields:
- `change1h`, `change4h`, `change24hPct` (via build_market_data)
- `volume24h`, `fundingRate`, `opportunityScore`, `price`
- `openInterestUsd` (for sizing)

No new data collection needed. Testable immediately.

## Signal Flow

```
all_market_data (list of per-snapshots)
  -> rank_symbols() [filter + score]
  -> select_baskets() [long top 3, short bottom 3]
  -> evaluate_signal() [return signal + baskets]
  -> score_setup() [quality assessment]
```

## Ranking Formula

```
momentum_score = change1h * 0.50 + change4h * 0.30 + change24h * 0.20
```

Filters: volume24h >= $10M, opportunityScore >= 30

## Risk Limits

| Rule | Value |
|------|-------|
| Basket size | 3 per side (configurable 1-5) |
| Max positions | 6 (3 long + 3 short) |
| Side allocation | 33% of portfolio per side |
| Max hold | 2 hours |
| Market crash | -5% avg 1h → 60min pause |
| Daily drawdown | -1% → 4h pause |
| Consecutive loss | 3 → 2h pause |
| Min dispersion | 0.5% (skip trade) |
| Min qualified | 8 symbols |
