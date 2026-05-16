# Agent Session History

Append meaningful completed session summaries here. Do not rewrite earlier
entries unless the human explicitly asks for cleanup.

---

## 2026-05-16 - OpenCode Permissionless Run Subcommand

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Corrected the OpenCode permissionless launcher to use
  `opencode run --interactive --model opencode/deepseek-v4-flash-free --dangerously-skip-permissions`,
  because OpenCode 1.15.3 exposes permission bypass on `run`, not the root TUI
  command.
- Evidence: `src/utils/agentRuntime.ts`,
  `progress/impl_interactive_agent_permissionless_ticker_insight_missions.md`,
  and `progress/impl_opencode_permissionless_run_subcommand.md`.
- Verification: `rtk npm run agent:check`, `rtk npx tsc --noEmit`,
  `rtk npm run build`, `rtk git diff --check`,
  `rtk npm run terminal:doctor`, version smoke, and a node-pty launch smoke
  passed. The PTY smoke reached the OpenCode `Ask anything...` prompt with no
  flag or command errors.
- Status: done. OpenCode launch command only; Codex, Claude, Gemini, Electron
  IPC, backend APIs, credentials, order routing, and release-promotion behavior
  were unchanged.

---

## 2026-05-16 - OpenCode Unicode Terminal Rendering

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Fixed OpenCode's broken-looking block-art in the embedded terminal
  by adding xterm Unicode 11 support, activating it per terminal, moving
  Menlo/Monaco ahead of SF Mono for block glyph rendering, and tightening the
  terminal line height.
- Evidence: `package.json`, `package-lock.json`,
  `src/components/electron/TerminalPane.tsx`, and
  `progress/impl_opencode_unicode_terminal_rendering.md`.
- Verification: `rtk npm run agent:check`, `rtk npx tsc --noEmit`,
  `rtk npm run build`, `rtk git diff --check`, and
  `rtk npm run terminal:doctor` passed.
- Status: done. Terminal rendering only; no agent command flags, Electron IPC,
  backend APIs, credentials, order routing, or release-promotion behavior
  changed.

---

## 2026-05-16 - Interactive Agent Permissionless Ticker Insight Missions

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Centralized permissionless interactive launch flags for Codex,
  Claude, and OpenCode; routed OpenCode through `opencode run --interactive`
  because permission bypass belongs to that subcommand in OpenCode 1.15.3;
  routed raw Command Palette and Claude Agent View launches through the shared
  runtime helper; and reworded strategy/market mission prompts to read the
  ticker first before strategy work.
- Evidence: `src/utils/agentRuntime.ts`, `src/utils/terminalShell.ts`,
  `src/components/electron/CommandPalette.tsx`,
  `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/utils/missionControl.ts`, `src/utils/strategyFactoryMission.ts`,
  `src/contexts/AgentProfilesContext.tsx`, and
  `progress/impl_interactive_agent_permissionless_ticker_insight_missions.md`.
- Verification: `rtk npm run agent:check`, `rtk npx tsc --noEmit`,
  `rtk npm run build`, `rtk git diff --check`,
  `rtk npm run terminal:doctor`, and CLI permission-flag smoke checks passed,
  including `opencode run --interactive --model opencode/deepseek-v4-flash-free --dangerously-skip-permissions --version`.
- Status: done. Backend Research OS `codex exec --sandbox read-only`, Gemini,
  IPC, backend APIs, credentials, order routing, and release gates were
  unchanged.

---

## 2026-05-16 - Dev Stability And Strategy Harness Hardening

- Agent: Codex
- Mission class: repo health audit / operations runbook audit
- Summary: Made `npm run dev` the stable renderer/HMR loop without native
  Electron auto-restart, added explicit `npm run dev:watch-native`, persisted
  Strategy Inspector pod state across renderer reloads, and made `agent:check`
  fail when `progress/current.md` names an active task missing from
  `agent_tasks.json`.
- Evidence:
  `package.json`, `docs/operations/how-to-develop-this-app.md`,
  `src/features/desks/components/StrategyInspectorPanel.tsx`,
  `src/features/cockpit/WidgetPanel.tsx`, `scripts/agent_harness.py`,
  `tests/test_agent_harness.py`, and
  `progress/impl_dev_stability_strategy_harness_hardening.md`.
- Verification: `rtk npm run agent:check`,
  `rtk python3 -m unittest tests.test_agent_harness tests.test_strategy_claims`,
  `rtk npm run build`, and `rtk git diff --check` passed.
- Status: done. Dev workflow and harness state only; no backend strategy logic,
  credentials, order routing, paper supervisor loop, live trading, or production
  promotion changed.

---
## 2026-05-16 - Agent View Ready Console State

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Added a renderer-only `Ready` group for live agent consoles waiting
  for optional operator input. `Input` remains reserved for blocking approval or
  permission prompts, and composer/reply sends now move runtime terminals back
  to `waiting-response`.
- Evidence:
  `src/features/agents/utils/workspaceAgentViewModel.ts`,
  `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/components/electron/TerminalPane.tsx`,
  `src/components/electron/TerminalGrid.tsx`, and
  `progress/impl_agent_view_ready_console_state.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run dev:doctor`, `rtk npm run agent:check`,
  `rtk git diff --check`, and HTTP `/workbench` smoke passed. Manual Electron
  PTY smoke still needs an interactive pass.
- Status: done. Renderer/terminal UI behavior only; no IPC, preload,
  PTY manager, backend, strategy logic, credentials, order routing, or live
  trading changed.

---
## 2026-05-16 - Strategy Agentic Harness v1

- Agent: Codex
- Mission class: architecture or agent workflow
- Summary: Added a docs-only strategy harness so agents creating, improving, or
  auditing strategies use one leader per `strategy_id`, backend artifacts as
  source of truth, and explicitly blocked live-gate packages for production
  review prep.
- Evidence:
  `docs/operations/agents/strategy-harness.md`,
  `docs/operations/agents/templates/strategy-live-gate.md`,
  `docs/operations/strategy-live-gates/README.md`,
  `AGENTS.md`, `CHECKPOINTS.md`, agent docs, strategy skills,
  `docs/operations/agents/memory/shared-memory.md`, and
  `progress/impl_strategy_agentic_harness_v1.md`.
- Verification: `rtk npm run agent:check`, `rtk npm run hf:status`, link
  search for `strategy-harness|live-gate|Strategy Factory`,
  `rtk git diff --check`, and `rtk npm run graph:status` passed. Graphify
  remains dirty and recommends `npm run graph:build`; it was not rebuilt for
  this docs-only v1.
- Status: done. No CLI, backend, FastAPI, React, Electron, `agent_tasks.json`
  schema, automation config, credentials, order routing, or live trading
  changed.

---

## 2026-05-15 - Agent View Pro Strategy Pods

- Agent: Codex
- Mission class: UI review-speed audit / strategy operations surface
- Summary: Rebuilt `/workbench` as Agent View Pro with the session/console
  cockpit as the center, Strategy Inspector in the right dock, and Strategy
  Pods as the only main rail unit. New Strategy pods now use a backend
  preview/approve scaffold flow before writing repo-native backend strategy
  folders and docs. Added backend/docs pod metadata, persistent provider
  preference per pod, Open Strategy Shell, and default `btc_convex_cycle_trend`
  pod seeding for empty configs/browser preview.
- Evidence:
  `backend/hyperliquid_gateway/strategy_scaffold.py`,
  `src/features/desks/pages/DeskSpacePage.tsx`,
  `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/components/electron/Sidebar.tsx`,
  `src/features/desks/components/StrategyInspectorPanel.tsx`,
  `electron/main/native/workspace-manager.ts`, and
  `progress/impl_agent_view_pro_strategy_pods.md`.
- Verification: scaffold unit tests, `rtk npm run agent:check`,
  `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run dev:doctor`, and browser `/workbench` smoke passed.
- Status: done. Local pod config, scaffold API/templates, and renderer/native
  workbench UI only; no live trading, credentials, order routing, production
  promotion, or strategy archive deletion behavior changed.

---

## 2026-05-15 - Strategy Lab Workbench

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Converted `/workbench` from a generic workspace/agent center into
  Strategy Lab: strategy selector, Improve/Create/Indicator modes, metrics,
  local chart with entry/exit markers, evidence timeline, gated backend actions,
  and agent drafts as helpers. The right dock keeps mode IDs but is now labeled
  as Agent CLI, TradingView/Web, and Runs/Evidence.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `tests/test_strategy_catalog.py`,
  `src/services/hyperliquidService.ts`,
  `src/features/desks/pages/DeskSpacePage.tsx`,
  `src/features/desks/components/WorkspaceDock.tsx`, and
  `progress/impl_strategy_lab_workbench.md`.
- Verification: strategy catalog and strategy memory tests, lab API curl,
  gateway restart, `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run dev:doctor`, `rtk git diff --check`, and browser smoke of
  `/workbench` no-selection plus selected-strategy chart states passed.
- Status: done. Backend read endpoint and renderer review/control surface only;
  no live trading, credential changes, or production promotion behavior changed.

---

## 2026-05-15 - OpenCode Terminal Runtime

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Added OpenCode as a first-class agent terminal runtime so the
  workspace can launch `opencode` alongside Codex, Claude, Gemini, Shell, and
  Dev. Provider metadata, command resolution, provider inference for
  `opencode`/`open code`/`deepseek`, mission console provider typing, and
  shell normalization for `opencode.cmd` were added.
- Evidence:
  `src/utils/agentRuntime.ts`, `src/components/electron/TerminalGrid.tsx`,
  `src/features/desks/components/WorkspaceDock.tsx`,
  `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/features/agents/components/MissionConsoleLauncher.tsx`, and
  `progress/impl_opencode_terminal_runtime.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, `rtk git diff --check`, and
  `rtk npm run dev:doctor` passed. Browser preview loaded `/workbench`, but it
  had no Electron preload workspace/terminal API, so static bundle verification
  confirmed OpenCode in the built chunks instead.
- Follow-up: Installed official `opencode-ai@1.15.0` globally under
  `/opt/homebrew`, verified `/opt/homebrew/bin/opencode`, confirmed
  `opencode/deepseek-v4-flash-free` is available, and updated the OpenCode
  launcher to start with that model by default.
- Status: done. Renderer/Electron terminal-runtime integration only; no backend
  strategy logic, gateway API, credentials, live routing, paper supervisor, or
  production promotion behavior changed.

---

## 2026-05-05 - File Harness Bootstrap

- Agent: Codex
- Mission class: repo health audit
- Summary: Added a file-based harness structure inspired by
  `betta-tech/ejemplo-harness-subagentes` so future agents can orient, claim
  work, write progress, and hand off without relying on chat context.
- Evidence: `AGENTS.md`, `CHECKPOINTS.md`, `agent_tasks.json`,
  `docs/operations/agents/file-harness.md`, `progress/current.md`.
- Status: pending reviewer approval through `file_harness_bootstrap_review`.

---

## 2026-05-05 - OI Expansion Failure Fade Strategy

- Agent: Codex
- Mission class: strategy research
- Summary: Added a backend-first `oi_expansion_failure_fade` strategy with
  docs, deterministic signal/scoring/risk/paper modules, registry integration,
  focused tests, and requested backtest/validation artifacts.
- Evidence:
  `docs/strategies/oi-expansion-failure-fade.md`,
  `backend/hyperliquid_gateway/strategies/oi_expansion_failure_fade/`,
  `backend/hyperliquid_gateway/data/backtests/oi_expansion_failure_fade-hyperliquid-20260505T182148Z.json`,
  `backend/hyperliquid_gateway/data/backtests/oi_expansion_failure_fade-hyperliquid-20260505T182154Z.json`,
  `backend/hyperliquid_gateway/data/validations/oi_expansion_failure_fade-20260505T182201Z.json`,
  `progress/impl_oi_expansion_failure_fade_strategy.md`.
- Status: validation blocked; paper candidate intentionally skipped.

---

## 2026-05-06 - BTC Failed Impulse Reversal Strategy

- Agent: Codex
- Mission class: strategy research
- Summary: Added a backend-first `btc_failed_impulse_reversal` BTC strategy
  after comparing existing BTC candidates and finding they were negative on the
  current local taker-fee window. The new package includes docs, deterministic
  signal/scoring/risk/paper modules, registry integration, tests, and
  backtest/validation/paper artifacts.
- Evidence:
  `docs/strategies/btc-failed-impulse-reversal.md`,
  `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/`,
  `backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260506T165516Z.json`,
  `backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_reversal-hyperliquid-20260506T165646Z.json`,
  `backend/hyperliquid_gateway/data/validations/btc_failed_impulse_reversal-20260506T165520Z.json`,
  `backend/hyperliquid_gateway/data/paper/btc_failed_impulse_reversal-20260506T165525Z.json`,
  `progress/impl_btc_failed_impulse_reversal_strategy.md`.
- Status: ready for review; validation is `ready-for-paper`, paper payload is
  standby because latest BTC signal is none.

---

## 2026-05-06 - Gated Strategy Pipeline

- Agent: Codex
- Mission class: UI review-speed audit / strategy validation audit
- Summary: Converted strategy promotion into a backend-derived pipeline:
  Research, Backtesting, Audit, Paper, and Blocked. Audit eligibility now
  requires robust backtest evidence, paper candidate creation is separate from
  running a backtest, and `/strategies` is the primary pipeline board.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `src/features/strategies/pages/StrategyLibraryPage.tsx`,
  `src/features/strategies/pages/StrategyAuditPage.tsx`,
  `src/services/hyperliquidService.ts`,
  `tests/test_strategy_catalog.py`,
  `progress/impl_gated_strategy_pipeline.md`.
- Verification: `npm run agent:check`,
  `python3 -m unittest tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper`,
  `npm run hf:status`, and `npm run build` passed.
- Status: ready for review; no live trading, credential changes, or production
  promotion performed.

---

## 2026-05-06 - Pipeline 404 Stale Gateway Follow-Up

- Agent: Codex
- Mission class: UI review-speed audit / operations runbook audit
- Summary: Fixed the remaining `/strategies` Pipeline `404 Not Found` by
  restarting the stale local Hyperliquid gateway on `18001`, adding a stable
  `npm run gateway:restart` command, and hardening the frontend catalog client
  with a strategy-audit fallback for stale gateways.
- Evidence:
  `scripts/restart-hyperliquid-gateway.sh`,
  `src/services/hyperliquidService.ts`,
  `src/features/strategies/pages/StrategyLibraryPage.tsx`,
  `docs/operations/backend-connectivity-runbook.md`,
  `progress/impl_pipeline_404_stale_gateway.md`.
- Verification: `/api/hyperliquid/strategies/catalog?limit=500` returned 200,
  `npm run gateway:probe`, `npm run build`, `npm run agent:check`,
  `npm run hf:status`, focused Python tests, and browser smoke on
  `http://localhost:5173/strategies` passed.
- Status: ready for review; gateway is running in detached `screen` session
  `hyperliquid-gateway-dev`.

---

## 2026-05-06 - Backtest Evidence Gateway Contract

- Agent: Codex
- Mission class: UI review-speed audit / strategy validation audit
- Summary: Fixed strategy detail backtest evidence loading by routing
  Hyperliquid backtest and paper-candidate operations through the local
  Hyperliquid gateway contract on `18001`, matching the Strategy Pipeline
  catalog source of truth.
- Evidence:
  `src/services/hyperliquidService.ts`,
  `progress/impl_backtest_evidence_gateway_contract.md`.
- Verification: `bb_squeeze_adx` latest artifact loaded from
  `/api/hyperliquid/backtests/bb_squeeze_adx/latest` with 203 trades,
  `npm run build`, focused Python tests, `npm run gateway:probe`,
  `npm run hf:status`, `npm run agent:check`, and browser smoke on
  `/strategy/bb_squeeze_adx/paper` passed.
- Status: ready for review; no live trading, credential changes, or production
  promotion performed.

---

## 2026-05-06 - Strategy Pipeline Stabilization

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Stabilized the Strategy Pipeline by making the catalog evidence
  lightweight, avoiding exact SQLite table counts on card loads, adding
  backtest artifact list/detail APIs, routing validation-blocked actions to
  validation reruns, and adding a compact artifact selector to Strategy Detail.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `src/services/hyperliquidService.ts`,
  `src/features/strategies/pages/StrategyLibraryPage.tsx`,
  `src/features/strategies/pages/StrategyDetailPage.tsx`,
  `tests/test_strategy_catalog.py`,
  `progress/impl_strategy_pipeline_stabilization.md`.
