# Terminal Bridge Reliability Implementation

## Objective

Make Electron in-app terminals reliably spawn usable shells and surface clear
diagnostics when the native PTY bridge is broken.

## Scope

- Inspected Electron terminal IPC, preload, native PTY manager, diagnostics,
  renderer terminal state, Workbench health checks, and local `node-pty`
  installation state.
- Kept changes scoped to Electron/native terminal reliability, renderer
  diagnostics, harness files, and package scripts.

## Changes Made

- Added `scripts/fix-node-pty-permissions.mjs` and `npm run terminal:doctor` to
  repair `node-pty` `spawn-helper` execute bits and run a real invisible PTY
  smoke test.
- Wired `postinstall` to run the permission repair after
  `electron-builder install-app-deps`.
- Hardened `PTYManager` with cwd validation, `node-pty` helper preflight,
  PATH prefixing for `/opt/homebrew/bin`, Unix login-shell launch args, clearer
  `posix_spawnp` errors, and a `smokeTest(cwd, shell?)` API.
- Added `terminal.smokeTest` through main IPC, preload, and renderer/main
  types.
- Extended diagnostics command checks to resolve commands through the workspace
  `cwd` and shell environment instead of a detached `which` path.
- Updated Mission Console and System Check so runtime command checks use the
  same workspace shell path used for terminal launch.
- Updated Workbench System Check to require runtime command availability,
  shell smoke success, and PTY smoke success.
- Centralized terminal close behavior so `closeTerminal` kills the backing PTY
  before removing renderer state.

## Files Changed

- `scripts/fix-node-pty-permissions.mjs`: reusable repair and smoke-test
  command.
- `package.json`: `terminal:doctor` script and postinstall repair hook.
- `electron/main/native/pty-manager.ts`: PTY preflight, launch environment, and
  smoke test.
- `electron/main/native/diagnostics-manager.ts`: shell-aware command
  resolution.
- `electron/main/ipc/ipc-handlers.ts`, `electron/main/index.ts`,
  `electron/preload/index.ts`, `electron/types/ipc.types.ts`, and
  `src/types/electron.d.ts`: terminal smoke-test IPC contract.
- `src/features/agents/components/SystemHealthCard.tsx` and
  `src/features/agents/components/MissionConsoleLauncher.tsx`: workspace-aware
  checks and PTY health visibility.
- `src/contexts/TerminalContext.tsx`, `src/components/electron/TerminalGrid.tsx`,
  `src/components/electron/CommandPalette.tsx`, and
  `src/features/agents/components/MissionChatWorkbench.tsx`: consistent PTY
  close path and actionable create-failure messaging.

## Verification

Commands run:

```bash
npm run agent:check
npm run terminal:doctor
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/fix-node-pty-permissions.mjs --smoke
npm run build
```

Result:

- passed: initial `npm run agent:check`
- passed: `npm run terminal:doctor`; it chmodded Darwin `spawn-helper` files and
  confirmed `/bin/zsh` could resolve `/opt/homebrew/bin/npm`, `/usr/bin/git`,
  and `/opt/homebrew/bin/codex`
- passed: Electron-as-Node PTY smoke with the same shell and command path
- passed: `npm run build`
- passed: final `npm run agent:check`
- skipped: interactive Electron `/terminals` and Workbench click smoke because
  this run validated the native PTY path through Electron-as-Node but did not
  drive the desktop UI

## Findings

- Root cause confirmed: `node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper`
  lacked executable permission, making `node-pty` throw `posix_spawnp failed`
  for every shell.
- Electron terminal reliability also depended on using the workspace shell/PATH;
  `/bin/zsh -lc` resolved the needed Homebrew commands before the patch, while
  raw `node-pty` spawn did not.
- The repo has many unrelated modified/untracked strategy and memory files from
  prior work; they were not reverted or intentionally changed for this task.

## Memory Updated

intentionally unchanged: this fix is documented in the implementation handoff,
`package.json`, and terminal diagnostics code; no durable shared-memory entry is
needed beyond those canonical artifacts.

## Assumptions

- Target macOS arm64 first while preserving Windows branches.
- Keep `node-pty`; do not replace in-app terminals with Apple Terminal.
- No trading logic, credentials, live execution, or backend strategy behavior
  changes are in scope.

## Next Best Step

Restart the Electron shell, open `/terminals`, create a new shell, and run
`pwd`, `command -v npm`, `command -v codex`, and `npm run hf:doctor` from the
visible terminal pane.
