# Mac App Store Gap Analysis

The current recommended distribution target is outside the Mac App Store via
Developer ID signing and notarization. A Mac App Store edition should be treated
as a separate product variant.

## Likely Store Review Gaps

- Integrated terminals through `node-pty`.
- Shell and process spawning for Docker, gcloud, SSH, and local commands.
- Workspace access across arbitrary user-selected folders.
- Webviews for TradingView/YouTube and external browser control.
- Agent workflows that automate local tools.
- Finance/trading claims that require clear disclosures and strong account/API
  boundaries.

## Store-Friendly Variant

A future Mac App Store build should likely be a read-only cockpit:

- no terminal panel
- no Docker or shell process control
- no local agent runtime launcher
- no trading credentials in the bundle
- authenticated backend API only
- clear data/privacy disclosure and support URL

## Decision Rule

Ship the notarized Developer ID app first. Revisit Mac App Store only after the
cockpit has stable backend authentication, a clear privacy policy, and a
read-only mode that can pass sandbox review.
