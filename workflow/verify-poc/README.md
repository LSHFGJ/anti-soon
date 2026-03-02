# Verify PoC Sync Operations Runbook

## Scope

This runbook is for **sync incidents only** in `workflow/verify-poc`.
It covers detection, reason-code handling, replay-safe restart, and reconciliation.
It does not define payout, dispute, or severity business policy.

## Canonical Sync Signals

- Structured log line prefix: `SYNC_METRIC`
- Metric name: `verify_poc_sync`
- Transition values emitted by workflow include: `SEPOLIA_REVEALED`, `WORKFLOW_VERIFIED`, `REPORT_WRITTEN`, `SYNC_FAILURE`, `ORPHAN_RECONCILED`
- Sync reason codes (from `main.ts`):
  - `RETRYABLE_RPC`
  - `RETRY_EXHAUSTED`
  - `BINDING_MISMATCH`
  - `ORPHAN_RECOVERED`
  - `ORPHAN_QUARANTINED`
- Latency buckets emitted by workflow:
  - `write_to_commit_ms`
  - `commit_to_reveal_ms`
  - `reveal_to_report_ms`

Task references:
- Task 9 replay safety validation: `src/e2eSyncFailureMatrix.test.ts`
- Task 10 sync metrics and reason-code validation: `src/main.syncMetrics.test.ts`

## Detection Thresholds

Set `LOG_FILE` to the workflow log you are inspecting.

```bash
export LOG_FILE=/path/to/verify-poc.log
```

Trigger sync incident handling when any threshold is met:

1. Any `SYNC_FAILURE` with `reason_code:"RETRY_EXHAUSTED"`.
2. Same `sync_id` logs `SYNC_FAILURE` + `reason_code:"RETRYABLE_RPC"` 3+ times without a later `REPORT_WRITTEN`.
3. `SEPOLIA_REVEALED` exists for a `sync_id`, but no `REPORT_WRITTEN` for that `sync_id` within 10 minutes.
4. Any `ORPHAN_RECONCILED` with `reason_code:"ORPHAN_QUARANTINED"`.

Quick checks:

```bash
rg 'SYNC_METRIC' "$LOG_FILE"
rg 'SYNC_METRIC .*"transition":"SYNC_FAILURE".*"reason_code":"RETRY_EXHAUSTED"' "$LOG_FILE"
rg 'SYNC_METRIC .*"transition":"ORPHAN_RECONCILED".*"reason_code":"ORPHAN_QUARANTINED"' "$LOG_FILE"
```

## Reason Code -> Action -> Verification Command

| Reason code | Deterministic operator action | Verification command |
|---|---|---|
| `RETRYABLE_RPC` | Execute one replay-safe restart sequence (below) with the same durable idempotency store path; do not rotate store file. | `bun test src/idempotencyStore.test.ts --test-name-pattern "idempotency survives restart"` |
| `RETRY_EXHAUSTED` | Treat as terminal for current attempt: quarantine current attempt, run reconciliation trigger, then replay from `PoCRevealed` with same store path. | `bun test src/rpcReadRetry.test.ts --test-name-pattern "retry budget exhaustion terminal state"` |
| `BINDING_MISMATCH` | Quarantine sync unit; do not retry until `cipherURI`/Oasis binding mismatch is corrected upstream. | `bun test src/main.syncMetrics.test.ts --test-name-pattern "maps retry exhausted errors to structured reason code"` |
| `ORPHAN_RECOVERED` | Confirm reconciliation resumed sync path and monitor for `REPORT_WRITTEN` on same `sync_id`. | `bun test src/reconciliation.test.ts --test-name-pattern "resolves every reconciled orphan to RESUMED or QUARANTINED with deterministic reason codes"` |
| `ORPHAN_QUARANTINED` | Keep quarantined; open incident; do not replay this sync unit until root cause is fixed. | `bun test src/reconciliation.test.ts --test-name-pattern "identifies all three orphan classes from seeded fixtures"` |

