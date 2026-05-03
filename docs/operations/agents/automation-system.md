# Agent Automation System

## Purpose

This document defines how automated or recurring agents should improve Hedge
Fund Station without drifting away from the product objective.

Use this for recurring jobs, background review, scheduled audits, or any agent
task that is expected to keep improving the project over time.

## Required Inputs For Any Automation

Every automation must know:

- objective: what it is improving
- scope: folders or behavior it may touch
- cadence: one-time, daily, weekly, or event-driven
- allowed actions: read-only, docs-only, code changes, tests, PR, or report
- validation: commands or checks it must run
- output: issue, note, patch, report, or handoff

If these are missing, the automation should produce a recommendation report
instead of changing code.

## Automation Classes

### 1. Repo Health Audit

Goal: keep the project understandable and easy for agents to extend.

Default scope:

- `AGENTS.md`
- `README.md`
- `docs/`
- `skills/`
- `.gitignore`
- `package.json` scripts

Expected output:

- stale docs
- broken conventions
- unclear ownership boundaries
- missing handoff rules
- recommended cleanup patches

### 2. Hedge Fund Workflow Audit

Goal: make sure strategy work follows the official research pipeline.

Default scope:

- `docs/strategies/`
- `backend/hyperliquid_gateway/strategies/`
- `backend/hyperliquid_gateway/backtesting/`
- `backend/hyperliquid_gateway/data/`

Expected output:

- strategies without specs
- specs without backend modules
- backend modules without backtest/validation path
- paper candidates without clear review path
- missing risk, cost, or failure-mode sections

### 3. Data Quality Audit

Goal: protect strategy conclusions from bad data.

Default scope:

- `backend/hyperliquid_gateway/app.py`
- `backend/hyperliquid_gateway/data/`
- `src/services/`
- relevant inspection pages

Expected output:

- schema drift
- null/missing fields
- suspicious timestamp behavior
- unstable fields used in ranking
- UI assumptions not backed by backend contracts

### 4. Validation Improvement Agent

Goal: improve evidence before any strategy is promoted.

Default scope:

- strategy docs
- strategy backend modules
- backtest adapters
- validation gates
- generated reports

Expected output:

- stronger validation criteria
- better cost/slippage assumptions
- clearer anti-regime tests
- replay or paper-review requirements

### 5. UI Review Agent

Goal: make backend outputs faster for a human to inspect.

Default scope:

- `src/services/`
- `src/pages/`
- `src/components/`

Expected output:

- missing drilldowns
- unclear labels
- slow review paths
- UI state that should come from backend
- low-risk cockpit improvements

## Default Cadence Recommendation

Use these recurring checks when automations are enabled:

- daily: repo health and backend status report
- daily: strategy/paper artifact status summary
- weekly: data quality audit
- weekly: strategy validation gap review
- weekly: UI review-speed audit

Do not auto-merge or auto-promote strategy changes. Strategy promotion requires
human review.

## Automation Output Format

Every recurring agent should end with:

- objective reviewed
- files inspected
- findings
- changes made, if any
- commands run
- verification result
- risks or blocked items
- recommended next automation

Use `docs/operations/agents/templates/handoff.md` for the final shape.

## Safe Defaults

When unsure:

- inspect first
- write a report before changing code
- prefer docs or tests before behavior changes
- keep patches small
- leave strategy logic in the backend
- require human approval for live execution, credentials, or large migrations
