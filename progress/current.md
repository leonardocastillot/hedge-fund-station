# Current Agent Session

This file tracks the live session. Keep it short, current, and useful to the
next agent.

- Task: idle
- Status: ready_for_next_task
- Last updated: 2026-05-12
- Owner: `codex`

## Active Plan

- No active implementation task.

## Last Completed Work

- `compact_vertical_navigation` replaced the crowded horizontal route tabs with
  a fixed 52px left rail, moved route metadata into a lightweight shared module,
  moved `BrowserRouter` up to the app shell, kept the workspace sidebar
  separate and collapsible, preserved route lifecycle telemetry, and compressed
  the `Hedge Fund Station` header into a 34px status strip. `/btc` still shows
  TradingView plus all three videos by default.
- Verification passed: `rtk npm run build`, `rtk npm run perf:budget`,
  `rtk npm run agent:check`, and `rtk git diff --check`. Browser smoke
  confirmed 18 route buttons, no horizontal content tabs, default route with 0
  webviews, `/btc` with 4 webviews and `3 videos`, working workspace
  collapse/expand, and working route click to `/settings`.
- Handoff: `progress/impl_compact_vertical_navigation.md`
- `deep_daily_performance_optimization` kept `/btc` as TradingView plus all
  three videos while adding a single Electron media request-blocking pipeline
  for YouTube and TradingView, combining local ad/tracker rules with Ghostery in
  one callback so Electron listeners do not overwrite each other. BTC videos now
  receive profile-aware YouTube playback quality hints instead of being hidden.
  Diagnostics gained Electron process metrics from `app.getAppMetrics()`, and
  `perf:budget` now guards media blockers and YouTube quality control. Verified
  build, perf budget, harness check, diff check, and an idle startup process
  sample. `tsc --noEmit` still fails on pre-existing unrelated errors; the new
  diagnostics CPU type issue found during this pass was fixed.
- Handoff: `progress/impl_deep_daily_performance_optimization.md`
- `daily_light_performance_optimization` added a default `daily-light`
  performance profile, profile-aware polling, collapsed-sidebar polling guards,
  diagnostics data-footprint warnings, stricter `perf:budget` regression checks,
  and hidden-window webview suspension. After user correction, `/btc` preserves
  the trading default of TradingView plus all three YouTube streams visible, with
  `Focus` as a manual fallback rather than the default. The BTC frame guard now
  waits for warmup plus sustained severe frame pressure before reducing media.
  Terminal voice input is now opt-in so Gemini voice is not loaded by normal
  terminal navigation. Live smoke confirmed `/btc` shows `3 videos · 3 mounted`,
  and navigating away from
  `/btc` removes extra webview renderers with GPU dropping to `0.0%` in the
  sample.
- Verification passed: `rtk npm run build`, `rtk npm run perf:budget`,
  `rtk npm run agent:check`, and `rtk git diff --check`.
- Handoff: `progress/impl_daily_light_performance_optimization.md`
- `btc_daily_performance_automation` optimized `/btc` for daily use while
  keeping TradingView plus all three YouTube streams visible by default. Pine AI
  Lab and `lightweight-charts` now lazy-load into a separate chunk, YouTube
  webviews no longer run a permanent mute interval, webviews get best-effort
  cleanup on unmount, local telemetry now includes `webview` and `fps` events,
  and `Focus` mode can reduce the board to TradingView plus one selected stream.
  Verification passed: build, perf budget, harness check, diff check, and browser
  smoke showing default `4` webviews, Focus `2`, restore `4`.
- Handoff: `progress/impl_btc_daily_performance_automation.md`
- `graphify_full_graph_fluency` replaced the `/repo-graph` full-graph
  `all-orbit` profile with deterministic community/globe-seeded `world-orbit`,
  the old `forceAtlas2Based` gravity feel restored through stronger central
  gravity/spring/damping tuning, an expanded orbital seed shell, longer bounded
  settling, final auto-framing, post-settle polished visuals, in-place label
  updates, HUD frame/render timing, and light ambient orbital flow so the
  complete graph moves from `settling` to `flowing` without Frozen/Resume UI.
  Reverified on 2026-05-12 after the interrupted session: unittest, build,
  gateway probe, browser full-graph smoke, and controls smoke passed.
- Handoff: `progress/impl_graphify_full_graph_fluency.md`
- `memory_route_split` split Strategy Memory and Graphify into separate load
  paths: `/memory` no longer loads Graphify status or iframe resources, and
  `/repo-graph` owns the Graphify repo map. Graphify was regenerated after the
  route/docs change.
- Handoff: `progress/impl_memory_route_split.md`
- `calendar_warning_density_polish` compacted `/calendar` warning presentation:
  raw notices became small readable pills, warning details moved into the right
  rail, and critical/stand-aside alert rows moved out of the main column so the
  week/hour map appears immediately below the top strip.
