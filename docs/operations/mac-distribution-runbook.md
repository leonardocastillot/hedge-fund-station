# macOS Distribution Runbook

This runbook is for the first public Mac distribution path: signed and
notarized DMG/ZIP outside the Mac App Store.

## Prerequisites

- Apple Developer Program membership.
- A `Developer ID Application` signing identity installed in Keychain.
- Xcode command line tools.
- App-specific Apple ID password for notarization.

Check signing identities:

```bash
security find-identity -p codesigning -v
```

## Build

```bash
npm run build
npm run dist:mac
```

For a fast local bundle inspection:

```bash
npm run dist:mac:dir
```

## Verify

```bash
npm run mac:verify -- "release/1.0.0/mac-arm64/Hedge Fund Station.app"
```

The verification script checks bundle plist readability, deep code signature,
declared entitlements, and Gatekeeper assessment.

## Notarize

```bash
export APPLE_ID="you@example.com"
export APPLE_TEAM_ID="TEAMID1234"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
npm run mac:notarize -- "release/1.0.0/Hedge Fund Station-1.0.0-arm64.dmg"
```

Use the app-specific password from Apple ID settings. Do not commit or store
notarization credentials in this repo.

## Current Distribution Boundary

The public Mac app should remain a cockpit connected to authenticated backend
APIs or a local SSH tunnel. Trading credentials and heavy compute should stay
outside the app bundle.
