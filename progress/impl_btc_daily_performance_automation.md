# BTC Daily Performance Automation

## Objective

Optimize `/btc` for daily use while keeping the three video streams visible by
default and preserving the persisted TradingView session.

## Scope

- `src/features/cockpit/pages/BtcAnalysisPage.tsx`
- `src/features/cockpit/pages/BtcPineLabPanel.tsx`
- `src/services/performanceTelemetry.ts`
- `progress/current.md`
- `progress/history.md`

## Changes Made

- Kept the default BTC board as TradingView plus all three YouTube streams.
- Added a `Focus` mode that keeps TradingView plus only the selected stream
  mounted, with a toolbar/button path back to all three videos.
- Moved Pine AI Lab and `lightweight-charts` into lazy-loaded
  `BtcPineLabPanel`, so the default BTC route no longer loads chart-preview code.
- Bumped BTC layout persistence to `hedge-station:btc-analysis-layout:v3`.
- Removed the permanent YouTube mute/focus interval; mute and page focus now run
  on webview navigation/load events plus the injected YouTube observer.
- Added best-effort webview cleanup on unmount: mute, stop, and `about:blank`.
- Added local `webview` and `fps` telemetry event types.
- Added Focus-only auto recovery back to all videos when the document is hidden,
  the focused video is offscreen long enough, or frame timing is poor for two
  consecutive windows.

## Verification

Commands run:

```bash
rtk npm run build
rtk npm run perf:budget
rtk npm run agent:check
rtk git diff --check
```

Result:

- passed: `rtk npm run build`
- passed: `rtk npm run perf:budget`
- passed: `rtk npm run agent:check`
- passed: `rtk git diff --check`
- browser smoke passed on `http://localhost:5173/btc`:
  - default reload: `4` webviews mounted (`TradingView + 3 videos`)
  - Focus mode: `2` webviews mounted (`TradingView + focused video`)
  - restore all videos: `4` webviews mounted
- BTC route chunk improved from baseline `435.25 KB` to `188.29 KB`.
- Pine Lab is split into its own `256.59 KB` lazy chunk.

## Risks

- Default mode still mounts three live YouTube webviews, so the largest runtime
  cost remains intentional.
- Focus mode is the real low-load escape hatch for weaker moments or market
  stress.
- Visual playback still depends on YouTube availability and the user's persisted
  YouTube session.

## Memory Updated

intentionally unchanged: this is a focused UI performance/ergonomics change,
not durable strategy or architecture policy.

## Next Best Step

Use `/btc` in default mode for the normal daily flow. When lag appears, hit
`Focus` or a stream button to keep only one stream loaded, then return to
`3 videos` when the machine feels stable.
