# Memory Policy

This is the governance policy for shared agent memory. Memory exists to reduce
context load, not to preserve every detail.

## Principle

Memory is a curated index of durable context, decisions, open risks, and links
to evidence. It is not a diary, transcript, scratchpad, command log, or artifact
store.

## Hard Limits

- `shared-memory.md`: maximum 20 bullets total.
- `decisions.md`: maximum 10 active visible decisions.
- `open-questions.md`: maximum 10 active questions.
- `mission-log.md`: maximum 20 milestone bullets.
- No raw command dumps, stack traces, prompts, long summaries, credentials,
  secrets, private keys, API tokens, or live-trading instructions.

If a file hits its limit, remove, merge, promote, or archive lower-value entries
before adding new ones.

## What Belongs In Memory

Add memory only when it helps a future agent avoid a real mistake or resume
important work quickly:

- stable repo facts that are expensive to rediscover
- accepted architecture or operating decisions
- unresolved questions that block meaningful work
- links to canonical docs or backend evidence
- high-value mission milestones

## What Does Not Belong In Memory

Do not store:

- temporary observations
- verbose handoffs
- full test output
- raw API payloads
- generated research reports
- implementation notes that belong in code comments or docs
- strategy evidence that belongs under `backend/hyperliquid_gateway/data/`

## Promotion And Cleanup

Use this lifecycle:

1. Capture a short memory item only if it is reusable.
2. Promote stable policy to `AGENTS.md`, `harness.md`, or an architecture doc.
3. Link execution evidence to backend artifacts or reports.
4. Delete obsolete memory.
5. Archive only when removal would hide an important historical decision.

Every memory update should state one of:

- added
- updated
- promoted
- archived
- removed
- intentionally unchanged

## Review Cadence

Review memory during repo health audits and recurring agent health checks.

Default cleanup rules:

- open questions older than 30 days need an owner, a decision, or removal
- mission log entries older than 90 days should be merged or removed unless they
  describe an architecture milestone
- decisions remain only while they actively prevent confusion

## Quality Bar

A good memory entry is short, durable, and actionable. If it cannot be understood
in one scan, it belongs in a real doc with a link from memory.
