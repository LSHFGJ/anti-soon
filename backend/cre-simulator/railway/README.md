# CRE Simulator Railway Runbook

## Services

Deploy `backend/cre-simulator` as three Railway services that share the same env model:

- HTTP service: `bun run start:http`
- CRON worker: `bun run start:cron`
- EVM-log worker: `bun run start:evm-log`

## Preflight commands

Run these locally from the repository root before configuring Railway:

- `bun run preflight:http`
- `bun run preflight:cron`
- `bun run preflight:evm-log`

## HTTP service

- Root directory: repository root
- Start command: `HOST=0.0.0.0 PORT=$PORT bun run start:http`

## CRON worker

- Root directory: repository root
- Start command: `bun run start:cron`

## EVM-log worker

- Root directory: repository root
- Start command: `bun run start:evm-log`

## Environment model

Shared env for all three services:

- `CRE_SIM_PRIVATE_KEY`
- `CRE_SIM_TENDERLY_API_KEY`
- `CRE_SIM_SEPOLIA_RPC_URL`
- `CRE_SIM_ADMIN_RPC_URL`
- `CRE_SIM_WS_RPC_URL` for the EVM-log worker
- `CRE_SIM_SAPPHIRE_RPC_URL` (optional if you use the default Sapphire testnet RPC)
- `CRE_SIM_BOUNTY_HUB_ADDRESS`
- `CRE_SIM_OASIS_STORAGE_CONTRACT`

The backend accepts the canonical env surface from `backend/cre-simulator/.env.example`, then derives the internal workflow env required by the adapters and trigger workers. Runtime-config JSON/file fallbacks and older simulator alias env names are not part of the supported Railway deploy contract.

## Smoke tests

Run these from a shell that can reach the deployed HTTP service or a local tunnel target.

### HTTP health

```bash
curl -sS http://127.0.0.1:8787/health
curl -sS http://127.0.0.1:8787/api/cre-simulator/status
```

### Manual trigger dispatch

```bash
curl -sS -X POST http://127.0.0.1:8787/api/cre-simulator/triggers/manual-reveal
curl -sS -X POST http://127.0.0.1:8787/api/cre-simulator/triggers/manual-verify \
  -H 'content-type: application/json' \
  -d '{"evmTxHash":"0x<PoCRevealed tx hash>","evmEventIndex":0}'
```

If the trigger enters quarantine, inspect `GET /api/cre-simulator/triggers/status` and the worker logs before retrying.

### CRON worker smoke test

```bash
bun run start:cron -- --once
```

This should perform a single scheduler tick and exit.

### EVM-log worker startup validation

```bash
bun run start:evm-log
```

If `CRE_SIM_WS_RPC_URL` is missing, the worker should fail immediately with a clear environment error.

## Writable state paths

The live backend still relies on filesystem-backed durable state. These paths must remain writable in the deployed runtime:

- `backend/cre-simulator/.trigger-state.json`
- `.sisyphus/evidence/live-verify`
- `workflow/verify-poc/.verify-poc-idempotency-store.json`
- `workflow/auto-reveal-relayer/.auto-reveal-cursor.json`

If a worker or adapter execution quarantines a trigger or stage, inspect those files and the corresponding logs before clearing state manually.
