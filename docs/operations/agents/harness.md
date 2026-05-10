# Agent Harness Engineering

## Purpose

This document defines the harness around agents in Hedge Fund Station: the
instructions, limits, mission contracts, verification checks, and handoff loops
that make agent work predictable and reviewable.

The operating idea is adapted from harness engineering: do not rely on model
quality alone. Build the surrounding system that guides an agent before it acts
and checks its work after it acts.

For the repo-file layer inspired by `betta-tech/ejemplo-harness-subagentes`,
use `docs/operations/agents/file-harness.md`, `agent_tasks.json`,
`progress/current.md`, and `CHECKPOINTS.md`. This document defines the broader
mission contract; the file harness defines how agents coordinate through files.

## Core Rule

Agents may accelerate research, validation, review, and repo maintenance. They
must not become the trading engine.

- Backend owns market logic, strategy logic, replay, validation, persistence,
  paper execution, and agent run artifacts.
- React owns visualization, review, mission approval, and operator workflow.
- Electron owns launcher, terminal, workspace, IPC, and native bridge behavior.
- Docs and skills own operating memory.

Any serious agent mission must leave inspectable evidence. Backend agent
research artifacts belong under:

- `backend/hyperliquid_gateway/data/agent_runs/`
- `backend/hyperliquid_gateway/data/agent_runs/checkpoints/`

## Harness Loop

Use this loop for agent work:

1. Run `npm run agent:brief` to get the current harness, memory, Graphify,
   Obsidian, and next-read state.
2. Read the objective and repo rules.
3. Check `memory/memory-policy.md`, `memory/shared-memory.md`,
   `memory/decisions.md`, and `memory/open-questions.md`.
4. For broad architecture, harness, or memory questions, run
   `npm run graph:status` first. If Graphify is fresh enough, read
   `graphify-out/GRAPH_REPORT.md` or run `npm run graph:query -- "<question>"`,
   then verify findings against source files and canonical docs.
5. For Graphify, Obsidian, or cross-layer memory work, follow
   `graph-memory-operating-system.md`: file harness owns active state, Graphify
   owns repo navigation, and Obsidian owns curated durable memory.
6. Classify the mission.
7. Inspect before changing code or docs.
8. Produce a plan, report, or focused patch.
9. Run the relevant checks.
10. Leave a handoff.
11. Update, promote, archive, or intentionally leave memory unchanged according
   to `memory/memory-policy.md`.
12. Update backlog when the work changes the improvement queue.

If a mission cannot complete a step, the handoff must say why.

## Mission Matrix

| Mission | Purpose | Default Scope | Allowed Actions | Expected Evidence | Checks |
| --- | --- | --- | --- | --- | --- |
| Repo health audit | Keep the repo understandable and agent-ready. | `AGENTS.md`, `README.md`, `docs/`, `skills/`, `package.json`, `.gitignore` | read-only report or docs patch | findings, stale conventions, proposed cleanup | `npm run hf:doctor`, `npm run build` when UI/docs imports may be affected |
| Strategy research | Turn an idea into an inspectable strategy path. | `docs/strategies/`, `backend/hyperliquid_gateway/strategies/`, latest artifacts | docs/spec patch, backend-first recommendations | strategy spec, source audit, validation plan | `npm run hf:backtest`, `npm run hf:validate` when implementation exists |
| Strategy validation audit | Decide whether evidence is strong enough for the next stage. | strategy docs, backend module, backtests, validations, paper artifacts | report, validation thresholds, small tests | blockers, anti-regime gaps, cost/slippage notes | `npm run hf:validate`, strategy-specific tests |
| Data quality audit | Protect research from bad or drifting data. | `backend/hyperliquid_gateway/data/`, `app.py`, `src/services/` | report, schema docs, small parser/contract fixes | schema gaps, null/timestamp issues, source-of-truth notes | `npm run hf:doctor`, endpoint probes when services are running |
| UI review-speed audit | Make backend evidence faster for humans to inspect. | `src/features/`, `src/services/`, shared UI | UI patch after backend contract is clear | review path, missing drilldowns, stale UI assumptions | `npm run build`, browser/app smoke test when practical |
| Operations/runbook audit | Make recurring work and local operations safer. | `docs/operations/`, `scripts/`, stable commands | runbook patch, command docs, report | command sequence, failure handling, handoff format | command-specific dry run or smoke check |
| Memory update | Preserve useful context for future agents. | `docs/operations/agents/memory/` | memory add/update/promotion/archive/removal | stable facts, decisions, next actions, artifact links | link check or doc review |

## Permissions

Default permissions are intentionally narrow.

- Read-only missions may inspect code, docs, generated evidence, command output,
  and local status.
- Docs-only missions may update `AGENTS.md`, `README.md`, `docs/`, and `skills/`.
- Code missions may change source only within the mission scope and must run
  relevant checks.
- Recurring missions should prefer reports or small patches.

Agents must not:

- place live trades
- promote a strategy to live execution
- change credentials, secrets, or authentication files
- perform large migrations without explicit human instruction
- replace stable `npm run hf:*` commands with one-off scripts
- hide trading logic in React or Electron
- store prompts, raw dumps, secrets, logs, temporary notes, or generated reports
  in shared memory

## Approved Command Surface

Prefer stable commands:

```bash
npm run hf:doctor
npm run hf:strategy:new -- --strategy-id <strategy_id>
npm run hf:backtest
npm run hf:validate
npm run hf:paper
npm run hf:status
npm run hf:agent:research -- --strategy <strategy_id>
npm run hf:agent:audit -- --strategy <strategy_id>
npm run hf:agent:status
npm run hf:agent:runtime
npm run backend:health
npm run gateway:probe
npm run build
npm run agent:brief
npm run graph:build
npm run graph:update
npm run graph:status
npm run graph:query -- "<question>"
npm run graph:check
```

Ad hoc scripts are acceptable for inspection, but milestone evidence should use
the stable command surface whenever possible.

Graphify outputs are a navigational layer, not canonical evidence. Version
`graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, and
`graphify-out/graph.html` when generated; keep local manifest, cost, cache, and
transcript state out of review.

## Success Criteria

An agent mission is successful when:

- the mission class is clear
- inspected files and evidence are named
- changes are small enough for human review
- backend/UI/Electron ownership boundaries are preserved
- verification is run or explicitly skipped with a reason
- generated strategy or agent evidence is written to the backend artifact layer
- a handoff names risks, assumptions, and the next best step
- memory is updated, promoted, archived, removed, or explicitly left unchanged
  with a reason

For strategy-related work, success also requires a validation path. A claim about
edge is not complete without costs, failure modes, replay/backtest/paper plan,
and human review surface.

## Output Contracts

Use these docs for standard outputs:

- `templates/handoff.md` for end-of-work handoffs
- `templates/tasks.md` for mission prompts and scope
- `templates/change-summary.md` for reviewable change summaries
- `orientation.md` for first-run orientation
- `graph-memory-operating-system.md` for the Graphify, Obsidian, and harness
  operating model
- `memory/` for shared facts, decisions, mission history, and open questions
- `memory/memory-policy.md` for memory size limits, promotion, and cleanup

Backend Agent Research OS artifacts should keep `promotion_allowed` false unless
the human creates a separate, explicit promotion process outside this harness.
