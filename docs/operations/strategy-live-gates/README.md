# Strategy Live Gates

This folder stores blocked live-gate packages for strategies that have enough
research, backtest, validation, and paper evidence to deserve production
review.

Use:

- `docs/operations/agents/templates/strategy-live-gate.md`

Rules:

- every package starts with `Status: blocked`
- agents may prepare evidence, risks, monitoring, rollback, and sign-off
  checklists
- agents must not mark live approved, place orders, change credentials, start
  non-dry-run supervisors, or promote production
- approval requires a later explicit human production task