- Verification: focused Python tests, `npm run build`, `npm run hf:status`,
  `npm run gateway:restart`, `npm run gateway:probe`, curl performance checks,
  browser smoke on `/strategies` and `/strategy/bb_squeeze_adx/paper`, and
  final `npm run agent:check` passed.
- Status: ready for review; catalog performance on the local gateway measured
  `0.340786s` cold and `0.119913s` repeated, with `/health` no longer blocked
  by the catalog path.

---

## 2026-05-06 - Strategy Pipeline Responsive Layout

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Fixed the `/strategies` board layout so pipeline columns respond to
  available Electron panel width instead of viewport breakpoints, preventing
  squeezed columns and clipped card content.
- Evidence:
  `src/features/strategies/pages/StrategyLibraryPage.tsx`,
  `progress/impl_strategy_pipeline_responsive_layout.md`.
- Verification: `npm run build`, `npm run agent:check`, catalog curl smoke, and
  Electron visual smoke on `/strategies` passed. Narrow center-panel state wraps
  cleanly; wide rail-collapsed state shows all five stages in one row.
- Status: ready for review; renderer layout only, with backend evidence/action
  behavior unchanged.

---

## 2026-05-06 - BTC Strategy Doubling Leaderboard

- Agent: Codex
- Mission class: strategy research / UI review-speed audit
- Summary: Added backend-derived BTC doubling-speed evidence to Strategy
  Pipeline and ran comparable BTC-only taker-fee backtests. The only validated
  candidate is `btc_failed_impulse_reversal`: 0.99% return, 9 trades, robust
  gate passes, validation `ready-for-paper`, projected research-only 2x ETA
  `211.0` days on the local 3-day window.
- Evidence:
  `backend/hyperliquid_gateway/backtesting/doubling.py`,
  `backend/hyperliquid_gateway/app.py`,
  `src/services/hyperliquidService.ts`,
  `src/features/strategies/pages/StrategyLibraryPage.tsx`,
  `tests/test_strategy_catalog.py`,
  `progress/impl_btc_strategy_doubling_leaderboard.md`.
- Verification: focused Python tests, `npm run build`, `npm run
  gateway:restart`, `npm run gateway:probe`, `npm run hf:status`, HTTP catalog
  smoke for `doublingEstimate`, and `npm run agent:check` passed.
- Status: ready for review; no live trading, credential changes, or production
  promotion performed. Paper evidence and operator sign-off remain required
  before any 24/7/live discussion.

---

## 2026-05-06 - BTC Failed Impulse Paper Baseline

- Agent: Codex
- Mission class: strategy validation audit
- Summary: Added a quantitative paper baseline to BTC Failed Impulse Reversal
  paper artifacts and made it visible in Strategy Detail. The baseline compares
  future paper results against the 211.0-day research projection and requires
  14 calendar days, 30 closed paper trades, 90% review coverage, positive net
  paper return after fees, PF >= 1.5, drawdown <= 2.0%, regime/risk review, and
  operator sign-off before any promotion review.
- Evidence:
  `backend/hyperliquid_gateway/backtesting/doubling.py`,
  `backend/hyperliquid_gateway/backtesting/workflow.py`,
  `src/features/strategies/pages/StrategyDetailPage.tsx`,
  `tests/test_strategy_catalog.py`,
  `backend/hyperliquid_gateway/data/paper/btc_failed_impulse_reversal-20260506T221259Z.json`,
  `progress/impl_btc_failed_impulse_paper_baseline.md`.
- Verification: focused Python tests, `npm run build`, `npm run hf:paper`,
  `npm run gateway:restart`, `npm run gateway:probe`, `npm run hf:status`,
  HTTP smoke for latest backtest paper baseline, and `npm run agent:check`
  passed.
- Status: ready for review; candidate remains standby because latest signal is
  `none`. No live trading, credential changes, or production promotion
  performed.

---

## 2026-05-10 - Agent Memory Harness Performance

- Agent: Codex
- Mission class: repo health audit
- Summary: Added fast agent orientation commands, refreshed Graphify status and
  artifacts, converted `CLAUDE.md` into a compatibility shim, added an Obsidian
  Agent Navigation Index, resolved the recurring cadence decision, updated the
  nightly Hedge Fund automation, and created a weekly read-only agent health
  report automation.
- Evidence:
  `scripts/agent_harness.py`,
  `scripts/graphify-status.mjs`,
  `AGENTS.md`,
  `CLAUDE.md`,
  `docs/operations/agents/automation-system.md`,
  `docs/operations/agents/memory/decisions.md`,
  `hedge-station/Agent Navigation Index.md`,
  `graphify-out/GRAPH_REPORT.md`,
  `progress/impl_agent_memory_harness_performance.md`.
- Verification: `npm run agent:check`, `npm run agent:status`,
  `npm run agent:brief`, `npm run graph:status`, `npm run graph:check`,
  Graphify query, focused Graphify memory tests, `npm run perf:budget`, and
  `git diff --check` passed.
- Status: done; no trading logic, credentials, order routing, backend API, IPC
  contract, or live promotion behavior changed.

---

## 2026-05-08 - Aggressive Cleanup Queue Closeout

- Agent: Codex
- Mission class: repo health audit / operations runbook audit / strategy
  validation audit / data quality audit
- Summary: Closed the remaining pending harness queue, added canonical startup,
  validation-threshold, data-quality, and paper-review docs, removed the
  duplicate Polymarket maker-basis doc, made `package-lock.json` reproducible,
  archived local ignored evidence to the GCP VM, and purged heavy local runtime
  outputs.
- Evidence:
  `docs/operations/backend-startup-runbook.md`,
  `docs/operations/strategy-validation-thresholds.md`,
  `docs/operations/data-quality-checklist.md`,
  `docs/operations/paper-trade-review-criteria.md`,
  `package-lock.json`,
  `progress/impl_aggressive_cleanup_queue_closeout.md`.
- Status: complete. `live_production_gate_package` remains blocked and
  human-gated.

---

## 2026-05-07 - Long Flush Continuation Strategy

- Agent: Codex
- Mission class: strategy research
- Summary: Added backend-first `long_flush_continuation`, a short-side
  continuation strategy for failed long-pressure setups. The package includes
  docs, spec, deterministic signal/scoring/risk/paper modules, registered
  backtest adapter, focused tests, and taker/mixed backtest plus validation
  artifacts.
- Evidence:
  `docs/strategies/long-flush-continuation.md`,
  `backend/hyperliquid_gateway/strategies/long_flush_continuation/`,
  `backend/hyperliquid_gateway/data/backtests/long_flush_continuation-hyperliquid-20260507T010749Z.json`,
  `backend/hyperliquid_gateway/data/backtests/long_flush_continuation-hyperliquid-20260507T010757Z.json`,
  `backend/hyperliquid_gateway/data/validations/long_flush_continuation-20260507T010806Z.json`,
  `progress/impl_long_flush_continuation_strategy.md`.
- Verification: focused new tests, required focused suite, taker/mixed
  backtests, validation artifact generation, `npm run hf:status`, and
  `npm run agent:check`.
- Status: ready for review; validation is blocked with 1 HYPE trade, -$2.77
  primary taker net PnL, insufficient sample, and robust blockers. Paper
  candidate generation was intentionally skipped. No live trading, credential
  changes, paper runtime changes, or production promotion performed.

---

## 2026-05-06 - BTC Paper Readiness Evaluator

- Agent: Codex
- Mission class: strategy validation audit
- Summary: Added a backend readiness evaluator and Strategy Detail panel that
  compares actual BTC Failed Impulse paper trades against the paper baseline.
  The current readiness state is `collecting-paper-trades`: 0/30 required
  closed trades, no fee-adjusted paper return evidence yet, and blockers for
  sample, drift checks, paper reviews, regime review, risk review, and operator
  sign-off.
- Evidence:
  `backend/hyperliquid_gateway/backtesting/doubling.py`,
  `backend/hyperliquid_gateway/app.py`,
  `src/services/hyperliquidService.ts`,
  `src/features/strategies/pages/StrategyDetailPage.tsx`,
  `tests/test_strategy_catalog.py`,
  `backend/hyperliquid_gateway/data/paper/btc_failed_impulse_reversal-20260506T221801Z.json`,
  `progress/impl_btc_paper_readiness_evaluator.md`.
- Verification: focused Python tests, `npm run build`, `npm run hf:paper`,
  `npm run gateway:restart`, readiness curl smoke, `npm run gateway:probe`,
  `npm run hf:status`, and `npm run agent:check` passed.
- Status: ready for review; no live trading, credential changes, or production
  promotion performed.

---

## 2026-05-06 - BTC Failed Impulse Paper Runtime Tick

- Agent: Codex
- Mission class: strategy validation audit
- Summary: Added a paper-only runtime tick for
  `btc_failed_impulse_reversal`. The tick evaluates current BTC history with
  backend strategy logic, opens paper trades only on long/short signals, skips
  duplicate matching open trades, closes matching open paper trades on
  stop/target/time-stop, and exposes both a gateway endpoint and
  `npm run hf:paper:tick` for schedulable paper collection.
- Evidence:
  `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/paper.py`,
  `backend/hyperliquid_gateway/app.py`,
  `backend/hyperliquid_gateway/cli.py`,
  `src/services/hyperliquidService.ts`,
  `src/features/paper/pages/HyperliquidPaperLabPage.tsx`,
  `tests/test_btc_failed_impulse_reversal.py`,
  `tests/test_strategy_catalog.py`,
  `package.json`,
  `progress/impl_btc_failed_impulse_paper_runtime_tick.md`.
- Verification: focused Python tests, `npm run build`,
  `npm run gateway:restart`, endpoint dry-run smoke, CLI dry-run smoke,
  `npm run gateway:probe`, `npm run hf:status`, and `npm run agent:check`
  passed.
- Status: ready for review. Current dry-run state is `flat-no-signal`, with no
  paper trade opened. No live trading, credential changes, or production
  promotion performed.

---

## 2026-05-06 - BTC Failed Impulse Paper Runtime Loop

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Added a schedulable paper-only loop for
  `btc_failed_impulse_reversal` with `--interval-seconds`, `--max-ticks`,
  `--dry-run`, `--fail-fast`, JSON-lines tick summaries, package script
  `npm run hf:paper:loop`, focused CLI tests, and an operations runbook.
- Evidence:
  `backend/hyperliquid_gateway/cli.py`,
  `package.json`,
  `tests/test_cli_paper_runtime_loop.py`,
  `docs/operations/btc-paper-runtime-loop.md`,
  `progress/impl_btc_failed_impulse_paper_runtime_loop.md`.
- Verification: CLI loop tests, focused strategy/catalog tests, bounded loop
  dry-run, `npm run build`, `npm run gateway:probe`, `npm run hf:status`, and
  `npm run agent:check` passed.
- Status: ready for review. Current bounded dry-run state is
  `flat-no-signal`, with no paper trade opened. No live trading, credential
  changes, or production promotion performed.

---

## 2026-05-06 - BTC Paper Loop Supervisor Controls

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Added local supervisor controls around the BTC Failed Impulse paper
  runtime loop. Operators can start, stop, restart, status-check, and tail the
  paper loop through `npm run hf:paper:supervisor`, with metadata and logs under
  `.tmp/`.
- Evidence:
  `scripts/btc-paper-runtime-loop.sh`,
  `package.json`,
  `docs/operations/btc-paper-runtime-loop.md`,
  `progress/impl_btc_paper_loop_supervisor_controls.md`.
- Verification: `npm run agent:check`,
  `bash -n scripts/btc-paper-runtime-loop.sh`, supervisor status/start/tail/stop
  bounded smoke, `npm run build`, `npm run gateway:probe`, and
  `npm run hf:status` passed.
- Status: ready for review. The bounded smoke used `--dry-run --max-ticks 1`,
  finished `flat-no-signal`, opened no trade, and left no long-running
  supervisor process. No live trading, credential changes, or production
  promotion performed.

---

## 2026-05-06 - BTC Failed Impulse Paper Collection Start

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Started active paper-only evidence collection for
  `btc_failed_impulse_reversal` at a 300 second cadence. The supervisor now uses
  a detached `screen` session so it survives the `npm run` wrapper, matching
  the gateway supervision pattern.
- Evidence:
  `scripts/btc-paper-runtime-loop.sh`,
  `docs/operations/btc-paper-runtime-loop.md`,
  `progress/impl_btc_failed_impulse_start_paper_collection.md`.
- Verification: `npm run agent:check`, `npm run gateway:probe`,
  `bash -n scripts/btc-paper-runtime-loop.sh`, supervisor status/start/tail,
  paper readiness curl, and paper trades curl passed.
- Status: ready for review. The paper-only loop is running in
  `screen_session=btc-paper-runtime-loop` with pid `71918`. Paper trade `id=1`
  is open for BTC Failed Impulse Reversal; readiness remains
  `collecting-paper-trades` with 0/30 closed trades. No live trading,
  credential changes, or production promotion performed.

---

## 2026-05-06 - BTC Paper Runtime Supervisor Visibility

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Added backend and Strategy Detail visibility for the BTC paper-only
  supervisor. The app can now show whether paper collection is running, its
  mode, cadence, start time, pid/session, log path, and latest tick.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `src/services/hyperliquidService.ts`,
  `src/features/strategies/pages/StrategyDetailPage.tsx`,
  `tests/test_strategy_catalog.py`,
  `progress/impl_btc_paper_runtime_supervisor_visibility.md`.
- Verification: focused Python tests, `npm run build`,
  `npm run gateway:restart`, supervisor endpoint curl smoke,
  `npm run gateway:probe`, supervisor status/tail, and `npm run agent:check`
  passed.
- Status: ready for review. Supervisor endpoint reports the BTC paper-only loop
  running in `screen` mode with pid `71918`, 300 second cadence, `dryRun=false`,
  and last tick `managing-open-trade`. No live trading, credential changes,
  production routing, or strategy logic changes performed.

---

## 2026-05-06 - BTC Paper Runtime Health Gate

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Added a read-only health gate for the BTC paper-only runtime. The
  supervisor endpoint and Strategy Detail now surface `healthStatus`,
  blockers, log age, stale threshold, and health checks so stale 24/7 paper
  collection is obvious.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `src/services/hyperliquidService.ts`,
  `src/features/strategies/pages/StrategyDetailPage.tsx`,
  `tests/test_strategy_catalog.py`,
  `progress/impl_btc_paper_runtime_health_gate.md`.
- Verification: focused Python tests, `npm run build`,
  `npm run gateway:restart`, supervisor endpoint curl smoke,
  `npm run gateway:probe`, supervisor tail, and `npm run agent:check` passed.
- Status: ready for review. Current health smoke reports
  `healthStatus=healthy`, no blockers, 300 second cadence, `dryRun=false`, and
  last tick `managing-open-trade`. No live trading, credential changes,
  production routing, or strategy logic changes performed.

---

## 2026-05-06 - BTC Doubling Stability Audit

- Agent: Codex
- Mission class: strategy validation audit
- Summary: Added a stable doubling stability audit command and surfaced the
  latest audit status/path in Strategy Detail. The BTC Failed Impulse Reversal
  audit splits the matched backtest into three subwindows and records returns,
  trade counts, win rate, profit factor, concentration, blockers, and status.
- Evidence:
  `backend/hyperliquid_gateway/backtesting/doubling.py`,
  `backend/hyperliquid_gateway/backtesting/workflow.py`,
  `backend/hyperliquid_gateway/cli.py`,
  `backend/hyperliquid_gateway/app.py`,
  `src/services/hyperliquidService.ts`,
  `src/features/strategies/pages/StrategyDetailPage.tsx`,
  `tests/test_strategy_catalog.py`,
  `backend/hyperliquid_gateway/data/audits/btc_failed_impulse_reversal-doubling-stability-20260506T230254Z.json`,
  `progress/impl_btc_doubling_stability_audit.md`.
- Verification: focused Python tests, `npm run hf:doubling:stability -- --strategy btc_failed_impulse_reversal`,
  `npm run build`, `npm run gateway:restart`, `npm run gateway:probe`,
  catalog smoke, supervisor status, supervisor endpoint smoke, and final
  `npm run agent:check` passed.
- Status: ready for review. Audit status is `fragile` because all three
  subwindows are positive but the largest slice contributes 56.6% of net PnL,
  tripping `return_concentration`. Paper-only runtime remains healthy and
  running; no live trading, credential changes, paper runtime state changes, or
  production promotion performed.

---

## 2026-05-06 - BTC Failed Impulse Variant Optimizer

- Agent: Codex
- Mission class: strategy validation audit
- Summary: Added a research-only optimizer for BTC Failed Impulse Reversal
  variants. The optimizer compares signal/risk parameter variants by local
  validation status, return, trades, robust status, doubling estimate,
  subwindow stability, and concentration.
