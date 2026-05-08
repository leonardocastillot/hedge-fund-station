# Backend Startup Runbook

This is the daily startup contract for Hedge Fund Station. Keep the desktop app
local, keep heavy runtime data on `hf-backend-01`, and keep the three backend
contracts separate.

## Canonical Services

| Service | Local URL | Owner | Use |
| --- | --- | --- | --- |
| Alpha engine VM tunnel | `http://127.0.0.1:18500` | `npm run backend:tunnel:*` | VM runtime status, evaluations, macro calendar, Polymarket BTC 5m, wallet views |
| Hyperliquid gateway | `http://127.0.0.1:18001` | Docker or `npm run gateway:restart` | Hyperliquid overview/detail, liquidations, paper signals/trades, strategy catalog |
| Legacy trading API | `http://127.0.0.1:18000` | optional compatibility service | legacy strategy/portfolio surfaces only |

Do not point Hyperliquid gateway UI surfaces at the alpha engine unless the VM
service explicitly exposes the same `/api/hyperliquid/*` contract.

## Daily Local Startup

Start the VM tunnel and desktop app:

```bash
npm run backend:tunnel:start
npm run dev
```

If working on Hyperliquid gateway code or paper/liquidation surfaces, also
start or restart the local gateway:

```bash
npm run gateway:restart
npm run gateway:probe
```

The macOS launcher `./open-hedge-fund-station-dev.command` may start the same
stack for normal app work. Use the explicit commands above when debugging
backend connectivity.

## VM Runtime Data

The VM is the canonical home for heavy runtime artifacts:

```text
/data/hedge-fund-station/hyperliquid_gateway/data
```

Backend services should see that path as `/data`:

```env
HYPERLIQUID_DATA_ROOT=/data
HYPERLIQUID_DB_PATH=/data/hyperliquid.db
HF_HOST_DATA_ROOT=/data/hedge-fund-station/hyperliquid_gateway/data
```

The local checkout should keep code, docs, curated smoke fixtures, and the small
`one_bitcoin_btc_usd_daily.json` fixture. Local SQLite databases, timestamped
backtests, agent runs, cache files, rendered builds, videos, and packaged apps
are runtime outputs and may be purged after the VM copy is verified.

## Health Checks

Run the stable probes:

```bash
npm run backend:probe
npm run gateway:probe
npm run hf:doctor
npm run hf:status
```

Expected routing:

- `npm run backend:probe` checks the alpha engine through `18500`.
- `npm run gateway:probe` checks the Hyperliquid gateway through `18001`.
- `npm run hf:*` reads backend code and artifact roots, not React state.

If a probe fails, restart only the owner service first. Do not restart Electron
for backend-only route changes unless the preload or renderer contract changed.

## Common Recovery

Restart the tunnel:

```bash
npm run backend:tunnel:stop
npm run backend:tunnel:start
npm run backend:probe
```

Restart the local Hyperliquid gateway:

```bash
npm run gateway:restart
npm run gateway:probe
```

Restart the VM Docker gateway after deploying code:

```bash
gcloud compute ssh hf-backend-01 --project=leonard-489819 --zone=us-central1-a
cd /opt/hedge-fund-station
git pull --ff-only origin main
export HF_HOST_DATA_ROOT=/data/hedge-fund-station/hyperliquid_gateway/data
export HYPERLIQUID_DATA_ROOT=/data
docker compose up -d --build hyperliquid-backend
curl -fsS http://127.0.0.1:18001/health
```

Live trading, credentials, and production promotion remain outside this
runbook. This startup flow supports research, validation, paper evidence, and
operator review only.
