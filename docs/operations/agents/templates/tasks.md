# Agent Task Templates

Use these templates to make agent missions scoped, reviewable, and easy to
verify. Each task should name the mission class, allowed scope, expected output,
and verification command before work begins.

## Repo Health Audit

```text
Mission: repo health audit
Objective: identify stale or conflicting repo conventions.
Scope: AGENTS.md, README.md, docs/, skills/, package.json, .gitignore.
Allowed actions: read-only report or docs-only patch.
Required checks: rtk npm run hf:doctor; rtk npm run build if imports or UI paths changed.
Output: findings, files inspected, changes made, verification, next best step.
Guardrails: do not move folder trees or change behavior in the same patch.
```

## Memory Update

```text
Mission: memory update
Objective: preserve durable context without increasing agent noise.
Scope: docs/operations/agents/memory/.
Allowed actions: add, update, promote, archive, remove, or intentionally leave unchanged.
Required checks: review against docs/operations/agents/memory/memory-policy.md.
Output: stable facts, accepted decisions, blocking questions, or links to evidence.
Guardrails: no raw logs, prompts, command dumps, secrets, temporary notes, or generated reports.
```

## Strategy Research

```text
Mission: strategy research
Objective: turn a strategy idea or donor material into an inspectable plan.
Scope: docs/strategies/<strategy-id>.md and matching backend strategy package.
Allowed actions: research note, donor audit, strategy spec, backend-first plan.
Required checks: rtk npm run hf:backtest and rtk npm run hf:validate when implementation exists.
Output: edge, regime, anti-regime, inputs, entry, invalidation, exit, risk, costs, validation plan.
Guardrails: do not claim edge without a validation path; do not put strategy logic in React.
```

## Strategy Validation Audit

```text
Mission: strategy validation audit
Objective: decide whether evidence supports the next workflow stage.
Scope: strategy docs, backend module, backtest reports, validation reports, paper artifacts.
Allowed actions: report, validation thresholds, small tests, docs patch.
Required checks: rtk npm run hf:validate -- --strategy <strategy_id> when available.
Output: blockers, missing artifacts, cost/slippage assumptions, anti-regime tests, next command.
Guardrails: paper candidate is not live approval; promotion remains human-reviewed.
```

## Data Quality Audit

```text
Mission: data quality audit
Objective: find schema drift or unreliable evidence before it affects strategy conclusions.
Scope: backend/hyperliquid_gateway/app.py, backend data artifacts, src/services/.
Allowed actions: read-only report, schema docs, small contract fixes.
Required checks: rtk npm run hf:doctor; endpoint probes when services are running.
Output: missing fields, timestamp risks, null handling, fallback sources, source-of-truth notes.
Guardrails: do not make UI fallback data look like backend truth.
```

## UI Review-Speed Audit

```text
Mission: UI review-speed audit
Objective: make backend evidence faster for a human to inspect.
Scope: src/features/, src/services/, src/components/.
Allowed actions: UI patch after backend contracts are clear.
Required checks: rtk npm run build; browser or Electron smoke test when practical.
Output: review path improved, backend evidence surfaced, remaining blockers.
Guardrails: UI may filter and explain; it must not invent strategy decisions.
```

## Operations/Runbook Audit

```text
Mission: operations/runbook audit
Objective: make local operations, tunnels, commands, or recurring checks safer.
Scope: docs/operations/, scripts/, stable command docs.
Allowed actions: runbook patch, report, command documentation.
Required checks: command-specific dry run or smoke check.
Output: procedure, failure modes, recovery steps, verification command, next audit.
Guardrails: do not change credentials or production/live execution settings.
```