- Evidence:
  `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/logic.py`,
  `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/risk.py`,
  `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/backtest.py`,
  `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/optimizer.py`,
  `backend/hyperliquid_gateway/backtesting/workflow.py`,
  `backend/hyperliquid_gateway/cli.py`,
  `backend/hyperliquid_gateway/app.py`,
  `src/services/hyperliquidService.ts`,
  `src/features/strategies/pages/StrategyDetailPage.tsx`,
  `tests/test_btc_failed_impulse_reversal.py`,
  `tests/test_strategy_catalog.py`,
  `backend/hyperliquid_gateway/data/audits/btc_failed_impulse_reversal-variant-optimizer-20260506T231057Z.json`,
  `progress/impl_btc_failed_impulse_variant_optimizer.md`.
- Verification: initial harness check, focused Python tests,
  `npm run hf:btc:optimize -- --strategy btc_failed_impulse_reversal`,
  `npm run build`, `npm run gateway:restart`, `npm run gateway:probe`,
  catalog smoke, supervisor status, supervisor health smoke, and final
  `npm run agent:check` passed.
- Status: ready for review. The optimizer tested 20 variants and found one
  stable candidate, `default_signal__balanced_fast`: 0.54% return, 12 trades,
  58.33% win rate, 3.27 profit factor, 0.11% max drawdown, 385.8 projected
  days to double, stable subwindows, and 43.77% largest positive slice PnL
  share. The running paper loop remains on the default registered strategy. No
  live trading, credential changes, paper runtime state changes, or production
  promotion performed.

---

## 2026-05-06 - Strategy Pipeline Inventory Cleanup

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Promoted the stable optimizer variant into the named strategy
  `btc_failed_impulse_balanced_fast` and added an all-strategy inventory to the
  Strategy Pipeline so created, blocked, paper-ready, and docs-only rows are
  visible in the app.
- Evidence:
  `docs/strategies/btc-failed-impulse-balanced-fast.md`,
  `backend/hyperliquid_gateway/strategies/btc_failed_impulse_balanced_fast/`,
  `backend/hyperliquid_gateway/backtesting/registry.py`,
  `src/features/strategies/pages/StrategyLibraryPage.tsx`,
  `tests/test_btc_failed_impulse_reversal.py`,
  `backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_balanced_fast-hyperliquid-20260506T233333Z.json`,
  `backend/hyperliquid_gateway/data/validations/btc_failed_impulse_balanced_fast-20260506T233340Z.json`,
  `progress/impl_strategy_pipeline_inventory_cleanup.md`.
- Verification: harness check, focused Python tests, backtest, validation
  artifact generation, `npm run build`, `npm run gateway:restart`,
  `npm run gateway:probe`, catalog smoke, `npm run hf:status`, supervisor
  status, supervisor health smoke, and final `npm run agent:check` passed.
  Validation command intentionally exited non-zero because the strategy is
  blocked, and that artifact was recorded.
- Status: ready for review. The new strategy is visible but blocked:
  0.41% return, 11 trades, 54.55% win rate, 2.88 profit factor, 0.11% max
  drawdown, blockers `robust_gate`, `robust:positive_net_return`, and
  `robust:max_largest_trade_pnl_share_pct`. No live trading, credential
  changes, paper runtime state changes, or production promotion performed.

---

## 2026-05-06 - Strategy Pipeline Actionable Focus

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Changed `/strategies` to open on an actionable Pipeline tab by
  default, moved docs-only/research-only rows to the All Strategies inventory,
  and bounded UI backtest actions to local gateway defaults.
- Evidence:
  `src/features/strategies/pages/StrategyLibraryPage.tsx`,
  `src/features/strategies/pages/StrategyDetailPage.tsx`,
  `src/features/strategies/strategyPipelineModel.ts`,
  `src/features/strategies/components/StrategyPipelineBoard.tsx`,
  `src/features/strategies/components/StrategyInventory.tsx`,
  `src/features/strategies/components/BacktestEvidencePanels.tsx`,
  `src/features/strategies/components/PaperBaselinePanel.tsx`,
  `src/services/hyperliquidService.ts`,
  `src/services/strategyService.ts`,
  `progress/impl_strategy_pipeline_actionable_focus.md`.
- Verification: `npm run build`, `npm run agent:check`, focused Python tests,
  `npm run gateway:probe`, HTTP catalog/backtest smoke, and in-app browser
  smoke passed. Browser smoke confirmed 9 actionable Pipeline rows, 11
  All Strategies rows, docs-only rows excluded from the visible Pipeline, and
  `bb_squeeze_adx` detail loading 203 backtest trades.
- Status: ready for review. This stayed in renderer/client scope and did not
  change credentials, promotion routing, or backend strategy logic.

---

## 2026-05-07 - Obsidian Strategy Memory Graph

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Added a dedicated `/memory` surface that renders a repo-first
  Obsidian strategy memory graph, merges Hyperliquid catalog evidence with
  vault/repo nodes, and exposes safe managed-note sync into the workspace
  Obsidian vault.
- Evidence:
  `electron/main/native/obsidian-manager.ts`,
  `electron/main/ipc/ipc-handlers.ts`, `electron/main/index.ts`,
  `electron/preload/index.ts`, `electron/types/ipc.types.ts`,
  `src/types/electron.d.ts`,
  `src/features/memory/pages/MemoryGraphPage.tsx`,
  `src/features/cockpit/WidgetPanel.tsx`, `src/features/README.md`,
  `src/pages/index.ts`, `src/components/electron/PreloadApiNotice.tsx`,
  `progress/impl_obsidian_strategy_memory_graph.md`.
- Verification: `npm run build`, `npm run gateway:probe`, HTTP smoke for
  `/memory`, `/strategies`, and `/workbench`, in-app browser smoke for the same
  routes, and final `npm run agent:check` passed.
- Status: ready for review. The sync path only overwrites notes marked
  `managed_by: hedge-fund-station`; manual Obsidian notes are preserved.

---

## 2026-05-07 - Obsidian Memory Graph Visual Polish

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Polished `/memory` into a more Obsidian-like visual map with a
  graph-first layout, deterministic radial positioning, circular glowing nodes,
  curved links, selected-neighborhood focus, and reduced label noise for narrow
  app widths.
- Evidence:
  `src/features/memory/pages/MemoryGraphPage.tsx`,
  `progress/impl_obsidian_memory_graph_visual_polish.md`.
- Verification: `npm run build`, in-app browser smoke for `/memory`, and
  `npm run agent:check` passed. Browser smoke confirmed the route loads, the
  SVG graph and center label render, controls appear after the graph, and no
  route/module errors are present.
- Status: ready for review. Scope stayed in renderer visual polish; graph data,
  Obsidian sync safety, backend strategy logic, and runtime state were left
  unchanged.

---

## 2026-05-07 - Strategy Memory Actionable Cleanup

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Converted `/memory` from raw node-type graph filters into an
  actionable strategy memory map with first-screen strategy review cards,
  lenses for Actionable, Paper Ready, Blocked, Needs Backtest, Docs Only, and
  All, scoped evidence graph neighborhoods, passive node legend, and a more
  decision-oriented inspector.
- Evidence:
  `src/features/memory/pages/MemoryGraphPage.tsx`,
  `progress/impl_strategy_memory_actionable_cleanup.md`.
- Verification: `npm run build`, `npm run gateway:probe`, browser smoke for
  `http://localhost:5173/memory`, and `npm run agent:check` passed. Browser
  smoke confirmed actionable route text, strategy review queue, strategy cards,
  scoped evidence graph, inspector, `Blocked` lens interaction, and `long_flush`
  search.
- Status: ready for review. Scope stayed renderer-only; no backend strategy
  logic, public API, Electron IPC, Obsidian sync safety, trading, credential, or
  runtime state changes.

---

## 2026-05-07 - Terminal Bridge Reliability

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Fixed the in-app terminal bridge root cause by adding a stable
  `node-pty` `spawn-helper` permission repair and PTY smoke test, hardening
  Electron PTY creation with cwd validation and macOS/Homebrew PATH handling,
  and adding Workbench health checks for runtime commands, shell smoke, and PTY
  smoke.
- Evidence:
  `scripts/fix-node-pty-permissions.mjs`,
  `electron/main/native/pty-manager.ts`,
  `electron/main/native/diagnostics-manager.ts`,
  `electron/main/ipc/ipc-handlers.ts`,
  `electron/preload/index.ts`,
  `src/features/agents/components/SystemHealthCard.tsx`,
  `src/contexts/TerminalContext.tsx`,
  `progress/impl_terminal_bridge_reliability.md`.
- Verification: initial `npm run agent:check`, `npm run terminal:doctor`,
  Electron-as-Node PTY smoke, `npm run build`, and final `npm run agent:check`
  passed.
- Status: ready for review. Native terminal smoke is fixed; next manual check is
  a visible Electron `/terminals` and Workbench System Check smoke after
  restarting the Electron shell.

---

## 2026-05-07 - Strategy Learning Memory Graph

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Turned `/memory` into a strategy learning loop by adding structured
  backend learning artifacts, learning-event graph nodes, learning lenses,
  Capture Lesson flow, managed Obsidian lesson sync, and a real-vault open fix
  that targets `hedge-station/Workspace Home.md`.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `tests/test_strategy_learning_memory.py`,
  `src/services/hyperliquidService.ts`,
  `src/features/memory/pages/MemoryGraphPage.tsx`,
  `electron/main/native/obsidian-manager.ts`, `electron/preload/index.ts`,
  `electron/types/ipc.types.ts`, `src/types/electron.d.ts`,
  `docs/operations/agents/memory/decisions.md`,
  `progress/impl_strategy_learning_memory_graph.md`.
- Verification: strategy learning unit tests, combined strategy catalog +
  strategy learning tests, `npm run build`, `npm run gateway:restart`,
  `npm run gateway:probe`, real gateway learning GET smoke, temp HTTP
  create/list smoke, and final `npm run agent:check` passed.
- Status: ready for review. No live trading, credentials, routing, or
  promotion logic changed; Obsidian sync still preserves manual notes.

---

## 2026-05-07 - One Bitcoin Accumulation Strategy

- Agent: Codex
- Mission class: strategy research
- Summary: Added and refined `one_bitcoin`, a BTC-only spot accumulation
  strategy that compares monthly DCA, dip reserve, hybrid, aggressive dip,
  drawdown-weighted DCA, and research-only cycle-harvest variants toward
  maximizing final BTC owned.
- Evidence:
  `docs/strategies/one-bitcoin.md`,
  `backend/hyperliquid_gateway/strategies/one_bitcoin/`,
  `tests/test_one_bitcoin.py`,
  `backend/hyperliquid_gateway/data/backtests/one_bitcoin-one_bitcoin_btc_usd_daily-20260507T211002Z.json`,
  `backend/hyperliquid_gateway/data/validations/one_bitcoin-20260507T211009Z.json`,
  `progress/impl_one_bitcoin_strategy.md`.
- Verification: focused One Bitcoin tests, combined strategy catalog tests,
  `npm run hf:backtest -- --strategy one_bitcoin`, `npm run hf:status`,
  `git diff --check`, and final `npm run agent:check` passed. Validation wrote
  a blocked report and exited nonzero as expected because this is research-only
  accumulation, not an order-routing strategy.
- Status: ready for review. CoinGecko was attempted first but returned `401`
  without a key, so the local backtest used real Binance BTCUSDT daily fallback
  data. The refined report selects the highest-BTC variant as primary; monthly
  DCA won with `2.20097648 BTC`, while all dip and research-only sell/rebuy
  variants underperformed on final BTC in this sample.

---

## 2026-05-08 - Full Stack Resource Optimization

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Implemented the lightweight/on-demand/balanced optimization profile:
  lazy-loaded terminal/workbench/voice WebGL chunks, collapsed the voice
  workbench by default with persistence, moved manual polling to shared
  visibility/backoff polling, added aggregate station/liquidation endpoints,
  added a perf budget command, and centralized reduced-column snapshot loading
  with BTC optimizer dataset reuse.
- Evidence:
  `scripts/perf-budget.mjs`, `src/components/electron/ElectronLayout.tsx`,
  `src/features/cockpit/WidgetPanel.tsx`,
  `src/features/agents/components/MissionChatWorkbench.tsx`,
  `src/services/hyperliquidService.ts`, `src/services/liquidationsService.ts`,
  `backend/hyperliquid_gateway/app.py`,
  `backend/hyperliquid_gateway/backtesting/snapshots.py`,
  `backend/hyperliquid_gateway/strategies/btc_failed_impulse_reversal/optimizer.py`,
  `progress/impl_full_stack_resource_optimization.md`.
- Verification: `npm run build`, `npm run perf:budget`, focused backtest tests,
  full `python3 -m unittest discover tests`, BTC failed impulse 3-day backtest,
  BTC optimizer 3-variant 3-day run, `npm run hf:status`, `npm run gateway:probe`,
  `npm run backend:probe`, and FastAPI `TestClient` endpoint smoke passed.
- Status: ready for review. The initial renderer is now 590.09 KiB and the perf
  budget reports no `xterm` or `three` markers in it. The gateway was restarted
  and endpoint smoke returned 200 for existing and newly added routes.

---

## 2026-05-08 - App Daily Use Hardening

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Added a read-only app readiness snapshot and surfaced it in the
  header, Diagnostics, and Hedge Fund Station so daily startup shows gateway,
  cache, paper runtime, evidence, blockers, review coverage, memory, terminal,
  workbench, Obsidian, and live-execution lock status. Fixed visible inflated
  strategy counts by excluding `runtime:*` setup rows from real strategy totals
  in Hedge Fund Station and Strategy Audit Focus.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `src/services/hyperliquidService.ts`,
  `src/components/electron/BackendStatus.tsx`,
  `src/features/diagnostics/pages/DiagnosticsPage.tsx`,
  `src/features/stations/pages/HedgeFundStationPage.tsx`,
  `src/features/strategies/pages/StrategyAuditPage.tsx`,
  `progress/impl_app_daily_use_hardening.md`.
- Verification: `npm run agent:check`, `npm run build`,
  `python3 -m unittest discover tests`, `npm run perf:budget`,
  `npm run terminal:doctor`, `npm run hf:doctor`, `npm run hf:status`,
  `npm run gateway:probe`, `npm run backend:probe`, readiness HTTP smoke,
  Browser route smoke, and Electron smoke passed.
- Status: ready for review. Readiness remains `attention` because validation
  blockers and 0% paper review coverage are real operational work, not app
  failures. Live trading stayed monitor-only and production promotion remains
  blocked behind the formal gates.

---

## 2026-05-08 - Graphify Memory Repo Map

- Agent: Codex
- Mission class: repo health audit
- Summary: Integrated Graphify as a versionable repo navigation layer for the
  file harness and `/memory`, with stable npm scripts, ignore rules, generated
  `graphify-out/` artifacts, a read-only backend status endpoint, and a Repo
  Graph panel in the Memory page.
- Evidence:
  `.graphifyignore`, `scripts/graphify-check.mjs`,
  `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`,
  `graphify-out/graph.html`, `backend/hyperliquid_gateway/app.py`,
  `tests/test_graphify_memory_status.py`,
  `src/services/hyperliquidService.ts`,
  `src/features/memory/pages/MemoryGraphPage.tsx`,
  `progress/impl_graphify_memory_repo_map.md`.
- Verification: `npm run agent:check`, `npm run graph:build`,
  `npm run graph:check`,
  `npm run graph:query -- "how do harness memory and strategy learning connect?"`,
  `python3 -m unittest tests.test_graphify_memory_status`, `npm run build`, and
  `git diff --check` passed.
- Status: ready for review. `graph:build` uses Graphify's reliable local update
  path because the available Ollama `llama3.2:3b` semantic extraction produced
  invalid JSON warnings and stalled; semantic extraction can be revisited later
  with a stronger model or configured provider.
- Follow-up: fixed the reported Graphify 404 by restarting the stale gateway,
  adding `/api/hyperliquid/memory/graphify-status` to `gateway:probe`, adding a
  renderer stale-gateway hint, and correcting backend community counting for
  `community: 0`. Real endpoint smoke now returns `available=true`,
  `nodeCount=4516`, `edgeCount=8823`, and `communityCount=245`; `gateway:probe`,
  `/memory` dev HTTP smoke, focused tests, graph checks, build, harness, and
  diff check pass.
