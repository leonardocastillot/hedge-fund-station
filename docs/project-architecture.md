# Hedge Fund Station Project Architecture

## Purpose

Hedge Fund Station is a hedge fund research and operations workspace. Its core
job is to turn market data and research ideas into inspectable strategy
artifacts, validated paper candidates, and fast human review surfaces.

The repo is also the operating memory of the company. Its trading philosophy is
research, backtesting, evaluation, and production. Agents should treat those as
company stages, not loose suggestions. See
`docs/operations/hedge-fund-company-constitution.md` for the long-form
constitution.

The project should scale by keeping responsibilities separate:

- backend code owns market logic, signal logic, persistence, replay, validation,
  and paper execution
- the GCP VM owns heavy runtime compute, persistent backend services, large
  agent evidence, replay/backtest outputs, and runtime datasets under `/data`
- the Electron/React app owns visualization, review, operator controls, and
  workflow surfaces
- docs own reasoning, operating rules, validation plans, and strategy memory
- skills own repeatable agent workflows
- scripts expose stable commands for humans and agents
- operations docs own recurring automation protocols and improvement queues

## Repository Roles

### `backend/`

`backend/hyperliquid_gateway/` is the quant and market-logic layer.

Use it for:

- market ingestion and normalization
- regime classification
- setup scoring and ranking
- strategy modules
- persistence and replay
- deterministic backtests
- validation gates
- paper-candidate and paper-trade workflows
- APIs consumed by the app

Do not put UI-only assumptions here. Backend outputs should be inspectable,
serializable, and suitable for replay.

The local repo checkout is not the long-term storage tier. Heavy runtime data
belongs on the GCP VM at `/data/hedge-fund-station/hyperliquid_gateway/data`
and is mounted into backend containers as `/data`. Use
`HYPERLIQUID_DATA_ROOT=/data` inside backend services so backtests,
validations, paper candidates, audits, agent runs, checkpoints, and SQLite
runtime state are written outside the repository checkout.

### `src/`

`src/` is the renderer cockpit.

Use it for:

- fixed trading stations that organize the hedge fund workflow
- dashboards
- watchlists
- signal drilldowns
- paper review surfaces
- settings and operator controls
- domain modules under `src/features/`
- API clients under `src/services/`
- shared UI under `src/components/ui/` and shell UI under `src/components/electron/`
- compatibility exports under `src/pages/` while the feature-module migration settles

Never put core strategy logic, heavy compute loops, or source-of-truth trading
state in React. The UI may rank, group, and present backend outputs, but the
strategy decision path must remain in the backend.

Renderer terminology:

- Trading stations are fixed product surfaces such as Hedge Fund Station and
  Live Trading. They organize research, validation, review, monitoring, and
  operator attention.
- Desks are Electron workspaces backed by local folders, commands, terminals,
  agents, and vaults. The `Workspace` IPC contract should stay scoped to desks,
  not trading lifecycle state.

### `electron/`

`electron/` owns the desktop shell.

Use it for:

- main-process lifecycle
- preload bridge
- terminal and workspace IPC
- native integrations
- app update behavior

Current convention:

- `electron/main/app/` for lifecycle-adjacent helpers such as menu and updater
- `electron/main/ipc/` for IPC registration
- `electron/main/native/` for native managers and local OS integrations

Do not add hedge fund strategy computation here. Electron should launch, connect,
or control backend services, not become the trading engine.

### `docs/`

`docs/` is the long-term memory of the operating stack.

Recommended convention:

- `docs/architecture/` for architecture, runtime contracts, and system shape
- `docs/operations/` for runbooks, terminal workflows, tunnels, and commands
- `docs/operations/product-objective.md` for the north-star objective
- `docs/operations/agents/` for agent harness, templates, backlog, and shared
  memory
- `docs/operations/agents/memory/memory-policy.md` for memory size limits,
  promotion, cleanup, and anti-noise rules
- `docs/operations/agents/automation-system.md` for recurring agent protocols
- `docs/operations/agents/backlog.md` for the shared queue of
  compounding improvements
- `docs/strategies/` for strategy specs, research notes, validation plans, and
  donor audits tied to a strategy
- root-level docs may remain as compatibility entrypoints while the repo is
  being reorganized incrementally

Shared agent memory under `docs/operations/agents/memory/` is curated company
context, not log storage. It should contain short decisions and links to
backend evidence, never raw agent runs, checkpoints, transcripts, or generated
reports.

### `skills/`

`skills/` contains repeatable agent workflows. A skill should describe when to
use it, what to read first, what files are allowed targets, expected outputs, and
validation requirements.

### `scripts/`

`scripts/` is the stable human/agent command surface. Prefer these commands over
one-off scripts for research, backtest, validation, and paper-candidate work.

## Official Hedge Fund Workflow

