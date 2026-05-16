# Pine AI Lab Right Dock Rebuild

- Date: 2026-05-15
- Owner: `codex`
- Mission class: UI review-speed audit

## Changed Files

- `src/features/cockpit/pages/BtcPineLabPanel.tsx`
- `src/features/desks/components/StrategyInspectorPanel.tsx`
- `backend/hyperliquid_gateway/app.py`
- `tests/test_pine_lab.py`

## Summary

- Added a compact `surface="dock"` Pine Lab mode for the right Strategy
  Inspector.
- Dock Pine now auto-generates the RSI/volume preset on open, shows the local
  preview chart first, exposes quick presets, and keeps Pine code collapsed by
  default with copy support.
- Strategy Inspector now uses a separate Pine interval defaulting to `1h` and
  passes the selected strategy or pod symbol to Pine generation.
- Pine generation request validation now allows `lookback_hours` up to `4320`
  so daily previews can request enough candles.

## Verification

- `rtk python3 -m unittest tests.test_pine_lab` passed.
- `rtk npx tsc --noEmit --pretty false` passed.
- `rtk npm run build` passed.
- `rtk npm run agent:check` passed.
- `rtk git diff --check` passed.
- `rtk npm run gateway:restart` passed and restarted the local gateway with the
  updated Pine request validation.
- `rtk npm run gateway:probe` passed after restart.
- Browser smoke via local static `dist` server and Playwright passed:
  Strategy Inspector -> Pine showed Pine Lab, indicator preview, preset buttons,
  generated result, code toggle, expanded `//@version=6`, and no Pine error.
  Screenshot: `/tmp/pine-dock-smoke.png`.

## Risks And Notes

- TradingView compile validation remains manual; no code injection, order
  routing, live trading, credentials, or production promotion behavior changed.
- Browser smoke used a static `dist` server because `electron-vite preview`
  does not accept `--host`/`--port`; the server was stopped after verification.
