# Strategy Memory Graph Explorer Handoff

## Objective

Redesign the second half of `/memory` as an interactive Graphify-style explorer for strategy evidence, artifacts, Obsidian notes, and learning events.

## Scope

- `src/features/memory/`
- `src/features/README.md`
- `src/types/electron.d.ts`
- `electron/types/ipc.types.ts`
- `electron/main/native/obsidian-manager.ts`
- `docs/operations/agents/graph-memory-operating-system.md`
- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`
- `graphify-out/`

## Changes Made

- Added local graph dependencies `vis-network@10.0.3` and `vis-data@8.0.4`.
- Split Strategy Memory graph contracts and themes into `src/features/memory/memoryGraphTypes.ts`.
- Added `src/features/memory/components/StrategyMemoryGraphExplorer.tsx`, a vis-network graph workspace with search, strategy lens, learning lens, evidence filter, Focus, Neighborhood, Labels, Physics, Fit, Reset, HUD, legend, and graph tooltips.
- Refactored `MemoryGraphPage.tsx` so data loading stays in the page while graph rendering and interaction live in the new component.
- Reduced default noise with the `Agent Path` evidence filter and actionable strategy lens while keeping `Memory` and `All` filters available.
- Added an inspector `Agent Path` section with next action, missing evidence, source paths, evidence paths, and suggested stable `hf:*` commands.
- Added first-class `audit-artifact` typing and path inference for Obsidian graph nodes.
- Updated docs to define Strategy Memory as the strategy/evidence navigation surface, not the source of truth.
- Regenerated Graphify artifacts.

## Files Changed

- `src/features/memory/pages/MemoryGraphPage.tsx`: graph data shaping, filtering, inspector, Agent Path guidance, and page layout.
- `src/features/memory/components/StrategyMemoryGraphExplorer.tsx`: interactive graph workspace.
- `src/features/memory/memoryGraphTypes.ts`: shared graph types, node tones, lenses, and evidence filters.
- `electron/types/ipc.types.ts` and `src/types/electron.d.ts`: `audit-artifact` graph node type.
- `electron/main/native/obsidian-manager.ts`: audit artifact path inference.
- `docs/operations/agents/graph-memory-operating-system.md` and `src/features/README.md`: documented Strategy Memory role.
- `package.json` and `package-lock.json`: graph dependencies.
- `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, and `graphify-out/graph.html`: refreshed repo graph.

## Verification

Commands run:

```bash
npm run build
npm run graph:build
npm run graph:check
npm run agent:check
git diff --check
```

Result:

- passed: `npm run build`
- passed: `npm run graph:build`
- passed: `npm run graph:check`
- passed: `npm run agent:check` after adding explicit non-promotion gate language to the task notes
- passed: `git diff --check`
- passed: visual smoke on `/memory` using Electron Computer Use and Chrome CDP desktop/mobile screenshots

Smoke details:

- Desktop and mobile graph rendered a real canvas.
- Default state used `agent-path`, `actionable`, and `lessons`.
- Search `btc` reduced the strategy queue.
- `Artifacts` reduced the graph.
- `Labels`, `Physics`, `Fit`, `Neighborhood`, and `Focus` responded.
- Inspector showed `Agent Path`, missing evidence, source/evidence paths, and `hf:*` commands.

## Findings

- `vis-network` increases the lazy `/memory` chunk size. The route still builds successfully, but future work may want to lazy-load the graph component only after the Strategy Memory section is visible.
- Existing unrelated Electron AI/marketing worktree changes were present before this task and were left intact.
- No backend strategy logic, live execution, credentials, or promotion gates were changed.

## Memory Updated

promoted: `docs/operations/agents/graph-memory-operating-system.md` now owns the rule that `/memory` Strategy Memory is the visual strategy/evidence navigation layer while backend artifacts, strategy docs, and the file harness remain canonical truth.

## Assumptions

- The graph should favor comfortable exploration over showing every note by default.
- Obsidian remains curated memory, not the source of truth.
- Agents should use the inspector paths and suggested commands as navigation hints, then verify against repo docs/backend artifacts.

## Next Best Step

Add a small Playwright or browser smoke script for `/memory` so future graph UI changes can verify desktop/mobile controls without ad hoc CDP scripting.
