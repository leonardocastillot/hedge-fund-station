# Strategy Pipeline Actionable Focus Handoff

## Summary

Implemented the actionable-first Strategy Pipeline requested by the human. The
`/strategies` page now opens to a Pipeline tab with only actionable/evidence
rows, while the complete 11-row catalog remains available under All Strategies.
UI backtest actions now use bounded local gateway defaults instead of the prior
heavy `3650` day request.

## Changed Files

- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`
- `src/services/hyperliquidService.ts`
- `src/services/strategyService.ts`
- `src/features/strategies/pages/StrategyLibraryPage.tsx`
- `src/features/strategies/pages/StrategyDetailPage.tsx`
- `src/features/strategies/strategyPipelineModel.ts`
- `src/features/strategies/components/StrategyPipelineBoard.tsx`
- `src/features/strategies/components/StrategyInventory.tsx`
- `src/features/strategies/components/BacktestEvidencePanels.tsx`
- `src/features/strategies/components/PaperBaselinePanel.tsx`

## Implementation Notes

- Added `strategy_pipeline_actionable_focus` to the file-based harness and
  marked this implementation ready for review.
- Split the Strategy Pipeline page into:
  - actionable pipeline model and sorting/grouping helpers
  - pipeline board/cards
  - complete inventory with quick filters
- Changed the Pipeline default to exclude docs-only/research-only rows. Current
  local catalog smoke: 11 total strategies, 9 actionable/registered, 2
  docs-only rows in inventory only.
- Changed Hyperliquid UI backtest client calls to:
  - `runBacktest(strategyId, { lookbackDays, runValidation, buildPaperCandidate })`
  - `ensureBacktest(strategyId, { lookbackDays, runValidation, buildPaperCandidate })`
  - default UI lookback is 3 days, validation true, paper candidate false.
- Changed Strategy Detail to check Hyperliquid audit/catalog evidence before
  legacy/alpha fallbacks and to load backtest artifacts by GET on open instead
  of auto-generating missing backtests.
- Extracted backtest artifact/trade UI and paper baseline UI out of
  `StrategyDetailPage.tsx`.

## Verification

- `npm run agent:check` passed.
- `python3 -m unittest tests.test_strategy_catalog tests.test_backtest_filters tests.test_backtest_fees_and_scalper` passed: 32 tests.
- `npm run build` passed.
- `npm run gateway:probe` passed: all probed local gateway endpoints returned
  HTTP 200.
- HTTP smoke:
  - catalog count: 11
  - registered strategies: 9
  - docs-only: `polymarket_btc_updown_5m_maker_basis_skew`,
    `polymarket_btc_updown_5m`
  - `bb_squeeze_adx/latest`: 203 trades loaded
  - docs-only latest backtest returned HTTP 404 without triggering generation
- Browser smoke through the in-app browser:
  - `/strategies` opened on Pipeline with 9 actionable rows
  - docs-only strategy text count on visible Pipeline was 0
  - All Strategies tab showed the full 11-row inventory
  - client navigation to `bb_squeeze_adx` detail showed Backtest Artifacts,
    Trades Ledger, `203 expected`, `backtest loaded`, and `UI default lookback
    3d`
  - no visible `not registered for backtesting` error

## Risks And Assumptions

- The repo already had many dirty changes before this task. This implementation
  preserved them and only layered the requested UI/client changes on top.
- Direct deep-link preview under `vite preview` can still serve relative assets
  blank on nested routes because the built Electron HTML uses relative asset
  paths. Client-side navigation from `/strategies` works. This was not changed
  because switching build base may affect packaged Electron file loading.
- Memory was intentionally unchanged; this is an implementation handoff, not a
  durable architecture decision.

## Next Action

Reviewer should inspect the new strategy components, confirm the task remains
renderer/client only, and run the same build plus browser smoke if the app
shell changes again.
