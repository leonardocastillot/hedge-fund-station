# Operations Docs

This folder is for runbooks, command usage, tunnels, terminal workflows, and
operator procedures.

Recommended contents:

- command runbooks for `npm run hf:*`
- [hedge fund company constitution](./hedge-fund-company-constitution.md)
- [daily app development guide](./how-to-develop-this-app.md)
- backend health and tunnel procedures
- [backend connectivity runbook](./backend-connectivity-runbook.md)
- [agent operating system](./agents/README.md)
- [agent harness engineering guide](./agents/harness.md)
- [new agent orientation](./agents/orientation.md)
- [agent shared memory](./agents/memory/README.md)
- [strategy readiness matrix](./strategy-readiness-matrix.md)
- [macOS distribution runbook](./mac-distribution-runbook.md)
- local development setup
- deployment and packaging notes
- incident/debug checklists
- autonomous agent improvement protocols

Start here for agent automation:

- `hedge-fund-company-constitution.md` defines the company philosophy, trading
  lifecycle, and long-horizon agent role
- `product-objective.md` defines what recurring agents should optimize for
- `agents/harness.md` defines mission classes, permissions, checks, artifacts,
  and anti-live-trading rules
- `agents/automation-system.md` defines safe automation classes and outputs
- `agents/backlog.md` is the default improvement queue
- `agents/templates/handoff.md` standardizes handoffs between agents
- `agents/orientation.md` gets a fresh agent productive quickly
- `agents/templates/tasks.md` keeps missions scoped and verifiable
- `agents/templates/change-summary.md` keeps final reviews consistent
- `agents/memory/` keeps shared memory compact and easy to carry forward

Agent docs should live under `docs/operations/agents/`. Keep root-level
operation docs for non-agent runbooks, company objective, connectivity,
development, packaging, and readiness procedures.
