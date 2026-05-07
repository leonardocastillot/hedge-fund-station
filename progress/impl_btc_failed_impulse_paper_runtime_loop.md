# BTC Failed Impulse Paper Runtime Loop Handoff

## Objective

Make the BTC Failed Impulse paper runtime tick schedulable so the workspace can
collect paper-only evidence at a conservative cadence without starting live
trading or leaving unbounded verification processes.

## Scope

- Stable CLI loop command.
- Package script for operator use.
- Bounded/dry-run verification path.
- Paper loop runbook.
- Focused CLI tests and harness tracking.

## Changes Made

- Added `paper-runtime-loop` to `backend/hyperliquid_gateway/cli.py`.
- Added reusable helpers for paper tick URL construction, request execution,
  tick summaries, and bounded loop execution.
- Added `npm run hf:paper:loop`.
- Added `tests/test_cli_paper_runtime_loop.py` for URL construction, bounded
  loop output, and fail-fast error handling.
- Added `docs/operations/btc-paper-runtime-loop.md` with dry-run verification,
  paper collection, supervisor, and readiness-check instructions.

## Runtime Smoke

Bounded dry-run command:

```bash
npm run hf:paper:loop -- --strategy btc_failed_impulse_reversal --dry-run --max-ticks 1 --interval-seconds 1
```

Observed tick summary:

```json
{
  "event": "paper_runtime_tick",
  "tick": 1,
  "ok": true,
  "status": "flat-no-signal",
  "signal": "none",
  "openedTradeId": null,
  "closedTradeIds": [],
  "entryBlockReason": "no_reversal_signal",
  "historyPoints": 1887,
  "change1h": -0.1817,
  "change15m": -0.0344
}
```

The command exited by itself because `--max-ticks 1` was set. No paper trade
was written because `--dry-run` was set.

## Files Changed

- `backend/hyperliquid_gateway/cli.py`
- `package.json`
- `tests/test_cli_paper_runtime_loop.py`
- `docs/operations/btc-paper-runtime-loop.md`
- `agent_tasks.json`
- `progress/current.md`

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_cli_paper_runtime_loop
python3 -m unittest tests.test_cli_paper_runtime_loop tests.test_btc_failed_impulse_reversal tests.test_strategy_catalog
python3 -m unittest tests.test_cli_paper_runtime_loop tests.test_btc_failed_impulse_reversal tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper
npm run hf:paper:loop -- --strategy btc_failed_impulse_reversal --dry-run --max-ticks 1 --interval-seconds 1
npm run build
npm run gateway:probe
npm run hf:status
```

Result:

- Passed: CLI unit tests, focused strategy/catalog tests, broader focused
  Python suite, bounded loop dry-run, production build, gateway probe, status,
  and harness check.

## Risks

- The loop is still only a caller. A supervisor/process manager is needed for
  unattended local collection.
- Running without `--dry-run` can write paper ledger entries, which is intended
  for paper collection but should be operator-approved.
- Paper readiness still requires 14 calendar days, 30 closed matching trades,
  reviews, drift checks, regime review, risk review, and operator sign-off.

## Memory Updated

Intentionally unchanged. The runbook and handoff are sufficient until real
paper evidence begins accumulating.

## Next Best Step

Run the loop under a local supervisor at a conservative cadence and monitor the
readiness endpoint until matching paper trades start closing and receiving
reviews.
