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

## Operating Loop

1. Start with `AGENTS.md`, `progress/current.md`, and `agent_tasks.json`.
2. Run `npm run agent:brief` for the current harness, memory, Graphify, and
   Obsidian snapshot.
3. For broad repo, architecture, harness, memory, or ownership questions, run
   `npm run graph:status` first. If Graphify is fresh enough, read
   `graphify-out/GRAPH_REPORT.md` or run `npm run graph:query -- "<question>"`.
4. Verify Graphify leads against source files, canonical docs, tests, and stable
   command output before changing behavior.
5. For strategy lessons, decisions, postmortems, and open questions, check
   Obsidian and `docs/operations/agents/memory/` after reading the source files
   that own the behavior.
6. Leave work state in the file harness: update `progress/current.md`, write a
   report under `progress/`, update `progress/history.md`, and record evidence
   paths in `agent_tasks.json`.
7. If the work moves files, adds major modules, changes architecture, or edits
   agent operating docs, run `npm run graph:build` and `npm run graph:check`.
8. If the work creates durable context, update memory only when
   `memory/memory-policy.md` says it is worth preserving.

## Useful Graphify Commands

```bash
npm run graph:status
npm run graph:build
npm run graph:check
npm run graph:query -- "where should a new agent start for repo architecture work?"
npm run graph:explain -- "backend/hyperliquid_gateway/app.py"
npm run graph:path -- "MemoryGraphPage" "graphify_status_payload"
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
