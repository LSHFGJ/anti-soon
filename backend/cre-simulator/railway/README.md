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

Additional env for the `manual-jury` demo path:

- `CRE_SIM_LLM_API_KEY`
- `OASIS_API_URL`

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
curl -sS -X POST http://127.0.0.1:8787/api/cre-simulator/triggers/manual-jury \
  -H 'content-type: application/json' \
  -d '{"inputPayload":{"verifiedReport":{"magic":"ASRP","reportType":"verified-report/v3","payload":{"submissionId":"9","projectId":"2","isValid":false,"drainAmountWei":"1300000000000000000","observedCalldata":["0xdeadbeef"]},"juryCommitment":{"commitmentVersion":"anti-soon.verify-poc.jury-commitment.v1","juryLedgerDigest":"0x1111111111111111111111111111111111111111111111111111111111111111","sourceEventKey":"0x2222222222222222222222222222222222222222222222222222222222222222","mappingFingerprint":"0x3333333333333333333333333333333333333333333333333333333333333333"},"adjudication":{"adjudicationVersion":"anti-soon.verify-poc.adjudication.v1","syncId":"0x4444444444444444444444444444444444444444444444444444444444444444","idempotencyKey":"0x5555555555555555555555555555555555555555555555555555555555555555","cipherURI":"ipfs://cipher","severity":3,"juryWindow":"3600","adjudicationWindow":"7200","commitTimestampSec":"100","revealTimestampSec":"200","chainSelectorName":"ethereum-testnet-sepolia","bountyHubAddress":"0x3fBd5ab0F3FD234A40923ae7986f45acB9d4A3cf","oasis":{"chain":"oasis-sapphire-testnet","contract":"0x1111111111111111111111111111111111111111","slotId":"slot-1","envelopeHash":"0x6666666666666666666666666666666666666666666666666666666666666666"}}},"humanOpinions":[{"jurorId":"human:alice","finalValidity":"HIGH","rationale":"alice rationale","testimony":"alice testimony"}],"juryRoundId":7}}'
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
- `.sisyphus/evidence/live-vnet-init`
- `.sisyphus/evidence/live-verify`
- `.sisyphus/evidence/live-jury`
- `workflow/verify-poc/.verify-poc-idempotency-store.json`
- `workflow/auto-reveal-relayer/.auto-reveal-cursor.json`

If a worker or adapter execution quarantines a trigger or stage, inspect those files and the corresponding logs before clearing state manually.

## Registration bootstrap behavior

- The EVM-log worker now listens for `ProjectRegisteredV2` and dispatches `workflow/vnet-init` through the backend-owned `cre-workflow-simulate` adapter.
- The CRON worker remains a separately deployed always-on service. Project registration does not dynamically create CRON triggers; instead, the running worker continues ticking the checked-in `reveal-relay` schedule from `backend/cre-simulator/triggers.json`.
