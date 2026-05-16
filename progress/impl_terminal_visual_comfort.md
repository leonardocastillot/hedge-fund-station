# Terminal Visual Comfort Handoff

- Task: `terminal_visual_comfort`
- Date: 2026-05-16
- Agent: Codex
- Mission class: UI review-speed audit

## Changed

- Updated `src/components/electron/TerminalPane.tsx` with a shared high-contrast
  xterm theme: matte background, brighter foreground, cyan cursor, readable
  ANSI black, and readable bright-black.
- Reduced terminal chrome weight by replacing heavy active glows and blurred
  rainbow layers with softer borders, matte headers, and a thin optional accent
  rail.
- Wired terminal accent animation to the existing performance profile:
  `daily-light` and `ultra-light` stay static, while `full` may animate the
  opt-in accent.
- Tightened `src/index.css` xterm rules so terminal text has no text shadow,
  a stable dark background, and lower global noise opacity.

## Verification

- `rtk npm run agent:check` passed.
- `rtk npm run build` passed.
- `rtk git diff --check` passed.
- Automated browser smoke was attempted against the dev server, but the
  available Node REPL environment does not have Playwright installed
  (`Module not found: playwright`). No browser artifact was produced.

## Scope Notes

- Renderer-only change.
- No Electron IPC, `node-pty`, backend, terminal persistence, strategy logic,
  credentials, order routing, live trading, or production promotion changed.

## Risks And Next Action

- Remaining risk is visual-only: the operator should launch OpenCode in the
  right dock and run:
  `printf '\033[30mansi black\033[0m \033[90mbright black\033[0m \033[37mwhite\033[0m\n'`
  to confirm the exact local monitor/theme combination.
- Shared memory intentionally unchanged; this is a UI comfort fix, not durable
  architecture or trading knowledge.
