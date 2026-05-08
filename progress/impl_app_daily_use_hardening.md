# App Daily Use Hardening Handoff

## Objective

Leave Hedge Fund Station ready for daily operator use by making startup/readiness
status explicit, fixing visible daily-use bugs, and verifying the main Electron
routes without enabling live trading.

## Scope

- Harness: `agent_tasks.json`, `progress/current.md`, `progress/history.md`.
- Backend API: `backend/hyperliquid_gateway/app.py`.
- Renderer services and shell: `src/services/hyperliquidService.ts`,
  `src/components/electron/BackendStatus.tsx`.
- Daily-use surfaces: `src/features/diagnostics/pages/DiagnosticsPage.tsx`,
  `src/features/stations/pages/HedgeFundStationPage.tsx`,
  `src/features/strategies/pages/StrategyAuditPage.tsx`.

## Changes Made

- Registered `app_daily_use_hardening` as the active release-sprint task and
  moved it to review after verification.
- Added read-only `GET /api/hyperliquid/app-readiness`.
- The readiness payload summarizes gateway/cache health, paper runtime,
  strategy blockers, latest evidence, daily commands, review coverage, strategy
  memory, and the live execution lock. It does not decide trades.
- Added TypeScript readiness types and `hyperliquidService.getAppReadiness`.
- Added header readiness polling so the app shows daily readiness beside Alpha
  VM, gateway, and legacy status.
- Turned Diagnostics into a daily pre-flight checklist with backend readiness,
  local terminal/workbench/Obsidian checks, refresh controls, and clear
  ready/attention/blocked states.
- Added Daily Pre-Flight and Daily Commands to Hedge Fund Station so startup
  opens with actionable operator status and terminal-launchable commands.
- Fixed visible strategy count bugs by excluding `runtime:*` rows from real
  strategy counts in Hedge Fund Station and Strategy Audit Focus while still
  exposing runtime setups as operational detail.
- Kept Live Trading monitor-only. No credentials, production promotion,
  execution routing, or strategy decision logic changed.

## Files Changed

- `backend/hyperliquid_gateway/app.py`: app readiness endpoint and helpers.
- `src/services/hyperliquidService.ts`: readiness DTOs and client method.
- `src/components/electron/BackendStatus.tsx`: readiness-aware status pill.
- `src/features/diagnostics/pages/DiagnosticsPage.tsx`: daily pre-flight UI.
- `src/features/stations/pages/HedgeFundStationPage.tsx`: startup pre-flight,
  daily commands, and real-strategy filtering.
- `src/features/strategies/pages/StrategyAuditPage.tsx`: real-strategy filtering
  so runtime setup rows no longer inflate audit counts.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md`: harness
  registration and closeout.

## Verification

Commands run:

```bash
npm run agent:check
npm run build
python3 -m unittest discover tests
npm run perf:budget
npm run terminal:doctor
npm run hf:doctor
npm run hf:status
npm run gateway:probe
npm run backend:probe
curl -fsS http://127.0.0.1:18001/api/hyperliquid/app-readiness
```

Result:

- Passed: harness check, production build, 84 Python tests, perf budget,
  terminal PTY doctor, HF doctor/status, gateway probe, backend probe, and
  readiness HTTP smoke.
- Readiness smoke returned `overallStatus: attention`, `strategyCount: 13`,
  `blockedStrategies: 13`, `paperRuntimeStatus: healthy`, `cacheFresh: true`,
  and `liveExecutionLocked: true`.
- Browser smoke loaded the main routes from the sprint list and strategy detail
  without console errors.
- Electron smoke verified Hedge Fund Station, Strategy Audit Focus, Terminals,
  Workbench, Paper Lab, and Open Vault. Terminal UI created a visible shell and
  successfully ran `pwd; command -v npm; npm run hf:doctor`.
- Open Vault launched the curated `hedge-station` Obsidian vault at
  `Workspace Home`.

## Findings

- The main daily-use bug found during smoke was inflated strategy counts caused
  by `runtime:*` rows. Backend readiness, Hedge Fund Station, and Strategy Audit
  Focus now report 13 real strategies while keeping runtime setup counts visible
  as operational evidence.
- The app is intentionally in `attention`, not `blocked`: validation blockers
  and paper review coverage are real workflow items that should stay visible
  before any future promotion.
- Header still reports the legacy service on `127.0.0.1:18000` as offline; the
  readiness checklist depends on Alpha VM `18500` and gateway `18001`, both of
  which passed smoke.
- Vite static preview deep-linking directly to nested routes can miss relative
  built assets; Electron and SPA navigation from `/` work. This was left
  unchanged because the Electron file-style build uses relative assets.
- No synthetic `/memory` lesson was created during final smoke to avoid adding
  fake strategy learning data. The route was included in browser smoke and the
  existing memory feature remains in review.

## Memory Updated

Intentionally unchanged: this sprint hardened platform readiness and did not
create a durable strategy lesson or new company-wide operating rule beyond the
harness handoff.

## Assumptions

- Daily-use readiness means research, review, paper monitoring, memory,
  workbench, terminal, diagnostics, and stable command flows are usable.
- Live or production trading remains blocked behind research, backtest,
  validation, paper evidence, risk review, operator sign-off, monitoring,
  rollback, and a runbook.

## Next Best Step

Close paper review coverage first, then work down the visible validation
blockers in Strategy Audit Focus.
