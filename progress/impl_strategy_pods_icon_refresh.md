# Strategy Pods Icon Refresh

## Objective

Make the left navigation entry for Strategy Pods feel like a trading operations
workspace instead of an AI assistant or generic lab surface.

## Scope

- Renderer app navigation.
- Hedge Fund Station module link icon.
- Strategy Pod sidebar icon mapping and defaults.
- Electron workspace defaults for new Strategy Pods.

## Changes Made

- Changed the primary `/workbench` rail item from `Lab` / `FlaskConical` to
  `Strategy Pods` / `Blocks`.
- Changed the Hedge Fund Station `Desk Space` module icon from `Bot` to
  `Blocks`.
- Added `blocks` to the Strategy Pod sidebar icon map and made Strategy Pod list
  items render with `Blocks`, including existing pods whose persisted icon is
  still `chart`.
- Updated new/fallback Strategy Pod defaults to store `icon: 'blocks'`.

## Files Changed

- `src/features/cockpit/navigation.ts` - primary rail item for `/workbench`.
- `src/features/stations/pages/HedgeFundStationPage.tsx` - module link icon.
- `src/components/electron/Sidebar.tsx` - Strategy Pod sidebar icon rendering.
- `src/contexts/WorkspaceContext.tsx` - renderer fallback pod default icon.
- `electron/main/native/workspace-manager.ts` - main-process default pod icon.
- `progress/current.md` - active session state.

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk npm run build
rtk git diff --check
```

Result:

- passed

## Findings

- The worktree had many unrelated existing changes before this task. This patch
  only touched the Strategy Pod / Workbench icon files and progress files.
- No backend strategy logic, credentials, order routing, paper supervisor loop,
  live trading, or production promotion changed.

## Memory Updated

Intentionally unchanged: this was a small UI icon refinement, not durable
company policy or strategy evidence.

## Assumptions

- The user meant the first primary rail item that opens `/workbench`, where the
  Strategy Pods sidebar is shown.
- `Blocks` is the best fit because it reads as pods/workspaces, not AI.

## Next Best Step

Run a manual Electron visual pass on `/workbench` to confirm the icon reads well
in the actual app chrome.
