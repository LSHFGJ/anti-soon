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
cp .env.example .env
bun run contracts:sync
bun run dev
```

Useful follow-up commands:

```bash
cd frontend
bun run test
bun run build
```

Frontend-only Vite envs now live in `frontend/.env.example`. Backend and workflow envs stay in the repo-root `.env.example` and `backend/cre-simulator/.env.example` templates.

The frontend now treats `VITE_RPC_URL` and `VITE_OASIS_STORAGE_CONTRACT` as the canonical names. The old `VITE_CRE_SIM_SEPOLIA_RPC_URL` and `VITE_CRE_SIM_OASIS_STORAGE_CONTRACT` names are still accepted as compatibility fallbacks, but new frontend deployments should use the cleaner `VITE_*` names.

For Vercel, set the project root to `frontend/`, configure the frontend `VITE_*` envs there, and keep the SPA rewrite contract from `frontend/vercel.json` so deep links like `/project/:id` resolve to `index.html`.

The repo-root `.env.example` is still useful for backend/workflow services and full local integration runs; it is no longer the frontend env template.

The contracts config uses Foundry `compilation_restrictions` on the
`DeployOasisPoCStore` script entrypoint so that the Sapphire deployment path is
compiled with `evm_version=paris` while the rest of the workspace keeps the
default compiler target.

Use it when deploying `OasisPoCStore` to Sapphire:

```bash
cd contracts
forge script script/DeployOasisPoCStore.s.sol:DeployOasisPoCStore --rpc-url sapphire_testnet --broadcast
```

That keeps the Sapphire storage contract deployment compatible with the network
without forcing unrelated contracts like `BountyHub` onto the same EVM target.

Then verify the deployed contract source on Sapphire testnet with Sourcify:

```bash
cd contracts
CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(string)" "$SIWE_DOMAIN")
forge verify-contract <DEPLOYED_ADDRESS> src/OasisPoCStore.sol:OasisPoCStore \
  --chain 23295 \
  --verifier sourcify \
  --compiler-version v0.8.30+commit.73712a01 \
  --num-of-optimizations 1000 \
  --via-ir \
  --evm-version paris \
  --constructor-args "$CONSTRUCTOR_ARGS" \
  --watch
```

Sourcify is the preferred verification service for Sapphire, and this deploy
path stays compatible with verification because the Forge script broadcasts a
normal deployment transaction instead of an encrypted deployment wrapper.

If you need the backend-owned CRE trigger entrypoint for live workflows, use `backend/cre-simulator`:

```bash
cd backend/cre-simulator
bun test
bun ./src/index.ts --help
```

The backend package exposes a thin HTTP surface plus worker entrypoints over the same durable trigger state:

- `GET /health` for service liveness.
- `GET /api/cre-simulator/status` for live runtime and trigger-config status.
- `POST /api/cre-simulator/adapters/:adapter` for direct adapter execution such as `auto-reveal-relayer` or `cre-workflow-simulate`.
- `GET /api/cre-simulator/triggers/status` for trigger-worker health, scheduler/listener cursors, and configured trigger mappings.
- `POST /api/cre-simulator/triggers/:triggerName` for manual trigger dispatch such as `manual-reveal` or `manual-verify`, using the adapter bindings declared in `backend/cre-simulator/triggers.json`.
- The checked-in `cre-workflow-simulate` binding for `verify-poc` requires `evmTxHash` and `evmEventIndex`, while the EVM-log worker fills those fields automatically from `PoCRevealed` events.

The package now also includes separate worker-style entrypoints for the other CRE trigger shapes:

- `bun ./src/cron-worker.ts --help` for CRON/scheduled trigger execution.
- `bun ./src/evm-log-worker.ts --help` for EVM log trigger listening.

That split is intentional: WebSocket listening is kept in the EVM-log worker only, while HTTP and CRON continue to adapt into the same backend execution core.

For a full staging demo on Railway, deploy the repository root as a Bun monorepo and run `backend/cre-simulator` through the root scripts:

- HTTP service: `HOST=0.0.0.0 PORT=$PORT bun run start:http`
- CRON worker: `bun run start:cron -- --once` for smoke checks, then `bun run start:cron`
- EVM-log worker: `bun run start:evm-log`

The backend deploy contract now follows one canonical env template, defined in `backend/cre-simulator/.env.example`:

- `CRE_SIM_TENDERLY_API_KEY`
- `CRE_SIM_PRIVATE_KEY`
- `CRE_SIM_SEPOLIA_RPC_URL`
- `CRE_SIM_ADMIN_RPC_URL`
- `CRE_SIM_WS_RPC_URL`
- `CRE_SIM_SAPPHIRE_RPC_URL`
- `CRE_SIM_BOUNTY_HUB_ADDRESS`
- `CRE_SIM_OASIS_STORAGE_CONTRACT`

At runtime the backend derives the internal workflow env it needs from that canonical backend env surface; old simulator fallback env names are no longer part of the supported deploy contract.

`CRE_SIM_WS_RPC_URL` is required when running the EVM-log worker.

The HTTP server honors `HOST` and `PORT` env defaults, and the workflow-simulate stages generate the runtime secret material they need from `CRE_SIM_TENDERLY_API_KEY` during execution instead of relying on runtime-config JSON fallbacks.

Deployment templates and a Railway-specific runbook now live under `backend/cre-simulator/railway/`, the canonical env template lives at `backend/cre-simulator/.env.example`, and the root `package.json` gives Railpack a detectable Bun monorepo entrypoint.

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
- `backend/cre-simulator/` - Bun HTTP service plus backend-owned trigger adapters and worker entrypoints for HTTP, CRON, and EVM-log execution, acting as a live adapter host in front of the real CRE workflow packages while keeping deployment/runtime concerns under `backend/`.
- `contracts/src/BountyHub.sol` - core protocol contract for project registration, commit-reveal submissions, verification results, disputes, and payout finalization.
- `contracts/src/OasisPoCStore.sol` - Sapphire-side encrypted payload storage with explicit read grants.
- `workflow/verify-poc/`, `workflow/vnet-init/`, `workflow/auto-reveal-relayer/`, `workflow/jury-orchestrator/` - workflow surfaces for verification and adjudication.
- `project.yaml` - staging workflow registry for the active Sepolia-based environment.

That split matters because the product promise is not just a nicer frontend. The goal is to turn bounty operations into explicit state transitions across contracts, confidential storage, and workflow automation instead of leaving payout timing to opaque human coordination.
