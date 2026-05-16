# Repair Runtime After Folder Move

## Objective

Recover the local app/runtime after moving the canonical checkout from
`/Users/optimus/Documents/New project 9` to
`/Users/optimus/Documents/hedge_fund_stations`, and harden dev checks so stale
folder processes are visible.

## Findings

- Ports were not all down: `18500`, `18001`, and `localhost:5173` were active.
- The broken endpoint was caused by the gateway on `18001` being launched from
  the old runner path:
  `/Users/optimus/Documents/New project 9/.tmp/run-hyperliquid-gateway.sh`.
- `paper/signals` returned HTTP 500 before restart because the old runtime used
  a stale SQLite shape without `paper_signals`.
- Vite answered on `localhost:5173`, while Electron dev status only checked
  `127.0.0.1:5173`.
- The active desk config now points to
  `/Users/optimus/Documents/hedge_fund_stations/hedge-station`.

## Changes Made

- Added `npm run dev:doctor` via `scripts/dev-doctor.mjs`.
- Made Electron dev status check Vite through `localhost:5173` with
  `127.0.0.1:5173` fallback.
- Added stale gateway detection for old `New project 9` runners and backend cwd
  drift.
- Made Electron skip backend bootstrap when gateway `18001` is already healthy
  and not stale.
- Hardened workspace normalization so missing stale vault paths migrate to
  `<workspace.path>/hedge-station` when that vault exists.
- Restarted the Hyperliquid gateway from the canonical repo and restarted the
  Electron dev session.

## Runtime State

- Canonical repo: `/Users/optimus/Documents/hedge_fund_stations`.
- Vite renderer: `http://localhost:5173`.
- Hyperliquid gateway: `http://127.0.0.1:18001`.
- Alpha backend tunnel: `http://127.0.0.1:18500`.
- Active desk: `new-project-9` at `/Users/optimus/Documents/hedge_fund_stations`.
- No active runtime process is launched from `New project 9`.

## Verification

Commands run:

```bash
rtk npm run dev:doctor
rtk npm run gateway:probe
rtk npm run backend:probe
RTK_DISABLED=1 curl -i 'http://localhost:5173/'
RTK_DISABLED=1 ps auxww | grep -E 'New project 9|hyperliquid-gateway|uvicorn' | grep -v grep || true
rtk npx tsc --noEmit
rtk npm run build
rtk npm run agent:check
rtk git diff --check
rtk npm run terminal:doctor
```

Result:

- passed

## Risks And Follow-Up

- The old folder still exists, intentionally. It is no longer used by the active
  gateway/app runtime.
- Manual smoke still recommended inside the app: open `/workbench`, confirm the
  hedge fund desk is active, and open the desk vault.

## Memory Updated

- unchanged. This is local runtime repair plus repo hardening, not a durable
  trading or architecture decision beyond the files changed here.
