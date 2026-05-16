# Cross-Symbol Momentum Rotational — Implementation Complete

## Changed Files

| File | Description |
|------|-------------|
| `docs/strategies/cross-symbol-momentum-rotational.md` | Strategy spec: hypothesis, ranking, entry, risk, validation |
| `backend/hyperliquid_gateway/strategies/cross_symbol_momentum_rotational/__init__.py` | Module exports, STRATEGY_ID/NAME/VERSION |
| `backend/hyperliquid_gateway/strategies/cross_symbol_momentum_rotational/logic.py` | compute_momentum_score, rank_symbols, select_baskets, evaluate_signal |
| `backend/hyperliquid_gateway/strategies/cross_symbol_momentum_rotational/risk.py` | Rank-drop kill, volume kill, funding kill, market-wide crash kill, session killswitch, position sizing |
| `backend/hyperliquid_gateway/strategies/cross_symbol_momentum_rotational/scoring.py` | Multi-factor basket scoring (momentum, liquidity, dispersion, coherence) |
| `backend/hyperliquid_gateway/strategies/cross_symbol_momentum_rotational/paper.py` | Basket entry/exit simulation with volume-based slippage |
| `backend/hyperliquid_gateway/strategies/cross_symbol_momentum_rotational/spec.md` | Backend spec mirroring strategy design |

## Not Changed

`app.py` — **no modifications needed**. Unlike the microstructure strategy, this uses EXISTING data from `market_snapshots`.

## Verification

- `hf:doctor` → OK (strategy_count: 28)
- Python syntax → all modules valid
- No regressions in existing strategies

## How This Is Testable NOW

The existing `market_snapshots` table has:
- `change24h_pct` → used for 24h momentum component
- Via `build_market_data` in backtesting: `change1h`, `change4h` derived from price history
- `volume24h`, `fundingRate`, `opportunityScore` → filters and risk
- `price` → position sizing

Backtest can run immediately using `load_sampled_market_snapshots()` + `build_market_data()`.

## What Makes This Strategy Different

| Aspect | Existing strategies | This strategy |
|--------|-------------------|---------------|
| Direction | Single-side (long or short) | **Long-short market-neutral** |
| Assets | Single symbol (BTC or per-symbol) | **Cross-symbol basket (up to 6)** |
| Horizon | 1h-4h or daily | **15-min rebalance** |
| Signal | Funding/OI/Price action | **Relative momentum ranking** |
| Edge source | Single-sym mean reversion/trend | **Cross-sectional momentum factor** |
| Risk | Directional BTC exposure | **Market-neutral (hedged)** |

## Next Actions

1. Run backtest: `python3 -c "from backend.hyperliquid_gateway.strategies.cross_symbol_momentum_rotational.logic import evaluate_signal; ..."` against market_snapshots data
2. Register in backtesting registry if desired
3. Phase 2: paper trading
