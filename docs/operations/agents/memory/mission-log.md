# Agent Mission Log

Policy: this is a milestone index, not a diary. Keep 20 bullets or fewer.

## 2026-05-03

- Added an agent harness operating layer inspired by harness engineering:
  mission classes, permissions, checks, templates, and anti-live-trading rules.
- Consolidated agent operating docs into `docs/operations/agents/`.
- Added shared memory files under `docs/operations/agents/memory/`.
- Added curated memory governance with hard limits, promotion rules, and cleanup
  policy.
- Verified with `npm run hf:doctor`, `npm run hf:agent:runtime`,
  `python3 -m unittest tests/test_agent_research_os.py`, and `npm run build`.
