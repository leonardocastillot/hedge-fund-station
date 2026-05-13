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

## Required Startup Checks

Recurring Hedge Fund Station automations should start with:

```bash
rtk npm run agent:brief
rtk npm run graph:status
```

Use the brief to choose the active task or safe next improvement. Use Graphify
only when `graph:status` says the artifacts are fresh enough for navigation.
When Graphify is dirty or stale, treat it as a hint and prefer source files,
canonical docs, and stable command output.

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

The current approved cadence for this repo is:

- daily at 02:30: Daily Hedge Fund Strategy Factory, which may create at most
  one backend-first strategy candidate from existing wins, losses, blockers, and
  lessons.
- daily at 03:30: one small verified improvement, biased toward validation,
  paper-readiness, data quality, or the agent operating system around the
  strategy factory output.
- weekly on Sunday at 09:00: read-only health report covering harness, memory,
  Graphify, Obsidian, strategy status, and next recommended task.

Use these recurring checks inside that cadence:

- daily factory: harness, Graphify status, `hf:status`, local evidence mining,
  duplicate-strategy check, and report-only fallback when the worktree is risky.
- daily improvement: harness, Graphify status, strategy/paper artifact status,
  and one focused improvement when safe.
- weekly: data quality, strategy validation gaps, UI review-speed gaps, memory
  cleanup needs, and automation health.

Do not auto-merge or auto-promote strategy changes. Strategy promotion requires
human review.

## Weekly Health Report Format

A weekly read-only report should include:

- objective reviewed
- commands run and result
- harness status
- Graphify freshness and recommended command
- Obsidian vault/index status
- memory actions needed, if any
- `hf:status` strategy gaps
- blocked risks
- single next best automation or task

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
