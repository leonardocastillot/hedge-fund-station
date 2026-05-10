# Remove Marketing Surface

## Objective

Remove unused marketing/autoblogger/campaign code while preserving Gemini as
neutral Hedge Fund Station AI infrastructure for voice and agent workbench
flows.

## Scope

Inspected and changed Electron main/preload/native IPC boundaries, renderer
types and settings, workbench copy, and architecture docs. Backend trading APIs,
strategy logic, paper execution, credentials, and live execution behavior were
not changed.

## Changes Made

- Removed the Electron marketing automation manager, all `marketing:*` IPC
  channels, and `window.electronAPI.marketing`.
- Added `AIConfigManager` with `hedge-fund-ai.json` and neutral `ai:*` IPC for
  Gemini key status/save operations.
- Rewired Gemini Live voice, voice transcription, and direct loop to read the
  neutral AI config plus environment fallbacks.
- Updated Settings and Workbench copy to refer to Gemini or AI provider
  settings.
- Updated stale architecture/native docs so the removed campaign surface is not
  described as active Electron code.

## Files Changed

- `electron/main/native/ai-config-manager.ts`: new neutral Gemini config bridge.
- `electron/main/native/marketing-automation.ts`: deleted unused campaign,
  autoblogger, image, and post-generation manager.
- `electron/main/index.ts`, `electron/main/ipc/ipc-handlers.ts`,
  `electron/preload/index.ts`, `electron/types/ipc.types.ts`: replaced
  marketing IPC/preload/types with `ai:getConfigStatus` and
  `ai:saveGeminiApiKey`.
- `electron/main/native/gemini-live-voice.ts`,
  `electron/main/native/voice-transcription.ts`,
  `electron/main/native/agent-loop-manager.ts`: moved Gemini credential lookup
  onto neutral AI config helpers.
- `src/types/electron.d.ts`, `src/features/settings/pages/SettingsPage.tsx`,
  `src/features/agents/components/CommanderConsoleV2.tsx`: renderer contract
  and copy cleanup.
- `docs/architecture/backend-source-of-truth.md`, `electron/main/README.md`:
  documentation cleanup.

## Verification

Commands run:

```bash
npm run agent:check
npm run build
rg -n "marketing|Marketing|Auto-blogger|LinkedIn|website-hero|window\\.electronAPI\\.marketing|marketing:" electron src package.json
rg -n "ai:getConfigStatus|ai:saveGeminiApiKey|voice:getLiveStatus|voice:createLiveToken" dist-electron
rg -n "marketing|Marketing|Auto-blogger|LinkedIn|website-hero|window\\.electronAPI\\.marketing|marketing:" dist-electron
rg -n "hedge-fund-ai.json|marketing-ai.json|Marketing AI" electron src dist-electron package.json
git diff --check
```

Result:

- passed: harness check, build, whitespace check, source search, and built
  Electron search.
- passed: built preload/main expose `ai:*` and retain `voice:*`.
- skipped: live Settings key-save smoke, because writing a real Gemini key would
  mutate local credentials. Static build output confirms the new bridge exists.

## Findings

- The old marketing code was isolated in Electron IPC/native/preload/types plus
  one Settings call and one Workbench string.
- Existing Graphify/memory worktree changes were unrelated and were left
  untouched.

## Memory Updated

intentionally unchanged: this cleanup implements an already accepted
backend-first cockpit boundary and does not add a durable operating decision
beyond the updated architecture docs.

## Assumptions

- Existing Gemini keys saved only under the old local config filename need to be
  re-saved through Settings or supplied with `GEMINI_API_KEY` /
  `GOOGLE_API_KEY`.
- Gemini Live and direct loop remain part of the Hedge Fund Station workbench.

## Next Best Step

Open Settings in the app, save a Gemini key if needed, and confirm Gemini Live
status reports configured through the new AI provider bridge.
