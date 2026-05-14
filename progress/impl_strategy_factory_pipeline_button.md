# Strategy Factory Pipeline Button

Generated: 2026-05-14

## Scope

Implemented a Strategy Pipeline `Create Strategy` action that creates a reviewable Codex mission draft and launches only after operator approval.

## Changed Files

- `src/features/strategies/pages/StrategyLibraryPage.tsx`
- `src/features/strategies/components/StrategyFactoryModal.tsx`
- `src/utils/strategyFactoryMission.ts`
- `src/utils/missionDrafts.ts`
- `src/utils/missionDraftLaunch.ts`
- `src/features/agents/components/MissionChatWorkbench.tsx`

## Implementation Notes

- Added `StrategyFactoryFocus = 'auto' | 'scalper' | 'swing'`.
- Added Strategy Factory goal builder that mines docs, backend strategies, backtests, validations, paper artifacts, agent runs, memory, and handoffs.
- Goal requires a comparable benchmark board, evidence-based scalper/swing choice, no parameter-only curve fitting, backend-first implementation, tests, backtest, validation, and paper only when eligible.
- Live promotion remains blocked behind paper evidence, risk review, runbook, and explicit operator sign-off.
- Refactored Mission Chat draft construction into `src/utils/missionDrafts.ts`.
- Refactored approved mission terminal launch into `src/utils/missionDraftLaunch.ts`.
- Strategy Factory V1 uses existing local Codex login state and reuses `diagnostics.launchCodexLogin()` when Codex is not authenticated.
- No new OpenAI API key storage, OAuth token handling, or backend trading endpoint was added.

## Verification

- `rtk npm run agent:check` passed.
- `rtk npm run hf:agent:runtime` passed; Codex is authenticated through ChatGPT.
- `rtk npm run build` passed.
- `rtk git diff --check` passed.

## Risks And Follow-Up

- Manual Electron smoke was not run in this headless pass. Suggested smoke: open `/strategies`, click `Create Strategy`, create a draft, confirm it is awaiting approval, approve launch, and confirm a Codex terminal opens with the Strategy Factory goal.
- Focused TypeScript behavior is covered by pure exported builders and production build typechecking; this repo does not currently include a TS unit test runner.
- Existing dirty strategy and progress files were left untouched.
