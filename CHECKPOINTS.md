# Agent Harness Checkpoints

These checkpoints define the objective "healthy final state" for agent work in
Hedge Fund Station. Reviewers should use this file before approving a task.

## C1 - File Harness Exists

- [ ] `AGENTS.md` has the navigation map and links to the harness files.
- [ ] `agent_tasks.json` exists and parses as JSON.
- [ ] `progress/current.md` exists.
- [ ] `progress/history.md` exists.
- [ ] `docs/operations/agents/file-harness.md` exists.
- [ ] `docs/operations/agents/roles/` contains leader, explorer,
      implementer, and reviewer contracts.
- [ ] `rtk npm run agent:check` exits 0.

## C2 - Task State Is Coherent

- [ ] Every task has `id`, `title`, `mission_class`, `priority`, `scope`,
      `acceptance`, `verification`, `status`, `owner`, `evidence_paths`, and
      `notes`.
- [ ] Every task status is one of `pending`, `in_progress`, `review`, `done`,
      or `blocked`.
- [ ] At most one non-parallel implementation task is `in_progress`.
- [ ] `progress/current.md` names the active task when a task is
      `in_progress` or `review`.
- [ ] Blocked tasks explain the blocker in `notes`.

## C3 - Evidence Is Inspectable

- [ ] Explorers write findings to `progress/explore_<topic>.md`.
- [ ] Implementers write changed files, commands, and results to
      `progress/impl_<task>.md`.
- [ ] Reviewers write approval or requested changes to
      `progress/review_<task>.md`.
- [ ] Completed tasks include evidence paths and verification commands.
- [ ] Generated trading or strategy evidence remains in the backend artifact
      layer, not hidden in React or chat.

## C4 - Verification Is Real

- [ ] `rtk npm run agent:check` passes.
- [ ] Mission-specific commands from `agent_tasks.json` were run or skipped
      with an explicit reason.
- [ ] Strategy work uses stable `hf:*` commands when applicable.
- [ ] UI work runs `rtk npm run build` or records why it was not practical.
- [ ] No task is marked `done` based only on model confidence or chat claims.

## C5 - Handoff Is Durable

- [ ] The final report states what changed, where, commands run, verification
      status, risks, assumptions, and next action.
- [ ] `progress/history.md` has an append-only summary for meaningful sessions.
- [ ] Shared memory is updated only if the memory policy says the context is
      durable and useful.
- [ ] No raw prompts, secrets, scratch dumps, or temporary logs are promoted to
      shared memory.

## C6 - Production And Live Gates Stay Explicit

- [ ] Live trading is treated as a possible future production stage, not an
      informal agent action.
- [ ] Any live or production task stays `blocked` until it names research,
      backtest, validation, paper evidence, risk limits, operator sign-off, and
      production runbook requirements.
- [ ] No agent places live orders, changes credentials, or promotes a strategy
      to production without the documented gate package and explicit human
      approval.
