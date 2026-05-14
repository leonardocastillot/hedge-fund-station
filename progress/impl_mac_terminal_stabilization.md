# Mac Terminal Stabilization

## Objective

Fix the Electron/renderer terminal stack for macOS so stale Windows shells and
runtime launch loops do not leave consoles stuck in `launching`.

## Scope

- Electron PTY creation, diagnostics, and terminal IPC.
- Renderer terminal persistence, runtime state handling, settings, and
  Terminales / CLI controls.
- Workspace launch/profile helpers and runtime command resolution.

## Changes Made

- Added shared platform-aware shell normalization in `src/utils/terminalShell.ts`.
- Migrated saved app shell settings away from Windows defaults on macOS and made
  settings show Mac shell options first.
- Hardened PTY creation to normalize shell/commands before spawn and return the
  real shell/cwd/create result to the renderer.
- Normalized restored terminal sessions, converted stale `launching` states to
  `stalled`, and updated sessions from the PTY create result.
- Extended terminal prompt detection for zsh/bash/fish/macOS prompts.
- Added one-auto-retry runtime behavior, manual retry/diagnostics/close actions,
  PTY/runtime status separation, and quick launch buttons for Shell, Codex,
  Claude, Gemini, and Dev.
- Normalized workspace profile launches and diagnostics command checks.
- Follow-up fix: throttled terminal activity updates to 5 seconds and kept the
  xterm surface mounted across PTY/runtime prop updates, preventing visible
  refresh while typing.

## Files Changed

- `src/utils/terminalShell.ts`: shared shell and runtime-command resolver.
- `electron/main/native/pty-manager.ts`: native safety net before node-pty spawn.
- `electron/main/ipc/ipc-handlers.ts`: returns PTY create result to renderer.
- `src/contexts/TerminalContext.tsx`: session normalization, stale launch
  handling, and create-result updates.
- `src/components/electron/TerminalPane.tsx`: macOS prompt detection, retry
  controls, PTY/runtime pills, and stable xterm initialization.
- `src/components/electron/TerminalGrid.tsx`: Mac-resolved quick launch buttons.
- `src/features/settings/pages/SettingsPage.tsx` and `src/utils/appSettings.ts`:
  settings migration and shell dropdown.
- `src/utils/agentRuntime.ts`, `src/utils/workspaceLaunch.ts`,
  `electron/main/native/diagnostics-manager.ts`, and `scripts/mission-drill.mjs`:
  resolver adoption for launch/probe paths.

## Verification

Commands run:

```bash
rtk npm run terminal:doctor
rtk npm run hf:agent:runtime
rtk npm run build
rtk git diff --check
rtk npm run agent:check
```

Result:

- passed: `terminal:doctor` smoke passed for `/bin/zsh`; Codex resolved at
  `/opt/homebrew/bin/codex`.
- passed: `hf:agent:runtime` reported Codex available and authenticated via
  ChatGPT.
- passed: Electron/Vite build.
- passed: whitespace diff check.
- passed: harness check.

Manual Electron smoke:

- skipped: not launched in this session. Automated PTY/build/runtime checks cover
  the risky launch paths; the remaining visual confirmation is opening
  `/terminals` in the app.

## Findings

- The app default shell was still `powershell.exe`, and TerminalGrid preferred
  app settings over the workspace shell. That could override the repo's
  `/bin/zsh` workspace config.
- Restored sessions could preserve old `launching` state indefinitely.
- Runtime prompt detection only knew PowerShell/CMD prompts, so a Mac shell
  prompt could be misread as an unresolved runtime launch.
- React state was being touched for every terminal output chunk, and the xterm
  mount effect depended on runtime callback chains. That made the CLI feel like
  it refreshed while typing.

## Memory Updated

- intentionally unchanged: this was a platform reliability fix, not a durable
  trading or strategy policy change.

## Assumptions

- Target macOS shell is `/bin/zsh`.
- Codex, Claude, and Gemini are resolved from the user's PATH through zsh.
- Live trading stays outside this terminal reliability change.

## Next Best Step

Open the Electron app, smoke `/terminals` with Shell/Codex/Claude/Gemini/Dev,
then force one bad runtime command to confirm it stops at one auto-retry and
surfaces the failed/stalled actions.
