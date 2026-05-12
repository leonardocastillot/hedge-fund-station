# Graphify Full Graph Fluency Handoff

## Objective

Make `/repo-graph` feel fluid when showing the complete Graphify graph without
losing the preferred orbital/gravity aesthetic.

## Scope

- Changed the custom Graphify explorer served by
  `backend/hyperliquid_gateway/app.py`.
- Updated the Graphify explorer endpoint contract test in
  `tests/test_graphify_memory_status.py`.
- Did not regenerate `graphify-out/`.
- Did not change Graphify status fields, renderer service types, strategy logic,
  paper runtime, credentials, or order routing.

## Changes Made

- Replaced the full-graph `all-orbit` profile with `world-orbit`.
- Full graph now seeds deterministic node positions into a community/globe
  shell before physics starts, keeping all nodes visible by default while
  restoring the large circular/world feel.
- Full graph still uses `forceAtlas2Based`, restores the stronger old gravity
  feel (`centralGravity`, spring, damping, velocity), starts from an expanded
  orbital seed shell, keeps a minimum animation window, and then runs explicit
  vis-network stabilization to complete the layout cleanly.
- During full-graph settling, the explorer disables expensive visual work:
  shadows, hover tooltips, and smooth edges.
- After settling, the explorer restores polished node/edge visuals and useful
  tooltips while keeping pan/zoom smooth.
- Added a lightweight CSS ambient orbital flow over the graph stage so the
  surface remains visually alive after the heavy physics completes.
- Added final full-graph framing plus a small post-fit scale-out after settle so
  the completed world-orbit view lands centered, breathable, and usable.
- Label toggling now updates visible node decorations in place instead of
  clearing/rebuilding the whole dataset and restarting physics.
- HUD render telemetry now includes approximate render/frame timing and exposes
  `settling` and `flowing` states. The control is `Reflow`, not pause/resume.

## Files Changed

- `backend/hyperliquid_gateway/app.py`
- `tests/test_graphify_memory_status.py`
- `progress/current.md`
- `progress/history.md`
- `progress/impl_graphify_full_graph_fluency.md`

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk python3 -m unittest tests.test_graphify_memory_status
rtk npm run build
rtk npm run gateway:restart
rtk npm run gateway:probe
rtk git diff --check
```

Results:

- `agent:check` passed.
- Targeted Graphify unittest passed: 8 tests.
- Production build passed.
- Gateway restarted and probe passed all checked endpoints.
- `git diff --check` passed.
- Continuation verification on 2026-05-12 repeated the unittest, harness check,
  production build, gateway restart/probe, diff check, and browser smoke.

Browser smoke against
`http://127.0.0.1:18001/api/hyperliquid/memory/graphify-explorer`:

```text
initial full graph:
  canvas count: 1
  ambient flow count: 1
  visible nodes: 4298
  visible edges: 6867
  profile: world-orbit
  initial motion: settling
  settled motion: flowing
  settled render HUD: 201ms / idle
  motion button: Reflow
  console errors: none

controls:
  search MemoryGraphPage: 73 visible nodes
  focus: inspector selected MemoryGraphPage
  Open Source button: present
  neighborhood: 2 visible nodes, profile neighborhood, physics settled
  labels: Hide Labels, visible node count unchanged
  fit: clickable after settle
  reset: 4298 nodes, 6867 edges, profile world-orbit, motion settling
```

2026-05-12 continuation smoke:

```text
initial: 4298 nodes, 6867 edges, profile world-orbit, motion settling
settled: 4298 nodes, 6867 edges, profile world-orbit, motion flowing, render 201ms / idle
focus MemoryGraphPage: 73 nodes, 127 edges, inspector selected, Open Source present
neighborhood: 2 nodes, 1 edge, profile neighborhood, settled
labels: Hide Labels, visible count unchanged
reset: 4298 nodes, 6867 edges, profile world-orbit, settling
console errors: none
```

## Findings

- The running gateway was initially still serving the previous `all-orbit`
  explorer with physics `running`; restarting the local gateway was required to
  load the edited backend HTML.
- The running gateway was restarted after each backend HTML change so browser
  smoke used the current explorer.
- The current 4,298 node / 6,867 edge graph is still viable on `vis-network`
  when the full-graph animation starts from a deterministic expanded world
  shell, uses the old stronger gravity feel during settle, and then completes
  via explicit stabilization. The post-completion ambient flow is CSS-only and
  avoids re-running heavy graph physics.

## Memory Updated

- intentionally unchanged: this is Graphify UX/performance implementation
  detail, while the durable Graphify/Obsidian/file-harness split is already
  documented in `docs/operations/agents/graph-memory-operating-system.md`.

## Assumptions

- The best UX tradeoff is a visible gravity settle followed by a completed,
  polished `flowing` layout: the graph keeps feeling alive without keeping
  expensive physics running forever.
- A WebGL renderer migration is unnecessary for this graph size.
- `graphify-out/` should stay unchanged because the graph data did not change.

## Next Best Step

If the graph grows past roughly 10k nodes or the packaged app still feels heavy
on low-power hardware, evaluate a WebGL renderer migration as a separate task.
