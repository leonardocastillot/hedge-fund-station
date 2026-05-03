#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-release/1.0.0/mac-arm64/Hedge Fund Station.app}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found: $APP_PATH" >&2
  echo "Build a directory artifact first with: npm run dist:mac:dir" >&2
  exit 1
fi

echo "Inspecting: $APP_PATH"
plutil -p "$APP_PATH/Contents/Info.plist" >/dev/null

SIGNING_DETAILS="$(codesign -dv "$APP_PATH" 2>&1 || true)"
echo "$SIGNING_DETAILS"

if echo "$SIGNING_DETAILS" | grep -q "TeamIdentifier=not set"; then
  echo "App bundle is not signed with a Developer ID identity." >&2
  echo "Install a Developer ID Application certificate, rebuild with npm run dist:mac:dir, then run this check again." >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
codesign -dvvv --entitlements :- "$APP_PATH" || true
spctl --assess --type execute --verbose=4 "$APP_PATH"
