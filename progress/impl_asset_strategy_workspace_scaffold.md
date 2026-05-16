# Asset Strategy Workspace Scaffold

## Objective

Make Strategy Pods feel and behave like asset-level workspaces: one ticker, many
strategy ideas, one active linked strategy for inspection.

## Scope

- Strategy Pod workspace contract and defaults.
- Electron workspace scaffolding.
- Renderer pod creation, edit modal, desk header, and Strategy Inspector.
- Asset workspace docs.

## Changes Made

- Added the asset workspace convention:
  `docs/assets/<ASSET>/`, `ideas/`, and `reviews/`.
- Added `asset_workspace_dir`, `strategy_ideas_dir`, and
  `strategy_reviews_dir` to the `Workspace` contract.
- Electron now infers and scaffolds asset workspace folders for Strategy Pods
  when workspace config is saved.
- New Strategy Pods now carry deterministic asset folder paths.
- `/workbench` and Strategy Inspector now surface the asset folder, idea inbox,
  review folder, linked strategy count, catalog count, and draft session count.
- Workspace edit/create modal now shows the ticker-level folder layout for
  Strategy Pods.
- Promoted the convention to `AGENTS.md`, `docs/project-architecture.md`,
  `docs/operations/how-to-develop-this-app.md`, and
  `docs/strategies/README.md`.

## Files Changed

- `docs/assets/README.md` - asset workspace convention.
- `docs/assets/BTC/README.md` - initial BTC asset index.
- `docs/assets/BTC/ideas/README.md` - BTC idea inbox guidance.
- `docs/assets/BTC/reviews/README.md` - BTC review folder guidance.
- `electron/main/native/workspace-manager.ts` - Strategy Pod path inference and
  folder scaffolding.
- `electron/types/ipc.types.ts` and `src/types/electron.d.ts` - Workspace fields.
- `src/contexts/WorkspaceContext.tsx` - renderer fallback/normalization.
- `src/components/electron/Sidebar.tsx` - new pod defaults.
- `src/components/electron/WorkspaceModal.tsx` - asset folder visibility.
- `src/features/desks/pages/DeskSpacePage.tsx` - asset/ideas folder chips.
- `src/features/desks/components/StrategyInspectorPanel.tsx` - Asset Workspace
  panel.

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk npm run build
rtk git diff --check
```

Result:

- passed

## Findings

- The repo already had a dirty worktree with unrelated strategy, terminal, and
  harness changes. This patch worked with that state and did not revert it.
- Asset folders are organizational docs only. Backend artifacts remain under
  `backend/hyperliquid_gateway/data/`.
- Official strategy specs remain under `docs/strategies/`; backend strategy
  logic remains under `backend/hyperliquid_gateway/strategies/`.

## Memory Updated

Promoted: asset workspace convention now lives in `AGENTS.md`,
`docs/project-architecture.md`, `docs/operations/how-to-develop-this-app.md`,
and `docs/assets/README.md`.

## Assumptions

- The intended product model is one Strategy Pod per asset/ticker, with many
  rough ideas and draft sessions inside that asset pod.
- Moving existing strategy docs/backend folders into per-asset folders would be
  too risky and would break stable backend/docs conventions, so this pass adds
  an organizing layer instead.

## Next Best Step

Add a small “create idea note” command or IPC action that writes
`docs/assets/<ASSET>/ideas/<idea-slug>.md` from the Strategy Inspector.
