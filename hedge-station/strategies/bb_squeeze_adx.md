---
type: strategy-memory
managed_by: hedge-fund-station
strategy_id: bb_squeeze_adx
pipeline_stage: paper
gate_status: ready-for-paper
tags: [hedge-station, strategy, bb_squeeze_adx, paper, ready-for-paper]
source_types: [backend_module, backtest_artifact, docs, paper_candidate_artifact, registered_backtest, validation_artifact]
source_paths: [docs/strategies/bb-squeeze-adx.md, backend/hyperliquid_gateway/strategies/bb_squeeze_adx/spec.md, backend/hyperliquid_gateway/data/backtests/bb_squeeze_adx-smoke.json, backend/hyperliquid_gateway/data/validations/bb_squeeze_adx-smoke.json, backend/hyperliquid_gateway/data/paper/bb_squeeze_adx-smoke.json]
updated_at: 2026-05-07T15:44:11.413Z
---

# BB Squeeze ADX

- Strategy ID: `bb_squeeze_adx`
- Pipeline Stage: paper
- Gate Status: ready-for-paper
- Validation Status: ready-for-paper
- Registered For Backtest: yes
- Can Backtest: yes

## Source Links
- docs/strategies/bb-squeeze-adx.md
- backend/hyperliquid_gateway/strategies/bb_squeeze_adx/spec.md

## Evidence Links
- backend/hyperliquid_gateway/data/backtests/bb_squeeze_adx-smoke.json
- backend/hyperliquid_gateway/data/validations/bb_squeeze_adx-smoke.json
- backend/hyperliquid_gateway/data/paper/bb_squeeze_adx-smoke.json

## Latest Backtest
- Trades: 203
- Return: 1.52
- Profit Factor: 1.07
- Max Drawdown: 3.95

## Evidence Counts
- backtestTrades: 203
- paperCandidates: 1
- paperSignals: 0
- paperTrades: 0
- polymarketTrades: 0
- runtimeSetups: 0


## Blockers
- Validation is ready for paper review.
- paper_runtime_ledger


## Related Indexes
- [[Strategy Index]]
- [[Evidence Index]]
