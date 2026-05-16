# Terminal CLI Persistent Screen Sessions

- Date: 2026-05-16
- Owner: `codex`
- Task: keep Workbench Agent CLI state across renderer reloads and Electron restarts.

## Changed

- Added persistent `screen` session metadata to terminal state.
- Added IPC options for `sessionBackend`, stable `sessionName`, transcript `logPath`, and `attachExisting`.
- Added `terminal:stopSession` so closing a persistent CLI can detach the view while `Stop session` explicitly ends the `screen` session.
- Updated the PTY manager to create, attach, detach, and stop local `/usr/bin/screen` sessions.
- Updated Workbench terminal launchers so agent/shell CLIs use `screen`; `NPM Dev` stays ephemeral.
- Added persistent-session status props to terminal panes and restore cards.

## Verification

- Not run by instruction. No build, tests, or `agent:check` were executed.
- Existing `agent:check` failures are unrelated stale task metadata and were intentionally not changed.

## Risks

- `/usr/bin/screen` is required for persistence; machines without it will fall back to failure messaging for persistent launches.
- `screen` sessions survive Electron restarts but not manual `screen -X quit`, OS reboot, or external process kills.
- Transcript logging depends on GNU screen logging commands available on the host.

## Next

- Run a manual `/workbench` smoke: launch Codex/OpenCode/Shell, reload renderer, restart Electron, confirm reattach.
- Then run TypeScript/build verification if desired.
