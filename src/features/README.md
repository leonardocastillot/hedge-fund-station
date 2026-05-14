# Renderer Feature Modules

The renderer is organized by product surface. Shared infrastructure stays in
`src/services`, `src/contexts`, `src/types`, `src/hooks`, and
`src/components/ui`.

- `stations/` owns fixed trading stations: Hedge Fund Station as the Research OS
  home and Live Trading as a safe monitor/review surface.
- `cockpit/` owns the cockpit module, the official BTC route, and
  backend-owned internal routes such as macro calendar and Polymarket review.
- `hyperliquid/` owns market intelligence and gateway data review pages.
- `paper/` owns paper-trade and portfolio review surfaces.
- `strategies/` owns strategy library and detail pages.
- `memory/` owns the Strategy Memory explorer, vault sync surface, and the
  separate Repo Graph route. `/memory` visualizes backend strategy catalog rows,
  repo evidence artifacts, Obsidian notes, and learning events.
  `/repo-graph` loads the heavier Graphify repository map only when needed.
  Backend/docs/artifacts remain the source of truth.
- `liquidations/` owns liquidation pressure review pages and local components.
- `agents/` owns commander, fleet, mission, and knowledge-dock UI.
- `desks/` owns the active Desk Space at `/workbench`: desk stats, browser
  tabs, scoped agent surfaces, and scoped terminal evidence.
- `settings/` owns operator configuration screens.

Do not put backend strategy logic in these folders. If a feature needs
replay, persistence, validation, or paper execution, implement it in the
backend and expose inspectable outputs to the renderer.

The visible cockpit navigation is intentionally narrow: Cockpit, BTC,
Hyperliquid, Strategies, Memory, Repo Graph, Paper, Liquidations, Portfolio,
Data, Desk Space, and Settings. Fixed trading stations sit above that module set.
Routes without one of those roles should be deleted or documented as temporary
internal review surfaces before they accumulate UI logic.

Use **Trading Stations** for fixed product surfaces and **Desks** for
filesystem-backed Electron workspaces. The `Workspace` model is for desks,
commands, browser tabs, terminals, agents, and vaults; it is not the source of
trading truth. `/workbench` is the selected desk's complete working room, not a
hedge fund product station.
Desks are explicitly classified as `hedge-fund`, `command-hub`, `project`, or
`ops`, so unrelated side projects and the global terminal hub do not inherit
hedge fund commands or agents.
