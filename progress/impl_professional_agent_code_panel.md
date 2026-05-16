# Professional Agent Code Panel

## Objective

Make the right-side Code panel feel like a professional agent workspace where each terminal has a clear identity, provider, mission state, and next action.

## Scope

- Renderer-only UI in `src/components/electron/TerminalGrid.tsx`
- Renderer-only UI in `src/components/electron/TerminalPane.tsx`
- Harness state in `progress/current.md`

## Changes Made

- Replaced the loose terminal quick-launch row with compact `Agent Launcher` cards for Codex, Claude, Gemini, Shell, and Dev.
- Each launcher now shows purpose, resolved command, provider badge, and live launch/open/attention state scoped to the visible workspace terminals.
- Kept the Code dock workflow intact: launching any card still creates and auto-focuses the terminal through existing `createTerminal` behavior.
- Added renderer-only terminal metadata for launched sessions: `agentName` for agent runtimes and purposeful `terminalPurpose` values for shell/dev/agent.
- Redesigned `TerminalPane` headers around provider/session identity, active state, runtime status, command, cwd, pty state, retry count, run id, and last detail.
- Moved color and visual-accent controls into a small tool cluster beside Close, so operational state owns the primary header.
- Strengthened active terminal focus using provider accent when present.

## Files Changed

- `src/components/electron/TerminalGrid.tsx`: agent launcher cards, launcher status derivation, improved launch metadata, and terminal metadata passthrough.
- `src/components/electron/TerminalPane.tsx`: professional identity-first header, runtime display mapping, compact metadata pills, and secondary tool controls.
- `progress/current.md`: live session state.

## Verification

Commands run:

```bash
rtk npx tsc --noEmit
rtk npm run build
rtk npm run agent:check
rtk git diff --check
rtk npm run dev:doctor
rtk curl -s -o /tmp/workbench-smoke.html -w '%{http_code} %{content_type}\n' http://localhost:5173/workbench
```

Result:

- passed: TypeScript compilation
- passed: production build
- passed: harness check
- passed: diff whitespace check
- passed: dev doctor
- passed: `/workbench` served `200 text/html`
- skipped: interactive visual click smoke for launching Codex/Claude/Gemini/Shell because no browser automation package/plugin was available in this session

## Findings

- No backend, IPC, trading logic, credential, or workspace schema changes were needed.
- Existing terminal context already had the required metadata fields; the work only surfaced and populated them more intentionally in renderer UI.

## Memory Updated

- intentionally unchanged: this was a focused renderer polish task and did not create durable strategy, architecture, or operations rules.

## Assumptions

- "Genuine" means terminals must read as identifiable agent sessions with provider, purpose, command, and state visible at a glance.
- Decorative terminal controls should remain available but not compete with runtime state.

## Next Best Step

Run a manual Electron smoke in `/workbench` and tune the launcher card density against real dock widths after launching all five providers.
