# Implementation Report: confirm_hyperliquid_gateway_port_story

## Objective

Confirm and document the canonical backend port story without changing runtime
behavior.

## Changes Made

- Added `docs/operations/backend-startup-runbook.md` with the daily service
  startup contract.
- Updated `README.md`, `docs/operations/backend-connectivity-runbook.md`, and
  `docs/operations/gcp-backtest-api.md` to keep the same three-service story:
  alpha engine on `18500`, Hyperliquid gateway on `18001`, legacy API on
  `18000`, and Docker host `18001` to container `18400`.
- Kept compatibility aliases documented in existing frontend config; no
  `VITE_*` behavior changed.

## Verification

- `npm run agent:check` passed before the implementation pass.
- `npm run gateway:probe` passed during planning against the local gateway.
- Full final verification is recorded in
  `progress/impl_aggressive_cleanup_queue_closeout.md`.

## Risks And Next Action

- Operator setup still depends on the VM tunnel and local gateway being started
  intentionally.
- Next recurring improvement: add a recurring health-check report format for
  `hf:doctor`, `hf:status`, and backend `/health`.
