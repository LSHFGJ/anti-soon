const DEFAULT_RPC_READ_RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 250,
  backoffMultiplier: 2,
  maxDelayMs: 2000,
} as const

const RETRIABLE_HTTP_STATUS_CODES = new Set([408, 425, 429])

const RETRIABLE_TIMEOUT_TOKENS = [
  "timeout",
  "timed out",
  "deadline exceeded",
  "etimedout",
] as const

const RETRIABLE_NETWORK_TOKENS = [
  "econnreset",
  "enotfound",
  "ehostunreach",
  "network",
  "socket hang up",
  "connection reset",
  "temporarily unavailable",
] as const

const RETRIABLE_RPC_TOKENS = [
  "rate limit",
  "too many requests",
  "header not found",
  "upstream busy",
  "upstream unavailable",
  "try again",
  "temporarily unavailable",
] as const

const TERMINAL_PAYLOAD_TOKENS = [
  "payload validation failed",
  "invalid project read result",
  "invalid eth_call response",
  "returned empty payload",
  "shape is invalid",
  "does not include poc",
  "pointer does not match",
  "submissionid does not match",
] as const

export const RPC_READ_REASON_RETRYABLE_TIMEOUT =
  "RPC_READ_RETRYABLE_TIMEOUT" as const
export const RPC_READ_REASON_RETRYABLE_NETWORK =
  "RPC_READ_RETRYABLE_NETWORK" as const
export const RPC_READ_REASON_RETRYABLE_HTTP_STATUS =
  "RPC_READ_RETRYABLE_HTTP_STATUS" as const
export const RPC_READ_REASON_RETRYABLE_RPC_TRANSIENT =
  "RPC_READ_RETRYABLE_RPC_TRANSIENT" as const

export const RPC_READ_REASON_TERMINAL_HTTP_STATUS =
  "RPC_READ_TERMINAL_HTTP_STATUS" as const
export const RPC_READ_REASON_TERMINAL_INVALID_PAYLOAD =
  "RPC_READ_TERMINAL_INVALID_PAYLOAD" as const
export const RPC_READ_REASON_TERMINAL_RPC_ERROR =
  "RPC_READ_TERMINAL_RPC_ERROR" as const

export const RPC_READ_REASON_RETRY_EXHAUSTED =
  "RPC_READ_RETRY_EXHAUSTED" as const

export type RpcReadNetwork = "sapphire" | "sepolia"

export type RpcReadRetryPolicy = {
  maxAttempts: number
  baseDelayMs: number
  backoffMultiplier: number
  maxDelayMs: number
}

export type RpcReadFailure = {
  retriable: boolean
  reasonCode: string
  message: string
  statusCode?: number
}

type ErrorLike = {
  name?: string
  message?: string
  statusCode?: number
}

type RetryRunnerArgs<T> = {
  network: RpcReadNetwork
  operation: string
  endpoints: string[]
  retryPolicy?: RpcReadRetryPolicy
  sleep?: (ms: number) => void
  execute: (endpoint: string, attempt: number) => T
  classifyError?: (error: unknown) => RpcReadFailure
}

export class RpcReadTerminalError extends Error {
  readonly reasonCode: string
  readonly network: RpcReadNetwork
  readonly operation: string
  readonly endpoint: string
  readonly attempt: number
  readonly failure: RpcReadFailure

  constructor(args: {
    network: RpcReadNetwork
    operation: string
    endpoint: string
    attempt: number
    failure: RpcReadFailure
  }) {
    super(
      `${args.failure.reasonCode}:${args.network}:${args.operation}:attempt=${args.attempt}:endpoint=${args.endpoint}:${args.failure.message}`
    )
    this.name = "RpcReadTerminalError"
    this.reasonCode = args.failure.reasonCode
    this.network = args.network
    this.operation = args.operation
    this.endpoint = args.endpoint
    this.attempt = args.attempt
    this.failure = args.failure
  }
}

export class RpcReadRetryExhaustedError extends Error {
  readonly reasonCode = RPC_READ_REASON_RETRY_EXHAUSTED
  readonly quarantineState = "QUARANTINED" as const
  readonly network: RpcReadNetwork
  readonly operation: string
  readonly attempts: number
  readonly endpointAttempts: string[]
  readonly lastFailure: RpcReadFailure

  constructor(args: {
    network: RpcReadNetwork
    operation: string
    attempts: number
    endpointAttempts: string[]
    lastFailure: RpcReadFailure
  }) {
    super(
      `${RPC_READ_REASON_RETRY_EXHAUSTED}:${args.network}:${args.operation}:attempts=${args.attempts}:last=${args.lastFailure.reasonCode}`
    )
    this.name = "RpcReadRetryExhaustedError"
    this.network = args.network
    this.operation = args.operation
    this.attempts = args.attempts
    this.endpointAttempts = [...args.endpointAttempts]
    this.lastFailure = args.lastFailure
  }
}

function normalizeRetryPolicy(policy?: RpcReadRetryPolicy): RpcReadRetryPolicy {
  const merged = policy ?? DEFAULT_RPC_READ_RETRY_POLICY
  const maxAttempts = Math.max(1, Math.floor(merged.maxAttempts))
  const baseDelayMs = Math.max(0, Math.floor(merged.baseDelayMs))
  const backoffMultiplier = Math.max(1, Math.floor(merged.backoffMultiplier))
  const maxDelayMs = Math.max(baseDelayMs, Math.floor(merged.maxDelayMs))
  return {
    maxAttempts,
    baseDelayMs,
    backoffMultiplier,
    maxDelayMs,
  }
}

