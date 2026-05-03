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
3. `docs/hedge-fund-agent-operating-model.md`
4. `docs/hyperliquid-strategy-roadmap.md`
5. `docs/strategies/README.md`
6. `backend/hyperliquid_gateway/strategies/README.md`

## Output Standard

Produce these when relevant:

1. Strategy spec in `docs/strategies/<strategy-id>.md`
2. Backend module in `backend/hyperliquid_gateway/strategies/<strategy-id>/`
3. API contract or integration notes for the Electron app
4. Validation plan covering replay and paper trading

## Allowed Target Areas

- `docs/strategies/`
- `backend/hyperliquid_gateway/strategies/`
- `backend/hyperliquid_gateway/backtesting/`
- `backend/hyperliquid_gateway/app.py` when an inspectable API is required
- `src/services/`, `src/pages/`, and `src/components/` only after backend
  outputs are defined

## Workflow

1. State the strategy hypothesis in one sentence.
2. Identify market regime and anti-regime.
3. Define required data inputs.
4. Define entry trigger and invalidation.
5. Define exit logic and holding horizon.
6. Define ranking or scoring if multiple symbols compete.
7. Define risk controls.
8. Define replay, paper, and review requirements.
9. Only then add UI requirements.

## Rules

- Backend first, UI second.
- No strategy logic only in React.
- No live automation before replay and paper evidence.
- Every strategy must include failure modes.
- Use `npm run hf:*` commands for milestone backtest, validation, paper, and
  status workflows.
