# Skill: Hedge Fund Data Quality

## Use This When

Use this skill when the task is:

- validate market data quality
- inspect payloads and schemas
- find anomalies, missing fields, duplicates, or suspicious values
- verify whether a strategy can trust a data source

## Read First

1. `AGENTS.md`
2. `docs/project-architecture.md`
3. `docs/hedge-fund-agent-operating-model.md`
4. `backend/hyperliquid_gateway/app.py`
5. relevant service files in `src/services/`
6. relevant inspection pages in `src/pages/`

## Expected Outputs

Return:

- source endpoint or table reviewed
- expected schema
- observed anomalies or trust gaps
- backend fixes required before strategy conclusions
- UI implications only after backend trust is clear

## Allowed Target Areas

- `backend/hyperliquid_gateway/app.py`
- `backend/hyperliquid_gateway/data/`
- `backend/hyperliquid_gateway/backtesting/`
- relevant strategy module under `backend/hyperliquid_gateway/strategies/`
- `src/services/` for client contract updates
- `src/pages/` or `src/components/` for inspection surfaces

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
- document whether generated artifacts are evidence, fixtures, or temporary
  runtime output
