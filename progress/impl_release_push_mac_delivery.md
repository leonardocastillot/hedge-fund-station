# Release Push Mac Delivery

- Date: 2026-05-16
- Agent: Codex
- Mission class: operations/runbook audit
- Status: done

## Summary

Packaged the current Electron app for this Apple Silicon Mac and prepared all
pending source, docs, harness, and handoff changes for publishing.

## Mac Artifacts

- App bundle:
  `release/1.0.0/mac-arm64/Hedge Fund Station.app`
- DMG:
  `release/1.0.0/Hedge Fund Station-1.0.0-arm64.dmg`
- ZIP:
  `release/1.0.0/Hedge Fund Station-1.0.0-mac-arm64.zip`
- DMG SHA256:
  `818c6ba61563adfa1ed99b23466f513bd702c63c0209139659754284ed15c8db`
- ZIP SHA256:
  `a56556e9e2fb21507397fb22df1e9c618908ef0c5df40b3fb16caf32435eab48`

## Commands

- `rtk npm run agent:check`
- `rtk python3 -m unittest tests.test_agent_harness tests.test_strategy_claims`
- `rtk git diff --check`
- `rtk npm run build`
- `rtk npm run dist:mac -- --arm64`
- `plutil -p "release/1.0.0/mac-arm64/Hedge Fund Station.app/Contents/Info.plist"`
- `codesign -dv "release/1.0.0/mac-arm64/Hedge Fund Station.app"`
- `shasum -a 256 "release/1.0.0/Hedge Fund Station-1.0.0-arm64.dmg" "release/1.0.0/Hedge Fund Station-1.0.0-mac-arm64.zip"`

## Results

- Harness check passed with 33 tasks and 0 warnings.
- Agent harness unit tests passed: 7 tests.
- Build passed.
- macOS packaging passed and produced arm64 DMG, ZIP, and `.app`.
- `release/`, `dist/`, and `dist-electron/` are ignored build artifacts and
  were intentionally not staged for Git.
- Focused changed-file secret scan found no literal credentials.

## Risk

- The macOS bundle is signed ad-hoc, not with a Developer ID certificate:
  `TeamIdentifier=not set`. This is acceptable for local use on this Mac, but a
  public distribution build still needs Developer ID signing and notarization.

## Next

- Push the source/handoff commit to the active remote branch.
