# Hedge Fund Skills

This folder contains workspace-specific skills for agents operating in Hedge
Fund Station.

Each skill folder contains a `SKILL.md` with:

- when to use the skill
- required first reads
- expected outputs
- repo paths to inspect first
- allowed target areas
- workflow steps
- validation rules

## Current Skills

- `hedge-fund-strategy-lab` for creating or improving strategies
- `hedge-fund-strategy-review` for challenging strategy quality and production
  readiness
- `hedge-fund-data-quality` for checking market data trust, schemas, anomalies,
  and persistence assumptions
- `hedge-fund-repo-architect` for folder structure, docs, agent workflows, and
  repo scalability

## Usage Rule

Use the smallest skill set that covers the task.

- Strategy idea or trigger design: start with `hedge-fund-strategy-lab`
- Strategy critique or readiness review: start with `hedge-fund-strategy-review`
- Endpoint/schema/data trust issue: start with `hedge-fund-data-quality`
- Folder/docs/agent workflow cleanup: start with `hedge-fund-repo-architect`

All skills inherit the repo constitution in `AGENTS.md` and the architecture
contract in `docs/project-architecture.md`.