- Embedded follow-up: added `/api/hyperliquid/memory/graphify-html`, exposed
  `htmlUrl` in Graphify status, and embedded the generated Graphify HTML inside
  the `/memory` Repo Graph panel. Real HTML smoke returns inline `text/html`;
  current graph check reports `4519` nodes, `8828` edges, and `243` communities.
- Interactive follow-up: added `/api/hyperliquid/memory/graphify-explorer`,
  exposed `explorerUrl`, and made `/memory` embed the custom explorer before the
  raw generated HTML. The explorer uses `graphify-out/graph.json` with
  drag/zoom physics, search, focus, neighborhood mode, community and degree
  filters, labels, fit/reset, counts, and node detail. Real endpoint smoke,
  Browser direct search/focus smoke, gateway probe, focused tests, graph
  build/check/query, and app build passed; current graph check reports `4528`
  nodes, `8852` edges, and `245` communities.

---

## 2026-05-08 - Repo Cleanup Harness Simplification

- Agent: Codex
- Mission class: repo health audit
- Summary: Simplified the file harness queue from 29 stale review/blocked tasks
  to 7 focused tasks, moved bulky media/local editor state/generated evidence
  out of the tracked source surface, kept only curated backend fixtures, pruned
  unused direct dependencies, and regenerated Graphify against the cleaned
  corpus.
- Evidence:
  `agent_tasks.json`, `.gitignore`, `.graphifyignore`,
  `docs/operations/media-artifact-archive.md`,
  `backend/hyperliquid_gateway/data/README.md`, `package.json`,
  `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`,
  `graphify-out/graph.html`, and
  `progress/impl_repo_cleanup_harness_simplification.md`.
- Verification: `npm run agent:check`, `npm run agent:status`,
  `npm run build`, `npm run perf:budget`,
  `python3 -m unittest discover tests`, `npm run hf:doctor`,
  `npm run hf:backtest -- --strategy one_bitcoin`, `npm run graph:build`,
  `npm run graph:check`, and
  `npm run graph:query -- "what are the core repo surfaces after cleanup?"`
  passed before final diff check.
- Status: done. No backend API, IPC, strategy logic, renderer route,
  credentials, or order-routing behavior changed. `progress/current.md` is idle
  and recommends `confirm_hyperliquid_gateway_port_story` as the next task.

---

## 2026-05-08 - Graph Memory Operating System

- Agent: Codex
- Mission class: repo health audit
- Summary: Defined the Graphify, Obsidian, and file harness split as the agent
  memory operating model; added Graphify freshness metadata to the backend and
  `/memory`; created an Obsidian `Agent Navigation Index.md` during vault setup;
  and regenerated Graphify.
- Evidence:
  `docs/operations/agents/graph-memory-operating-system.md`, `AGENTS.md`,
  `docs/operations/agents/harness.md`,
  `docs/operations/agents/orientation.md`,
  `docs/operations/agents/memory/`, `backend/hyperliquid_gateway/app.py`,
  `src/features/memory/pages/MemoryGraphPage.tsx`,
  `src/services/hyperliquidService.ts`,
  `electron/main/native/obsidian-manager.ts`,
  `tests/test_graphify_memory_status.py`, `graphify-out/`, and
  `progress/impl_graph_memory_operating_system.md`.
- Verification: `npm run agent:check`,
  `python3 -m unittest tests.test_graphify_memory_status`, `npm run build`,
  `npm run graph:build`, `npm run graph:check`,
  `npm run graph:query -- "where should a new agent start for repo architecture work?"`,
  and `git diff --check` passed.
- Status: done. Graphify reports `dirty` while this uncommitted workspace is in
  review, which is expected; rebuild/check after commit if a clean committed
  graph baseline is needed.

---

## 2026-05-08 - Graphify Interaction UX

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Fixed the custom Graphify explorer interaction so node click
  selection updates inspector/highlighting without rebuilding the vis-network
  graph dataset. Added `Open Source` inspector actions, safe iframe-to-React
  source-open messaging, and neighborhood behavior that works after search.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `src/features/memory/pages/MemoryGraphPage.tsx`,
  `tests/test_graphify_memory_status.py`, and
  `progress/impl_graphify_interaction_ux.md`.
- Verification: `npm run agent:check`,
  `python3 -m unittest tests.test_graphify_memory_status`, `npm run build`,
  `npm run gateway:restart`, `npm run gateway:probe`, direct Browser smoke on
  `/api/hyperliquid/memory/graphify-explorer`, and `/memory` embed smoke
  passed.
- Status: done. Memory was intentionally unchanged because the durable Graphify
  operating split is already documented.

---

## 2026-05-08 - Graphify Performance Lite Physics

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Kept Graphify opening with the full repo graph while adding adaptive
  explorer profiles. The full 4,204 node / 6,699 edge view now uses the
  `all-lite` profile with lightweight `barnesHut` physics, straight edges,
  reduced detail, debounced controls, automatic long settling without requiring
  manual resume, and visible performance HUD metrics; smaller neighborhood
  views keep the richer look.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `tests/test_graphify_memory_status.py`, and
  `progress/impl_graphify_performance_lite_physics.md`.
- Verification: `npm run agent:check`,
  `python3 -m unittest tests.test_graphify_memory_status`, `npm run build`,
  `npm run gateway:restart`, `npm run gateway:probe`, `git diff --check`,
  direct Browser smoke on
  `/api/hyperliquid/memory/graphify-explorer`, and `/memory` iframe smoke
  passed.
- Status: done. Memory was intentionally unchanged because the durable
  Graphify, Obsidian, and file-harness split is already documented.

---

## 2026-05-08 - Graphify Restore Orbital Layout

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Restored the full Graphify default view to the original-style
  `forceAtlas2Based` gravitational/orbital layout after the performance profile
  made the final graph too dense. The explorer now uses `all-orbit` for the
  full 4,204 node / 6,699 edge graph, with dynamic edges, shadows, hover, and no
  full-graph pause/resume auto-freeze path, while preserving the click
  selection, inspector, Open Source, debounce, and HUD improvements.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `tests/test_graphify_memory_status.py`, and
  `progress/impl_graphify_restore_orbital_layout.md`.
- Verification: `npm run agent:check`,
  `python3 -m unittest tests.test_graphify_memory_status`, `npm run build`,
  `npm run gateway:restart`, `npm run gateway:probe`, `git diff --check`, and
  direct Browser smoke on `/api/hyperliquid/memory/graphify-explorer` passed.
- Status: done. Memory was intentionally unchanged because this is a local
  Graphify UX tuning decision.

---

## 2026-05-08 - Graphify Node Text Tooltips

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Replaced raw HTML node and edge hover titles with clean Graphify
  tooltip cards. Node hover now shows kind, file, location, community, graph
  links, source availability, and click/double-click guidance; edge hover shows
  relation context. Compact labels now prefer readable node names and fallback
  filenames for long path-heavy labels.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `tests/test_graphify_memory_status.py`, and
  `progress/impl_graphify_node_text_tooltips.md`.
- Verification: `npm run agent:check`,
  `python3 -m unittest tests.test_graphify_memory_status`, `npm run build`,
  `npm run gateway:restart`, `npm run gateway:probe`, `git diff --check`, and
  direct Browser smoke on `/api/hyperliquid/memory/graphify-explorer` passed.
- Status: done. Memory was intentionally unchanged because this is local
  Graphify UX polish.

---

## 2026-05-09 - Remove Marketing Surface

- Agent: Codex
- Mission class: repo health audit / UI review-speed audit
- Summary: Removed the unused campaign/autoblogger/LinkedIn/website Electron
  surface and public renderer contract, then preserved Gemini Live and direct
  loop through a neutral `hedge-fund-ai.json` config and `ai:*` IPC bridge.
- Evidence:
  `electron/main/native/ai-config-manager.ts`,
  `electron/main/native/marketing-automation.ts` deleted,
  `electron/main/index.ts`, `electron/main/ipc/ipc-handlers.ts`,
  `electron/preload/index.ts`, `src/types/electron.d.ts`,
  `src/features/settings/pages/SettingsPage.tsx`, and
  `progress/impl_remove_marketing_surface.md`.
- Verification: `npm run agent:check`, `npm run build`,
  source/build searches for removed marketing channels, and `git diff --check`
  passed. Live key-save smoke was skipped to avoid mutating local credentials.
- Status: done. Memory was intentionally unchanged because the backend-first
  cockpit boundary is already documented and this cleanup updates the relevant
  architecture docs directly.

---

## 2026-05-11 - BTC YouTube Stream Focus Fix

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Replaced `/btc` YouTube embed streams with focused first-party watch
  webviews to avoid error `152-4`, injected CSS/JS to hide YouTube page chrome
  and make the player fill the panel, kept mute reinforcement, and switched
  external-open links to watch URLs.
- Evidence:
  `src/features/cockpit/pages/BtcAnalysisPage.tsx`,
  `progress/impl_btc_youtube_stream_focus_fix.md`, `agent_tasks.json`, and
  `progress/current.md`.
- Verification: `rtk npm run build`, `rtk git diff --check`, and
  `rtk npm run agent:check` passed. Source search confirms `/btc` no longer
  uses a YouTube embed path. `rtk npx tsc --noEmit` still fails on existing
  non-BTC errors and reports no BTC page errors.
- Status: done. Backend Pine endpoint, strategy logic, paper runtime,
  credentials, and order routing were not changed.

---

## 2026-05-11 - BTC Layout Flexibility Polish

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Refined `/btc` so the workbench feels more moldable: the layout now
  uses a v2 24-column grid with smaller row height, tighter margins,
  video/TV/mosaic presets, edit-mode +/- controls per panel, and larger visible
  resize handles for corner, right-edge, and bottom-edge resizing.
- Evidence:
  `src/features/cockpit/pages/BtcAnalysisPage.tsx`,
  `progress/impl_btc_layout_flexibility_polish.md`, `agent_tasks.json`, and
  `progress/current.md`.
- Verification: `rtk npm run build`, `rtk git diff --check`, and
  `rtk npm run agent:check` passed. `rtk npx tsc --noEmit` still fails on
  existing non-BTC errors and reports no BTC page errors.
- Status: done. YouTube error 152-4 was intentionally left out of scope.

---

## 2026-05-10 - BTC Flexible Workbench

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Rebuilt `/btc` as a configurable workbench with persisted
  drag/resize layout, edit/lock and reset controls, video visibility toggles,
  muted clean YouTube embeds, and Pine AI Lab as a hidden drawer that can be
  pinned into the board.
- Evidence:
  `src/features/cockpit/pages/BtcAnalysisPage.tsx`, `package.json`,
  `package-lock.json`, `agent_tasks.json`, `progress/current.md`, and
  `progress/impl_btc_flexible_workbench.md`.
- Verification: `rtk npm run build`, `rtk npm run agent:check`,
  `rtk git diff --check`, and a `/btc` renderer shell probe passed.
  `rtk npx tsc --noEmit` still fails on existing non-BTC errors. Full visual
  smoke remains manual because Browser/Playwright automation was unavailable.
- Status: done. UI-only change; backend Pine endpoint, strategy logic, paper
  runtime, credentials, and order routing were not changed.

---

## 2026-05-10 - Strategy Memory Graph Explorer

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Replaced the dense lower `/memory` strategy/memory surface with an
  interactive Graphify-style Strategy Evidence Graph backed by local
  `vis-network`. The explorer defaults to actionable strategy paths, supports
  search, strategy and learning lenses, evidence filters, Focus, Neighborhood,
  Labels, Physics, Fit, Reset, node inspection, and an Agent Path section with
  missing evidence, source/evidence paths, and suggested stable `hf:*` commands.
- Evidence:
  `src/features/memory/pages/MemoryGraphPage.tsx`,
  `src/features/memory/components/StrategyMemoryGraphExplorer.tsx`,
  `src/features/memory/memoryGraphTypes.ts`,
  `electron/main/native/obsidian-manager.ts`,
  `docs/operations/agents/graph-memory-operating-system.md`,
  `src/features/README.md`, `graphify-out/GRAPH_REPORT.md`, and
  `progress/impl_strategy_memory_graph_explorer.md`.
- Verification: `npm run build`, `npm run graph:build`,
  `npm run graph:check`, `npm run agent:check`, `git diff --check`, and
  desktop/mobile `/memory` visual smoke passed.
- Status: done. Memory rule promoted into
  `docs/operations/agents/graph-memory-operating-system.md`; backend docs,
  backend artifacts, and the file harness remain canonical truth.

---

## 2026-05-10 - RTK Repo Context Cleanup

- Agent: Codex
- Mission class: repo health audit
- Summary: Finished active cleanup for the retired content-growth surface,
  pruned stale local worktree metadata, renamed the current branch to
  `codex/rtk-repo-context-cleanup`, configured local Codex RTK instructions with
  `RTK.md` and the official `@RTK.md` include in `AGENTS.md`, and updated core
  agent docs so future shell commands prefer `rtk <command>` with raw-output
  escape hatches.
- Evidence:
  `AGENTS.md`, `RTK.md`, `docs/operations/agents/harness.md`,
  `docs/operations/agents/file-harness.md`,
  `docs/operations/agents/orientation.md`,
  `docs/operations/agents/graph-memory-operating-system.md`,
  `docs/operations/agents/memory/shared-memory.md`,
  `docs/operations/agents/memory/decisions.md`, `scripts/agent_harness.py`,
  `agent_tasks.json`, `progress/current.md`, and
  `progress/impl_rtk_repo_context_cleanup.md`.
- Verification: `rtk npm run agent:check`, `rtk npm run agent:brief`,
  `rtk init --codex --show`, `rtk --version`, `rtk gain`,
  active source searches for retired surface terms, `rtk npm run build`, and
  `rtk git diff --check` passed. Filename search found only the historical
  cleanup handoff, which was intentionally preserved.
- Status: done. Memory added for the RTK operating decision. No trading
  behavior, backend strategy logic, credentials, or broker/order side effects
  changed.

---

## 2026-05-10 - Caveman Output-Only Agent Style

- Agent: Codex
- Mission class: repo health audit
- Summary: Added `CAVEMAN.md` as an output-only instruction layer for compact
  user-facing agent replies, included it from `AGENTS.md`, updated
  `agent:brief` to list it, and documented that Caveman must not rewrite repo
  memory, compress strategy docs, install MCP shrink, or add global hooks
  without explicit human approval.
- Evidence:
  `CAVEMAN.md`, `AGENTS.md`, `scripts/agent_harness.py`,
  `docs/operations/agents/harness.md`,
  `docs/operations/agents/orientation.md`,
  `docs/operations/agents/memory/shared-memory.md`,
  `docs/operations/agents/memory/decisions.md`,
  `progress/impl_caveman_output_only_agent_style.md`, and refreshed
  `graphify-out/`.
- Verification: `rtk npm run agent:check`, `rtk npm run agent:brief`,
  `rtk npm run build`, `rtk npm run graph:build`, `rtk npm run graph:check`,
  Caveman reference search, and `rtk git diff --check` passed.
- Status: done. Memory updated by folding Caveman into the existing
  token-discipline decision. No context/memory compression, global hooks,
  backend strategy logic, credentials, or broker/order side effects changed.

---

## 2026-05-11 - Calendar Compact Desk Redesign

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Rebuilt `/calendar` as a compact macro review desk with a sticky top
  strip, week/hour concentration map, dense event table, Focus/All/impact,
  currency, search, and time-bucket filters, compact alert chips, and right rail
  tabs for Brief, Checklist, News, and Holidays.
- Evidence:
  `src/features/cockpit/pages/EconomicCalendarPage.tsx`,
  `progress/impl_calendar_compact_desk_redesign.md`, and
  `progress/current.md`.
- Verification: `rtk npm run build` and `rtk git diff --check` passed. Desktop
  Electron smoke on `/calendar` passed for layout, cell filtering, and Low
  filter behavior. Narrow headless smoke was partial because Chrome captured the
  app shell spinner before route content loaded.
- Status: done. UI-only change; backend API contracts, strategy logic, paper
  runtime, credentials, and order routing were not changed.

---

## 2026-05-11 - Calendar Local Timezone Display

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Added a persisted `Time` selector to `/calendar` so the operator can
  review macro events in their local timezone. Default is the browser/system
  timezone with `America/Santiago` fallback; the map, table, Today/Tomorrow
  counts, search text, and stand-aside fallback rows now derive from the selected
  timezone.
- Evidence:
  `src/features/cockpit/pages/EconomicCalendarPage.tsx`,
  `progress/impl_calendar_local_timezone_display.md`, and
  `progress/current.md`.
- Verification: `rtk npm run build` passed. Electron `/calendar` smoke showed
  `Time: Chile`, local event times, and the existing compact map/table layout.
  Raw `curl` was used once to inspect exact calendar `date_time` payloads
  because RTK compresses JSON values.
