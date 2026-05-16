# Right Dock UTF-8 CLI Stability

## Objective

Fix invalid OpenCode and agent CLI characters in the right dock while keeping
split terminal behavior.

## Scope

- Electron terminal process launch and persistent `screen` sessions.
- Renderer terminal font fallback and compact right-dock Code chrome.
- Harness task/current/history files.

## Changes Made

- Added UTF-8-safe defaults in `PTYManager.buildPtyEnv`: existing UTF-8 locale
  values are preserved, while unsafe or missing `LANG`, `LC_CTYPE`, and
  `LC_ALL` default to `en_US.UTF-8`.
- Updated persistent screen sessions to start and attach with `screen -U` and
  `-T screen-256color`, preserving existing session names, logs, reattach,
  stop, and snapshot behavior.
- Switched xterm font fallback to macOS-native mono fonts first:
  `SFMono-Regular`, `SF Mono`, `Menlo`, and `Monaco`.
- Removed the duplicate embedded layout/order toolbar from compact right-dock
  Code mode. The dock still renders split terminal panes; launch/switch controls
  stay in the dock toolbar.
- Fixed a stale `vertical` layout comparison and narrowed Strategy Factory
  evidence literal types so the requested TypeScript check passes cleanly.

## Files Changed

- `electron/main/native/pty-manager.ts`: UTF-8 locale defaults and screen launch
  flags.
- `src/components/electron/TerminalPane.tsx`: macOS-native mono font stack.
- `src/components/electron/TerminalGrid.tsx`: compact Code chrome cleanup and
  stale layout comparison fix.
- `src/utils/strategyFactoryMission.ts`: TypeScript literal narrowing for
  existing evidence refs.
- `agent_tasks.json`, `progress/current.md`, and `progress/history.md`: harness
  task state and handoff trail.

## Verification

Commands run:

```bash
rtk npm run agent:check
rtk npx tsc --noEmit
rtk npm run build
rtk git diff --check
rtk npm run terminal:doctor
```

Result:

- passed: harness check
- passed: TypeScript compilation
- passed: production build
- passed: whitespace diff check
- passed: terminal doctor / node-pty smoke

Additional probe:

- `screen -U -T screen-256color` starts with `TERM=screen-256color`.
- Full live Electron OpenCode glyph smoke was not automated from this API
  session; the running packaged app was an older build and the Vite browser
  preview cannot exercise Electron terminal IPC.

## Findings

- Existing detached OpenCode screen sessions were alive, so the user-visible
  failure matched corrupted terminal rendering rather than the app quitting.
- Finder-launched macOS apps cannot be trusted to inherit a UTF-8 shell locale,
  so terminal child process envs need explicit defaults.

## Memory Updated

intentionally unchanged: this is focused Electron/renderer terminal stability,
not durable strategy or company-memory context.

## Assumptions

- Existing corrupted scrollback may remain corrupted; new sessions and new
  output should render correctly.
- Split terminal panes remain the desired right-dock default.

## Next Best Step

Run the rebuilt macOS app, launch OpenCode plus one more CLI from the right dock,
and confirm box drawing/menu characters render cleanly in both panes.
