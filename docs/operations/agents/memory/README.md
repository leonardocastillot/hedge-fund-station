# Agent Memory

This folder is the shared working memory for agents. Keep it short, factual, and
easy to scan. Memory optimizes context; it must not accumulate noise.

## Files

- `memory-policy.md`: size limits, promotion rules, cleanup cadence, and quality
  bar for memory.
- `shared-memory.md`: stable context agents should carry between sessions.
- `decisions.md`: architecture and operating decisions that should not be
  re-litigated without new evidence.
- `mission-log.md`: concise history of meaningful agent work.
- `open-questions.md`: unresolved questions that need human or evidence-based
  resolution.

## Rules

- Read `memory-policy.md` before adding memory.
- Prefer links to canonical docs over repeating long explanations.
- Record facts, decisions, and next actions; avoid diary-style narration.
- Do not store secrets, credentials, private keys, API tokens, or live trading
  instructions.
- If a memory item becomes permanent policy, promote it into `harness.md`,
  `AGENTS.md`, or the relevant architecture/runbook doc.
- If a memory item is execution evidence, link to the backend artifact or report
  instead of copying it here.
