# OpenCode Terminal Runtime

## Objective

Add OpenCode as a first-class workspace/agent terminal runtime so the operator
can launch it for strategy work through the same surfaces as Codex, Claude, and
Gemini.

## Scope

- Inspected repo harness, architecture, agent workflow docs, and terminal/agent
  launcher code.
- Changed renderer/runtime typing and launcher surfaces only.
- Did not change backend strategy logic, gateway APIs, credentials, paper
  execution, live routing, or production gates.

## Changes Made

- Added `opencode` to the shared `AgentProvider` type and mission console
  provider contracts.
- Added OpenCode provider metadata, runtime command resolution, provider
  inference for `opencode`, `open code`, and `deepseek`, and shell normalization
  for `opencode.cmd`.
- Added OpenCode launch actions to the right Code dock `+` menu, full terminal
  launcher, Agent View provider selector, Mission Console provider selector,
  Agent Supervisor provider chips, command palette, workspace header action,
  system health provider checks, mission drill command list, and saved-command
  placeholder.
- Preserved backend-first guardrails. OpenCode is only a CLI terminal runtime.

## Files Changed

- `src/types/agents.ts`, `src/types/tasks.ts`,
  `electron/types/ipc.types.ts`, `src/types/electron.d.ts`: provider typing.
- `src/utils/agentRuntime.ts`, `src/utils/terminalShell.ts`,
  `src/contexts/TerminalContext.tsx`: command resolution and persisted session
  normalization.
- `src/components/electron/TerminalGrid.tsx`,
  `src/features/desks/components/WorkspaceDock.tsx`,
  `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/features/agents/components/MissionConsoleLauncher.tsx`,
  `src/features/agents/components/AgentSupervisorBoard.tsx`,
  `src/features/agents/components/KnowledgeDock.tsx`,
  `src/features/agents/panels/AgentsPanel.tsx`,
  `src/components/electron/CommandPalette.tsx`,
  `src/features/desks/pages/DeskSpacePage.tsx`,
  `src/components/electron/WorkspaceModal.tsx`: OpenCode launch surfaces.

## Verification

Commands run:

```bash
rtk npm run agent:brief
rtk npm run agent:check
rtk command -v opencode
rtk opencode --version
rtk npm view opencode-ai version description bin --json
rtk npm install -g opencode-ai
rtk npm list -g opencode-ai --depth=0
rtk zsh -lc 'command -v opencode && opencode --version'
rtk zsh -lc 'opencode models 2>/tmp/opencode-models-err.txt | head -n 80'
rtk zsh -lc 'opencode --model opencode/deepseek-v4-flash-free --version'
rtk npx tsc --noEmit
rtk npm run build
rtk git diff --check
rtk npm run dev:doctor
rtk npm run terminal:doctor
```

Result:

- Passed: harness check, TypeScript, production build, whitespace check, and
  dev doctor.
- Follow-up repair: installed official npm package `opencode-ai@1.15.0` into
  `/opt/homebrew`, creating `/opt/homebrew/bin/opencode`.
- Follow-up repair: `opencode --version` returns `1.15.0` from both zsh login
  and interactive shell checks.
- Follow-up repair: `opencode models` lists
  `opencode/deepseek-v4-flash-free`; the OpenCode provider launcher now starts
  with `--model opencode/deepseek-v4-flash-free`.
- Browser smoke: `/workbench` loaded at `http://localhost:5173/workbench`, but
  the Vite browser preview has no Electron preload workspace/terminal API, so it
  only showed the no-workspace fallback. Static bundle verification confirmed
  OpenCode strings in the built workbench chunks.
- Original local shell issue is fixed: `opencode` is now visible on PATH.

## Findings

- The repo was already dirty with many prior UI/workbench changes before this
  task. This handoff describes only the OpenCode additions.
- OpenCode availability depends on the workspace shell PATH. If the app reports
  the command missing, add the OpenCode install path to the shell used by that
  workspace.

## Memory Updated

intentionally unchanged: this is a small provider integration with evidence in
the handoff; it does not create durable architecture policy beyond existing
agent-runtime rules.

## Assumptions

- The intended CLI command is `opencode`.
- OpenCode model/account selection, including any DeepSeek V4 free quota, is
  handled inside the OpenCode CLI and not by Hedge Fund Station.

## Next Best Step

Launch OpenCode from the Electron workbench Code dock in the real app shell and
confirm it opens in the active hedge-fund workspace.
