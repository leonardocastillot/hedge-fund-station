# Agent View Peek Summary Handoff

## Objective

Replace the Agent View Peek raw terminal transcript with a compact, readable
session summary.

## Scope

- Inspected and changed `WorkspaceAgentView` Peek rendering only.
- Left IPC, preload, `PTYManager`, `TerminalPane`, backend APIs, strategy logic,
  credentials, and live trading paths unchanged.

## Changes Made

- Removed `terminal.getSnapshot()` from the Agent View Peek path.
- Removed the raw `<pre>` transcript dump that showed full-screen TUI buffers
  multiple times.
- Added compact summary extraction from `WorkspaceAgentSessionRow` and terminal
  metadata.
- Sanitized summary excerpts by stripping ANSI/control characters, removing box
  and block drawing glyphs, collapsing whitespace, deduplicating adjacent
  repeated lines, and limiting the text length.
- Kept `Attach`, `Reply`, active terminal selection, and composer targeting
  behavior intact.

## Files Changed

- `src/features/agents/components/WorkspaceAgentView.tsx`: Peek summary
  rendering and sanitization.
- `progress/current.md`: live harness state.
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

- Manual Electron PTY smoke was not run in this non-interactive pass. The next
  manual check should select an OpenCode/Codex row, confirm Peek is a compact
  summary, and use Attach to inspect the full console in Code.

## Findings

- The visual corruption came from rendering the PTY snapshot buffer as plain
  text. Full-screen CLIs redraw the screen frequently, so the buffer contains
  repeated frames and drawing glyphs that do not belong in the Peek summary.

## Memory Updated

- intentionally unchanged: this is a narrow renderer presentation fix with
  evidence captured in this handoff.

## Assumptions

- Peek should show only a summary.
- The Code dock remains the full terminal viewer.

## Next Best Step

Run the manual Electron smoke for OpenCode/Codex Peek and Attach behavior.
