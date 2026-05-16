# Graph And Memory Operating System

This repo uses three complementary agent memory layers. Keep each layer narrow so
future agents can orient quickly without trusting generated summaries as truth.

## Layer Roles

| Layer | Source | Use It For | Do Not Use It For |
| --- | --- | --- | --- |
| File harness | `agent_tasks.json`, `progress/`, `CHECKPOINTS.md` | Active work, status, evidence, verification, handoff | Repo topology or durable strategy memory |
| Graphify | `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, `graphify-out/graph.html` | Fast repo navigation, dependency hints, entrypoint discovery | Canonical facts, strategy evidence, or decisions |
| Obsidian | `hedge-station/` vault and `docs/operations/agents/memory/` | Curated decisions, mission memory, strategy learning, open questions | Raw logs, generated reports, graph dumps, or scratch notes |

Graphify answers "where should I look?" Obsidian answers "what did we already
decide or learn?" The file harness answers "what is happening right now?"
The backend strategy memory DB under `HYPERLIQUID_DATA_ROOT/strategy_memory/`
is a searchable evidence index, not a curated memory layer: it chunks repo-owned
strategy docs, backend artifacts, learning events, agent runs, and handoffs so
agents retrieve concise cited snippets instead of raw dumps.

The `/memory` Strategy Memory explorer is the visual bridge for strategy work:
it links backend catalog rows, repo evidence artifacts, Obsidian notes, and
learning events into an interactive review graph, and can query the backend
strategy memory index for top relevant snippets. The heavier Graphify
repository map lives separately at `/repo-graph` so strategy memory can load
without mounting both graphs. Treat both routes as orientation and review-speed
surfaces; canonical truth remains in backend artifacts, strategy docs, and the
file harness.

## Operating Loop

1. Start with `AGENTS.md`, `progress/current.md`, and `agent_tasks.json`.
2. Run `rtk npm run agent:brief` for the current harness, memory, Graphify, and
   Obsidian snapshot.
3. For broad repo, architecture, harness, memory, or ownership questions, run
   `rtk npm run graph:status` first. If Graphify is fresh enough, read
   `graphify-out/GRAPH_REPORT.md` or run
   `rtk npm run graph:query -- "<question>"`, or open `/repo-graph` for the
   interactive map.
4. Verify Graphify leads against source files, canonical docs, tests, and stable
   command output before changing behavior.
5. For strategy lessons, decisions, postmortems, and open questions, use
   `/memory` to find related strategy evidence and Obsidian notes, then verify
   against the source files, backend artifacts, and memory docs that own the
   behavior.
6. Leave work state in the file harness: update `progress/current.md`, write a
   report under `progress/`, update `progress/history.md`, and record evidence
   paths in `agent_tasks.json`.
7. If the work moves files, adds major modules, changes architecture, or edits
   agent operating docs, run `rtk npm run graph:build` and
   `rtk npm run graph:check`.
8. If the work creates durable context, update memory only when
   `memory/memory-policy.md` says it is worth preserving.

## Useful Graphify Commands

```bash
rtk npm run graph:status
rtk npm run graph:build
rtk npm run graph:check
rtk npm run graph:query -- "where should a new agent start for repo architecture work?"
rtk npm run graph:explain -- "backend/hyperliquid_gateway/app.py"
rtk npm run graph:path -- "RepoGraphPage" "graphify_status_payload"
```

Use `graph:build` after structural changes. Use `graph:query` before wide
searches. Use `graph:explain` and `graph:path` to narrow follow-up inspection.

## Obsidian Rules

- Keep Obsidian curated and human-readable.
- Pin only durable navigation, decisions, and high-value memory.
- Link to Graphify artifacts instead of copying generated graph content.
- Link to backend evidence instead of copying generated reports.
- Strategy learning remains repo/backend-first, then Obsidian mirrors the useful
  review trail.

## Freshness

Graphify status should expose whether artifacts are available, which commit they
were built from, the current commit, whether the working tree has uncommitted
changes, and the recommended command. If status is stale or dirty, use the graph
as a hint and rebuild before treating it as the shared navigation layer.
