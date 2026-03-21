# Skill: Hedge Fund Data Quality

## Use This When

Use this skill when the task is:

- validate market data quality
- inspect payloads and schemas
- find anomalies, missing fields, duplicates, or suspicious values
- verify whether a strategy can trust a data source

## Read First

1. `AGENTS.md`
2. `docs/hedge-fund-agent-operating-model.md`
3. `backend/hyperliquid_gateway/app.py`
4. relevant service files in `src/services/`
5. relevant inspection pages in `src/pages/`

## Workflow

1. Identify source endpoint or storage table.
2. Define expected schema.
3. Check nulls, duplicates, drift, outliers, and time consistency.
4. Check whether the strategy depends on unstable fields.
5. Recommend backend fixes before UI work if trust is weak.

## Rules

- trust the backend contract, not assumptions from the UI
- prefer persistent evidence over one-off snapshots
- if data is not trustworthy, block strategy conclusions until fixed
