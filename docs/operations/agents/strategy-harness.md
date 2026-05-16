# Strategy Agent Harness

## Purpose

This is the strategy-specific harness for agents that create, improve, audit, or
prepare Hedge Fund Station strategies. It sits on top of the repo file harness:
`agent_tasks.json` owns task state, `progress/` owns handoffs, and backend
artifacts remain the source of truth.

The goal is freedom across agent runtimes without strategy drift. Codex, Claude,
Gemini, in-app agents, and future tools may all work here, but they must leave
the same evidence trail and pass the same gates.

## Core Rule

An LLM debate never makes a strategy ready. Agentic Research OS artifacts are
auxiliary evidence. Strategy docs, deterministic backend logic, backtest
reports, validation reports, paper artifacts, risk review, and explicit blocked
live-gate notes are the source of truth.

## Strategy Leader Model

Use one strategy leader per `strategy_id`.

- The leader claims the active `strategy_id` in `progress/current.md` before
  strategy edits begin.
- Parallel explorers are allowed only when they write disjoint reports named
  `progress/explore_strategy_<strategy_id>_<topic>.md`.
- Implementers write one scoped report named `progress/impl_<strategy_id>.md`
  or `progress/impl_<task>.md` when the task already has a stable id.
- Reviewers write `progress/review_<strategy_id>.md` or
  `progress/review_<task>.md`.
- Two implementation agents must not edit the same strategy package, strategy
  doc, registry row, validation threshold, paper artifact, or live-gate package
  at the same time unless the task is explicitly marked `parallelizable` and
  the leader records the split.

## Required Reads

For any strategy creation, improvement, validation, or Strategy Factory mission,
read:

1. `AGENTS.md`
2. `docs/project-architecture.md`
3. `docs/operations/hedge-fund-company-constitution.md`
4. `docs/operations/product-objective.md`
5. `docs/operations/agents/harness.md`
6. `docs/operations/agents/file-harness.md`
7. `docs/operations/agents/strategy-harness.md`
8. `docs/hedge-fund-agent-operating-model.md`
9. `docs/hyperliquid-strategy-roadmap.md`
10. `docs/strategies/README.md`
11. `backend/hyperliquid_gateway/strategies/README.md`
12. `docs/operations/strategy-validation-thresholds.md`
13. `docs/operations/paper-trade-review-criteria.md`

Use `rtk` for commands by default. Use Graphify only for navigation and verify
every lead against source files and backend artifacts.

## Lifecycle Gates

Each strategy must move through these gates in order:

1. `research`: thesis, source of edge, regime, anti-regime, failure modes, and
   validation plan are written in `docs/strategies/<strategy-id>.md`.
2. `backend_spec`: backend mapping exists under
   `backend/hyperliquid_gateway/strategies/<strategy_id>/`, including
   deterministic logic, scoring, risk, paper helpers, and `spec.md` as needed.
3. `backtest_complete`: a deterministic `hf:backtest` artifact exists with
   dataset, fee model, risk assumptions, trades, and summary metrics.
4. `validation_complete`: `hf:validate` has produced a validation artifact.
5. `paper_candidate`: `hf:paper` is generated only when validation says the
   strategy is ready for paper.
6. `paper_review`: paper evidence, execution quality, regime behavior, and
   post-trade lessons are reviewed.
7. `live_gate_blocked`: a live-gate package exists only as blocked planning.
   It must not enable live orders.

If a strategy fails a gate, close it as `validation_blocked` or
`rejected_with_evidence`, name the artifact paths, and name the next command or
research unlock. Do not relabel failure as paper-ready.

## Definition Of Done

A strategy task is not complete until the handoff names:

- strategy id and lifecycle stage
- docs/spec path and backend package path
- backtest artifact or explicit reason it could not run
- validation artifact or explicit blocker
- paper candidate artifact only if validation allowed it
- risk review notes: sizing, invalidation, exposure, kill-switches
- monitoring notes: signals, drift, health checks, and operator attention path
- rollback notes: how to pause, disable, or revert the strategy safely
- live-gate status: `blocked`
- operator sign-off checkbox left unchecked
- verification commands and results
- next best step

## Live-Gate Package

Formal live-gate packages live under:

- `docs/operations/strategy-live-gates/<strategy-id>.md`

Use `docs/operations/agents/templates/strategy-live-gate.md` as the template.
A live-gate package is always blocked until a human explicitly approves a later
production task. Agents may prepare the package; they may not mark it approved,
route orders, change credentials, start non-dry-run supervisors, or promote a
strategy to production.

## Role Contracts

- Leader: claims `strategy_id`, records scope, assigns explorers, and keeps the
  gate state honest.
- Explorer: writes focused evidence reports; does not edit source unless later
  assigned implementation.
- Implementer: changes one strategy scope, replaces scaffold placeholders, runs
  stable `hf:*` commands, and writes the implementation handoff.
- Reviewer: checks artifacts, lifecycle gates, live-gate blockers, and
  verification before approval.
- Research OS: may produce role debate and recommendations, but cannot override
  backend evidence or set promotion allowed.

## Strategy Factory Contract

Strategy Factory missions must follow this harness. A normal successful factory
run creates or materially improves exactly one backend-first strategy candidate,
then carries it as far through backtest, validation, paper, and blocked
live-gate preparation as evidence allows.

Report-only factory output is acceptable only for hard blockers such as unsafe
overlapping source edits, missing required data or services, broken harness
state, unavailable command surface, or a duplicated thesis after explicit
duplicate checks.

## Verification Defaults

Use task-specific commands from `agent_tasks.json`. When no tighter task exists,
default to:

```bash
rtk npm run agent:check
rtk npm run hf:doctor
rtk npm run hf:status
rtk npm run hf:backtest -- --strategy <strategy_id>
rtk npm run hf:validate -- --strategy <strategy_id>
rtk npm run hf:paper -- --strategy <strategy_id> # only when validation allows
rtk git diff --check
```

Run focused Python tests when backend logic, registry, validation thresholds, or
paper helpers change. Run UI/build checks only when UI, Electron, or service
contracts change.
