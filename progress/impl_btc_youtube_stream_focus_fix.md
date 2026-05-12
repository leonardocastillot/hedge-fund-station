# BTC YouTube Stream Focus Fix Handoff

## Objective

Fix the `/btc` YouTube stream panels that were showing error `152-4`, while
keeping the panels focused on the video itself.

## Scope

- `src/features/cockpit/pages/BtcAnalysisPage.tsx`
- `agent_tasks.json`
- `progress/current.md`
- `progress/history.md`

## Changes Made

- Replaced YouTube `/embed/<id>` URLs with first-party
  `https://www.youtube.com/watch?v=<id>` URLs inside the webview.
- Kept autoplay/mute query parameters on the watch URL.
- Added focused YouTube page injection that hides masthead, metadata, comments,
  related videos, chat, ads containers, and non-player panels.
- Forced the player area to occupy the whole webview panel with black
  background and `object-fit: contain` video sizing.
- Preserved player controls while fading top chrome until hover.
- Continued to enforce mute through both `webview.setAudioMuted(true)` and
  page-level video/player mute calls.
- External-open now uses the compatible watch URL instead of the embed URL.

## Files Changed

- `src/features/cockpit/pages/BtcAnalysisPage.tsx` - stream URL mode, focused
  YouTube CSS/JS injection, mute reinforcement, and compatible external links.
- `agent_tasks.json`, `progress/current.md`, `progress/history.md` - harness
  tracking and handoff state.

## Verification

Commands run:

```bash
rtk npm run build
rtk npx tsc --noEmit
rtk rg -n "youtube.com/embed|/embed/|embed silenciado|MutedYoutube|FocusedYoutube|youtube.com/watch" src/features/cockpit/pages/BtcAnalysisPage.tsx electron/main/index.ts
rtk git diff --check
rtk npm run agent:check
```

Result:

- passed: `rtk npm run build`
- passed: `rtk git diff --check`
- passed: `rtk npm run agent:check`
- passed: source search confirms `/btc` now uses `youtube.com/watch` and
  `FocusedYoutubeWebview`, with no `/btc` embed path remaining.
- partial: `rtk npx tsc --noEmit` still fails on existing non-BTC errors; it
  reports no `BtcAnalysisPage.tsx` errors.

## Findings

- Error `152-4` was most likely caused by the embedded-player path. This change
  avoids that path entirely instead of fighting embed restrictions.
- Visual playback still depends on the stream being available to the user's
  persisted YouTube session, especially for members-only streams.

## Memory Updated

intentionally unchanged: this is a focused UI compatibility fix and does not
create durable strategy or architecture policy.

## Assumptions

- Watch pages are acceptable as long as the webview hides YouTube's surrounding
  page chrome and prioritizes the player.
- Strong no-sound behavior remains required inside Electron webviews.

## Next Best Step

Open `/btc` in the Electron app and confirm each stream loads without `152-4`,
stays muted, and fills its panel cleanly.
