# Strategy Memory Actionable Cleanup

- Task: `strategy_memory_actionable_cleanup`
- Agent: Codex
- Mission class: UI review-speed audit
- Status: ready for review
- Date: 2026-05-07

## Summary

Converted `/memory` from a raw graph/type-filter surface into an actionable
strategy memory view. The default route now prioritizes strategy review cards,
actionable lenses, evidence completeness, blockers, memory-note counts, and a
scoped evidence graph.

## Changed Files

- `src/features/memory/pages/MemoryGraphPage.tsx`
  - Added local strategy memory summary and lens helpers.
  - Replaced raw type/stage controls with `Actionable`, `Paper Ready`,
    `Blocked`, `Needs Backtest`, `Docs Only`, and `All` lenses.
  - Moved strategy cards into the first review surface with stage/gate status,
    blockers, backtest metrics, evidence completeness, memory-note counts, and
    detail/focus actions.
  - Scoped the Obsidian graph to the selected strategy or current lens
    neighborhood so docs, backend packages, artifacts, and notes support the
    selected review context.
  - Changed raw node counts into a passive legend and expanded the inspector
    to show next review, evidence, blockers, and source paths.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md`
  - Registered, tracked, and recorded this implementation.

## Verification

- Passed: `npm run build`
- Passed: `npm run gateway:probe`
- Passed: `npm run agent:check`
- Passed: browser smoke for `http://localhost:5173/memory`
  - `Actionable Strategy Memory`, `Strategy Review Queue`, lenses, strategy
    cards, `Evidence Neighborhood`, `Node Inspector`, and passive node legend
    rendered.
  - `Blocked` lens was clickable.
  - Search for `long_flush` surfaced `Long Flush Continuation`,
    `long_flush_continuation`, and `long-flush-continuation.md`.
  - No `Module Error` after the final reload.

## Safety

- No backend strategy logic changed.
- No public backend API changed.
- No Electron IPC or Obsidian sync contract changed.
- No trading, credential, gateway, or runtime state changes performed.

## Risks And Next Action

- Browser dev logs retain a stale `midY` error from an intermediate hot-reload
  before the SVG curve fix; the final route reload rendered without module
  error and the final production build passed.
- Next reviewer should smoke `/memory` inside the Electron window with an
  active Obsidian vault and try `Open Vault`, `Sync Obsidian`, one blocked
  strategy, and one docs-only strategy.

## Memory

Shared curated memory was intentionally unchanged. This is a renderer review
surface improvement, not a durable operating decision beyond the task/report
files.