- Status: done. UI-only change; backend API contracts, strategy logic, paper
  runtime, credentials, IPC, and order routing were not changed.

---

## 2026-05-11 - Calendar Warning Density Polish

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Compressed `/calendar` warning presentation so useful calendar data
  appears sooner. Large raw notices were replaced with compact status pills,
  technical warning text was filtered out of the primary summary, and warning,
  critical-day, and stand-aside details moved into the right rail.
- Evidence:
  `src/features/cockpit/pages/EconomicCalendarPage.tsx`,
  `progress/impl_calendar_warning_density_polish.md`, and
  `progress/current.md`.
- Verification: `rtk npm run build` passed. Electron `/calendar` smoke showed
  compact top-strip status pills and the week/hour map immediately below the
  top strip.
- Status: done. UI-only change; backend API contracts, strategy logic, paper
  runtime, credentials, IPC, and order routing were not changed.

---

## 2026-05-11 - Memory Route Split

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Split the Strategy Memory and Graphify surfaces so `/memory` loads
  only strategy catalog, learning events, and Obsidian graph data, while the
  new `/repo-graph` route owns Graphify status, artifact actions, and iframe
  mounting.
- Evidence:
  `src/features/memory/pages/MemoryGraphPage.tsx`,
  `src/features/memory/pages/RepoGraphPage.tsx`,
  `src/features/cockpit/WidgetPanel.tsx`, `src/pages/index.ts`,
  `src/features/README.md`,
  `docs/operations/agents/graph-memory-operating-system.md`,
  `graphify-out/`, `progress/impl_memory_route_split.md`, and harness updates.
- Verification: `rtk npm run agent:check`, `rtk npm run build`, and
  `rtk git diff --check` passed. `rtk npm run graph:build` regenerated
  Graphify to 4298 nodes, 6867 edges, and 249 communities; `rtk npm run
  graph:check` passed. Chrome headless smoke confirmed `/memory` made no
  Graphify requests and mounted 0 Graphify iframes, while `/repo-graph`
  requested Graphify status/explorer and mounted 1 iframe.
- Status: done. UI/docs/harness change only; backend Graphify endpoints,
  readiness route to `/memory`, strategy logic, paper runtime, credentials,
  IPC contracts, and order routing were not changed.

---

## 2026-05-11 - Graphify Full Graph Fluency

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Optimized `/repo-graph` full-graph rendering without dropping the
  gravity/orbital feel. The complete graph now uses deterministic
  community/globe-seeded `world-orbit`, longer bounded `forceAtlas2Based`
  settling, restored old-style central gravity/spring/damping behavior, an
  expanded orbital seed shell, explicit complete stabilization, final
  auto-framing with post-fit scale-out, polished visuals after settle, a light
  ambient orbital flow, and in-place label toggles instead of full dataset
  rebuilds. The control is `Reflow`, not a pause/resume toggle.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `tests/test_graphify_memory_status.py`,
  `progress/impl_graphify_full_graph_fluency.md`, and `progress/current.md`.
- Verification: `rtk npm run agent:check`, targeted Graphify unittest,
  `rtk npm run build`, `rtk npm run gateway:restart`, `rtk npm run
  gateway:probe`, and `rtk git diff --check` passed. Browser smoke confirmed
  4,298 nodes, 6,867 edges, profile `world-orbit`, canvas present, ambient
  flow overlay present, initial `settling`, final `flowing`, button `Reflow`,
  no Frozen/Resume UI, no console errors, and working Search, Focus,
  Neighborhood, Labels, Fit, Reset, and Open Source visibility.
- Status: done. `graphify-out/` was intentionally unchanged; backend Graphify
  status contracts, renderer service types, strategy logic, paper runtime,
  credentials, IPC contracts, and order routing were not changed.

---

## 2026-05-12 - Compact Vertical Navigation

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Replaced the crowded horizontal route tabs with a fixed 52px left
  rail, moved route metadata into a lightweight shared module, moved
  `BrowserRouter` up to the app shell, kept the existing workspace sidebar as a
  separate collapsible panel, preserved route lifecycle telemetry, and
  compressed the `Hedge Fund Station` header into a 34px status strip.
- Evidence:
  `src/components/electron/AppNavRail.tsx`,
  `src/features/cockpit/navigation.ts`,
  `src/components/electron/ElectronLayout.tsx`,
  `src/features/cockpit/WidgetPanel.tsx`, `src/App.tsx`, and
  `progress/impl_compact_vertical_navigation.md`.
- Verification: `rtk npm run build`, `rtk npm run perf:budget`,
  `rtk npm run agent:check`, and `rtk git diff --check` passed. Browser smoke
  at `http://localhost:5173` confirmed 18 route buttons plus brand link, no
  horizontal content tabs, default route with 0 webviews, `/btc` with 4 webviews
  and the `3 videos` control, working workspace collapse/expand, and working
  route click to `/settings`.
- Status: done. `/btc` still preserves TradingView plus all three streams by
  default. Backend trading logic, strategy logic, paper runtime, credentials,
  IPC trading contracts, and order routing were not changed.

---

## 2026-05-12 - Graphify Full Graph Fluency Continuation

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Continued the interrupted `/repo-graph` performance/gravity task and
  confirmed the restored `world-orbit` gravity animation was already complete.
  No code changes were required; only the handoff/current/history evidence was
  refreshed with today's verification.
- Evidence:
  `backend/hyperliquid_gateway/app.py`,
  `tests/test_graphify_memory_status.py`,
  `progress/impl_graphify_full_graph_fluency.md`, and `progress/current.md`.
- Verification: `rtk npm run agent:brief`, `rtk npm run agent:check`,
  targeted Graphify unittest, `rtk npm run build`, `rtk npm run
  gateway:restart`, `rtk npm run gateway:probe`, and browser smoke passed.
  Browser smoke confirmed 4,298 nodes, 6,867 edges, profile `world-orbit`,
  `settling` to `flowing`, no Frozen/Resume UI, no console errors, and working
  Search, Focus, Neighborhood, Labels, Fit, Reset, and Open Source visibility.
- Status: done. `graphify-out/` was intentionally unchanged; backend Graphify
  status contracts, renderer service types, strategy logic, paper runtime,
  credentials, IPC contracts, and order routing were not changed.

---

## 2026-05-12 - BTC Daily Performance Automation

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Optimized `/btc` while preserving the operator's preferred default:
  TradingView plus all three YouTube streams visible. Added `Focus` mode to load
  only TradingView plus one selected stream, split Pine AI Lab and
  `lightweight-charts` into a lazy chunk, removed the permanent YouTube mute
  interval, added best-effort webview cleanup, and extended local telemetry with
  `webview` and `fps` events.
- Evidence:
  `src/features/cockpit/pages/BtcAnalysisPage.tsx`,
  `src/features/cockpit/pages/BtcPineLabPanel.tsx`,
## 2026-05-13 - Dual Hyperliquid Strategy Candidates

- Agent: Codex
- Mission class: strategy research
- Summary: Added two backend-first Hyperliquid candidates:
  `breakout_oi_confirmation` for OI-confirmed breakout continuation and
  `liquidation_pressure_flip_reversal` for stretched liquidation-pressure
  reversals. Both have docs, backend deterministic logic/scoring/risk/paper/
  backtest modules, registry entries, validation thresholds, readiness rows, and
  focused synthetic tests. No paper runtime loop, credential change, live
  trading, or production promotion occurred.
- Evidence:
  `docs/strategies/breakout-oi-confirmation.md`,
  `docs/strategies/liquidation-pressure-flip-reversal.md`,
  `backend/hyperliquid_gateway/strategies/breakout_oi_confirmation/`,
  `backend/hyperliquid_gateway/strategies/liquidation_pressure_flip_reversal/`,
  `backend/hyperliquid_gateway/backtesting/registry.py`,
  `tests/test_breakout_oi_confirmation.py`,
  `tests/test_liquidation_pressure_flip_reversal.py`,
  `backend/hyperliquid_gateway/data/backtests/breakout_oi_confirmation-initial.json`,
  `backend/hyperliquid_gateway/data/backtests/liquidation_pressure_flip_reversal-initial.json`,
  `backend/hyperliquid_gateway/data/validations/breakout_oi_confirmation-20260513T142258Z.json`,
  `backend/hyperliquid_gateway/data/validations/liquidation_pressure_flip_reversal-20260513T142258Z.json`,
  and `progress/impl_dual_hyperliquid_strategy_candidates.md`.
- Verification: harness check, strategy catalog tests, new strategy tests,
  initial backtests, build, `hf:status`, diff check, and Python compile checks
  passed. Validation reports were generated and blocked as expected.
- Status: done. `breakout_oi_confirmation` had 52 trades but failed return,
  profit factor, win rate, and robust gates. `liquidation_pressure_flip_reversal`
  had only 2 losing trades and failed sample/profitability gates.

---

  `src/services/performanceTelemetry.ts`,
  `progress/impl_btc_daily_performance_automation.md`, and
  `progress/current.md`.
- Verification: `rtk npm run build`, `rtk npm run perf:budget`,
  `rtk npm run agent:check`, and `rtk git diff --check` passed. Browser smoke
  on `/btc` confirmed default reload mounts 4 webviews, Focus mode mounts 2,
  and restoring all videos mounts 4. BTC route chunk improved from baseline
  `435.25 KB` to `188.29 KB`; Pine Lab is now a separate `256.59 KB` lazy
  chunk.
- Status: done. UI performance behavior only; no backend APIs, strategy logic,
  paper runtime, credentials, IPC contracts, or order routing changed.

---

## 2026-05-12 - Daily Light Performance Optimization

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Added a default `daily-light` performance profile, profile-aware
  polling, collapsed-sidebar polling suppression, diagnostics data-footprint
  warnings, and stricter performance budget guards. After operator correction,
  `/btc` now preserves the required trading default of TradingView plus all
  three YouTube streams visible, with `Focus` kept as a manual low-load fallback.
  Hidden/minimized webviews suspend to `about:blank` without rewriting the saved
  three-video layout, the frame guard now waits for warmup plus sustained severe
  pressure before reducing media, route changes clean up media guests, and
  terminal voice input is opt-in so Gemini voice does not load on normal
  terminal navigation.
- Evidence:
  `src/utils/appSettings.ts`, `src/hooks/usePerformanceProfile.ts`,
  `src/hooks/useMarketPolling.ts`, `src/features/cockpit/pages/BtcAnalysisPage.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/features/diagnostics/pages/DiagnosticsPage.tsx`,
  `electron/main/native/diagnostics-manager.ts`,
  `scripts/perf-budget.mjs`, and
  `progress/impl_daily_light_performance_optimization.md`.
- Verification: `rtk npm run build`, `rtk npm run perf:budget`,
  `rtk npm run agent:check`, and `rtk git diff --check` passed. Budget reported
  the initial renderer chunk at `472.15 KB`, no heavy initial markers, BTC
  three-video default guard, hidden webview suspension guard, Gemini voice
  opt-in guard, data dir `723.81 MB`, and `hyperliquid.db` `714.67 MB`. Live
  Electron smoke confirmed `/btc` shows `3 videos · 3 mounted`; navigating away
  from `/btc` removed extra media renderers and dropped GPU CPU to `0.0%` in the
  process sample.
- Status: done. Backend trading logic, strategy logic, paper runtime,
  credentials, IPC trading contracts, and order routing were not changed.

## 2026-05-13 - BTC Adaptive Cycle Trend

- Agent: Codex
- Mission class: strategy research
- Summary: Added `btc_adaptive_cycle_trend`, a backend-first BTC daily strategy
  that keeps the guarded-cycle entry/exit structure and uses adaptive exposure:
  `20%` only in strong daily regimes, `10%` in the base regime, no shorts, and
  no leverage. It beat the paper-ready `btc_guarded_cycle_trend` 500 USD
  benchmark.
- Evidence:
  `docs/strategies/btc-adaptive-cycle-trend.md`,
  `backend/hyperliquid_gateway/strategies/btc_adaptive_cycle_trend/`,
  `backend/hyperliquid_gateway/backtesting/registry.py`,
  `backend/hyperliquid_gateway/app.py`,
  `docs/operations/strategy-validation-thresholds.md`,
  `docs/operations/strategy-readiness-matrix.md`,
  `tests/test_btc_adaptive_cycle_trend.py`,
  `backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T183751Z.json`,
  `backend/hyperliquid_gateway/data/backtests/btc_adaptive_cycle_trend-btc_usd_daily_yahoo-20260513T183755Z.json`,
  `backend/hyperliquid_gateway/data/validations/btc_adaptive_cycle_trend-20260513T183803Z.json`,
  `backend/hyperliquid_gateway/data/paper/btc_adaptive_cycle_trend-20260513T183807Z.json`,
  `backend/hyperliquid_gateway/data/audits/btc_adaptive_cycle_trend-doubling-stability-20260513T183812Z.json`,
  and `progress/impl_btc_adaptive_cycle_trend.md`.
- Verification: refreshed BTC daily history to 4,257 rows from 2014-09-17
  through 2026-05-13, reran the benchmark at `89.53%`, ran the new official
  500 USD backtest at `94.39%`, validated `ready-for-paper`, generated paper
  candidate, stability audit returned `stable`, restarted the stale local
  gateway, and dry-run paper loop passed with no opened trade. Focused tests,
  `hf:status`, and harness check passed.
- Status: ready for review. Production/live execution remains blocked behind
  paper journal evidence, regime review, risk review, operator sign-off,
  monitoring, and rollback planning.

---

## 2026-05-13 - BTC Fee-Aware Failed Impulse Scalp

- Agent: Codex
- Mission class: strategy research
- Summary: Repaired the stale `btc_momentum_oi_swing_benchmark` handoff by
  adding `btc_fee_aware_failed_impulse_scalp`, a BTC-only failed-impulse fade
  candidate that requires trapped-leverage context, valid OI/funding/crowding/
  setup inputs, no extreme 4h overextension, and fee-aware expected-move
  clearance. Added backend logic, scoring, risk, paper, backtest, docs, registry
  entry, validation threshold/readiness rows, and focused tests. No paper
  runtime loop, credential change, live trading, or production promotion
  occurred.
- Evidence:
  `docs/strategies/btc-fee-aware-failed-impulse-scalp.md`,
  `backend/hyperliquid_gateway/strategies/btc_fee_aware_failed_impulse_scalp/`,
  `backend/hyperliquid_gateway/backtesting/registry.py`,
  `docs/operations/strategy-validation-thresholds.md`,
  `docs/operations/strategy-readiness-matrix.md`,
  `tests/test_btc_fee_aware_failed_impulse_scalp.py`,
  `backend/hyperliquid_gateway/data/backtests/btc_fee_aware_failed_impulse_scalp-hyperliquid-20260513T150908Z.json`,
  `backend/hyperliquid_gateway/data/validations/btc_fee_aware_failed_impulse_scalp-20260513T150918Z.json`,
  and `progress/impl_btc_fee_aware_failed_impulse_scalp.md`.
- Verification: harness check, new strategy tests, catalog/filter/fee tests,
  `hf:status`, build, and diff check passed. The 3-day local taker backtest
  returned `-0.09%` over 5 trades, with BTC hold at `-0.80%` and excess vs BTC
  hold at `+0.71%`; validation blocked it for insufficient sample, negative net
  return, weak profit factor, and weak average net trade return.
- Status: done. VM BTC data only spans about 10.72 days
  (`2026-05-02T21:59:54Z` to `2026-05-13T15:09:37Z`), so required 30/60/90 day
  VM backtests were skipped as a data-quality blocker.

---

## 2026-05-13 - BTC Guarded Cycle Trend

- Agent: Codex
- Mission class: strategy research
- Summary: Added `btc_guarded_cycle_trend`, a backend-first BTC daily trend
  strategy using close > SMA150, SMA50 > SMA150, RSI14 > 42, 10% max exposure,
  and exits on 15% close drawdown from trade peak, slow-trend break, or crash
  guard. Registered it with a `50%` minimum return validation gate and paper
  candidate path.
- Evidence:
  `docs/strategies/btc-guarded-cycle-trend.md`,
  `backend/hyperliquid_gateway/strategies/btc_guarded_cycle_trend/`,
  `backend/hyperliquid_gateway/backtesting/registry.py`,
  `backend/hyperliquid_gateway/app.py`,
  `tests/test_btc_guarded_cycle_trend.py`,
  `backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T171411Z.json`,
  `backend/hyperliquid_gateway/data/validations/btc_guarded_cycle_trend-20260513T171421Z.json`,
  `backend/hyperliquid_gateway/data/paper/btc_guarded_cycle_trend-20260513T171426Z.json`,
  `backend/hyperliquid_gateway/data/audits/btc_guarded_cycle_trend-doubling-stability-20260513T171436Z.json`,
  and `progress/impl_btc_guarded_cycle_trend.md`.
