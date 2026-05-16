# OpenCode Permissionless Run Subcommand

- Date: 2026-05-16
- Owner: codex
- Task: opencode_permissionless_run_subcommand
- Mission class: UI review-speed audit
- Status: done

## Summary

Fixed the OpenCode permissionless launcher. OpenCode 1.15.3 documents
`--dangerously-skip-permissions` under `opencode run`, not the root TUI
command. The shared runtime helper now launches:

```bash
opencode run --interactive --model opencode/deepseek-v4-flash-free --dangerously-skip-permissions
```

## Changed Files

- `src/utils/agentRuntime.ts`
- `progress/impl_interactive_agent_permissionless_ticker_insight_missions.md`
- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`

## Verification

- passed: `rtk npm run agent:check`
- passed: `rtk npx tsc --noEmit`
- passed: `rtk npm run build`
- passed: `rtk git diff --check`
- passed: `rtk npm run terminal:doctor`
- passed: `rtk zsh -lc 'opencode run --interactive --model opencode/deepseek-v4-flash-free --dangerously-skip-permissions --version'`
- passed: node-pty smoke launched the exact command and reached OpenCode's
  `Ask anything...` prompt with `Build DeepSeek V4 Flash Free · OpenCode Zen`.
  It found no unknown-option, permission-flag, or command-not-found errors.

## Risks

- The app must be restarted or rebuilt bundle loaded before the renderer uses
  the corrected command.
- This changes OpenCode launch shape only. Codex, Claude, Gemini, Electron IPC,
  backend APIs, credentials, trading, order routing, and release-promotion
  behavior were unchanged.

## Memory

- Intentionally unchanged. This is an implementation fix, not a durable policy
  beyond the handoff and source code.

## Next

- Ready to stage/commit/push after operator approval.
