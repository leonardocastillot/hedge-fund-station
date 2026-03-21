# Terminal Operations

Milestone 1 establishes a stable command surface for agents and humans:

Commands:
- `npm run hf:doctor`
- `npm run hf:strategy:new -- --strategy-id my_strategy`
- `npm run hf:backtest`
- `npm run hf:validate`
- `npm run hf:paper`
- `npm run hf:status`

Command contract:
- the CLI entrypoint is `scripts/hf.py`
- heavy strategy logic stays in `backend/hyperliquid_gateway/`
- the renderer should consume reports or backend APIs, never own the trading logic

Base flow:
1. research a strategy and document it in `docs/strategies/`
2. implement backend strategy modules
3. run `hf:backtest` with explicit datasets to generate a backend-native backtest report
4. run `hf:validate` to gate research package completeness plus backtest thresholds
5. run `hf:paper` to create a reviewable paper candidate artifact with promotion path toward production candidate
6. expose reports to UI later through read-only services

Milestone 1 note:
- `hf:paper` creates a candidate artifact, not a live executor
- `hf:status` summarizes generated artifacts
- `hf:doctor` also records the donor audit snapshot

Milestone 2 note:
- validation artifacts are stored under `backend/hyperliquid_gateway/data/validations/`
- `hf:status` now reports research/backtest/validation/paper progress inside `hyperliquid_gateway`
- strategy registries should live in backend modules, not inside CLI-only conditionals
- each artifact now carries lineage so `paper` can resolve the matching validation for the exact backtest report
- use `hf:validate --report <path>` and `hf:paper --report <path> --validation <path>` when you need strict artifact pinning
