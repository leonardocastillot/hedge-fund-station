# Right Dock Terminal Grid

## Objective

Fix the right Code dock so multiple workspace terminals stay visible and usable
instead of being reduced to only the focused pane or visually overlapping.

## Scope

- `src/features/desks/components/WorkspaceDock.tsx`
- `src/components/electron/TerminalGrid.tsx`
- `src/components/electron/TerminalPane.tsx`
- Harness files: `progress/current.md`, `progress/history.md`

## Changes Made

- Removed the compact dock's `focusedTerminalId` filtering path so the Code dock
  renders every terminal for the active workspace.
- Changed embedded compact terminal layout from forced vertical stack to a
  responsive CSS grid:
  - 1 terminal fills the dock.
  - 2 terminals split the available dock height.
  - 3+ terminals keep minimum usable row height and scroll instead of clipping.
- Added `minWidth`, `minHeight`, `contain`, and stable grid row sizing around
  terminal cells so xterm panes resize inside their own slots.
- Tightened compact terminal chrome:
  - compact status becomes a small colored dot instead of a wide text pill.
  - terminal controls use lucide icons.
  - active terminal z-index is scoped low with `isolation: isolate` to avoid
    visual overlap across neighboring panes.

## Files Changed

- `src/features/desks/components/WorkspaceDock.tsx`: stopped passing
  `activeTerminalId` as a visibility filter into compact Code.
- `src/components/electron/TerminalGrid.tsx`: keeps all active-workspace
  terminals visible and uses responsive compact grid sizing.
- `src/components/electron/TerminalPane.tsx`: improves compact header,
  controls, active border, and stacking behavior.
- `progress/current.md`: recorded this active session and result.
- `progress/history.md`: appended durable session summary.

## Verification

Commands run:

```bash
rtk npx tsc --noEmit
rtk npm run build
rtk npm run agent:check
rtk git diff --check -- src/components/electron/TerminalGrid.tsx src/components/electron/TerminalPane.tsx src/features/desks/components/WorkspaceDock.tsx progress/current.md
rtk npm run dev:doctor
rtk curl -fsS http://localhost:5173/workbench
```

Result:

- passed

Additional notes:

- `npm run preview -- --host 127.0.0.1` was rejected by `electron-vite preview`
  because `--host` is not a supported option.
- `npm run preview` rebuilt and launched the Electron preview successfully.
- Full automated browser/PTY interaction was skipped because no browser
  automation tool was available in this session and Node REPL could not import
  Playwright. The real Electron dev renderer was live and `dev:doctor` passed.

## Findings

- The user-visible bug came from compact Code filtering `TerminalGrid` down to
  `activeTerminalId`; opening a second terminal succeeded, but the dock hid it.
- The compact layout also forced a stack mode rather than a dock-filling grid,
  which made multi-terminal use feel cramped and hard to inspect.

## Memory Updated

intentionally unchanged: this was a focused renderer layout fix and did not
create durable company memory beyond the handoff.

## Assumptions

- The right dock should prioritize active workspace terminals, not global
  terminal sessions.
- For narrow dock widths, a one-column grid with split rows is more usable than
  squeezing two xterm panes side by side.

## Next Best Step

Run an in-Electron manual smoke: open two Code dock terminals for the active
workspace, confirm both panes are visible, type in each pane, resize the right
dock, and confirm xterm reflows without overlap.
