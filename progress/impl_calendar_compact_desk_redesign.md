# Calendar Compact Desk Redesign

- Agent: Codex
- Mission class: UI review-speed audit
- Date: 2026-05-11
- Status: done

## Summary

Redesigned `/calendar` from stacked vertical cards into a compact macro review
desk. The backend and API contracts are unchanged; the renderer still consumes
the existing alpha-engine calendar, analysis, news, holidays, intelligence, and
weekly brief modules.

## Changed Files

- `src/features/cockpit/pages/EconomicCalendarPage.tsx`
- `progress/current.md`
- `progress/history.md`
- `progress/impl_calendar_compact_desk_redesign.md`

## What Changed

- Added a sticky compact top strip with risk, source, update time, today,
  tomorrow, week, posture, warning, and refresh state.
- Added a week/hour map with days as columns and 2-hour buckets as rows; cells
  show event count and strongest impact, and clicking a day or cell filters the
  event table.
- Replaced event cards with a dense table for day, time, currency, impact,
  event, forecast, previous, and actual.
- Added filters for Focus, All, High, Medium, Low, currency, search, selected
  time bucket, and clear.
- Moved Brief, Checklist, News, and Holidays into a compact right rail with
  tabs.
- Integrated stand-aside windows and critical days as compact alert chips above
  the main desk.

## Verification

- `rtk npm run build` passed.
- `rtk git diff --check` passed.
- Desktop visual smoke in the Electron app passed:
  - `/calendar` shows the new top strip, week/hour map, right rail, and compact
    table.
  - Clicking `Mar 12 08:00-10:00` filters the table to that time block.
  - Switching to `Low` shows the LOW event within the active bucket.
  - `/calendar/intelligence` returning 404 is handled as a degraded module while
    `/calendar/this-week`, `/calendar/analysis`, `/calendar/news`, and
    `/calendar/holidays` still render.
- Narrow smoke was partial: a headless Chrome screenshot at `430px` only reached
  the app shell loading spinner before capture, but the calendar component uses
  scroll-contained map/table widths and responsive stacking for the right rail.

## Risks And Notes

- The default `Focus` filter includes HIGH, MEDIUM, and the next six upcoming
  events, so a few LOW events can appear when they are imminent.
- No backend strategy logic, paper runtime, credentials, broker/order routing,
  Electron IPC, or API contracts changed.
- Memory was intentionally unchanged; this is UI review-speed polish with a
  handoff artifact.

## Next Action

- Human review on `/calendar`: decide whether the Focus filter should include
  imminent LOW events or be strictly HIGH/MED only.
