# Graphify Memory Repo Map Handoff

- Task: `graphify_memory_repo_map`
- Agent: Codex
- Mission class: repo health audit
- Status: ready for review
- Date: 2026-05-08

## Summary

Integrated Graphify as a versionable repo navigation layer for agents and the
`/memory` surface. The repo now has stable npm commands, local ignore rules,
generated `graphify-out/` artifacts, a read-only backend status endpoint, and a
Repo Graph panel in `/memory` with counts and open actions.

Graphify is intentionally a map, not a source of truth. Agents should use it for
orientation before wide searches, then verify against source files, canonical
docs, backend evidence, and harness state.

## Changed Files

- `.graphifyignore`, `.gitignore`, `package.json`, `scripts/graphify-check.mjs`
  - Added stable Graphify command surface and local-state exclusions.
- `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`,
  `graphify-out/graph.html`
  - Generated the shared repo graph artifacts.
- `AGENTS.md`, `docs/operations/agents/harness.md`,
  `docs/operations/agents/memory/README.md`
  - Documented how agents should use Graphify for architecture, harness, and
    memory orientation.
- `backend/hyperliquid_gateway/app.py`,
  `tests/test_graphify_memory_status.py`
  - Added and tested `GET /api/hyperliquid/memory/graphify-status`,
    `GET /api/hyperliquid/memory/graphify-html`, and
    `GET /api/hyperliquid/memory/graphify-explorer`.
- `src/services/hyperliquidService.ts`,
  `src/features/memory/pages/MemoryGraphPage.tsx`
  - Added the typed client and `/memory` Repo Graph panel, now defaulting to
    the custom explorer iframe when available.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md`
  - Registered and closed the harness task.

## Verification

- Passed: initial and final `npm run agent:check`
- Passed: `npm run graph:build`
- Passed: `npm run graph:check`
- Passed: `npm run graph:query -- "how do harness memory and strategy learning connect?"`
- Passed: `python3 -m unittest tests.test_graphify_memory_status`
- Passed: `npm run build`
- Passed: `git diff --check`
- Follow-up fix passed after a reported 404:
  - Reproduced `GET /api/hyperliquid/memory/graphify-status` returning HTTP
    404 from the already-running gateway on port `18001`.
  - Confirmed the running OpenAPI schema did not include the Graphify route.
  - Added the Graphify endpoint to `npm run gateway:probe`.
  - Added a specific renderer 404 hint for stale Graphify gateway endpoints.
  - Fixed backend community counting so `community: 0` is counted correctly.
  - Restarted the gateway with `npm run gateway:restart`.
  - Verified HTTP 200 from the real endpoint, OpenAPI route presence,
    `npm run gateway:probe`, dev `/memory` HTTP 200, focused unit tests,
    `npm run graph:build`, `npm run graph:check`, the required graph query,
    `npm run build`, final `npm run agent:check`, and `git diff --check`.
- Embedded Graphify follow-up passed:
  - Added `GET /api/hyperliquid/memory/graphify-html` so the gateway serves
    `graphify-out/graph.html` as inline `text/html`.
  - Added `htmlUrl` to the Graphify status payload and renderer client.
  - Embedded the interactive Graphify map directly in `/memory` through an
    iframe, visible by default with a show/hide control plus the existing report
    and external HTML open actions.
  - Verified the HTML endpoint returns HTTP 200 with no attachment disposition,
    status reports `htmlUrl=/api/hyperliquid/memory/graphify-html`, dev
    `/memory` returns HTTP 200, focused tests pass, `npm run build` passes,
    `npm run gateway:probe` passes, `npm run graph:build` refreshes the graph,
    `npm run graph:check` reports `4519` nodes, `8828` edges, and `243`
    communities, final `npm run agent:check` passes, and `git diff --check`
    passes.
- Interactive explorer follow-up passed:
  - Added `GET /api/hyperliquid/memory/graphify-explorer`, a custom
    Obsidian-style explorer generated from `graphify-out/graph.json`.
  - Added `explorerUrl` to Graphify status and renderer client normalization.
  - The `/memory` Repo Graph panel now embeds the custom explorer first and
    keeps the generated Graphify HTML as the raw artifact open action.
  - Explorer supports drag/zoom physics, search, focus, neighborhood mode,
    community filtering, degree filtering, label toggling, fit/reset controls,
    counts, and an inspector with node metadata and neighbor jumps.
  - Verified real HTTP 200 for status, raw HTML, and explorer endpoints;
    Browser direct explorer smoke with search/focus on `MemoryGraphPage`;
    `npm run gateway:probe`; `python3 -m unittest tests.test_graphify_memory_status`;
    `npm run graph:build`; `npm run graph:check` (`4528` nodes, `8852` edges,
    `245` communities); the required graph query; `npm run build`.

## Notes

- `graph:build` uses Graphify's local `update` path so it is reliable without
  cloud LLM credentials and still writes `graph.json`, `graph.html`, and
  `GRAPH_REPORT.md`.
- A semantic `extract` attempt with local Ollama `llama3.2:3b` was tested. It
  first needed the `openai` package in the `uvx` environment, then produced
  invalid JSON warnings and stalled, so the final command uses the stable
  no-LLM path. Future semantic runs should use a stronger model or a configured
  Gemini/OpenAI-compatible provider.
- No `graphify codex install`, git hooks, credentials, live trading,
  production promotion, or strategy logic changes were made.
- Existing unrelated review-state changes in the dirty worktree were preserved.
- The 404 was caused by a stale running gateway process, not a missing source
  route. `gateway:probe` now includes the Graphify route so this regression is
  visible in the normal smoke check.
- The embedded explorer and raw generated HTML both load `vis-network` from
  `https://unpkg.com/`. If offline use becomes important, vendor that
  dependency in a later task.

## Risks And Next Action

- The current graph is strongest for code and markdown structure visible to
  Graphify's local update path. It is useful for navigation, but reviewers
  should not treat it as exhaustive semantic memory.
- Next reviewer should open `/memory`, confirm the Repo Graph panel renders the
  custom explorer, use search/focus/neighborhood once, and decide later whether
  a stronger semantic Graphify build or vendored offline graph dependency should
  become a separate optional task.

## Memory

Promoted the durable Graphify rule into `AGENTS.md`, `harness.md`, and
`memory/README.md`. Curated shared memory files were intentionally unchanged
because the permanent rule now lives in canonical docs.
