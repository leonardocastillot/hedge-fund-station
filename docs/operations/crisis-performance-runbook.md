# Crisis Performance Runbook

## Goal

The desktop app must stay responsive during market stress, backend restarts, and
partial service outages. The renderer is a cockpit: it displays backend evidence
and operator controls, but it must not become the trading engine or run heavy
market loops.

## Expected Degradation

- If the Alpha VM is offline, the app should keep rendering and show the VM as
  down instead of blanking the cockpit.
- If the local Hyperliquid gateway is offline, Hyperliquid, paper, liquidation,
  and data pages should preserve the latest successful payload as stale data
  when available.
- If an optional legacy service is offline, the status pill should mark it off
  without treating the whole station as failed.
- If one route throws a renderer error, the route-level boundary should isolate
  that page so the surrounding shell remains usable.

## Frontend Performance Contract

- Route modules are lazy-loaded. Opening the app should not eagerly load charts,
  paper lab, data explorer, agents, settings, and strategy drilldowns.
- Market/runtime polling should go through the shared polling coordinator:
  `useMarketPolling(key, fetcher, { intervalMs, staleAfterMs })`.
- Polling behavior:
  - one in-flight request per key
  - polling slows while the window is hidden
  - repeated failures back off exponentially
  - successful data is kept visible during later failures
  - stale state is explicit and inspectable
- Large data views should cap rendered rows by default and make higher caps an
  operator choice.

## Diagnostics

Use the in-app `Diagnostics` route to inspect recent frontend telemetry:

- route lifecycle events
- API request latency
- stale-data events
- render errors caught by route or app boundaries

Telemetry is local to the renderer session and is not sent externally.

## Verification Commands

Run these after performance or reliability changes:

```bash
npm run build
npm run hf:doctor
npm run gateway:probe
npm run backend:probe
```

`gateway:probe` and `backend:probe` may fail when the corresponding service is
intentionally offline. In that case, record the failure as an outage simulation
and verify the UI keeps stale or offline states visible.

## Crisis Smoke Test

1. Start normal local mode with the backend tunnel and app.
2. Open Cockpit, Hyperliquid, Liquidations, Paper, Data, Workbench, and
   Diagnostics.
3. Stop the local Hyperliquid gateway.
4. Confirm the app remains responsive and shows stale/offline states.
5. Restart the gateway.
6. Confirm polling recovers without manually reloading the renderer.
7. Repeat with the Alpha VM tunnel offline if safe for the current session.

## Operator Rule

During market stress, preserve review speed and truthfulness over visual polish:
show stale data clearly, keep controls responsive, and never hide backend
contract failures behind optimistic UI state.