export function createRpcRetrySchedule(policy: RpcReadRetryPolicy): number[] {
  const normalized = normalizeRetryPolicy(policy)
  const schedule: number[] = []

  for (let attempt = 1; attempt <= normalized.maxAttempts; attempt += 1) {
    if (attempt === 1) {
      schedule.push(0)
      continue
    }

    const delay = Math.min(
      normalized.baseDelayMs * normalized.backoffMultiplier ** (attempt - 2),
      normalized.maxDelayMs
    )
    schedule.push(delay)
  }

  return schedule
}

export function buildRpcEndpointPool(
  primary: string,
  fallbackUrls: string[] = []
): string[] {
  const unique = new Set<string>()
  const ordered: string[] = []

  for (const candidate of [primary, ...fallbackUrls]) {
    const endpoint = candidate.trim()
    if (endpoint.length === 0 || unique.has(endpoint)) {
      continue
    }
    unique.add(endpoint)
    ordered.push(endpoint)
  }

  if (ordered.length === 0) {
    throw new Error("RPC endpoint pool is empty")
  }

  return ordered
}

function includesAny(text: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => text.includes(token))
}

function classifyHttpStatus(statusCode: number): RpcReadFailure {
  if (RETRIABLE_HTTP_STATUS_CODES.has(statusCode) || statusCode >= 500) {
    return {
      retriable: true,
      statusCode,
      reasonCode: RPC_READ_REASON_RETRYABLE_HTTP_STATUS,
      message: `rpc read upstream status ${statusCode}`,
    }
  }

  return {
    retriable: false,
    statusCode,
    reasonCode: RPC_READ_REASON_TERMINAL_HTTP_STATUS,
    message: `rpc read terminal status ${statusCode}`,
  }
}

function toErrorLike(error: unknown): ErrorLike {
  if (typeof error === "object" && error !== null) {
    return error as ErrorLike
  }

  if (typeof error === "string") {
    return { message: error }
  }

  return { message: "unknown rpc read error" }
}

export function classifyRpcReadError(error: unknown): RpcReadFailure {
  const details = toErrorLike(error)
  const message = typeof details.message === "string"
    ? details.message
    : "unknown rpc read error"
  const normalizedMessage = message.toLowerCase()

  if (typeof details.statusCode === "number") {
    return classifyHttpStatus(details.statusCode)
  }

  if (details.name === "TimeoutError" || includesAny(normalizedMessage, RETRIABLE_TIMEOUT_TOKENS)) {
    return {
      retriable: true,
      reasonCode: RPC_READ_REASON_RETRYABLE_TIMEOUT,
      message,
    }
  }

  if (includesAny(normalizedMessage, RETRIABLE_NETWORK_TOKENS)) {
    return {
      retriable: true,
      reasonCode: RPC_READ_REASON_RETRYABLE_NETWORK,
      message,
    }
  }

  if (includesAny(normalizedMessage, RETRIABLE_RPC_TOKENS)) {
    return {
      retriable: true,
      reasonCode: RPC_READ_REASON_RETRYABLE_RPC_TRANSIENT,
      message,
    }
  }

  if (includesAny(normalizedMessage, TERMINAL_PAYLOAD_TOKENS)) {
    return {
      retriable: false,
      reasonCode: RPC_READ_REASON_TERMINAL_INVALID_PAYLOAD,
      message,
    }
  }

  return {
    retriable: false,
    reasonCode: RPC_READ_REASON_TERMINAL_RPC_ERROR,
    message,
  }
}

const noopSleep = (_ms: number): void => {}

export function runRpcReadWithRetry<T>(args: RetryRunnerArgs<T>): T {
  const policy = normalizeRetryPolicy(args.retryPolicy)
  const endpoints = args.endpoints
  if (endpoints.length === 0) {
    throw new Error("RPC endpoint pool is empty")
  }

  const sleep = args.sleep ?? noopSleep
  const classify = args.classifyError ?? classifyRpcReadError
  const schedule = createRpcRetrySchedule(policy)
  const endpointAttempts: string[] = []
  let lastFailure: RpcReadFailure | null = null

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const waitMs = schedule[attempt - 1] ?? 0
    if (waitMs > 0) {
      sleep(waitMs)
    }

    const endpoint = endpoints[(attempt - 1) % endpoints.length]
    endpointAttempts.push(endpoint)

    try {
      return args.execute(endpoint, attempt)
    } catch (error) {
      const classified = classify(error)
      lastFailure = classified

      if (!classified.retriable) {
        throw new RpcReadTerminalError({
          network: args.network,
          operation: args.operation,
          endpoint,
          attempt,
          failure: classified,
        })
      }

      if (attempt === policy.maxAttempts) {
        throw new RpcReadRetryExhaustedError({
          network: args.network,
          operation: args.operation,
          attempts: policy.maxAttempts,
          endpointAttempts,
          lastFailure: classified,
        })
      }
    }
  }

  throw new RpcReadRetryExhaustedError({
    network: args.network,
    operation: args.operation,
    attempts: policy.maxAttempts,
    endpointAttempts,
    lastFailure: lastFailure ?? {
      retriable: true,
      reasonCode: RPC_READ_REASON_RETRYABLE_RPC_TRANSIENT,
      message: "rpc read exhausted without classified failure",
    },
  })
}
