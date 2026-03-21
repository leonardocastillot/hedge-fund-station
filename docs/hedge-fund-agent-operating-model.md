# Hedge Fund Agent Operating Model

## Purpose

This repo should support hedge fund research, strategy design, validation, and visualization without turning the Electron app into the execution engine.

The operating rule is simple:

- heavy strategy computation, research pipelines, ranking, replay, and paper-execution logic belong in backend services and should run in Docker or an external process
- the Electron app should primarily visualize, inspect, compare, and control those services
- agents should not put heavy research loops, event processing, or long-running strategy engines inside the React renderer

## Repo Roles

### Renderer: visualization and operator workflow

Use the renderer for:

- dashboards
- watchlists
- strategy library views
- review and anomaly panels
- paper-trade journal views
- controls that call backend APIs

Main paths:

- `src/pages/`
- `src/components/`
- `src/services/`
- `src/contexts/`

The renderer should consume backend outputs, not own the core trading logic.

### Backend: strategy and signal engine

Use the backend for:

- market data ingestion
- signal generation
- regime classification
- setup scoring
- persistence
- replay and research harnesses
- paper execution
- performance analytics

Main paths:

- `backend/hyperliquid_gateway/app.py`
- `backend/hyperliquid_gateway/strategies/`
- `backend/hyperliquid_gateway/data/`

If a strategy needs repeated computation, persistence, ranking, or simulation, it belongs here.

### Docker / external runtime

Run the heavy parts here:

- strategy refresh jobs
- replay / backtest workers
- paper execution workers
- persistent databases
- long-running market monitors

Current entrypoint:

- `docker-compose.yml`

The app should remain useful even if these services are restarted independently.

## Strategy Build Rule

When an agent creates or improves a strategy, it should produce three layers:

1. Strategy spec
2. Backend implementation
3. Visualization and review surface

### 1. Strategy spec

Document the strategy first in:

- `docs/strategies/<strategy-id>.md`

Minimum contents:

- hypothesis and source of edge
- market regime where it should work
- entry trigger
- invalidation
- exit logic
- sizing assumptions
- expected trade frequency
- fee and slippage assumptions
- failure modes
- data dependencies
- validation plan

### 2. Backend implementation

Implement strategy logic in:

- `backend/hyperliquid_gateway/strategies/<strategy_id>/`

Recommended files:

- `spec.md`
- `logic.py`
- `scoring.py`
- `risk.py`
- `paper.py`
- `tests.md` or later automated tests

The backend implementation should expose deterministic outputs that the app can inspect.

### 3. Visualization and review

Only after the backend exists should the app add:

- strategy cards
- watchlist rows
- signal drilldowns
- paper trade review
- replay and anomaly views

The UI should never be the only place where strategy logic exists.

## Default Workflow For Agents

When an agent receives a hedge fund strategy task, it should follow this order:

1. Read existing docs and backend endpoints
2. Identify whether the task is research, implementation, validation, or visualization
3. Write or update the strategy spec first
4. Place core logic in backend strategy modules
5. Keep long-running or heavy work out of the renderer
6. Expose outputs through an API shape the app can inspect
7. Add or update visualization only after the backend contract is clear
8. End with validation notes, risks, and next tests

## What Agents Must Avoid

- putting strategy logic only inside React pages
- using the Electron app as the trading engine
- mixing data ingestion, ranking, and rendering in one file
- shipping strategy claims without a validation plan
- treating paper trading as optional
- implementing live automation before replay and paper evidence

## Target Strategy Areas

The current repo is strongest around Hyperliquid short-horizon discretionary support. Agents should prioritize:

- regime detection
- crowding and derivatives stress
- setup scoring
- watchlists with triggers and invalidations
- paper trade journaling
- replay and review
- execution-quality analytics

## Decision Boundary

If a task asks for a new strategy:

- create or update a doc in `docs/strategies/`
- create or update a backend module in `backend/hyperliquid_gateway/strategies/`
- only then connect it to the app

If a task asks for better visibility:

- improve the Electron views and APIs
- do not move core strategy logic into the renderer

## Outcome Standard

A strategy is not considered well done unless it has:

- a written spec
- backend logic
- persistence or replay path if needed
- paper validation path
- operator-facing visualization
- explicit failure modes
