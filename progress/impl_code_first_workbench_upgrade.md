# Code-First Workbench Upgrade

- Date: 2026-05-15
- Agent: Codex
- Mission class: UI review-speed audit
- Status: done

## What Changed

- Removed the duplicated full-chat `Active` side column from
  `MissionChatWorkbench`; the central chat now uses the full middle workspace.
- Kept inline draft cards in chat with focused actions: `Run in Code`, `Edit`,
  `Stop`, and `Code` when a terminal exists.
- Reworked the right dock so `Code` includes a compact `Work Queue` above the
  terminal grid.
- The `Work Queue` shows waiting drafts, active/launching runs, failed runs, and
  attention states using existing draft, run, and terminal state.
- Queue items with terminals focus that terminal while staying in `Code`.
- Reframed the old `Runs` tab as `History` while keeping internal mode
  `runs` for compatibility.
- `History` now shows waiting, active, and attention counts plus draft/run
  history with terminal-focus actions and last-output timing.

## Important Files

- `src/features/agents/components/MissionChatWorkbench.tsx`
- `src/features/desks/components/WorkspaceDock.tsx`
- `progress/current.md`

## Verification

- `rtk npx tsc --noEmit` passed.
- `rtk npm run build` passed.
- `rtk npm run agent:check` passed.
- `rtk git diff --check` passed.
- `rtk npm run dev:doctor` passed.
- Browser smoke opened `http://localhost:5173/workbench`; DOM confirmed the
  user-facing `History` tab label replaced `Runs`, and no console errors were
  present. The browser preview has no Electron workspace bridge, so workspace
  terminal interactions remain covered by TypeScript/build/runtime checks.

## Risks And Follow-Up

- Waiting drafts in the `Work Queue` have no terminal to focus until approved;
  they remain visible as approval reminders.
- No backend API, IPC contract, backend schema, trading logic, credentials, live
  trading, or production routing changed.
