# Progress Folder

This folder is the durable working surface for AI agents.

The rule is simple: important subagent output lives in files, not in chat.
Chat responses may point to files with short references such as:

```text
done -> progress/explore_backend_boundaries.md
APPROVED -> progress/review_file_harness_bootstrap.md
blocked -> progress/current.md
```

## File Types

- `current.md`: active session state. Keep it updated while working.
- `history.md`: append-only summaries of completed meaningful sessions.
- `explore_<topic>.md`: read-only investigation reports.
- `impl_<task>.md`: implementation reports with files, commands, and results.
- `review_<task>.md`: reviewer verdicts.

Generated backend evidence, backtests, validations, paper artifacts, and agent
research runs stay under `backend/hyperliquid_gateway/data/` or the VM data
mount. This folder is for workflow continuity, not runtime datasets.
