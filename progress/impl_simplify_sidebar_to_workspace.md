# Simplify Sidebar To Workspace

- Date: 2026-05-14
- Agent: Codex
- Mission class: UI review-speed audit
- Status: completed

## Changed Files

- `src/components/electron/Sidebar.tsx`
- `src/components/electron/WorkspaceModal.tsx`
- `src/components/electron/ElectronLayout.tsx`
- `src/features/cockpit/navigation.ts`
- `src/features/desks/pages/DeskSpacePage.tsx`
- `src/App.tsx`
- `progress/current.md`
- `progress/history.md`

## Summary

- Replaced the wide left sidebar with a single flat `Workspace` switcher.
- Removed visible Trading Stations, grouped desk sections, active desk details,
  launch profiles, saved commands, and liquidation traps from that sidebar.
- Kept workspace switching behavior: selecting a workspace sets it active,
  resets the workbench view to overview, and navigates to `/workbench`.
- Updated nearby visible copy from desk-oriented language to workspace-oriented
  language in the layout, modal, navigation, shortcuts, and empty workbench
  state.

## Verification

- Passed: `rtk npx tsc --noEmit`
- Passed: `rtk npm run build`
- Passed: `rtk npm run agent:check`
- Passed: `rtk git diff --check`
- Passed: `rtk npm run dev:doctor`
- Visual smoke: in-app browser opened `http://localhost:5173/workbench`.
  Confirmed `Workspace`, `Add workspace`, and `No active workspace` appear, and
  `Trading Stations`, `Active Desk`, `Desk Space`, `Live Trading`,
  `Hedge Fund Desk`, and `No active desk` do not appear.

## Risks And Notes

- The browser smoke used the web renderer context, which had no saved local
  Electron workspaces, so it verified the empty state and sidebar shell.
- Existing unrelated dirty files were preserved.
- No IPC, persistence schema, backend strategy logic, live trading, credentials,
  or production routing changed.
