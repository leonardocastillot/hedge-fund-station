# Backend Data Artifacts

This folder stores generated evidence from the backend research workflow.

It is a local artifact interface, not the long-term storage tier. Heavy
runtime evidence belongs on the GCP VM under:

```text
/data/hedge-fund-station/hyperliquid_gateway/data
```

Backend services should mount that path as `/data` and set
`HYPERLIQUID_DATA_ROOT=/data`.

Expected subfolders:

- `audits/` for doctor checks and source audits
- `backtests/` for deterministic backtest reports
- `validations/` for validation gate reports
- `paper/` for paper-candidate artifacts
- `agent_runs/` for generated agent evidence and checkpoints

These files are artifacts, not source logic. Curated small examples may be kept
for review and regression context, but large runtime outputs, private datasets,
SQLite databases, temporary payloads, and cache files should stay out of git.

Cleanup policy:

- keep `*-smoke.json` examples when they are useful for regression review
- keep `market_data/one_bitcoin_btc_usd_daily.json` as the curated small dataset
  required by the One Bitcoin default backtest
- keep non-smoke artifacts out of git by default; handoffs may link to local,
  VM, or external archive paths when historical evidence matters
- do not commit `agent_runs/`, checkpoints, `tmp-*.json`, SQLite files, WAL/SHM
  files, macro calendar cache files, timestamped reports, local exports, or
  cache files
- run `npm run hf:status` to inspect what curated evidence remains

Source code belongs outside this folder. Strategy logic belongs under
`backend/hyperliquid_gateway/strategies/`.
