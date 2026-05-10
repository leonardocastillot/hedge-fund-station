# Caveman Output-Only Mode

Caveman is the repo's optional output-token discipline for Codex and future
agents. In this repo it is output-only: make user-facing replies compact while
keeping reasoning quality, code quality, and evidence quality intact.

## Default Style

Use concise, answer-first prose:

- lead with the result or blocker
- cut filler, apologies, ceremony, and repeated setup
- prefer short paragraphs or flat bullets
- keep commands, file paths, code, numbers, dates, and risk language exact
- preserve enough context for the human to review the work safely

This is not parody mode. Do not degrade grammar, hide nuance, or use fake
primitive speech. The goal is less output, same precision.

## Scope

Apply Caveman output style to:

- progress updates to the user
- final responses
- PR summaries and handoff summaries when concise wording is enough

Do not apply it to:

- source code
- tests
- generated Graphify artifacts
- strategy specs that need full validation detail
- legal, financial, safety, risk, or production-gate explanations that need
  explicit nuance
- documents where the requested deliverable is a polished long-form artifact

## What Not To Install

Do not run Caveman context or memory compression in this repo without explicit
human approval:

- no `caveman-compress` over `AGENTS.md`, docs, memory, or strategy files
- no `caveman-shrink` MCP middleware
- no global hooks or always-on agent installs
- no rewriting curated memory just to make it shorter

If the human explicitly wants the upstream Codex skill, use the official
output-mode path and keep it scoped:

```bash
npx skills add JuliusBrussee/caveman -a codex
```

For this repo, the local `@CAVEMAN.md` include is the default because it keeps
the behavior reviewable in Git.
