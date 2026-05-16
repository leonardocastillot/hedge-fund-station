# Skill: Hedge Fund Strategy Lab

## Use This When

Use this skill when the task is:

- create a new strategy
- improve an existing strategy
- define an edge hypothesis
- convert discretionary insight into repeatable rules
- design triggers, invalidations, ranking, or paper logic

## Read First

1. `AGENTS.md`
2. `docs/project-architecture.md`
3. `docs/operations/agents/strategy-harness.md`
4. `docs/hedge-fund-agent-operating-model.md`
5. `docs/hyperliquid-strategy-roadmap.md`
6. `docs/strategies/README.md`
7. `backend/hyperliquid_gateway/strategies/README.md`

## Output Standard

Produce these when relevant:

1. Strategy spec in `docs/strategies/<strategy-id>.md`
2. Backend module in `backend/hyperliquid_gateway/strategies/<strategy-id>/`
3. Lifecycle gate and blocked live-gate notes when production review is being
   prepared
4. API contract or integration notes for the Electron app
5. Validation plan covering replay and paper trading

## Allowed Target Areas

- `docs/strategies/`
- `backend/hyperliquid_gateway/strategies/`
- `backend/hyperliquid_gateway/backtesting/`
- `docs/operations/strategy-live-gates/` for blocked live-gate packages
- `backend/hyperliquid_gateway/app.py` when an inspectable API is required
- `src/services/`, `src/pages/`, and `src/components/` only after backend
  outputs are defined

## Workflow

1. State the strategy hypothesis in one sentence.
2. Claim or continue one `strategy_id` under
   `docs/operations/agents/strategy-harness.md`.
3. Identify market regime and anti-regime.
4. Define required data inputs.
5. Define entry trigger and invalidation.
6. Define exit logic and holding horizon.
7. Define ranking or scoring if multiple symbols compete.
8. Define risk controls.
9. Define replay, paper, review, monitoring, rollback, and blocked live-gate
   requirements.
10. Only then add UI requirements.

## Rules

- Backend first, UI second.
- No strategy logic only in React.
- No live automation before replay and paper evidence.
- Every strategy must include failure modes.
- Agent Research OS debate is auxiliary evidence, not readiness approval.
- Live-gate packages remain `blocked` until a later explicit human production
  task approves them.
- Use `npm run hf:*` commands for milestone backtest, validation, paper, and
  status workflows.