- Verification: BTC daily cache refreshed with 4,257 Yahoo rows from
  2014-09-17 through 2026-05-13. Official taker-fee backtest returned `89.53%`
  net return, 48 trades, `41.67%` win rate, `2.93` profit factor, `8.79%` max
  drawdown, and robust gate `passes`. Validation returned `ready-for-paper`.
  `hf:paper` generated a paper candidate. Doubling stability returned `stable`
  with 100% positive slices. Dry-run paper loop tick succeeded with
  `flat-no-signal` and no paper trade writes. Build, gateway probe, focused
  tests, harness, and diff checks passed.
- Status: done. This is paper-candidate evidence only. No live routing,
  credential change, production promotion, or non-dry-run paper supervisor start
  occurred.

---

## 2026-05-13 - BTC 500 USD Validated Profile

- Agent: Codex
- Mission class: strategy research
- Summary: Added the official `500_usd_validated` profile for
  `btc_guarded_cycle_trend`: `500 USD` initial equity, `10%` exposure, taker
  fees, no leverage, no shorts, one matching BTC paper position. Generated
  official 500 USD backtest, validation, paper candidate, and stability audit
  evidence and narrow `.gitignore` exceptions for those artifacts. Added
  runtime test coverage for `50 USD` sizing and duplicate position blocking.
  Leverage remains research-only behind separate audits.
- Evidence:
  `docs/strategies/btc-guarded-cycle-trend.md`,
  `backend/hyperliquid_gateway/strategies/btc_guarded_cycle_trend/spec.md`,
  `tests/test_btc_guarded_cycle_trend.py`,
  `.gitignore`,
  `backend/hyperliquid_gateway/data/backtests/btc_guarded_cycle_trend-btc_usd_daily_yahoo-20260513T181241Z.json`,
  `backend/hyperliquid_gateway/data/validations/btc_guarded_cycle_trend-20260513T181246Z.json`,
  `backend/hyperliquid_gateway/data/paper/btc_guarded_cycle_trend-20260513T181250Z.json`,
  `backend/hyperliquid_gateway/data/audits/btc_guarded_cycle_trend-doubling-stability-20260513T181253Z.json`,
  and `progress/impl_btc_500_usd_validated_profile.md`.
- Verification: focused tests passed. Official 500 USD taker-fee backtest
  returned `89.53%` net return, final equity `947.65 USD`, `48` trades,
  `41.67%` win rate, `2.93` profit factor, `8.79%` max drawdown, and robust
  gate `passes`. Validation returned `ready-for-paper`, paper candidate was
  generated, stability audit returned `stable`, and `hf:status` points to the
  new artifacts.
- Status: ready for review. No live routing, credential change, production
  promotion, or leverage implementation occurred.

---

## 2026-05-13 - Daily Strategy Factory Automation

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Created a local Codex `Daily Hedge Fund Strategy Factory` automation
  for daily 02:30, configured it to use `gpt-5.5` with `xhigh` reasoning, and
  moved the general nightly improvement automation to daily 03:30. Updated the
  automation operating docs and curated decision memory so future agents know
  the new cadence.
- Evidence:
  `/Users/optimus/.codex/automations/daily-hedge-fund-strategy-factory/automation.toml`,
  `/Users/optimus/.codex/automations/nightly-hedge-fund-station-improvement/automation.toml`,
  `docs/operations/agents/automation-system.md`,
  `docs/operations/agents/memory/decisions.md`,
  `progress/current.md`, and
  `progress/impl_daily_strategy_factory_automation.md`.
- Verification: startup checks passed with `rtk npm run agent:brief`,
  `rtk npm run agent:check`, `rtk npm run graph:status`, and
  `rtk npm run hf:status`. Graphify was rebuilt and `rtk npm run graph:check`
  passed. The factory behavior test concluded it should produce report-only
  output on the current dirty worktree rather than creating a new strategy.
- Status: done. No live trading, order routing, credential changes,
  production promotion, or immediate strategy generation occurred.

---

## 2026-05-13 - BTC Daily Yahoo History Backtesting

- Agent: Codex
- Mission class: data quality audit
- Summary: Added a shared backend BTC/USD daily history loader and cache
  workflow for long-horizon backtests. Yahoo Finance `BTC-USD` is the primary
  source, Binance BTCUSDT daily candles are the auto fallback, and the stable
  command is `npm run hf:market-data:btc-daily`. The existing One Bitcoin daily
  backtest now reuses the shared loader instead of owning inline market-data
  fetch code.
- Evidence:
  `backend/hyperliquid_gateway/backtesting/btc_daily_history.py`,
  `backend/hyperliquid_gateway/cli.py`,
  `package.json`,
  `backend/hyperliquid_gateway/strategies/one_bitcoin/backtest.py`,
  `backend/hyperliquid_gateway/strategies/one_bitcoin/spec.md`,
  `docs/strategies/one-bitcoin.md`,
  `backend/hyperliquid_gateway/data/README.md`,
  `tests/test_btc_daily_history.py`,
  `backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json`,
  `backend/hyperliquid_gateway/data/backtests/one_bitcoin-btc_usd_daily_yahoo-20260513T152722Z.json`,
  and `progress/impl_btc_daily_yahoo_history_backtesting.md`.
- Verification: catalog/BTC daily/One Bitcoin tests passed, py_compile passed,
  Yahoo 2020-01-01 through 2020-01-10 fetch produced 10 exact daily rows,
  multi-year Yahoo cache produced 4,257 rows from 2014-09-17 through
  2026-05-13, One Bitcoin consumed the multi-year cache, `hf:status` passed,
  harness check passed, and diff check passed.
- Status: done. Daily BTC candles are approved for daily/long-horizon
  backtests and BTC benchmarks only; intraday scalp validation still requires
  Hyperliquid snapshot history with OI, funding, crowding, order book, and
  replay context.

---

## 2026-05-12 - Deep Daily Performance Optimization

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Continued performance work without removing trading information.
  `/btc` still defaults to TradingView plus all three videos. Electron now uses
  a single media request-blocking pipeline for `persist:youtube` and
  `persist:tradingview`, combining local ad/tracker rules with the Ghostery
  engine in the same callback so Electron `webRequest` listeners do not
  overwrite each other. BTC videos now get profile-aware YouTube playback
  quality hints instead of being hidden, Diagnostics exposes Electron process
  CPU/RSS via `app.getAppMetrics()`, and `perf:budget` guards the new blockers
  and quality control.
- Evidence:
  `electron/main/index.ts`,
  `src/features/cockpit/pages/BtcAnalysisPage.tsx`,
  `electron/main/native/diagnostics-manager.ts`,
  `src/features/diagnostics/pages/DiagnosticsPage.tsx`,
  `scripts/perf-budget.mjs`, and
  `progress/impl_deep_daily_performance_optimization.md`.
- Verification: `rtk npm run build`, `rtk npm run perf:budget`,
  `rtk npm run agent:check`, and `rtk git diff --check` passed. Budget reported
  initial renderer `472.15 KB`, no forbidden heavy markers, BTC three-video
  default guard, hidden webview suspension guard, Gemini voice opt-in guard,
  media request blocker guard, and YouTube quality control guard. `rtk npx tsc
  --noEmit` still fails on existing unrelated repo errors; the new diagnostics
  CPU type error found during this pass was fixed. Dev app was started at
  `http://localhost:5173`; idle startup process sample showed Electron main,
  GPU, network utility, and renderer at `0.0%` CPU.
- Status: done. Backend trading logic, strategy logic, paper runtime,
  credentials, IPC trading contracts, and order routing were not changed.

---

## 2026-05-14 - Daily Strategy Factory Automation Review

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Reviewed the active `Daily Hedge Fund Strategy Factory`
  automation, its first scheduled report-only run, and the `hf:strategy:new`
  scaffold boundary. Confirmed the automation is active at daily 02:30 with
  `gpt-5.5` and `xhigh`, and that the first run correctly avoided creating a
  strategy when replay data readiness was uncertain.
- Changes: added read-only Hyperliquid SQLite replay readiness checks to
  `hf:doctor`; updated the local Codex automation prompt to run `hf:doctor`
  before SQLite replay backtests; aligned
  `docs/operations/agents/automation-system.md`; wrote
  `progress/review_daily_strategy_factory_automation.md`.
- Evidence:
  `backend/hyperliquid_gateway/cli.py`,
  `docs/operations/agents/automation-system.md`,
  `/Users/optimus/.codex/automations/daily-hedge-fund-strategy-factory/automation.toml`,
  `/Users/optimus/.codex/automations/daily-hedge-fund-strategy-factory/memory.md`,
  and `progress/review_daily_strategy_factory_automation.md`.
- Verification: `rtk npm run agent:check`, `rtk npm run hf:doctor`,
  `rtk python3 -m py_compile backend/hyperliquid_gateway/cli.py`,
  `rtk python3 -m unittest tests.test_strategy_catalog`,
  `rtk npm run hf:status`, and `rtk git diff --check` passed.
- Status: done. No live trading, order routing, credential changes, production
  promotion, or new strategy scaffold was created.

---

## 2026-05-14 - Strategy Factory Full-Cycle Automation

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Hardened the daily strategy automation cadence so the 02:30 factory
  defaults to creating or materially improving one backend-first strategy
  candidate end-to-end, then testing, backtesting, validating, comparing against
  the comparable champion, generating paper candidate evidence when eligible,
  and preparing only a blocked live-gate package if evidence later supports
  live review. Hardened the 03:30 automation to follow up on the latest factory
  output or highest-upside validation blocker instead of drifting to generic
  cleanup.
- Evidence:
  `/Users/optimus/.codex/automations/daily-hedge-fund-strategy-factory/automation.toml`,
  `/Users/optimus/.codex/automations/nightly-hedge-fund-station-improvement/automation.toml`,
  `docs/operations/agents/automation-system.md`,
  `docs/operations/agents/memory/decisions.md`,
  `progress/current.md`, and
  `progress/impl_strategy_factory_full_cycle_automation.md`.
- Verification: automation configs were inspected after update. Final harness
  and diff checks are recorded in the handoff. No live routing, credential
  change, non-dry-run supervisor start, or production promotion occurred.

---

## 2026-05-14 - BTC Convex Cycle Trend Factory Smoke

- Agent: Codex
- Mission class: strategy research
- Summary: Ran a manual implementation-first factory smoke and created
  `btc_convex_cycle_trend` as a backend-first BTC daily strategy candidate. The
  strategy uses larger partial exposure only when BTC daily trend, RSI,
  drawdown, and 30-day momentum filters align.
- Evidence:
  `docs/strategies/btc-convex-cycle-trend.md`,
  `backend/hyperliquid_gateway/strategies/btc_convex_cycle_trend/`,
  `backend/hyperliquid_gateway/backtesting/registry.py`,
  `tests/test_btc_convex_cycle_trend.py`,
  `backend/hyperliquid_gateway/data/backtests/btc_convex_cycle_trend-btc_usd_daily_yahoo-20260514T145140Z.json`,
  `backend/hyperliquid_gateway/data/validations/btc_convex_cycle_trend-20260514T145222Z.json`,
  `backend/hyperliquid_gateway/data/paper/btc_convex_cycle_trend-20260514T145241Z.json`,
  `backend/hyperliquid_gateway/data/audits/btc_convex_cycle_trend-doubling-stability-20260514T145241Z.json`,
  and `progress/impl_btc_convex_cycle_trend.md`.
- Verification: focused tests passed. Official 500 USD taker-fee backtest
  returned `115.78%` net return, final equity `1,078.89 USD`, `48` trades,
  `41.67%` win rate, `2.39` profit factor, `13.63%` max drawdown, and robust
  gate `passes`. It beat `btc_adaptive_cycle_trend` by `21.39` percentage
  points. Validation returned `ready-for-paper`, paper candidate was generated,
  and doubling stability returned `stable`.
- Status: ready for paper review. No live routing, credential change,
  production promotion, leverage, or non-dry-run supervisor start occurred.

---

## 2026-05-14 - Mac Terminal Stabilization

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Stabilized the macOS terminal/consoles stack by adding shared
  platform-aware shell normalization, migrating stale Windows defaults away from
  `powershell.exe`/`cmd.exe`, normalizing PTY creation and runtime commands,
  preventing stale restored `launching` states, recognizing zsh/bash/fish
  prompts, adding one-auto-retry behavior, and separating PTY readiness from AI
  runtime launch status in Terminales / CLI. Follow-up fixed visible refresh
  while typing by throttling terminal activity state writes and keeping xterm
  mounted across PTY/runtime status updates.
- Evidence:
  `src/utils/terminalShell.ts`, `electron/main/native/pty-manager.ts`,
  `electron/main/native/diagnostics-manager.ts`,
  `electron/main/ipc/ipc-handlers.ts`,
  `src/contexts/TerminalContext.tsx`,
  `src/components/electron/TerminalPane.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/features/settings/pages/SettingsPage.tsx`,
  `src/utils/appSettings.ts`, `src/utils/agentRuntime.ts`,
  `src/utils/workspaceLaunch.ts`, `scripts/mission-drill.mjs`, and
  `progress/impl_mac_terminal_stabilization.md`.
- Verification: `rtk npm run terminal:doctor`, `rtk npm run hf:agent:runtime`,
  `rtk npm run build`, `rtk git diff --check`, and
  `rtk npm run agent:check` passed.
- Status: done. Manual Electron `/terminals` smoke remains the next visual
  confirmation step; no live trading, credentials, or backend trading behavior
  changed.

---

## 2026-05-14 - Workspace Desk Redesign

- Agent: Codex
- Mission class: UI review-speed audit / operations runbook audit
- Summary: Implemented the Stations + Desks model. `Workspace` now carries an
  explicit kind, the app inserts a required `Command Hub`, classifies the hedge
  fund repo separately from side projects, groups desks in the sidebar, filters
  terminals by desk, and seeds agents by desk kind instead of path/name regex.
- Evidence:
  `electron/main/native/workspace-manager.ts`,
  `src/components/electron/Sidebar.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/components/electron/WorkspaceModal.tsx`,
  `src/contexts/AgentProfilesContext.tsx`,
  `docs/project-architecture.md`,
  `docs/operations/how-to-develop-this-app.md`, and
  `progress/impl_workspace_desk_redesign.md`.
- Verification: `rtk npm run build`, `rtk npm run agent:check`,
  `rtk npm run terminal:doctor`, and `rtk git diff --check` passed.
- Status: done. No backend strategy logic, paper/live execution, credentials,
  or trading command behavior changed.

---

## 2026-05-14 - Desk Space Complete Workspaces

- Agent: Codex
- Mission class: UI review-speed audit / operations runbook audit
- Summary: Converted `/workbench` into the complete active desk space. Each
  desk now carries editable browser tabs, opens with scoped overview stats,
  saved commands, agents, and active-desk terminal evidence, while fixed
  trading stations remain separate product surfaces.
- Evidence:
  `src/features/desks/`,
  `electron/main/native/workspace-manager.ts`,
  `electron/types/ipc.types.ts`,
  `src/types/electron.d.ts`,
  `src/components/electron/Sidebar.tsx`,
  `src/components/electron/CommandPalette.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/components/electron/WorkspaceModal.tsx`,
  `src/features/cockpit/WidgetPanel.tsx`,
  `src/features/agents/panels/AgentsPanel.tsx`,
  `docs/project-architecture.md`,
  `docs/operations/how-to-develop-this-app.md`,
  `src/features/README.md`, and
  `progress/impl_desk_space_complete_workspaces.md`.
- Verification: `rtk npm run build`, `rtk npm run agent:check`,
  `rtk npm run terminal:doctor`, and `rtk git diff --check` passed.
- Status: done. No backend strategy logic, paper/live execution, credentials,
  production routing, or strategy computation changed.

---

## 2026-05-14 - Review And Publish Current Changes

- Agent: Codex
- Mission class: repo health audit / UI review-speed audit
- Summary: Reviewed the full Desk Space / Stations + Desks working tree before
  publish. Added a final typecheck pass and fixed 12 TypeScript blockers in
  memory graph, Obsidian, Polymarket, mission actions, calendar, and strategy
  detail code.
