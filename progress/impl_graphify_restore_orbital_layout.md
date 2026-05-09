# Graphify Restore Orbital Layout Handoff

## Objective

Restore the full Graphify explorer's pre-optimization gravitational/orbital
layout so the graph finishes in the prettier circular structure the user
preferred.

## Scope

- Changed only the custom explorer served by
  `backend/hyperliquid_gateway/app.py`.
- Preserved the previous interaction fixes: click selection does not rebuild the
  graph, inspector neighbors work, `Open Source` still posts to `/memory`, and
  search/degree controls remain debounced.
- Did not regenerate or edit `graphify-out/`.

## Changes Made

- Replaced the full-graph `all-lite` profile with `all-orbit`.
- Restored the full-graph visual/physics feel:
  - `forceAtlas2Based` solver.
  - Dynamic edges.
  - Node shadows and hover enabled.
  - Original gravitational constants, spring length, damping, velocity, and
    stabilization shape.
- Removed the full-graph pause/resume settling behavior from the default path.
  The full graph no longer auto-freezes or waits for a manual resume; it uses
  the natural vis-network physics flow again.
- Kept lighter/focused behavior available for filtered and neighborhood views.

## Files Changed

- `backend/hyperliquid_gateway/app.py`: full-graph profile changed from
  `all-lite` to `all-orbit` and restored to the original gravitational layout
  behavior.
- `tests/test_graphify_memory_status.py`: updated explorer contract assertions
  for `all-orbit` and `forceAtlas2Based`.
- `progress/current.md`: session state updated and returned to idle.
- `progress/history.md`: appended this corrective Graphify UX entry.

## Verification

Commands run:

```bash
npm run agent:check
python3 -m unittest tests.test_graphify_memory_status
npm run build
npm run gateway:restart
npm run gateway:probe
git diff --check
```

Browser smoke:

```text
direct explorer after 4.5s:
  subtitle: 4204 of 4204 nodes visible
  visible nodes: 4204
  visible edges: 6699
  profile: all-orbit
  render: 376ms
  physics: running
  physics button: Physics

direct explorer after 13s:
  profile: all-orbit
  physics: running
  physics button: Physics

search MemoryGraphPage:
  subtitle: 85 of 4204 nodes visible
  profile: neighborhood
```

Result:

- passed

## Findings

- The previous performance pass optimized responsiveness too aggressively for
  the user's taste; the graph became usable but lost the circular/orbital final
  composition that made the map feel good.
- The better compromise for now is to preserve interaction fixes and HUD
  observability, while restoring the original full-graph physics aesthetics.
- This intentionally accepts higher initial render/settling cost in exchange
  for the preferred final layout.

## Memory Updated

- intentionally unchanged: this is a local Graphify UX tuning decision, not a
  durable operating-system rule.

## Assumptions

- The user's priority for the default full graph is visual quality over maximum
  first-load speed.
- Debounced filters, inspector behavior, and source-open integration should
  remain because they do not conflict with the orbital layout.

## Next Best Step

Let the user compare the new `all-orbit` default in `/memory`; if it is still
too dense, tune only the full-graph physics constants rather than reintroducing
auto-freeze.
