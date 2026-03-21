# Harvard Donor Audit

Milestone 1 donor repository:
- `C:\Users\leonard\Documents\trading-harvard\Harvard-Algorithmic-Trading-with-AI`

Scope reviewed:
- `backtest/bb_squeeze_adx.py`
- `backtest/template.py`
- `backtest/data.py`
- `backtest/data/*.csv`
- `research/README.md`

What is useful:
- the RBI framing: research -> backtest -> implement
- the BB Squeeze ADX concept as a first donor strategy
- donor CSV datasets as explicit historical inputs for milestone 1

What is not portable enough to reuse directly:
- `TA-Lib` dependency
- `backtesting.py` dependency
- hardcoded absolute paths
- donor scripts that fetch network data inline

Milestone 1 adaptation rule:
- use donor code as idea source, not as drop-in runtime
- reimplement indicator logic inside `backend/hyperliquid_gateway/backtesting/`
- keep reports reproducible in local JSON files
- treat donor CSVs as explicit inputs until gateway-native historical storage is ready

Outputs written by the new CLI:
- doctor audits under `backend/hyperliquid_gateway/data/audits/`
- backtest reports under `backend/hyperliquid_gateway/data/backtests/`
- paper candidates under `backend/hyperliquid_gateway/data/paper/`
