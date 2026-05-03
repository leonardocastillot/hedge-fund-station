# Backend Connectivity Runbook

## Daily Hybrid Mode

Use this as the default local workflow:

```bash
npm run backend:tunnel:start
npm run dev
```

The Mac app stays light: it edits files, renders the cockpit, and calls APIs.
The VM keeps heavy compute, credentials, recurring runners, and live market
state.

Treat `hf-backend-01` as the canonical place for heavyweight hedge fund
runtime work: backtests, replay, paper workflows, agent runs, checkpoints,
runtime SQLite state, and long-running backend services. The local repository
should keep code, docs, specs, and small curated artifacts only.

On macOS, `./open-hedge-fund-station-dev.command` also starts the local
Hyperliquid gateway for paper, liquidations, and market overview. If Docker is
not available, it falls back to a local Python `uvicorn` process on
`127.0.0.1:18001`.

## Backend Contracts

- Alpha engine VM tunnel: `http://127.0.0.1:18500`
- Local Hyperliquid gateway: `http://127.0.0.1:18001`
- Optional legacy trading backend: `http://127.0.0.1:18000`

The Electron status pill treats these as separate services. Legacy or the local
gateway can be offline without making the alpha VM offline, but Hyperliquid
overview, paper signals/trades, and liquidations require the local gateway.

## Quick Checks

```bash
curl -w "\n%{time_total}s\n" http://127.0.0.1:18500/health
curl -w "\n%{time_total}s\n" http://127.0.0.1:18500/status
curl -w "\n%{time_total}s\n" http://127.0.0.1:18500/runtime/status
curl -w "\n%{time_total}s\n" http://127.0.0.1:18500/evaluations
curl -w "\n%{time_total}s\n" http://127.0.0.1:18500/calendar/this-week
curl -w "\n%{time_total}s\n" http://127.0.0.1:18500/calendar/news
curl -w "\n%{time_total}s\n" http://127.0.0.1:18500/calendar/weekly-brief
npm run gateway:probe
```

Expected daily baseline through the SSH tunnel is roughly a few hundred
milliseconds per request. If `/health` is slow, suspect tunnel or VM load. If
only a feature route is slow, suspect that backend module or its upstream.

## Contract Mismatch

If `http://127.0.0.1:18500/status` returns `hyperliquid-alpha-engine`, the app
is connected to the VM alpha engine. Do not expect `/api/hyperliquid/overview`
to exist there unless the VM service explicitly exposes that route.

Use `http://127.0.0.1:18001` for the optional local Hyperliquid gateway Docker
or process contract when that gateway is running.

Required frontend environment for local Hyperliquid surfaces:

```env
VITE_HYPERLIQUID_GATEWAY_API_URL=http://127.0.0.1:18001
VITE_HYPERLIQUID_GATEWAY_WS_URL=ws://127.0.0.1:18001
```

## Slow Endpoint Triage

Measure expensive routes separately:

```bash
curl -w "\n%{time_total}s\n" http://127.0.0.1:18500/api/polymarket/btc-5m/status
curl -w "\n%{time_total}s\n" http://127.0.0.1:18500/api/polymarket/lab/overview
curl -w "\n%{time_total}s\n" http://127.0.0.1:18500/calendar/weekly-brief
```

The cockpit loads core runtime data first and lets these heavier modules finish
afterward so one slow endpoint does not block the whole page.

## VM Git Deploy

The VM should run the alpha engine from the same Git repository as the Mac
workspace. Do not copy backend files by hand unless this flow is blocked.

Canonical VM paths:

```bash
sudo mkdir -p /opt/hedge-fund-station
sudo mkdir -p /data/hedge-fund-station/hyperliquid_gateway/data
sudo chown -R optimus:optimus /opt/hedge-fund-station /data/hedge-fund-station
```

On the VM:

```bash
cd /opt/hedge-fund-station
git remote -v
git status --short --branch
git fetch origin
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git rev-parse origin/main
git pull --ff-only origin main
```

After pulling, update dependencies only when the changed files require it, then
restart the alpha-engine service using the VM's service manager. Common shapes:

```bash
python3 -m pip install -r requirements.txt
sudo systemctl restart hyperliquid-alpha-engine
sudo systemctl status hyperliquid-alpha-engine --no-pager
```

If the VM uses Docker instead of a systemd Python service, rebuild/restart the
container that exposes `127.0.0.1:18500`.

For the Hyperliquid gateway Docker service, keep runtime artifacts outside the
repo checkout:

```bash
export HF_HOST_DATA_ROOT=/data/hedge-fund-station/hyperliquid_gateway/data
export HYPERLIQUID_DATA_ROOT=/data
docker compose up -d --build hyperliquid-backend
```

To upload an existing local evidence tree to the VM without deleting local
copies:

```bash
gcloud compute scp --recurse \
  backend/hyperliquid_gateway/data \
  hf-backend-01:/data/hedge-fund-station/hyperliquid_gateway/ \
  --project=leonard-489819 \
  --zone=us-central1-a
```

Verify from the Mac through the tunnel after restart:

```bash
npm run backend:probe
curl -fsS http://127.0.0.1:18500/calendar/this-week
curl -fsS http://127.0.0.1:18500/calendar/news
curl -fsS http://127.0.0.1:18500/calendar/weekly-brief
```

If `/calendar/this-week` returns `source: Deterministic macro calendar
fallback`, the route is healthy but Forex Factory is blocked or rate-limited.
Keep the warning visible in the UI and weekly brief.

To keep the Forex Factory cache warm on the VM, run the refresh loop under the
VM service manager:

```bash
ALPHA_ENGINE_API_URL=http://127.0.0.1:18500 MACRO_CALENDAR_REFRESH_SECONDS=900 npm run calendar:refresh-loop
```

The backend also writes the latest successful calendar payload to
`/data/macro_calendar_latest.json` when `/data` is mounted, otherwise to
`backend/hyperliquid_gateway/data/macro_calendar_latest.json`. If Forex Factory
returns `HTTP 429`, the route serves that saved snapshot with an explicit
warning before falling back to deterministic risk markers.

## Push Scope Hygiene

Before pushing, review staged files explicitly:

```bash
git status --short --branch
git diff --name-status
git diff --cached --name-status
```

Include source, docs, scripts, `.env.example`, and intentional UI/runtime
changes. Exclude local `.env` files, Python bytecode, `__pycache__`, build
outputs, SQLite databases, temporary JSON, and timestamped generated research
artifacts unless a human explicitly asks to preserve a specific evidence file
in Git.
