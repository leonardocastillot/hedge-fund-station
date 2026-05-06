# File-Based Agent Harness

## Purpose

This harness adapts the useful file architecture from
`betta-tech/ejemplo-harness-subagentes` to Hedge Fund Station.

The goal is not to copy a Claude-specific setup. The goal is to make the repo
itself the operating surface for any AI agent: Codex, Claude, Gemini, an
external CLI, or an in-app mission runner.

## Core Files

| File or folder | Purpose |
| --- | --- |
| `AGENTS.md` | Entry map for every agent. |
| `agent_tasks.json` | Canonical queue of scoped tasks. |
| `CHECKPOINTS.md` | Objective review checklist. |
| `progress/current.md` | Live session state. |
| `progress/history.md` | Append-only session history. |
| `progress/explore_<topic>.md` | Explorer reports. |
| `progress/impl_<task>.md` | Implementation reports. |
| `progress/review_<task>.md` | Reviewer verdicts. |
| `docs/operations/agents/roles/` | Vendor-neutral role contracts. |
| `scripts/agent_harness.py` | No-dependency harness checker. |

## Task Queue Contract

`agent_tasks.json` is the source of truth for agent work.

Each task must have:

- `id`
- `title`
- `mission_class`
- `priority`
- `scope`
- `acceptance`
- `verification`
- `status`
- `owner`
- `evidence_paths`
- `notes`

Valid statuses:

- `pending`
- `in_progress`
- `review`
- `done`
- `blocked`

By default, only one non-parallel implementation task may be `in_progress`.
Exploration reports may run in parallel when their scope is disjoint and the
leader records the split.

## Anti-Telephone Rule

Subagents should not pass large findings through chat. They write files and
return references.

Good:

```text
done -> progress/explore_strategy_registry.md
APPROVED -> progress/review_strategy_readiness_matrix.md
blocked -> progress/current.md
```

Bad:

```text
Here is a long unstructured summary of everything I found...
```

The file is the evidence. Chat is only the pointer.

## Role Flow

1. Leader reads the task queue and chooses one task.
2. Explorers answer scoped questions and write `progress/explore_*.md`.
3. Implementer changes only the task scope and writes `progress/impl_*.md`.
4. Reviewer reads the evidence, runs checks, and writes `progress/review_*.md`.
5. Leader or implementer updates `agent_tasks.json`, `progress/current.md`, and
   `progress/history.md`.

For simple work, one agent may act as implementer and still leave the same
files. The review step should remain separate when the change affects trading,
backend contracts, production readiness, or broad repo conventions.

## Production And Live Work

Live trading is a possible future stage, not a forbidden end state. It is also
not an informal agent action.

Any task that touches live trading, production execution, credentials, routing,
or promotion must remain `blocked` until it names:

- research thesis
- deterministic backtest evidence
- validation report
- paper evidence
- risk limits
- operator sign-off
- monitoring and kill-switches
- rollback procedure
- production runbook

Agents may prepare the gate package. They may not skip it.

## Verification

Use the harness commands first:

```bash
npm run agent:check
npm run agent:status
```

Then run mission-specific commands from the task:

```bash
npm run hf:doctor
npm run hf:backtest
npm run hf:validate
npm run hf:paper
npm run build
```

The harness does not replace the stable `hf:*` command surface. It makes agent
work easier to inspect before and after those commands run.