- Evidence:
  `progress/review_publish_current_changes.md`,
  `src/features/memory/components/StrategyMemoryGraphExplorer.tsx`,
  `electron/main/native/obsidian-manager.ts`,
  `src/features/memory/pages/MemoryGraphPage.tsx`,
  `src/utils/missionActions.ts`,
  `src/features/cockpit/pages/PolymarketPage.tsx`,
  `src/features/cockpit/pages/EconomicCalendarPage.tsx`, and
  `src/features/strategies/pages/StrategyDetailPage.tsx`.
- Verification: `rtk npm run build`, `rtk npx tsc --noEmit`,
  `rtk npm run agent:check`, `rtk npm run terminal:doctor`, and
  `rtk git diff --check` passed.
- Status: done. Ready to commit and push; no live trading, credentials,
  backend strategy logic, or production routing changed.

---

## 2026-05-14 - Repair Runtime After Folder Move

- Agent: Codex
- Mission class: operations/runbook audit / UI review-speed audit
- Summary: Recovered local runtime after the canonical checkout moved from
  `New project 9` to `hedge_fund_stations`. Restarted the gateway from the new
  checkout, restarted Electron dev, added `dev:doctor`, made Electron dev
  status use localhost fallback, added stale old-folder gateway detection, and
  hardened stale Obsidian vault migration.
- Evidence:
  `scripts/dev-doctor.mjs`,
  `electron/main/index.ts`,
  `electron/main/native/workspace-manager.ts`,
  `src/features/diagnostics/pages/DiagnosticsPage.tsx`,
  `package.json`, and
  `progress/impl_repair_runtime_after_folder_move.md`.
- Verification: `rtk npm run dev:doctor`, `rtk npm run gateway:probe`,
  `rtk npm run backend:probe`, `rtk npx tsc --noEmit`,
  `rtk npm run build`, `rtk npm run agent:check`, `rtk git diff --check`,
  and `rtk npm run terminal:doctor` passed.
- Status: done. No live trading, credentials, backend strategy logic, or
  production routing changed.

---

## 2026-05-14 - Simplify Sidebar To Workspace

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Replaced the wide left sidebar with a single flat Workspace
  switcher. Removed duplicated Trading Stations, grouped desk sections, active
  desk details, launch profiles, saved commands, and liquidation traps from that
  panel. Updated nearby visible copy in layout, navigation, shortcuts, workspace
  modal, and workbench empty state from desk-oriented labels to workspace
  language.
- Evidence:
  `src/components/electron/Sidebar.tsx`,
  `src/components/electron/WorkspaceModal.tsx`,
  `src/components/electron/ElectronLayout.tsx`,
  `src/features/cockpit/navigation.ts`,
  `src/features/desks/pages/DeskSpacePage.tsx`,
  `src/App.tsx`, and
  `progress/impl_simplify_sidebar_to_workspace.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, `rtk git diff --check`,
  `rtk npm run dev:doctor`, and in-app browser smoke passed.
- Status: done. No IPC, persistence schema, backend strategy logic, live
  trading, credentials, or production routing changed.

---

## 2026-05-15 - Workspace Conversation Chat

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Added compact per-workspace conversations to `/workbench` so the
  central surface behaves like a simple Codex-style chat. Messages and drafts
  are scoped to the active conversation, old unscoped history migrates into
  `Workspace history`, conversations can be closed by archiving, and archived
  chats can be restored from history.
- Evidence:
  `src/types/tasks.ts`,
  `src/contexts/CommanderTasksContext.tsx`,
  `src/utils/missionDrafts.ts`,
  `src/features/agents/components/MissionChatWorkbench.tsx`,
  `src/features/desks/components/WorkspaceDock.tsx`, and
  `progress/impl_workspace_conversation_chat.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, `rtk git diff --check`,
  `rtk npm run dev:doctor`, and browser smoke of
  `http://localhost:5173/workbench` passed. The browser preview has no Electron
  workspace bridge, so the full workspace-terminal interaction remains covered
  by TypeScript/build verification instead of browser clicking.
- Status: done. Renderer/localStorage only; no backend API, backend schema,
  strategy logic, live trading, credentials, or production routing changed.

---

## 2026-05-15 - Code-First Workbench Upgrade

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Made `/workbench` more code-first by removing the duplicated
  full-chat `Active` side column, adding a compact `Work Queue` above the right
  dock `Code` terminal grid, and reframing the old `Runs` tab as user-facing
  `History` while preserving the internal `runs` dock mode.
- Evidence:
  `src/features/agents/components/MissionChatWorkbench.tsx`,
  `src/features/desks/components/WorkspaceDock.tsx`, and
  `progress/impl_code_first_workbench_upgrade.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, `rtk git diff --check`,
  `rtk npm run dev:doctor`, and browser smoke of `/workbench` passed. Browser
  DOM confirmed `History` replaced the user-facing `Runs` tab label; Electron
  terminal interactions remain covered by TypeScript/build/runtime checks.
- Status: done. Renderer/UI only; no backend API, IPC contract, backend schema,
  strategy logic, live trading, credentials, or production routing changed.

---

## 2026-05-15 - Codex-Style Workspace App

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Converted `/workbench` into a chat-first workspace session. The
  center now opens on `MissionChatWorkbench`, the right dock is contextual
  `Code`/`Browser`/`Runs`, `/workbench` is the default route, and the left
  workspace switcher is more compact and path-aware.
- Evidence:
  `src/features/desks/pages/DeskSpacePage.tsx`,
  `src/features/desks/components/WorkspaceDock.tsx`,
  `src/features/desks/workspaceDockEvents.ts`,
  `src/features/agents/components/MissionChatWorkbench.tsx`,
  `src/components/electron/Sidebar.tsx`,
  `src/components/electron/ElectronLayout.tsx`,
  `src/features/cockpit/WidgetPanel.tsx`, and
  `progress/impl_codex_style_workspace_app.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, `rtk git diff --check`,
  `rtk npm run dev:doctor`, and headless Chrome `/workbench` smoke with an
  Electron API mock passed.
- Status: done. No backend API, persistence schema, strategy logic, live
  trading, credentials, or production routing changed.

---

## 2026-05-14 - Theme Couple Workspace Panels

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Replaced hard-coded cyan/blue workbench colors with app theme
  variables across workspace overview cards, tabs, action buttons, runtime
  badges, embedded browser chrome, mission dock messages, draft chips, and agent
  panel tabs/actions.
- Evidence:
  `src/features/desks/pages/DeskSpacePage.tsx`,
  `src/features/desks/components/DeskBrowserPanel.tsx`,
  `src/features/agents/components/MissionChatWorkbench.tsx`,
  `src/features/agents/panels/AgentsPanel.tsx`, and
  `progress/impl_theme_couple_workspace_panels.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, `rtk git diff --check`, browser smoke, and scoped
  static color sweep passed.
- Status: done. Visual-only; no IPC, persistence schema, backend strategy
  logic, live trading, credentials, or production routing changed.

---

## 2026-05-14 - Workspace Dock Command Center

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Converted `/workbench` into a command-first center panel and moved
  workspace tools into a right-side `Workspace Dock` with `Agent`, `Browser`,
  and `Code` modes. Command launches and shortcuts now open the `Code` dock.
  The compact browser now behaves more like Codex with back/forward/reload,
  one URL/search bar, small tabs, and automatic URL/title persistence while
  browsing.
- Evidence:
  `src/features/desks/components/WorkspaceDock.tsx`,
  `src/features/desks/workspaceDockEvents.ts`,
  `src/components/electron/ElectronLayout.tsx`,
  `src/features/desks/pages/DeskSpacePage.tsx`,
  `src/features/desks/components/DeskBrowserPanel.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/components/electron/CommandPalette.tsx`,
  `src/App.tsx`, and
  `progress/impl_workspace_dock_command_center.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, `rtk git diff --check`,
  `rtk npm run dev:doctor`, and in-app browser DOM smoke on
  `http://localhost:5173/workbench` passed. Screenshot capture timed out in the
  browser tool; DOM confirmed the dock structure.
- Status: done. No IPC, persistence schema, backend strategy logic, live
  trading, credentials, or production routing changed.

---

## 2026-05-15 - Professional Agent Code Panel

- Agent: Codex
- Mission class: UI review-speed audit
## 2026-05-15 - Agent View Raw Chat CLI

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Fixed Agent View so the normal composer behaves like a real
  workspace chat. Messages now go as raw input to a per-workspace main CLI
  (`workspace-main-agent`) instead of creating a task through `launchAgentRun`
  and sending the large mission capsule. Selected/roster launches remain
  explicit controls and use only a short prompt that points the runtime at
  `AGENTS.md`.
- Evidence:
  `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/features/agents/utils/workspaceAgentViewModel.ts`,
  `src/contexts/TerminalContext.tsx`, and
  `progress/impl_agent_view_raw_chat_cli.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run dev:doctor`, `rtk npm run agent:check`,
  `rtk git diff --check`, `/workbench` HTTP smoke, and a static prompt-path
  sweep passed.
- Status: done. Renderer/UI only; no backend API, backend schema, strategy
  logic, live trading, credentials, or production routing changed.

---

## 2026-05-15 - Native Workspace Agent View

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Added a provider-neutral Agent View as the default center
  `/workbench` surface. It groups workspace runs, drafts, and agent terminal
  sessions into Needs Input, Working, Completed, and Failed; supports Peek,
  Reply, Attach, Retry, Stop, and Remove; and keeps Chat as a secondary center
  tab.
- Evidence:
  `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/features/agents/utils/workspaceAgentViewModel.ts`,
  `src/features/desks/pages/DeskSpacePage.tsx`,
  `src/features/desks/components/WorkspaceDock.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/contexts/TerminalContext.tsx`,
  `src/contexts/CommanderTasksContext.tsx`, and
  `progress/impl_native_workspace_agent_view.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run dev:doctor`, `rtk npm run agent:check`,
  `rtk git diff --check`, and `/workbench` HTTP smoke passed. In-app browser DOM
  smoke cannot verify the Electron active workspace because the Vite browser
  preview has no Electron preload workspace/terminal API.
- Status: done. Renderer/UI only; no backend API, backend schema, strategy
  logic, live trading, credentials, or production routing changed.

---

- Summary: Upgraded the right-side Code dock from loose launch buttons into a
  compact Agent Launcher for Codex, Claude, Gemini, Shell, and Dev. Terminal
  headers now foreground provider/session identity, active state, runtime
  status, command, cwd, pty state, retry count, and last detail, while color and
  visual-accent controls moved into secondary tools.
- Evidence:
  `src/components/electron/TerminalGrid.tsx`,
  `src/components/electron/TerminalPane.tsx`, and
  `progress/impl_professional_agent_code_panel.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, `rtk git diff --check`,
  `rtk npm run dev:doctor`, and `curl` `/workbench` smoke passed. Interactive
  browser launch smoke was skipped because browser automation was unavailable.
- Status: done. Renderer/UI only; no backend API, IPC contract, backend schema,
  strategy logic, live trading, credentials, or production routing changed.

---

## 2026-05-15 - Minimal Agent Code Panel

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Compressed the Code dock after the agent panel pass. The launcher is
  now a minimal `Agents` strip with provider badge, name, and status dot, while
  detailed purpose/command/status moved into tooltips. Terminal headers now use
  smaller badges and one subtle metadata line instead of multiple large pills.
- Evidence:
  `src/components/electron/TerminalGrid.tsx`,
  `src/components/electron/TerminalPane.tsx`, and
  `progress/impl_minimal_agent_code_panel.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, `rtk git diff --check`,
  `rtk npm run dev:doctor`, and `curl` `/workbench` smoke passed.
- Status: done. Renderer/UI only; no backend API, IPC contract, backend schema,
  strategy logic, live trading, credentials, or production routing changed.

---

## 2026-05-15 - Terminal-First Code Panel

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Converted the right-side Code dock into a terminal-first surface.
  Empty queue chrome no longer renders, active queue state is a compact strip,
  agent launchers moved behind a single `+` menu, compact Code hides filters and
  duplicate mission cards, and terminal headers now show only provider, name,
  runtime state, and close by default.
- Evidence:
  `src/features/desks/components/WorkspaceDock.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/components/electron/TerminalPane.tsx`, and
  `progress/impl_terminal_first_code_panel.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, `rtk git diff --check`,
  `rtk npm run dev:doctor`, and `curl` `/workbench` smoke passed. Interactive
  launch smoke was skipped because browser automation was unavailable.
- Status: done. Renderer/UI only; no backend API, IPC contract, backend schema,
  strategy logic, live trading, credentials, or production routing changed.
## 2026-05-15 - Compact Workspace Tools Panel

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Made the right Workspace Tools dock more terminal-first. Header and
  large tabs became one compact toolbar, launch moved to the toolbar `+`, queue
  status became a small badge, embedded Code lost its duplicate toolbar, and
  compact xterm sizing now avoids the visible open-big-then-shrink behavior.
- Evidence:
  `src/features/desks/components/WorkspaceDock.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/components/electron/TerminalPane.tsx`, and
  `progress/impl_compact_workspace_tools_panel.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run dev:doctor`, `rtk npm run agent:check`, `rtk git diff --check`,
  and in-app browser `/workbench` toolbar smoke passed. Real Shell/Dev/Codex
  launch smoke needs the Electron shell because the Vite browser preview has no
  preload terminal/workspace API.
- Status: done. Renderer/UI only; no backend API, IPC contract, backend schema,
  strategy logic, live trading, credentials, or production routing changed.

---

## 2026-05-15 - OpenHuman Memory Extraction

- Agent: Codex
- Mission class: architecture or agent workflow / memory update
- Summary: Implemented a clean-room backend strategy memory index inspired by
  OpenHuman architecture ideas without GPL code reuse or Rust migration. The
  new index canonicalizes repo-owned evidence into bounded Markdown chunks,
  stores deterministic chunks in SQLite/FTS, runs durable scoring/summary jobs,
  exposes stable `hf:memory:*` commands and gateway endpoints, and feeds cited
  snippets into `/memory` plus mission launch context.
- Evidence:
  `backend/hyperliquid_gateway/strategy_memory.py`,
  `tests/test_strategy_memory_index.py`,
  `src/features/memory/pages/MemoryGraphPage.tsx`,
  `src/features/agents/components/CommanderConsoleV2.tsx`, and
  `progress/impl_openhuman_memory_extraction.md`.
- Verification: `rtk python3 -m unittest tests.test_strategy_memory_index`,
  `rtk python3 -m unittest tests.test_strategy_memory_index
  tests.test_strategy_learning_memory tests.test_graphify_memory_status`,
  `rtk npm run hf:memory:sync -- --dry-run`, `rtk npm run hf:memory:sync`,
  `rtk npm run hf:memory:query -- "what did we learn about btc adaptive cycle
  trend"`, `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, `rtk git diff --check`, and
  `rtk npm run hf:memory:status` passed.
- Status: done. Backend memory index and review surfaces only; no live trading,
  strategy promotion, credentials, GPL source reuse, or Rust migration.

---
## 2026-05-15 - Right Dock Terminal Grid

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Fixed the right Code dock terminal layout so compact mode no longer
  hides every terminal except the active one. The dock now renders all
  active-workspace terminals in a responsive grid, splits two panes across the
  available dock height, keeps 3+ panes scrollable with usable minimum row
  height, and tightens compact terminal chrome with status dots, lucide
  controls, and isolated stacking.
- Evidence:
  `src/features/desks/components/WorkspaceDock.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/components/electron/TerminalPane.tsx`, and
  `progress/impl_right_dock_terminal_grid.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run agent:check`, targeted `rtk git diff --check`,
  `rtk npm run dev:doctor`, and `curl` `/workbench` smoke passed. Full
  automated Electron PTY/browser interaction was skipped because browser
  automation was unavailable and Node REPL could not import Playwright.
- Status: done. Renderer/UI only; no backend API, IPC contract, backend schema,
  strategy logic, live trading, credentials, or production routing changed.

---
## 2026-05-15 - Strategy Pod Agentic Workbench

- Agent: Codex
- Mission class: UI review-speed audit / strategy operations surface
- Summary: Reframed `/workbench` around Strategy Pods. The center is again the
  agentic command surface with chat and sessions, while chart/metrics/evidence,
  gates, Strategy Factory, and Pine Indicator Lab moved into a right-dock
  `Strategy Inspector`. The left rail now creates local strategy pods from the
  backend catalog or as new drafts, with edit/duplicate/delete-local-config and
  open Inspector/CLI actions.
