# BTC Paper Runtime Loop

This runbook describes how to collect paper-only evidence for
`btc_failed_impulse_reversal` after the strategy has a `ready-for-paper`
validation artifact and a paper baseline.

## Boundary

This loop writes only to the local Hyperliquid gateway paper SQLite ledger. It
does not place live orders, use exchange credentials, change routing, or promote
the strategy. Any future production path remains blocked behind research,
backtest, validation, paper evidence, risk review, operator sign-off,
monitoring, rollback, and a production runbook.

## Prerequisites

1. The Hyperliquid gateway is running and healthy:

   ```bash
   npm run gateway:probe
   ```

2. `btc_failed_impulse_reversal` has a current paper candidate with
   `paper_baseline`.

3. The operator accepts that paper trades may be opened or closed in the local
   paper ledger when the backend strategy signal and exit rules trigger.

## Bounded Verification

Run one dry-run tick through the loop:

```bash
npm run hf:paper:loop -- --strategy btc_failed_impulse_reversal --dry-run --max-ticks 1 --interval-seconds 1
```

Expected behavior:

- command exits by itself
- output includes `paper_runtime_loop_started`
- output includes one `paper_runtime_tick`
- output includes `paper_runtime_loop_finished`
- no paper trades are written because `--dry-run` is set

## Paper Collection

Run a paper-only loop at a conservative five-minute cadence:

```bash
npm run hf:paper:loop -- --strategy btc_failed_impulse_reversal --interval-seconds 300
```

The loop prints JSON lines for each tick. The important fields are:

- `status`
- `signal`
- `openedTradeId`
- `closedTradeIds`
- `entryBlockReason`
- `historyPoints`
- `change1h`
- `change15m`

Stop the loop with `Ctrl-C`. Use `--max-ticks <N>` when running under a bounded
job runner or smoke test.

## Supervisor Pattern

For local supervised collection, run the command from a process manager that
captures stdout and restarts on failure. Keep the gateway and loop as separate
processes so either can be restarted independently.

Example bounded smoke before enabling a long process:

```bash
npm run gateway:probe
npm run hf:paper:loop -- --strategy btc_failed_impulse_reversal --dry-run --max-ticks 1 --interval-seconds 1
```

Then start the long paper loop only after the smoke passes.

## Local Supervisor Controls

The repo includes a lightweight local supervisor wrapper around the paper loop.
It writes metadata, pid, and logs under `.tmp/`. When `screen` is available,
the supervisor runs the loop in a detached `btc-paper-runtime-loop` session so
the process survives the `npm run` wrapper.

Check status:

```bash
npm run hf:paper:supervisor -- status
```

Run a bounded dry-run supervisor smoke:

```bash
npm run hf:paper:supervisor -- start --dry-run --max-ticks 1 --interval-seconds 1
npm run hf:paper:supervisor -- status
npm run hf:paper:supervisor -- tail 40
npm run hf:paper:supervisor -- stop
```

Start paper-only collection after operator approval:

```bash
npm run gateway:probe
npm run hf:paper:supervisor -- start --strategy btc_failed_impulse_reversal --interval-seconds 300
```

Stop paper-only collection:

```bash
npm run hf:paper:supervisor -- stop
```

The supervisor does not use credentials or live routing. It only calls
`npm run hf:paper:loop` and records local process metadata. Inspect detached
sessions with:

```bash
screen -ls
```

## Readiness Check

Monitor paper readiness separately:

```bash
curl -fsS http://127.0.0.1:18001/api/hyperliquid/paper/readiness/btc_failed_impulse_reversal
```

The current baseline requires at least 14 calendar days, 30 closed matching
paper trades, 90% review coverage, positive fee-adjusted paper return, profit
factor above threshold, average trade drift checks, drawdown guard, regime
review, risk review, and operator sign-off.
