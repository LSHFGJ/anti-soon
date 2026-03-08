<p align="center">
  <img src="frontend/public/logo/antisoon-logo-horizontal.svg" alt="AntiSoon" width="420">
</p>

<p align="center"><strong>No more soon. Verify now. Get paid now.</strong></p>

<p align="center">
  AntiSoon is a decentralized vulnerability verification network powered by Chainlink CRE.
  It gives researchers and project owners a tighter loop for encrypted PoC submission,
  deterministic replay, and payout-oriented result handling.
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="#architecture">Architecture</a>
</p>

## Overview

AntiSoon exists to reduce the delay and opacity that still define many smart contract audit competitions. The current product and docs focus on a few practical entry points instead of one giant protocol manual: browse bounties, register a project, submit an encrypted PoC, then track verification state and payouts.

| Goal | Route | What happens there |
| --- | --- | --- |
| Browse active bounty programs | `/explorer` | Compare live targets, payout terms, and project detail pages before you commit time. |
| Submit a proof of concept | `/builder` | Prepare, encrypt, and submit a PoC with project-aware flow control. |
| Register a new project | `/create-project` | Scan a repository, define rules, and register an on-chain bounty program. |
| Track status and payouts | `/dashboard` | Review your own submissions, outcomes, and payout progress. |
| Check public rankings | `/leaderboard` | See who has been paid and how standings move over time. |

## What AntiSoon Does

- **Encrypted PoC handling** - Researchers submit confidential reports that can be replayed and evaluated without turning the workflow into an email inbox.
- **On-chain bounty lifecycle** - `BountyHub` tracks project registration, commit-reveal submission flow, verification outcomes, disputes, and finalization.
- **Workflow-driven verification** - Chainlink CRE workflows coordinate project bootstrap, replay, auto-reveal handling, and jury-style orchestration.
- **Controlled execution surface** - The current docs position the demo around Chainlink Runtime Environment, Tenderly VNet execution, and Sapphire-backed confidential storage.
- **Task-oriented docs** - The `/docs` portal is organized by user workflow and technical reference so readers can jump straight to the page they need.

## Getting Started

The fastest local path is to run the frontend, sync the contract address used by the app, and open the main user routes. The adjudication model splits authority between `verify-poc` for strict verification, `jury-orchestrator` for consensus-driven adjudication, and `BountyHub` as the irreversible protocol truth.

```bash
cd frontend
bun install
bun run contracts:sync
bun run dev
```

Useful follow-up commands:

```bash
cd frontend
bun run test
bun run build
```

If you need the demo-only backend surface that simulates deployed CRE-triggered execution, use the backend-owned package:

```bash
cd backend/cre-simulator
bun test
bun ./src/operator-cli.ts --help
bun ./src/index.ts --help
```

The backend package exposes a thin HTTP surface plus a backend-owned CLI over the same durable state file:

- `GET /health` for service liveness.
- `GET /api/cre-simulator/status` for the current durable stage snapshot.
- `POST /api/cre-simulator/commands/:command` for `register`, `submit`, `reveal`, `verify`, `run`, and `status`.
- `GET /api/cre-simulator/triggers/status` for trigger-worker health, scheduler/listener cursors, and configured trigger mappings.
- `POST /api/cre-simulator/triggers/:triggerName` for backend-owned manual trigger dispatch such as `manual-run`.
- `run` executes `register -> submit -> reveal -> verify` in order, then returns a final `status` snapshot so demo UIs can inspect partial or completed progress without touching the real workflow packages.

The package now also includes separate worker-style entrypoints for the other CRE trigger shapes:

- `bun ./src/cron-worker.ts --help` for CRON/scheduled trigger execution.
- `bun ./src/evm-log-worker.ts --help` for EVM log trigger listening.

That split is intentional: WebSocket listening is kept in the EVM-log worker only, while HTTP and CRON continue to adapt into the same backend execution core.

