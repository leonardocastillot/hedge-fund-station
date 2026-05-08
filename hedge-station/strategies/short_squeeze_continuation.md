---
type: strategy-memory
managed_by: hedge-fund-station
strategy_id: short_squeeze_continuation
pipeline_stage: blocked
gate_status: audit-blocked
tags: [hedge-station, strategy, short_squeeze_continuation, blocked, audit-blocked]
source_types: [backend_module, backtest_artifact, docs, registered_backtest, validation_artifact]
source_paths: [docs/strategies/short-squeeze-continuation.md, backend/hyperliquid_gateway/strategies/short_squeeze_continuation/spec.md, backend/hyperliquid_gateway/data/backtests/short_squeeze_continuation-hyperliquid-20260506T220335Z.json, backend/hyperliquid_gateway/data/validations/short_squeeze_continuation-20260506T220348Z.json]
updated_at: 2026-05-07T15:44:11.417Z
---

# Short Squeeze Continuation

- Strategy ID: `short_squeeze_continuation`
- Pipeline Stage: blocked
- Gate Status: audit-blocked
- Validation Status: blocked
- Registered For Backtest: yes
- Can Backtest: yes

## Source Links
- docs/strategies/short-squeeze-continuation.md
- backend/hyperliquid_gateway/strategies/short_squeeze_continuation/spec.md

## Evidence Links
- backend/hyperliquid_gateway/data/backtests/short_squeeze_continuation-hyperliquid-20260506T220335Z.json
- backend/hyperliquid_gateway/data/validations/short_squeeze_continuation-20260506T220348Z.json

## Latest Backtest
- Trades: 26
- Return: -0.07
- Profit Factor: 0.19
- Max Drawdown: 0.08

## Evidence Counts
- backtestTrades: 26
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
- robust:min_trades
- robust:positive_net_return
- robust:min_profit_factor
- robust:min_avg_net_trade_return_pct
- paper_candidate
- paper_runtime_ledger


## Related Indexes
- [[Strategy Index]]
- [[Evidence Index]]
