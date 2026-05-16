# Terminal-First Code Panel

## Objective

Make the right-side Code dock minimal, professional, and terminal-first.

## Scope

- Renderer-only UI in `src/features/desks/components/WorkspaceDock.tsx`
- Renderer-only UI in `src/components/electron/TerminalGrid.tsx`
- Renderer-only UI in `src/components/electron/TerminalPane.tsx`
- Harness state in `progress/current.md`

## Changes Made

- Replaced the always-visible Work Queue card area with a compact Queue strip that renders only when queue items exist.
- Kept queue review/focus behavior in `History` instead of duplicating terminal focus cards in Code.
- Hid workspace filters and persistent agent chips in compact embedded Code mode.
- Added a single compact `+` launcher with a popover for Codex, Claude, Gemini, Shell, and Dev.
- Removed duplicate mission terminal cards from compact Code mode.
- Added compact terminal chrome so Code dock terminal headers show only provider, name, runtime state, and close by default.
- Moved command/cwd/pty/retry/detail metadata into header tooltip for compact Code mode.
- Hid decorative color/rainbow controls in compact Code mode while preserving them outside compact mode.

## Files Changed

- `src/features/desks/components/WorkspaceDock.tsx`: conditional compact queue strip and terminal-first panel layout.
- `src/components/electron/TerminalGrid.tsx`: compact embedded Code mode, `+` launcher menu, hidden filters/mission cards in compact mode.
- `src/components/electron/TerminalPane.tsx`: `compactChrome` header mode and hidden decorative controls in compact Code.

## Verification

Commands run:

```bash
rtk npm run agent:brief
rtk npm run agent:check
rtk npx tsc --noEmit
rtk npm run build
rtk git diff --check
rtk npm run dev:doctor
rtk curl -s -o /tmp/workbench-terminal-first-smoke.html -w '%{http_code} %{content_type}\n' http://localhost:5173/workbench
```

Result:

- passed: harness brief/check
- passed: TypeScript compilation
- passed: production build
- passed: diff whitespace check
- passed: dev doctor
- passed: `/workbench` served `200 text/html`
- not run: interactive Electron launch smoke for the `+` menu; browser automation was not available in this session

## Findings

- The main clutter source was stacked duplicated chrome: queue cards, terminal toolbar/filter row, always-visible agent chips, mission cards, and terminal header metadata.
- No backend, IPC, trading, credential, or schema change was needed.

## Memory Updated

- intentionally unchanged: this was a focused renderer polish task.

## Assumptions

- Minimal means terminal-first with critical state visible and secondary details available through tooltips or History.
- Terminal focusing from queue items should live in History for this compact version.

## Next Best Step

Manual Electron smoke in `/workbench`: launch Codex and Shell from `+`, verify auto-focus, hover a terminal header for metadata, and confirm the Queue strip opens History when active work exists.
