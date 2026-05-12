# BTC Layout Flexibility Polish Handoff

## Objective

Make the BTC workbench feel easier to mold around the available space, without
debugging the YouTube 152-4 playback error.

## Scope

- `src/features/cockpit/pages/BtcAnalysisPage.tsx`
- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`

## Changes Made

- Changed BTC layout persistence to `hedge-station:btc-analysis-layout:v2` so
  the finer layout model starts cleanly.
- Expanded the grid from 12 coarse desktop columns to 24 desktop columns, with
  smaller row height and tighter margins.
- Added quick presets: `Balance`, `Video`, `TV`, and `Mosaico`.
- Added edit-mode +/- controls for TradingView and each video panel.
- Exposed more resize handles in edit mode: corner, right edge, and bottom
  edge.
- Made edit mode more visible with panel outlines, a subtle grid background,
  and larger resize handles.
- Kept the 152-4 video error out of scope as requested.

## Files Changed

- `src/features/cockpit/pages/BtcAnalysisPage.tsx` - refined workbench grid,
  presets, per-panel sizing controls, and edit-mode affordances.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md` - harness
  tracking and handoff state.

## Verification

Commands run:

```bash
rtk npm run build
rtk npx tsc --noEmit
rtk git diff --check
rtk npm run agent:check
```

Result:

- passed: `rtk npm run build`
- passed: `rtk git diff --check`
- passed: `rtk npm run agent:check`
- partial: `rtk npx tsc --noEmit` still fails on existing non-BTC errors; it
  reports no `BtcAnalysisPage.tsx` errors.

## Findings

- The earlier implementation was technically resizable, but the 12-column grid
  and larger row height made it feel too chunky for the user's intended
  workflow.
- YouTube embed playback error 152-4 remains intentionally unresolved in this
  pass.

## Memory Updated

intentionally unchanged: this is UI ergonomics follow-up, not durable strategy
or architecture policy.

## Assumptions

- The desired behavior is easy layout molding first; video playback diagnostics
  are a separate future task.
- TradingView must remain visible, but can be made small or large through
  presets, drag, resize, and +/- controls.

## Next Best Step

Open `/btc`, press `Editar`, then try the `Video`, `TV`, and `Mosaico` presets
plus direct drag/resize to tune the final preferred layout.
