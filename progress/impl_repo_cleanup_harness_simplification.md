# Implementation - Repo Cleanup Harness Simplification

## Summary

Simplified the agent harness queue and removed artifact-heavy clutter from the
tracked repo surface without changing backend APIs, IPC, strategy logic, or UI
routes.

## Changed Files

- `agent_tasks.json`: reduced 29 tasks to 7 focused tasks: one cleanup task, 5
  future pending tasks, and the blocked production gate.
- `progress/current.md`: reset live session state for this cleanup.
- `.gitignore` and `.graphifyignore`: ignore media, local editor/vault state,
  runtime data, generated evidence, and old progress reports.
- `docs/operations/media-artifact-archive.md`: documents local/external media
  archive policy.
- `backend/hyperliquid_gateway/data/README.md`: tightens curated evidence rules.
- `package.json`: removed unused direct dependencies.

## Artifact Cleanup

Removed from source control while preserving local ignored files where useful:

- `videos/` and `renders/`
- `.obsidian/`, `hedge-station/.obsidian/`, and `.claude/settings.local.json`
- timestamped/generated backend evidence and macro cache files

Deleted zero-value tracked clutter:

- `production`
- `bugzil.la/1090768.md`
- `LOGO_LC.png`
- `src/assets/LOGO_LC.png`

Kept curated evidence:

- `backend/hyperliquid_gateway/data/README.md`
- `backend/hyperliquid_gateway/data/backtests/*-smoke.json`
- `backend/hyperliquid_gateway/data/paper/*-smoke.json`
- `backend/hyperliquid_gateway/data/validations/*-smoke.json`
- `backend/hyperliquid_gateway/data/market_data/one_bitcoin_btc_usd_daily.json`

## Verification

Passed:

- `npm run agent:check`
- `npm run agent:status`
- `npm run build`
- `npm run perf:budget`
- `python3 -m unittest discover tests`
- `npm run hf:doctor`
- `npm run hf:backtest -- --strategy one_bitcoin`

- `npm run graph:build`
- `npm run graph:check`
- `npm run graph:query -- "what are the core repo surfaces after cleanup?"`.
- final `npm run agent:check`
- final `npm run agent:status`
- `git diff --check`

## Risks And Notes

- `npm uninstall` reported 13 npm audit findings after pruning packages; this
  cleanup did not run `npm audit fix` because that can change dependency
  versions and behavior.
- `graph:build` now passes `--force` so refactors that delete files can prune
  stale graph nodes. The fresh graph reports 339 corpus files, 4144 nodes, 6632
  edges, and 241 communities.
- Local runtime data remains large (`backend/hyperliquid_gateway/data/` is about
  3 GB, mostly ignored SQLite data). This is local storage, not tracked source.
- Existing `hedge-station/.obsidian/workspace.json` local state was preserved and
  moved out of source control.

## Memory

Shared memory intentionally unchanged. The durable policy now lives in
`.gitignore`, `.graphifyignore`, `agent_tasks.json`, and
`docs/operations/media-artifact-archive.md`.

## Next Action

Pick `confirm_hyperliquid_gateway_port_story` from the simplified queue.
