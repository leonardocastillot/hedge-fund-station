# Native Workspace Agent View

## Objective

Build a provider-neutral Agent View as the default center surface for
`/workbench`, scoped to the active workspace.

## Scope

- Renderer workspace center: `src/features/desks/pages/DeskSpacePage.tsx`
- Agent UI/model: `src/features/agents/components/WorkspaceAgentView.tsx`,
  `src/features/agents/utils/workspaceAgentViewModel.ts`
- Terminal and run plumbing:
  `src/contexts/TerminalContext.tsx`,
  `src/contexts/CommanderTasksContext.tsx`,
  `src/components/electron/TerminalGrid.tsx`,
  `src/features/desks/components/WorkspaceDock.tsx`

## Changes Made

- Added `WorkspaceAgentView` as the default center `/workbench` view, with Chat
  retained as a secondary center tab.
- Added a normalized Agent View model that merges workspace-scoped runs,
  drafts, and agent terminal sessions into Needs Input, Working, Completed, and
  Failed groups.
- Added row actions for Peek, Reply, Attach, Retry, Stop, and Remove.
- Added a dispatch bar for one session, selected agents, or the full workspace
  roster, defaulting to Codex while still supporting Claude and Gemini.
- Added optional Claude official `claude agents --cwd <workspace>` launcher as
  a terminal action, without making Claude the default orchestrator.
- Added `writeToTerminal` and lightweight terminal output/exit monitoring in
  `TerminalContext`.
- Added run/draft removal helpers in `CommanderTasksContext`.
- Updated the right Code dock to pass the active terminal to compact
  `TerminalGrid`, so Attach shows one focused terminal instead of every
  workspace terminal.
- Raised UI terminal launch caps from 6 to 12 to support full hedge-fund agent
  rosters.

## Files Changed

- `src/features/agents/components/WorkspaceAgentView.tsx`: native center Agent
  View UI and dispatch/actions.
- `src/features/agents/utils/workspaceAgentViewModel.ts`: pure session-row
  derivation from existing contexts.
- `src/features/desks/pages/DeskSpacePage.tsx`: Agent View is the default
  center surface; Chat stays available.
- `src/features/desks/components/WorkspaceDock.tsx` and
  `src/components/electron/TerminalGrid.tsx`: focused terminal attach behavior.
- `src/contexts/TerminalContext.tsx` and
  `src/contexts/CommanderTasksContext.tsx`: shared write/remove plumbing.

## Verification

Commands run:

```bash
rtk npx tsc --noEmit
rtk npm run build
rtk npm run dev:doctor
rtk npm run agent:check
rtk git diff --check
rtk curl -sS -o /dev/null -w 'http=%{http_code} total=%{time_total}s\n' http://localhost:5173/workbench
```

Result:

- Passed: TypeScript, production build, dev doctor, harness check, diff check,
  and `/workbench` HTTP smoke.
- Limited: in-app browser DOM smoke cannot verify the Electron active workspace
  because the Vite browser preview has no Electron preload workspace/terminal
  API; it renders the expected no-workspace fallback.

## Findings

- The app already had most orchestration primitives: workspace-scoped agents,
  runs, drafts, terminal sessions, runtime provider metadata, and dock mode
  events.
- The missing piece was a single center view that treats those primitives as an
  operator table.
- Terminal runtime state still depends partly on renderer-side observation, but
  `TerminalContext` now tracks output/exit activity even when a terminal is not
  the main mounted pane.

## Memory Updated

intentionally unchanged: this is an implementation handoff, not a durable
architecture policy beyond the existing backend-first and agent-harness rules.

## Assumptions

- Active workspace scope is the default; global/all-workspace view can be added
  later.
- Provider-neutral native orchestration is preferred over a Claude-only center.
- Full workspace roster launch should fit within a 12-terminal UI cap.

## Next Best Step

Run one Electron-shell smoke from the real app: launch a Codex session from
Agent View, click Peek, Attach it to Code, send a Reply, then Stop/Remove the
session.
