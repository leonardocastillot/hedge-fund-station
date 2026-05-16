# Agent View Pro Strategy Pods Handoff

- Date: 2026-05-15
- Agent: Codex
- Status: implemented
- Mission class: UI review-speed audit / strategy operations surface

## Summary

Reworked `/workbench` into an Agent View Pro strategy station. The center is
now the agentic session/console surface by default, the left rail shows only
Strategy Pods, and the right dock remains the Strategy Inspector for chart,
metrics, evidence, gates, Strategy Factory, and Indicator Lab.

New strategies now use a backend scaffold preview/approve flow before writing
repo-native files under `backend/hyperliquid_gateway/strategies/<id>/` and
`docs/strategies/<id>.md`.

## Changed Files

- `backend/hyperliquid_gateway/strategy_scaffold.py`
- `backend/hyperliquid_gateway/app.py`
- `backend/hyperliquid_gateway/cli.py`
- `tests/test_strategy_catalog.py`
- `src/services/hyperliquidService.ts`
- `src/types/electron.d.ts`
- `electron/types/ipc.types.ts`
- `electron/main/native/workspace-manager.ts`
- `src/contexts/WorkspaceContext.tsx`
- `src/components/electron/Sidebar.tsx`
- `src/components/electron/WorkspaceModal.tsx`
- `src/components/electron/AppNavRail.tsx`
- `src/features/desks/pages/DeskSpacePage.tsx`
- `src/features/desks/components/StrategyInspectorPanel.tsx`
- `src/features/agents/components/WorkspaceAgentView.tsx`

## Implementation Notes

- Added scaffold preview and approve endpoints:
  - `POST /api/hyperliquid/strategies/scaffold/preview`
  - `POST /api/hyperliquid/strategies/scaffold`
- Reused the `hf:strategy:new` scaffold logic through a shared helper with
  no-overwrite behavior.
- Extended Strategy Pod metadata with `strategy_backend_dir` and
  `strategy_docs_path`.
- Made `/workbench` render `WorkspaceAgentView` directly as Agent View Pro.
- Added persistent per-pod runtime provider choice for Codex/OpenCode/Claude/Gemini.
- Sidebar now filters to `strategy-pod` only and exposes `Agent View`,
  `Inspector`, `Agent CLI`, `Open Strategy Shell`, `Edit`, `Duplicate`, and
  `Delete Pod`.
- `New Strategy` in the pod creator now previews normalized ID, docs slug,
  target paths, file conflicts, and only writes files after approval.
- Added dev/native fallback seeding for the existing
  `btc_convex_cycle_trend` pod so `/workbench` opens usable in browser preview
  and Electron configs that had no pods yet.

## Verification

- `rtk python3 -m unittest tests.test_strategy_catalog.StrategyCatalogTest.test_strategy_scaffold_preview_normalizes_without_writing_files tests.test_strategy_catalog.StrategyCatalogTest.test_strategy_scaffold_creates_backend_and_docs_templates tests.test_strategy_catalog.StrategyCatalogTest.test_strategy_scaffold_does_not_overwrite_existing_files` passed.
- `rtk npm run agent:check` passed.
- `rtk npx tsc --noEmit` passed.
- `rtk npm run build` passed.
- `rtk npm run dev:doctor` passed.
- Browser `/workbench` smoke passed:
  - Agent View Pro rendered in the center.
  - Sidebar showed only Strategy Pods.
  - `btc_convex_cycle_trend` pod loaded.
  - Strategy Inspector rendered metrics, chart region, next gate, run actions,
    equity curve, evidence timeline, and Pine mode.
  - Legacy project picker text was not visible in the main rail.

## Risks And Notes

- The worktree already contains many prior uncommitted changes. This patch was
  layered on top and did not revert unrelated edits.
- Browser smoke runs through Vite preview; native PTY launch behavior should be
  checked in Electron for real terminal spawn/attach/stop flows.
- No live trading, credentials, order routing, production promotion, or archive
  strategy deletion behavior was added.
- Memory was intentionally unchanged.

## Next Action

Run an Electron smoke for the real native terminal flows: `New main CLI`,
`Claude View`, `Open Strategy Shell`, pod edit persistence, and Delete Pod
local-config-only behavior.
