# Agentic Research OS

## Purpose

The Agentic Research OS is the backend-first agent layer for Hedge Fund Station.
It adapts the useful operating patterns from TradingAgents into this repo
without copying the equity/fundamental workflow or treating LLM output as a
trading engine.

The v1 goal is research acceleration:

1. inspect local strategy package state
2. inspect latest backtest, validation, paper, and gateway evidence
3. run a role-based debate
4. produce a structured decision artifact
5. recommend the next `hf:*` command for human review

It does not place live trades, promote strategies automatically, or replace
backend validation.

## Runtime Contract

Agent code lives under:

- `backend/hyperliquid_gateway/agents/`

Generated artifacts live under:

- `backend/hyperliquid_gateway/data/agent_runs/`
- `backend/hyperliquid_gateway/data/agent_runs/checkpoints/`

The artifact is JSON and includes:

- full run metadata
- per-role reports
- bull/bear debate notes
- structured Pydantic decision
- validation gaps
- recommended `hf:*` commands
- SQLite checkpoint path

LangGraph is used when installed. If the local Python environment does not have
LangGraph yet, the same graph runs through the sequential fallback so the CLI,
schemas, and API contract remain testable.

## Runtime Routing

The Research OS has two layers:

- deterministic graph: always runs, produces safe blockers and commands
- optional synthesis runtime: improves the final prose and review framing

Runtime order:

1. `codex-local`: uses the local `codex exec` command and the user's existing
   Codex/ChatGPT login.
2. `api-provider`: uses configured API providers such as DeepSeek or OpenAI.
3. `deterministic`: safe fallback with no model call.

The backend never reads or exports `~/.codex/auth.json`. It only checks the
`codex` command, probes `codex login status`, and reads non-secret model config
from `~/.codex/config.toml`.

Environment and CLI controls:

- `HF_AGENT_USE_AI=true` enables LLM synthesis by default
- `npm run hf:agent:research -- --strategy <id> --runtime auto`
- `npm run hf:agent:research -- --strategy <id> --runtime codex-local`
- `npm run hf:agent:research -- --strategy <id> --runtime api-provider`
- `npm run hf:agent:research -- --strategy <id> --runtime deterministic`
- `AI_PROVIDER_ORDER=deepseek,openai` chooses fallback order
- `DEEPSEEK_API_KEY=...`
- `DEEPSEEK_MODEL=deepseek-v4-flash` or `deepseek-v4-pro`
- `OPENAI_API_KEY=...`
- `OPENAI_AGENT_MODEL=<model>`

One-login Codex flow:

```bash
npm install -g @openai/codex
codex login
npm run hf:agent:runtime
npm run hf:agent:research -- --strategy funding_exhaustion_snap
```

The synthesis runtime is intentionally constrained:

- it cannot set `promotion_allowed` to true
- it cannot change the deterministic recommendation
- commands are filtered to `npm run hf:*`
- validation gaps remain deterministic

## CLI

Run an agentic research mission:

```bash
npm run hf:agent:research -- --strategy funding_exhaustion_snap
```

Show runtime status:

```bash
npm run hf:agent:runtime
```

Run a stricter audit mission:

```bash
npm run hf:agent:audit -- --strategy funding_exhaustion_snap
```

Run the deterministic graph plus an LLM synthesis pass:

```bash
npm run hf:agent:research -- --strategy funding_exhaustion_snap --ai
```

Try DeepSeek V4 Pro for the final synthesis:

```bash
DEEPSEEK_API_KEY=... npm run hf:agent:research -- \
  --strategy funding_exhaustion_snap \
  --ai \
  --provider-order deepseek,openai \
  --model deepseek-v4-pro
```

Fast/default DeepSeek V4 Flash:

```bash
DEEPSEEK_API_KEY=... npm run hf:agent:research -- \
  --strategy funding_exhaustion_snap \
  --ai \
  --provider-order deepseek \
  --model deepseek-v4-flash
```

List recent runs:

```bash
npm run hf:agent:status
npm run hf:agent:status -- --strategy funding_exhaustion_snap
```

Use the resulting recommendations to continue through the stable workflow:

```bash
npm run hf:backtest -- --strategy <strategy_id>
npm run hf:validate -- --strategy <strategy_id>
npm run hf:paper -- --strategy <strategy_id>
```

## API

Read-only endpoints for the app:

- `GET /api/hyperliquid/agent-runs`
- `GET /api/hyperliquid/agent-runs?strategy=<strategy_id>`
- `GET /api/hyperliquid/agent-runs/{run_id}`
- `GET /api/hyperliquid/agent-runs/strategy/{strategy_id}/latest`

The latest endpoint returns the agent decision plus a comparison against backend
strategy status so the UI can show whether the agent recommendation matches the
actual validation/paper stage.

## Roles

- Market Structure Analyst: summarizes gateway snapshots and alerts.
- Strategy Researcher Bull: argues the constructive case from package and
  backtest evidence.
- Strategy Researcher Bear: focuses on missing artifacts, anti-regimes, and
  validation risk.
- Validation Critic: turns missing evidence into explicit blockers and next
  commands.
- Risk Manager: enforces no-live-trading, no-auto-promotion, and paper-first
  guardrails.
- Portfolio/Research Manager: emits the final structured decision.

## Guardrails

- `promotion_allowed` is always `false` for agent artifacts.
- Agent recommendations are auxiliary evidence only.
- Strategy promotion still requires docs, backend logic, backtest, validation,
  paper candidate, paper runtime evidence, and human review.
- The Research OS must not change credentials, place orders, or perform live
  routing.
- UI integration must consume backend artifacts; it must not recreate strategy
  logic in React.
