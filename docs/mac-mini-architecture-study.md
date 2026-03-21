# Mac Mini Architecture Study

## Goal

Use the Mac mini to remove heavy backend load from the main workstation while building a more durable operating stack for:

- hedge fund research
- paper trading and replay
- AI agent workflows
- Leonardo Castillo web properties

The target is not "put everything on one machine because it exists".

The target is:

- stable trading research services
- inspectable APIs
- isolated workloads
- room for future scaling

## Current Repo Reality

This repo already points in the right direction:

- the Electron app is a control and review surface
- the Hyperliquid engine runs as a FastAPI backend in Docker
- the backend persists to a mounted SQLite database
- the frontend can already be pointed at a different backend URL through environment variables

That means the desktop app does not need the backend to run on the same PC.

## Recommendation In One Line

Use the Mac mini as a small services node, not as the single sacred center of the company.

For now it should host:

- backend APIs
- scheduled research jobs
- paper trading
- agent tooling
- databases and local object storage if needed

It should not become:

- the only copy of important data
- the only place where strategies can run
- the only machine with secrets
- the single point of failure for everything public and internal

## Best Near-Term Topology

### 1. Local Windows PC

Use it for:

- Electron app
- discretionary review
- coding
- ad hoc experiments
- charting
- occasional local backtests

Do not use it as the permanent home for:

- always-on refresh loops
- long-running backtests
- paper execution workers
- multi-strategy scans
- agent automation

### 2. Mac mini

Use it for:

- Docker services
- Hyperliquid backend
- replay and backtest workers
- scheduled data ingestion
- AI/agent runtime
- internal dashboards and APIs

This is the right first remote node because:

- it can stay on 24/7
- it decouples research compute from your operator machine
- it gives you a stable internal endpoint for the app

### 3. Public Internet / External Cloud

Use later for:

- public website hosting
- CDN
- backups
- offsite database snapshots
- team authentication
- monitoring and alert delivery

Do not start by exposing the trading backend directly to the open internet.

## Should The Mac Mini Be The Main Center?

Short answer: partially, but not absolutely.

### Good use of the Mac mini as center

- internal control plane
- always-on worker box
- internal API host
- agent host
- staging environment

### Bad use of the Mac mini as center

- only production database without backups
- only copy of historical datasets
- public web + internal trading + agent jobs all sharing resources with no isolation
- one-machine architecture with no recovery plan

The Mac mini is a good node.
It is not yet a serious "fund core" by itself unless you add:

- backups
- monitoring
- service isolation
- recovery plan
- secret management

## What To Do About OpenClaw

Assumption:
If "OpenClaw" is your local AI agent / automation runtime, treat it as a separate service domain, not as part of the trading engine.

Recommended:

- run the primary OpenClaw instance on the Mac mini
- keep it isolated from trading services
- expose it through its own container or compose project
- give it its own storage, logs, and secrets

Do not install OpenClaw on every machine unless there is a specific local-use reason.

Better pattern:

- Mac mini = shared company agent node
- Windows PC = client / development machine

Install it locally on Windows only if you need:

- local model access
- offline agent work
- dev/testing before shipping agent changes to the Mac mini

## Can The Hedge Fund Stack Live There Too?

Yes, but only if you split workloads cleanly.

Recommended separation on the Mac mini:

1. `compose.internal-trading.yml`
   - Hyperliquid gateway API
   - scheduler
   - paper executor
   - sqlite or preferably PostgreSQL later
   - local metrics exporter

2. `compose.agents.yml`
   - OpenClaw
   - job runners
   - document tools
   - automation queues

3. `compose.web.yml`
   - personal website
   - reverse proxy
   - static assets
   - optional CMS

These can share one host, but they should not share one undifferentiated Docker project.

## Can Your Personal Website Also Live There?

Yes, but with a hard boundary.

Good pattern:

- website behind `nginx` or `caddy`
- static site or isolated app container
- separate domain / subdomain
- separate environment variables
- separate logs
- separate restart policy

Do not make the public website container talk directly to the trading database.

If you want public-facing outputs from the fund side, publish a derived layer only:

- research blog posts
- delayed dashboards
- public performance commentary
- educational visualizations

Not:

- internal signals
- live positions
- private keys
- raw strategy internals

## Data Architecture Recommendation

Your current SQLite setup is acceptable for the current single-service phase.

But if you are moving to:

- more history
- more workers
- more concurrent writes
- more replay jobs
- multiple internal services

then evolve to:

### Phase 1

- SQLite for the current Hyperliquid gateway
- daily snapshot exports
- historical raw data stored in partitioned files

### Phase 2

- PostgreSQL for operational data
- Parquet files for research datasets and backtest inputs
- object storage for archives and exports

