# Product Objective

## North Star

Build Hedge Fund Station into a compounding hedge fund research and operating
system: every week the stack should become better at finding, validating,
reviewing, and safely paper-trading market opportunities.

The deeper ambition is company-scale: this repo is the operating memory for a
hedge fund where humans and agents work together over a long horizon. The fund
should be able to research, test, evaluate, and eventually operate strategies
inside explicit risk limits while preserving artifacts that future agents can
inherit.

For the full company philosophy, read
`docs/operations/hedge-fund-company-constitution.md`.

## Trading Lifecycle

Every serious trading idea should move through the same lifecycle:

1. Research
2. Backtesting
3. Evaluation
4. Production

Research turns an idea into a falsifiable thesis. Backtesting applies the thesis
to deterministic history. Evaluation asks whether the evidence is credible after
costs, anti-regimes, replay, validation, and paper trading. Production is only
available after the strategy has earned operational responsibility through
validated backend logic, risk limits, monitoring, and human sign-off.

## What The App Is For

The app is not just a dashboard. It is the cockpit for a backend-first research
loop:

1. collect and normalize market evidence
2. classify regimes and opportunity setups
3. score and rank candidate trades
4. validate strategies through replay and backtests
5. promote only credible candidates to paper trading
6. help the human operator review decisions quickly
7. capture lessons and feed them back into strategy rules

## What Constant Improvement Means

Agents should improve the project in ways that compound:

- clearer trading lifecycle artifacts
- better strategy specs
- more reliable data contracts
- stronger validation gates
- clearer paper-trade review
- faster operator inspection
- safer risk controls
- less coupling between UI and strategy logic
- better docs and handoffs for the next agent
- stronger company memory for future agents

## Ranking Improvements

When an agent has multiple possible improvements, rank them by:

1. strategy or validation quality impact
2. operational reliability impact
3. human review speed impact
4. data quality and auditability impact
5. implementation risk
6. scope size

Small improvements are valuable when they make future work easier or safer.

## Guardrails

Do not optimize for more automation before the validation loop is credible.

Avoid:

- live execution before replay and paper evidence
- strategy logic hidden in React
- UI features that cannot explain backend evidence
- claims of edge without costs, failure modes, and validation
- large reorganizations mixed with behavior changes

## Current Default Objective

Until the human says otherwise, autonomous improvement work should prioritize:

1. backend data quality and persistence
2. strategy validation and replay
3. paper trading review surfaces
4. operator speed and clarity
5. repo/agent workflow quality
