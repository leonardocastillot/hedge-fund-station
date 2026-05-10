# Hedge Fund Station Agent Map

This file is the entrypoint for any AI agent working in this repo. Treat it as
a navigation map first and a constitution second: read the minimum required
context, work one scoped task, leave evidence in files, and make the next
agent's job easier.

## Quick Start

1. Run `npm run agent:brief` for the fast orientation snapshot: harness state,
   active task, Graphify freshness, memory status, Obsidian status, and next
   reads.
2. Run `npm run agent:check` to verify the file-based harness is coherent.
3. Read `progress/current.md` for the active session state.
4. Read `agent_tasks.json` and pick one task with `status: "pending"` unless
   `progress/current.md` names an active handoff you should continue.
5. If the task needs broad repo, architecture, harness, or memory orientation,
   run `npm run graph:status`. Use `graphify-out/GRAPH_REPORT.md` or
   `npm run graph:query -- "<question>"` only when Graphify is fresh enough for
   navigation. Treat Graphify as a guide to inspect, not a source of truth.
6. For work that touches agent memory, Graphify, Obsidian, or repo orientation,
   read `docs/operations/agents/graph-memory-operating-system.md` to keep the
   three layers in their intended roles.
7. Read only the docs relevant to the mission class, starting from
   `docs/operations/agents/file-harness.md`.
8. Before editing, write or update the active plan in `progress/current.md`.
9. After meaningful work, write a report in `progress/` and leave a handoff.

## File-Based Harness

The repo uses a vendor-neutral file harness inspired by
`betta-tech/ejemplo-harness-subagentes`.

Core files:

- `agent_tasks.json` is the canonical task queue.
- `progress/current.md` is the live session state.
- `progress/history.md` is append-only session history.
- `progress/explore_<topic>.md`, `progress/impl_<task>.md`, and
  `progress/review_<task>.md` are subagent reports.
- `CHECKPOINTS.md` defines objective checks for repo health, task health,
  verification, handoff, and future production readiness.
- `docs/operations/agents/roles/` contains role contracts for leader,
  explorer, implementer, and reviewer agents.
- `graphify-out/GRAPH_REPORT.md`, when present, is the shared repo graph report
  for fast orientation across code, docs, harness, and memory. Use
  `npm run graph:status`, `npm run graph:build`, `npm run graph:update`,
  `npm run graph:query`, `npm run graph:explain`, and `npm run graph:path`
  explicitly; do not install assistant hooks over this curated `AGENTS.md`
  without human approval.
- `docs/operations/agents/graph-memory-operating-system.md` defines how
  Graphify, Obsidian, and the file harness work together without duplicating
  each other.

Hard harness rules:

- One implementation task may be `in_progress` at a time unless the task is
  explicitly marked `parallelizable`.
- Subagents write findings to files and respond in chat with a short reference
  such as `done -> progress/explore_backend_boundaries.md`.
- Completed tasks must name evidence, verification, and review or handoff
  files.
- Future live/production work is allowed only through explicit promotion gates:
  research, backtest, validation, paper evidence, risk review, operator
  sign-off, and production runbook. Until those gates exist, live tasks stay
  `blocked`.

## Required Reads By Mission

- Any repo or agent workflow work: `docs/project-architecture.md`,
  `docs/operations/product-objective.md`,
  `docs/operations/agents/harness.md`,
  `docs/operations/agents/file-harness.md`, and
  `skills/hedge-fund-repo-architect/SKILL.md`. If the work touches Graphify,
  Obsidian, shared memory, or repo orientation, also read
  `docs/operations/agents/graph-memory-operating-system.md`.
- Strategy work: also read `docs/hedge-fund-agent-operating-model.md`,
  `docs/hyperliquid-strategy-roadmap.md`, `docs/strategies/README.md`, and
  `backend/hyperliquid_gateway/strategies/README.md`.
- Recurring or autonomous work: also read
  `docs/operations/agents/automation-system.md` and
  `docs/operations/agents/backlog.md`.

## Session Close

Before finishing meaningful work:

1. Run `npm run agent:check`.
2. Run the mission-specific verification commands from `agent_tasks.json`.
3. Write `progress/impl_<task>.md` or another report file with changed files,
   commands, results, risks, and next action.
4. Move durable session lessons into `progress/history.md`; update curated
   memory only when `docs/operations/agents/memory/memory-policy.md` says it is
   worth preserving.

# Hedge Fund Station Agent Constitution

## Mission

