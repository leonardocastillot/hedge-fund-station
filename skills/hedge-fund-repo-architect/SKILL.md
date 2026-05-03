# Skill: Hedge Fund Repo Architect

## Use This When

Use this skill when the task is:

- reorganize folders or documentation
- improve agent workflows
- clarify ownership boundaries
- add repo conventions
- reduce coupling between backend, UI, Electron, docs, and scripts
- make the project easier for future agents to extend

## Read First

1. `AGENTS.md`
2. `docs/project-architecture.md`
3. `docs/operations/product-objective.md`
4. `docs/operations/agents/harness.md`
5. `docs/operations/agents/memory/memory-policy.md`
6. `docs/operations/agents/memory/shared-memory.md`
7. `docs/operations/agents/automation-system.md`
8. `docs/hedge-fund-agent-operating-model.md`
9. `docs/hyperliquid-strategy-roadmap.md`
10. `package.json`
11. relevant `README.md` files in the folders being changed

## Expected Outputs

Produce one or more of:

- updated architecture or operations docs
- clearer `AGENTS.md` rules
- new or updated skill instructions
- safer folder conventions
- stable command documentation
- agent harness mission templates
- first-run agent orientation docs
- shared agent memory updates
- migration notes when moving files is unavoidable
- continuous improvement backlog entries
- handoff templates or automation protocols

## Allowed Target Areas

Prefer changes in:

- `AGENTS.md`
- `README.md`
- `docs/`
- `skills/`
- `.gitignore`
- `package.json` scripts documentation when necessary
- `docs/operations/agents/backlog.md`
- `docs/operations/agents/templates/handoff.md`
- `docs/operations/agents/memory/`

Avoid changing source code unless the task explicitly requires it.

## Workflow

1. Map the current repo state before proposing changes.
2. Separate source folders, generated artifacts, runtime outputs, and docs.
3. Preserve existing imports and command behavior unless a migration is explicit.
4. Prefer additive docs and compatibility notes before moving files.
5. Keep hedge fund logic backend-first and UI as cockpit.
6. Tie recurring work to `docs/operations/product-objective.md`.
7. Use `docs/operations/agents/harness.md` to classify agent mission
   types, permissions, artifacts, and verification.
8. Update `docs/operations/agents/memory/` only according to
   `memory-policy.md` when the work creates durable context for future agents.
9. Record assumptions and follow-up migration steps.

## Validation

Before finishing, verify:

- new agents can identify where to place a strategy, endpoint, UI page, runbook,
  and generated artifact
- stable `npm run hf:*` commands are still documented
- agent missions have an explicit class, allowed scope, expected evidence, and
  verification path
- no source imports were broken by folder changes
- docs, `AGENTS.md`, and skills tell the same architecture story

## Rules

- Do not move large folder trees in the same step as behavior changes.
- Do not hide strategy logic in React or Electron.
- Do not delete generated artifacts unless the user explicitly asks.
- Do not replace stable commands with ad hoc scripts.
