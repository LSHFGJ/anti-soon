import { describe, expect, it } from "bun:test"
import {
  SYNC_REASON_BINDING_MISMATCH,
  SYNC_REASON_ORPHAN_QUARANTINED,
  SYNC_REASON_ORPHAN_RECOVERED,
  SYNC_REASON_RETRY_EXHAUSTED,
  buildVerifyPocLatencyBuckets,
  buildVerifyPocSyncMetricEvent,
  classifyVerifyPocSyncReasonCode,
  reconciliationActionToSyncReasonCode,
} from "../main"
import { RpcReadRetryExhaustedError } from "./rpcReadRetry"

describe("verify-poc sync metrics", () => {
  it("emits deterministic happy-flow metric fields", () => {
    const buckets = buildVerifyPocLatencyBuckets({
      sapphireWriteTimestampSec: 10n,
      commitTimestampSec: 12n,
      revealTimestampSec: 17n,
      reportTimestampSec: 25n,
    })

    expect(JSON.stringify(buckets)).toBe(
      JSON.stringify({
        write_to_commit_ms: 2000,
        commit_to_reveal_ms: 5000,
        reveal_to_report_ms: 8000,
      }),
    )

    expect(reconciliationActionToSyncReasonCode("RESUMED")).toBe(
      SYNC_REASON_ORPHAN_RECOVERED,
    )
    expect(reconciliationActionToSyncReasonCode("QUARANTINED")).toBe(
      SYNC_REASON_ORPHAN_QUARANTINED,
    )

    const event = buildVerifyPocSyncMetricEvent({
      syncId: "0xabc",
      transition: "REPORT_WRITTEN",
      reasonCode: SYNC_REASON_ORPHAN_RECOVERED,
      latencyBuckets: buckets,
    })

    expect(event.reason_code).toBe(SYNC_REASON_ORPHAN_RECOVERED)
    expect(event.write_to_commit_ms).toBe(2000)
    expect(event.commit_to_reveal_ms).toBe(5000)
    expect(event.reveal_to_report_ms).toBe(8000)
    expect("raw_poc_payload" in event).toBe(false)
  })

  it("maps retry exhausted errors to structured reason code", () => {
    const exhausted = new RpcReadRetryExhaustedError({
      network: "sepolia",
      operation: "submission.read",
      attempts: 3,
      endpointAttempts: [
        "https://sepolia-primary.example",
        "https://sepolia-fallback.example",
        "https://sepolia-primary.example",
      ],
      lastFailure: {
        retriable: true,
        reasonCode: "RPC_READ_RETRYABLE_HTTP_STATUS",
        message: "rpc read upstream status 503",
        statusCode: 503,
      },
    })

    expect(classifyVerifyPocSyncReasonCode(exhausted)).toBe(
      SYNC_REASON_RETRY_EXHAUSTED,
    )

    const fallbackBinding = classifyVerifyPocSyncReasonCode(
      new Error("oasis payload validation failed: pointer does not match"),
    )
    expect(fallbackBinding).toBe(SYNC_REASON_BINDING_MISMATCH)

    const event = buildVerifyPocSyncMetricEvent({
      syncId: "0xdef",
      transition: "RPC_READ_FAILED",
      reasonCode: SYNC_REASON_RETRY_EXHAUSTED,
      latencyBuckets: {
        write_to_commit_ms: null,
        commit_to_reveal_ms: null,
        reveal_to_report_ms: null,
      },
    })

    expect(event.reason_code).toBe(SYNC_REASON_RETRY_EXHAUSTED)
  })
})