This workspace is for building a world-class hedge fund research and operating
stack.

Agents working here optimize for:

- strategy quality
- validation quality
- operational reliability
- fast human review
- clean separation between heavy compute and UI
- long-horizon company memory for future agents

The trading philosophy is research, backtesting, evaluation, and production.
Agents are part of the hedge fund operating company: they should leave
inspectable artifacts, handoffs, and next actions so the company can keep
learning over years.

## Core Repo Rule

Do not treat the Electron app as the trading engine.

Use this split:

- `backend/hyperliquid_gateway/` is the market, signal, persistence, replay,
  paper execution, validation, and API layer
- `src/` is the visualization, review, operator-control, and mission-surface
  layer
- `electron/` is the desktop shell, preload bridge, terminal/workspace IPC, and
  native integration layer
- `docs/` is the operating memory for architecture, strategy reasoning,
  validation plans, and runbooks
- `skills/` is where repeatable agent workflows live
- `scripts/` exposes stable command entrypoints

If a feature needs repeated computation, persistence, replay, paper evidence, or
an audit trail, it belongs in the backend or an external worker, not React.

## Required First Read

Before changing anything for hedge fund work, read:

1. `docs/project-architecture.md`
2. `docs/operations/hedge-fund-company-constitution.md`
3. `docs/operations/product-objective.md`
4. `docs/operations/agents/harness.md`
5. `docs/hedge-fund-agent-operating-model.md`
6. `docs/hyperliquid-strategy-roadmap.md`
7. `docs/strategies/README.md`
8. `backend/hyperliquid_gateway/strategies/README.md`

If the task is strategy-related, also read the relevant file under `skills/`.
If the task is repo structure or agent workflow, read
`skills/hedge-fund-repo-architect/SKILL.md`.
If the task is recurring, autonomous, or automation-related, also read
`docs/operations/agents/automation-system.md`.
If this is a fresh agent session, start with
`docs/operations/agents/orientation.md`.

## Stable Command Surface

Operate milestone work through the stable CLI first:

- `npm run hf:doctor`
- `npm run hf:strategy:new -- --strategy-id <strategy_id>`
- `npm run hf:backtest`
- `npm run hf:validate`
- `npm run hf:paper`
- `npm run hf:status`

Command implementation lives in:

- `scripts/hf.py`
- `backend/hyperliquid_gateway/cli.py`

Prefer these commands over ad hoc one-off scripts for research, backtests,
validation, status checks, and paper-candidate preparation.

## Official Workflow

For hedge fund strategy work, use this order:

1. Research note or donor audit
2. Strategy spec
3. Backend implementation
4. Backtest
5. Evaluation through validation, replay, anti-regime review, and risk review
6. Paper candidate or paper execution
7. Production review only after backend artifacts, risk limits, and human
   sign-off are inspectable
8. UI integration only after backend artifacts are inspectable

For non-strategy platform work, first classify the task:

- backend implementation
- data quality
- validation
- visualization
- operations
- architecture or agent workflow

Then work in the folder that owns that responsibility.

## Continuous Improvement Workflow

For autonomous or recurring improvement work, use this order:

1. Read `docs/operations/product-objective.md`
2. Read `docs/operations/agents/harness.md`
3. Read `docs/operations/agents/automation-system.md`
4. Check `docs/operations/agents/backlog.md`
5. Pick the highest-impact small task that matches the requested scope
6. Inspect before changing code
7. Make a focused patch
8. Run relevant verification
9. Leave a handoff using `docs/operations/agents/templates/handoff.md`

Recurring agents should produce reports or small patches. They must not
auto-promote strategies to live trading, change credentials, or perform large
migrations without explicit human instruction.

## Agent Harness Standard

Agents work inside a harness: mission classification, allowed scope, stable
commands, verification, artifacts, and handoff. The canonical harness guide is:

- `docs/operations/agents/harness.md`

Use its mission matrix before launching or implementing agent work. The default
mission classes are:

- repo health audit
- strategy research
- strategy validation audit
- data quality audit
- UI review-speed audit
- operations/runbook audit

Backend agent runtimes and generated agent evidence belong in:

- `backend/hyperliquid_gateway/agents/`
- `backend/hyperliquid_gateway/data/agent_runs/`
- `docs/operations/agents/memory/` for shared agent context, decisions, mission
  log, and open questions

Shared memory is capped and curated by
`docs/operations/agents/memory/memory-policy.md`. Do not use memory as a diary,
scratchpad, raw log store, prompt store, or generated-report archive.

