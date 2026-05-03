# Renderer Feature Modules

The renderer is organized by product surface. Shared infrastructure stays in
`src/services`, `src/contexts`, `src/types`, `src/hooks`, and
`src/components/ui`.

- `cockpit/` owns the main mission surface, the official BTC route, and
  backend-owned internal routes such as macro calendar and Polymarket review.
- `hyperliquid/` owns market intelligence and gateway data review pages.
- `paper/` owns paper-trade and portfolio review surfaces.
- `strategies/` owns strategy library and detail pages.
- `liquidations/` owns liquidation pressure review pages and local components.
- `agents/` owns commander, fleet, mission, and knowledge-dock UI.
- `settings/` owns operator configuration screens.

Do not put backend strategy logic in these folders. If a feature needs
replay, persistence, validation, or paper execution, implement it in the
backend and expose inspectable outputs to the renderer.

The visible cockpit navigation is intentionally narrow: Cockpit, BTC,
Hyperliquid, Strategies, Paper, Liquidations, Portfolio, Data, Workbench, and
Settings. Routes without one of those roles should be deleted or documented as
temporary internal review surfaces before they accumulate UI logic.
