# Calendar Local Timezone Display

- Agent: Codex
- Mission class: UI review-speed audit
- Date: 2026-05-11
- Status: done

## Summary

Updated `/calendar` so the operator can review macro events in a selected local
timezone. The default is the browser/system timezone, with `America/Santiago`
as fallback, and the selected timezone is persisted in local storage.

## Changed Files

- `src/features/cockpit/pages/EconomicCalendarPage.tsx`
- `progress/current.md`
- `progress/history.md`
- `progress/impl_calendar_local_timezone_display.md`

## What Changed

- Added a compact `Time` selector in the sticky top strip.
- Added timezone options for Chile, New York, UTC, London, and Tokyo.
- Persisted the selected timezone under
  `hedge-fund-station:calendar-time-zone`.
- Derived event day, display time, 2-hour bucket, Today/Tomorrow counts,
  search text, stand-aside fallback text, table rows, and map cells from the
  selected timezone.
- Kept the backend source timezone visible as `Source TZ` for auditability.

## Verification

- `rtk npm run build` passed.
- Electron `/calendar` smoke passed: the top strip shows `Time: Chile`, the
  map/table remain rendered, and event rows show local Chile times.
- Raw `curl` was used once to inspect exact `date_time` payloads because RTK
  intentionally compresses JSON values.

## Risks And Notes

- Backend/API contracts are unchanged; the backend already emits
  `America/Santiago` timestamps, and the renderer now consistently derives the
  visible schedule from the selected timezone.
- No strategy logic, paper runtime, credentials, broker/order routing, or IPC
  behavior changed.
- Memory was intentionally unchanged; this is local UI review-speed polish with
  a handoff artifact.

## Next Action

- Human review: if Chile should be forced even when the operating system is set
  to another timezone, change the default initializer from browser timezone to
  `America/Santiago`.
