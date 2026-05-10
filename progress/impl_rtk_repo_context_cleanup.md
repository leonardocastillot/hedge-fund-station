# RTK Repo Context Cleanup

## Objective

Finish the leftover cleanup for the retired content-growth surface and make RTK
the default token-saving shell wrapper for Codex and repo agents.

## Scope

Inspected the file harness, current session state, prior cleanup handoff,
active Electron/renderer/docs/package surfaces, git worktree metadata, RTK
installation state, and official RTK Codex setup documentation.

## Changes Made

- Pruned stale git worktree metadata for the retired surface and renamed the
  active branch to `codex/rtk-repo-context-cleanup`.
- Removed active references to unused content-growth, external automation, and
  stale media wording from current repo docs and compatibility files.
- Ran `rtk init --codex`, added `RTK.md`, and kept the official `@RTK.md`
  include in `AGENTS.md`.
- Expanded RTK guidance for this repo: prefer `rtk <command>` for agent shell
  commands; use raw commands, `rtk proxy`, or `RTK_DISABLED=1` only for
  interactive runs, raw-output debugging, or RTK fallback.
- Updated core agent orientation, harness, memory, workbench, and checklist docs
  so future agents see RTK before running noisy shell commands.
- Recorded the work in `agent_tasks.json` and curated memory.

## Files Changed

- `AGENTS.md`, `RTK.md`: local Codex RTK contract.
- `docs/operations/agents/harness.md`,
  `docs/operations/agents/file-harness.md`,
  `docs/operations/agents/orientation.md`,
  `docs/operations/agents/automation-system.md`,
  `docs/operations/agents/graph-memory-operating-system.md`,
  `docs/operations/agents/research-os.md`,
  `docs/operations/agents/workbench.md`: agent workflow now prefers RTK.
- `docs/operations/agents/memory/shared-memory.md`,
  `docs/operations/agents/memory/decisions.md`: durable RTK decision recorded.
- `scripts/agent_harness.py`: `agent:brief` now lists `RTK.md` as a next read
  and the harness requires the file.
- `docs/architecture/backend-source-of-truth.md`,
  `docs/operations/media-artifact-archive.md`, `CODEX.md`, `CLAUDE.md`,
  `README.md`, `CHECKPOINTS.md`: cleanup and compatibility wording.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md`: harness
  state and evidence.

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk init --codex --show
rtk --version
rtk gain
rtk rg -n -i "m[a]rketing|a[u]toblog|a[u]to-blogger|c[a]mpaign|l[i]nkedin|w[e]bsite-hero|m[a]rketing-ai|window\\.electronAPI\\.m[a]rketing|m[a]rketing:" electron src docs scripts package.json package-lock.json agent_tasks.json progress/current.md CHECKPOINTS.md README.md CLAUDE.md CODEX.md
find . -maxdepth 4 -iname '*marketing*' -o -iname '*autoblog*' -o -iname '*campaign*' -o -iname '*linkedin*'
git worktree list --porcelain
rtk npm run build
rtk git diff --check
```

Result:

- passed: harness check and brief, local Codex RTK setup check, RTK version and
  gain, active source searches, worktree inspection, build, and whitespace
  check.
- expected no-match: the active source/doc search exited with no matches for the
  retired surface terms.

## Findings

- Active source and repo-facing docs are clear of the retired surface terms; the
  only remaining filename match is the historical handoff
  `progress/impl_remove_marketing_surface.md`.
- RTK is installed at `/opt/homebrew/bin/rtk` and `rtk gain` works, so this is
  the token-saving RTK package, not the unrelated Rust Type Kit package.
- Local Codex RTK setup is configured; global Codex RTK setup and shell hooks are
  intentionally not installed.
- The first harness check failed before this handoff file existed and before the
  completed task note avoided production-gate trigger words. After creating the
  handoff and tightening the note, `rtk npm run agent:check` passed.

## Memory Updated

added: `docs/operations/agents/memory/shared-memory.md` and
`docs/operations/agents/memory/decisions.md` now record RTK as the approved
Codex shell wrapper for this repo.

## Assumptions

- RTK should be a repo/Codex convention, not a global hook install, unless the
  human explicitly asks for global setup.
- Historical handoffs may keep the old term because they are audit records, not
  active instructions.

## Next Best Step

After this lands, run one normal agent session from a fresh Codex context and
confirm it starts with `RTK.md` plus `rtk npm run agent:brief`.
