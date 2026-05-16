# Hybrid Agent Console Refresh Handoff

- Task: `hybrid_agent_console_refresh`
- Date: 2026-05-16
- Agent: Codex
- Mission class: UI review-speed audit

## Changed

- Updated `src/components/electron/TerminalPane.tsx` so mounted xterm
  instances re-apply the shared hacker-light theme, font settings, and
  scrollback settings after renderer refreshes or app setting changes.
- Kept the PTY lifecycle untouched: terminal buffers, screen sessions, runtime
  state, and IPC behavior are preserved.
- Updated `src/features/agents/components/WorkspaceAgentView.tsx` so Agent View
  drives the right dock as the focused console surface:
  attach, launch, retry, Claude View, and send flows switch the dock to `code`,
  select the relevant terminal, and set terminal layout to `focus`.
- Renamed the visible attach action to `Live Console` in the peek panel and
  clarified row action tooltips.

## Verification

- `rtk npm run agent:check` passed.
- `rtk npm run build` passed.
- `rtk git diff --check` passed.

## Scope Notes

- Renderer-only change.
- No Electron IPC, `node-pty`, backend, terminal persistence schema, CLI
  command behavior, strategy logic, credentials, order routing, or market-order
  behavior changed.
- Agent View remains a control surface; no duplicate embedded terminal instance
  was added inside Agent View.

## Follow-Up

- Manual smoke: open `/workbench`, attach an agent row, and confirm the right
  dock opens to Code in focused terminal mode.
- Optional ANSI probe in an open CLI:
  `printf '\033[30mansi black\033[0m \033[90mbright black\033[0m \033[37mwhite\033[0m\n'`
- Shared memory intentionally unchanged; this is a UI workflow comfort fix, not
  durable architecture or trading knowledge.
