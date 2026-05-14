# How To Develop This App

Hedge Fund Station has one canonical desktop app. It is an Electron app that
loads the React renderer from `src/` and talks to backend services through the
typed adapters in `src/services/`.

## Daily Development

Use the launcher on macOS:

```bash
./open-hedge-fund-station-dev.command
```

Or run the same development stack directly:

```bash
npm run dev
```

This starts Electron in development mode. You do not need to create a Mac build
while editing UI, services, docs, or backend integration code.

## Stable Dev Loop

Use the in-app Diagnostics page while developing. In development builds it shows:

- `Renderer`: Vite/HMR status for `src/` changes.
- `Native restart`: whether files under `electron/main/`, `electron/preload/`,
  `electron/types/`, or `electron.vite.config.ts` changed after the current
  Electron shell started.
- `Vite`, `Gateway`, and `Backend`: quick local health checks for the renderer
  dev server, Hyperliquid gateway, and backend tunnel.

Daily edit rules:

- Changes under `src/` should hot reload through Vite. Use `Reload renderer`
  only when React state or a module cache gets awkward.
- Changes under `electron/main/` require `Restart Electron shell`.
- Changes under `electron/preload/` or `electron/types/` require
  `Restart Electron shell`, then a renderer reload if the UI still has an old
  bridge shape.
- Changes under `backend/hyperliquid_gateway/` should restart the gateway or
  backend process, not the whole desktop app, unless the renderer/preload IPC
  contract also changed.

The terminal bridge is designed to reattach to surviving PTY sessions after
renderer reloads. A full Electron shell restart is still a native-process
boundary and should be treated as intentional.

## What To Edit

- `src/features/` for product surfaces such as Cockpit, BTC, Hyperliquid,
  Strategies, Paper, Liquidations, Agents, and Settings.
- `src/services/` for API clients and backend adapters.
- `src/components/ui/` for shared UI primitives.
- `src/components/electron/` for shared desktop shell UI.
- `electron/main/` for lifecycle, IPC handlers, and native managers.
- `electron/preload/` and `electron/types/` for the safe renderer contract.
- `backend/hyperliquid_gateway/` for strategy logic, market data, validation,
  replay, paper execution, persistence, and HTTP APIs.
- `docs/` for architecture, operations, strategy specs, and runbooks.

React and Electron may inspect and control workflows, but trading logic,
validation, replay, paper evidence, and audit trails belong in the backend.

## Product Vocabulary

- **Trading Stations** are fixed renderer product surfaces. `Hedge Fund Station`
  is the Research OS home and `Live Trading` is a safe monitor/review station.
  They are always visible and are not user-created workspaces.
- **Desks** are the Electron filesystem workspaces: local folders with saved
  commands, launch profiles, terminals, agents, browser tabs, and optional
  Obsidian vaults. Desks may be added, edited, or removed without changing the
  fixed stations. `/workbench` is the active desk space and should keep desk
  stats, agents, terminal evidence, browser tabs, and commands scoped to the
  selected desk.
- Desk kinds are part of the local `Workspace` contract:
  `hedge-fund`, `command-hub`, `project`, and `ops`. The required `Command Hub`
  desk uses the user's home/Documents area as a neutral cwd for shells, AI
  runtimes, tunnels, and quick commands; it must not inherit hedge fund command
  defaults.
- The `Workspace` IPC/type remains the desk model only. Do not put trading
  lifecycle state, strategy truth, or live execution authority into it.

## Generated Output

These folders are generated output, not parallel development trees:

- `dist/`
- `dist-electron/`
- `release/`
- `node_modules/`
- caches such as `__pycache__/`, `.vite/`, and `tsconfig.node.tsbuildinfo`

Do not edit generated output by hand. If something is wrong in a built app,
fix the source under `src/`, `electron/`, `backend/`, or `docs/`, then rebuild.

## Mac Builds

Use Mac packaging only when you want to test distribution:

```bash
npm run dist:mac
```

The distributable `.app`, `.dmg`, and `.zip` outputs land under `release/`.
Unsigned local builds can be useful for testing, but public distribution needs
Developer ID signing and notarization. See
`docs/operations/mac-distribution-runbook.md`.

## Canonical Routes

The visible product navigation should remain:

- `/` redirects to `/station/hedge-fund`
- `/station/hedge-fund` fixed Hedge Fund Station Research OS home
- `/station/live` fixed Live Trading monitor, with no real order placement
- `/cockpit` Cockpit module
- `/btc` BTC research station with TradingView and the three YouTube streams
- `/hyperliquid`
- `/strategies`
- `/paper`
- `/liquidations`
- `/portfolio`
- `/data`
- `/workbench` active desk space: browser, stats, agents, terminal evidence,
  and saved commands for the selected desk
- `/settings`

Internal routes such as `/calendar` and `/polymarket` may remain when they are
linked from the cockpit and backed by the alpha engine. Legacy routes without a
visible product role should be removed instead of kept as hidden experiments.

## Verification

Run these after structure or route cleanup:

```bash
npx tsc --noEmit
npm run build
npm run hf:status
```
