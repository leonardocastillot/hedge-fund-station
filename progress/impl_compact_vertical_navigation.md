# Compact Vertical Navigation Handoff

## Objective

Make the daily app shell more space-efficient by replacing the crowded
horizontal route tabs with a compact left navigation rail, without removing any
trading surfaces or `/btc` media.

## Scope

- Inspected `App.tsx`, `ElectronLayout`, `WidgetPanel`, agent harness docs, and
  current progress state.
- Changed renderer shell/navigation only.
- Backend strategy logic, paper runtime, credentials, IPC trading contracts, and
  order routing were not touched.

## Changes Made

- Added a fixed 52px left app rail with icon-only route buttons, tooltips,
  active state, route grouping, and smoke-test route attributes.
- Moved `BrowserRouter` up into the app shell so the rail and center routes
  share the same router.
- Kept the existing workspace sidebar as a separate collapsible panel next to
  the route rail.
- Removed the horizontal tabs from `WidgetPanel` and preserved route lifecycle
  telemetry through a dedicated lightweight component.
- Compressed the top `Hedge Fund Station` header into a 34px status strip while
  keeping lazy `BackendStatus` and command shortcuts.

## Files Changed

- `src/components/electron/AppNavRail.tsx` adds the compact route rail.
- `src/features/cockpit/navigation.ts` owns lightweight route metadata and
  active-route matching.
- `src/components/electron/ElectronLayout.tsx` accepts and renders a fixed
  `navigationRail` before the workspace panels.
- `src/features/cockpit/WidgetPanel.tsx` is now content/routes only, with no
  horizontal nav.
- `src/App.tsx` owns the router and compact status strip.

## Verification

Commands run:

```bash
rtk npm run build
rtk npm run perf:budget
rtk npm run agent:check
rtk git diff --check
```

Result:

- passed
- build passed with initial renderer asset `index-Bywi7bly.js` at `484.59 KB`
  in the Vite report.
- `perf:budget` passed with initial renderer `473.25 KB <= 525.00 KB` and no
  forbidden initial markers for `xterm`, `three`, `@google/genai`, `recharts`,
  or `vis-network`.
- Browser smoke at `http://localhost:5173` passed:
  - default route redirects to `/station/hedge-fund`
  - left rail exposes 18 route buttons plus the brand link
  - no horizontal route tab labels remain in the content nav
  - default route has `0` webviews
  - `/btc` has `4` webviews and the `3 videos` control, preserving TradingView
    plus three streams
  - workspace sidebar collapse and expand both work
  - route click smoke to `/settings` works with no module error

## Findings

- `npm run dev -- --host 127.0.0.1` is not accepted by the current
  `electron-vite dev` CLI; the normal project dev server surface remains
  `http://localhost:5173` when available.
- The route rail does not load route page modules directly; heavy chunks remain
  lazy.

## Memory Updated

intentionally unchanged: this is a UI shell implementation with a handoff
report; it did not create durable strategy, risk, production, or architecture
policy that belongs in curated memory.

## Assumptions

- The route rail should stay icon-only by default to protect workspace width.
- `/btc` must continue to show TradingView plus all three videos by default.
- The workspace sidebar and right voice rail should remain separate shell
  surfaces.

## Next Best Step

Add a route quick-switch/favorites layer only if the route count keeps growing
past what fits comfortably in the 52px rail.