The default trading lifecycle is:

1. Research
2. Backtesting
3. Evaluation
4. Production

In repo terms, that lifecycle maps to:

1. Research note or donor audit
2. Strategy spec in `docs/strategies/<strategy-id>.md`
3. Backend implementation in `backend/hyperliquid_gateway/strategies/<strategy_id>/`
4. Backtest with `npm run hf:backtest`
5. Validation with `npm run hf:validate`
6. Paper candidate with `npm run hf:paper`
7. Paper review and execution-quality analysis
8. Production review only after backend outputs are inspectable and risk limits
   are explicit

Every serious strategy should answer:

- what is the edge
- where should it work
- where should it fail
- what data powers it
- how it is ranked
- how it is invalidated
- how it will be replayed
- how it will be paper-traded
- how humans inspect it quickly

## Stable Command Surface

Use these commands as the primary milestone workflow:

```bash
npm run hf:doctor
npm run hf:strategy:new -- --strategy-id <strategy_id>
npm run hf:backtest
npm run hf:validate
npm run hf:paper
npm run hf:status
```

The command wrappers live in `package.json` and `scripts/hf.py`; backend
implementation lives in `backend/hyperliquid_gateway/cli.py`.

Codex and repo agents should run these shell commands through `rtk` when
available, for example `rtk npm run hf:doctor`, while keeping the underlying
stable `npm run hf:*` command surface unchanged.

## Agent Automation Contract

Automated agents should optimize for the product objective, not random cleanup.
Their default loop is:

1. read the product objective
2. read the agent harness, memory policy, and shared memory
3. inspect the current repo state
4. choose a small item from `docs/operations/agents/backlog.md`
5. make a focused change or produce a report
6. run verification
7. leave a handoff and update or intentionally leave memory unchanged

Automation protocols live in `docs/operations/agents/automation-system.md`.
Recurring improvements are tracked in
`docs/operations/agents/backlog.md`.

No automation may promote live trading, change credentials, or perform a large
migration unless the human explicitly asks for it.

## Backend/UI Contract

`backend/hyperliquid_gateway/app.py` exposes inspectable outputs through HTTP
APIs. `src/services/` consumes those APIs and adapts them for React pages and
components.

Rules:

- API clients belong in `src/services/`
- backend strategy modules must not import React or Electron code
- UI state must not be the source of truth for strategy decisions
- paper trading and replay evidence should be generated by backend workflows
- UI pages should make backend artifacts faster to review, not invent the edge

## Ports And Environment Defaults

Use these defaults in docs and local configuration:

- Alpha engine VM tunnel HTTP: `http://127.0.0.1:18500`
- Optional local Hyperliquid gateway HTTP: `http://127.0.0.1:18001`
- Legacy trading API HTTP: `http://127.0.0.1:18000`
- Vite/Electron dev server: `http://127.0.0.1:5173`

Environment variables:

```env
VITE_ALPHA_ENGINE_API_URL=http://127.0.0.1:18500
VITE_ALPHA_ENGINE_WS_URL=ws://127.0.0.1:18500
VITE_HYPERLIQUID_GATEWAY_API_URL=http://127.0.0.1:18001
VITE_HYPERLIQUID_GATEWAY_WS_URL=ws://127.0.0.1:18001
VITE_LEGACY_API_URL=http://127.0.0.1:18000
```

`VITE_API_URL`, `VITE_WS_URL`, `VITE_HYPERLIQUID_API_URL`, and
`VITE_HYPERLIQUID_WS_URL` are still accepted as alpha-engine compatibility
aliases, but new docs and setup should prefer the explicit alpha-engine and
gateway names.

## What Must Not Live In React

Do not place these in `src/`:

- backtest engines
- replay loops
- strategy trigger logic
- market-data ingestion loops
- persistent trading state
- paper execution engines
- live order routing
- validation gates
- long-running signal refresh jobs

If a feature needs repeated computation, persistence, reproducible validation,
or an audit trail, it belongs in `backend/hyperliquid_gateway/` or an external
worker controlled by Docker/process tooling.

## Artifact Policy

Backend-generated research artifacts are exposed through the data artifact
interface:

- `backend/hyperliquid_gateway/data/audits/`
- `backend/hyperliquid_gateway/data/backtests/`
- `backend/hyperliquid_gateway/data/validations/`
- `backend/hyperliquid_gateway/data/paper/`
- `backend/hyperliquid_gateway/data/agent_runs/`

These are evidence and review artifacts, not source logic. The canonical heavy
runtime location is the VM-mounted `/data` tree. Keep only smoke artifacts or
small curated examples in Git; do not commit SQLite databases, WAL/SHM files,
agent run directories, checkpoints, duplicated JSON reports, private datasets,
temporary payloads, or cache files.
