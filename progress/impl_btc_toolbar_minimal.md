# BTC Toolbar Minimal Handoff

- Task: `btc_toolbar_minimal`
- Date: 2026-05-16
- Owner: codex
- Mission class: UI review-speed audit

## Summary

Compacted the `/btc` workbench header so the TradingView and BTC video area get
more vertical room.

## Changed Files

- `src/features/cockpit/pages/BtcAnalysisPage.tsx`
- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`
- `progress/impl_btc_toolbar_minimal.md`

## Implementation

- Reduced the BTC header to a single dense toolbar row.
- Shortened the title area to `BTC / Workbench`.
- Converted action and preset controls to icon-first buttons with tooltips and
  screen-reader labels.
- Kept intervals visible and shortened stream controls to `S1`, `S2`, and `M`.
- Hid horizontal toolbar scrollbars while keeping overflow available on narrow
  widths.

## Verification

- `rtk npm run agent:check` passed.
- `rtk npm run build` passed.
- Browser smoke on `http://localhost:5173/btc` at `1581x725`:
  - header height about `58px`
  - toolbar stayed on one row
  - TradingView started directly below the compact toolbar
  - no toolbar wrap into extra vertical rows

## Notes

- No backend, Electron IPC, strategy logic, storage schema, credentials, order
  routing, live trading, or production promotion changed.
- Memory unchanged: this is a focused UI polish change, not durable company
  context.
