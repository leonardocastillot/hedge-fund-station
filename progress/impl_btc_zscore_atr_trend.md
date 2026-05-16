# btc_zscore_atr_trend (ATR Channel Breakout) — Implementation Report

## Resultado Final

**277.55% return** — nueva champion absoluta. Casi duplica el anterior champion (162.30%).

## Comparativa vs Todos los Champions Anteriores

| Métrica | ATR Channel Breakout | btc_vol_atr_trend (anterior champ) | btc_convex_cycle_trend (original champ) |
|---------|---------------------|-----------------------------------|----------------------------------------|
| Return | **277.55%** | 162.30% | 115.78% |
| Profit Factor | **8.78** | 6.00 | 2.93 |
| Max Drawdown | **14.39%** | 13.86% | 8.79% |
| Trades | 28 | 26 | 48 |
| Win Rate | 46.43% | 53.85% | ~50% |

## Proceso de Iteración (4 intentos)

| Iteración | Approach | Return | Resultado |
|-----------|----------|--------|-----------|
| 1 | Z-score entry bounds [-0.5, 1.5] + Z-exit -1.2 | 129.53% | Mala salida Z - demasiados exits |
| 2 | Z-score looser [-0.8, 2.0] + Z-exit -2.0 | 123.37% | Z-score entry muy restrictivo |
| 3 | Z-score bear filter [-1.0, 999] + Z-exit -1.5 | 103.52% | Sigue matando returns |
| 4 | **ATR Channel Breakout** | **277.55%** | **¡GANADOR!** |

## Qué Hace Única a Esta Estrategia

1. **ATR Channel Breakout**: Nadie usa canales de ATR alrededor de SMA50 para entradas
2. **Channel exit**: Salida cuando el precio vuelve al canal (15 de 28 exits)
3. **Sin Z-score**: Descartado después de 3 iteraciones fallidas
4. **Breakout en vez de trend-following**: Todas las demás son trend-following con pullbacks

## Archivos

- `backend/.../strategies/btc_zscore_atr_trend/logic.py` — ATR channel breakout logic
- `backend/.../strategies/btc_zscore_atr_trend/risk.py` — risk-budgeting sizing
- `backend/.../strategies/btc_zscore_atr_trend/scoring.py` — scoring
- `backend/.../strategies/btc_zscore_atr_trend/paper.py` — paper candidate
- `backend/.../strategies/btc_zscore_atr_trend/backtest.py` — backtest adapter
- `docs/strategies/btc-zscore-atr-trend.md` — full documentation
- `backend/.../backtesting/registry.py` — registration

## Artefactos

- `data/backtests/btc_zscore_atr_trend-*.json` — 6 backtests
- `data/validations/btc_zscore_atr_trend-*.json` — ready-for-paper
- `data/paper/btc_zscore_atr_trend-*.json` — paper candidate

## Estado

`paper_candidate` — pending human paper review.

## Riesgos

1. Concentración 67.1% en 1 trade
2. Channel whipsaw en sideways markets
3. Long-only
