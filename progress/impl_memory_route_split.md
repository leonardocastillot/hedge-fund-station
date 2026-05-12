# memory_route_split

## Objective

Split the Strategy Memory and Graphify repository graph surfaces so `/memory`
does not load both graphs.

## Scope

- `src/features/memory/pages/MemoryGraphPage.tsx`
- `src/features/memory/pages/RepoGraphPage.tsx`
- `src/features/cockpit/WidgetPanel.tsx`
- `src/pages/index.ts`
- `src/features/README.md`
- `docs/operations/agents/graph-memory-operating-system.md`
- Harness files: `agent_tasks.json`, `progress/current.md`, `progress/history.md`

## Changes Made

- `/memory` now loads only strategy catalog, strategy learning events, and the
  Obsidian graph used by Strategy Memory.
- Added `/repo-graph` as a lazy route for Graphify status, metrics, artifact
  open actions, and the Graphify iframe.
- Added a `Repo Graph` navigation item and export.
- Updated docs to say Graphify is now opened through `/repo-graph`.
- Backend Graphify endpoints were preserved.

## Files Changed

- `src/features/memory/pages/MemoryGraphPage.tsx`: removed Graphify status load,
  iframe mounting, and Graphify postMessage handling.
- `src/features/memory/pages/RepoGraphPage.tsx`: new Graphify-only page.
- `src/features/cockpit/WidgetPanel.tsx`: added lazy `/repo-graph` route and nav.
- `docs/operations/agents/graph-memory-operating-system.md`: documented the
  route-level split.
- `graphify-out/`: regenerated after the route/docs change.

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk npm run build
rtk npm run graph:build
rtk npm run graph:check
rtk git diff --check
```

Result:

- passed: harness check passed with 16 tasks and 0 warnings.
- passed: production build completed and emitted a separate `RepoGraphPage`
  chunk.
- passed: Graphify rebuilt to 4298 nodes, 6867 edges, and 249 communities.
- passed: Graphify artifact check succeeded.
- passed: diff check returned no whitespace errors.

Browser smoke:

- `/memory`: rendered `Actionable Strategy Memory`, loaded
  `MemoryGraphPage.tsx`, made no `graphify` resource requests, and mounted 0
  Graphify iframes.
- `/repo-graph`: rendered `Graphify Repository Map`, loaded
  `RepoGraphPage.tsx`, requested `graphify-status` and `graphify-explorer`, and
  mounted 1 Graphify iframe.
- No route error overlay or runtime exception was detected. Shared shell logs
  still show existing non-blocking dev warnings and one unrelated connection
  refusal from the broader app shell.

## Findings

- The previous `/memory` page coupled two heavy visual surfaces: Strategy Memory
  and Graphify. The new split avoids loading Graphify when the operator wants
  strategy learning only.
- An existing dev server was already listening on port 5173; direct
  `electron-vite` renderer-only startup exited after seeing that port in use.
  Smoke used the existing dev server and Chrome headless.

## Memory Updated

- intentionally unchanged: this is a UI route split and doc update. Durable
  operating guidance was updated in
  `docs/operations/agents/graph-memory-operating-system.md`; curated shared
  memory did not need a new item.

## Assumptions

- The two graphs were the Strategy Memory graph and Graphify repo graph that
  previously mounted together on `/memory`.
- `/memory` should remain the Strategy Memory route because app readiness opens
  it for strategy learning events.

## Next Best Step

Run a manual Electron smoke on the real desktop window and confirm the nav item
order feels right after adding `Repo Graph`.
