import { describe, expect, it } from "bun:test"
import {
  RPC_READ_REASON_RETRY_EXHAUSTED,
  RpcReadRetryExhaustedError,
  runRpcReadWithRetry,
  type RpcReadRetryPolicy,
} from "./rpcReadRetry"

describe("rpc read retry", () => {
  it("retries sapphire transient failures", () => {
    const policy: RpcReadRetryPolicy = {
      maxAttempts: 3,
      baseDelayMs: 10,
      backoffMultiplier: 2,
      maxDelayMs: 50,
    }

    const sleepCalls: number[] = []
    const endpointCalls: string[] = []
    let attempts = 0

    const result = runRpcReadWithRetry({
      network: "sapphire",
      operation: "oasis.read",
      endpoints: [
        "https://sapphire-primary.example",
        "https://sapphire-fallback.example",
      ],
      retryPolicy: policy,
      sleep: (ms: number) => {
        sleepCalls.push(ms)
      },
      execute: (endpoint: string) => {
        endpointCalls.push(endpoint)
        attempts += 1

        if (attempts === 1) {
          const transient = new Error("temporarily unavailable")
          ;(transient as Error & { statusCode?: number }).statusCode = 503
          throw transient
        }

        return { payload: "ok" }
      },
    })

    expect(result.payload).toBe("ok")
    expect(JSON.stringify(endpointCalls)).toBe(
      JSON.stringify([
        "https://sapphire-primary.example",
        "https://sapphire-fallback.example",
      ])
    )
    expect(JSON.stringify(sleepCalls)).toBe(JSON.stringify([10]))
  })

  it("retry budget exhaustion terminal state", () => {
    const policy: RpcReadRetryPolicy = {
      maxAttempts: 3,
      baseDelayMs: 5,
      backoffMultiplier: 2,
      maxDelayMs: 20,
    }

    const sleepCalls: number[] = []
    let attemptCount = 0
    let captured: unknown = null

    try {
      runRpcReadWithRetry({
        network: "sepolia",
        operation: "submission.read",
        endpoints: [
          "https://sepolia-primary.example",
          "https://sepolia-fallback.example",
        ],
        retryPolicy: policy,
        sleep: (ms: number) => {
          sleepCalls.push(ms)
        },
        execute: (endpoint: string) => {
          attemptCount += 1
          const transient = new Error(`upstream busy on ${endpoint}`)
          ;(transient as Error & { statusCode?: number }).statusCode = 503
          throw transient
        },
      })
    } catch (error) {
      captured = error
    }

    expect(captured instanceof RpcReadRetryExhaustedError).toBe(true)
    if (!(captured instanceof RpcReadRetryExhaustedError)) {
      throw new Error("expected retry exhaustion error")
    }

    expect(captured.reasonCode).toBe(RPC_READ_REASON_RETRY_EXHAUSTED)
    expect(captured.quarantineState).toBe("QUARANTINED")
    expect(captured.network).toBe("sepolia")
    expect(captured.operation).toBe("submission.read")
    expect(captured.attempts).toBe(3)
    expect(captured.lastFailure.retriable).toBe(true)
    expect(captured.lastFailure.reasonCode).toBe("RPC_READ_RETRYABLE_HTTP_STATUS")
    expect(attemptCount).toBe(3)
    expect(JSON.stringify(sleepCalls)).toBe(JSON.stringify([5, 10]))
  })
})
