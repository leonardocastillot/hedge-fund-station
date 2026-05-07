# Strategy Pipeline Inventory Cleanup

## Objective

Make every created strategy visible in the application and clean the pipeline review state without hiding failed work or promoting weak strategies.

## Scope

- `docs/strategies/`
- `backend/hyperliquid_gateway/strategies/`
- `backend/hyperliquid_gateway/backtesting/registry.py`
- `backend/hyperliquid_gateway/data/backtests/`
- `backend/hyperliquid_gateway/data/validations/`
- `src/features/strategies/pages/StrategyLibraryPage.tsx`
- `tests/`
- `agent_tasks.json`, `progress/`

## Changes Made

- Promoted optimizer variant `default_signal__balanced_fast` into a named strategy:
  `btc_failed_impulse_balanced_fast`.
- Added docs and a backend package for the new strategy while wrapping the parent
  BTC Failed Impulse logic with fixed balanced-fast parameters.
- Registered `btc_failed_impulse_balanced_fast` in the stable backtest registry.
- Added an all-strategy inventory section to `/strategies` so every catalog row
  is visible even when it is blocked, docs-only, or paper-ready.
- Kept failed or incomplete strategies visible with cleanup state instead of
  deleting evidence or treating them as candidates.

## Files Changed

- `docs/strategies/btc-failed-impulse-balanced-fast.md` - strategy spec.
- `backend/hyperliquid_gateway/strategies/btc_failed_impulse_balanced_fast/` - named wrapper package.
- `backend/hyperliquid_gateway/backtesting/registry.py` - registered the new strategy.
- `src/features/strategies/pages/StrategyLibraryPage.tsx` - added all-strategy inventory and cleanup state.
- `tests/test_btc_failed_impulse_reversal.py` - covers registry exposure.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md` - harness state.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_strategy_catalog tests.test_btc_failed_impulse_reversal
npm run hf:backtest -- --strategy btc_failed_impulse_balanced_fast --symbol BTC --fee-model taker --lookback-days 3
npm run hf:validate -- --strategy btc_failed_impulse_balanced_fast --report backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_balanced_fast-hyperliquid-20260506T233333Z.json
npm run build
npm run gateway:restart
npm run gateway:probe
npm run hf:status
npm run hf:paper:supervisor -- status
```

Result:

- passed except `npm run hf:validate ...` intentionally exited `1` because the
  new strategy is blocked by robust gates.
- Generated backtest:
  `backend/hyperliquid_gateway/data/backtests/btc_failed_impulse_balanced_fast-hyperliquid-20260506T233333Z.json`.
- Generated validation:
  `backend/hyperliquid_gateway/data/validations/btc_failed_impulse_balanced_fast-20260506T233340Z.json`.
- Catalog smoke confirmed `btc_failed_impulse_balanced_fast` is visible with docs,
  backend module, registry, backtest artifact, validation artifact, and blocked
  gate reasons.
- Supervisor smoke confirmed the BTC paper-only loop remains running on
  `btc_failed_impulse_reversal`, `dryRun=false`.
- Supervisor health smoke reported `healthStatus=healthy`.

## Findings

- `btc_failed_impulse_balanced_fast` is now visible and registered, but its first
  normal workflow backtest is not paper-ready:
  - return: 0.41%
  - trades: 11
  - win rate: 54.55%
  - profit factor: 2.88
  - max drawdown: 0.11%
  - validation status: `blocked`
  - blockers: `robust_gate`, `robust:positive_net_return`,
    `robust:max_largest_trade_pnl_share_pct`
- The app now exposes docs-only cleanup rows, including unimplemented Polymarket
  docs, as `Docs Only` instead of making them look like validated candidates.
- The existing BTC paper runtime remains unchanged and continues collecting
  paper evidence for `btc_failed_impulse_reversal`.

## Memory Updated

- intentionally unchanged: this is UI/catalog cleanup plus a named strategy
  package; the durable evidence lives in artifacts and strategy docs.

## Assumptions

- Failed or incomplete strategies should remain visible in the app, not deleted,
  because they are useful review evidence.
- Cleanup means clear catalog state and blocked reasons, not removing research
  history.
- No strategy variant should be promoted to paper/live without passing the
  normal gates.

## Next Best Step

Use the inventory to triage blocked strategies, then either improve
`btc_failed_impulse_balanced_fast` until it passes robust gates or keep the
paper loop focused on `btc_failed_impulse_reversal` while it collects enough
closed paper trades.
