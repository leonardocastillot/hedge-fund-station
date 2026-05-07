---
type: strategy-memory
managed_by: hedge-fund-station
strategy_id: btc_failed_impulse_balanced_fast
pipeline_stage: blocked
gate_status: audit-blocked
tags: [hedge-station, strategy, btc_failed_impulse_balanced_fast, blocked, audit-blocked]
source_types: [backend_module, backtest_artifact, docs, registered_backtest, validation_artifact]
source_paths: [docs/strategies/btc-failed-impulse-balanced-fast.md, backend/hyperliquid_gateway/strategies/btc_failed_impulse_balanced_fast/spec.md, backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_balanced_fast-hyperliquid-20260506T233333Z.json, backend/hyperliquid_gateway/data/validations/btc_failed_impulse_balanced_fast-20260506T233340Z.json]
updated_at: 2026-05-07T15:44:11.414Z
---

# BTC Failed Impulse Balanced Fast

- Strategy ID: `btc_failed_impulse_balanced_fast`
- Pipeline Stage: blocked
- Gate Status: audit-blocked
- Validation Status: blocked
- Registered For Backtest: yes
- Can Backtest: yes

## Source Links
- docs/strategies/btc-failed-impulse-balanced-fast.md
- backend/hyperliquid_gateway/strategies/btc_failed_impulse_balanced_fast/spec.md

## Evidence Links
- backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_balanced_fast-hyperliquid-20260506T233333Z.json
- backend/hyperliquid_gateway/data/validations/btc_failed_impulse_balanced_fast-20260506T233340Z.json

## Latest Backtest
- Trades: 11
- Return: 0.41
- Profit Factor: 2.88
- Max Drawdown: 0.11

## Evidence Counts
- backtestTrades: 11
- paperCandidates: 0
- paperSignals: 0
- paperTrades: 0
- polymarketTrades: 0
- runtimeSetups: 0


## Blockers
- robust_gate
- robust:positive_net_return
- robust:max_largest_trade_pnl_share_pct
- paper_candidate
- paper_runtime_ledger


## Related Indexes
- [[Strategy Index]]
- [[Evidence Index]]
