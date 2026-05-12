# Calendar Warning Density Polish

- Agent: Codex
- Mission class: UI review-speed audit
- Date: 2026-05-11
- Status: done

## Summary

Compressed `/calendar` warning and alert presentation so the useful week/hour
map appears immediately after the top strip. Raw warning blocks no longer push
the schedule down.

## Changed Files

- `src/features/cockpit/pages/EconomicCalendarPage.tsx`
- `progress/current.md`
- `progress/history.md`
- `progress/impl_calendar_warning_density_polish.md`

## What Changed

- Replaced large header warning notices with compact readable pills such as
  `Saved cache` and `AI offline`.
- Filtered technical source-warning text out of the primary summary line.
- Moved warning details into the right rail `Data Status` section.
- Moved critical days and stand-aside windows out of the main column and into
  the right rail, so the week/hour map starts directly below the top strip.
- Kept the compact timezone selector and local-time map/table behavior.

## Verification

- `rtk npm run build` passed.
- Electron `/calendar` smoke passed: top strip is compact, warning details are
  in the rail, and the week/hour map appears immediately below the top strip.

## Risks And Notes

- Backend/API contracts are unchanged.
- No strategy logic, paper runtime, credentials, IPC, or order routing changed.
- Memory was intentionally unchanged; this is local UI review-speed polish.

## Next Action

- Human review: decide whether `Saved cache` and `AI offline` should remain as
  visible top-strip pills or move entirely into the rail after trust improves.
