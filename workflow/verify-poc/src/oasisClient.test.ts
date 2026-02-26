import { describe, expect, it } from "bun:test"
import {
  classifyOasisHttpError,
  createDeterministicRetrySchedule,
  createOasisClient,
  type OasisRetryPolicy,
} from "./oasisClient"

describe("oasis client", () => {
  it("maps http status codes to deterministic taxonomy", () => {
    const unauthorized = classifyOasisHttpError(401)
    expect(unauthorized.kind).toBe("auth")
    expect(unauthorized.retriable).toBe(false)

    const notFound = classifyOasisHttpError(404)
    expect(notFound.kind).toBe("not_found")
    expect(notFound.retriable).toBe(false)

    const rateLimited = classifyOasisHttpError(429)
    expect(rateLimited.kind).toBe("rate_limited")
    expect(rateLimited.retriable).toBe(true)

    const serverError = classifyOasisHttpError(503)
    expect(serverError.kind).toBe("retriable")
    expect(serverError.retriable).toBe(true)
  })

  it("builds deterministic bounded retry schedule", () => {
    const policy: OasisRetryPolicy = {
      maxAttempts: 4,
      baseDelayMs: 100,
      backoffMultiplier: 2,
      maxDelayMs: 250,
    }

    const scheduleA = createDeterministicRetrySchedule(policy)
    const scheduleB = createDeterministicRetrySchedule(policy)

    expect(JSON.stringify(scheduleA)).toBe(JSON.stringify([0, 100, 200, 250]))
    expect(JSON.stringify(scheduleA)).toBe(JSON.stringify(scheduleB))
  })

  it("retries retriable failures and succeeds for write/read/decrypt-policy wrappers", async () => {
    const responses: Array<Response> = [
      new Response("{\"error\":\"busy\"}", { status: 503 }),
      new Response(
        JSON.stringify({
          ok: true,
          pointer: {
            chain: "oasis-sapphire-testnet",
            contract: "0x1111111111111111111111111111111111111111",
            slotId: "slot-1",
          },
        }),
        { status: 200 }
      ),
      new Response(
        JSON.stringify({
          ok: true,
          ciphertext: "0xaaa",
          iv: "0xbbb",
        }),
        { status: 200 }
      ),
      new Response(
        JSON.stringify({
          ok: true,
          allowed: true,
          mode: "submitter_only",
        }),
        { status: 200 }
      ),
    ]

    const sleepCalls: number[] = []
    let fetchCount = 0

    const client = createOasisClient({
      baseUrl: "https://oasis.test",
      retryPolicy: {
        maxAttempts: 2,
        baseDelayMs: 10,
        backoffMultiplier: 2,
        maxDelayMs: 50,
      },
      sleep: async (ms: number) => {
        sleepCalls.push(ms)
      },
      fetchImpl: async () => {
        const next = responses[fetchCount]
        fetchCount += 1
        if (!next) {
          throw new Error("unexpected extra fetch")
        }
        return next
      },
    })

    const writeResult = await client.write({
      pointer: {
        chain: "oasis-sapphire-testnet",
        contract: "0x1111111111111111111111111111111111111111",
        slotId: "slot-1",
      },
      ciphertext: "0xaaa",
      iv: "0xbbb",
    })

    const readResult = await client.read({
      pointer: {
        chain: "oasis-sapphire-testnet",
        contract: "0x1111111111111111111111111111111111111111",
        slotId: "slot-1",
      },
    })

    const policyResult = await client.readDecryptPolicy({
      pointer: {
        chain: "oasis-sapphire-testnet",
        contract: "0x1111111111111111111111111111111111111111",
        slotId: "slot-1",
      },
      submitter: "0x2222222222222222222222222222222222222222",
      requester: "0x2222222222222222222222222222222222222222",
      currentTimestamp: 1699999999,
      submissionDeadline: 1700000000,
    })

    expect(writeResult.ok).toBe(true)
    expect(readResult.ok).toBe(true)
    expect(policyResult.ok).toBe(true)
    if (!policyResult.ok) {
      throw new Error("expected decrypt policy call to succeed")
    }
    expect(policyResult.data.allowed).toBe(true)
    expect(fetchCount).toBe(4)
    expect(JSON.stringify(sleepCalls)).toBe(JSON.stringify([10]))
  })

  it("denies non-submitter requester before deadline without remote call", async () => {
    let called = false
    const client = createOasisClient({
      baseUrl: "https://oasis.test",
      fetchImpl: async () => {
        called = true
        return new Response("{}", { status: 200 })
      },
    })

    const result = await client.readDecryptPolicy({
      pointer: {
        chain: "oasis-sapphire-testnet",
        contract: "0x1111111111111111111111111111111111111111",
        slotId: "slot-1",
      },
      submitter: "0x1111111111111111111111111111111111111111",
      requester: "0x2222222222222222222222222222222222222222",
      currentTimestamp: 1699999999,
      submissionDeadline: 1700000000,
    })

    expect(result.ok).toBe(false)
    expect(called).toBe(false)
    if (result.ok) {
      throw new Error("expected policy denial")
    }
    expect(result.error.kind).toBe("auth")
  })

  it("forwards deterministic policy inputs at exact deadline", async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    const client = createOasisClient({
      baseUrl: "https://oasis.test",
      fetchImpl: async (_url, init) => {
        if (typeof init?.body === "string") {
          requestBodies.push(JSON.parse(init.body) as Record<string, unknown>)
        }
        return new Response(
          JSON.stringify({
            ok: true,
            allowed: true,
            mode: "public",
          }),
          { status: 200 }
        )
      },
    })

    const result = await client.readDecryptPolicy({
      pointer: {
        chain: "oasis-sapphire-testnet",
        contract: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
        slotId: "slot-1",
      },
      submitter: "0x1111111111111111111111111111111111111111",
      requester: "0x2222222222222222222222222222222222222222",
      currentTimestamp: 1700000000,
      submissionDeadline: 1700000000,
    })

    expect(result.ok).toBe(true)
    expect(requestBodies.length).toBe(1)
    expect(JSON.stringify(requestBodies[0])).toBe(
      JSON.stringify({
        pointer: {
          chain: "oasis-sapphire-testnet",
          contract: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          slotId: "slot-1",
        },
        submitter: "0x1111111111111111111111111111111111111111",
        requester: "0x2222222222222222222222222222222222222222",
        currentTimestamp: 1700000000,
        submissionDeadline: 1700000000,
      })
    )
  })

  it("fails closed after bounded retries during temporary outage", async () => {
    let calls = 0
    const client = createOasisClient({
      baseUrl: "https://oasis.test",
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 1,
        backoffMultiplier: 2,
        maxDelayMs: 2,
      },
      fetchImpl: async () => {
        calls += 1
        return new Response("{\"error\":\"busy\"}", { status: 503 })
      },
    })

    const result = await client.read({
      pointer: {
        chain: "oasis-sapphire-testnet",
        contract: "0x1111111111111111111111111111111111111111",
        slotId: "slot-1",
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error("expected retry exhaustion")
    }
    expect(result.error.kind).toBe("retry_exhausted")
    expect(calls).toBe(3)
  })
})