- Handoff: `progress/impl_calendar_warning_density_polish.md`
- `calendar_local_timezone_display` added a persisted `Time` selector to
  `/calendar` and derives the map, table, Today/Tomorrow counts, search text,
  and stand-aside fallback text from the selected local timezone. Default is the
  browser timezone with `America/Santiago` fallback.
- Handoff: `progress/impl_calendar_local_timezone_display.md`
- `calendar_compact_desk_redesign` rebuilt `/calendar` as a dense macro review
  desk with a sticky top strip, week/hour concentration map, compact event
  table, filters, alert chips, and right rail tabs for Brief, Checklist, News,
  and Holidays.
- Handoff: `progress/impl_calendar_compact_desk_redesign.md`
- `btc_youtube_stream_focus_fix` replaced `/btc` stream embeds with focused
  YouTube watch webviews, injected video-first page styling, kept mute
  enforcement, and changed external open links to compatible watch URLs.
- Handoff: `progress/impl_btc_youtube_stream_focus_fix.md`
- `btc_layout_flexibility_polish` made `/btc` more moldable with a finer
  24-column layout grid, smaller row height, video/TV/mosaic presets, per-panel
  +/- sizing controls, and more visible edit-mode resize handles. YouTube error
  152-4 was intentionally not debugged.
- Handoff: `progress/impl_btc_layout_flexibility_polish.md`
- `btc_flexible_workbench` replaced `/btc` with a persisted drag/resize
  workbench, clean muted YouTube embeds, video visibility controls, and Pine AI
  Lab as a drawer or pinned panel.
- Handoff: `progress/impl_btc_flexible_workbench.md`
- `caveman_output_only_agent_style` added `CAVEMAN.md` as an output-only
  instruction layer for compact user-facing agent replies, wired it into
  `AGENTS.md` and `agent:brief`, and explicitly kept context/memory compression,
  MCP shrink, and global hooks out of scope.
- Handoff: `progress/impl_caveman_output_only_agent_style.md`
- `rtk_repo_context_cleanup` finished active cleanup for the retired
  content-growth surface, pruned stale worktree metadata, renamed the branch to
  `codex/rtk-repo-context-cleanup`, and configured local Codex RTK instructions
  through `AGENTS.md` and `RTK.md`.
- Handoff: `progress/impl_rtk_repo_context_cleanup.md`
- `strategy_memory_graph_explorer` redesigned the lower `/memory` Strategy
  Memory section as a Graphify-style evidence graph with local `vis-network`,
  search, lenses, evidence filters, graph controls, reduced default noise,
  first-class audit artifacts, and an Agent Path inspector for future strategy
  agents.
- Handoff: `progress/impl_strategy_memory_graph_explorer.md`
- Retired the old content-growth Electron surface, replaced it with neutral
  `ai:*` Gemini config IPC, preserved Gemini Live/direct loop, and verified the
  build and source searches.
- `repo_cleanup_harness_simplification` simplified the active harness queue,
  untracked media/local editor state/generated evidence, kept only curated
  backend fixtures, pruned unused dependencies, and prepared Graphify refresh.
- Handoff: `progress/impl_repo_cleanup_harness_simplification.md`
- `graph_memory_operating_system` connected Graphify, Obsidian, and the file
  harness into a documented agent memory operating model, added Graphify
  freshness metadata, and regenerated Graphify.
- Handoff: `progress/impl_graph_memory_operating_system.md`
- `graphify_interaction_ux` improved the custom Graphify explorer interaction:
  node clicks now select without rebuilding the graph, `Neighborhood` behaves
  correctly after search, and `Open Source` can message `/memory` to open repo
  files through Electron.
- Handoff: `progress/impl_graphify_interaction_ux.md`
- `graphify_performance_lite_physics` kept the full Graphify graph as the
  default view while adding adaptive performance profiles, lightweight
  full-graph physics, automatic long settling without manual resume, debounced
  controls, and persistent HUD metrics.
- Handoff: `progress/impl_graphify_performance_lite_physics.md`
- `graphify_restore_orbital_layout` restored the full Graphify default to the
  original-style `forceAtlas2Based` orbital layout while preserving the
  interaction fixes, HUD, debounce, and Open Source integration.
- Handoff: `progress/impl_graphify_restore_orbital_layout.md`
- `graphify_node_text_tooltips` replaced raw HTML node/edge hover text with
  clean, useful Graphify tooltip cards and improved compact labels.
- Handoff: `progress/impl_graphify_node_text_tooltips.md`
- `agent_memory_harness_performance` added `agent:brief` and `graph:status`,
  refreshed agent docs and Graphify artifacts, added the Obsidian Agent
  Navigation Index, resolved the daily plus weekly automation cadence, updated
  the nightly Hedge Fund automation, and created a weekly read-only health
  report automation.
- Handoff: `progress/impl_agent_memory_harness_performance.md`

## Next Step

Add a route quick-switch/favorites layer only if the route count keeps growing
past what fits comfortably in the 52px rail.
