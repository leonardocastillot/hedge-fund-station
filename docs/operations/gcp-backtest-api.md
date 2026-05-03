# GCP Backtest API Runbook

## Owner

Backtesting and validation must run in `backend/hyperliquid_gateway/` on the GCP VM or through the VM tunnel. Electron and React only call the API and inspect artifacts.

The VM is also the canonical storage location for heavy backend evidence. Keep
agent runs, checkpoints, SQLite runtime state, replay outputs, and full
timestamped reports under:

```text
/data/hedge-fund-station/hyperliquid_gateway/data
```

Backend services should see that directory as `/data` and run with:

```env
HYPERLIQUID_DATA_ROOT=/data
HYPERLIQUID_DB_PATH=/data/hyperliquid.db
```

## Service

The Docker service is `hyperliquid-backend` from `docker-compose.yml`.

It exposes container port `18400` and maps it to host port `18001`.

Set this on the VM before starting Docker so the repo checkout does not absorb
runtime artifacts:

```bash
export HF_HOST_DATA_ROOT=/data/hedge-fund-station/hyperliquid_gateway/data
```

The app should point to the VM or tunnel with:

```env
VITE_HYPERLIQUID_GATEWAY_API_URL=http://<gcp-vm-or-tunnel-host>:18001
```

For local tunnel development, use:

```env
VITE_HYPERLIQUID_GATEWAY_API_URL=http://127.0.0.1:18001
```

## Backtest Endpoints

- `GET /api/hyperliquid/backtests/status`
- `GET /api/hyperliquid/backtests/{strategy_id}/latest`
- `POST /api/hyperliquid/backtests/run`
- `POST /api/hyperliquid/backtests/run-all?run_validation=true&build_paper_candidate=false`

Request body for one strategy:

```json
{
  "strategy_id": "short_squeeze_continuation",
  "run_validation": true,
  "build_paper_candidate": false
}
```

## Deployment Check

After updating the VM:

```bash
sudo mkdir -p /opt/hedge-fund-station /data/hedge-fund-station/hyperliquid_gateway/data
sudo chown -R optimus:optimus /opt/hedge-fund-station /data/hedge-fund-station
cd /opt/hedge-fund-station
export HF_HOST_DATA_ROOT=/data/hedge-fund-station/hyperliquid_gateway/data
docker compose up -d --build hyperliquid-backend
curl -fsS http://127.0.0.1:18001/health
curl -fsS http://127.0.0.1:18001/api/hyperliquid/backtests/status
```

Do not promote a strategy to live execution from these endpoints. A passing backtest only unlocks paper review; production still requires paper journal evidence and human sign-off.
