# OpenHuman Memory Extraction Handoff

## Objective

Implement the OpenHuman-inspired memory plan as a clean-room backend strategy
evidence index, without copying GPL code or migrating the app/backend to Rust.

## Scope

- Backend strategy memory indexing under `backend/hyperliquid_gateway/`
- Stable `hf:*` command surface and package scripts
- Gateway `/api/hyperliquid/memory/strategy/*` endpoints
- `/memory` review surface and agent-launch memory retrieval
- Memory operating docs and backend data artifact docs

## Changes Made

- Added `backend/hyperliquid_gateway/strategy_memory.py` with Markdown
  canonicalization, <=3k-token chunking, deterministic chunk IDs, SQLite schema
  migrations, FTS5 search with LIKE fallback, durable jobs, heuristic scoring,
  entity extraction, and per-strategy summaries.
- Added `hf memory sync/query/status` plus npm wrappers:
  `hf:memory:sync`, `hf:memory:query`, and `hf:memory:status`.
- Added gateway endpoints:
  `/api/hyperliquid/memory/strategy/status`,
  `/api/hyperliquid/memory/strategy/sync`, and
  `/api/hyperliquid/memory/strategy/query`.
- Extended `/memory` with a backend index panel for sync/search and cited
  snippet results.
- Extended `CommanderConsoleV2` mission brief retrieval to include backend
  strategy-memory snippets alongside Obsidian notes.
- Documented `strategy_memory/` as runtime evidence index storage and added
  `.gitignore` rules for the SQLite DB/WAL/SHM files.

## Files Changed

- `backend/hyperliquid_gateway/strategy_memory.py`: new memory index engine.
- `backend/hyperliquid_gateway/cli.py`: stable memory CLI commands.
- `backend/hyperliquid_gateway/app.py`: backend memory status/sync/query API.
- `src/services/hyperliquidService.ts`: typed client methods for memory API.
- `src/features/memory/pages/MemoryGraphPage.tsx`: backend memory search panel.
- `src/features/agents/components/CommanderConsoleV2.tsx`: launch context now
  receives cited backend snippets.
- `tests/test_strategy_memory_index.py`: unit coverage for chunking, IDs,
  migrations, sync/query, duplicate ingest, lifecycle status, and CLI parser.
- `docs/operations/agents/graph-memory-operating-system.md`: clarified backend
  memory DB role.
- `backend/hyperliquid_gateway/data/README.md`: documented runtime index
  storage and commands.

## Verification

Commands run:

```bash
rtk python3 -m unittest tests.test_strategy_memory_index
rtk python3 -m unittest tests.test_strategy_memory_index tests.test_strategy_learning_memory tests.test_graphify_memory_status
rtk npm run hf:memory:sync -- --dry-run
rtk npm run hf:memory:sync
rtk npm run hf:memory:query -- "what did we learn about btc adaptive cycle trend"
rtk npx tsc --noEmit
rtk npm run build
rtk npm run agent:check
rtk git diff --check
rtk npm run hf:memory:status
```

Result:

- Passed. Local sync indexed 216 sources into 222 chunks, processed follow-up
  jobs, and reported 0 failed jobs.

## Findings

- Direct OpenHuman code reuse remains inappropriate because OpenHuman is GPL-3.0
  and this repo is MIT. This implementation copies architecture ideas only.
- Rust migration is not justified yet. Python sync over current artifacts is
  fast enough for the first benchmark target.
- Query ranking is intentionally simple heuristic + FTS. It is useful now, but
  future ranking can improve after real operator feedback.

## Memory Updated

- promoted: `docs/operations/agents/graph-memory-operating-system.md` now owns
  the role of the backend strategy memory DB as an evidence index, distinct
  from Graphify, Obsidian, and the file harness.

## Assumptions

- "Memory" means hedge-fund/company memory and strategy evidence, not a personal
  assistant clone or OAuth connector expansion.
- Backend artifacts, docs, learning events, and handoffs are safe repo-owned
  sources to index.
- Runtime SQLite files should stay out of Git; JSON learning events may remain
  reviewable artifacts.

## Next Best Step

Use the `/memory` panel and agent mission brief for a real strategy question,
then tune scoring/query ranking from observed misses before considering any
Rust helper.
