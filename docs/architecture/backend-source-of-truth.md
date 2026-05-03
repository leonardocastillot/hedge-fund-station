# Backend Source Of Truth

Hedge Fund Station currently uses three backend contracts. New cleanup and UI
work should keep them explicit instead of treating every endpoint as one
gateway.

| Service | Default URL | Frontend owner | Responsibility |
| --- | --- | --- | --- |
| Alpha engine | `http://127.0.0.1:18500` | `src/services/alphaEngineApi.ts` | cockpit health/status, runtime, evaluations, Polymarket BTC 5m, wallet, macro calendar, weekly brief |
| Hyperliquid gateway | `http://127.0.0.1:18001` | `src/services/hyperliquidService.ts`, `src/services/liquidationsService.ts` | Hyperliquid market overview/detail, liquidations, paper signals, paper trades, gateway strategy inspection |
| Legacy trading API | `http://127.0.0.1:18000` | `src/services/legacyTradingApi.ts`, legacy portions of `strategyService.ts` | older strategy library/detail, portfolio deployments, historical compatibility |

## Rules

- Backend strategy logic, replay, validation, and paper evidence belong in
  `backend/hyperliquid_gateway/` or an external worker, not React.
- The GCP VM `hf-backend-01` is the canonical runtime for heavy compute,
  long-running backend services, agent runs, replay/backtest work, and
  persistent market datasets.
- React pages may filter, visualize, and control backend workflows, but backend
  outputs remain the source of truth for trade decisions.
- The current operational ledger is SQLite at `/data/hyperliquid.db` inside
  backend services. On the VM, `/data` maps to
  `/data/hedge-fund-station/hyperliquid_gateway/data`; local development may
  still use `backend/hyperliquid_gateway/data/` as a small artifact interface.
- Set `HYPERLIQUID_DATA_ROOT=/data` for backend workflows so backtests,
  validations, paper candidates, audits, agent runs, and checkpoints are
  written to the mounted runtime data tree.
- Keep SQLite with WAL for the current fast-iteration phase. Move to
  PostgreSQL/Timescale only when sustained paper/live ingestion, multiple writer
  workers, retention queries, or query latency become the actual bottleneck.
- Store only smoke artifacts or curated examples in Git. Heavy JSON reports,
  agent run directories, checkpoints, SQLite databases, temporary exports, and
  private datasets belong on the VM data volume or a future archival bucket.
- Do not change the `VITE_*` names or port defaults during cleanup-only work.
- When a legacy feature is migrated, update the backend endpoint, `src/services/`
  adapter, strategy readiness matrix, and runtime docs in the same change.

## Current Cleanup Boundary

The first cleanup pass hides non-core routes from the main cockpit navigation,
but does not remove internal routes or Electron IPC that are still consumed by
agent workflows. Marketing/LinkedIn/Gemini UI is not part of the core hedge fund
cockpit; the IPC remains until agent dependencies are reviewed.