## Replay-Safe Restart Sequence (Deterministic Order)

Run from repo root:

```bash
pwd
git rev-parse --show-toplevel
```

1. Pin durable idempotency path (must be unchanged across restart):

```bash
export VERIFY_POC_IDEMPOTENCY_STORE_PATH="$PWD/workflow/verify-poc/.verify-poc-idempotency-store.json"
```

2. Prove store restart safety before replay:

```bash
cd workflow/verify-poc
bun test src/idempotencyStore.test.ts --test-name-pattern "idempotency survives restart"
bun test src/idempotencyStore.test.ts --test-name-pattern "in-flight idempotency recovery is fail-closed"
```

3. Prove replay dedup remains one-write-only:

```bash
bun test src/e2eSyncFailureMatrix.test.ts --test-name-pattern "reordered duplicate PoCRevealed replay queue still writes once"
```

4. Replay from `PoCRevealed` trigger using same idempotency store path (run-once style):

```bash
cre workflow simulate workflow/verify-poc \
  --target staging-settings \
  --non-interactive \
  --trigger-index 0 \
  --evm-tx-hash <POC_REVEALED_TX_HASH> \
  --evm-event-index <POC_REVEALED_EVENT_INDEX>
```

5. Verify no duplicate writes for same `sync_id`:

```bash
rg 'SYNC_METRIC .*"sync_id":"<SYNC_ID>"' "$LOG_FILE"
rg 'SYNC_METRIC .*"sync_id":"<SYNC_ID>".*"transition":"REPORT_WRITTEN"' "$LOG_FILE"
```

## Reconciliation Trigger Commands

Run from `workflow/verify-poc`:

```bash
bun test src/reconciliation.test.ts
bun test src/main.syncMetrics.test.ts --test-name-pattern "emits deterministic happy-flow metric fields"
```

Deterministic local trigger example for orphan classification output:

```bash
bun --eval 'import { reconcileVerifyPocOrphans } from "./src/reconciliation"; const records = [{ syncId: "sync-sapphire-only", sapphireWritten: true, sepoliaCommitted: false, sepoliaRevealed: false, reportWritten: false }, { syncId: "sync-committed-only", sapphireWritten: true, sepoliaCommitted: true, sepoliaRevealed: false, reportWritten: false }, { syncId: "sync-revealed-no-report", sapphireWritten: true, sepoliaCommitted: true, sepoliaRevealed: true, reportWritten: false }]; console.log(JSON.stringify(reconcileVerifyPocOrphans(records), null, 2));'
```

## Explicit Do-Not-Do List (Duplicate Write Prevention)

- Do not delete, rotate, or replace `VERIFY_POC_IDEMPOTENCY_STORE_PATH` during restart.
- Do not run replay with a fresh/empty idempotency store for an existing `sync_id`.
- Do not run two concurrent replay jobs for the same `sync_id`.
- Do not re-run from `PoCRevealed` before checking if `REPORT_WRITTEN` already exists.
- Do not manually force `completed -> processing` or `quarantined -> processing` state transitions.
- Do not bypass reconciliation outcomes by directly issuing duplicate report-write paths.

## Dry-Run Checklist (No Interpretation Required)

Run each command in order and require zero failures:

```bash
pwd
git rev-parse --show-toplevel
cd workflow/verify-poc
bun test src/idempotencyStore.test.ts --test-name-pattern "idempotency survives restart"
bun test src/idempotencyStore.test.ts --test-name-pattern "in-flight idempotency recovery is fail-closed"
bun test src/e2eSyncFailureMatrix.test.ts --test-name-pattern "reordered duplicate PoCRevealed replay queue still writes once"
bun test src/reconciliation.test.ts
bun test src/main.syncMetrics.test.ts
```

Incident simulation command path for `RETRY_EXHAUSTED`:

```bash
cd workflow/verify-poc
bun test src/rpcReadRetry.test.ts --test-name-pattern "retry budget exhaustion terminal state"
```
