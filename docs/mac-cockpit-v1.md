# Mac Cockpit v1

Internal desktop control surface for `hyperliquid-alpha-engine`.

## Runtime

- GCP project: `leonard-489819`
- VM: `hf-backend-01`
- Zone: `us-central1-a`
- Engine, from the Mac app: `http://127.0.0.1:18500`
- Engine, on the VM: `http://127.0.0.1:18500`
- Desktop mode: read-only audit for all live/paper execution mutators

## Local Setup

```bash
npm install
cp .env.example .env
npm run backend:tunnel:install
npm run dev
```

`backend:tunnel:install` creates a macOS LaunchAgent at:

```text
~/Library/LaunchAgents/com.hedgefund.backend-tunnel.plist
```

It keeps this local-only bridge alive across login and network reconnects:

```bash
127.0.0.1:18500 -> hf-backend-01:127.0.0.1:18500
```

This is the normal credential-safe workflow: Polymarket/Hyperliquid credentials
stay on the VM and the desktop app only receives API responses through SSH.

Build the macOS package with:

```bash
npm run dist:mac
```

Open the packaged app and tunnel together with:

```bash
./open-hedge-fund-station.command
```

Tunnel commands:

```bash
npm run backend:tunnel:status
npm run backend:tunnel:start
npm run backend:tunnel:stop
```

## API Contract Used By The Cockpit

- `GET /health`
- `GET /status`
- `GET /runtime/status`
- `GET /evaluations`
- `GET /market/context/BTC`
- `GET /calendar/analysis`
- `GET /calendar/this-week`
- `GET /api/polymarket/btc-5m/status`
- `GET /api/polymarket/btc-5m/trades`
- `GET /api/polymarket/btc-5m/equity-curve`
- `GET /api/polymarket/btc-5m/auto/status`
- `GET /api/polymarket/wallet/overview`
- `GET /api/polymarket/lab/overview`

## Audit Guard

The desktop client blocks these mutating Polymarket actions:

- `POST /api/polymarket/btc-5m/run-once`
- `POST /api/polymarket/btc-5m/auto/start`
- `POST /api/polymarket/btc-5m/auto/stop`
- `POST /api/polymarket/btc-5m/trades/{trade_id}/close`
- legacy Polymarket validation start/stop calls

Before enabling desktop execution, close public access to `tcp:18500` with an
allowlist, VPN, or SSH tunnel and add backend-side authentication.

Suggested GCP hardening after confirming the app works through the tunnel:

- remove or disable ingress rule `allow-alpha-engine-18500`
- keep SSH access restricted to trusted IPs
- keep all trading credentials only in the VM/backend environment
