# btc_vol_atr_trend — Implementation Report

## Summary

Nueva estrategia **BTC Volatility-Regime ATR Trend** — completamente distinta a las 17 existentes. Usa ATR trailing stops dinámicos, risk-budgeting vía ATR, y detección de régimen de volatilidad.

## Resultados vs Champion

| Métrica | btc_vol_atr_trend | btc_convex_cycle_trend (champion) | Delta |
|---------|------------------|----------------------------------|-------|
| Return (500 USD taker) | **162.30%** | 115.78% | **+46.52%** |
| Profit Factor | **6.00** | 2.93 | **2.05×** |
| Win Rate | 53.85% | ~50% | +3.85pp |
| Max Drawdown | **13.86%** | 8.79% | +5.07pp |
| Trades | 26 | 48 | -22 |
| Avg Trade Return | **45.54%** | 2.41% | 18.9× |
| Largest Trade Share | 60.81% | — | — |

## Diferencias Clave Respecto a Estrategias Existentes

1. **ATR trailing stop dinámico** (4.8× ATR del peak) vs trailing fijo de 15%
2. **Risk-budgeting** via ATR (size = risk% / stop%) vs fracción fija
3. **Detector de régimen de volatilidad** (percentil ATR de 252d)
4. **SMA200** como filtro de tendencia vs SMA150
5. **Time stop** de 200 días

## Archivos Creados/Modificados

- `backend/.../strategies/btc_vol_atr_trend/logic.py` — lógica completa
- `backend/.../strategies/btc_vol_atr_trend/risk.py` — sizing ATR risk-budgeting
- `backend/.../strategies/btc_vol_atr_trend/scoring.py` — ranking con régimen de vol
- `backend/.../strategies/btc_vol_atr_trend/paper.py` — paper candidate
- `backend/.../strategies/btc_vol_atr_trend/backtest.py` — backtest adapter
- `backend/.../strategies/btc_vol_atr_trend/spec.md` — spec actualizado
- `docs/strategies/btc-vol-atr-trend.md` — documentación completa
- `backend/.../backtesting/registry.py` — registro + import

## Artefactos Generados

- `data/backtests/btc_vol_atr_trend-*.json` — 10 backtests iterativos
- `data/validations/btc_vol_atr_trend-*.json` — validation: ready-for-paper
- `data/paper/btc_vol_atr_trend-*.json` — paper candidate

## Estado de Promoción

`backtest_validated` → `paper_candidate` → ~~`production_candidate`~~ (blocked)

## Siguiente Acción

Paper review humano. Si se aprueba, pasar a paper runtime ticks en Hyperliquid.

## Riesgos

1. Concentración en 1 trade (60.81% del PnL) — normal en trend following
2. Drawdown 13.86% vs champion 8.79% — mayor pero aceptable
3. ATR es rezagado — spikes súbitos de vol pueden no filtrarse a tiempo
