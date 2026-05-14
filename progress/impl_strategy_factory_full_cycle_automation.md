# Strategy Factory Full-Cycle Automation

## Objective

Harden the recurring hedge fund automations so daily work defaults to creating
or improving a backend-first strategy, then running the real research pipeline:
tests, backtest, validation, paper candidate when eligible, and blocked live-gate
prep when evidence supports it.

## Changes Made

- Updated local Codex `Daily Hedge Fund Strategy Factory` automation:
  `/Users/optimus/.codex/automations/daily-hedge-fund-strategy-factory/automation.toml`.
- Updated local Codex `Nightly Hedge Fund Strategy Improvement` automation:
  `/Users/optimus/.codex/automations/nightly-hedge-fund-station-improvement/automation.toml`.
- Updated `docs/operations/agents/automation-system.md` to define the 02:30
  factory as implementation-first and the 03:30 automation as follow-through.
- Updated `docs/operations/agents/memory/decisions.md` so future agents retain
  the accepted cadence and intent.
- Updated `progress/current.md` and `progress/history.md`.

## Factory Behavior Now Required

- Default to action: create or materially improve exactly one backend-first
  candidate each run.
- Compare against the current comparable champion by market, horizon, dataset,
  fee model, capital, robust gate, drawdown, profit factor, sample size, and
  promotion stage.
- If no new thesis is strong enough, improve or fork the most promising
  validation-blocked strategy instead of stopping.
- Use `hf:strategy:new` only as scaffold; replace draft placeholders with real
  deterministic backend logic.
- Run focused tests, backtest, validation, `hf:paper` only when
  `ready-for-paper`, stability/dry-run paper checks when supported, `hf:status`,
  and `git diff --check`.
- If the candidate fails, keep the evidence and mark it validation-blocked or
  rejected. Do not fake success.

## Live Gate

Automations may prepare a blocked live-gate package after paper evidence is
strong enough, but may not route live orders, change credentials, start
non-dry-run supervisors, or promote live without explicit operator sign-off.

## Verification

Commands run:

```bash
rtk sed -n '1,260p' /Users/optimus/.codex/automations/daily-hedge-fund-strategy-factory/automation.toml
rtk sed -n '1,240p' /Users/optimus/.codex/automations/nightly-hedge-fund-station-improvement/automation.toml
rtk npm run agent:check
rtk git diff --check
```

Results:

- Passed: `rtk npm run agent:check`.
- Passed: `rtk git diff --check`.

## Risks And Assumptions

- These automations will create repo changes by design. Review/commit cadence
  matters, otherwise later runs may stop on unrelated dirty source edits.
- `hf:strategy:new` still only creates scaffolding; the automation prompt now
  explicitly requires replacing placeholders and registering/test/backtesting
  real logic.
- Live remains intentionally blocked behind human review and sign-off.

## Memory Action

updated: `docs/operations/agents/memory/decisions.md`.

## Next Best Step

Let the next 02:30 factory run create or improve one strategy. Then let the
03:30 improvement run continue its biggest blocker instead of switching to
generic cleanup.
