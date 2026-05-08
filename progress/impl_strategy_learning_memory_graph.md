# Strategy Learning Memory Graph Handoff

- Task: `strategy_learning_memory_graph`
- Agent: Codex
- Mission class: UI review-speed audit
- Status: ready for review
- Date: 2026-05-07

## Summary

Implemented the approved strategy learning loop for `/memory`. The backend now
stores structured learning events as JSON artifacts, the renderer shows
learning lenses and capture flow, and Obsidian sync mirrors learning events as
managed notes. The vault opener now treats `hedge-station/` as the curated
Obsidian vault and opens `Workspace Home.md` through a registered vault target.

## Changed Files

- `backend/hyperliquid_gateway/app.py`
  - Added `StrategyLearningEventCreate`, JSON persistence under
    `backend/hyperliquid_gateway/data/strategy_memory/`, and GET/POST learning
    APIs.
- `tests/test_strategy_learning_memory.py`
  - Added isolated tests for write/list/API learning behavior.
- `src/services/hyperliquidService.ts`
  - Added strategy learning types, normalizers, GET, and POST client methods.
- `src/features/memory/pages/MemoryGraphPage.tsx`
  - Added learning lenses, learning-event graph nodes, learning stats on
    strategy cards, inspector context, and Capture Lesson flow.
- `electron/main/native/obsidian-manager.ts`,
  `electron/main/native/workspace-manager.ts`, `electron/preload/index.ts`,
  `electron/types/ipc.types.ts`, `src/types/electron.d.ts`
  - Extended sync input for learning events, wrote managed lesson notes under
    `hedge-station/lessons/<strategy_id>/`, fixed real vault opening, and made
    workspace config prefer the curated `hedge-station/` vault over the noisy
    repo-root `.obsidian`.
- `hedge-station/.obsidian/app.json`
  - Makes the curated `hedge-station/` folder a valid Obsidian vault.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md`,
  `docs/operations/agents/memory/decisions.md`
  - Registered the task, recorded session progress, and captured the durable
    backend-first learning-memory decision.

## Verification

- Passed: initial `npm run agent:check`
- Passed: `python3 -m unittest tests.test_strategy_learning_memory`
- Passed: `python3 -m unittest tests.test_strategy_catalog tests.test_strategy_learning_memory`
- Passed: `npm run build`
- Passed: `npm run gateway:restart`
- Passed: `npm run gateway:probe`
- Passed: real gateway GET smoke:
  `/api/hyperliquid/strategies/learning?limit=5` returned HTTP 200.
- Passed: temporary HTTP gateway smoke with temp data root:
  `/health` HTTP 200, strategy catalog HTTP 200, learning POST created an event,
  and learning GET returned that event.
- Partial: dev server route `http://localhost:5173/memory` returned HTTP 200.
  A Playwright visual smoke was attempted through the Node REPL, but Playwright
  is not installed in that runtime.
- Follow-up fix passed: after the human reported Obsidian's "Vault not found"
  popup, `openVault` was changed to use `open -a Obsidian <vaultPath>` first on
  macOS and use `obsidian://open?vault=...&file=...` only as fallback.
  `npm run build`, `npm run agent:check`, and `git diff --check` passed.
- Second follow-up: `open -a Obsidian <vaultPath>` still opened the previous
  Obsidian vault on this machine, so `openVault` now registers the workspace
  vault in Obsidian's local `obsidian.json` with a stable ID and opens by that
  vault ID.
- Third follow-up: native Obsidian graph showed mostly `README` nodes because
  the repo root was registered as the vault. `openVault` now normalizes legacy
  repo-root paths to the curated `hedge-station/` vault, whose Markdown corpus is
  strategy notes, indexes, and managed lessons.
- Latest follow-up passed: `npm run build`, `npm run agent:check`,
  `git diff --check`, combined strategy catalog/learning unit tests, and
  `npm run gateway:probe`.
- Local config was updated so workspace `new-project-9` uses
  `/Users/optimus/Documents/New project 9/hedge-station`, and Obsidian's local
  `obsidian.json` marks that curated vault open.
- Hang follow-up: `/memory` no longer blocks forever on Obsidian IPC. Graph load
  and Open Vault now have renderer timeouts, the main-process opener is
  fire-and-forget with best-effort fallbacks, and the working Obsidian URI is
  `vault=hedge-station&file=Workspace Home.md`.
- Verified with Computer Use: `/memory` loaded in Electron, Open Vault returned
  control to the UI without a timeout error, Obsidian was open as
  `hedge-station`, and the corrected URI opened `Workspace Home.md`.

## Safety

- No live trading, credentials, order routing, or production promotion changed.
- The HTTP create smoke used a temporary data root, so it did not add fake
  learning artifacts to the repo data directory.
- Obsidian sync still writes only managed notes and preserves manual notes.
- Obsidian Sync is disabled in the project vault to avoid mixing this local
  strategy-memory vault with any personal synced vault.
- The local gateway was restarted through the stable repo script so the new
  backend endpoint is loaded.

## Risks And Next Action

- The capture UI is intentionally simple for v1; future work can add richer
  templates for paper postmortems and rule-change reviews.
- Next reviewer should smoke `/memory` inside the Electron window, create one
  real strategy lesson, click Sync Obsidian, and confirm the lesson appears
  under `hedge-station/lessons/<strategy_id>/`. Also click Open Vault once
  after restarting Electron to confirm Obsidian opens the registered
  `hedge-station` vault, not the previous personal vault or the noisy repo-root
  vault.

## Memory

Updated curated decisions with the accepted backend-first strategy learning
memory rule.
