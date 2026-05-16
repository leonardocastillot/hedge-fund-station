# Dev Stability And Strategy Harness Hardening

## Objective

Keep the daily development app stable while strategy agents work from Strategy
Pods without stale active-session metadata.

## Scope

- Electron/Vite dev command surface.
- Strategy Inspector renderer state.
- Route dynamic-import recovery behavior.
- File harness validation for `progress/current.md`.

## Changes Made

- Changed `npm run dev` to `electron-vite dev` so renderer HMR remains the
  default and native Electron file watching does not auto-restart the shell.
- Added `npm run dev:watch-native` for intentional main/preload watch and
  restart behavior.
- Updated the dev runbook to make stable dev vs native watch explicit.
- Persisted Strategy Inspector state per workspace in `localStorage`: mode,
  linked strategy selection, artifact selection, interval, Pine interval, and
  Strategy Factory focus.
- Disabled automatic renderer reload on lazy-route dynamic import errors during
  development; production keeps the one-shot recovery reload.
- Tightened `agent:check` so an active task in `progress/current.md` must have a
  matching active task in `agent_tasks.json`.
- Added unit tests for the new current-session harness guard.

## Files Changed

- `package.json` - stable `dev` default plus explicit `dev:watch-native`.
- `docs/operations/how-to-develop-this-app.md` - documented the stable dev loop.
- `src/features/desks/components/StrategyInspectorPanel.tsx` - persisted pod
  inspector state across renderer reloads.
- `src/features/cockpit/WidgetPanel.tsx` - no surprise dev reload on dynamic
  import errors.
- `scripts/agent_harness.py` - current-session active task validation.
- `tests/test_agent_harness.py` - regression coverage for stale active current
  task detection.

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk python3 -m unittest tests.test_agent_harness tests.test_strategy_claims
rtk npm run build
rtk git diff --check
```

Result:

- passed

## Findings

- `electron-vite dev --watch` was too aggressive for your current workflow
  because native file changes can rebuild/restart the Electron shell. The daily
  command now leaves that restart explicit.
- Strategy Mission Locks already block overlapping active claims for the same
  asset; this pass adds a separate guard for stale `progress/current.md` state.
- Renderer reloads can still happen if Vite itself requires a full reload, but
  terminals, desk state, commander runs, and now Strategy Inspector state are
  persisted or reattachable.

## Memory Updated

Promoted: the stable dev-loop rule now lives in
`docs/operations/how-to-develop-this-app.md`.

## Assumptions

- Default development should favor keeping the running app usable over auto
  rebuilding native Electron files.
- Strategy Pods remain asset folders in the same repo, while official strategy
  specs and backend modules stay in their canonical locations.

## Next Best Step

Add a Strategy Inspector action that creates an idea note at
`docs/assets/<ASSET>/ideas/<idea-slug>.md`.
