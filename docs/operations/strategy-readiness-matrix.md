# Strategy Readiness Matrix

This matrix is the cleanup-era source of truth for which strategies are real
backend assets, which are only scaffolds, and what evidence exists for review.
Validation thresholds live in
`docs/operations/strategy-validation-thresholds.md` and mirror the backend
registry.

## Current Backtest Standard

- First research cycle is BTC-first: run Hyperliquid snapshot strategies with
  `--symbol BTC` before expanding to `--symbols BTC,ETH,SOL,HYPE` or
  `--universe all`.
- `btc_guarded_cycle_trend` has an operator-sized `500_usd_validated` profile:
  `--equity 500 --risk-fraction 0.10 --fee-model taker`, no leverage, no
  shorts, and one matching BTC paper position. Leverage variants are
  research-only until separately backtested, validated, paper-reviewed, and
  stability-audited.
- `btc_adaptive_cycle_trend` is the 500 USD paper-ready benchmark challenger:
  `--equity 500 --risk-fraction 0.20 --fee-model taker`, no leverage, no
  shorts, and validation only passes if the report beats `btc_guarded_cycle_trend`
  at `89.53%` net return.
- `btc_convex_cycle_trend` is the current BTC daily 500 USD factory challenger:
  `--equity 500 --risk-fraction 0.25 --fee-model taker`, no leverage, no
  shorts, and validation only passes if the report beats
  `btc_adaptive_cycle_trend` at `94.39%` net return.
- BTC candidates must pass the robust gate in backend artifacts before paper
  review: at least 30 trades, positive net return after costs, profit factor
  >=1.30, max drawdown <=3.5%, average net trade return >=0.12%, and no
  one-trade concentration.
- Scalper candidates use the stricter high-frequency gate: at least 60 BTC
  trades plus the same profitability, drawdown, cost, and concentration checks.
- Multi-ticker runs are comparison evidence, not permission to promote a weak
  BTC result.

