---
type: strategy-memory
managed_by: hedge-fund-station
strategy_id: oi_expansion_failure_fade
pipeline_stage: blocked
gate_status: audit-blocked
tags: [hedge-station, strategy, oi_expansion_failure_fade, blocked, audit-blocked]
source_types: [backend_module, backtest_artifact, docs, registered_backtest, validation_artifact]
source_paths: [docs/strategies/oi-expansion-failure-fade.md, backend/hyperliquid_gateway/strategies/oi_expansion_failure_fade/spec.md, backend/hyperliquid_gateway/data/backtests/oi_expansion_failure_fade-hyperliquid-20260506T220335Z.json, backend/hyperliquid_gateway/data/validations/oi_expansion_failure_fade-20260506T220356Z.json]
updated_at: 2026-05-07T15:44:11.415Z
---

# OI Expansion Failure Fade

- Strategy ID: `oi_expansion_failure_fade`
- Pipeline Stage: blocked
- Gate Status: audit-blocked
- Validation Status: blocked
- Registered For Backtest: yes
- Can Backtest: yes

## Source Links
- docs/strategies/oi-expansion-failure-fade.md
- backend/hyperliquid_gateway/strategies/oi_expansion_failure_fade/spec.md

## Evidence Links
- backend/hyperliquid_gateway/data/backtests/oi_expansion_failure_fade-hyperliquid-20260506T220335Z.json
- backend/hyperliquid_gateway/data/validations/oi_expansion_failure_fade-20260506T220356Z.json

## Latest Backtest
- Trades: 39
- Return: -0.05
- Profit Factor: 0.1
- Max Drawdown: 0.05

## Evidence Counts
- backtestTrades: 39
- paperCandidates: 0
- paperSignals: 0
- paperTrades: 0
- polymarketTrades: 0
- runtimeSetups: 0


## Blockers
- min_return_pct
- min_profit_factor
- min_win_rate_pct
- robust_gate
- robust:positive_net_return
- robust:min_profit_factor
- robust:min_avg_net_trade_return_pct
- paper_candidate
- paper_runtime_ledger


## Related Indexes
- [[Strategy Index]]
- [[Evidence Index]]
