# Claude Compatibility Entry

This repository is governed by `AGENTS.md`.

Claude Code, Codex, Gemini, external CLIs, and in-app agents should all use the
same vendor-neutral operating map:

1. Read `AGENTS.md`, `RTK.md`, and `CAVEMAN.md`.
2. Run `rtk npm run agent:brief` when RTK is available.
3. Read `progress/current.md` and `agent_tasks.json`.
4. Run `rtk npm run graph:status` before using Graphify.
5. Follow `docs/operations/agents/harness.md` and the mission-specific docs.

Do not use older Claude-specific architecture notes as source of truth. The
canonical architecture, memory, Graphify, Obsidian, and handoff rules live in:

- `AGENTS.md`
- `docs/project-architecture.md`
- `docs/operations/product-objective.md`
- `docs/operations/agents/harness.md`
- `docs/operations/agents/file-harness.md`
- `docs/operations/agents/graph-memory-operating-system.md`
- `docs/operations/agents/memory/memory-policy.md`

Backend strategy logic remains in `backend/hyperliquid_gateway/`. React is the
operator cockpit. Electron is the desktop shell and IPC/native bridge. Agents
must not place live trades, change credentials, promote strategies to live, or
hide trading logic in React or Electron.
