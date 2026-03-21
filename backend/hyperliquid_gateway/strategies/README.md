# Backend Strategy Modules

This folder is the intended home for strategy logic that should run outside the Electron renderer.

Use one folder per strategy:

- `backend/hyperliquid_gateway/strategies/<strategy-id>/`

Recommended contents:

- `logic.py` for deterministic signal logic
- `scoring.py` for ranking and setup scores
- `risk.py` for invalidations, guards, and sizing rules
- `paper.py` for paper-trading or replay helpers
- `spec.md` mirroring the strategy design

Rules:

- heavy compute belongs here, not in React pages
- strategy logic should be inspectable and deterministic
- anything long-running should be suitable for Docker or an external service
- UI code should consume outputs from this layer through APIs
