# Continuous Improvement Backlog

This backlog is the default queue for agents that are asked to keep improving
Hedge Fund Station over time.

Agents may add items here, but should keep entries specific, testable, and tied
to the product objective.

## Priority 0: Safety And Operating Clarity

- [ ] Confirm the canonical Hyperliquid gateway port story across Docker,
  tunnel scripts, app config, and docs.
- [ ] Add a short backend startup runbook under `docs/operations/`.
- [ ] Add a recurring health-check report format for `hf:doctor`, `hf:status`,
  and backend `/health`.
- [ ] Document which generated artifacts are curated examples versus local
  runtime evidence.

## Priority 1: Research And Validation Loop

- [ ] Add a strategy readiness matrix that shows spec, backend, backtest,
  validation, paper, and UI status for each strategy.
- [ ] Add explicit validation thresholds per strategy in docs and backend
  registration.
- [ ] Add replay requirements for each serious strategy.
- [ ] Add paper-trade review criteria that map outcomes back to strategy rules.

## Priority 2: Data Quality

- [ ] Create a data quality checklist for market snapshots, alerts,
  liquidations, paper signals, and paper trades.
- [ ] Add schema documentation for the gateway responses consumed by
  `src/services/`.
- [ ] Identify UI fields derived from fallback/legacy services and document
  their source of truth.

## Priority 3: Agent Efficiency

- [x] Add task templates for strategy work, backend work, UI work, data quality,
  and repo architecture.
- [x] Add a "new agent five-minute orientation" doc.
- [x] Consolidate agent docs under `docs/operations/agents/`.
- [x] Add shared agent memory under `docs/operations/agents/memory/`.
- [ ] Add a recommended recurring automation schedule once the human chooses
  cadence and notification style.
- [x] Add a standard PR/change-summary template for agent work.

## Priority 4: UI Review Speed

- [ ] Make strategy status inspectable from a single cockpit view.
- [ ] Surface validation blockers before paper promotion.
- [ ] Add drilldowns from watchlist rows to backend evidence.
- [ ] Make paper trade review show trigger, invalidation, execution quality, and
  post-trade lesson in one place.

## How Agents Should Use This Backlog

1. Pick the highest-priority item that matches the requested task.
2. Keep the patch small and reversible.
3. Update docs or checklist status when work is completed.
4. Update `memory/` when the work creates durable context.
5. Run the relevant verification command.
6. Leave a handoff that names the next best item.
