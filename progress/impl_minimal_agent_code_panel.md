# Minimal Agent Code Panel

## Objective

Compress the right-side Code panel so it keeps agent clarity without consuming terminal workspace.

## Scope

- Renderer-only UI in `src/components/electron/TerminalGrid.tsx`
- Renderer-only UI in `src/components/electron/TerminalPane.tsx`
- Harness state in `progress/current.md`

## Changes Made

- Reworked `Agent Launcher` from tall cards into a minimal `Agents` strip.
- Launcher buttons now show only provider badge, name, and a tiny status dot; purpose, command, and detailed state remain in the tooltip.
- Compressed the Code toolbar by putting layout and workspace filters on the same row.
- Reduced terminal header padding, badge sizes, active/status pills, and tool button dimensions.
- Replaced multiple metadata pills with one subtle single-line metadata row.
- Preserved existing terminal creation, auto-focus, provider metadata, runtime state, and workspace scoping behavior.

## Files Changed

- `src/components/electron/TerminalGrid.tsx`: smaller Code toolbar and minimal agent launcher strip.
- `src/components/electron/TerminalPane.tsx`: denser terminal header and single-line metadata.
- `progress/current.md`: live session state.

## Verification

Commands run:

```bash
rtk npm run agent:brief
rtk npm run agent:check
rtk npx tsc --noEmit
rtk npm run build
rtk git diff --check
rtk npm run dev:doctor
rtk curl -s -o /tmp/workbench-minimal-smoke.html -w '%{http_code} %{content_type}\n' http://localhost:5173/workbench
```

Result:

- passed: harness brief/check
- passed: TypeScript compilation
- passed: production build
- passed: diff whitespace check
- passed: dev doctor
- passed: `/workbench` served `200 text/html`

## Findings

- The previous agent launcher was functionally useful but too visually expensive for the right dock.
- Renderer already had enough metadata; this pass focused on density and visual hierarchy.

## Memory Updated

- intentionally unchanged: this is a focused UI density correction, not durable strategy or architecture memory.

## Assumptions

- Minimal means key state visible at a glance, with secondary details available but not occupying the main terminal area.

## Next Best Step

Manual Electron smoke in `/workbench`: launch each agent from the compact strip and tune labels if any provider button feels cramped at the narrowest dock width.
