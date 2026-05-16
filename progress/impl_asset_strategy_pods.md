# Asset Strategy Pods

- Date: 2026-05-16
- Agent: Codex
- Mission class: UI review-speed audit / workspace semantics
- Status: completed

## Summary

Converted Strategy Pods from one workspace per strategy to one asset pod per
ticker. The existing `strategy-pod-btc-convex-cycle-trend` id is preserved, but
the user-facing pod now renders as `BTC`; `btc_convex_cycle_trend` remains the
linked and active strategy inside that BTC asset pod.

## Changed Files

- `electron/main/native/workspace-manager.ts`
- `electron/types/ipc.types.ts`
- `src/types/electron.d.ts`
- `src/contexts/WorkspaceContext.tsx`
- `src/components/electron/Sidebar.tsx`
- `src/components/electron/WorkspaceModal.tsx`
- `src/features/desks/pages/DeskSpacePage.tsx`
- `src/features/desks/components/StrategyInspectorPanel.tsx`
- `src/features/strategies/components/StrategyFactoryModal.tsx`
- `src/utils/strategyFactoryMission.ts`
- `src/contexts/TerminalContext.tsx`
- `src/hooks/useTerminal.ts`
- `src/components/electron/TerminalGrid.tsx`
- `src/features/desks/components/WorkspaceDock.tsx`
- `src/features/agents/components/WorkspaceAgentView.tsx`
- `src/features/agents/utils/workspaceAgentViewModel.ts`
- `src/features/agents/components/AgentSupervisorBoard.tsx`
- `src/utils/agentOrchestration.ts`
- `src/utils/missionDraftLaunch.ts`
- `src/utils/workspaceLaunch.ts`
- `src/features/desks/strategySessionReviewModel.ts`
- `progress/current.md`
- `progress/history.md`
- `progress/asset_strategy_pods_workbench_smoke.png`

## Behavior

- `WorkspaceKind` keeps `strategy-pod`, but strategy pods now normalize as asset
  pods with `asset_symbol`, `asset_display_name`, `linked_strategy_ids`, and
  `active_strategy_id`.
- Legacy strategy pods migrate by deriving `asset_symbol` from
  `strategy_symbol`, defaulting to `BTC`, and preserving legacy `strategy_id` as
  the active/linked strategy.
- The rail shows tickers. `+` creates a new asset pod by ticker and duplicate
  asset symbols are rejected in both renderer and main-process workspace
  manager.
- Desk header primary identity is the asset. Active strategy is secondary.
- Strategy Inspector filters catalog/benchmark rows by asset and uses the active
  asset for Pine/TradingView surfaces.
- Strategy Factory missions include a hard asset constraint.
- New agent/terminal sessions inside asset pods are tagged as draft strategy
  sessions with `assetSymbol`, `strategySessionId`, `strategySessionTitle`, and
  `strategySessionStatus: draft`.
- Browser preview now fails terminal IPC gracefully instead of crashing when the
  Electron bridge is absent.

## Verification

- Passed: `rtk npm run agent:check`
- Passed: `rtk npx tsc --noEmit`
- Passed: `rtk npm run build`
- Passed: `rtk npm run dev:doctor`
- Passed: `rtk git diff --check`
- Passed: Browser smoke at `http://localhost:5173/workbench`

## Smoke Evidence

- Rail displayed `BTC` with linked strategy/session counts.
- Header displayed asset identity `BTC` and secondary active strategy
  `BTC Convex Cycle Trend`.
- Inspector selected `BTC Convex Cycle Trend / ready-for-paper` from the BTC
  filtered catalog.
- Creating a new Codex main CLI in browser preview showed a `BTC draft strategy
  session` row without a renderer crash. It correctly reported terminal IPC as
  unavailable in browser preview because the Electron bridge is not present.
- Screenshot: `progress/asset_strategy_pods_workbench_smoke.png`.

## Risks And Notes

- The worktree was already dirty; unrelated changes were not reverted.
- No backend strategy logic, credentials, order routing, paper supervisor loop,
  live trading, or production promotion path was changed.
- Electron-terminal behavior should still get a real desktop smoke when the
  operator is in the packaged/runtime shell; browser preview can verify metadata
  and UI but cannot create a real PTY.

## Next Action

- Add manual ETH/SOL pods through the new `+` flow when the operator wants to
  start asset-specific strategy sessions for them.

---

## 2026-05-16 Addendum: Draft Strategy Session Review

## Summary

Draft strategy sessions launched inside an asset pod are now reviewable
immediately in Strategy Inspector Review without becoming backend catalog or
strategy-audit rows. A session is grouped by local `strategySessionId`, scoped to
the active workspace and `assetSymbol`, and can carry quick audit notes before a
real strategy doc/backend/backtest artifact exists.

## Changed Files

- `src/contexts/TerminalContext.tsx`
- `src/features/agents/components/WorkspaceAgentView.tsx`
- `src/features/desks/components/StrategyInspectorPanel.tsx`
- `src/features/desks/strategySessionReviewModel.ts`
- `progress/current.md`
- `progress/history.md`

## Behavior

- First send from Agent View that opens a new main CLI now creates a Commander
  task/run wrapper and links the terminal to that run.
- Strategy Inspector Review builds draft review groups from terminals, runs,
  mission drafts, and Commander tasks by `strategySessionId`.
- The newest draft session is shown in Review above the linked catalog strategy
  review. If no catalog strategy is linked, the draft session still appears
  instead of only showing the unlinked pod message.
- Review shows status, providers, latest excerpt, terminals, run/draft/task
  counts, and quick attach/open actions.
- Quick audit fields save to `CommanderTask.review` when a task exists, or to
  lightweight local `TerminalSession.strategySessionReview` metadata for
  terminal-only sessions.
- Backend `/api/hyperliquid/strategy-audit` remains unchanged; draft sessions
  stay UI-local until backend evidence exists.

## Verification

- Passed: `rtk npx tsc --noEmit`
- Passed: `rtk npm run build`
- Passed: `rtk npm run dev:doctor`
- Passed: `rtk npm run agent:check`
- Passed: `rtk git diff --check`
- Passed: HTTP smoke at `http://localhost:5173/workbench`

## Risks And Notes

- The worktree was already heavily dirty; unrelated changes were not reverted.
- `WorkspaceAgentView.tsx` and `StrategyInspectorPanel.tsx` were already
  untracked workspace files before this addendum, so review should inspect their
  full file contents rather than relying only on tracked diffs.
- Browser automation/Playwright smoke was unavailable in this environment, so
  the create/send/attach/save/refresh flow still needs a manual Electron UI
  pass.
- No backend strategy logic, backend audit route, credentials, order routing,
  live trading, or production promotion path was changed.

## Next Action

- In the Electron runtime, create/send a new strategy prompt in the BTC asset
  pod, confirm it appears in Inspector Review, save a quick audit, refresh, and
  verify persistence plus catalog strategy review side-by-side.
