# Interactive Agent Permissionless Ticker Insight Missions

- Date: 2026-05-16
- Owner: codex
- Task: interactive_agent_permissionless_ticker_insight_missions
- Mission class: UI review-speed audit
- Status: done

## Summary

Implement permissionless interactive CLI launch defaults for Codex, Claude, and
OpenCode, while keeping backend Research OS `codex exec --sandbox read-only`
unchanged. Reorient strategy and analysis mission prompts to read the ticker
first, extract actionable insight, and only move into strategy implementation
when a falsifiable thesis survives.

## Result

- Codex interactive launchers now resolve to `codex --yolo`.
- Claude interactive launchers now resolve to
  `claude --permission-mode bypassPermissions`.
- OpenCode interactive launchers now resolve to
  `opencode run --interactive --model opencode/deepseek-v4-flash-free --dangerously-skip-permissions`.
  In OpenCode 1.15.3, permission bypass is documented on the `run` subcommand,
  not the root TUI command.
- Command Palette Codex/Claude actions and Claude Agent View now use the shared
  runtime helper instead of raw commands.
- Strategy Factory, Strategy Lab, and default trading agent prompts now start
  with ticker insight: regime, structure, funding, OI, liquidations, trigger,
  invalidation, and anti-regime.
- Backend Research OS `codex exec --sandbox read-only`, Gemini behavior, IPC,
  backend APIs, credentials, order routing, and release gates were not changed.

## Changed Files

- `src/utils/agentRuntime.ts`
- `src/utils/terminalShell.ts`
- `src/components/electron/CommandPalette.tsx`
- `src/features/agents/components/WorkspaceAgentView.tsx`
- `src/utils/missionControl.ts`
- `src/utils/strategyFactoryMission.ts`
- `src/contexts/AgentProfilesContext.tsx`
- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`

## Verification

- passed: `rtk npm run agent:check`
- passed: `rtk npx tsc --noEmit`
- passed: `rtk npm run build`
- passed: `rtk git diff --check`
- passed: `rtk npm run terminal:doctor`
- passed: `rtk zsh -lc 'codex --yolo --version && claude --permission-mode bypassPermissions --version && opencode --dangerously-skip-permissions --version'`
- follow-up passed: `rtk zsh -lc 'opencode run --interactive --model opencode/deepseek-v4-flash-free --dangerously-skip-permissions --version'`

## Risks

- Permissionless interactive agent CLIs are intentionally powerful. Repo
  guardrails still forbid live trading, credentials, production promotion, and
  order routing without explicit human approval.
- Existing persisted custom workspace commands that hard-code raw `codex`,
  `claude`, or `opencode` commands will not be rewritten unless they go through
  `agent-runtime` or the shared launcher helper.

## Memory

- Intentionally unchanged. The durable repo policy already captures backend
  ownership, agent harness, RTK/Caveman usage, and live-trading guardrails.

## Next

- Manual Electron smoke: open Codex, Claude, and OpenCode from the right dock
  or Command Palette and confirm the launched command line includes the new
  permissionless flags.