- Evidence:
  `src/features/desks/pages/DeskSpacePage.tsx`,
  `src/features/desks/components/StrategyInspectorPanel.tsx`,
  `src/features/desks/components/WorkspaceDock.tsx`,
  `src/components/electron/Sidebar.tsx`,
  `src/components/electron/WorkspaceModal.tsx`,
  `electron/main/native/workspace-manager.ts`, and
  `progress/impl_strategy_pod_agentic_workbench.md`.
- Verification: `rtk npm run agent:check`, `rtk npx tsc --noEmit`,
  `rtk npm run build`, `rtk npm run dev:doctor`, and browser `/workbench`
  smoke passed. Browser smoke covered no-pod state plus pod creator catalog
  load; Electron-only persisted create/edit/delete still needs shell smoke.
- Status: done. Local workspace/pod config and renderer UI only; no live
  trading, credentials, order routing, or production promotion behavior changed.

---
## 2026-05-16 - Agent View State And Header Cleanup

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Fixed Agent View state semantics so `Needs Input` means real
  approval/input only, while quiet live sessions stay `Working`. Runtime retry
  now suppresses provider relaunch commands once the TUI is alive, and the
  Strategy Pod header is compacted behind `Pod actions`.
- Evidence:
  `src/features/agents/utils/workspaceAgentViewModel.ts`,
  `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/components/electron/TerminalPane.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/features/desks/components/WorkspaceDock.tsx`,
  `src/features/desks/pages/DeskSpacePage.tsx`, and
  `progress/impl_agent_view_state_and_header_cleanup.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run dev:doctor`, `rtk npm run agent:check`,
  `rtk git diff --check`, and HTTP `/workbench` smoke passed. Visual browser
  screenshot was skipped because the Node REPL runtime does not have
  `playwright` installed.
- Status: done. Renderer/terminal UI behavior only; no IPC, preload,
  PTY manager, backend, strategy logic, credentials, order routing, or live
  trading changed.

---
## 2026-05-16 - Asset Strategy Pods Right Dock Sessions

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Added active-asset right dock session restore and ordering. Terminal
  sessions now keep stable session keys and become relaunchable cards after an
  app restart if their PTY is gone. The right dock has manual move controls,
  pins, sort presets, and active terminal memory per workspace. Agent View uses
  the same order and can relaunch restored sessions via Attach/Retry.
- Evidence:
  `src/contexts/TerminalContext.tsx`,
  `src/features/desks/DeskSpaceContext.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/features/desks/components/WorkspaceDock.tsx`,
  `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/features/agents/utils/workspaceAgentViewModel.ts`, and
  `progress/impl_asset_strategy_pods.md`.
- Verification: `rtk npm run agent:check`, `rtk npx tsc --noEmit`,
  `rtk npm run build`, `rtk npm run dev:doctor`, and
  `rtk git diff --check` passed.
- Status: done for this UI/session slice. Manual Electron restart smoke remains
  the next best interactive check. No backend strategy logic, credentials,
  live trading, order routing, or production promotion changed.

---
## 2026-05-16 - Agent View Active Terminal Composer

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Fixed Agent View composer routing so normal messages target the
  active writable terminal in the current workspace first, then the selected
  Peek row terminal, then live main CLI fallbacks. Peek now marks its terminal
  active, and the composer displays `Target` with the actual send destination.
- Evidence:
  `src/features/agents/components/WorkspaceAgentView.tsx` and
  `progress/impl_agent_view_active_terminal_composer.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run dev:doctor`, `rtk npm run agent:check`,
  `rtk git diff --check`, and HTTP `/workbench` smoke passed. Node REPL
  Playwright smoke was skipped because `playwright` is not installed in that
  environment; manual Electron PTY write-routing smoke still needs an
  interactive pass.
- Status: done. Renderer target selection only; no IPC, preload, PTY manager,
  backend, strategy logic, credentials, live trading, or production routing
  changed.

---
## 2026-05-16 - Agent View Peek Summary

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Replaced Agent View's raw Peek transcript with a compact session
  summary. Peek no longer reads `terminal.getSnapshot()` or renders PTY buffers
  as plain text, so full-screen OpenCode/Codex redraws no longer appear as
  duplicated frames and block glyphs. Attach remains the full console path.
- Evidence:
  `src/features/agents/components/WorkspaceAgentView.tsx` and
  `progress/impl_agent_view_peek_summary.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run dev:doctor`, `rtk npm run agent:check`,
  `rtk git diff --check`, and HTTP `/workbench` smoke passed. Manual Electron
  PTY smoke still needs an interactive pass.
- Status: done. Renderer presentation only; no IPC, preload, PTY manager,
  backend, strategy logic, credentials, live trading, or production routing
  changed.

## 2026-05-16 - Agent View Simplified Layout

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Simplified Agent View's footer into a normal composer with provider,
  target, message, Send, and one `Agent actions` toggle. Advanced actions now
  hold New main CLI, selected launch, roster launch, Claude View, and role
  chips. Selected-session detail now has explicit Reply/Attach actions, with
  Reply collapsed by default.
- Evidence:
  `src/features/agents/components/WorkspaceAgentView.tsx` and
  `progress/impl_agent_view_simplified_layout.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run dev:doctor`, `rtk npm run agent:check`,
  `rtk git diff --check`, and HTTP `/workbench` smoke passed. `dev:doctor`
  failed once on transient Alpha tunnel `ECONNRESET`, then passed on retry.
  Manual Electron UI smoke still needs an interactive pass.
- Status: done. Renderer layout only; no IPC, preload, PTY manager, backend,
  strategy logic, credentials, live trading, or production routing changed.

---
## 2026-05-16 - Strategy Pods Por Asset

- Agent: Codex
- Mission class: UI review-speed audit / workspace semantics
- Summary: Converted Strategy Pods from per-strategy workspaces to per-asset
  pods. The existing BTC Convex workspace id is preserved, but the rail/header
  render it as `BTC`; BTC Convex remains linked and active inside that asset.
- Evidence:
  `electron/main/native/workspace-manager.ts`, `src/contexts/WorkspaceContext.tsx`,
  `src/components/electron/Sidebar.tsx`,
  `src/features/desks/components/StrategyInspectorPanel.tsx`,
  `src/features/desks/pages/DeskSpacePage.tsx`,
  `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/contexts/TerminalContext.tsx`,
  `progress/asset_strategy_pods_workbench_smoke.png`, and
  `progress/impl_asset_strategy_pods.md`.
- Verification: `rtk npm run agent:check`, `rtk npx tsc --noEmit`,
  `rtk npm run build`, `rtk npm run dev:doctor`, `rtk git diff --check`, and
  browser `/workbench` smoke passed.
- Status: done. UI/workspace/session semantics only; no backend strategy logic,
  credentials, order routing, paper supervisor loop, live trading, or production
  promotion changed.

---
## 2026-05-16 - Draft Strategy Session Review

- Agent: Codex
- Mission class: UI review-speed audit / strategy pod review
- Summary: Draft strategy sessions launched inside an asset pod now appear
  immediately in Strategy Inspector Review, grouped by local
  `strategySessionId` and scoped to the active workspace plus asset. First-send
  Agent View launches now create a Commander task/run wrapper so the session has
  reviewable evidence from the start.
- Evidence:
  `src/contexts/TerminalContext.tsx`,
  `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/features/desks/components/StrategyInspectorPanel.tsx`,
  `src/features/desks/strategySessionReviewModel.ts`, and
  `progress/impl_asset_strategy_pods.md`.
- Verification: `rtk npx tsc --noEmit`, `rtk npm run build`,
  `rtk npm run dev:doctor`, `rtk npm run agent:check`,
  `rtk git diff --check`, and HTTP `/workbench` smoke passed. Interactive
  Electron UI smoke still needs a manual pass because browser automation and
  Playwright were unavailable in this environment.
- Status: done. UI-local draft review only; backend strategy audit, strategy
  logic, credentials, order routing, live trading, and production promotion were
  not changed.

---
## 2026-05-16 - Strategy Mission Locks

- Agent: Codex
- Mission class: repo health audit / strategy workflow control
- Summary: Added Strategy Mission Locks so Strategy Factory and external CLIs
  reserve a single `strategy_id` before LLM implementation, block overlapping
  active claims per asset, and release claims to review, done, or blocked with
  handoff evidence.
- Evidence:
  `backend/hyperliquid_gateway/strategy_claims.py`,
  `progress/strategy_claims.json`,
  `scripts/agent_harness.py`,
  `src/features/strategies/components/StrategyFactoryModal.tsx`,
  `src/features/desks/components/StrategyInspectorPanel.tsx`, and
  `progress/impl_strategy_mission_locks.md`.
- Verification: `rtk npm run agent:check`,
  `rtk python3 -m unittest tests.test_strategy_catalog tests.test_strategy_claims`,
  `rtk npm run build`, and `rtk git diff --check` passed.
- Status: done. Workflow and harness control only; no live trading, credential
  changes, order routing, production promotion, or strategy edge claims.

---

## 2026-05-16 - Strategy Pods Icon Refresh

- Agent: Codex
- Mission class: UI review-speed audit / workspace semantics
- Summary: Replaced the `/workbench` Strategy Pods entry and pod list icon
  language with Lucide `Blocks`, so the surface reads as pod/workspace
  operations instead of AI assistant or generic lab UI.
- Evidence:
  `src/features/cockpit/navigation.ts`,
  `src/features/stations/pages/HedgeFundStationPage.tsx`,
  `src/components/electron/Sidebar.tsx`,
  `src/contexts/WorkspaceContext.tsx`,
  `electron/main/native/workspace-manager.ts`, and
  `progress/impl_strategy_pods_icon_refresh.md`.
- Verification: `rtk npm run agent:check`, `rtk npm run build`, and
  `rtk git diff --check` passed.
- Status: done. UI icon/defaults only; no backend strategy logic, credentials,
  order routing, paper supervisor loop, live trading, or production promotion
  changed.

---

## 2026-05-16 - Asset Strategy Workspace Scaffold

- Agent: Codex
- Mission class: repo architecture / UI review-speed audit
- Summary: Added an asset-first Strategy Pod convention: each ticker pod now has
  deterministic `docs/assets/<ASSET>/` folders for idea inboxes and reviews,
  while official specs and backend packages stay in their canonical locations.
- Evidence:
  `docs/assets/README.md`, `docs/assets/BTC/README.md`,
  `electron/main/native/workspace-manager.ts`,
  `src/components/electron/WorkspaceModal.tsx`,
  `src/features/desks/components/StrategyInspectorPanel.tsx`, and
  `progress/impl_asset_strategy_workspace_scaffold.md`.
- Verification: `rtk npm run agent:check`, `rtk npm run build`, and
  `rtk git diff --check` passed.
- Status: done. Workspace organization/UI only; no strategy logic, generated
  evidence relocation, credentials, order routing, live trading, or production
  promotion changed.

---

## 2026-05-16 - BTC Video Auto-Fit

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Updated `/btc` so the BTC workbench measures its available grid
  space, derives row height from container height, and expands a focused stream
  into the unused video area without changing the persisted manual layout.
- Evidence:
  `src/features/cockpit/pages/BtcAnalysisPage.tsx` and
  `progress/impl_btc_video_auto_fit.md`.
- Verification: `rtk npm run agent:check`, `rtk npm run build`, browser smoke
  on `http://localhost:5173/btc`, and `rtk git diff --check`.
- Status: done. Renderer layout only; no backend, Electron IPC, strategy logic,
  storage schema, credentials, order routing, live trading, or production
  promotion changed.

---

## 2026-05-16 - BTC Toolbar Minimal

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Compacted the `/btc` workbench header into one professional toolbar
  row with short title text, icon-first actions, compact presets, `S1/S2/M`
  stream controls, and hidden horizontal overflow scroll.
- Evidence:
  `src/features/cockpit/pages/BtcAnalysisPage.tsx` and
  `progress/impl_btc_toolbar_minimal.md`.
- Verification: `rtk npm run agent:check`, `rtk npm run build`, browser smoke
  on `http://localhost:5173/btc` at `1581x725`, and `rtk git diff --check`.
- Status: done. Renderer layout only; no backend, Electron IPC, strategy logic,
  storage schema, credentials, order routing, live trading, or production
  promotion changed.

---

## 2026-05-16 - Center Panel Persistent Layout

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Stabilized `ElectronLayout` so side-panel collapse and expansion no
  longer remounts the center `WidgetPanel`. The left context, center work
  surface, and right dock now stay in a stable three-panel tree.
- Evidence:
  `src/components/electron/ElectronLayout.tsx` and
  `progress/impl_center_panel_persistent_layout.md`.
- Verification: `rtk npm run agent:check`, `rtk npm run build`, browser smoke
  on `/btc`, browser smoke on `/workbench`, and `rtk git diff --check`.
- Status: done. Renderer layout only; no backend, Electron IPC, route, strategy
  logic, storage schema, credentials, order routing, live trading, or production
  promotion changed.

---

## 2026-05-16 - Terminal Visual Comfort

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Updated the shared terminal renderer with a high-contrast matte
  xterm palette, readable ANSI black/bright-black, lighter terminal chrome, and
  opt-in accent animation only when the `full` performance profile is active.
- Evidence: `src/components/electron/TerminalPane.tsx`, `src/index.css`, and
  `progress/impl_terminal_visual_comfort.md`.
- Verification: `rtk npm run agent:check`, `rtk npm run build`, and
  `rtk git diff --check` passed. Automated browser smoke was attempted but
  skipped because the available Node REPL environment does not have Playwright
  installed.
- Status: done. Renderer visual comfort only; no Electron IPC, `node-pty`,
  backend, terminal persistence, strategy logic, credentials, order routing,
  live trading, or production promotion changed.

---

## 2026-05-16 - Hybrid Agent Console Refresh

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Made Agent View drive the right dock as the focused console surface
  while mounted xterm instances re-apply terminal visuals/settings without
  killing PTY sessions.
- Evidence: `src/components/electron/TerminalPane.tsx`,
  `src/features/agents/components/WorkspaceAgentView.tsx`, and
  `progress/impl_hybrid_agent_console_refresh.md`.
- Verification: `rtk npm run agent:check`, `rtk npm run build`, and
  `rtk git diff --check` passed.
- Status: done. Renderer workflow only; no Electron IPC, `node-pty`, backend,
  terminal persistence schema, CLI command behavior, strategy logic,
  credentials, order routing, or market-order behavior changed.

---

## 2026-05-16 - Release Push Mac Delivery

- Agent: Codex
- Mission class: operations/runbook audit
- Summary: Packaged the current Electron app for this Apple Silicon Mac and
  prepared all pending source, docs, harness, and handoff changes for push.
- Evidence: `release/1.0.0/mac-arm64/Hedge Fund Station.app`,
  `release/1.0.0/Hedge Fund Station-1.0.0-arm64.dmg`,
  `release/1.0.0/Hedge Fund Station-1.0.0-mac-arm64.zip`, and
  `progress/impl_release_push_mac_delivery.md`.
- Verification: `rtk npm run agent:check`,
  `rtk python3 -m unittest tests.test_agent_harness tests.test_strategy_claims`,
  `rtk git diff --check`, `rtk npm run build`,
  `rtk npm run dist:mac -- --arm64`, bundle `Info.plist` inspection,
  ad-hoc signing inspection, and SHA256 checks passed.
- Status: done. Build artifacts stay local under ignored `release/`. The app is
  ad-hoc signed for local use; public distribution still needs Developer ID
  signing and notarization.

---

## 2026-05-16 - Right Dock UTF-8 CLI Stability

- Agent: Codex
- Mission class: UI review-speed audit
- Summary: Fixed the right-dock agent CLI rendering path so new PTY and
  screen-backed OpenCode/Codex/Claude/Gemini sessions get UTF-8-safe locale
  defaults, screen sessions use UTF-8 mode with `screen-256color`, compact Code
  mode keeps split terminals without duplicate embedded toolbar chrome, and
  xterm uses macOS-native mono fonts first.
- Evidence: `electron/main/native/pty-manager.ts`,
  `src/components/electron/TerminalPane.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/utils/strategyFactoryMission.ts`, and
  `progress/impl_right_dock_utf8_cli_stability.md`.
- Verification: `rtk npm run agent:check`, `rtk npx tsc --noEmit`,
  `rtk npm run build`, `rtk git diff --check`, and
  `rtk npm run terminal:doctor` passed. A direct screen probe confirmed
  `screen -U -T screen-256color` starts sessions with `TERM=screen-256color`.
  Full live Electron OpenCode glyph smoke remains manual because the running
  packaged app was an older build and the browser preview cannot exercise
  Electron terminal IPC.
- Status: done. Electron terminal launch and renderer terminal chrome only; no
  backend, strategy logic, storage schema, credentials, order routing, or
  market-order behavior changed.

---
