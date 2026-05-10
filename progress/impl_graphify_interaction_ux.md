# Graphify Interaction UX Handoff

## Objective

Improve the embedded Graphify explorer so clicking nodes feels like selection
instead of a graph reload, and make source files easier to open from the map.

## Scope

- `backend/hyperliquid_gateway/app.py`
- `src/features/memory/pages/MemoryGraphPage.tsx`
- `tests/test_graphify_memory_status.py`
- `/memory` renderer smoke with the local gateway

## Changes Made

- Split Graphify explorer selection from graph refresh:
  - plain node select/deselect now updates inspector and selected node styling
    without clearing/re-adding the vis-network datasets.
  - `refreshGraph()` remains for filters, label toggles, reset, and explicit
    neighborhood mode.
- Added `Open Source` to the explorer inspector when a node's source file
  resolves under the repo.
- Added iframe-to-React messaging for `{ type: "graphify:open-path", path,
  label }`; `/memory` validates the message source against the Graphify iframe
  before calling Electron `openPath`.
- Improved neighborhood ergonomics:
  - neighborhood mode shows root plus neighbors even when the root was found by
    search.
  - clicking an inspector neighbor hidden by filters clears those filters and
    focuses that neighbor.

## Files Changed

- `backend/hyperliquid_gateway/app.py`: Graphify explorer data, inspector
  action, selection behavior, source-open message, and neighborhood filtering.
- `src/features/memory/pages/MemoryGraphPage.tsx`: iframe ref and safe
  `postMessage` listener for Graphify source opens.
- `tests/test_graphify_memory_status.py`: focused assertion that explorer HTML
  exposes `openPath`, `Open Source`, and the Graphify open message contract.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_graphify_memory_status
npm run build
npm run gateway:restart
npm run gateway:probe
```

Result:

- passed: `npm run agent:check`
- passed: `python3 -m unittest tests.test_graphify_memory_status`
- passed: `npm run build`
- passed: `npm run gateway:probe`
- passed: Browser smoke against
  `http://127.0.0.1:18001/api/hyperliquid/memory/graphify-explorer`
  after gateway restart:
  - search + focus selected `MemoryGraphPage`
  - `Open Source` appeared in the inspector
  - clicking inspector neighbor selected `WidgetPanel.tsx`
  - `Neighborhood` showed `2 of 4204 nodes visible`
  - URL stayed stable with no browser navigation
- passed: Browser smoke against `http://localhost:5173/memory` confirmed the
  Repo Graph panel and iframe render.

## Findings

- The original reload feeling came from `selectNode`/`deselectNode` calling
  `refreshGraph()`, which cleared and re-added all nodes and edges.
- The already-running gateway served stale explorer HTML until restarted.
- The in-app browser runtime cannot inspect the cross-origin Graphify iframe
  from `/memory`, so the detailed interaction smoke used the direct gateway
  explorer URL and verified `/memory` embedding separately.

## Memory Updated

- intentionally unchanged: this patch is a narrow Graphify UX fix; the durable
  Graphify/Obsidian/file-harness split is already documented in
  `docs/operations/agents/graph-memory-operating-system.md`.

## Assumptions

- The custom explorer at `/api/hyperliquid/memory/graphify-explorer` is the
  primary interactive surface; raw `graphify-out/graph.html` remains the raw
  artifact.
- Single click selects and inspects; double click or `Neighborhood` scopes the
  visible graph.
- `Open Source` is an explicit inspector action, not the default node click.

## Next Best Step

If this becomes a daily navigation surface, add a small source-open affordance
inside the raw `/memory` status card that explains when Electron file opening is
available.
