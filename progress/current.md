# Current Agent Session

This file tracks the live session. Keep it short, current, and useful to the
next agent.

- Task: `one_bitcoin_strategy`
- Status: `review`
- Started: 2026-05-07
- Owner: `codex`

## Plan

- [x] Run `npm run agent:check` and inspect the strategy workflow.
- [x] Register the active One Bitcoin implementation task in `agent_tasks.json`.
- [x] Add One Bitcoin strategy docs and backend package.
- [x] Register One Bitcoin for stable `hf:*` backtest/validation workflows.
- [x] Add focused tests for accumulation variants, dip triggers, costs, and goal metrics.
- [x] Run verification and write the implementation handoff.
- [x] Refine One Bitcoin so primary selection maximizes BTC balance from now onward.
- [x] Add aggressive dip and research-only sell/rebuy variants.
- [x] Rerun verification, backtest, and update handoff.

## Log

- Human approved the One Bitcoin plan: BTC-only spot accumulation toward
  `1.0 BTC`, with `$300` starting cash, `$300` monthly deposits, no leverage,
  no shorting, no selling, and no live execution.
- Initial `npm run agent:check` passed with 25 tasks and 0 warnings.
- Worktree already contains many unrelated modified/untracked files from prior
  in-review tasks. This session will preserve those changes and only layer
  scoped One Bitcoin files/registry/tests/handoff updates on top.
- Added backend-first `one_bitcoin` docs, logic, scoring, risk, paper helper,
  backtest adapter, registry entry, and focused tests.
- CoinGecko long-range fetch returned `HTTP Error 401: Unauthorized` without a
  key, so the runner fell back to real Binance BTCUSDT daily candles and cached
  the source metadata.
- The initial fixed-hybrid backtest and validation artifacts were superseded
  and removed so the remaining One Bitcoin evidence points at the refined
  max-BTC report.
- Handoff written to `progress/impl_one_bitcoin_strategy.md`.
- Human follow-up: make the strategy useful from now onward and optimize for
  maximum BTC accumulation, including better dip buying and possibly research
  sell/rebuy logic.
- Refined report now selects the highest-BTC variant as primary, adds
  aggressive dip, drawdown-weighted DCA, and cycle-harvest research variants,
  and keeps order routing disabled.
- Latest backtest report:
  `backend/hyperliquid_gateway/data/backtests/one_bitcoin-one_bitcoin_btc_usd_daily-20260507T211002Z.json`.
- Latest validation report:
  `backend/hyperliquid_gateway/data/validations/one_bitcoin-20260507T211009Z.json`;
  validation remains blocked by design through `robust_gate`.

## Next Step

Reviewer should inspect the latest variant comparison. Current evidence says
monthly DCA remains the best BTC accumulator on the available sample; dip and
cycle-harvest variants did not beat it.
