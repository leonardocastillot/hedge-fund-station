# Strategy Lab Workbench Handoff

## Objective

Convert `/workbench` into the main AI-first strategy crafting lab while keeping
the left workspace context and right dock as support tooling.

## Scope

- Backend Hyperliquid gateway strategy/artifact read surface.
- Renderer `/workbench` center page.
- Strategy factory, Pine indicator lab reuse, and right dock labels.
- Browser smoke for no-selection and selected-strategy chart states.

## Changes Made

- Added `GET /api/hyperliquid/strategies/{strategy_id}/lab` with catalog row,
  artifact refs, summary, trades, equity curve, chart candles, entry/exit
  markers, learning events, agent runs, and next gated action.
- Added backend chart loading for BTC daily JSON and OHLCV CSV artifacts, with
  explicit chart-unavailable payloads instead of 500s.
- Rebuilt `/workbench` as `Strategy Lab` with fixed modes:
  `Improve Strategy`, `Create Strategy`, and `Indicator Lab`.
- Added a local lightweight-charts strategy chart with trade markers and
  backend-driven metrics/timeline/equity panels.
- Added typed `hyperliquidService.getStrategyLab(strategyId, options)` and
  cache invalidation after backtest, validation, and paper candidate mutations.
- Kept dock mode IDs `code`, `browser`, and `runs`, but relabeled them as
  `Agent CLI`, `TradingView/Web`, and `Runs/Evidence`.
- Made Strategy Factory launch open the Code dock only after approval/launch.
- Fixed `strategy_memory.py` import compatibility so the gateway can start when
  uvicorn imports modules from `backend/hyperliquid_gateway` directly.

## Files Changed

- `backend/hyperliquid_gateway/app.py`: Strategy Lab payload builders and lab
  endpoint.
- `backend/hyperliquid_gateway/strategy_memory.py`: package/script import
  compatibility for gateway restart.
- `tests/test_strategy_catalog.py`: lab endpoint tests for BTC daily JSON, OHLCV
  CSV, and unsupported dataset fallback.
- `src/services/hyperliquidService.ts`: Strategy Lab response types and
  `getStrategyLab`.
- `src/features/desks/pages/DeskSpacePage.tsx`: new Strategy Lab workbench.
- `src/features/desks/components/WorkspaceDock.tsx`: support-tool copy while
  preserving mode IDs.
- `src/features/strategies/components/StrategyFactoryModal.tsx`: opens Code dock
  after approved launch.
- `src/features/cockpit/navigation.ts`,
  `src/components/electron/AppNavRail.tsx`, and
  `src/components/electron/ElectronLayout.tsx`: Lab navigation and dock copy.
- Smoke screenshots:
  `progress/strategy_lab_workbench_dev_smoke.png`,
  `progress/strategy_lab_workbench_dev_selected_smoke.png`,
  `progress/strategy_lab_workbench_chart_smoke.png`.

## Verification

Commands run:

```bash
rtk python3 -m unittest tests.test_strategy_catalog
rtk python3 -m unittest tests.test_strategy_catalog tests.test_strategy_memory_index
rtk curl -sS -o /tmp/strategy-lab-api.json -w 'http=%{http_code} bytes=%{size_download}\n' 'http://127.0.0.1:18001/api/hyperliquid/strategies/btc_convex_cycle_trend/lab?artifact_id=latest&interval=1d'
rtk npm run gateway:restart
rtk npx tsc --noEmit
rtk npm run build
rtk npm run dev:doctor
rtk git diff --check
```

Result:

- Passed. The lab API returned HTTP 200 for `btc_convex_cycle_trend` with 4,257
  candles and 96 entry/exit markers.
- Browser smoke passed on `http://localhost:5173/workbench`: no selected
  strategy state rendered, selected strategy rendered metrics/timeline/agent
  draft, and chart loaded with canvas output and no module/404 errors.
- First gateway restart failed because `strategy_memory.py` used package-only
  relative imports under script import mode; fixed and reran successfully.

## Findings

- The live Vite session had an invalid optimized dependency cache and was
  serving `lightweight-charts` incorrectly. Restarted the dev session through
  `open-hedge-fund-station-dev.command`; `dev:doctor` and browser smoke then
  passed.
- Indicator Lab is reused as a local Pine preview surface and does not inject
  TradingView code or place orders.
- No live trading, credential changes, or production promotion behavior was
  added.

## Memory Updated

Intentionally unchanged: this work produced implementation artifacts and a
handoff, but no new durable company rule beyond existing backend-first and
gated-promotion policy.

## Assumptions

- Local lightweight chart is the canonical entry/exit visual; TradingView/Web
  remains a companion dock.
- Hybrid discretionary plus bot-validation trader remains the first optimized
  user.

## Next Best Step

Add a small renderer test harness for Strategy Lab mode transitions and select a
non-BTC CSV-backed strategy fixture in browser smoke so chart coverage is not
BTC-only.
