# Implementation Report: strategy_validation_thresholds

## Objective

Make validation thresholds visible per strategy and keep them aligned with the
backend registry.

## Changes Made

- Added `docs/operations/strategy-validation-thresholds.md` with every
  registered strategy's current `ValidationPolicy`.
- Linked the threshold document from `docs/strategies/README.md` and
  `docs/operations/strategy-readiness-matrix.md`.
- Updated the readiness matrix to include the currently relevant registered and
  docs-only strategies.
- Removed the duplicate Polymarket maker-basis doc so the registered ID remains
  `polymarket_btc_5m_maker_basis_skew`.

## Verification

- Thresholds were mirrored from
  `backend/hyperliquid_gateway/backtesting/registry.py`.
- Full final verification is recorded in
  `progress/impl_aggressive_cleanup_queue_closeout.md`.

## Risks And Next Action

- The backend registry remains the executable source of truth.
- Future threshold changes must update the registry, this document, and the
  readiness matrix together.
