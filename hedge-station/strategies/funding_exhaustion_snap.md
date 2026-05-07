---
type: strategy-memory
managed_by: hedge-fund-station
strategy_id: funding_exhaustion_snap
pipeline_stage: blocked
gate_status: audit-blocked
tags: [hedge-station, strategy, funding_exhaustion_snap, blocked, audit-blocked]
source_types: [backend_module, backtest_artifact, docs, registered_backtest, validation_artifact]
source_paths: [docs/strategies/funding-exhaustion-snap.md, docs/strategies/funding-exhaustion-snap-validation.md, backend/hyperliquid_gateway/strategies/funding_exhaustion_snap/spec.md, backend/hyperliquid_gateway/data/backtests/funding_exhaustion_snap-hyperliquid-20260506T220335Z.json, backend/hyperliquid_gateway/data/validations/funding_exhaustion_snap-20260506T220356Z.json]
updated_at: 2026-05-07T15:44:11.414Z
---

# Funding Exhaustion Snap - Validation Plan

- Strategy ID: `funding_exhaustion_snap`
- Pipeline Stage: blocked
- Gate Status: audit-blocked
- Validation Status: blocked
- Registered For Backtest: yes
- Can Backtest: yes

## Source Links
- docs/strategies/funding-exhaustion-snap.md
- docs/strategies/funding-exhaustion-snap-validation.md
- backend/hyperliquid_gateway/strategies/funding_exhaustion_snap/spec.md

## Evidence Links
- backend/hyperliquid_gateway/data/backtests/funding_exhaustion_snap-hyperliquid-20260506T220335Z.json
- backend/hyperliquid_gateway/data/validations/funding_exhaustion_snap-20260506T220356Z.json

## Latest Backtest
- Trades: 0
- Return: 0
- Profit Factor: 0
- Max Drawdown: 0

## Evidence Counts
- backtestTrades: 0
- paperCandidates: 0
- paperSignals: 0
- paperTrades: 0
- polymarketTrades: 0
- runtimeSetups: 0


## Blockers
- min_trades
- min_return_pct
- min_profit_factor
- min_win_rate_pct
- robust_gate
- robust:min_trades
- robust:positive_net_return
- robust:min_profit_factor
- robust:min_avg_net_trade_return_pct
- paper_candidate
- paper_runtime_ledger


## Related Indexes
- [[Strategy Index]]
- [[Evidence Index]]