| Strategy | Spec | Backend | Backtest | Validation | Paper | UI Review | Current Stage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `bb_squeeze_adx` | `docs/strategies/bb-squeeze-adx.md` | full package with `backtest.py` | curated smoke artifact | curated smoke validation | curated smoke candidate | strategy library/detail and portfolio surfaces | paper example, not live |
| `breakout_oi_confirmation` | `docs/strategies/breakout-oi-confirmation.md` | full package with `backtest.py` | initial artifact generated when requested | validation required before paper | missing paper artifact | backend artifact review first | registered/backtest-ready |
| `btc_adaptive_cycle_trend` | `docs/strategies/btc-adaptive-cycle-trend.md` | full package with `backtest.py` | official 500 USD artifact returned `94.39%` net after fees | ready-for-paper; beat the 89.53% paper-ready benchmark by `4.86` pp | official paper candidate generated | backend artifact review first | daily trend paper candidate |
| `btc_convex_cycle_trend` | `docs/strategies/btc-convex-cycle-trend.md` | full package with `backtest.py` | factory smoke artifact returned `115.78%` net after fees | ready-for-paper; beat `btc_adaptive_cycle_trend` by `21.39` pp | paper candidate generated | backend artifact review first | daily trend paper candidate |
| `btc_crowding_scalper` | `docs/strategies/btc-crowding-scalper.md` | full package with `backtest.py` | archived on VM, not kept locally | archived on VM, not kept locally | missing paper artifact | backend artifact review first | registered/backtest-ready |
| `btc_guarded_cycle_trend` | `docs/strategies/btc-guarded-cycle-trend.md` | full package with `backtest.py` | generated when requested from BTC daily history; official `500_usd_validated` profile uses `500 USD` equity | validation required before paper | generated only after validation | backend artifact review first | daily trend paper candidate |
| `btc_fee_aware_failed_impulse_scalp` | `docs/strategies/btc-fee-aware-failed-impulse-scalp.md` | full package with `backtest.py` | generated when requested | validation required before paper | missing paper artifact | backend artifact review first | research/backtest candidate |
| `funding_exhaustion_snap` | `docs/strategies/funding-exhaustion-snap.md` plus validation note | full package with `backtest.py` | curated smoke artifact | curated smoke validation | missing paper artifact | Hyperliquid strategy review surfaces | validation blocked |
| `btc_failed_impulse_reversal` | `docs/strategies/btc-failed-impulse-reversal.md` | full package with `backtest.py` | archived on VM, not kept locally | archived on VM, not kept locally | archived on VM, not kept locally | strategy library and Paper Lab | registered/backtest-ready |
| `btc_failed_impulse_balanced_fast` | `docs/strategies/btc-failed-impulse-balanced-fast.md` | full package with `backtest.py` | archived on VM, not kept locally | archived on VM, not kept locally | missing paper artifact | strategy library and Paper Lab | registered/backtest-ready |
| `long_flush_continuation` | `docs/strategies/long-flush-continuation.md` | full package with `backtest.py` | archived on VM, not kept locally | archived on VM, not kept locally | missing paper artifact | Hyperliquid strategy review surfaces | registered/backtest-ready |
| `liquidation_pressure_flip_reversal` | `docs/strategies/liquidation-pressure-flip-reversal.md` | full package with `backtest.py` | initial artifact generated when requested | validation required before paper | missing paper artifact | backend artifact review first | registered/backtest-ready |
| `oi_expansion_failure_fade` | `docs/strategies/oi-expansion-failure-fade.md` | full package with `backtest.py` | archived on VM, not kept locally | archived on VM, not kept locally | missing paper artifact | Hyperliquid strategy review surfaces | registered/backtest-ready |
| `one_bitcoin` | `docs/strategies/one-bitcoin.md` | full package with `backtest.py` | generated from curated fixture when needed | generated validation artifact when needed | intentionally blocked | strategy library/detail only | accumulation research only |
| `polymarket_btc_5m_maker_basis_skew` | `docs/strategies/polymarket-btc-5m-maker-basis-skew.md` | full package with `backtest.py` | archived on VM, not kept locally | archived on VM, not kept locally | missing paper artifact | internal Polymarket route plus BTC research route | registered/backtest-ready |
| `polymarket_btc_updown_5m_oracle_lag` | `docs/strategies/polymarket-btc-updown-5m-oracle-lag.md` | full package with `backtest.py` | curated smoke artifact | curated smoke validation | missing paper artifact | internal Polymarket route plus BTC research route | validation only |
| `polymarket_btc_updown_5m` | research note only | none | none | none | none | none | docs-only research note |
| `short_squeeze_continuation` | `docs/strategies/short-squeeze-continuation.md` plus backend `spec.md` | full package with `backtest.py` | latest BTC-first artifact | latest validation blocked by robust gate | none promoted | Hyperliquid strategy review surfaces | research/backtest blocked |

## Cleanup Decisions

- Keep backend strategy packages unless the matrix shows a strategy is only a
  scaffold and a human explicitly asks to remove it.
- Keep small curated smoke artifacts and one latest non-smoke artifact only
  when no smoke equivalent exists.
- Treat generated JSON under `backend/hyperliquid_gateway/data/` as evidence,
  not source logic. New large runtime reports should stay local unless they are
  intentionally promoted as curated examples.
- Internal UI routes may remain for inspection when they have a backend owner.
  The core navigation should stay focused on Cockpit, BTC, Hyperliquid,
  Strategies, Paper, Data, Liquidations, Portfolio, Workbench, and Settings.

## Next Cleanup Candidates

- Keep `short_squeeze_continuation` as a real backend asset and rerun it through
  BTC-first robust validation.
- Add paper-candidate artifacts for the validated non-paper strategies before
  claiming they are production-ready.
- Treat `breakout_oi_confirmation` and `liquidation_pressure_flip_reversal` as
  new research/backtest candidates until they survive costs, robust gates,
  replay review, and paper evidence.
- Treat `btc_fee_aware_failed_impulse_scalp` as the repair path for the stale
  `btc_momentum_oi_swing_benchmark` handoff. It must beat same-window BTC hold
  after costs and use 30/60/90 day VM windows before any paper discussion.
- Keep Polymarket maker-basis under the registered
  `polymarket_btc_5m_maker_basis_skew` ID. The older up/down maker-basis doc
  was duplicate context and should not return as a separate strategy ID.
