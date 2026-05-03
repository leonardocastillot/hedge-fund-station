# Agentic Workbench

## Purpose

The Workbench is the operator-facing mission surface for Hedge Fund Station. It
should feel closer to Codex App than a wall of terminals: the trader talks to a
mission chat, reviews the proposed plan, approves execution, and then inspects
terminal evidence only when needed.

## Runtime Model

- Mission chat is the default surface for `/workbench` and the persistent right
  voice bar.
- Codex CLI is the default execution runtime.
- Terminal sessions are evidence and runtime controls, not the primary UX.
- Gemini direct-loop remains a legacy or advanced fallback, not the default
  Workbench path.

The app may draft, route, approve, launch, stop, summarize, and display
terminal output. It must not become the trading engine. Heavy market logic,
replay, backtesting, validation, paper execution, persistence, and audit
artifacts remain in `backend/hyperliquid_gateway/`, stable `npm run hf:*`
commands, or external workers.

## Mission Flow

1. The operator enters a mission by text or voice.
2. The Workbench creates a draft with:
   - mission mode
   - suggested specialist roles
   - approved command shortlist
   - risk guardrails
   - final Codex prompt
3. The draft waits for explicit operator approval.
4. Approval launches Codex CLI in a terminal with the final mission prompt.
5. The run captures terminal IDs, runtime state, output excerpts, timestamps,
   and task status.
6. The operator may open the evidence console, focus the active terminal, or
   stop the mission.

The right bar should stay voice-first: hold-to-speak is the primary control,
text is there for review and cleanup, and terminal output stays secondary.

## Guardrails

- Do not place live trades from the Workbench.
- Do not change credentials from a mission draft or Codex prompt.
- Do not run mutating commands without explicit operator approval.
- Prefer read-only probes and stable command surfaces first:
  - `npm run hf:doctor`
  - `npm run hf:status`
  - `npm run hf:backtest`
  - `npm run hf:validate`
  - `npm run hf:paper`
  - `npm run backend:health`
  - `npm run gateway:probe`
- Strategy claims need a validation path: spec, backend mapping, backtest,
  replay or paper evidence, and human review surface.

## UI Ownership

- `src/features/agents/components/MissionChatWorkbench.tsx` owns the chat-first
  mission surface.
- `src/contexts/CommanderTasksContext.tsx` owns mission messages, drafts, task
  runs, and approval state.
- `src/utils/agentOrchestration.ts` launches approved missions into Codex CLI
  terminal runs.
- `src/components/electron/TerminalGrid.tsx` remains the evidence console.

This split keeps the trader experience comfortable while preserving auditability
and the backend-first hedge fund operating model.
