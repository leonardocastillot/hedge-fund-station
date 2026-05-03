# Hedge Fund Station

Hedge Fund Station is a desktop cockpit for hedge fund research, strategy
validation, paper trading, and operator review.

The app is intentionally split:

- `backend/hyperliquid_gateway/` is the quant, market-data, strategy,
  persistence, replay, validation, paper, and API layer
- `src/` is the React cockpit for dashboards, watchlists, signal review, paper
  review, and controls
- `electron/` is the native desktop shell, terminal/workspace bridge, and app
  lifecycle layer
- `docs/` is the operating memory for architecture, strategy specs, validation
  plans, and runbooks
- `skills/` is the repeatable workflow layer for agents
- `scripts/` exposes stable commands for humans and agents

Read the repo contract first:

- `AGENTS.md`
- `docs/project-architecture.md`
- `docs/operations/product-objective.md`
- `docs/operations/agents/harness.md`
- `docs/hedge-fund-agent-operating-model.md`
- `docs/hyperliquid-strategy-roadmap.md`

## Operating Model

Do not treat the Electron app as the trading engine.

The backend owns anything that needs deterministic logic, repeated computation,
persistence, replay, paper execution, validation, or auditability. The UI makes
those outputs faster to inspect and control.

Official strategy flow:

1. Research note or donor audit
2. Strategy spec in `docs/strategies/<strategy-id>.md`
3. Backend implementation in `backend/hyperliquid_gateway/strategies/<strategy_id>/`
4. `npm run hf:backtest`
5. `npm run hf:validate`
6. `npm run hf:paper`
7. UI integration after backend artifacts are inspectable

## Project Structure

```text
hedge-fund-station/
├── AGENTS.md                         # Repo constitution for agents
├── backend/
│   └── hyperliquid_gateway/          # FastAPI gateway, strategies, backtests, artifacts
│       ├── app.py                    # Inspectable HTTP API surface
│       ├── backtesting/              # Shared deterministic backtest workflow
│       ├── data/                     # Generated audit/backtest/validation/paper artifacts
│       └── strategies/               # One backend package per strategy
├── docs/
│   ├── architecture/                 # Architecture and runtime docs
│   ├── operations/                   # Runbooks and command/operator docs
│   ├── strategies/                   # Strategy specs and research notes
│   └── project-architecture.md       # Repo-wide architecture contract
├── electron/                         # Electron app, IPC, native managers, preload, types
├── scripts/                          # Stable human/agent command wrappers
├── skills/                           # Workspace-specific agent workflows
└── src/
    ├── features/                     # Product modules: cockpit, hyperliquid, paper, agents
    ├── services/                     # Backend API adapters
    ├── contexts/                     # Shared renderer state
    └── components/                   # Shared UI and Electron shell UI
```

Existing root-level docs are kept as compatibility entrypoints during the
incremental cleanup. Prefer adding new architecture docs under
`docs/architecture/`, operation runbooks under `docs/operations/`, and strategy
research under `docs/strategies/`.

For recurring agent work and future automations, start with:

- `docs/operations/product-objective.md`
- `docs/operations/agents/harness.md`
- `docs/operations/agents/memory/memory-policy.md`
- `docs/operations/agents/memory/shared-memory.md`
- `docs/operations/agents/automation-system.md`
- `docs/operations/agents/backlog.md`
- `docs/operations/agents/templates/handoff.md`

For first-run agent orientation and task shaping, use:

- `docs/operations/agents/orientation.md`
- `docs/operations/agents/templates/tasks.md`
- `docs/operations/agents/templates/change-summary.md`

For cleanup and readiness review, use:

- `docs/operations/strategy-readiness-matrix.md`
- `docs/architecture/backend-source-of-truth.md`
- `docs/operations/mac-distribution-runbook.md`
- `docs/architecture/mac-app-store-gap-analysis.md`

## Stable Commands

Use these commands for milestone research and validation work:

```bash
npm run hf:doctor
npm run hf:strategy:new -- --strategy-id <strategy_id>
npm run hf:backtest
npm run hf:validate
npm run hf:paper
npm run hf:status
```

Desktop/backend commands:

```bash
npm run dev
npm run build
npm run backend:health
npm run backend:tunnel
```

The `hf:*` command wrappers live in `scripts/hf.py`; backend CLI behavior lives
in `backend/hyperliquid_gateway/cli.py`.

## Local Development

Prerequisites:

- Node.js 18+
- Python 3.9+
- Docker, if running the backend service container
- macOS is the current local development target for this workspace

Install dependencies:

```bash
npm install
```

