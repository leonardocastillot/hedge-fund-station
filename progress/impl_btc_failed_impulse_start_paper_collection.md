# BTC Failed Impulse Paper Collection Start

## Objective

Start paper-only evidence collection for the current fastest BTC candidate,
`btc_failed_impulse_reversal`, at a conservative 300 second cadence.

## Scope

- `scripts/btc-paper-runtime-loop.sh`
- `docs/operations/btc-paper-runtime-loop.md`
- `agent_tasks.json`
- `progress/`
- Local Hyperliquid gateway and paper ledger APIs

## Changes Made

- Added a scoped harness task for starting paper-only BTC evidence collection.
- Hardened `scripts/btc-paper-runtime-loop.sh` after the first supervised start
  exited immediately under the `npm run` wrapper:
  - resolves `npm` through `NPM_BIN`;
  - writes a `paper_supervisor_runner_started` marker to the log;
  - uses a detached `screen` session when available, matching the local gateway
    supervision pattern.
- Updated `docs/operations/btc-paper-runtime-loop.md` to document the detached
  `btc-paper-runtime-loop` screen session.
- Started the non-dry-run paper loop at a 300 second cadence.

## Files Changed

- `scripts/btc-paper-runtime-loop.sh`: uses `screen` for persistent supervised
  paper collection and keeps status/stop/tail controls working.
- `docs/operations/btc-paper-runtime-loop.md`: documents screen-backed
  supervisor behavior.
- `agent_tasks.json`: records this operational task and review evidence.
- `progress/current.md`: records active session status and next monitoring
  action.

## Verification

Commands run:

```bash
npm run agent:check
npm run gateway:probe
npm run hf:paper:supervisor -- status
bash -n scripts/btc-paper-runtime-loop.sh
npm run hf:paper:loop -- --strategy btc_failed_impulse_reversal --max-ticks 1 --interval-seconds 300
npm run hf:paper:supervisor -- start --strategy btc_failed_impulse_reversal --interval-seconds 300
npm run hf:paper:supervisor -- status
npm run hf:paper:supervisor -- tail 40
curl -sS --max-time 30 http://127.0.0.1:18001/api/hyperliquid/paper/readiness/btc_failed_impulse_reversal
curl -sS --max-time 30 http://127.0.0.1:18001/api/hyperliquid/paper/trades?limit=10
```

Result:

- passed after the supervisor was updated to use `screen`.

Current running state:

- `npm run hf:paper:supervisor -- status` reports
  `running screen_session=btc-paper-runtime-loop pid=71918`.
- Metadata: `strategy=btc_failed_impulse_reversal`,
  `gateway_url=http://127.0.0.1:18001`, `interval_seconds=300`,
  `max_ticks=0`, `dry_run=false`, `fail_fast=false`,
  `portfolio_value=100000`.
- Log path:
  `.tmp/btc-paper-runtime-loop.log`.
- First supervised tick reported `managing-open-trade`, signal `long`, no
  duplicate opened trade, and `entryBlockReason=matching_open_trade`.

Paper evidence state:

- A diagnostic non-dry-run bounded tick opened paper trade `id=1` before the
  long-running supervisor was restarted.
- `/api/hyperliquid/paper/trades?limit=10` shows paper trade `id=1`:
  `BTC` long, setup tag `btc_failed_impulse_reversal`, entry price `81263.0`,
  size `10000.0`, status `open`.
- Readiness remains `collecting-paper-trades`: 0/30 closed trades, 0/14
  calendar days, 0% review coverage, and blockers for sample, drift checks,
  regime review, risk review, and operator sign-off.

## Findings

- The current fastest local BTC candidate has now moved from paper-ready
  artifact to active paper-only evidence collection.
- The first live supervisor attempt surfaced a real daemonization issue under
  `npm run`; switching to `screen` fixed it and aligns with the existing gateway
  restart pattern.
- This is not live trading. No credentials, exchange orders, production
  routing, or promotion changes were made.

## Memory Updated

- intentionally unchanged: the durable operating detail is now in the
  `btc-paper-runtime-loop` runbook and this handoff; no memory-policy-worthy
  company rule changed.

## Assumptions

- `screen` is available locally and is acceptable for development-time process
  supervision.
- Paper collection should continue at 300 second cadence until stopped by an
  operator or until the strategy/risk gates require intervention.

## Next Best Step

Monitor `npm run hf:paper:supervisor -- tail 80` and the Strategy Detail
readiness panel until the open paper trade closes, then review the trade and
continue collecting toward 14 days and 30 closed paper trades.
