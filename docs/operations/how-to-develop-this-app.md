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

- `/` Cockpit
- `/btc` BTC research station with TradingView and the three YouTube streams
- `/hyperliquid`
- `/strategies`
- `/paper`
- `/liquidations`
- `/portfolio`
- `/data`
- `/workbench`
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
