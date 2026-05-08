---
type: strategy-memory
managed_by: hedge-fund-station
strategy_id: long_flush_continuation
pipeline_stage: blocked
gate_status: audit-blocked
tags: [hedge-station, strategy, long_flush_continuation, blocked, audit-blocked]
source_types: [backend_module, backtest_artifact, docs, registered_backtest, validation_artifact]
source_paths: [docs/strategies/long-flush-continuation.md, backend/hyperliquid_gateway/strategies/long_flush_continuation/spec.md, backend/hyperliquid_gateway/data/backtests/long_flush_continuation-hyperliquid-20260507T010757Z.json, backend/hyperliquid_gateway/data/validations/long_flush_continuation-20260507T010806Z.json]
updated_at: 2026-05-07T15:44:11.415Z
---

# Long Flush Continuation

- Strategy ID: `long_flush_continuation`
- Pipeline Stage: blocked
- Gate Status: audit-blocked
- Validation Status: blocked
- Registered For Backtest: yes
- Can Backtest: yes

## Source Links
- docs/strategies/long-flush-continuation.md
- backend/hyperliquid_gateway/strategies/long_flush_continuation/spec.md

## Evidence Links
- backend/hyperliquid_gateway/data/backtests/long_flush_continuation-hyperliquid-20260507T010757Z.json
- backend/hyperliquid_gateway/data/validations/long_flush_continuation-20260507T010806Z.json

## Latest Backtest
- Trades: 1
- Return: 0
- Profit Factor: 0
- Max Drawdown: 0

## Evidence Counts
- backtestTrades: 1
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
