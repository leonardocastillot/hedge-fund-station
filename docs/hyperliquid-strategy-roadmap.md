# Hyperliquid Strategy Roadmap

This roadmap is for building a short-horizon trading research stack on top of the Hyperliquid gateway already in this repo.

## Objective

Turn Hyperliquid data into a repeatable decision loop:

1. detect where attention and positioning stress are building,
2. classify the setup,
3. validate with microstructure,
4. simulate and paper trade before automation.

## Current Base

Already available in the repo:

- market overview with price, volume, open interest and funding
- orderbook, candles and recent trades
- per-symbol history snapshots
- alerts for score shifts, OI expansion, funding shifts and pressure changes
- liquidation pressure view derived from Hyperliquid positioning stress

## Next Build Order

### 1. Market Regime Layer

Add a backend job that classifies every refresh into:

- trend expansion
- crowded trend
- squeeze
- mean reversion
- chop / no edge

Required signals:

- price displacement
- OI delta
- funding percentile
- orderbook imbalance
- trade-flow imbalance
- liquidation pressure side

### 2. Setup Classifier

For each symbol, compute:

- breakout continuation score
- short squeeze score
- long squeeze score
- fade / exhaustion score
- no-trade score

The UI should expose a ranked watchlist:

- watch now
- watch on trigger
- ignore

### 3. Event Store

Persist snapshots to disk or sqlite instead of in-memory only.

Minimum tables:

- market_snapshots
- aggregate_pressure_snapshots
- alerts
- trades_paper
- signals_generated

Without persistence, there is no serious validation loop.

### 4. Research Harness For Fast Strategies

Before attempting any live high-frequency style execution, build a research harness with:

- replay of candles and snapshots
- deterministic signal evaluation
- fee model
- slippage model
- fill assumptions
- max loss guards
- per-session stop rules

Target first:

- very short-horizon discretionary support
- semi-automatic signal ranking
- paper trading

Do not jump straight to real automated high-frequency execution without this layer.

### 5. Candidate Fast Strategies

Research candidates:

- short squeeze continuation after negative funding and positive price impulse
- long flush continuation after positive funding and failed structure
- orderbook imbalance + trade aggression burst
- OI expansion with low follow-through as fade setup
- pressure flip after market-wide alert spike

Each strategy needs:

- entry trigger
- invalidation
- holding horizon
- max concurrent exposure
- expected trade frequency

### 6. Paper Execution Layer

Build a paper executor first:

- order simulation
- latency tracking
- signal-to-fill delay
- pnl by setup type
- pnl by market regime

Only after that should live routing be considered.

## Practical Warning

If the end goal is “many fast trades all day”, the hard part is not generating signals. It is:

- paying fees,
- surviving slippage,
- avoiding overtrading,
- proving the edge survives live conditions.

The platform should therefore optimize for:

- signal quality,
- fast review,
- replay and validation,
- risk containment.

## Recommended Next Repo Tasks

1. Add sqlite persistence for Hyperliquid snapshots and alerts.
2. Add per-symbol setup classifier scores in the backend.
3. Add a watchlist page with triggers and invalidations.
4. Add paper-trade journal and replay mode.
5. Add execution-quality metrics before any live automation.
