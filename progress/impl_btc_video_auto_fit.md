# BTC Video Auto-Fit Handoff

- Task: `btc_video_auto_fit`
- Date: 2026-05-16
- Owner: codex
- Mission class: UI review-speed audit

## Summary

Implemented a UI-only `/btc` workbench layout fix so the BTC video area uses
available app space when the window grows.

## Changed Files

- `src/features/cockpit/pages/BtcAnalysisPage.tsx`
- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`
- `progress/impl_btc_video_auto_fit.md`

## Implementation

- Replaced the fixed BTC grid row height with a `ResizeObserver`-backed
  container measurement hook.
- Derives the active responsive breakpoint from measured grid width.
- Computes row height from measured grid height and the visible layout row span.
- Derives focused video expansion at render time only, so persisted layouts stay
  unchanged.
- Keeps edit mode on the persisted layout shape so drag/resize edits remain
  predictable.

## Verification

- `rtk npm run agent:check` passed while task was active.
- `rtk npm run build` passed.
- Browser smoke on existing dev server `http://localhost:5173/btc`:
  - wide viewport `2400x1200`
  - `S1` focus mode showed one mounted stream
  - focused stream expanded into the full video column
  - grid height tracked the available main area

## Notes

- Ran raw `npm run dev` once because dev server commands are RTK exceptions; it
  exited after detecting `5173` already in use and briefly trying `5174`.
- No backend, Electron IPC, strategy logic, storage schema, or live/paper trading
  behavior changed.
- Memory unchanged: this is a small UI layout fix, not durable company context.
