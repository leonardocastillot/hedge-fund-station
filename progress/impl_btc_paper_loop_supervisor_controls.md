# BTC Paper Loop Supervisor Controls

## Objective

Add local start, stop, status, and tail controls around the BTC Failed Impulse
paper runtime loop without starting live execution or changing credentials.

## Scope

- `scripts/`
- `package.json`
- `docs/operations/`
- `agent_tasks.json`
- `progress/`

## Changes Made

- Added `scripts/btc-paper-runtime-loop.sh`, a local supervisor for
  `npm run hf:paper:loop`.
- Added `npm run hf:paper:supervisor` as the stable package entrypoint.
- Documented bounded smoke verification and operator-approved long-running
  paper-only usage in `docs/operations/btc-paper-runtime-loop.md`.
- The supervisor records pid, log path, gateway URL, cadence, max ticks,
  dry-run state, fail-fast state, portfolio value, strategy, and UTC start time
  in `.tmp/`.

## Files Changed

- `scripts/btc-paper-runtime-loop.sh`: start, stop, restart, status, and tail
  controls for the BTC paper loop.
- `package.json`: adds `hf:paper:supervisor`.
- `docs/operations/btc-paper-runtime-loop.md`: adds local supervisor operator
  workflow.
- `agent_tasks.json`: moves the task to review with evidence paths.
- `progress/current.md`: records current session state and next action.

## Verification

Commands run:

```bash
npm run agent:check
bash -n scripts/btc-paper-runtime-loop.sh
npm run hf:paper:supervisor -- status
npm run hf:paper:supervisor -- start --dry-run --max-ticks 1 --interval-seconds 1
npm run hf:paper:supervisor -- status
npm run hf:paper:supervisor -- tail 20
npm run hf:paper:supervisor -- stop
npm run build
npm run gateway:probe
npm run hf:status
npm run agent:check
```

Result:

- passed

Bounded smoke result:

- Supervisor started one dry-run tick and exited.
- Status after the bounded run was `stopped`.
- Metadata recorded `strategy=btc_failed_impulse_reversal`,
  `gateway_url=http://127.0.0.1:18001`, `interval_seconds=1`,
  `max_ticks=1`, `dry_run=true`, `fail_fast=false`, and
  `portfolio_value=100000`.
- Tick output reported `flat-no-signal`, signal `none`, no opened trade, no
  closed trades, `entryBlockReason=no_reversal_signal`, and about 1895 BTC
  history points.
- `stop` was called after the smoke. No long-running supervisor process was
  intentionally left running.

## Findings

- The local paper loop is now operable without manually managing background
  shell jobs.
- This does not create paper evidence by itself unless an operator starts the
  non-dry-run paper-only loop and lets it collect actual paper ticks.
- Current BTC Failed Impulse readiness remains blocked by missing real paper
  trades, paper review coverage, regime review, risk review, and operator
  sign-off.
- No live trading, credential changes, production routing, or promotion
  occurred.

## Memory Updated

- intentionally unchanged: this work adds an operations runbook and handoff,
  but does not create a new durable company rule beyond the existing paper
  evidence gates.

## Assumptions

- Local paper collection should use the gateway at
  `http://127.0.0.1:18001` unless `HYPERLIQUID_GATEWAY_HTTP_URL` is set.
- The operator-approved long-running path is paper-only and must not be treated
  as live trading readiness.

## Next Best Step

Review `btc_paper_loop_supervisor_controls`; then, if approved by the operator,
start the paper-only loop without `--dry-run` at a conservative 300 second
cadence to begin accumulating readiness evidence.
