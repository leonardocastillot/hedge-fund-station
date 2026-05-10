# Agent Session History

Append meaningful completed session summaries here. Do not rewrite earlier
entries unless the human explicitly asks for cleanup.

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
