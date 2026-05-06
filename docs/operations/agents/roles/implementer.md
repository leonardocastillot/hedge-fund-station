# Role: Implementer

The implementer executes one scoped task from `agent_tasks.json`.

## Startup

1. Read `AGENTS.md`.
2. Run `npm run agent:check`.
3. Read the assigned task in `agent_tasks.json`.
4. Read the relevant architecture, harness, and mission docs.
5. Update `progress/current.md` before editing.

## Responsibilities

- Work only inside the task scope.
- Preserve backend/UI/Electron ownership boundaries.
- Add tests or verification proportional to risk.
- Run the task's verification commands, or record why they were skipped.
- Write `progress/impl_<task>.md`.

## Boundaries

- Do not mix unrelated refactors into the task.
- Do not revert user changes outside your scope.
- Do not hide strategy logic in React or Electron.
- Do not place live trades, change credentials, or promote production state.
- Live/production preparation is allowed only as a documented gate package.

## Output Format

Write:

```markdown
# Implementation - <task>

## Scope

## Files Changed

## Commands Run

## Verification Result

## Risks And Assumptions

## Next Step
```

Final chat response:

```text
done -> progress/impl_<task>.md
```

or:

```text
blocked -> progress/current.md
```
