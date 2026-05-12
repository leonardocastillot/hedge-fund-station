# BTC Flexible Workbench Handoff

## Objective

Make `/btc` useful when many BTC surfaces are open by adding a configurable
drag/resize workbench, clean muted video embeds, and a collapsible Pine AI Lab.

## Scope

- `src/features/cockpit/pages/BtcAnalysisPage.tsx`
- `package.json`
- `package-lock.json`
- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`

## Changes Made

- Replaced the fixed BTC grid with a responsive `react-grid-layout` workbench.
- Added edit/lock mode, reset, persisted layout state, video visibility toggles,
  and a Pine Lab opener.
- Persisted BTC layout state in `localStorage` at
  `hedge-station:btc-analysis-layout:v1`.
- Switched YouTube panels from watch pages to muted embed URLs with minimal
  chrome and webview-level `setAudioMuted(true)` reinforcement.
- Moved Pine AI Lab into a drawer by default, with controls to pin it as a
  movable board panel, unpin it, or close it.
- Kept backend Pine generation, strategy logic, paper runtime, credentials, and
  order-routing behavior unchanged.

## Files Changed

- `src/features/cockpit/pages/BtcAnalysisPage.tsx` - new BTC workbench UI,
  muted video webview handling, Pine drawer/pinned panel behavior, and layout
  persistence.
- `package.json` and `package-lock.json` - added `react-grid-layout` and its
  TypeScript types.
- `agent_tasks.json`, `progress/current.md`, and `progress/history.md` - harness
  task tracking and handoff state.

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk npm run build
rtk npx tsc --noEmit
rtk git diff --check
rtk curl -fsS http://localhost:5173/btc | head -40
npm run dev
```

Result:

- passed: `rtk npm run agent:check`
- passed: `rtk npm run build`
- passed: `rtk git diff --check`
- passed: `rtk curl -fsS http://localhost:5173/btc | head -40` returned the
  Vite renderer shell for `/btc`.
- partial: `rtk npx tsc --noEmit` has existing repo errors outside this task;
  after fixes, it reports no `BtcAnalysisPage.tsx` errors.
- partial: visual smoke was not fully automated. The Browser tool was not
  exposed, Computer Use could not find a live Hedge Fund Station app window,
  and Playwright is not installed. `npm run dev` was run without RTK because it
  is a long-running/interactive dev command exception; it started electron-vite
  but did not leave a discoverable app process.

## Findings

- `react-grid-layout` v2 no longer exposes the old `WidthProvider` API; the
  implementation uses `Responsive`, `useContainerWidth`, and `noCompactor`.
- `npm install` reports 13 existing audit findings. They were not changed
  because dependency audit remediation is out of scope for this UI task.
- Full TypeScript still has existing errors in memory, Obsidian, mission
  actions, Polymarket, and strategy detail files.

## Memory Updated

intentionally unchanged: this was a focused UI ergonomics change and did not
create a durable architecture or strategy-memory rule.

## Assumptions

- Strong no-sound behavior is enforced inside Electron webviews; external Brave
  playback remains outside Electron control.
- Pine AI Lab remains research-only and does not inject indicators into
  TradingView or operate orders.

## Next Best Step

Open `/btc` in the Electron app and manually verify drag/resize persistence,
video mute, reset, Pine drawer, Pine pin/unpin, and narrow viewport behavior.
