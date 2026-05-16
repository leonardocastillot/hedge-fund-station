# Strategy Pod Agentic Workbench Handoff

## Objective

Reframe `/workbench` as an agentic strategy pod station: center chat/session
control, right dock strategy inspection, and local Strategy Pods instead of
folder-oriented workspaces.

## Scope

- Renderer workbench shell, sidebar, right dock, workspace modal, workspace
  context, agent profile defaults.
- Native/Electron workspace metadata normalization.
- Existing backend Strategy Lab endpoint and typed `hyperliquidService`
  methods were reused; no new trading API was added.

## Changes Made

- Added `strategy-pod` as a workspace kind across shared Electron/renderer
  types, native workspace normalization, defaults, and React workspace
  normalization.
- Restored `/workbench` center to the agentic command surface:
  `MissionChatWorkbench` by default, `WorkspaceAgentView` as sessions mode,
  plus a thin active pod/gate/suggested-command header.
- Added right-dock `inspector` mode and made it the default for strategy pods
  and hedge-fund workspaces.
- Moved Strategy Lab review into `StrategyInspectorPanel`: strategy selector,
  chart with markers, metrics, equity curve, evidence timeline, next gate,
  gated backend actions, Strategy Factory, and Pine Indicator Lab.
- Reworked the left rail visually to `Strategy Pods`; `+` now opens a pod
  creator with `From Catalog` and `New Strategy` flows.
- Added local pod actions: edit, duplicate, delete config only, open Agent CLI,
  and open Inspector.
- Updated `WorkspaceModal` for strategy-pod-specific metadata while keeping
  legacy workspace editing.

## Files Changed

- `src/features/desks/pages/DeskSpacePage.tsx` restores center chat/sessions.
- `src/features/desks/components/StrategyInspectorPanel.tsx` owns the right
  dock strategy inspection experience.
- `src/features/desks/components/WorkspaceDock.tsx` adds `inspector` mode.
- `src/features/desks/workspaceDockEvents.ts` extends dock mode typing.
- `src/components/electron/Sidebar.tsx` implements Strategy Pod create/actions.
- `src/components/electron/WorkspaceModal.tsx` adds pod metadata editing.
- `src/contexts/WorkspaceContext.tsx`,
  `src/contexts/AgentProfilesContext.tsx`,
  `src/types/electron.d.ts`,
  `electron/types/ipc.types.ts`, and
  `electron/main/native/workspace-manager.ts` add pod metadata support.

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk npx tsc --noEmit
rtk npm run build
rtk npm run dev:doctor
```

Result:

- passed
- Browser smoke passed for `/workbench` no-pod state, `Strategy Pods` rail, and
  pod creator modal loading the backend catalog including
  `BTC Convex Cycle Trend`.
- Browser smoke could not create/select a persisted Electron pod because the
  Vite browser preview has no Electron workspace preload API.

## Findings

- `dev:doctor` reports local active workspace as `command-hub` at
  `/Users/optimus/Documents`; new strategy pods still force the repo cwd to
  `/Users/optimus/Documents/hedge_fund_stations`.
- Full create/edit/delete persistence should be smoke-tested inside the
  Electron shell, not only the browser preview.

## Memory Updated

- intentionally unchanged: this was product/UI implementation work with a
  handoff artifact; no durable operating rule needed promotion.

## Assumptions

- Strategy pods are local app config only, not backend strategy files or new
  filesystem folders.
- Chart/review data remains backend-owned through the existing lab endpoint.
- No live trading, credential, order routing, or production promotion behavior
  was added.

## Next Best Step

Run an Electron-shell smoke that creates a catalog pod for
`btc_convex_cycle_trend`, edits color/pin/tabs, deletes the pod, and confirms
only local workspace config changes.
