# Agent View Simplified Layout Handoff

## Objective

Simplify Agent View so the main composer is easy to use and advanced launch
controls no longer crowd the bottom of the screen.

## Scope

- Changed `WorkspaceAgentView` footer, selected-session detail actions, and
  local layout styles.
- Left IPC, preload, `PTYManager`, `TerminalPane`, backend APIs, strategy logic,
  credentials, and live trading paths unchanged.

## Changes Made

- Reduced the default footer to provider, target, `Agent actions`, message, and
  Send.
- Moved New main CLI, selected launch, roster launch, Claude View, and role
  chips into a collapsed `Agent actions` panel grouped by Open CLI, Launch
  agents, and Roles.
- Removed the duplicate provider badge from the visible composer row.
- Kept list + detail layout, tightened list/detail spacing, and added explicit
  Reply/Attach actions in the selected-session header.
- Made Reply collapsed by default and shown only for the selected session when
  the user clicks Reply.

## Files Changed

- `src/features/agents/components/WorkspaceAgentView.tsx`: simplified footer,
  advanced action panel, compact detail actions, and collapsed reply.
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
- note: `rtk npm run dev:doctor` failed once on transient Alpha tunnel
  `ECONNRESET`, then passed on retry

## Findings

- The bottom bar was trying to expose provider, four launch actions, roles,
  target state, prompt, and Send all at once. On narrow widths this wrapped into
  a noisy multi-row control surface.

## Memory Updated

- intentionally unchanged: this is a focused renderer layout change with
  evidence captured in this handoff.

## Assumptions

- The default footer should prioritize normal chat/composer use.
- Advanced launch flows should remain available but collapsed.
- The Code dock remains the full terminal viewer.

## Next Best Step

Run manual Electron UI smoke in a narrow Agent View: open Agent actions, launch
a CLI/agent set, toggle Reply, and Attach to the full terminal.
