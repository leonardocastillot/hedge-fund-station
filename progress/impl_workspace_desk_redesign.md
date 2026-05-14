# Workspace Desk Redesign

## Objective

Implement the Stations + Desks model so hedge fund work, global terminal work,
and side projects no longer share one vague workspace surface.

## Scope

- Electron workspace config and IPC types.
- Renderer desk context, terminal context, agent defaults, sidebar, command
  palette, terminal grid, workspace modal, diagnostics, and mission UI copy.
- Architecture and developer docs.

## Changes Made

- Added `WorkspaceKind` with `hedge-fund`, `command-hub`, `project`, and `ops`
  desk kinds.
- Added `kind`, `description`, `pinned`, and `default_route` to the workspace
  model.
- Added a required `Command Hub` desk that uses home/Documents as a neutral cwd
  and does not inherit hedge fund commands.
- Migrated existing workspace config on load, classifying `New project 9` as
  `hedge-fund` and non-marker repos as `project`.
- Replaced only legacy auto-generated hedge defaults on non-hedge desks.
- Grouped the sidebar into Trading Stations, Command Hub, Hedge Fund Desk, Ops,
  and Projects.
- Made terminal sessions carry `workspaceId`, added terminal desk filters, and
  made quick launches bind to the active desk.
- Changed default agent seeding to use `workspace.kind` instead of path/name
  regex and clean generated obsolete role agents when a desk kind changes.
- Updated user-facing copy from workspace to desk on the main desk/terminal,
  mission, diagnostics, and vault surfaces.

## Files Changed

- `electron/main/native/workspace-manager.ts`: migration, Command Hub, kind
  inference, default commands/profiles, and delete guard.
- `electron/types/ipc.types.ts`, `src/types/electron.d.ts`: desk model fields.
- `src/components/electron/Sidebar.tsx`, `TerminalGrid.tsx`,
  `WorkspaceModal.tsx`, `CommandPalette.tsx`: desk UX and terminal filtering.
- `src/contexts/AgentProfilesContext.tsx`, `WorkspaceContext.tsx`,
  `TerminalContext.tsx`: normalization and desk-aware terminal/agent state.
- `docs/project-architecture.md`, `docs/operations/how-to-develop-this-app.md`,
  `src/features/README.md`: terminology and kind rules.

## Verification

Commands run:

```bash
rtk npm run build
rtk npm run agent:check
rtk npm run terminal:doctor
rtk git diff --check
```

Result:

- passed

## Findings

- The local config currently has `dark_diamond` and `New project 9`; before this
  change both had hedge fund defaults. On next app load, `New project 9` remains
  `hedge-fund`, `dark_diamond` becomes `project` unless it has real hedge fund
  markers or is manually reclassified, and `Command Hub` is inserted.
- No backend strategy logic, paper/live execution, credentials, or trading
  command behavior was changed.

## Memory Updated

- promoted: architecture docs now own the durable Stations + Desks rule and
  `WorkspaceKind` classification.

## Assumptions

- `Command Hub` should be required and not deleteable.
- Existing custom saved commands/profiles should be preserved unless they match
  the old auto-generated hedge defaults.
- Manual desk kind choices should be respected after the new model exists.

## Next Best Step

Run a visual Electron smoke pass and, if the layout feels right, add a small
desktop-level regression check for the workspace migration shape.
