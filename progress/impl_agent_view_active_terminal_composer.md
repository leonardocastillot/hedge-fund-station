# Agent View Active Terminal Composer Handoff

## Objective

Fix Agent View so the main composer sends messages to the active writable
terminal/session in the current workspace instead of sticking to the first main
CLI.

## Scope

- Inspected renderer terminal routing in `WorkspaceAgentView`.
- Left IPC, preload, `PTYManager`, backend APIs, strategy logic, credentials,
  and live trading paths unchanged.

## Changes Made

- Added a composer target resolver that prefers the active writable terminal in
  the current workspace, then the selected Peek row terminal, then a live main
  CLI for the selected provider, then the newest live main CLI.
- Kept the fallback behavior that opens a new provider main CLI with
  `pendingInput` when no writable terminal target exists.
- Made Peek mark its terminal active so the composer follows the selected
  session.
- Changed composer UI copy from `Main` to `Target`, including the target status,
  placeholder, and send tooltip.
- Included legacy workspace terminals that match the workspace `cwd` but do not
  have `workspaceId`.

## Files Changed

- `src/features/agents/components/WorkspaceAgentView.tsx`: composer routing and
  target UI.
- `progress/current.md`: live harness state for this task.
- `progress/history.md`: durable session history entry.

## Verification

Commands run:

```bash
rtk npx tsc --noEmit
rtk npm run build
rtk npm run dev:doctor
rtk npm run agent:check
rtk git diff --check
rtk curl -fsS -o /dev/null -w 'http=%{http_code} total=%{time_total}s\n' http://localhost:5173/workbench
```

Result:

- passed

Additional smoke:

- Attempted a Node REPL Playwright smoke for `/workbench`; skipped because the
  exposed Node REPL environment does not have the `playwright` module.
- Manual Electron PTY write-routing smoke was not run in this non-interactive
  pass.

## Findings

- The IPC/main PTY layer already writes by terminal id. The routing bug lived in
  the renderer target selection: the composer preferred `workspace-main-agent`
  instead of the current active workspace terminal/session.

## Memory Updated

- intentionally unchanged: this was a narrow renderer routing fix with evidence
  captured in this handoff.

## Assumptions

- The composer should follow the active session in the current workspace.
- Failed PTYs and completed/failed runtime terminals are not writable targets.

## Next Best Step

Run the manual Electron smoke: open two Agent View/main terminals, activate the
second, send from the composer, and confirm the second terminal receives input.