Run the canonical desktop app in development mode:

```bash
./open-hedge-fund-station-dev.command
```

Or run the underlying dev command directly:

```bash
npm run dev
```

There is not a second app. Electron is the macOS desktop runtime, and it loads
the React renderer that lives under `src/`. Build folders such as `dist/`,
`dist-electron/`, and `release/` are generated outputs, not places to develop.

Run the Hyperliquid backend with Docker:

```bash
docker compose up -d hyperliquid-backend
```

Check backend health:

```bash
npm run backend:health
```

Daily hybrid mode keeps compute on the VM and the app local:

```bash
npm run backend:tunnel:start
npm run dev
```

Package for macOS only when preparing a distributable build:

```bash
npm run dist:mac
```

The Mac distribution runbook lives at
`docs/operations/mac-distribution-runbook.md`. The day-to-day development guide
lives at `docs/operations/how-to-develop-this-app.md`.

## Ports And Environment

Preferred local defaults:

```env
VITE_ALPHA_ENGINE_API_URL=http://127.0.0.1:18500
VITE_ALPHA_ENGINE_WS_URL=ws://127.0.0.1:18500
VITE_HYPERLIQUID_GATEWAY_API_URL=http://127.0.0.1:18001
VITE_HYPERLIQUID_GATEWAY_WS_URL=ws://127.0.0.1:18001
VITE_LEGACY_API_URL=http://127.0.0.1:18000
```

Alpha-engine compatibility aliases still accepted by the app:

```env
VITE_API_URL=http://127.0.0.1:18500
VITE_WS_URL=ws://127.0.0.1:18500
```

Current backend-related scripts also reference:

- Alpha engine VM tunnel through `http://127.0.0.1:18500`
- optional local Hyperliquid gateway through `http://127.0.0.1:18001`
- legacy trading API at `http://127.0.0.1:18000`
- Docker compose service mapping `18001:18400` for the containerized gateway

Do not change runtime ports casually. Document any port migration in
`docs/architecture/` or `docs/operations/` first.

## Strategy Standard

Every serious strategy needs three layers:

1. Spec: `docs/strategies/<strategy-id>.md`
2. Backend implementation:
   `backend/hyperliquid_gateway/strategies/<strategy_id>/`
3. Visualization/review: API client in `src/services/`, feature UI under
   `src/features/<domain>/`, reusable shell/primitives under `src/components/`

The backend strategy package should normally include:

- `logic.py` for deterministic signal logic
- `scoring.py` for setup ranking
- `risk.py` for invalidations, guards, and sizing assumptions
- `paper.py` for paper-candidate or paper execution helpers
- `backtest.py` when the strategy has a registered deterministic backtest
- `spec.md` for backend implementation notes

## Artifact Policy

Backend-generated evidence belongs under:

- `backend/hyperliquid_gateway/data/audits/`
- `backend/hyperliquid_gateway/data/backtests/`
- `backend/hyperliquid_gateway/data/validations/`
- `backend/hyperliquid_gateway/data/paper/`

These artifacts are not source logic. Keep curated examples when they help
review or regression work. Avoid committing private datasets, large runtime
outputs, SQLite databases, temporary payloads, caches, and build outputs.

## Agent Workflows

Workspace-specific skills live in `skills/`:

- `hedge-fund-strategy-lab`
- `hedge-fund-strategy-review`
- `hedge-fund-data-quality`
- `hedge-fund-repo-architect`

For structure or scalability work, use `hedge-fund-repo-architect`. For strategy
work, use the strategy lab/review/data-quality skills as appropriate.

Recurring agents should use `docs/operations/agents/backlog.md` and leave a
handoff. They should make small, verifiable improvements and must not promote
strategies to live trading without explicit human approval.

The agent harness is documented in
`docs/operations/agents/harness.md`. It defines the mission matrix,
permission levels, approved commands, artifact expectations, verification
standard, and anti-live-trading rules. Backend agent runtime code lives in
`backend/hyperliquid_gateway/agents/`; generated agent evidence belongs under
`backend/hyperliquid_gateway/data/agent_runs/`. The renderer workbench is for
mission control and review, while Electron remains the launcher and IPC bridge.
Shared agent memory lives under `docs/operations/agents/memory/`.
It is governed by `docs/operations/agents/memory/memory-policy.md`, which keeps
memory capped, curated, and promotion-oriented.

## Verification

Recommended smoke checks after repo-structure or strategy workflow changes:

```bash
npm run hf:doctor
npm run hf:agent:runtime
npm run build
```

If a check is skipped, record why in the handoff.
