# Agent View Raw Chat CLI

## Objective

Make Agent View behave like a comfortable workspace chat: typing `hola` sends
only `hola` to the main CLI, without generated mission capsules or hidden
harness prompts.

## Scope

- `src/features/agents/components/WorkspaceAgentView.tsx`
- `src/features/agents/utils/workspaceAgentViewModel.ts`
- `src/contexts/TerminalContext.tsx`

## Changes Made

- Replaced the normal Agent View composer flow so Enter sends raw text to a
  workspace main CLI instead of creating a task and calling `launchAgentRun`.
- Added `workspace-main-agent` terminal purpose for the main per-workspace CLI.
- Added `pendingInput` support to `TerminalContext` so the first message can be
  queued while a newly opened Codex/Claude/Gemini CLI starts.
- Added `New main CLI`, `Launch selected`, and `Launch roster` as separate
  controls.
- Kept selected/roster launches explicit and changed them to use a short
  prompt that tells the runtime to read `AGENTS.md`, rather than the full
  mission capsule.
- Updated Agent View rows so the main CLI appears as an agent terminal and is
  sorted first inside its status group.

## Verification

Commands run:

```bash
rtk npx tsc --noEmit
rtk npm run build
rtk npm run dev:doctor
rtk npm run agent:check
rtk git diff --check
rtk curl -sS -o /dev/null -w 'http=%{http_code} total=%{time_total}s\n' http://localhost:5173/workbench
rtk rg -n "launchAgentRun|buildMissionPrompt|Mission Console workspace capsule|Mission Console handoff|missionPrompt" src/features/agents/components/WorkspaceAgentView.tsx src/features/agents/utils/workspaceAgentViewModel.ts
```

Result:

- Passed: TypeScript, production build, dev doctor, harness check, diff check,
  `/workbench` HTTP smoke, and static prompt-path sweep.
- Static sweep confirms Agent View no longer references `launchAgentRun`,
  `buildMissionPrompt`, or the Mission Console capsule text.
- Limited: real `hola` terminal injection still needs an Electron-shell smoke,
  because the browser preview does not expose preload terminal/workspace APIs.

## Findings

- The mega prompt came from the normal composer calling `launchAgentRun`, which
  always calls `buildMissionPrompt`.
- `TerminalPane` still owns explicit `missionPrompt` dispatch for Mission
  Console and selected/roster style launches, but normal Agent View chat now
  bypasses that path.

## Memory Updated

intentionally unchanged: this is a focused UI behavior fix and the report is
enough durable context.

## Assumptions

- Default provider remains Codex for new main CLIs.
- Shift+Enter is the multiline path; Enter sends the message.
- Explicit selected/roster launches may still use a short prompt, but ordinary
  chat must stay raw.

## Next Best Step

Open the real Electron app, type `hola` in Agent View with no main CLI running,
and verify the terminal receives only `hola`.
