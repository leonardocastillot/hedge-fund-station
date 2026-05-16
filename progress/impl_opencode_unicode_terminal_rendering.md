# OpenCode Unicode Terminal Rendering

- Date: 2026-05-16
- Owner: codex
- Task: opencode_unicode_terminal_rendering
- Mission class: UI review-speed audit
- Status: done

## Summary

Fixed the embedded terminal rendering path for OpenCode's Unicode block-art and
modern TUI glyphs. The issue was in the xterm rendering configuration, not the
OpenCode process itself.

## Changes

- Added `@xterm/addon-unicode11` so xterm uses Unicode 11 width rules for TUI
  glyph layout.
- Activated Unicode 11 on each terminal instance in `TerminalPane`.
- Moved Menlo/Monaco ahead of SF Mono in the terminal font stack for stronger
  macOS block glyph rendering.
- Tightened xterm line height from `1.2` to `1` so multi-line block letters do
  not split into disconnected bars.

## Verification

- passed: `rtk npx tsc --noEmit`
- passed: `rtk npm run build`
- passed: `rtk npm run agent:check`
- passed: `rtk git diff --check`
- passed: `rtk npm run terminal:doctor`

## Risks

- This changes the shared embedded terminal visual metrics, so other TUI apps
  will also use tighter line spacing. That is intentional for terminal fidelity.
- `npm install` reported existing npm audit findings after adding one package;
  this task did not run `npm audit fix` because that would be a broader
  dependency remediation.

## Memory

- Intentionally unchanged. This is a local terminal rendering fix, not a durable
  repo operating policy.

## Next

- Manual Electron smoke: open OpenCode in the right dock and confirm the logo
  and prompt render cleanly. Existing mounted terminals may need to be closed
  and reopened to pick up the new xterm metrics.
