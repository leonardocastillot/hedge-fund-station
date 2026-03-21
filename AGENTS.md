# Hedge Fund Station Agent Guide

## Mission

This workspace is for building a world-class hedge fund research and operating stack.

Agents working here should optimize for:

- strategy quality
- validation quality
- operational reliability
- fast human review
- separation between heavy compute and UI

## Core Repo Rule

Do not treat the Electron app as the trading engine.

Use this split:

- `src/` is for visualization, review, operator controls, and mission surfaces
- `backend/hyperliquid_gateway/` is for market logic, signal logic, persistence, replay, paper execution, and APIs
- Docker or external processes should run heavy or long-lived workloads
- `docs/` is where strategy reasoning, validation plans, and operating rules live

## Stable Command Surface

Operate milestone 1 through the stable CLI first:

- `npm run hf:doctor`
- `npm run hf:strategy:new -- --strategy-id <strategy_id>`
- `npm run hf:backtest`
- `npm run hf:validate`
- `npm run hf:paper`
- `npm run hf:status`

Command implementation lives in:

- `scripts/hf.py`
- `backend/hyperliquid_gateway/cli.py`

Agents should prefer these commands over ad hoc one-off scripts when the task is
research, backtest, validation, or paper-candidate preparation.

## Required First Read

Before changing anything for hedge fund work, read:

1. `docs/hedge-fund-agent-operating-model.md`
2. `docs/hyperliquid-strategy-roadmap.md`
3. `docs/strategies/README.md`
4. `backend/hyperliquid_gateway/strategies/README.md`

If the task is strategy-related, also read the relevant file under:

- `skills/`

## Strategy Creation Standard

Every serious strategy should have all three layers:

1. Spec:
   - `docs/strategies/<strategy-id>.md`
2. Backend implementation:
   - `backend/hyperliquid_gateway/strategies/<strategy-id>/`
3. Visualization and review:
   - app pages, widgets, watchlists, data views, paper review surfaces

Do not ship strategy logic only in React.

## What Agents Should Build

Agents should focus on:

- market regime classification
- derivatives and crowding analysis
- setup scoring
- trigger and invalidation logic
- replay and paper-trade validation
- risk rules
- execution-quality analytics
- data quality checks

## What Agents Must Avoid

- putting heavy compute loops in the renderer
- using UI state as the source of truth for trading logic
- making claims about edge without a validation path
- skipping paper execution and replay
- building live automation before backend validation is credible

## Preferred Workflow

1. Understand the task category:
   - research
   - strategy design
   - backend implementation
   - validation
   - visualization
2. Map current repo state first
3. Write or update the strategy spec if the task affects a strategy
4. Implement core logic in backend
5. Expose inspectable outputs through APIs
6. Add UI for review and control
7. End with explicit risks, assumptions, and next validation steps

For the milestone 1 flow, map work into:

1. research note or donor audit
2. strategy spec
3. backend implementation
4. `hf:backtest`
5. `hf:validate`
6. `hf:paper`
7. UI integration only after backend artifacts are inspectable

## File Placement Rules

### Strategy docs

- `docs/strategies/<strategy-id>.md`

### Backend logic

- `backend/hyperliquid_gateway/strategies/<strategy-id>/logic.py`
- `backend/hyperliquid_gateway/strategies/<strategy-id>/scoring.py`
- `backend/hyperliquid_gateway/strategies/<strategy-id>/risk.py`
- `backend/hyperliquid_gateway/strategies/<strategy-id>/paper.py`

### App integration

- `src/services/` for API client work
- `src/pages/` for major surfaces
- `src/components/` for reusable views

## Validation Standard

A strategy is not done unless the workspace can answer:

- what is the edge
- where should it work
- where should it fail
- what data powers it
- how is it ranked
- how is it invalidated
- how will it be replayed
- how will it be paper-traded
- how will humans inspect it quickly

## If You Are Unsure

Default to:

- clearer docs
- backend-first design
- inspectable outputs
- less magic in the UI

If using donor material, audit it first, adapt it, and record the source in docs.
