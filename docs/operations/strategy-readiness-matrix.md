# Strategy Readiness Matrix

This matrix is the cleanup-era source of truth for which strategies are real
backend assets, which are only scaffolds, and what evidence exists for review.

| Strategy | Spec | Backend | Backtest | Validation | Paper | UI Review | Current Stage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `bb_squeeze_adx` | `docs/strategies/bb-squeeze-adx.md` | full package with `backtest.py` | curated smoke artifact | curated smoke validation | curated smoke candidate | strategy library/detail and portfolio surfaces | paper example, not live |
| `funding_exhaustion_snap` | `docs/strategies/funding-exhaustion-snap.md` plus validation note | full package with `backtest.py` | curated smoke artifact | curated smoke validation | missing paper artifact | Hyperliquid strategy review surfaces | validation only |
| `polymarket_btc_5m_maker_basis_skew` | `docs/strategies/polymarket-btc-5m-maker-basis-skew.md` | full package with `backtest.py` | latest curated Hyperliquid artifact | latest curated validation | missing paper artifact | internal Polymarket route plus BTC research route | validation only |
| `polymarket_btc_updown_5m_oracle_lag` | `docs/strategies/polymarket-btc-updown-5m-oracle-lag.md` | full package with `backtest.py` | curated smoke artifact | curated smoke validation | missing paper artifact | internal Polymarket route plus BTC research route | validation only |
| `short_squeeze_continuation` | backend `spec.md`; docs template only | scaffold missing `__init__.py` and `backtest.py` | none | none | none | none | research scaffold |

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

- Promote or delete `short_squeeze_continuation` after a real strategy spec is
  written.
- Add paper-candidate artifacts for the validated non-paper strategies before
  claiming they are production-ready.
- Resolve the Polymarket naming mismatch between the maker-basis docs and the
  older up/down maker-basis research note.
