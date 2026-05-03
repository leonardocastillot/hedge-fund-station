# Agent Change Summary Template

Use this as the final review summary for meaningful agent work.

## Summary

One or two sentences describing what changed and why.

## Mission Class

Name one:

- repo health audit
- strategy research
- strategy validation audit
- data quality audit
- UI review-speed audit
- operations/runbook audit
- memory update

## Files Changed

List the important files and their purpose.

## Verification

Commands run:

```bash
# command here
```

Result:

- passed
- failed
- skipped, with reason

## Harness Checks

- Objective and scope were clear.
- Backend/UI/Electron ownership boundaries were preserved.
- Stable commands were used where practical.
- Strategy claims, if any, include a validation path.
- No live trading, credential changes, or large migrations were performed.
- Shared memory followed `memory/memory-policy.md` and was updated, promoted,
  archived, removed, or explicitly left unchanged.

## Risks And Assumptions

Name remaining risks and assumptions.

## Next Best Step

Name the single highest-value follow-up.
