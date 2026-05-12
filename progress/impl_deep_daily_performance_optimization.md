# Deep Daily Performance Optimization

## Objective

Reduce real resource cost without removing trading information: `/btc` must keep
TradingView plus all three videos visible by default.

## Scope

- Electron media sessions for YouTube and TradingView.
- BTC webview runtime behavior and video playback quality.
- Diagnostics visibility for Electron process CPU/RSS.
- Performance budget regression guards.

## Changes Made

- Added one media request-blocking pipeline per Electron session for
  `persist:youtube` and `persist:tradingview`.
- Combined local low-risk ad/tracker blocks with the Ghostery blocker engine in
  the same `onBeforeRequest` callback so Electron listeners do not overwrite
  each other.
- Added TradingView ad/tracker blocking to reduce third-party iframes such as
  DoubleClick/SafeFrame while preserving the chart webview.
- Added YouTube playback quality control by performance profile:
  `daily-light` uses readable lower-cost quality, `full` allows higher quality,
  and `ultra-light` reduces secondary streams more aggressively.
- Kept all three BTC video panels mounted in trading mode; quality is tuned, not
  hidden.
- Added Electron process diagnostics through IPC using `app.getAppMetrics()`.
  Diagnostics now shows top process CPU/RSS, renderer count, GPU count, and
  total working set sample.
- Expanded `perf:budget` so regressions fail if media request blockers or
  YouTube quality control are removed.

## Files Changed

- `electron/main/index.ts`: media session blocker pipeline for YouTube and
  TradingView.
- `src/features/cockpit/pages/BtcAnalysisPage.tsx`: profile-aware YouTube
  playback quality while preserving three visible videos.
- `electron/main/native/diagnostics-manager.ts`,
  `electron/main/ipc/ipc-handlers.ts`, `electron/preload/index.ts`,
  `electron/types/ipc.types.ts`, and `src/types/electron.d.ts`: process metrics
  IPC.
- `src/features/diagnostics/pages/DiagnosticsPage.tsx`: process load card.
- `scripts/perf-budget.mjs`: new runtime guards.

## Verification

Commands run:

```bash
rtk npm run build
rtk npm run perf:budget
rtk npm run agent:check
rtk git diff --check
rtk npx tsc --noEmit
```

Result:

- `build`: passed.
- `perf:budget`: passed; initial renderer chunk `472.15 KB`, no forbidden
  heavy markers, BTC three-video default guard passed, hidden suspension passed,
  media request blockers passed, and YouTube quality control passed.
- `agent:check`: passed.
- `git diff --check`: passed.
- `tsc --noEmit`: failed on 12 pre-existing errors outside this change. The
  new diagnostics CPU type error found during this pass was fixed.

Runtime smoke:

- Started dev app with `rtk npm run dev`; local URL is `http://localhost:5173`.
- Idle startup process sample showed Electron main, GPU, network utility, and
  renderer at `0.0%` CPU.

## Findings

- Electron webviews already run as separate renderer processes, so the app is
  already using separate OS processes for TradingView and YouTube guests.
- The next big win is not hiding videos; it is reducing third-party requests,
  controlling stream quality, and making process cost visible.
- Electron only supports one `webRequest.onBeforeRequest` listener per session,
  so ad-blocking and local media blocking must live in one callback pipeline.

## Memory Updated

Intentionally unchanged: this is renderer/Electron performance work and the
handoff in `progress/` is sufficient.

## Assumptions

- The correct default is trading stability with all three videos visible.
- `daily-light` should tune video quality and background work, not remove key
  trading surfaces.
- Backend trading logic, order routing, credentials, and strategy/paper behavior
  remain untouched.

## Next Best Step

Add an automatic “performance session report” button that records before/after
Electron process metrics for `/btc`, route changes, and hidden/minimized state
so future optimizations can be compared with hard evidence.
