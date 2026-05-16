# Asset Workspaces

Asset workspaces organize ticker-level strategy work before and around the
official strategy lifecycle.

Use one folder per asset:

- `docs/assets/BTC/`
- `docs/assets/ETH/`
- `docs/assets/SOL/`

Each asset folder may contain:

- `README.md` for the asset desk index.
- `ideas/` for rough theses and candidate strategy notes.
- `reviews/` for human or agent review notes scoped to that ticker.

Canonical strategy specs still live in `docs/strategies/<strategy-id>.md`.
Backend logic still lives in
`backend/hyperliquid_gateway/strategies/<strategy_id>/`.
Generated backtests, validations, paper candidates, audits, and agent run
evidence still live under `backend/hyperliquid_gateway/data/`.

Do not move official strategy files into asset folders. Link them from the asset
workspace instead.
