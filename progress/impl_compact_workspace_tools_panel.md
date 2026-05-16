# Compact Workspace Tools Panel

## Objective

Make the right Workspace Tools panel terminal-first by removing wasted top
chrome and stabilizing compact terminal sizing.

## Scope

- Renderer workspace dock and compact terminal surfaces.
- No backend, IPC contract, persistence schema, strategy logic, credentials, or
  trading behavior.

## Changes Made

- Replaced the separate `Workspace Tools` header and large Code/Browser/History
  tabbar with one compact dock toolbar.
- Moved the launch `+` menu into the dock toolbar, keeping Code, Browser, and
  History as icon-only controls.
- Moved queue state into a compact toolbar badge and kept the extra queue strip
  hidden unless there is attention/failure state.
- Removed the embedded Code toolbar inside `TerminalGrid` so the terminal owns
  the available vertical space.
- Made compact terminal layout stable: one terminal fills the host; multiple
  terminals stack at fixed card height with scroll.
- Stabilized xterm fitting by using animation-frame resize, ignoring zero-size
  containers, adding `minHeight: 0`, and narrowing terminal chrome transitions.

## Files Changed

- `src/features/desks/components/WorkspaceDock.tsx`: compact toolbar, queue
  badge, and dock-level launcher.
- `src/components/electron/TerminalGrid.tsx`: terminal-first embedded compact
  layout without duplicate toolbar.
- `src/components/electron/TerminalPane.tsx`: stable xterm resize and compact
  chrome memo comparison.
- `progress/current.md`: active session state.

## Verification

Commands run:

```bash
rtk npx tsc --noEmit
rtk npm run build
rtk npm run dev:doctor
rtk npm run agent:check
rtk git diff --check
```

Result:

- passed

Browser smoke:

- Opened `http://localhost:5173/workbench` in the in-app browser.
- Confirmed the old `Workspace Tools` header is gone.
- Confirmed dock toolbar, launch button, and unique Code/Browser/History
  buttons render and can be clicked.
- Browser preview cannot create real workspace terminals because it has no
  Electron preload `workspace`/`terminal` API, so Shell/Dev/Codex launch smoke
  was not available in that surface.
- Browser console error check returned no errors.

## Findings

- The prior size jitter was consistent with fixed compact terminal min-heights,
  an extra embedded toolbar, and animated terminal root transitions competing
  with xterm fit.
- Full terminal launch verification still needs the real Electron shell, not
  the Vite web preview.

## Memory Updated

- intentionally unchanged: this is a focused renderer polish pass and does not
  create durable company memory.

## Assumptions

- Code mode remains the priority for the right dock.
- Browser and History stay available, but should not consume vertical space.
- Existing unrelated worktree changes are preserved.

## Next Best Step

Run an Electron-shell smoke with an active workspace and launch Shell, Dev, and
Codex from the new dock toolbar to confirm real PTY sizing behavior.
