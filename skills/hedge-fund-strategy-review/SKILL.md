# Skill: Hedge Fund Strategy Review

## Use This When

Use this skill when the task is:

- review a strategy design
- challenge assumptions
- identify missing validation
- find operational weaknesses
- compare strategies or decide if one is production-worthy

## Review Priorities

1. False edge or unclear hypothesis
2. Missing regime boundaries
3. No explicit invalidation
4. No cost model
5. No replay or paper plan
6. Data trust issues
7. UI-dependent logic instead of backend logic
8. Missing blocked live-gate package for production review

## Read First

1. `AGENTS.md`
2. `docs/project-architecture.md`
3. `docs/operations/agents/strategy-harness.md`
4. `docs/hedge-fund-agent-operating-model.md`
5. relevant strategy file in `docs/strategies/`
6. relevant backend implementation in `backend/hyperliquid_gateway/strategies/`

## Output Standard

Return:

- critical findings first
- open questions second
- recommended changes third
- lifecycle gate and blocked live-gate status when relevant

If the strategy is acceptable, still list residual risks and validation gaps.

## Allowed Target Areas

Review primarily:

- `docs/strategies/`
- `backend/hyperliquid_gateway/strategies/`
- `backend/hyperliquid_gateway/backtesting/`
- generated artifacts in `backend/hyperliquid_gateway/data/`
- `docs/operations/strategy-live-gates/`
- UI surfaces only to check whether humans can inspect backend outputs quickly

## Rules

- Agent Research OS output is auxiliary evidence only.
- A strategy is not production-worthy without docs, backend mapping, backtest,
  validation, paper evidence when eligible, risk review, monitoring, rollback,
  unchecked operator sign-off, and a live gate that remains `blocked`.
