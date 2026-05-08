---
type: strategy-memory
managed_by: hedge-fund-station
strategy_id: btc_crowding_scalper
pipeline_stage: blocked
gate_status: audit-blocked
tags: [hedge-station, strategy, btc_crowding_scalper, blocked, audit-blocked]
source_types: [backend_module, backtest_artifact, docs, registered_backtest, validation_artifact]
source_paths: [docs/strategies/btc-crowding-scalper.md, backend/hyperliquid_gateway/strategies/btc_crowding_scalper/spec.md, backend/hyperliquid_gateway/data/backtests/btc_crowding_scalper-hyperliquid-20260506T220313Z.json, backend/hyperliquid_gateway/data/validations/btc_crowding_scalper-20260506T220348Z.json]
updated_at: 2026-05-07T15:44:11.414Z
---

# BTC Crowding Scalper

- Strategy ID: `btc_crowding_scalper`
- Pipeline Stage: blocked
- Gate Status: audit-blocked
- Validation Status: blocked
- Registered For Backtest: yes
- Can Backtest: yes

## Source Links
- docs/strategies/btc-crowding-scalper.md
- backend/hyperliquid_gateway/strategies/btc_crowding_scalper/spec.md

## Evidence Links
- backend/hyperliquid_gateway/data/backtests/btc_crowding_scalper-hyperliquid-20260506T220313Z.json
- backend/hyperliquid_gateway/data/validations/btc_crowding_scalper-20260506T220348Z.json

## Latest Backtest
- Trades: 83
- Return: -0.08
- Profit Factor: 0.15
- Max Drawdown: 0.08

## Evidence Counts
- backtestTrades: 83
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
