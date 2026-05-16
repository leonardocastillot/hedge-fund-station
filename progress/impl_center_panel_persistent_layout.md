# Center Panel Persistent Layout Handoff

- Task: `center_panel_persistent_layout`
- Date: 2026-05-16
- Owner: codex
- Mission class: UI review-speed audit

## Summary

Stabilized the Electron shell panel tree so the center `WidgetPanel` stays
mounted while the left strategy context and right workspace dock collapse or
expand.

## Changed Files

- `src/components/electron/ElectronLayout.tsx`
- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`
- `progress/impl_center_panel_persistent_layout.md`

## Implementation

- Removed the collapse-state `key` from the root `PanelGroup`.
- Kept a stable three-panel order: left side panel, center `WidgetPanel`, right
  dock panel.
- Switched side panel open/close actions to `react-resizable-panels`
  `collapsible` panels with imperative refs.
- Rendered collapsed rails inside the same side panels instead of swapping the
  panel tree.
- Preserved the existing workspace dock collapsed localStorage key.

## Verification

- `rtk npm run agent:check` passed.
- `rtk npm run build` passed.
- Browser smoke on `http://localhost:5173/btc`:
  - closed right dock
  - closed left context
  - reopened both
  - route stayed `/btc`
  - BTC workbench heading remained present
  - `Loading module...` did not appear
- Browser smoke on `http://localhost:5173/workbench`:
  - Strategy Inspector visible
  - Inspector, Code, Browser, and Runs dock controls present
  - `Loading module...` did not appear

## Notes

- No backend, Electron IPC, route, strategy logic, storage schema, credentials,
  order routing, live trading, or production promotion changed.
- Memory unchanged: this is a focused renderer layout stability fix.
