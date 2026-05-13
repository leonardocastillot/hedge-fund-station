# BTC Video Fullscreen Fix

## Objective

Fix `/btc` video fullscreen so expanding a YouTube stream does not break the
grid layout, scroll behavior, overlays, or persisted layout state.

## Changes Made

- Added app-owned fullscreen state for BTC video panels in
  `src/features/cockpit/pages/BtcAnalysisPage.tsx`.
- Added a fullscreen toggle button to each BTC video panel.
- Wired Electron `webview` `enter-html-full-screen` and
  `leave-html-full-screen` events so YouTube's native fullscreen button maps to
  the app-owned fullscreen state.
- Promoted the active video grid item to a fixed viewport layer with transform,
  resize handles, and background pointer events disabled while fullscreen is
  active.
- Added Escape close handling and a visible close/minimize button.
- Preserved the existing mute enforcement, YouTube focus injection, quality
  control, hidden webview suspension, cleanup behavior, Focus mode, and default
  three-video BTC layout.

## Verification

Commands run:

```bash
rtk npm run build
rtk npm run perf:budget
rtk npm run agent:check
rtk git diff --check
rtk curl -fsS --max-time 2 http://localhost:5173/btc
```

Results:

- Passed: `rtk npm run build`
- Passed: `rtk npm run perf:budget`
- Passed: `rtk git diff --check`
- Passed: `rtk curl -fsS --max-time 2 http://localhost:5173/btc`
- Failed, unrelated to this UI patch: `rtk npm run agent:check` reports
  `btc_adaptive_cycle_trend` appears live/production-related but is not blocked
  and lacks `operator` gates. This task was already present in the dirty
  harness state and was not changed by the fullscreen fix.

## Risks And Follow-Up

- Full behavioral smoke should be done in the Electron app because normal
  browser rendering does not reproduce Electron `<webview>` fullscreen events.
- Confirm in `/btc`: three videos load by default, each fullscreen button
  expands one stream, the native YouTube fullscreen button does not disturb the
  grid, Escape/minimize restores the grid, and route navigation still cleans up
  webviews.

## Memory Updated

Intentionally unchanged: this is a focused renderer ergonomics fix, not durable
strategy or company memory.
