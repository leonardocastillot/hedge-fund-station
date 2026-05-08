---
type: strategy-memory
managed_by: hedge-fund-station
strategy_id: btc_failed_impulse_reversal
pipeline_stage: paper
gate_status: ready-for-paper
tags: [hedge-station, strategy, btc_failed_impulse_reversal, paper, ready-for-paper]
source_types: [backend_module, backtest_artifact, btc_variant_optimizer, docs, doubling_stability_audit, paper_candidate_artifact, registered_backtest, validation_artifact]
source_paths: [docs/strategies/btc-failed-impulse-reversal.md, backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/spec.md, backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260507T004805Z.json, backend/hyperliquid_gateway/data/validations/btc_failed_impulse_reversal-20260507T004805Z.json, backend/hyperliquid_gateway/data/paper/btc_failed_impulse_reversal-20260506T221801Z.json, backend/hyperliquid_gateway/data/audits/btc_failed_impulse_reversal-doubling-stability-20260506T230254Z.json, backend/hyperliquid_gateway/data/audits/btc_failed_impulse_reversal-variant-optimizer-20260506T231057Z.json]
updated_at: 2026-05-07T15:44:11.414Z
---

# BTC Failed Impulse Reversal

- Strategy ID: `btc_failed_impulse_reversal`
- Pipeline Stage: paper
- Gate Status: ready-for-paper
- Validation Status: blocked
- Registered For Backtest: yes
- Can Backtest: yes

## Source Links
- docs/strategies/btc-failed-impulse-reversal.md
- backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/spec.md

## Evidence Links
- backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260507T004805Z.json
- backend/hyperliquid_gateway/data/validations/btc_failed_impulse_reversal-20260507T004805Z.json
- backend/hyperliquid_gateway/data/paper/btc_failed_impulse_reversal-20260506T221801Z.json
- backend/hyperliquid_gateway/data/audits/btc_failed_impulse_reversal-doubling-stability-20260506T230254Z.json
- backend/hyperliquid_gateway/data/audits/btc_failed_impulse_reversal-variant-optimizer-20260506T231057Z.json

## Latest Backtest
- Trades: 10
- Return: 0.68
- Profit Factor: 4.84
- Max Drawdown: 0.09

## Evidence Counts
- backtestTrades: 10
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
