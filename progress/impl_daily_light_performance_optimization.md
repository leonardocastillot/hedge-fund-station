# Daily Light Performance Optimization

## Objective

Make the app usable all day with lower default CPU/GPU, while preserving the
operator requirement that `/btc` shows TradingView plus all three trading videos
at the same time.

## Scope

- Renderer settings, polling, lazy route/module loading, `/btc` webviews, and
  diagnostics data-footprint reporting.
- Electron preload/main diagnostics IPC for local data footprint inspection.
- Performance budget script and live Electron process smoke.

## Changes Made

- Added app `performanceProfile` settings with `daily-light` as the default,
  plus `full` and `ultra-light`.
- Routed shared market polling through the active performance profile: visible
  polling is scaled by profile, hidden windows wait at least the profile hidden
  delay, and manual refresh remains immediate.
- Avoided collapsed sidebar polling for liquidation overview surfaces.
- Kept `/btc` in trading mode by default: TradingView plus all three YouTube
  streams visible, with `Focus` retained as an emergency/manual low-load mode.
- Hardened the BTC frame guard so normal YouTube/TradingView startup does not
  prematurely drop the desk to Focus mode; it now waits for warmup and sustained
  severe frame pressure before reducing media.
- Added hidden-window webview suspension that swaps TradingView/YouTube webviews
  to `about:blank` while hidden and restores them on focus/pageshow without
  changing the saved three-video layout.
- Preserved and extended best-effort webview cleanup on route changes so leaving
  `/btc` stops media guests instead of leaving renderers alive.
- Split more heavy code behind user intent: `BackendStatus`, `CommandPalette`,
  `Sidebar`, Pine Lab, terminal voice input, Gemini voice, Voice Orb/Three.js,
  Memory Graph/vis-network, and chart-heavy chunks are not part of the initial
  renderer bundle.
- Added diagnostics data-footprint reporting for the local data dir and SQLite
  DB. The large DB is warned about; it is not deleted automatically.
- Expanded `perf:budget` to fail on initial chunk regressions, forbidden heavy
  markers in the initial chunk, missing webview/FPS guards, missing three-video
  BTC default, missing hidden webview suspension, or Gemini voice becoming a
  static terminal import again.

## Files Changed

- `src/utils/appSettings.ts`: persisted `performanceProfile` setting and
  normalization.
- `src/hooks/usePerformanceProfile.ts`: profile hook and polling/media policy
  helpers.
- `src/hooks/useMarketPolling.ts`: profile-aware polling cadence and hidden
  window scheduling.
- `src/components/electron/Sidebar.tsx`: avoid collapsed sidebar polling in
  light profiles.
- `src/components/electron/ElectronLayout.tsx`: lazy sidebar/workbench behavior.
- `src/components/electron/TerminalGrid.tsx`: terminal voice input is opt-in
  before loading the Gemini voice stack.
- `src/App.tsx`: lazy global status/palette modules.
- `src/features/settings/pages/SettingsPage.tsx`: performance profile control.
- `src/features/cockpit/pages/BtcAnalysisPage.tsx`: three-video trading default,
  Focus fallback, hidden webview suspension, cleanup, and telemetry.
- `src/features/diagnostics/pages/DiagnosticsPage.tsx`: data-footprint warning
  UI.
- `electron/main/native/diagnostics-manager.ts`,
  `electron/main/ipc/ipc-handlers.ts`, `electron/preload/index.ts`,
  `electron/types/ipc.types.ts`, `src/types/electron.d.ts`: diagnostics data
  footprint IPC.
- `scripts/perf-budget.mjs`: strict bundle/runtime/data-footprint guard checks.

## Verification

Commands run:

```bash
rtk npm run build
rtk npm run perf:budget
rtk npm run agent:check
rtk git diff --check
```

Result: passed.

Key budget output:

- Initial renderer chunk: `472.15 KB` (`<= 525.00 KB`).
- Initial chunk markers: `xterm`, `three`, `@google/genai`, `recharts`, and
  `vis-network` all absent.
- Runtime guards: webview telemetry, FPS telemetry, BTC three-video trading
  default, hidden webview suspension, and Gemini voice opt-in all passed.
- Data footprint report: data dir `723.81 MB`, `hyperliquid.db` `714.67 MB`.

Live smoke:

- `/btc` showed `3 videos · 3 mounted`, with TradingView plus all three YouTube
  streams visible and a `Focus` fallback button.
- Visible `/btc` process sample showed the expected cost of active video trading:
  Electron main `18.0%`, GPU `17.7%`, and YouTube/webview renderers around
  `17.4%`, `22.1%`, `7.5%`, and `7.5%` CPU.
- Navigating from `/btc` to `/station/hedge-fund` removed the extra webview
  renderers; post-navigation sample showed GPU `0.0%`, main `2.2%`, and only
  the normal renderer/utility helpers left.
- `/terminals` smoke confirmed the heavy voice bar is not shown/loaded by
  default when no terminal session is active.

## Findings

- Keeping all three videos visible will still cost CPU/GPU while actively
  trading; the optimization target is now correct cleanup and low background
  cost, not hiding required trading information.
- Route-specific heavy pages are lazy and unmount on navigation. The persistent
  surfaces are mainly the global backend status pill and sidebar; they now use
  the shared polling profile or avoid polling when collapsed.
- TradingView can inject ad frames inside its own webview. The app can clean up
  the guest on route/hidden, but cannot fully control third-party runtime cost
  while the chart is visible.

## Memory Updated

Intentionally unchanged: this was renderer/Electron ergonomics and harness
evidence, not durable strategy/company memory.

## Assumptions

- Daily use should keep the BTC trading view information-dense by default.
- `Focus` is a manual fallback for stress/poor frame rate, not the normal BTC
  trading default.
- Backend trading logic, paper execution, credentials, and strategy promotion
  gates stay untouched.

## Next Best Step

Add a small in-app Performance panel that reads local telemetry and shows active
webview count, recent FPS samples, polling cadence, and top Electron process
CPU/RSS so daily regressions are visible without using `ps`.
