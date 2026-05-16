# Workspace Dock Command Center

- Date: 2026-05-14
- Agent: Codex
- Mission class: UI review-speed audit
- Status: completed

## Summary

Converted `/workbench` into a command-first center panel and moved workspace
tools into a right-side dock with `Agent`, `Browser`, and `Code` modes.

## Changed Files

- `src/features/desks/components/WorkspaceDock.tsx`
- `src/features/desks/workspaceDockEvents.ts`
- `src/components/electron/ElectronLayout.tsx`
- `src/features/desks/pages/DeskSpacePage.tsx`
- `src/features/desks/components/DeskBrowserPanel.tsx`
- `src/components/electron/TerminalGrid.tsx`
- `src/components/electron/CommandPalette.tsx`
- `src/App.tsx`

## Details

- Replaced the right `MissionChatWorkbench`-only panel with `WorkspaceDock`.
- Added dock tab persistence per workspace using renderer local storage.
- Added an internal dock mode event so command launches and shortcuts open the
  `Code` dock automatically.
- Reworked `/workbench` into `Command Center` with quick actions, saved
  commands, launch profiles, and compact runtime status.
- Moved browser and active-workspace terminal access into the right dock.
- Added compact modes to the workspace browser and terminal grid.
- Simplified the compact browser into a Codex-like navigation surface: back,
  forward, reload, one URL/search bar, external open, small tabs, new tab, and
  close tab.
- Browser navigation now persists URL/title back into the active workspace tab
  as pages load, so the user does not need to manually save normal browsing.
- Updated remaining visible workspace/desk copy in the touched command paths.
- Replaced fixed warning/cyan browser/terminal dock colors with app theme
  variables where this work touched the UI.

## Verification

- Passed: `rtk npm run agent:brief`
- Passed: `rtk npm run agent:check`
- Passed: `rtk npx tsc --noEmit`
- Passed: `rtk npm run build`
- Passed: `rtk git diff --check`
- Passed: `rtk npm run dev:doctor`
- Re-run after browser UX pass: `rtk npx tsc --noEmit`,
  `rtk npm run build`, `rtk npm run agent:check`, `rtk git diff --check`,
  and `rtk npm run dev:doctor`.
- Browser smoke: `http://localhost:5173/workbench` loaded in the in-app browser.
  DOM confirmed `Workspace Dock`, `Agent`, `Browser`, and `Code`. The browser
  web target has no Electron preload, so it correctly showed no active
  workspace in that environment. Screenshot capture timed out in the browser
  tool, so visual evidence is DOM-based for this pass.

## Risks / Follow-Up

- Full active-workspace browser/webview behavior needs Electron runtime review,
  because plain Vite browser mode cannot provide `window.electronAPI`.
- `Code` is intentionally terminal/CLI for v1; no file explorer was added.
- No IPC, backend route, persistence schema, credentials, live trading, or
  strategy logic changed.