For a full staging demo on Railway, deploy `backend/cre-simulator` as three processes that share the same working tree and runtime env:

- HTTP service: `HOST=0.0.0.0 PORT=$PORT bun run start:http`
- CRON worker: `bun run start:cron -- --once` for smoke checks, then `bun run start:cron`
- EVM-log worker: `bun run start:evm-log`

Minimum runtime env for a full `run` demo includes:

- `DEMO_OPERATOR_PUBLIC_RPC_URL`
- `DEMO_OPERATOR_ADMIN_RPC_URL`
- `DEMO_PROJECT_OWNER_ADDRESS`
- `DEMO_PROJECT_OWNER_PRIVATE_KEY`
- `DEMO_OPERATOR_ADDRESS`
- `DEMO_OPERATOR_PRIVATE_KEY`
- `DEMO_AUDITOR_ADDRESS`
- `DEMO_AUDITOR_PRIVATE_KEY`
- `CRE_ETH_PRIVATE_KEY`

Additional deployment env depends on your PoC upload and trigger mode:

- `TENDERLY_API_KEY` for generated workflow secrets during Railway-style deploys
- `VITE_OASIS_STORAGE_CONTRACT` for direct Sapphire writes, or `DEMO_OPERATOR_OASIS_UPLOAD_API_URL` / `VITE_OASIS_UPLOAD_API_URL` for upload-API mode
- `DEMO_OPERATOR_WS_RPC_URL` when running the EVM-log worker

The HTTP server now honors `HOST` and `PORT` env defaults, and the workflow-simulate stages can generate a runtime `secrets.yaml` from `TENDERLY_API_KEY` instead of requiring a hand-managed repo-root secret file during deploy.

Deployment templates and a Railway-specific runbook now live under `backend/cre-simulator/railway/`, and the env template lives at `backend/cre-simulator/.env.railway.example`.

Once the app is running, the best first route depends on your job right now:

- Researcher looking for a target: open `/explorer`.
- Researcher ready to submit: open `/builder` or jump there from a project page.
- Project owner: open `/create-project`.
- Returning user: open `/dashboard` or `/leaderboard`.

## Documentation

The public docs live at `/docs`.

> [!IMPORTANT]
> AntiSoon uses an offline writing model for the `/docs` portal. Docs content is authored as committed TypeScript under `frontend/src/reference/content`, validated locally, and prepared for rollout only after human review.

If you update the docs corpus, run the rollout and validation checks together:

```bash
cd frontend && bun run contracts:sync
cd frontend && bun run contracts:check
cd frontend && bun run docs:validate
cd frontend && bun run docs:readme-drift
cd frontend && bun run docs:policy
cd frontend && bun run build
```

## Architecture

AntiSoon is a small multi-surface system rather than a single app server:

- `frontend/` - React app for landing, explorer, builder, project creation, dashboard, leaderboard, and `/docs`.
- `backend/cre-simulator/` - demo-only Bun HTTP service plus backend-owned trigger adapters and worker entrypoints for HTTP, CRON, and EVM-log simulation, all reusing the same operator core and durable `status` inspection while staying separate from the real CRE workflow packages.
- `contracts/src/BountyHub.sol` - core protocol contract for project registration, commit-reveal submissions, verification results, disputes, and payout finalization.
- `contracts/src/OasisPoCStore.sol` - Sapphire-side encrypted payload storage with explicit read grants.
- `workflow/verify-poc/`, `workflow/vnet-init/`, `workflow/auto-reveal-relayer/`, `workflow/jury-orchestrator/` - workflow surfaces for verification and adjudication.
- `project.yaml` - staging workflow registry for the active Sepolia-based environment.

That split matters because the product promise is not just a nicer frontend. The goal is to turn bounty operations into explicit state transitions across contracts, confidential storage, and workflow automation instead of leaving payout timing to opaque human coordination.
