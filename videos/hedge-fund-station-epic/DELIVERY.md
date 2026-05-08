# Hedge Fund Station Epic Video Delivery

## Output

- Final project video:
  `videos/hedge-fund-station-epic/renders/hedge-fund-station-epic.mp4`
- CapCut-safe copies:
  `videos/hedge-fund-station-epic/renders/hedge-fund-station-epic-capcut-mobile.mp4`
  `videos/hedge-fund-station-epic/renders/hedge-fund-station-epic-capcut.mp4`
- Root render copy from the requested render command:
  `renders/hedge-fund-station-epic.mp4`
- Visual contact sheet:
  `videos/hedge-fund-station-epic/renders/contact-sheet.png`
- Review frames:
  `videos/hedge-fund-station-epic/renders/frame-opening-v3.png`
  `videos/hedge-fund-station-epic/renders/frame-graph-v3.png`
  `videos/hedge-fund-station-epic/renders/frame-close-v3.png`

## Specs

- Resolution: 1920x1080
- Duration: 40.09s container, 40.00s video
- Audio: instrumental background song only, no voiceover and no transition SFX
- Export compatibility: final MP4 is H.264 Constrained Baseline level 4.0,
  yuv420p, 30fps constant, AAC-LC stereo, `mp42` brand, and faststart moov atom
  for CapCut/mobile import compatibility.
- Opening capture: `videos/hedge-fund-station-epic/renders/primera.png`
- Second-scene capture: `videos/hedge-fund-station-epic/renders/backtesting.png`
- Memory graph capture: `videos/hedge-fund-station-epic/renders/grafo.png`
- Text: large kinetic captions with zoom, blur, wipe-in, sheen, and hard exit
- Privacy: sanitized demo values, no local paths, no credentials, no live
  execution claims

## Verification

- `npm run agent:check` passed before and after the work.
- `node -v` returned `v25.6.1`.
- `ffmpeg -version` returned `8.0.1`.
- `npx hyperframes info` ran successfully.
- `npx hyperframes lint videos/hedge-fund-station-epic` passed with 0 errors
  and 3 structural warnings for single-file composition density.
- `npx hyperframes inspect videos/hedge-fund-station-epic --samples 18`
  passed with 0 layout issues.
- `npx hyperframes render videos/hedge-fund-station-epic --fps 30 --quality high --output renders/hedge-fund-station-epic.mp4`
  completed successfully.
- `ffprobe` verified 1920x1080 video and 40.02s final duration.
- Re-exported the final MP4 for CapCut compatibility after import reported
  unsupported media.
- Revision includes an improved Strategy Memory Graph section and final flow:
  `Research -> Backtest -> Validate -> Paper -> Live`.
- Latest revision uses the requested `primera.png` opening image and `grafo.png`
  graph image from the project renders folder.
- Follow-up revision repositions `primera.png` more frontally for the opening
  and uses `backtesting.png` as the second image/Backtesting Evidence scene.

## Notes

- `progress/current.md` was intentionally left unchanged because it currently
  tracks an active strategy review handoff unrelated to this video delivery.
- The composition is intentionally self-contained and does not depend on
  Electron, Vite, the gateway, or private runtime state.
