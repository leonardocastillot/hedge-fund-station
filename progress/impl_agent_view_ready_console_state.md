# Agent View Ready Console State

## Objective

Separate standby agent consoles from actively working consoles in Agent View,
without changing IPC, preload, PTY manager, backend logic, credentials, or live
trading paths.

## Scope

- `src/features/agents/utils/workspaceAgentViewModel.ts`
- `src/features/agents/components/WorkspaceAgentView.tsx`
- `src/components/electron/TerminalPane.tsx`
- `src/components/electron/TerminalGrid.tsx`
- `progress/current.md`

## Changes Made

- Added internal Agent View group `ready`, so rows now classify as
  `Input`, `Ready`, `Working`, `Completed`, or `Failed`.
- Kept `Needs/Input` limited to real blocking prompts through
  `runtimeState === "awaiting-approval"`.
- Classified `runtimeState === "ready"` as the new `Ready` group.
- Added conservative runtime idle detection for agent CLI prompt chrome such as
  `Ask anything`, or the combined `/ commands`, `ctrl+p`, and `tab agents`
  hints.
- Preserved approval detection priority before idle detection.
- Composer and selected-session `Reply` now mark runtime terminals as
  `waiting-response` with `Operator message sent` after writing user text.
- TerminalGrid now describes `ready` as ready for operator input instead of a
  running mission.

## Verification

Commands run:

```bash
rtk npx tsc --noEmit
rtk npm run build
rtk npm run dev:doctor
rtk npm run agent:check
rtk git diff --check
rtk curl -fsS -o /dev/null -w 'http=%{http_code} total=%{time_total}s\n' http://localhost:5173/workbench
```

Result:

- passed: TypeScript
- passed: production build
- passed: dev doctor
- passed: harness check
- passed: whitespace diff check
- passed: `/workbench` HTTP smoke, `http=200`
- skipped: manual Electron PTY smoke, needs interactive app session

## Findings

- Existing runtime states were enough; the missing piece was a renderer-only
  visual group for `ready`.
- Broad hints like `/ commands` can appear in terminal UI chrome, so the idle
  detector requires `Ask anything` or a combined set of command and agent-picker
  hints.

## Memory Updated

intentionally unchanged: this is a UI behavior refinement, not durable strategy
or harness policy.

## Assumptions

- `Ready` means live agent console waiting for optional operator input.
- `Needs Input` means a real blocking approval/permission/confirmation prompt.
- If the idle prompt is not recognized, the safer fallback is `Working`.

## Next Best Step

Manual Electron smoke with OpenCode/Codex: confirm idle appears in `Ready`,
send a message, confirm it becomes `Working/Waiting`, then confirm it returns to
`Ready` when the CLI prompt comes back.
