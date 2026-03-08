# CRE Simulator Railway Runbook

## Services

Deploy `backend/cre-simulator` as three Railway services that share the same env model:

- HTTP service: `bun run start:http`
- CRON worker: `bun run start:cron`
- EVM-log worker: `bun run start:evm-log`

## Preflight commands

Run these locally before configuring Railway:

- `bun run preflight:http`
- `bun run preflight:cron`
- `bun run preflight:evm-log`

## HTTP service

- Root directory: repository root
- Start command: `cd backend/cre-simulator && HOST=0.0.0.0 PORT=$PORT bun run start:http`

## CRON worker

- Root directory: repository root
- Start command: `cd backend/cre-simulator && bun run start:cron`

## EVM-log worker

- Root directory: repository root
- Start command: `cd backend/cre-simulator && bun run start:evm-log`

## Environment model

Base env for all three services:

- `CRE_ETH_PRIVATE_KEY`
- `DEMO_AUDITOR_ADDRESS`
- `DEMO_AUDITOR_PRIVATE_KEY`
- `DEMO_OPERATOR_ADDRESS`
- `DEMO_OPERATOR_ADMIN_RPC_URL`
- `DEMO_OPERATOR_PRIVATE_KEY`
- `DEMO_OPERATOR_PUBLIC_RPC_URL`
- `DEMO_PROJECT_OWNER_ADDRESS`
- `DEMO_PROJECT_OWNER_PRIVATE_KEY`
- `TENDERLY_API_KEY`

Choose one Oasis upload mode:

- `VITE_OASIS_STORAGE_CONTRACT`, or
- `DEMO_OPERATOR_OASIS_UPLOAD_API_URL`, or
- `VITE_OASIS_UPLOAD_API_URL`

EVM-log listener only:

- `DEMO_OPERATOR_WS_RPC_URL`

## Smoke tests

Run these from a shell that can reach the deployed HTTP service or a local tunnel target.

### HTTP health

```bash
curl -sS http://127.0.0.1:8787/health
curl -sS http://127.0.0.1:8787/api/cre-simulator/status
```

### Manual trigger dispatch

```bash
curl -sS -X POST http://127.0.0.1:8787/api/cre-simulator/triggers/manual-run
```

If the trigger enters quarantine, inspect `GET /api/cre-simulator/triggers/status` and the worker logs before retrying.

### CRON worker smoke test

```bash
cd backend/cre-simulator && bun run start:cron -- --once
```

This should perform a single scheduler tick and exit.

### EVM-log worker startup validation

```bash
cd backend/cre-simulator && bun run start:evm-log
```

If `DEMO_OPERATOR_WS_RPC_URL` is missing or invalid, the worker should fail immediately with a clear environment error.

## Writable state paths

The staging demo still relies on filesystem-backed durable state. These paths must remain writable in the deployed runtime:

- `backend/cre-simulator/.demo-operator-state.json`
- `backend/cre-simulator/.trigger-state.json`
- `.sisyphus/evidence/demo-run`
- `workflow/auto-reveal-relayer/.auto-reveal-cursor.json`

If a worker or command quarantines a trigger or stage, inspect those files and the corresponding logs before clearing state manually.
