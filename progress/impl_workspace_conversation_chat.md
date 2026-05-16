# Workspace Conversation Chat

- Date: 2026-05-15
- Agent: Codex
- Mission class: UI review-speed audit
- Status: done

## What Changed

- Added local `MissionConversation` state with `active` and `archived` status.
- Migrated existing workspace messages and drafts without `conversationId` into
  a stable `Workspace history` conversation per workspace.
- Made `MissionChatWorkbench` chat-first: compact conversation selector at the
  top, simple message timeline, compact composer, and lightweight draft/run
  cards.
- Added `New`, `Close`, and archived `History` recovery controls per workspace.
- Scoped messages and drafts to the active workspace conversation.
- Changed draft approval copy/actions to `Run in Code`; approval now publishes
  the workspace dock mode as `code`.
- Tightened the right draft column into an `Active` panel with pending drafts and
  recent runs only.
- Updated the `Runs` dock so recent runs can focus their associated terminal in
  `Code`.

## Important Files

- `src/types/tasks.ts`
- `src/contexts/CommanderTasksContext.tsx`
- `src/utils/missionDrafts.ts`
- `src/features/agents/components/MissionChatWorkbench.tsx`
- `src/features/desks/components/WorkspaceDock.tsx`

## Verification

- `rtk npx tsc --noEmit` passed.
- `rtk npm run build` passed.
- `rtk npm run agent:check` passed.
- `rtk git diff --check` passed.
- `rtk npm run dev:doctor` passed.
- Browser smoke opened `http://localhost:5173/workbench` with no console errors.
  The web preview cannot exercise workspace chat flows because it lacks the
  Electron workspace bridge, so the Electron-specific create/select workspace,
  terminal launch, and `Run in Code` visual flow were covered by type/build
  verification rather than full browser interaction.

## Risks And Follow-Up

- Conversations are renderer/localStorage state only, by design.
- Existing history is preserved as `Workspace history`; no deletion path was
  added.
- No backend API, backend schema, trading logic, credentials, live trading, or
  production routing changed.
