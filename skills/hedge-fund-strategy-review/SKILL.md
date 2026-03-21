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

## Read First

1. `AGENTS.md`
2. `docs/hedge-fund-agent-operating-model.md`
3. relevant strategy file in `docs/strategies/`
4. relevant backend implementation in `backend/hyperliquid_gateway/strategies/`

## Output Standard

Return:

- critical findings first
- open questions second
- recommended changes third

If the strategy is acceptable, still list residual risks and validation gaps.