### Phase 3

- PostgreSQL + Timescale or DuckDB/Parquet research pipeline
- separate analytical jobs

Practical rule:

- operational tables -> PostgreSQL
- heavy historical analytics -> Parquet/DuckDB
- large archives and artifacts -> object storage or external disk

## Compute Strategy

You mentioned:

- lots of data
- backtesting
- more optimal entries
- multi-threaded processes

That means you should separate workloads by latency sensitivity.

### Low-latency / always-on

- market snapshots
- signal ranking
- alerts
- paper execution

These should be lightweight, deterministic, and always running.

### Heavy asynchronous research

- parameter sweeps
- replay
- walk-forward validation
- large feature generation
- Monte Carlo / robustness checks

These should run as batch jobs, not inside the live API process.

Best pattern on the Mac mini:

- API container
- worker container
- scheduler container
- database container

Then cap each one with CPU and memory limits.

## Do Not Solve This With More Threads First

Before optimizing for multiple threads, fix architecture first.

If your PC collapses today, the likely problem is one or more of:

- too much work on the same machine
- too many concurrent processes without limits
- heavy jobs mixed with interactive workflows
- no queueing between jobs
- local storage/database contention

Multi-threading helps only after workload separation and profiling.

The order should be:

1. separate machines / services
2. add job queues
3. measure bottlenecks
4. optimize code paths
5. then use concurrency where proven useful

## Proposed Company Stack

### Control Layer

- Electron desktop app on Windows
- optional browser dashboards

### Internal Services Layer on Mac mini

- Hyperliquid gateway API
- strategy scoring service
- paper trading service
- replay/backtest worker
- OpenClaw / agent runtime
- scheduler

### Data Layer

- PostgreSQL later
- Parquet/DuckDB research store
- backups to external destination

### Delivery Layer

- reverse proxy
- Tailscale or VPN for internal access
- HTTPS for public web properties

## Network Recommendation

Do not expose internal APIs directly with open ports.

Use:

- Tailscale or another private mesh VPN

This gives you:

- stable internal hostname for the Mac mini
- access from your Windows PC and other devices
- less attack surface
- no need to open broad public firewall rules

Suggested pattern:

- Mac mini on Tailscale
- Windows PC on Tailscale
- Electron app points to the Tailscale hostname for the backend

## Security Minimum

Before using the Mac mini as a real company node, add:

- secret storage outside repo env files
- no API keys committed in workspace files
- regular OS updates
- automated backups
- VPN-only access for internal services
- per-service env files
- basic audit logs

## Recommended Deployment Pattern

### Near-term

- keep source code in git
- deploy from repo checkout on Mac mini
- run services with Docker Compose
- use bind mounts only where necessary

### Better medium-term

- build versioned Docker images
- deploy tagged releases
- keep data volumes separate from code checkout
- add health checks and restart rules

## Immediate 30-Day Plan

### Phase A: Stabilize

- move the Hyperliquid backend container to the Mac mini
- point the Electron app to the Mac mini backend URL
- keep the Windows machine as client only
- set resource limits on containers
- keep SQLite initially

Success condition:

- your PC no longer freezes because the live backend is elsewhere

### Phase B: Separate workloads

- split API from heavy backtest/replay jobs
- create one worker service for research tasks
- add a scheduler service for periodic refreshes
- define storage folders for raw data, db, and artifacts

Success condition:

- heavy research no longer blocks the live API

### Phase C: Hardening

- add Tailscale
- add backups
- move secrets out of repo-local env files
- add container health checks
- add basic monitoring

Success condition:

- the Mac mini becomes dependable, not just convenient

### Phase D: Expansion

- host OpenClaw there as a separate service stack
- host your public website separately behind reverse proxy
- publish only safe derived outputs from fund research

Success condition:

- one machine, multiple uses, low cross-contamination

## Final Recommendation

The best next move is not to make the Mac mini "the whole company".

The best next move is:

- make it your internal services node
- move the always-on hedge fund backend there first
- keep the Windows PC as operator + dev workstation
- run OpenClaw there too, but isolated
- keep the website on the same host only if it is clearly separated
- prepare for later migration to PostgreSQL + research data files

If the project grows, the future architecture should become:

- Mac mini for internal services and orchestrations
- cloud/offsite for backups and public edge delivery
- workstation for control, review, and development

That gives you the right path from "one overloaded PC" to a real operating stack.

## Repo Implications

This repo is already close to that model because:

- the backend is containerized in `docker-compose.yml`
- the backend persists via a mounted volume
- the frontend can target remote APIs through env vars

The next engineering step should be to formalize remote deployment and workload separation, not to keep adding heavier processes to the local desktop.
