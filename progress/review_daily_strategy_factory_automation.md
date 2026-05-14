# Daily Strategy Factory Automation Review

## Objective Reviewed

Review whether the `Daily Hedge Fund Strategy Factory` automation created a new
strategy correctly, whether its first run behaved safely, and whether the setup
needed adjustment.

## Verdict

The automation is active and basically healthy. It ran its first scheduled job
on 2026-05-14 around the expected 02:30 America/Santiago window and correctly
chose report-only behavior instead of creating a weak or unsafe strategy.

The useful adjustment was to make runtime-data readiness explicit: `hf:doctor`
now reports whether the local Hyperliquid SQLite DB exists, whether
`market_snapshots` exists, and whether it has rows. The daily factory prompt and
automation runbook now require that preflight before replay-style backtests.

## Evidence Inspected

- `/Users/optimus/.codex/automations/daily-hedge-fund-strategy-factory/automation.toml`
- `/Users/optimus/.codex/automations/daily-hedge-fund-strategy-factory/memory.md`
- `progress/impl_daily_strategy_factory_automation.md`
- `docs/operations/agents/automation-system.md`
- `backend/hyperliquid_gateway/cli.py`
- `backend/hyperliquid_gateway/backtesting/snapshots.py`
- `backend/hyperliquid_gateway/backtesting/workflow.py`
- `agent_tasks.json`
- `progress/current.md`

## Findings

- The automation is `ACTIVE`, daily at 02:30, worktree-based, using `gpt-5.5`
  with `xhigh` reasoning.
- First run result: report-only. It mined local evidence and proposed a BTC
  delayed failed-impulse / structure-confirmed reversal thesis, but did not
  implement it because the replay backtest saw missing `market_snapshots`.
- Current local DB state is now usable: `market_snapshots` exists with more
  than 5.1M rows; the final `hf:doctor` run saw 5,123,710 rows and latest
  snapshot `2026-05-14T12:49:06.164000+00:00`.
- Reproducing the previously blocked backtest now succeeds, but the result is
  not strong: `btc_failed_impulse_reversal` over trailing 3 days on BTC returned
  roughly flat net PnL, 6 trades, 50% win rate, profit factor 1.0, and
  `insufficient-sample`.
- `hf:strategy:new` remains a scaffold helper only. It creates docs and backend
  placeholder modules, but a real strategy still needs backtest registration,
  deterministic logic, focused tests, validation, and handoff. The factory
  prompt correctly requires those extra steps.

## Changes Made

- Updated `backend/hyperliquid_gateway/cli.py` so `hf:doctor` includes a
  read-only `runtime_db` audit for the default or `HYPERLIQUID_DB_PATH`
  database.
- Updated the local Codex automation prompt to run `rtk npm run hf:doctor`
  during startup and use `runtime_db` before attempting SQLite replay backtests.
- Updated `docs/operations/agents/automation-system.md` so the durable runbook
  matches the automation prompt.
- Wrote this review handoff.

## Verification

Commands run:

```bash
rtk npm run agent:brief
rtk npm run agent:check
rtk npm run graph:status
rtk npm run hf:status
rtk npm run hf:backtest -- --strategy btc_failed_impulse_reversal --symbol BTC --fee-model taker --lookback-days 3
rtk sqlite3 backend/hyperliquid_gateway/data/hyperliquid.db ".tables"
rtk sqlite3 backend/hyperliquid_gateway/data/hyperliquid.db "select count(*) as rows, min(datetime(timestamp_ms/1000,'unixepoch')) as min_ts, max(datetime(timestamp_ms/1000,'unixepoch')) as max_ts from market_snapshots;"
rtk npm run hf:doctor
rtk python3 -m py_compile backend/hyperliquid_gateway/cli.py
rtk python3 -m unittest tests.test_strategy_catalog
rtk git diff --check
```

Results:

- Passed: `agent:brief`, `agent:check`, `graph:status`, `hf:status`.
- Passed: `hf:doctor`; summary now includes `hyperliquid_db_exists: true`,
  `market_snapshots_table_exists: true`, and `market_snapshots_has_rows: true`.
- Passed: `py_compile` for `backend/hyperliquid_gateway/cli.py`.
- Passed: `tests.test_strategy_catalog` (`22` tests).
- Passed: `git diff --check`.

## Risks And Assumptions

- The first scheduled run did not create a repo `progress/` report; its durable
  evidence is in the Codex automation store memory. Future implemented
  strategies should still write `progress/impl_<strategy_id>.md`.
- Graphify is stale by commit, so it was used only as navigation context.
- New generated doctor/backtest artifacts are local generated evidence and are
  ignored by git by policy.

## Memory Action

intentionally unchanged. The runbook now carries the durable policy; curated
shared memory does not need another entry.

## Next Best Step

Let the next 02:30 run execute with the new `hf:doctor` preflight. If it still
chooses report-only, use its candidate thesis and blocker as the next strategy
research task rather than forcing scaffold output.
