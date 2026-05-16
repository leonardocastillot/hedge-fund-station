# Current Agent Session

- Task: right_dock_utf8_cli_stability
- Status: done
- Last updated: 2026-05-16
- Owner: codex

## Plan

1. Add the scoped harness task and active session state.
2. Patch PTY and screen-backed CLI launch so agent terminals inherit UTF-8-safe locale and terminal capabilities.
3. Use macOS-native mono font fallbacks and remove duplicate compact Code-dock chrome while preserving split terminals.
4. Run harness, TypeScript, build, whitespace, and terminal doctor checks.
5. Write the implementation handoff, update history/task state, commit, and push the current branch.

## Evidence

- `electron/main/native/pty-manager.ts`
- `src/components/electron/TerminalPane.tsx`
- `src/components/electron/TerminalGrid.tsx`
- `src/utils/strategyFactoryMission.ts`
- `progress/impl_right_dock_utf8_cli_stability.md`

## Verification

- `rtk npm run agent:check`
- `rtk npx tsc --noEmit`
- `rtk npm run build`
- `rtk git diff --check`
- `rtk npm run terminal:doctor`

## Next

- Push source and handoff changes to the active branch.
