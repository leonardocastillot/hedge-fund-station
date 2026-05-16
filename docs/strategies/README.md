# Strategies Folder

This folder is the documentation layer for strategy research.

Each strategy should have its own file:

- `docs/strategies/<strategy-id>.md`

Asset-level idea organization lives under `docs/assets/<ASSET>/`. Use asset
folders as ticker workspaces for rough theses, idea inboxes, and review notes.
Do not move canonical strategy specs out of `docs/strategies/`.

Recommended template:

## Name

Short name and one-line summary.

## Hypothesis

Why this should have edge.

## Market Regime

When it should and should not be active.

## Inputs

Required data, features, and dependencies.

## Entry

Exact trigger conditions.

## Invalidation

What breaks the setup.

## Exit

Profit-taking, time stop, or structural exit.

## Risk

Sizing, max exposure, session kill-switches.

## Costs

Fees, slippage, latency assumptions.

## Validation

Backtest, replay, and paper-trade plan.

Per-strategy validation thresholds are tracked in
`docs/operations/strategy-validation-thresholds.md` and must match the backend
registry in `backend/hyperliquid_gateway/backtesting/registry.py`.

## Failure Modes

Where the strategy is likely to break.

## Backend Mapping

Point to the implementation folder under:

- `backend/hyperliquid_gateway/strategies/<strategy-id>/`
