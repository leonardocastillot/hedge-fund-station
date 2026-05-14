# Desk Space Complete Workspaces

## Objective

Make each desk/workspace feel like a complete operating room instead of only a
terminal selector: scoped agents, terminals, browser tabs, stats, commands, and
workspace state all belong to the active desk.

## Changes Made

- Added `DeskBrowserTab` and `Workspace.browser_tabs` to the Electron IPC and
  renderer workspace contracts.
- Migrated workspace normalization so generated/default desk routes now land on
  `/workbench`, while non-generated custom routes remain intact.
- Added default browser tabs by desk kind:
  - `hedge-fund`: TradingView BTC and gateway health.
  - `command-hub`: local dev server.
  - `ops`: gateway and backend health.
  - `project`: local app.
- Added `src/features/desks/` with `DeskSpaceContext`, `DeskSpacePage`, and
  `DeskBrowserPanel`.
- Made `/workbench` the active desk space: overview stats, saved commands,
  browser tabs, scoped agents, and scoped terminals.
- Kept `/station/hedge-fund` as a fixed trading station separate from desk
  switching.
- Made Sidebar, Command Palette, `Cmd+1-9`, and Hedge Fund Station command
  launches route into `/workbench` and select the relevant desk view.
- Added editable browser tabs in both Desk Space and `WorkspaceModal`
  Advanced. Desk webviews use `persist:desk-${workspace.id}` partitions and
  block non-`http`, non-`https`, and non-`about:blank` URLs.
- Made `TerminalGrid` support embedded active-desk mode and adjusted
  `AgentsPanel` copy by desk kind.

## Files Changed

- `electron/main/native/workspace-manager.ts`
- `electron/types/ipc.types.ts`
- `src/types/electron.d.ts`
- `src/features/desks/`
- `src/features/cockpit/WidgetPanel.tsx`
- `src/components/electron/Sidebar.tsx`
- `src/components/electron/CommandPalette.tsx`
- `src/components/electron/TerminalGrid.tsx`
- `src/components/electron/WorkspaceModal.tsx`
- `src/features/agents/panels/AgentsPanel.tsx`
- `src/App.tsx`
- `docs/project-architecture.md`
- `docs/operations/how-to-develop-this-app.md`
- `src/features/README.md`

## Verification

Commands run:

```bash
rtk npm run build
rtk npm run agent:check
rtk npm run terminal:doctor
rtk git diff --check
```

Result:

- passed

## Risks And Follow-Up

- Manual Electron smoke is still recommended: switch Command Hub, hedge fund,
  ops, and project desks; confirm `/workbench` updates, browser tabs persist per
  desk, and terminal launches remain scoped.
- New desk webviews intentionally use isolated partitions, so existing
  TradingView or YouTube login state from older shared partitions will not
  carry over automatically.

## Memory Updated

- promoted: architecture/docs now state that `/workbench` is the complete active
  desk space and fixed trading stations are separate.

## No-Go Areas

- No backend trading logic, paper/live execution, credentials, production
  routing, or strategy computation changed.
