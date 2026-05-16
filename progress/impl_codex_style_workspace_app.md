# Codex-Style Workspace App

## Objective

Redesign `/workbench` so each workspace feels like a Codex-style working
session: workspace list on the left, chat as the primary center surface, and
workspace tools on the right.

## Scope

- Renderer workspace UI under `src/features/desks/`
- Chat/workflow surface in `src/features/agents/components/MissionChatWorkbench.tsx`
- Shell layout and navigation in `src/components/electron/` and
  `src/features/cockpit/`
- No backend API, strategy logic, credentials, live routing, or persistence
  schema changes

## Changes Made

- Converted `/workbench` from a command-first panel into a chat-first workspace
  session with compact workspace identity, scoped stats, and quick Code/Shell/
  Browser/Codex actions.
- Reworked the right dock into workspace tools: `Code`, `Browser`, and `Runs`.
  Legacy `agent` dock mode is migrated to `runs`, while code/browser launches
  continue to open the dock automatically.
- Tightened `MissionChatWorkbench` copy and sizing so the full view reads like a
  Codex workspace: “Ask, draft, approve, run,” composer at the bottom, and
  drafts/approvals as the adjacent review panel.
- Polished the workspace switcher with lucide icons, compact path/kind metadata,
  and a clearer active indicator.
- Made `/workbench` the default app route and brand target so the app opens to
  the workspace operating room.

## Files Changed

- `src/features/desks/pages/DeskSpacePage.tsx` - chat-first workbench shell.
- `src/features/desks/components/WorkspaceDock.tsx` and
  `src/features/desks/workspaceDockEvents.ts` - right-side Code/Browser/Runs
  dock.
- `src/features/agents/components/MissionChatWorkbench.tsx` - Codex-style copy
  and full-height layout.
- `src/components/electron/Sidebar.tsx`,
  `src/components/electron/ElectronLayout.tsx`, `src/components/electron/AppNavRail.tsx`,
  `src/features/cockpit/WidgetPanel.tsx`, and
  `src/features/cockpit/navigation.ts` - workspace-first navigation and layout.

## Verification

Commands run:

```bash
rtk npm run agent:brief
rtk npm run agent:check
rtk npx tsc --noEmit
rtk npm run build
rtk git diff --check
rtk npm run dev:doctor
```

Result:

- passed: harness brief/check reported OK
- passed: TypeScript compilation completed
- passed: production build completed
- passed: `git diff --check`
- passed: dev doctor confirmed Vite, gateway, backend tunnel, paper signals,
  gateway process path, and workspace config
- passed: headless Chrome smoke on `http://localhost:5173/workbench` with a
  preload-style Electron API mock confirmed workspace name, workspace chat,
  Code/Browser/Runs dock tabs, composer placeholder, and Browser/Code tab
  switching; screenshot saved at `/var/folders/hw/sywrj9416x9cgqg51vj4tv4w0000gn/T/hfs-workbench-smoke.png`

## Findings

- The callable Browser plugin was not exposed in this session, and the Node REPL
  did not have Playwright installed. The smoke used headless Chrome + CDP with a
  mock Electron bridge instead.
- Existing unrelated working-tree changes were already present before this
  task; this patch worked with them and did not revert them.

## Memory Updated

intentionally unchanged: this is a workspace UI implementation with its durable
evidence in this handoff, not a new long-term operating rule.

## Assumptions

- “Like Codex app” means Codex workflow first, not pixel-perfect cloning.
- Chat is the primary workspace surface; Code/Browser/Runs are contextual tools.
- Drafts still require explicit approval before agents, backend actions, or
  terminals run.

## Next Best Step

Run the same smoke inside the real Electron app/browser tool when available and
then tune spacing if the user wants a more pixel-close Codex visual pass.
