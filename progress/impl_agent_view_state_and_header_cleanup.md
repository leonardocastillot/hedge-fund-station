# Agent View State And Header Cleanup

## Objective

Fix Agent View state semantics and simplify the Strategy Pod header without
touching IPC, PTY manager, backend strategy logic, credentials, or live trading.

## Scope

- `src/features/agents/utils/workspaceAgentViewModel.ts`
- `src/features/agents/components/WorkspaceAgentView.tsx`
- `src/components/electron/TerminalPane.tsx`
- `src/components/electron/TerminalGrid.tsx`
- `src/features/desks/components/WorkspaceDock.tsx`
- `src/features/desks/pages/DeskSpacePage.tsx`
- `progress/current.md`

## Changes Made

- Agent View now treats `Needs Input` as real operator input only:
  `awaiting-approval` and approval drafts. `stalled` sessions stay in
  `Working` and display as `working`.
- Terminal run derivation no longer upgrades stale or quiet live runtimes to
  `attention`; they remain active with a quiet-output summary.
- Runtime monitor now suppresses auto-retry/relaunch once a runtime TUI has
  shown life, dispatched a mission, or is awaiting approval. This prevents
  `opencode ...` or similar launch commands from being injected into an
  already-running TUI.
- Manual retry is shown only for failed runtime boot state; live sessions ask
  for a new CLI instead of relaunching inside the same terminal.
- Strategy Pod header now shows only the pod title/gate plus `Inspector`,
  `Agent CLI`, and `Pod actions`. Suggested commands, Create/Improve, Evidence,
  and path metadata moved into the collapsed `Pod actions` panel.
- Inner Agent View top bar is reduced to a compact sessions counter and state
  pills, avoiding a duplicated title/header stack.

## Verification

Commands run:

```bash
rtk npm run agent:brief
rtk npm run agent:check
rtk npx tsc --noEmit
rtk npm run build
rtk npm run dev:doctor
rtk git diff --check
rtk curl -fsS -o /dev/null -w 'http=%{http_code} total=%{time_total}s\n' http://localhost:5173/workbench
```

Result:

- passed: harness brief/check
- passed: TypeScript
- passed: production build
- passed: dev doctor
- passed: whitespace diff check
- passed: `/workbench` HTTP smoke, `http=200`
- skipped: visual browser screenshot; Node REPL runtime does not have
  `playwright` installed

## Findings

- The repo and strategy harness should remain separate layers. The repo/file
  harness owns task coordination and handoffs; the strategy harness owns
  per-`strategy_id` lifecycle gates and evidence.
- The previous UI overloaded writable/interactive sessions with
  input-required state. That made normal agent sessions look blocked.
- Runtime retry was too willing to write the launch command back into the same
  terminal. The guard now blocks that after runtime handoff/activity.

## Memory Updated

intentionally unchanged: this reinforces existing harness docs instead of
creating a new durable rule.

## Assumptions

- `stalled` means quiet, slow, or not-yet-confirmed output; it does not by
  itself mean the operator must type input.
- `awaiting-approval` remains the UI signal for real required input.
- Full manual Electron smoke is still needed for actual PTY interaction.

## Next Best Step

Manual Electron smoke: launch OpenCode/Codex, let it work quietly, confirm it
stays `Working`, send a follow-up from Agent View, and confirm no launch
command is inserted into the running TUI.