The renderer agent workbench may draft, approve, launch, and review missions,
but it must not own trading logic. Electron may launch terminals and bridge IPC,
but it must not become a strategy engine.

## File Placement Rules

### Strategy Docs

Use:

- `docs/strategies/<strategy-id>.md`

Strategy docs must describe edge, regime, anti-regime, inputs, entry,
invalidation, exit, risk, costs, validation, failure modes, and backend mapping.

### Backend Strategy Logic

Use:

- `backend/hyperliquid_gateway/strategies/<strategy_id>/logic.py`
- `backend/hyperliquid_gateway/strategies/<strategy_id>/scoring.py`
- `backend/hyperliquid_gateway/strategies/<strategy_id>/risk.py`
- `backend/hyperliquid_gateway/strategies/<strategy_id>/paper.py`
- `backend/hyperliquid_gateway/strategies/<strategy_id>/backtest.py` when the
  strategy needs a registered backtest adapter

Strategy logic must be deterministic and inspectable. Do not ship strategy logic
only in React.

### Backend APIs And Persistence

Use:

- `backend/hyperliquid_gateway/app.py` for HTTP API surfaces
- `backend/hyperliquid_gateway/backtesting/` for shared backtest workflow code
- `backend/hyperliquid_gateway/data/` for generated research, validation, audit,
  and paper artifacts

Generated artifacts are evidence, not source logic.

### App Integration

Use:

- `src/services/` for API clients and backend adapters
- `src/features/<domain>/` for major review/control surfaces grouped by product domain
- `src/components/ui/` and `src/components/electron/` for shared renderer primitives and shell UI
- `src/contexts/` for renderer state that supports UI behavior

The app may visualize, filter, and control backend workflows, but backend outputs
remain the source of truth for strategy decisions.

### Electron Integration

Use:

- `electron/main/app/` for app lifecycle helpers, menus, and update behavior
- `electron/main/ipc/` for preload-facing IPC handlers
- `electron/main/native/` for terminal, workspace, diagnostics, Obsidian, voice, and agent native integrations
- `electron/preload/` for the safe bridge into the renderer
- `electron/types/` for IPC and desktop types

Do not add market loops, backtests, replay engines, or strategy state to
Electron.

### Docs And Operations

Use:

- `docs/architecture/` for system shape, runtime contracts, and scaling choices
- `docs/operations/` for runbooks, command usage, tunnels, and terminal workflows
- `docs/strategies/` for research and strategy specs

Automation docs belong in `docs/operations/`. Improvement queues and handoff
templates should live there so future agents share one operating system.
Agent harness docs, mission templates, and change-summary templates also belong
there.

Root-level docs may remain as compatibility entrypoints during incremental
cleanup. Prefer new docs in the convention above.

## Agent Handoff Standard

At the end of meaningful work, report:

- what changed
- where the important files are
- which command(s) were run
- whether verification passed or why it was skipped
- risks, assumptions, and next validation steps
- the next best backlog item if the work is part of continuous improvement

Use:

- `docs/operations/agents/templates/handoff.md`
- `docs/operations/agents/templates/change-summary.md`

If the work creates reusable context for future agents, update
`docs/operations/agents/memory/` according to `memory-policy.md`; otherwise
state that memory was intentionally unchanged.

For strategy work, also report:

- current promotion stage
- backtest/validation/paper artifact paths when generated
- remaining data quality or validation gaps

## Validation Standard

A strategy is not done unless the workspace can answer:

- what is the edge
- where should it work
- where should it fail
- what data powers it
- how it is ranked
- how it is invalidated
- how it will be replayed
- how it will be paper-traded
- how humans inspect it quickly

## What Agents Should Build

Prioritize:

- market regime classification
- derivatives and crowding analysis
- setup scoring
- trigger and invalidation logic
- replay and paper-trade validation
- risk rules
- execution-quality analytics
- data quality checks
- fast review surfaces over hidden automation

## What Agents Must Avoid

- putting heavy compute loops in the renderer
- using UI state as the source of truth for trading logic
- making claims about edge without a validation path
- skipping paper execution and replay
- building live automation before backend validation is credible
- moving large folder trees while also changing behavior
- replacing stable `hf:*` commands with one-off scripts

## Default If Unsure

Default to:

- clearer docs
- backend-first design
- inspectable outputs
- stable command usage
- less magic in the UI

If using donor material, audit it first, adapt it, and record the source in docs.
